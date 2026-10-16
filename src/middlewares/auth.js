const jwt = require('jsonwebtoken');
const { pgPool } = require('../config/db');

// Xac thuc DN
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Không tìm thấy token xác thực' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
    req.user = user;
    next();
  });
};

// Kiem tra vai tro
const authorizeRoles = (...allowedRoles) => {
  return async (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      try {
        // Log truy cap trai phep
        await pgPool.query(
          'INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)',
          [req.user.id, 'UNAUTHORIZED_ATTEMPT', JSON.stringify({ path: req.originalUrl, role: req.user.role })]
        );
      } catch (logErr) {
        console.error('Lỗi ghi audit log:', logErr.message);
      }
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này!' });
    }
    next();
  };
};

module.exports = { verifyToken, authorizeRoles };