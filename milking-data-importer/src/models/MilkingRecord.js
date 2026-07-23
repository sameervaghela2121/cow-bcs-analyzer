const mongoose = require('mongoose');

// Deployed with --source=. (this directory only), so this is a duplicate of
// backend/src/models/MilkingRecord.js kept in sync by hand - the two
// packages can't share code across the deploy boundary. This is the
// authoritative copy the Cloud Function actually writes with.
//
// No cow reference/linkage for now (not needed yet) - each row is stored
// standalone, identified only by its own cowNumber/animalNumber field.
const milkingRecordSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ['SCR', 'DelPro'], required: true },

    // SCR fields
    cowNumber: { type: String },
    currentGroup: { type: String },
    shiftYield: { type: Number },
    date: { type: Date },
    shift: { type: String },
    shiftYield1: { type: Number },
    shiftYield2: { type: Number },
    shiftYield3: { type: Number },

    // DelPro fields
    animalNumber: { type: String },
    groupName: { type: String },
    yieldYesterdaySession2: { type: Number },
    yieldYesterdaySession3: { type: Number },
    yieldTodaySession1: { type: Number },
    milkYieldYesterday: { type: Number },

    // gs:// path of the sheet this record was parsed from, for traceability.
    sourceObjectPath: { type: String, required: true },
  },
  { timestamps: true, collection: 'milking_records' }
);

module.exports = mongoose.model('MilkingRecord', milkingRecordSchema);
