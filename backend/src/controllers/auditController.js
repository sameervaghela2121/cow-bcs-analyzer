const AuditLog = require('../models/AuditLog');
const Cow = require('../models/Cow');

async function list(req, res, next) {
  try {
    const { cowsId, action, from, to, page = 1, limit = 100 } = req.query;
    const query = {};
    if (action && ['approved', 'overridden'].includes(action)) query.action = action;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }
    if (cowsId) {
      const cow = await Cow.findOne({ cowsId });
      query.cow = cow ? cow._id : null;
    }

    const total = await AuditLog.countDocuments(query);
    const docs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const cowIds = [...new Set(docs.map((d) => d.cow.toString()))];
    const cows = await Cow.find({ _id: { $in: cowIds } });
    const cowById = new Map(cows.map((c) => [c._id.toString(), c.cowsId]));

    const entries = docs.map((d) => ({
      cowsId: cowById.get(d.cow.toString()),
      action: d.action,
      oldScore: d.oldScore,
      newScore: d.newScore,
      createdAt: d.createdAt,
    }));

    res.json({ entries, total });
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
