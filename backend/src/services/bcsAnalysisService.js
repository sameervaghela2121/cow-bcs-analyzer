const { findOrCreateCow } = require('./cowService');
const BcsAnalysis = require('../models/BcsAnalysis');

async function createAnalysis({ cowsId, cowsImages, userId }) {
  const cow = await findOrCreateCow(cowsId);
  return BcsAnalysis.create({
    cow: cow._id,
    cowsId,
    cowsImages,
    bcsScore: {},
    status: 'not_started',
    createdBy: userId,
    updatedBy: userId,
  });
}

module.exports = { createAnalysis };
