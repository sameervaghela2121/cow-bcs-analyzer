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
      finalBcs: doc.finalBcs,
      status: doc.status,
      errorMessage: doc.errorMessage,
      isApproved: doc.isApproved,
      updatedBy: doc.updatedBy,
    })
  );
}

// analysis.cow must be populated by the caller - cowsId is denormalized
// onto AuditLog (unlike BcsAnalysis) since audit entries are a historical
// record that should keep reading the cow's id as it was at the time,
// independent of BcsAnalysis's own schema.
async function recordAuditEntry({ analysis, action, before, after, performedBy }) {
  return AuditLog.create({
    bcsAnalysis: analysis._id,
    cow: analysis.cow._id,
    cowsId: analysis.cow.cowsId,
    action,
    before,
    after,
    performedBy,
  });
}

module.exports = { snapshotBcsAnalysis, recordAuditEntry };
