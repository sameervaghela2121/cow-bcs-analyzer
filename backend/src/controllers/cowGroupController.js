const CowGroup = require('../models/CowGroup');

async function list(req, res, next) {
  try {
    const cowGroups = await CowGroup.find({ facility: req.scope.facilityId }).sort({ name: 1 });
    res.json({ cowGroups: cowGroups.map((g) => ({ id: g._id.toString(), name: g.name })) });
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
