const express = require('express');
const { pgPool } = require('../config/db');
const { Telemetry, Alert } = require('../models/Telemetry');
const { verifyToken, authorizeRoles } = require('../middlewares/auth');
const { publishCommand } = require('../services/mqttService');

const router = express.Router();

// Ds thiet bi
router.get('/', verifyToken, async (req, res) => {
  const result = await pgPool.query('SELECT * FROM devices ORDER BY device_id ASC');
  res.json(result.rows);
});

// Dk thiet bi moi (Admin)
router.post('/', verifyToken, authorizeRoles('ADMIN'), async (req, res) => {
  const { device_id, name, zone, temp_threshold } = req.body;
  try {
    const result = await pgPool.query(
      `INSERT INTO devices (device_id, name, zone, status, temp_threshold)
       VALUES ($1, $2, $3, 'REGISTERED', $4) RETURNING *`,
      [device_id, name, zone, temp_threshold || 35.0]
    );
    await pgPool.query(
      'INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'REGISTER_DEVICE', JSON.stringify({ device_id })]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Chuyen doi trang thai vong doi
router.patch('/:deviceId/lifecycle', verifyToken, authorizeRoles('ADMIN'), async (req, res) => {
  const { deviceId } = req.params;
  const { status, temp_threshold } = req.body;
  try {
    const result = await pgPool.query(
      `UPDATE devices
       SET status = COALESCE($1, status),
           temp_threshold = COALESCE($2, temp_threshold)
       WHERE device_id = $3 RETURNING *`,
      [status, temp_threshold, deviceId]
    );
    await pgPool.query(
      'INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'UPDATE_DEVICE_LIFECYCLE', JSON.stringify({ deviceId, status, temp_threshold })]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Lay data cho fe ve bieu do
router.get('/:deviceId/telemetry', verifyToken, async (req, res) => {
  const { deviceId } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  const data = await Telemetry.find({ device_id: deviceId })
    .sort({ timestamp: -1 })
    .limit(limit);
  res.json(data);
});

// Lay Ls canh bao
router.get('/:deviceId/alerts', verifyToken, async (req, res) => {
  const { deviceId } = req.params;
  const alerts = await Alert.find({ device_id: deviceId }).sort({ timestamp: -1 }).limit(50);
  res.json(alerts);
});

// Setup trang thai
router.post('/:deviceId/control', verifyToken, authorizeRoles('ADMIN', 'OPERATOR'), async (req, res) => {
  const { deviceId } = req.params;
  const { command, params } = req.body;

  try {
    // Luu lenh vao DB voi trang thia PENDING
    const cmdRes = await pgPool.query(
      `INSERT INTO commands (device_id, user_id, command, payload, status)
       VALUES ($1, $2, $3, $4, 'PENDING') RETURNING *`,
      [deviceId, req.user.id, command, JSON.stringify(params || {})]
    );
    const savedCommand = cmdRes.rows[0];

    // Publish xuong MQTT cho ESP32
    publishCommand(deviceId, {
      command_id: savedCommand.id,
      command,
      params
    });

    // Log
    await pgPool.query(
      'INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'SEND_COMMAND', JSON.stringify({ deviceId, command, params })]
    );

    res.json({ message: 'Đã gửi lệnh điều khiển', command: savedCommand });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;