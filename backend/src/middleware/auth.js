const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');

function requireAuth() {
  return async function (req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    let payload;
    try {
      payload = jwt.verify(token, config.jwtAccessSecret);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'User not found or inactive' });
    }
    req.user = { id: user._id.toString(), email: user.email, role: user.role, name: user.name };
    next();
  };
}

function requireRole(role) {
  return function (req, res, next) {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
