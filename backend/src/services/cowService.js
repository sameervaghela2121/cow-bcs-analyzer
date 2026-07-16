const Cow = require('../models/Cow');

async function findOrCreateCow(cowsId) {
  let cow = await Cow.findOne({ cowsId });
  if (!cow) {
    cow = await Cow.create({ cowsId });
  }
  return cow;
}

module.exports = { findOrCreateCow };
