const { findOrCreateCow } = require('./cowService');
const BcsAnalysis = require('../models/BcsAnalysis');

async function createAnalysis({ cowsId, cowsImages, userId, organizationId, facilityId }) {
  const cow = await findOrCreateCow(facilityId, cowsId);
  const analysis = await BcsAnalysis.create({
    cow: cow._id,
    organization: organizationId,
    facility: facilityId,
    cowsImages,
    bcsScore: {},
    status: 'not_started',
    createdBy: userId,
    updatedBy: userId,
  });
  // cow is already in hand from findOrCreateCow above - attach it directly
  // rather than a redundant populate() query right after creating.
  analysis.cow = cow;
  return analysis;
}

module.exports = { createAnalysis };
