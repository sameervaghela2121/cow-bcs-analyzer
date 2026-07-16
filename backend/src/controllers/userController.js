const { inviteUser } = require('../services/userService');

function serializeUser(user) {
  return { id: user._id.toString(), email: user.email, name: user.name, role: user.role, status: user.status };
}

async function invite(req, res, next) {
  try {
    const { email, name, role } = req.body;
    if (!email || !name || !['admin', 'staff'].includes(role)) {
      return res.status(400).json({ error: 'email, name and a valid role are required.' });
    }
    const user = await inviteUser({ email, name, role, invitedBy: req.user.id });
    res.status(201).json({ user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
}

module.exports = { invite, serializeUser };
