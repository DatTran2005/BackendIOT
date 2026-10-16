const mongoose = require('mongoose');

const TelemetrySchema = new mongoose.Schema({
  device_id: { type: String, required: true, index: true },
  temperature: { type: Number, required: true },
  humidity: { type: Number, required: true },
  smoke_level: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now, index: true }
});

const AlertSchema = new mongoose.Schema({
  device_id: { type: String, required: true, index: true },
  // Nhiet do cao
  type: { type: String, required: true },
  message: { type: String, required: true },
  value: { type: Number },
  timestamp: { type: Date, default: Date.now }
});

module.exports = {
  Telemetry: mongoose.model('Telemetry', TelemetrySchema),
  Alert: mongoose.model('Alert', AlertSchema)
};