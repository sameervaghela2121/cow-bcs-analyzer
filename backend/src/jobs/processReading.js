const Reading = require('../models/Reading');
const Cow = require('../models/Cow');
const Media = require('../models/Media');
const { readFile } = require('../services/storageService');
const { assessImage } = require('../services/aiBackendClient');
const { reconcileProviders, bandFor, isSharpDrop } = require('../services/scoringService');

async function findPreviousScoredReading(cowId, currentReadingId) {
  return Reading.findOne({
    cow: cowId, status: 'scored', _id: { $ne: currentReadingId },
  }).sort({ capturedAt: -1 });
}

async function processReading(readingId) {
  const reading = await Reading.findById(readingId);
  if (!reading) return;

  try {
    const media = await Media.findById(reading.media);
    const buffer = await readFile(media.storageKey);
    const aiResponse = await assessImage({ buffer, mimeType: media.mimeType, filename: media.originalName || 'image.jpg' });
    const result = reconcileProviders(aiResponse);

    if (result.status === 'failed') {
      reading.status = 'failed';
      reading.errorMessage = result.errorMessage;
      reading.providerResults = result.providerResults;
      await reading.save();
      return;
    }

    const previous = await findPreviousScoredReading(reading.cow, reading._id);
    const sharpDrop = isSharpDrop(previous ? previous.score : null, result.score);
    const band = bandFor(result.score);
    const flagged = result.flagged || sharpDrop;
    let flagReason = result.flagReason;
    if (sharpDrop) {
      const dropAmount = (previous.score - result.score).toFixed(2);
      flagReason = flagReason
        ? `${flagReason} Dropped ${dropAmount} pts since last reading.`
        : `Dropped ${dropAmount} pts since last reading.`;
    }

    reading.status = 'scored';
    reading.score = result.score;
    reading.confidence = result.confidence;
    reading.band = band;
    reading.spread = result.spread;
    reading.providerResults = result.providerResults;
    reading.flagged = flagged;
    reading.flagReason = flagReason;
    reading.reviewStatus = flagged ? 'pending' : 'not_required';
    await reading.save();

    await Cow.findByIdAndUpdate(reading.cow, {
      latestScore: result.score,
      latestBand: band,
      latestConfidence: result.confidence,
      lastScoredAt: reading.capturedAt,
      flagged,
      sharpDrop,
      dropAmount: sharpDrop ? Number((previous.score - result.score).toFixed(2)) : null,
    });
  } catch (err) {
    reading.status = 'failed';
    reading.errorMessage = err.message;
    await reading.save();
  }
}

module.exports = { processReading };
