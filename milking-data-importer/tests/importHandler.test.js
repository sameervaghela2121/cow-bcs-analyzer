const XLSX = require('xlsx');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let savedFixtureBuffer;
const mockFile = jest.fn(() => ({
  download: jest.fn(async () => [savedFixtureBuffer]),
}));
const mockBucket = jest.fn(() => ({ file: mockFile }));

jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({ bucket: mockBucket })),
}));

let mongod;

// getConnection() only connects once (module-level cache), so point
// MONGODB_URL at the in-memory server before importHandler is first required.
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URL = mongod.getUri();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany();
  }
  jest.clearAllMocks();
});

function buildXlsxBuffer(headerRow, dataRows, { includePivotSheet = false } = {}) {
  const workbook = XLSX.utils.book_new();
  if (includePivotSheet) {
    // Mirrors the real-world export: a pivot-table summary sheet named
    // "Sheet1" precedes the real per-cow data, which must be ignored.
    const pivotSheet = XLSX.utils.aoa_to_sheet([['Date :- 31.07.2026'], ['Row Labels', 'Sum of Afternoon']]);
    XLSX.utils.book_append_sheet(workbook, pivotSheet, 'Sheet1');
  }
  const sheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

const FACILITY_ID = new mongoose.Types.ObjectId();

describe('importMilkingFile', () => {
  const HEADER_ROW = ['Cow Number', 'Current Group', 'Afternoon', 'Evening', 'Morning', 'Total'];

  it('parses the daily-shift sheet, inserts 3 records per row, and resolves cow/cowGroup refs scoped to facilityId', async () => {
    const { importMilkingFile } = require('../src/importHandler');
    const { getConnection } = require('../src/db');
    const MilkingRecord = require('../src/models/MilkingRecord');
    const Cow = require('../src/models/Cow');
    const CowGroup = require('../src/models/CowGroup');

    // getConnection() is normally only awaited inside importMilkingFile - it
    // must be awaited here too before touching Mongo directly, since this is
    // the first operation in the whole suite to run before that.
    await getConnection();

    const dataRows = [
      [232, 2.1, 7.86, 0, 6.81, 14.67],
      [1067, 3.3, 4.3, 7.2, 6.33, 17.83],
    ];
    savedFixtureBuffer = buildXlsxBuffer(HEADER_ROW, dataRows);

    const result = await importMilkingFile({
      bucketName: 'test-bucket',
      objectPath: 'daily.xlsx',
      milkingDate: '2026-08-12',
      facilityId: FACILITY_ID,
    });

    expect(result).toEqual({ recordsInserted: 6 });
    expect(mockBucket).toHaveBeenCalledWith('test-bucket');
    expect(await MilkingRecord.countDocuments()).toBe(6);
    expect(await Cow.countDocuments()).toBe(2);
    expect(await CowGroup.countDocuments()).toBe(2);

    const cow232 = await Cow.findOne({ facility: FACILITY_ID, cowsId: '232' });
    expect(cow232).not.toBeNull();
    const group21 = await CowGroup.findOne({ facility: FACILITY_ID, name: '2.1' });
    expect(group21).not.toBeNull();

    // cowNumber isn't stored - cow232 (looked up via Cow.cowsId above) is
    // now the only way to find this cow's records.
    const cow232Records = await MilkingRecord.find({ cow: cow232._id }).sort({ milkingShift: 1 });
    expect(cow232Records).toHaveLength(3);
    expect(cow232Records.every((r) => String(r.cowGroup) === String(group21._id))).toBe(true);

    const morning232 = cow232Records.find((r) => r.milkingShift === 'Morning');
    expect(morning232.milk).toBe(6.81);
    expect(morning232.currentGroup).toBe('2.1');
    expect(morning232.milkSessionAt.toISOString().slice(0, 10)).toBe('2026-08-12');
    const evening232 = cow232Records.find((r) => r.milkingShift === 'Evening');
    expect(evening232.milk).toBe(0);
    expect(evening232.milkSessionAt.toISOString().slice(0, 10)).toBe('2026-08-11');

    // No cowNumber/organization/facility field lives directly on
    // MilkingRecord - cowNumber was only ever needed to resolve the `cow`
    // ref above, and organization/facility are only reachable via
    // cow.facility/cowGroup.facility, the same way BcsAnalysis reaches it
    // via its own cow reference.
    const raw = morning232.toObject();
    expect(raw.cowNumber).toBeUndefined();
    expect(raw.organization).toBeUndefined();
    expect(raw.facility).toBeUndefined();
    expect(raw.sourceObjectPath).toBeUndefined();
  });

  it('reuses the same Cow/CowGroup on a later import instead of creating duplicates', async () => {
    const { importMilkingFile } = require('../src/importHandler');
    const Cow = require('../src/models/Cow');
    const CowGroup = require('../src/models/CowGroup');

    savedFixtureBuffer = buildXlsxBuffer(HEADER_ROW, [[232, '2.1', 7.86, 0, 6.81, 14.67]]);
    await importMilkingFile({ bucketName: 'test-bucket', objectPath: 'daily.xlsx', milkingDate: '2026-08-12', facilityId: FACILITY_ID });

    savedFixtureBuffer = buildXlsxBuffer(HEADER_ROW, [[232, '2.1', 7.86, 0, 6.81, 14.67]]);
    await importMilkingFile({ bucketName: 'test-bucket', objectPath: 'daily2.xlsx', milkingDate: '2026-08-13', facilityId: FACILITY_ID });

    expect(await Cow.countDocuments({ facility: FACILITY_ID, cowsId: '232' })).toBe(1);
    expect(await CowGroup.countDocuments({ facility: FACILITY_ID, name: '2.1' })).toBe(1);
  });

  it('preserves group history when a cow moves to a new group - past records keep their original CowGroup ref', async () => {
    const { importMilkingFile } = require('../src/importHandler');
    const MilkingRecord = require('../src/models/MilkingRecord');
    const Cow = require('../src/models/Cow');
    const CowGroup = require('../src/models/CowGroup');

    savedFixtureBuffer = buildXlsxBuffer(HEADER_ROW, [[232, '2.1', 7.86, 0, 6.81, 14.67]]);
    await importMilkingFile({ bucketName: 'test-bucket', objectPath: 'daily.xlsx', milkingDate: '2026-08-12', facilityId: FACILITY_ID });

    savedFixtureBuffer = buildXlsxBuffer(HEADER_ROW, [[232, '3.3', 5.0, 1.0, 5.5, 11.5]]);
    await importMilkingFile({ bucketName: 'test-bucket', objectPath: 'daily2.xlsx', milkingDate: '2026-08-13', facilityId: FACILITY_ID });

    // Still one Cow document - the cow itself didn't change, only which
    // group it belonged to at each import.
    const cow = await Cow.findOne({ facility: FACILITY_ID, cowsId: '232' });
    expect(await Cow.countDocuments({ facility: FACILITY_ID, cowsId: '232' })).toBe(1);

    const oldGroup = await CowGroup.findOne({ facility: FACILITY_ID, name: '2.1' });
    const newGroup = await CowGroup.findOne({ facility: FACILITY_ID, name: '3.3' });
    expect(oldGroup._id.toString()).not.toBe(newGroup._id.toString());

    // Records from the first import still point at the old group - moving
    // the cow to a new group never rewrites past records.
    expect(await MilkingRecord.countDocuments({ cow: cow._id, cowGroup: oldGroup._id })).toBe(3);
    expect(await MilkingRecord.countDocuments({ cow: cow._id, cowGroup: newGroup._id })).toBe(3);
  });

  it('reads the sheet named "Sheet", ignoring a pivot-table summary sheet named "Sheet1"', async () => {
    const { importMilkingFile } = require('../src/importHandler');
    const MilkingRecord = require('../src/models/MilkingRecord');
    const Cow = require('../src/models/Cow');

    const dataRows = [[5, '1.1', 4.3, 7.2, 6.33, 17.83]];
    savedFixtureBuffer = buildXlsxBuffer(HEADER_ROW, dataRows, { includePivotSheet: true });

    const result = await importMilkingFile({
      bucketName: 'test-bucket',
      objectPath: 'daily.xlsx',
      milkingDate: '2026-08-12',
      facilityId: FACILITY_ID,
    });

    expect(result).toEqual({ recordsInserted: 3 });
    const cow5 = await Cow.findOne({ facility: FACILITY_ID, cowsId: '5' });
    expect(await MilkingRecord.countDocuments({ cow: cow5._id })).toBe(3);
  });

  it('rejects a missing facilityId before touching storage', async () => {
    const { importMilkingFile } = require('../src/importHandler');

    await expect(
      importMilkingFile({
        bucketName: 'test-bucket',
        objectPath: 'daily.xlsx',
        milkingDate: '2026-08-12',
      })
    ).rejects.toThrow(/facilityId is required\./);

    expect(mockBucket).not.toHaveBeenCalled();
  });

  it('rejects a missing or malformed milkingDate before touching storage', async () => {
    const { importMilkingFile } = require('../src/importHandler');

    await expect(
      importMilkingFile({
        bucketName: 'test-bucket',
        objectPath: 'daily.xlsx',
        milkingDate: '12-08-2026', // wrong shape
        facilityId: FACILITY_ID,
      })
    ).rejects.toThrow(/milkingDate is required and must be in YYYY-MM-DD format\./);

    expect(mockBucket).not.toHaveBeenCalled();
  });

  it('saves nothing and reports a meaningful error when a row is missing its Cow Number', async () => {
    const { importMilkingFile } = require('../src/importHandler');
    const MilkingRecord = require('../src/models/MilkingRecord');

    const dataRows = [
      [5, '1.1', 4.3, 7.2, 6.33, 17.83],
      ['', '1.2', 0, 1, 2, 3],
    ];
    savedFixtureBuffer = buildXlsxBuffer(HEADER_ROW, dataRows);

    await expect(
      importMilkingFile({
        bucketName: 'test-bucket',
        objectPath: 'daily.xlsx',
        milkingDate: '2026-08-12',
        facilityId: FACILITY_ID,
      })
    ).rejects.toThrow(/missing the Cow Number for row 3\./);

    expect(await MilkingRecord.countDocuments()).toBe(0);
  });

  it('saves nothing and reports a meaningful error when a required column is missing', async () => {
    const { importMilkingFile } = require('../src/importHandler');
    const MilkingRecord = require('../src/models/MilkingRecord');

    savedFixtureBuffer = buildXlsxBuffer(['Cow Number', 'Current Group', 'Afternoon'], [[5, '1.1', 4.3]]);

    await expect(
      importMilkingFile({
        bucketName: 'test-bucket',
        objectPath: 'daily.xlsx',
        milkingDate: '2026-08-12',
        facilityId: FACILITY_ID,
      })
    ).rejects.toThrow(/missing the following column\(s\): Evening, Morning/);

    expect(await MilkingRecord.countDocuments()).toBe(0);
  });
});
