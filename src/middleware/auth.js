const jwt = require('jsonwebtoken');
require('../utils/env');

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

function mentorOnly(req, res, next) {
  if (!req.user || req.user.role !== 'mentor') {
    return res.status(403).json({ error: 'Mentor only' });
  }
  next();
}

function mentorOrAdmin(req, res, next) {
  if (!req.user || (req.user.role !== 'mentor' && req.user.role !== 'admin')) {
    return res.status(403).json({ error: 'Mentor or admin only' });
  }
  next();
}

module.exports = { authRequired, adminOnly, mentorOnly, mentorOrAdmin };
