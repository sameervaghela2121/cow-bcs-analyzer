const mockGetSignedUrl = jest.fn().mockResolvedValue(['https://storage.googleapis.com/signed-put-url']);
const mockFile = jest.fn(() => ({ getSignedUrl: mockGetSignedUrl }));
const mockBucket = jest.fn(() => ({ file: mockFile }));

jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({ bucket: mockBucket })),
}));

const {
  sanitizeBatchTimestamp,
  buildObjectPath,
  toGsUri,
  fromGsUri,
  generateUploadUrl,
} = require('../../src/services/gcsService');

describe('gcsService', () => {
  afterEach(() => jest.clearAllMocks());

  it('sanitizes an ISO timestamp into a URL-safe path segment', () => {
    const ts = sanitizeBatchTimestamp(new Date('2026-07-16T10:15:30.123Z'));
    expect(ts).toBe('2026-07-16T10-15-30-123Z');
  });

  it('builds the cowsId/batchTimestamp/filename object path', () => {
    const objectPath = buildObjectPath({ cowsId: '3124', batchTimestamp: '2026-07-16T10-15-30-123Z', filename: 'a.jpg' });
    expect(objectPath).toBe('3124/2026-07-16T10-15-30-123Z/a.jpg');
  });

  it('converts an object path to a gs:// URI and back', () => {
    const objectPath = '3124/2026-07-16T10-15-30-123Z/a.jpg';
    const uri = toGsUri(objectPath);
    expect(uri).toMatch(/^gs:\/\/.+\/3124\/2026-07-16T10-15-30-123Z\/a\.jpg$/);
    expect(fromGsUri(uri).objectPath).toBe(objectPath);
  });

  it('generates a v4 signed PUT URL bound to the given content type', async () => {
    const url = await generateUploadUrl({ objectPath: '3124/ts/a.jpg', contentType: 'image/jpeg' });
    expect(url).toBe('https://storage.googleapis.com/signed-put-url');
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ version: 'v4', action: 'write', contentType: 'image/jpeg' })
    );
  });
});
