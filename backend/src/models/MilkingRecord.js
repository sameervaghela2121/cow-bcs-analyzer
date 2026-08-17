const mongoose = require('mongoose');

// Kept schema-identical to milking-data-importer/src/models/MilkingRecord.js
// by hand - that Cloud Function is deployed with --source=. and can't
// require this file across the package boundary, so both packages define
// the same shape independently against the same 'milking_records' collection.
//
// currentGroup is stored as-is from the sheet (never mutated). cowNumber is
// NOT stored - it only exists transiently in dailyMilkParser.js's output to
// look up/create the matching Cow document; once resolved into the `cow`
// ref below, the raw string itself is redundant. cow/cowGroup are resolved
// (find-or-create, scoped to the uploading facility) at import time - see
// importHandler.js. cowGroup is intentionally NOT a mutable "current group"
// field on Cow: each record keeps the CowGroup ref that was live when *that*
// row was imported, so a cow's group history is just the trail of refs
// across its past records, and moving a cow to a new group can never
// rewrite or break history. No organization/facility field lives directly
// on this document - that scoping is reached via cow.facility /
// cowGroup.facility instead of being duplicated here.
const milkingRecordSchema = new mongoose.Schema(
  {
    currentGroup: { type: String },
    cow: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow', required: true, index: true },
    cowGroup: { type: mongoose.Schema.Types.ObjectId, ref: 'CowGroup', index: true },
    milkingShift: { type: String, enum: ['Morning', 'Afternoon', 'Evening'], required: true },
    milk: { type: Number, required: true },
    // The actual date/time of this specific milking session - Morning
    // shares the uploader-entered milkingDate; Afternoon/Evening are the day
    // before, since a morning import always reports the prior evening's two
    // sessions too. See milking-data-importer/src/dailyMilkParser.js.
    milkSessionAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'milking_records' }
);

// _id trails as a tiebreaker on both indexes: Mongo's sort is unstable
// across ties on milkSessionAt alone (a whole shift/day of records shares
// the exact same value), so a stable trailing key is required for
// skip/limit pagination to give consistent results across pages.
milkingRecordSchema.index({ cow: 1, milkSessionAt: 1, _id: 1 });
milkingRecordSchema.index({ cowGroup: 1, milkSessionAt: 1, _id: 1 });

module.exports = mongoose.model('MilkingRecord', milkingRecordSchema);
