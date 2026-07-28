const Cow = require('./models/Cow');

// Mirrors backend/src/services/cowService.js's find-or-create pattern,
// scoped to the facility the uploading user belongs to.
async function findOrCreateCow(facilityId, cowsId) {
  let cow = await Cow.findOne({ facility: facilityId, cowsId });
  if (!cow) {
    cow = await Cow.create({ facility: facilityId, cowsId });
  }
  return cow;
}

module.exports = { findOrCreateCow };
