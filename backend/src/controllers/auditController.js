const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

// before.updatedBy/after.updatedBy are raw ObjectId strings frozen into the
// snapshot at review time (see auditService.snapshotBcsAnalysis) - the
// reviewer performing *this* action is already resolved via performedBy,
// but the record's updatedBy just before/after their action may be a
// different person entirely (e.g. before = whoever originally uploaded the
// photos). Batch-resolve every such id across a whole page of entries in
// one query, rather than one lookup per entry.
async function resolveUpdatedByNames(docs) {
  const ids = new Set();
  for (const doc of docs) {
    if (doc.before?.updatedBy) ids.add(doc.before.updatedBy);
    if (doc.after?.updatedBy) ids.add(doc.after.updatedBy);
  }
  if (ids.size === 0) return new Map();
  const users = await User.find({ _id: { $in: [...ids] } }, 'name email');
  return new Map(users.map((u) => [u._id.toString(), u.name || u.email]));
}

function serializeAuditLog(doc, nameById) {
  const withResolvedUpdatedBy = (snapshot) =>
    snapshot?.updatedBy
      ? { ...snapshot, updatedBy: nameById.get(snapshot.updatedBy) || snapshot.updatedBy }
      : snapshot;
  return {
    id: doc._id.toString(),
    bcsAnalysis: doc.bcsAnalysis.toString(),
    cow: doc.cow.toString(),
    cowsId: doc.cowsId,
    action: doc.action,
    before: withResolvedUpdatedBy(doc.before),
    after: withResolvedUpdatedBy(doc.after),
    performedBy: doc.performedBy
      ? { id: doc.performedBy._id.toString(), name: doc.performedBy.name, email: doc.performedBy.email }
      : null,
    createdAt: doc.createdAt,
  };
}

async function list(req, res, next) {
  try {
    const { cowsId, action, from, to, page = 1, limit = 100 } = req.query;
    const query = {};
    if (action && ['provider_selected', 'overridden'].includes(action)) query.action = action;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }
    // cowsId is denormalized directly onto AuditLog (same pattern as
    // BcsAnalysis), so filtering by it needs no separate Cow lookup.
    if (cowsId) query.cowsId = cowsId;

    const total = await AuditLog.countDocuments(query);
    const docs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .populate('performedBy', 'name email');

    const nameById = await resolveUpdatedByNames(docs);
    res.json({ entries: docs.map((doc) => serializeAuditLog(doc, nameById)), total });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Audit log entry not found.' });
    }
    const doc = await AuditLog.findById(id).populate('performedBy', 'name email');
    if (!doc) return res.status(404).json({ error: 'Audit log entry not found.' });
    const nameById = await resolveUpdatedByNames([doc]);
    res.json({ auditLog: serializeAuditLog(doc, nameById) });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne };
