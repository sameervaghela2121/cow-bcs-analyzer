const config = require('../config/env');
const {
  buildDateFolder,
  buildMilkingObjectPath,
  toMilkingGsUri,
  generateMilkingUploadUrl,
} = require('../services/milkingGcsService');
const { triggerMilkingImport } = require('../services/milkingImporterClient');
const { buildFacilityScopedMatch } = require('../services/milkingQueryService');
const MilkingRecord = require('../models/MilkingRecord');

const SAFE_FILENAME = /^[A-Za-z0-9._-]{1,128}$/;
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const SHIFTS = ['Morning', 'Afternoon', 'Evening'];

async function generateUploadUrl(req, res, next) {
  try {
    const { filename, contentType } = req.body;
    if (!filename || !SAFE_FILENAME.test(filename)) {
      return res.status(400).json({ error: "filename is required and may only contain letters, numbers, '.', '_', '-'." });
    }
    if (contentType !== XLSX_CONTENT_TYPE) {
      return res.status(400).json({ error: `contentType must be ${XLSX_CONTENT_TYPE}.` });
    }

    // Date folder is always server-generated, never client-supplied, same
    // reasoning as batchTimestamp in the BCS photo upload flow.
    const dateFolder = buildDateFolder();
    const objectPath = buildMilkingObjectPath({
      organizationId: req.scope.organizationId,
      facilityId: req.scope.facilityId,
      dateFolder,
      filename,
    });
    const uploadUrl = await generateMilkingUploadUrl({ objectPath, contentType });

    res.json({ dateFolder, filename, gsUri: toMilkingGsUri(objectPath), objectPath, uploadUrl });
  } catch (err) {
    next(err);
  }
}

