const Cow = require('../models/Cow');
const Reading = require('../models/Reading');
const { serializeReading } = require('./readingController');

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

async function list(req, res, next) {
  try {
    const { search, filter, sort, page = 1, limit = 100 } = req.query;
    const query = {};
    if (search && search.trim()) query.cowId = { $regex: search.trim(), $options: 'i' };
    if (filter === 'flagged') query.flagged = true;
    else if (['thin', 'ideal', 'heavy'].includes(filter)) query.latestBand = filter;

    let sortSpec = { lastScoredAt: -1 };
    if (sort === 'bcs-asc') sortSpec = { latestScore: 1 };
    else if (sort === 'bcs-desc') sortSpec = { latestScore: -1 };
    else if (sort === 'flagged') sortSpec = { flagged: -1, lastScoredAt: -1 };

    const total = await Cow.countDocuments(query);
    const cows = await Cow.find(query)
      .sort(sortSpec)
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    res.json({ cows: cows.map(serializeCow), total });
  } catch (err) {
    next(err);
  }
}

async function readings(req, res, next) {
  try {
    const cow = await Cow.findOne({ cowId: req.params.cowId });
    if (!cow) return res.status(404).json({ error: 'Cow not found.' });
    const { page = 1, limit = 100 } = req.query;
    const total = await Reading.countDocuments({ cow: cow._id });
    const docs = await Reading.find({ cow: cow._id })
      .sort({ capturedAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    res.json({ readings: docs.map((r) => serializeReading(r, cow)), total });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, getOne, update, list, readings, serializeCow };
