const mongoose = require('mongoose');

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const VALID_SHIFTS = ['Morning', 'Afternoon', 'Evening'];

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// Shared facility-scoped $match builder for the milking dashboard endpoints
// (summary + records, built in later tasks). Facility scoping is reached via
// cow.facility/cowGroup.facility since MilkingRecord itself has no facility
// field - see MilkingRecord.js.
async function buildFacilityScopedMatch({ facilityId, startDate, endDate, cowId, groupId, shift }) {
  if (!startDate || !endDate || !DATE_FORMAT.test(startDate) || !DATE_FORMAT.test(endDate)) {
    throw badRequest('startDate and endDate are required and must be in YYYY-MM-DD format.');
  }
  if (startDate > endDate) {
    throw badRequest('startDate must not be after endDate.');
  }

  const match = {
    milkSessionAt: { $gte: new Date(`${startDate}T00:00:00.000Z`), $lte: new Date(`${endDate}T23:59:59.999Z`) },
  };

  const Cow = require('../models/Cow');

  if (cowId) {
    const cow = mongoose.Types.ObjectId.isValid(cowId)
      ? await Cow.findOne({ _id: cowId, facility: facilityId })
      : null;
    if (!cow) {
      throw badRequest('cowId does not belong to this facility.');
    }
    match.cow = cow._id;
  } else if (groupId) {
    const CowGroup = require('../models/CowGroup');
    const group = mongoose.Types.ObjectId.isValid(groupId)
      ? await CowGroup.findOne({ _id: groupId, facility: facilityId })
      : null;
    if (!group) {
      throw badRequest('groupId does not belong to this facility.');
    }
    match.cowGroup = group._id;
  } else {
    const cowIds = await Cow.find({ facility: facilityId }).distinct('_id');
    match.cow = { $in: cowIds };
  }

  if (shift) {
    if (!VALID_SHIFTS.includes(shift)) {
      throw badRequest('shift must be one of: Morning, Afternoon, Evening.');
    }
    match.milkingShift = shift;
  }

  return match;
}

module.exports = { buildFacilityScopedMatch };
