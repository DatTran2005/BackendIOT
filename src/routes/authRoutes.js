const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pgPool } = require('../config/db');

const router = express.Router();

// Api dang nhap
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pgPool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rowCount === 0) return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu' });

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    await pgPool.query(
      'INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [user.id, 'USER_LOGIN', JSON.stringify({ username: user.username, role: user.role })]
    );

    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3 Quyen
router.post('/seed-users', async (req, res) => {
  try {
    const hash = await bcrypt.hash('123456', 10);
    await pgPool.query(`
      INSERT INTO users (username, password_hash, role) VALUES
      ('admin', $1, 'ADMIN'),
      ('operator', $1, 'OPERATOR'),
      ('viewer', $1, 'VIEWER')
      ON CONFLICT (username) DO NOTHING;
    `, [hash]);
    res.json({ message: 'Đã tạo 3 tài khoản mẫu (admin, operator, viewer) - Mật khẩu chung: 123456' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;