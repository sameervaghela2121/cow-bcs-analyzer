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

function buildXlsxBuffer(headerRow, dataRows) {
  const sheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

describe('importMilkingFile', () => {
  it('parses an SCR sheet and inserts one standalone MilkingRecord per real row', async () => {
    const { importMilkingFile } = require('../src/importHandler');
    const MilkingRecord = require('../src/models/MilkingRecord');

    const headerRow = ['Cow Number', 'Current Group', 'Shift Yield', 'Date', 'Shift', 'Shift Yield -1', 'Shift Yield -2', 'Shift Yield -3'];
    const dataRows = [
      [1, '2.2A', 1.1, '10-07-2026', 'Morning', 2.8, 8.3, ''],
      [2, '2.2A', 9.5, '10-07-2026', 'Morning', 8.2, 6.2, 0],
      [3, '1.2A', 6.9, '10-07-2026', 'Morning', 4.1, 6, 5.4],
      [4, '1.3', 4.9, '10-07-2026', 'Morning', 4.7, 3.5, 3.9],
      [4, '', 22.29, '', '', 19.75, 24.01, ''], // totals row - excluded
    ];
    savedFixtureBuffer = buildXlsxBuffer(headerRow, dataRows);

    const result = await importMilkingFile({ bucketName: 'test-bucket', objectPath: '2026-07-22/scr.xlsx' });

    expect(result).toEqual({ source: 'SCR', recordsInserted: 4 });
    expect(mockBucket).toHaveBeenCalledWith('test-bucket');
    expect(await MilkingRecord.countDocuments()).toBe(4);

    const record = await MilkingRecord.findOne({ cowNumber: '2' });
    expect(record.source).toBe('SCR');
    expect(record.shiftYield1).toBe(8.2);
    expect(record.sourceObjectPath).toBe('2026-07-22/scr.xlsx');
    expect(record.toObject().cow).toBeUndefined();
  });

  it('parses a DelPro sheet and inserts one standalone MilkingRecord per row', async () => {
    const { importMilkingFile } = require('../src/importHandler');
    const MilkingRecord = require('../src/models/MilkingRecord');

    const headerRow = ['Animal Number', 'Group Name', 'Yield Yesterday Session 2', 'Yield Yesterday Session 3', 'Yield Today Session 1', 'In Milk', 'Milk Yield Yesterday'];
    const dataRows = [
      [11, '3.1 B', 9.1, '', '', 'Checked', 9.06],
      [12, '3.3', 9.5, 4.9, 3.45, 'Checked', 17.67],
      [13, '3.4', 9.6, 6.8, 5.03, 'Checked', 22.27],
      [14, '3.3', 9, 6.9, 5.12, 'Checked', 22.52],
      [15, '3.3', 9.4, 6, 5.36, 'Checked', 22.51],
      [16, '3.2', 9.1, 11.7, 5.98, 'Checked', 26.89],
      [17, '3.3', 9.2, 5.6, 6.98, 'Checked', 20.57],
      [18, '3.2', 9.8, 9.2, 8.09, 'Checked', 27.21],
      [19, '3.2', 9.8, 8.7, 9.56, 'Checked', 27.07],
    ];
    savedFixtureBuffer = buildXlsxBuffer(headerRow, dataRows);

    const result = await importMilkingFile({ bucketName: 'test-bucket', objectPath: '2026-07-22/delpro.xlsx' });

    expect(result).toEqual({ source: 'DelPro', recordsInserted: 9 });
    expect(await MilkingRecord.countDocuments()).toBe(9);

    const record = await MilkingRecord.findOne({ animalNumber: '12' });
    expect(record.source).toBe('DelPro');
    expect(record.milkYieldYesterday).toBe(17.67);
    expect(record.toObject().inMilk).toBeUndefined();
    expect(record.toObject().cow).toBeUndefined();
  });
});
