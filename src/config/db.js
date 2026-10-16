const { Pool } = require('pg');
const mongoose = require('mongoose');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const pgPool = new Pool({
  connectionString: process.env.PG_URI,
  ssl: process.env.PG_URI.includes('localhost') ? false : { rejectUnauthorized: false }
});

const connectDB = async () => {
  try {
    // Test MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB: Ok');

    // Test PostgreSQL
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'VIEWER' -- ADMIN, OPERATOR, VIEWER
      );

      CREATE TABLE IF NOT EXISTS devices (
        device_id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        zone VARCHAR(50),
        status VARCHAR(20) DEFAULT 'REGISTERED', -- REGISTERED, ACTIVE, OFFLINE, FAULT, MAINTENANCE, DECOMMISSIONED
        temp_threshold FLOAT DEFAULT 35.0,
        last_seen TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS commands (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(50) REFERENCES devices(device_id),
        user_id INT REFERENCES users(id),
        command VARCHAR(50) NOT NULL,
        payload JSONB,
        status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, ACKED, FAILED
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INT,
        action VARCHAR(100) NOT NULL,
        details JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('PostgreSQL: OK');
  } catch (err) {
    console.error('Loi', err.message);
  }
};

module.exports = { pgPool, connectDB };