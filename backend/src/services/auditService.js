const AuditLog = require('../models/AuditLog');

// Full-record snapshot rather than just the touched fields, so the audit
// trail keeps context on the rest of the analysis at that moment instead of
// having to guess which fields a review action might touch. Deep-cloned via
// a JSON round-trip so a later in-place mutation of the live mongoose doc
// (bcsScore is Mixed) can never retroactively alter an already-captured
// snapshot, and ObjectId/Date values normalize into plain JSON the same way
// they'll come back out of Mongo on read.
function snapshotBcsAnalysis(doc) {
  return JSON.parse(
    JSON.stringify({
      cowsImages: doc.cowsImages,
      bcsScore: doc.bcsScore,
      // The single source of truth for "what is this analysis's score" -
      // null before any review action, then whatever a select/override set it to.
      final_bcs: doc.final_bcs,
      status: doc.status,
      errorMessage: doc.errorMessage,
      is_approved: doc.is_approved,
      updatedBy: doc.updatedBy,
    })
  );
}

async function recordAuditEntry({ analysis, action, before, after, performedBy }) {
  return AuditLog.create({
    bcsAnalysis: analysis._id,
    cow: analysis.cow,
    cowsId: analysis.cowsId,
    action,
    before,
    after,
    performedBy,
  });
}

module.exports = { snapshotBcsAnalysis, recordAuditEntry };
