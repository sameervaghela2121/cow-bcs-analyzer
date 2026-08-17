const mongoose = require('mongoose');

// Deployed with --source=. (this directory only), so this is a duplicate of
// backend/src/models/MilkingRecord.js kept in sync by hand - the two
// packages can't share code across the deploy boundary. This is the
// authoritative copy the Cloud Function actually writes with.
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
    // sessions too. See dailyMilkParser.js.
    milkSessionAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'milking_records' }
);

milkingRecordSchema.index({ cow: 1, milkSessionAt: 1 });
milkingRecordSchema.index({ cowGroup: 1, milkSessionAt: 1 });

module.exports = mongoose.model('MilkingRecord', milkingRecordSchema);
