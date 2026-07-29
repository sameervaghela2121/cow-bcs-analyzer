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
const FAKE_ORG_ID = '507f1f77bcf86cd799439011';
const FAKE_FACILITY_ID = '507f1f77bcf86cd799439012';

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

function buildXlsxBuffer(headerRow, dataRows) {
  const sheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

describe('importMilkingFile', () => {
  it('parses an SCR sheet, resolves a Cow per row from Cow Id (find-or-create), and inserts one MilkingRecord per real row', async () => {
    const { importMilkingFile } = require('../src/importHandler');
    const { getConnection } = require('../src/db');
    const MilkingRecord = require('../src/models/MilkingRecord');
    const Cow = require('../src/models/Cow');

    // getConnection() is normally only awaited inside importMilkingFile - it
    // must be awaited here too before touching Mongo directly, since this is
    // the first operation in the whole suite to run before that.
    await getConnection();
    // Cow C2 already exists from a prior import - must be reused, not recreated.
    const existingCow = await Cow.create({ facility: FAKE_FACILITY_ID, cowsId: 'C2' });

    // 'Cow Id' is deliberately different from 'Cow Number' to prove the
    // import links cows by Cow Id, not by the sheet's own Cow Number.
    const headerRow = ['Cow Number', 'Current Group', 'Shift Yield', 'Date', 'Shift', 'Shift Yield -1', 'Shift Yield -2', 'Shift Yield -3', 'Cow Id'];
    const dataRows = [
      [1, '2.2A', 1.1, '10-07-2026', 'Morning', 2.8, 8.3, '', 'C1'],
      [2, '2.2A', 9.5, '10-07-2026', 'Morning', 8.2, 6.2, 0, 'C2'],
      [3, '1.2A', 6.9, '10-07-2026', 'Morning', 4.1, 6, 5.4, 'C3'],
      [4, '1.3', 4.9, '10-07-2026', 'Morning', 4.7, 3.5, 3.9, 'C4'],
      [4, '1.3', 3.9, '10-07-2026', 'Evening', 3.2, 2.9, 3.1, 'C4'], // same cow, second shift row
      [4, '', 22.29, '', '', 19.75, 24.01, '', 'C4'], // totals row - excluded
    ];
    savedFixtureBuffer = buildXlsxBuffer(headerRow, dataRows);

    const result = await importMilkingFile({ bucketName: 'test-bucket', objectPath: '2026-07-22/scr.xlsx', organizationId: FAKE_ORG_ID, facilityId: FAKE_FACILITY_ID });

    expect(result).toEqual({ source: 'SCR', recordsInserted: 5 });
    expect(mockBucket).toHaveBeenCalledWith('test-bucket');
    expect(await MilkingRecord.countDocuments()).toBe(5);

    const record = await MilkingRecord.findOne({ cowNumber: '2' });
    expect(record.source).toBe('SCR');
    expect(record.shiftYield1).toBe(8.2);
    expect(record.sourceObjectPath).toBe('2026-07-22/scr.xlsx');
    expect(record.organization.toString()).toBe(FAKE_ORG_ID);
    expect(record.facility.toString()).toBe(FAKE_FACILITY_ID);
    expect(record.toObject()._cowId).toBeUndefined(); // transient field, never persisted
    // Cow C2 pre-existed - reused, not duplicated.
    expect(record.cow.toString()).toBe(existingCow._id.toString());
    expect(await Cow.countDocuments({ cowsId: 'C2' })).toBe(1);

    // Cow C4 is new - created once and shared across both of its shift rows.
    const cowC4 = await Cow.findOne({ cowsId: 'C4' });
    expect(cowC4).not.toBeNull();
    const cowC4Records = await MilkingRecord.find({ cowNumber: '4' });
    expect(cowC4Records).toHaveLength(2);
    expect(cowC4Records.every((r) => r.cow.toString() === cowC4._id.toString())).toBe(true);
  });

  it('parses a DelPro sheet, resolves a Cow per row from Cow Id, and inserts one MilkingRecord per row', async () => {
    const { importMilkingFile } = require('../src/importHandler');
    const MilkingRecord = require('../src/models/MilkingRecord');
    const Cow = require('../src/models/Cow');

    const headerRow = ['Animal Number', 'Group Name', 'Yield Yesterday Session 2', 'Yield Yesterday Session 3', 'Yield Today Session 1', 'In Milk', 'Milk Yield Yesterday', 'Cow Id'];
    const dataRows = [
      [11, '3.1 B', 9.1, '', '', 'Checked', 9.06, 'D11'],
      [12, '3.3', 9.5, 4.9, 3.45, 'Checked', 17.67, 'D12'],
      [13, '3.4', 9.6, 6.8, 5.03, 'Checked', 22.27, 'D13'],
      [14, '3.3', 9, 6.9, 5.12, 'Checked', 22.52, 'D14'],
      [15, '3.3', 9.4, 6, 5.36, 'Checked', 22.51, 'D15'],
      [16, '3.2', 9.1, 11.7, 5.98, 'Checked', 26.89, 'D16'],
      [17, '3.3', 9.2, 5.6, 6.98, 'Checked', 20.57, 'D17'],
      [18, '3.2', 9.8, 9.2, 8.09, 'Checked', 27.21, 'D18'],
      [19, '3.2', 9.8, 8.7, 9.56, 'Checked', 27.07, 'D19'],
    ];
    savedFixtureBuffer = buildXlsxBuffer(headerRow, dataRows);

    const result = await importMilkingFile({ bucketName: 'test-bucket', objectPath: '2026-07-22/delpro.xlsx', organizationId: FAKE_ORG_ID, facilityId: FAKE_FACILITY_ID });

    expect(result).toEqual({ source: 'DelPro', recordsInserted: 9 });
    expect(await MilkingRecord.countDocuments()).toBe(9);

    const record = await MilkingRecord.findOne({ animalNumber: '12' });
    expect(record.source).toBe('DelPro');
    expect(record.milkYieldYesterday).toBe(17.67);
    expect(record.toObject().inMilk).toBeUndefined();

    const cowD12 = await Cow.findOne({ cowsId: 'D12' });
    expect(cowD12).not.toBeNull();
    expect(record.cow.toString()).toBe(cowD12._id.toString());
    expect(await Cow.countDocuments()).toBe(9);
    // Animal Number was never used as a cow id.
    expect(await Cow.countDocuments({ cowsId: '12' })).toBe(0);
  });

  it('saves nothing and reports a meaningful error when an SCR row is missing its Cow Id', async () => {
    const { importMilkingFile } = require('../src/importHandler');
    const MilkingRecord = require('../src/models/MilkingRecord');
    const Cow = require('../src/models/Cow');

    const headerRow = ['Cow Number', 'Current Group', 'Shift Yield', 'Date', 'Shift', 'Shift Yield -1', 'Shift Yield -2', 'Shift Yield -3', 'Cow Id'];
    const dataRows = [
      [1, '2.2A', 1.1, '10-07-2026', 'Morning', 2.8, 8.3, '', 'C1'],
      [2, '2.2A', 9.5, '10-07-2026', 'Morning', 8.2, 6.2, 0, ''], // missing Cow Id
      [3, '1.2A', 6.9, '10-07-2026', 'Morning', 4.1, 6, 5.4, 'C3'],
      [4, '', 22.29, '', '', 19.75, 24.01, '', 'C4'], // totals row - must stay excluded, not misreported
    ];
    savedFixtureBuffer = buildXlsxBuffer(headerRow, dataRows);

    await expect(
      importMilkingFile({ bucketName: 'test-bucket', objectPath: '2026-07-22/scr.xlsx', organizationId: FAKE_ORG_ID, facilityId: FAKE_FACILITY_ID })
    ).rejects.toThrow(/missing the Cow Id for row 3\./);

    expect(await MilkingRecord.countDocuments()).toBe(0);
    expect(await Cow.countDocuments()).toBe(0);
  });

  it('saves nothing and reports a meaningful error when the file has no Cow Id column at all', async () => {
    const { importMilkingFile } = require('../src/importHandler');
    const MilkingRecord = require('../src/models/MilkingRecord');
    const Cow = require('../src/models/Cow');

    // No 'Cow Id' column - just the original 7 DelPro columns.
    const headerRow = ['Animal Number', 'Group Name', 'Yield Yesterday Session 2', 'Yield Yesterday Session 3', 'Yield Today Session 1', 'In Milk', 'Milk Yield Yesterday'];
    const dataRows = [[12, '3.3', 9.5, 4.9, 3.45, 'Checked', 17.67]];
    savedFixtureBuffer = buildXlsxBuffer(headerRow, dataRows);

    await expect(
      importMilkingFile({ bucketName: 'test-bucket', objectPath: '2026-07-22/delpro.xlsx', organizationId: FAKE_ORG_ID, facilityId: FAKE_FACILITY_ID })
    ).rejects.toThrow(/no "Cow Id" column/);

    expect(await MilkingRecord.countDocuments()).toBe(0);
    expect(await Cow.countDocuments()).toBe(0);
  });

  it('reproduces the real-world bug report: a Cow Id column that exists but is blank on every row saves nothing and creates no cows', async () => {
    const { importMilkingFile } = require('../src/importHandler');
    const MilkingRecord = require('../src/models/MilkingRecord');
    const Cow = require('../src/models/Cow');

    // Matches the actual uploaded file: 'Cow Id' column present, empty on
    // every row. Previously this silently created Cow documents keyed off
    // Animal Number instead of rejecting the file.
    const headerRow = ['Animal Number', 'Group Name', 'Yield Yesterday Session 2', 'Yield Yesterday Session 3', 'Yield Today Session 1', 'In Milk', 'Milk Yield Yesterday', 'Cow Id'];
    const dataRows = [
      [16, '3.2', 9.1, 11.7, 5.98, 'Checked', 26.89, ''],
      [17, '3.3', 9.2, 5.6, 6.98, 'Checked', 20.57, ''],
      [18, '3.2', 9.8, 9.2, 8.09, 'Checked', 27.21, ''],
      [19, '3.2', 9.8, 8.7, 9.56, 'Checked', 27.07, ''],
    ];
    savedFixtureBuffer = buildXlsxBuffer(headerRow, dataRows);

    await expect(
      importMilkingFile({ bucketName: 'test-bucket', objectPath: '2026-07-22/delpro.xlsx', organizationId: FAKE_ORG_ID, facilityId: FAKE_FACILITY_ID })
    ).rejects.toThrow(/missing the Cow Id for rows 2, 3, 4, 5\./);

    expect(await MilkingRecord.countDocuments()).toBe(0);
    expect(await Cow.countDocuments()).toBe(0);
  });
});
