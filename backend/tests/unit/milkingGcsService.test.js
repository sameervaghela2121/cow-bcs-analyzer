const mockGetSignedUrl = jest.fn().mockResolvedValue(['https://storage.googleapis.com/signed-put-url']);
const mockFile = jest.fn(() => ({ getSignedUrl: mockGetSignedUrl }));
const mockBucket = jest.fn(() => ({ file: mockFile }));

jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({ bucket: mockBucket })),
}));

const config = require('../../src/config/env');
const {
  buildDateFolder,
  buildMilkingObjectPath,
  toMilkingGsUri,
  generateMilkingUploadUrl,
} = require('../../src/services/milkingGcsService');

describe('milkingGcsService', () => {
  afterEach(() => jest.clearAllMocks());

  it('builds a YYYY-MM-DD date folder', () => {
    expect(buildDateFolder(new Date('2026-07-22T10:15:30.123Z'))).toBe('2026-07-22');
  });

  it('builds the dateFolder/filename object path', () => {
    const objectPath = buildMilkingObjectPath({ dateFolder: '2026-07-22', filename: 'scr-2026-07-22.xlsx' });
    expect(objectPath).toBe('2026-07-22/scr-2026-07-22.xlsx');
  });

  it('rejects an unsafe dateFolder or filename', () => {
    expect(() => buildMilkingObjectPath({ dateFolder: '../etc', filename: 'a.xlsx' })).toThrow();
    expect(() => buildMilkingObjectPath({ dateFolder: '2026-07-22', filename: '../../a.xlsx' })).toThrow();
  });

  it('converts an object path to a gs:// URI in the milking bucket', () => {
    const objectPath = '2026-07-22/scr.xlsx';
    expect(toMilkingGsUri(objectPath)).toBe(`gs://${config.milking.bucketName}/${objectPath}`);
  });

  it('generates a v4 signed PUT URL against the milking bucket, bound to the given content type', async () => {
    const contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const url = await generateMilkingUploadUrl({ objectPath: '2026-07-22/scr.xlsx', contentType });
    expect(url).toBe('https://storage.googleapis.com/signed-put-url');
    expect(mockBucket).toHaveBeenCalledWith(config.milking.bucketName);
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ version: 'v4', action: 'write', contentType })
    );
  });
});
