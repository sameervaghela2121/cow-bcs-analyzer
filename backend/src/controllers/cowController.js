const Cow = require('../models/Cow');
const BcsAnalysis = require('../models/BcsAnalysis');
const { serializeBcsAnalysis } = require('./bcsAnalysisController');

function serializeCow(cow, latestAnalysis) {
  return {
    id: cow._id.toString(),
    cowsId: cow.cowsId,
    createdAt: cow.createdAt,
    updatedAt: cow.updatedAt,
    latestAnalysisStatus: latestAnalysis?.status ?? null,
    latestAnalysisAt: latestAnalysis?.createdAt ?? null,
    latestAnalysisIsApproved: latestAnalysis?.is_approved ?? null,
  };
}

async function create(req, res, next) {
  try {
    const { cowsId } = req.body;
    if (!cowsId) return res.status(400).json({ error: 'cowsId is required.' });
    const existing = await Cow.findOne({ cowsId });
    if (existing) return res.status(409).json({ error: 'A cow with this ID already exists.' });
    const cow = await Cow.create({ cowsId });
    res.status(201).json({ cow: serializeCow(cow) });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const cow = await Cow.findOne({ cowsId: req.params.cowsId });
    if (!cow) return res.status(404).json({ error: 'Cow not found.' });
    res.json({ cow: serializeCow(cow) });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { search, page = 1, limit = 100 } = req.query;
    const query = {};
    if (search && search.trim()) query.cowsId = { $regex: search.trim(), $options: 'i' };

    const total = await Cow.countDocuments(query);
    const cows = await Cow.find(query)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const latestAnalysisByCow = await BcsAnalysis.aggregate([
      { $match: { cow: { $in: cows.map((c) => c._id) } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$cow',
          status: { $first: '$status' },
          createdAt: { $first: '$createdAt' },
          is_approved: { $first: '$is_approved' },
        },
      },
    ]);
    const latestById = new Map(latestAnalysisByCow.map((d) => [d._id.toString(), d]));

    res.json({
      cows: cows.map((cow) => serializeCow(cow, latestById.get(cow._id.toString()))),
      total,
    });
  } catch (err) {
    next(err);
  }
}

async function analyses(req, res, next) {
  try {
    const cow = await Cow.findOne({ cowsId: req.params.cowsId });
    if (!cow) return res.status(404).json({ error: 'Cow not found.' });
    const { page = 1, limit = 100 } = req.query;
    const total = await BcsAnalysis.countDocuments({ cow: cow._id });
    const docs = await BcsAnalysis.find({ cow: cow._id })
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    res.json({ bcsAnalyses: await Promise.all(docs.map(serializeBcsAnalysis)), total });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, getOne, list, analyses, serializeCow };
