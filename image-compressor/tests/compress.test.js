const sharp = require('sharp');

const savedFiles = new Map();
const mockFile = jest.fn((objectPath) => ({
  download: jest.fn(async () => {
    if (!savedFiles.has('__original__')) throw new Error(`no fixture uploaded for ${objectPath}`);
    return [savedFiles.get('__original__')];
  }),
  save: jest.fn(async (buffer, options) => {
    savedFiles.set(objectPath, { buffer, options });
  }),
}));
const mockBucket = jest.fn(() => ({ file: mockFile }));

jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({ bucket: mockBucket })),
}));

const { compressAndStoreVariants } = require('../src/compress');
const { VARIANTS } = require('../src/config');

describe('compressAndStoreVariants', () => {
  beforeEach(async () => {
    savedFiles.clear();
    mockFile.mockClear();
    // A source PNG bigger than every variant's max dimension, so resize
    // actually has to shrink it rather than being a no-op.
    const original = await sharp({
      create: { width: 1000, height: 800, channels: 3, background: { r: 10, g: 200, b: 10 } },
    })
      .png()
      .toBuffer();
    savedFiles.set('__original__', original);
  });

  it('writes a correctly-sized JPEG variant per config entry, at the deterministic path', async () => {
    const objectPath = '3124/2026-07-16T00-00-00-000Z/cow.png';
    const result = await compressAndStoreVariants({ bucketName: 'test-bucket', objectPath });

    expect(mockBucket).toHaveBeenCalledWith('test-bucket');
    expect(result.variants).toHaveLength(VARIANTS.length);

    for (const variant of VARIANTS) {
      const expectedPath = `3124/2026-07-16T00-00-00-000Z/${variant.name}/cow.jpg`;
      expect(result.variants).toContainEqual({ name: variant.name, objectPath: expectedPath });

      const saved = savedFiles.get(expectedPath);
      expect(saved).toBeTruthy();
      expect(saved.options.contentType).toBe('image/jpeg');
      expect(saved.options.metadata.cacheControl).toBe('public, max-age=31536000, immutable');

      const meta = await sharp(saved.buffer).metadata();
      expect(meta.format).toBe('jpeg');
      // 1000x800 source, fit:'inside' -> width hits the cap, height scales down proportionally.
      expect(meta.width).toBe(variant.maxDimension);
      expect(meta.height).toBeLessThanOrEqual(variant.maxDimension);
    }
  });

  it('never enlarges an original smaller than a variant\'s max dimension', async () => {
    const tinyOriginal = await sharp({
      create: { width: 50, height: 40, channels: 3, background: { r: 10, g: 200, b: 10 } },
    })
      .png()
      .toBuffer();
    savedFiles.set('__original__', tinyOriginal);

    await compressAndStoreVariants({ bucketName: 'test-bucket', objectPath: '3124/ts/small.png' });

    const saved = savedFiles.get(`3124/ts/${VARIANTS[0].name}/small.jpg`);
    const meta = await sharp(saved.buffer).metadata();
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(40);
  });
});
