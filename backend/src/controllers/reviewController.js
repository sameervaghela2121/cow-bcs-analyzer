const Reading = require('../models/Reading');
const Cow = require('../models/Cow');
const AuditLog = require('../models/AuditLog');
const { roundQuarter, bandFor } = require('../services/scoringService');
const { serializeReading } = require('./readingController');

async function queue(req, res, next) {
  try {
    const docs = await Reading.find({ reviewStatus: 'pending' }).sort({ capturedAt: -1 });
    const cowIds = [...new Set(docs.map((d) => d.cow.toString()))];
    const cows = await Cow.find({ _id: { $in: cowIds } });
    const cowById = new Map(cows.map((c) => [c._id.toString(), c]));
    const items = docs.map((d) => serializeReading(d, cowById.get(d.cow.toString())));
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

async function isMostRecentScored(cowId, readingId) {
  const mostRecent = await Reading.findOne({ cow: cowId, status: 'scored' }).sort({ capturedAt: -1 });
  return mostRecent && mostRecent._id.toString() === readingId.toString();
}

async function approve(req, res, next) {
  try {
    const reading = await Reading.findById(req.params.readingId);
    if (!reading) return res.status(404).json({ error: 'Reading not found.' });

    reading.reviewStatus = 'approved';
    reading.flagged = false;
    await reading.save();

    await AuditLog.create({
      cow: reading.cow, reading: reading._id, user: req.user.id,
      action: 'approved', oldScore: reading.score, newScore: reading.score,
    });

    if (await isMostRecentScored(reading.cow, reading._id)) {
      await Cow.findByIdAndUpdate(reading.cow, { flagged: false });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function override(req, res, next) {
  try {
    const { score } = req.body;
    if (typeof score !== 'number' || score < 1 || score > 5 || roundQuarter(score) !== score) {
      return res.status(400).json({ error: 'score must be a multiple of 0.25 between 1 and 5.' });
    }
    const reading = await Reading.findById(req.params.readingId);
    if (!reading) return res.status(404).json({ error: 'Reading not found.' });

    const oldScore = reading.score;
    reading.score = score;
    reading.band = bandFor(score);
    reading.reviewStatus = 'overridden';
    reading.flagged = false;
    await reading.save();

    await AuditLog.create({
      cow: reading.cow, reading: reading._id, user: req.user.id,
      action: 'overridden', oldScore, newScore: score,
    });

    if (await isMostRecentScored(reading.cow, reading._id)) {
      await Cow.findByIdAndUpdate(reading.cow, {
        latestScore: score, latestBand: reading.band, flagged: false,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { queue, approve, override };
