const { inviteUser, listUsers, changeRole, removeUser } = require('../services/userService');

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

async function list(req, res, next) {
  try {
    const { status, role } = req.query;
    const users = await listUsers({ status, role });
    res.json({ users: users.map(serializeUser) });
  } catch (err) {
    next(err);
  }
}

async function updateRole(req, res, next) {
  try {
    if (!['admin', 'staff'].includes(req.body.role)) {
      return res.status(400).json({ error: 'role must be admin or staff.' });
    }
    const user = await changeRole(req.params.id, req.body.role);
    res.json({ user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await removeUser(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { invite, list, updateRole, remove, serializeUser };
