const Cow = require('../models/Cow');
const Media = require('../models/Media');
const Reading = require('../models/Reading');
const { saveFile } = require('./storageService');

async function findOrCreateCow(cowId) {
  let cow = await Cow.findOne({ cowId });
  if (!cow) {
    cow = await Cow.create({ cowId, breed: 'Unknown', lactation: 'Unknown', pen: 'Unassigned' });
  }
  return cow;
}

async function createProcessingReading({ cowId, buffer, mimeType, originalName, createdBy }) {
  const cow = await findOrCreateCow(cowId);
  const { storageKey, size } = await saveFile(buffer, originalName);
  const media = await Media.create({ storageKey, mimeType, size, originalName });
  const reading = await Reading.create({
    cow: cow._id,
    media: media._id,
    status: 'processing',
    capturedAt: new Date(),
    createdBy,
  });
  return reading;
}

module.exports = { findOrCreateCow, createProcessingReading };
