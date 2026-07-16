const Cow = require('../models/Cow');

function serializeCow(cow) {
  return {
    cowId: cow.cowId, breed: cow.breed, lactation: cow.lactation, pen: cow.pen,
    latestScore: cow.latestScore, latestBand: cow.latestBand, latestConfidence: cow.latestConfidence,
    lastScoredAt: cow.lastScoredAt, flagged: cow.flagged, sharpDrop: cow.sharpDrop, dropAmount: cow.dropAmount,
  };
}

async function create(req, res, next) {
  try {
    const { cowId, breed, lactation, pen } = req.body;
    if (!cowId) return res.status(400).json({ error: 'cowId is required.' });
    const existing = await Cow.findOne({ cowId });
    if (existing) return res.status(409).json({ error: 'A cow with this ID already exists.' });
    const cow = await Cow.create({ cowId, breed, lactation, pen });
    res.status(201).json({ cow: serializeCow(cow) });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const cow = await Cow.findOne({ cowId: req.params.cowId });
    if (!cow) return res.status(404).json({ error: 'Cow not found.' });
    res.json({ cow: serializeCow(cow) });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { breed, lactation, pen } = req.body;
    const update = {};
    if (breed !== undefined) update.breed = breed;
    if (lactation !== undefined) update.lactation = lactation;
    if (pen !== undefined) update.pen = pen;
    const cow = await Cow.findOneAndUpdate({ cowId: req.params.cowId }, update, { new: true });
    if (!cow) return res.status(404).json({ error: 'Cow not found.' });
    res.json({ cow: serializeCow(cow) });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, getOne, update, serializeCow };
