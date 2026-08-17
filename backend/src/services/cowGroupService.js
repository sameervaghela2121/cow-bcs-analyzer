const CowGroup = require('../models/CowGroup');

async function findOrCreateCowGroup(facilityId, name) {
  let group = await CowGroup.findOne({ facility: facilityId, name });
  if (!group) {
    group = await CowGroup.create({ facility: facilityId, name });
  }
  return group;
}

module.exports = { findOrCreateCowGroup };
