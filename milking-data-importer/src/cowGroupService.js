const CowGroup = require('./models/CowGroup');

// Duplicate of backend/src/services/cowGroupService.js kept in sync by hand
// - see models/CowGroup.js for why.
async function findOrCreateCowGroup(facilityId, name) {
  let group = await CowGroup.findOne({ facility: facilityId, name });
  if (!group) {
    group = await CowGroup.create({ facility: facilityId, name });
  }
  return group;
}

module.exports = { findOrCreateCowGroup };
