const mongoose = require('mongoose');

// Kept schema-identical to milking-data-importer/src/models/MilkingRecord.js
// by hand - that Cloud Function is deployed with --source=. and can't
// require this file across the package boundary, so both packages define
// the same shape independently against the same 'milking_records' collection.
const milkingRecordSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ['SCR', 'DelPro'], required: true },

    // Resolved via find-or-create against the sheet's own dedicated "Cow Id"
    // column - deliberately NOT cowNumber/animalNumber below, which stay
    // plain report fields. See milking-data-importer/src/cowIdColumn.js.
    cow: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow' },
    // Known at upload time (the uploader's own session is already
    // facility-scoped), so these are required even though cow above isn't -
    // a row can be tenant-filtered before its cow ever resolves.
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    facility: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },

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
