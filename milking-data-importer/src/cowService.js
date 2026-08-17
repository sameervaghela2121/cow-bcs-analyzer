const Cow = require('./models/Cow');

// Duplicate of backend/src/services/cowService.js kept in sync by hand -
// see models/Cow.js for why.
async function findOrCreateCow(facilityId, cowsId) {
  let cow = await Cow.findOne({ facility: facilityId, cowsId });
  if (!cow) {
    cow = await Cow.create({ facility: facilityId, cowsId });
  }
  return cow;
}

module.exports = { findOrCreateCow };
