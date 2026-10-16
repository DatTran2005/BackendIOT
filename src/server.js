require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const { initMQTT } = require('./services/mqttService');

const authRoutes = require('./routes/authRoutes');
const deviceRoutes = require('./routes/deviceRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// DB
connectDB();
initMQTT();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Warehouse Backend Server đang chạy tại http://localhost:${PORT}`);
});