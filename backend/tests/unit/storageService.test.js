const fs = require('fs');
const path = require('path');
const os = require('os');

describe('storageService', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcs-test-'));
    jest.resetModules();
    process.env.UPLOAD_DIR = tmpDir;
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saves a buffer to disk and returns a storageKey + size', async () => {
    const { saveFile, readFile, absolutePath } = require('../../src/services/storageService');
    const buffer = Buffer.from('fake-image-bytes');
    const { storageKey, size } = await saveFile(buffer, 'photo.jpg');

    expect(size).toBe(buffer.length);
    expect(fs.existsSync(absolutePath(storageKey))).toBe(true);

    const readBack = await readFile(storageKey);
    expect(readBack.equals(buffer)).toBe(true);
  });
});
