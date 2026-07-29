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
    // payload only ever carries session claims once a membership has been
    // selected (see authService.generateSessionToken) - a bare login token
    // (just {sub}) leaves all of these null, which is exactly what lets
    // requireSession() below tell the two token shapes apart.
    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      status: user.status,
      isSuperAdmin: payload.isSuperAdmin || false,
      membershipId: payload.membershipId || null,
      organizationId: payload.organizationId || null,
      facilityId: payload.facilityId || null,
      roleId: payload.roleId || null,
      roleName: payload.roleName || null,
      permissions: payload.permissions || [],
    };
    next();
  };
}

// Gates every tenant-scoped route: requireAuth() alone only proves *who*
// is calling, not *which* organization/facility they're acting as right
// now - a bare login token (before a membership is selected) has none of
// that, so routes that need to scope a query by organization/facility must
// use this in addition to requireAuth(). super_admin has no membership at
// all (by design) but is always allowed through here - resolveScope() is
// what actually supplies an organizationId/facilityId for them, per-request.
function requireSession() {
  return function (req, res, next) {
    if (!req.user || (!req.user.membershipId && !req.user.isSuperAdmin)) {
      return res.status(401).json({ error: 'Select a workspace before continuing.' });
    }
    next();
  };
}

// Accepts one or more role names (e.g. requireRole('Org-Admin', 'Facility
// Admin')) since a single fixed role rarely gates a route on its own now
// that roles are membership-scoped. Always pair with requireSession() -
// req.user.roleName is only populated once a membership is selected.
// super_admin ("can handle everything") passes every role gate without
// needing to be named explicitly at each call site.
function requireRole(...roles) {
  return function (req, res, next) {
    if (req.user?.isSuperAdmin) return next();
    if (!req.user || !roles.includes(req.user.roleName)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

function requireSuperAdmin() {
  return function (req, res, next) {
    if (!req.user?.isSuperAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { requireAuth, requireSession, requireRole, requireSuperAdmin };