async function importUpload(req, res, next) {
  try {
    const { objectPath, milkingDate } = req.body;
    const segment = '[A-Za-z0-9._-]{1,128}';
    if (!objectPath || !new RegExp(`^${segment}/${segment}/${segment}/${segment}$`).test(objectPath)) {
      return res.status(400).json({ error: 'objectPath is required and must be a <organizationId>/<facilityId>/<dateFolder>/<filename> path.' });
    }
    // The date the uploader is reporting this file's data for - the sheet
    // itself has no date column, and Morning/Afternoon/Evening milkSessionAt
    // values are all computed relative to this (see dailyMilkParser.js).
    if (!milkingDate || !/^\d{4}-\d{2}-\d{2}$/.test(milkingDate)) {
      return res.status(400).json({ error: 'milkingDate is required and must be in YYYY-MM-DD format.' });
    }

    // bucketName is never taken from the client - there's only one
    // legitimate bucket for this feature, so it's hardcoded server-side
    // rather than trusted from the request.
    const result = await triggerMilkingImport({
      bucketName: config.milking.bucketName,
      objectPath,
      milkingDate,
      facilityId: req.scope.facilityId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// Every calendar day between startDate/endDate (inclusive) must appear in
// the output even when the aggregation returned no rows for it, so the
// caller can tell "zero production that day" apart from "day is missing" -
// ProductionChart draws a straight line across any gap in the array, which
// would otherwise misrepresent a genuinely zero day as continuous
// production. Seed every day as zeroed first, then fold in the real rows.
function seedByDate(startDate, endDate) {
  const byDate = new Map();
  let cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    const dateStr = cursor.toISOString().slice(0, 10);
    byDate.set(dateStr, { date: dateStr, totalMilk: 0, recordCount: 0, byShift: { Morning: 0, Afternoon: 0, Evening: 0 } });
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return byDate;
}

function reshapeDaily(rows, startDate, endDate) {
  const byDate = seedByDate(startDate, endDate);
  for (const row of rows) {
    const { date, shift } = row._id;
    if (!byDate.has(date)) {
      byDate.set(date, { date, totalMilk: 0, recordCount: 0, byShift: { Morning: 0, Afternoon: 0, Evening: 0 } });
    }
    const entry = byDate.get(date);
    entry.totalMilk += row.totalMilk;
    entry.recordCount += row.recordCount;
    if (SHIFTS.includes(shift)) entry.byShift[shift] = row.totalMilk;
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function reshapeStats(statsRows) {
  const s = statsRows[0] || { totalMilk: 0, recordCount: 0, cowsReporting: 0, groupsActive: 0 };
  return {
    totalMilk: s.totalMilk,
    recordCount: s.recordCount,
    cowsReporting: s.cowsReporting,
    groupsActive: s.groupsActive,
    avgPerCow: s.cowsReporting > 0 ? s.totalMilk / s.cowsReporting : 0,
  };
}

async function summary(req, res, next) {
  try {
    const { startDate, endDate, groupId, cowId, shift } = req.query;
    const match = await buildFacilityScopedMatch({
      facilityId: req.scope.facilityId,
      startDate,
      endDate,
      cowId,
      groupId,
      shift,
    });

    const [result] = await MilkingRecord.aggregate([
      { $match: match },
      {
        $facet: {
          daily: [
            {
              $group: {
                _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$milkSessionAt' } }, shift: '$milkingShift' },
                totalMilk: { $sum: '$milk' },
                recordCount: { $sum: 1 },
              },
            },
            { $sort: { '_id.date': 1 } },
          ],
          stats: [
            {
              $group: {
                _id: null,
                totalMilk: { $sum: '$milk' },
                recordCount: { $sum: 1 },
                cows: { $addToSet: '$cow' },
                groups: { $addToSet: '$cowGroup' },
              },
            },
            {
              $project: {
                _id: 0,
                totalMilk: 1,
                recordCount: 1,
                cowsReporting: { $size: '$cows' },
                // cowGroup is optional, so $addToSet can pick up a null entry
                // for group-less records - that must not count as an "active
                // group", hence the filter before $size.
                groupsActive: { $size: { $filter: { input: '$groups', cond: { $ne: ['$$this', null] } } } },
              },
            },
          ],
        },
      },
    ]);

    res.json({ daily: reshapeDaily(result.daily, startDate, endDate), stats: reshapeStats(result.stats) });
  } catch (err) {
    next(err);
  }
}

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;
const SORT_FIELDS = { date: 'milkSessionAt', milk: 'milk' };

async function records(req, res, next) {
  try {
    const { startDate, endDate, groupId, cowId, shift, sortBy = 'date', sortOrder = 'desc', limit = DEFAULT_LIMIT, offset = 0 } = req.query;

    const match = await buildFacilityScopedMatch({
      facilityId: req.scope.facilityId,
      startDate,
      endDate,
      cowId,
      groupId,
      shift,
    });

    if (!Object.prototype.hasOwnProperty.call(SORT_FIELDS, sortBy)) {
      return res.status(400).json({ error: `sortBy must be one of: ${Object.keys(SORT_FIELDS).join(', ')}.` });
    }
    if (!['asc', 'desc'].includes(sortOrder)) {
      return res.status(400).json({ error: "sortOrder must be 'asc' or 'desc'." });
    }
    const numericLimit = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));
    const numericOffset = Math.max(0, Number(offset) || 0);

    // _id tiebreaker: real milking data has huge numbers of records sharing
    // the exact same milkSessionAt (a whole shift/day) or the exact same
    // milk value (many zero-milk cells). Mongo's sort is unstable across
    // ties, so without a unique trailing key, two separate skip/limit page
    // queries aren't guaranteed to agree on ordering - rows can duplicate
    // across pages or vanish entirely.
    const sortStage = { [SORT_FIELDS[sortBy]]: sortOrder === 'asc' ? 1 : -1, _id: 1 };

    const [total, docs] = await Promise.all([
      MilkingRecord.countDocuments(match),
      MilkingRecord.find(match)
        .sort(sortStage)
        .skip(numericOffset)
        .limit(numericLimit)
        .populate('cow', 'cowsId')
        .lean(),
    ]);

    res.json({
      records: docs.map((doc) => ({
        id: doc._id.toString(),
        cowsId: doc.cow?.cowsId ?? null,
        currentGroup: doc.currentGroup ?? null,
        shift: doc.milkingShift,
        milk: doc.milk,
        milkSessionAt: doc.milkSessionAt,
        createdAt: doc.createdAt,
      })),
      total,
      limit: numericLimit,
      offset: numericOffset,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { generateUploadUrl, importUpload, summary, records };
