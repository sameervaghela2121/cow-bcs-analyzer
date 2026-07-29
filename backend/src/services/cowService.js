const Cow = require('../models/Cow');

async function findOrCreateCow(facilityId, cowsId) {
  let cow = await Cow.findOne({ facility: facilityId, cowsId });
  if (!cow) {
    cow = await Cow.create({ facility: facilityId, cowsId });
  }
  return cow;
}

module.exports = { findOrCreateCow };
