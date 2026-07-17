const User = require('../models/User');
const { hashToken, hashPassword, comparePassword, generateAccessToken } = require('../services/authService');

function serializeUser(user) {
  return { id: user._id.toString(), email: user.email, name: user.name, role: user.role, status: user.status };
}

async function acceptInvite(req, res, next) {
  try {
    const { email, token, password } = req.body;
    if (!email || !token || !password) {
      return res.status(400).json({ error: 'email, token and password are required.' });
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user || user.status !== 'pending' || !user.inviteTokenHash) {
      return res.status(400).json({ error: 'Invalid or already-used invite.' });
    }
    if (user.inviteTokenExpiresAt < new Date()) {
      return res.status(400).json({ error: 'This invite link has expired.' });
    }
    if (hashToken(token) !== user.inviteTokenHash) {
      return res.status(400).json({ error: 'Invalid invite token.' });
    }

    user.passwordHash = await hashPassword(password);
    user.status = 'active';
    user.inviteTokenHash = null;
    user.inviteTokenExpiresAt = null;
    await user.save();

    res.json({
      accessToken: generateAccessToken(user),
      user: serializeUser(user),
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user || user.status !== 'active' || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    res.json({
      accessToken: generateAccessToken(user),
      user: serializeUser(user),
    });
  } catch (err) {
    next(err);
  }
}

// No server-side session to revoke - the access token never expires and
// there's no refresh token to invalidate. Logging out is just the client
// discarding its stored token; this endpoint exists so that flow has a
// clear place to hang off of.
async function logout(_req, res) {
  res.json({ ok: true });
}

async function me(req, res) {
  res.json({ id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role });
}

module.exports = { acceptInvite, login, logout, me, serializeUser };
