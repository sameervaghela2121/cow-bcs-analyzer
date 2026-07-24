const Cow = require('./models/Cow');

// Mirrors backend/src/services/cowService.js's find-or-create pattern.
async function findOrCreateCow(cowsId) {
  let cow = await Cow.findOne({ cowsId });
  if (!cow) {
    cow = await Cow.create({ cowsId });
  }
  return cow;
}

module.exports = { findOrCreateCow };
