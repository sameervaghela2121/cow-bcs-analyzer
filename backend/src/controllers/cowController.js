const Cow = require('../models/Cow');
const BcsAnalysis = require('../models/BcsAnalysis');
const { serializeBcsAnalysis } = require('./bcsAnalysisController');
const { fromGsUri, generateReadUrl } = require('../services/gcsService');
const { THUMBNAIL, buildVariantObjectPath } = require('../services/imageVariants');
const { successfulScores, medianOfScores } = require('../services/bcsScoring');

// Cover photo for the herd grid card: the latest analysis's first image,
// as its compressed 300X300 thumbnail variant. latestAnalysisImageUrl (the
// original) is included alongside purely as an onError fallback on the
// frontend, same pattern as bcsAnalysisController.serializeBcsAnalysis.
async function serializeCow(cow, latestAnalysis) {
  const firstImageUri = latestAnalysis?.cowsImages?.[0];
  let latestAnalysisThumbnailUrl = null;
  let latestAnalysisImageUrl = null;
  if (firstImageUri) {
    const { objectPath } = fromGsUri(firstImageUri);
    [latestAnalysisThumbnailUrl, latestAnalysisImageUrl] = await Promise.all([
      generateReadUrl({ objectPath: buildVariantObjectPath(objectPath, THUMBNAIL.name) }),
      generateReadUrl({ objectPath }),
    ]);
  }
  // Same "finalBcs once reviewed, medianScore as a live preview before
  // that" rule the cow detail page and ReviewPage use - never re-derived
  // differently here.
  const latestBcsScore = latestAnalysis
    ? latestAnalysis.finalBcs ?? medianOfScores(successfulScores(latestAnalysis.bcsScore))
    : null;
  return {
    id: cow._id.toString(),
    cowsId: cow.cowsId,
    isActive: cow.isActive,
    createdAt: cow.createdAt,
    updatedAt: cow.updatedAt,
    latestAnalysisStatus: latestAnalysis?.status ?? null,
    latestAnalysisAt: latestAnalysis?.createdAt ?? null,
    latestAnalysisIsApproved: latestAnalysis?.isApproved ?? null,
    latestBcsScore,
    latestAnalysisThumbnailUrl,
    latestAnalysisImageUrl,
  };
}

async function create(req, res, next) {
  try {
    const { cowsId } = req.body;
    if (!cowsId) return res.status(400).json({ error: 'cowsId is required.' });
    const existing = await Cow.findOne({ facility: req.scope.facilityId, cowsId });
    if (existing) return res.status(409).json({ error: 'A cow with this ID already exists.' });
    const cow = await Cow.create({ facility: req.scope.facilityId, cowsId });
    res.status(201).json({ cow: await serializeCow(cow) });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const cow = await Cow.findOne({ facility: req.scope.facilityId, cowsId: req.params.cowsId });
    if (!cow) return res.status(404).json({ error: 'Cow not found.' });
    res.json({ cow: await serializeCow(cow) });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { search, page = 1, limit: rawLimit, lite } = req.query;
    const isLite = lite === 'true' || lite === true;
    // Lite mode is for lightweight ID dropdowns (e.g. the milking dashboard
    // filter bar) - it skips the BcsAnalysis aggregation and per-cow GCS
    // signed-URL generation below entirely, and defaults to a much higher
    // cap than the normal herd-grid page size so a facility's whole roster
    // fits in one dropdown. An explicit ?limit= still overrides either way.
    const limit = rawLimit !== undefined ? rawLimit : isLite ? 1000 : 100;
    const query = { facility: req.scope.facilityId };
    if (search && search.trim()) query.cowsId = { $regex: search.trim(), $options: 'i' };

    const [total, cows] = await Promise.all([
      Cow.countDocuments(query),
      Cow.find(query)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit)),
    ]);

    if (isLite) {
      return res.json({
        cows: cows.map((c) => ({ id: c._id.toString(), cowsId: c.cowsId })),
        total,
      });
    }

    const latestAnalysisByCow = await BcsAnalysis.aggregate([
      { $match: { cow: { $in: cows.map((c) => c._id) } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$cow',
          status: { $first: '$status' },
          createdAt: { $first: '$createdAt' },
          isApproved: { $first: '$isApproved' },
          cowsImages: { $first: '$cowsImages' },
          finalBcs: { $first: '$finalBcs' },
          bcsScore: { $first: '$bcsScore' },
        },
      },
    ]);
    const latestById = new Map(latestAnalysisByCow.map((d) => [d._id.toString(), d]));

    res.json({
      cows: await Promise.all(
        cows.map((cow) => serializeCow(cow, latestById.get(cow._id.toString())))
      ),
      total,
    });
  } catch (err) {
    next(err);
  }
}

async function analyses(req, res, next) {
  try {
    const cow = await Cow.findOne({ facility: req.scope.facilityId, cowsId: req.params.cowsId });
    if (!cow) return res.status(404).json({ error: 'Cow not found.' });
    const { page = 1, limit = 100 } = req.query;
    const total = await BcsAnalysis.countDocuments({ cow: cow._id });
    const docs = await BcsAnalysis.find({ cow: cow._id })
      .populate('cow')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    res.json({ bcsAnalyses: await Promise.all(docs.map(serializeBcsAnalysis)), total });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, getOne, list, analyses, serializeCow };
