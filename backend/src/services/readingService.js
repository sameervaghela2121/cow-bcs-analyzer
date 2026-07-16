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

async function createProcessingReading({ cowId, files, createdBy }) {
  const cow = await findOrCreateCow(cowId);
  const mediaIds = [];
  for (const file of files) {
    const { storageKey, size } = await saveFile(file.buffer, file.originalName);
    const media = await Media.create({ storageKey, mimeType: file.mimeType, size, originalName: file.originalName });
    mediaIds.push(media._id);
  }
  const reading = await Reading.create({
    cow: cow._id,
    media: mediaIds,
    status: 'processing',
    capturedAt: new Date(),
    createdBy,
  });
  return reading;
}

module.exports = { findOrCreateCow, createProcessingReading };
