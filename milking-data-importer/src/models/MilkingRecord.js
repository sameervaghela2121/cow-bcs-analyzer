const mongoose = require('mongoose');

// Deployed with --source=. (this directory only), so this is a duplicate of
// backend/src/models/MilkingRecord.js kept in sync by hand - the two
// packages can't share code across the deploy boundary. This is the
// authoritative copy the Cloud Function actually writes with.
const milkingRecordSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ['SCR', 'DelPro'], required: true },

    // Resolved via find-or-create against the sheet's own dedicated "Cow Id"
    // column - deliberately NOT cowNumber/animalNumber below, which stay
    // plain report fields. See cowIdColumn.js.
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
