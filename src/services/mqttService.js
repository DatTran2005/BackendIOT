const mqtt = require('mqtt');
const { pgPool } = require('../config/db');
const { Telemetry, Alert } = require('../models/Telemetry');

let mqttClient;

const initMQTT = () => {
  mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL);

  mqttClient.on('connect', () => {
    console.log('Ket noi toi MQTT Broker');
    mqttClient.subscribe('warehouse/devices/+/telemetry');
    mqttClient.subscribe('warehouse/devices/+/heartbeat');
    mqttClient.subscribe('warehouse/devices/+/ack');
  });

  mqttClient.on('message', async (topic, message) => {
    try {
      const topicParts = topic.split('/');
      const deviceId = topicParts[2];
      const messageType = topicParts[3];
      const payload = JSON.parse(message.toString());

      // Kiem tra thiet bi co ton tai ko? (Kich ban so 10)
      const deviceRes = await pgPool.query('SELECT * FROM devices WHERE device_id = $1', [deviceId]);
      if (deviceRes.rowCount === 0) {
        console.warn(`Từ chối dữ liệu từ thiết bị lạ: ${deviceId}`);
        return;
      }

      const device = deviceRes.rows[0];
      if (device.status === 'DECOMMISSIONED' || device.status === 'REGISTERED') {
        console.warn(`Thiết bị ${deviceId} đang ở trạng thái ${device.status}, từ chối bản tin!`);
        return;
      }

      // Cap nhat trang thai
      await pgPool.query(
        `UPDATE devices SET status = 'ACTIVE', last_seen = NOW() WHERE device_id = $1 AND status != 'MAINTENANCE'`,
        [deviceId]
      );

      // Xu ly Telemetry
      if (messageType === 'telemetry') {
        const { temperature, humidity, smoke_level, timestamp } = payload;

        await Telemetry.create({
          device_id: deviceId,
          temperature,
          humidity,
          smoke_level: smoke_level || 0,
          timestamp: timestamp ? new Date(timestamp) : new Date()
        });

        // Check nguong canh bao (Kich ban so 8)
        if (temperature > device.temp_threshold) {
          await Alert.create({
            device_id: deviceId,
            type: 'OVER_TEMPERATURE',
            message: `Nhiệt độ vượt ngưỡng (${temperature}°C > ${device.temp_threshold}°C)`,
            value: temperature
          });
          console.log(`[Alert] Thiết bị ${deviceId} quá nhiệt: ${temperature}°C`);
        }
      }

      // Xu ly phan hoi tu esp32 (Kich ban so 5)
      if (messageType === 'ack') {
        const { command_id, status } = payload;
        await pgPool.query('UPDATE commands SET status = $1 WHERE id = $2', [status || 'ACKED', command_id]);
        console.log(`Thiết bị ${deviceId} đã phản hồi lệnh #${command_id}: ${status}`);
      }

    } catch (err) {
      console.error('Lỗi xử lý bản tin MQTT:', err.message);
    }
  });

  // Check offline moi 15s (Kich ban so 7)
  setInterval(async () => {
    try {
      const res = await pgPool.query(`
        UPDATE devices
        SET status = 'OFFLINE'
        WHERE status = 'ACTIVE'
          AND last_seen < NOW() - INTERVAL '30 seconds'
        RETURNING device_id;
      `);
      if (res.rowCount > 0) {
        console.log(`Phát hiện thiết bị mất kết nối (Offline):`, res.rows.map(r => r.device_id));
      }
    } catch (err) {
      console.error('Lỗi kiểm tra offline:', err.message);
    }
  }, 15000);
};

// Gui lenh toi esp32
const publishCommand = (deviceId, payload) => {
  if (mqttClient && mqttClient.connected) {
    mqttClient.publish(`warehouse/devices/${deviceId}/command`, JSON.stringify(payload));
    return true;
  }
  return false;
};

module.exports = { initMQTT, publishCommand };