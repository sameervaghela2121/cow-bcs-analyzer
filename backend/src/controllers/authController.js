const User = require('../models/User');
const {
  hashToken, hashPassword, comparePassword, generateAccessToken, generateRefreshToken, verifyRefreshToken,
} = require('../services/authService');

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
      refreshToken: generateRefreshToken(user),
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
      refreshToken: generateRefreshToken(user),
      user: serializeUser(user),
    });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required.' });
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }
    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'active' || user.refreshTokenVersion !== payload.ver) {
      return res.status(401).json({ error: 'Refresh token has been revoked.' });
    }
    res.json({ accessToken: generateAccessToken(user) });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    await User.findByIdAndUpdate(req.user.id, { $inc: { refreshTokenVersion: 1 } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { acceptInvite, login, refresh, logout, serializeUser };
