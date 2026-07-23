const mongoose = require('mongoose');

// Kept schema-identical to milking-data-importer/src/models/MilkingRecord.js
// by hand - that Cloud Function is deployed with --source=. and can't
// require this file across the package boundary, so both packages define
// the same shape independently against the same 'milking_records' collection.
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
