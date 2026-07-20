const mockCompressAndStoreVariants = jest.fn().mockResolvedValue({ variants: [] });
jest.mock('../../../image-compressor/src/compress', () => ({
  compressAndStoreVariants: mockCompressAndStoreVariants,
}));

// The real library returns a Fetch API Headers instance, not a plain
// object - using the real Headers class here is what caught the original
// bug (a plain-object mock let {...headers} silently pass with nothing in it).
const mockGetRequestHeaders = jest.fn().mockResolvedValue(new Headers({ Authorization: 'Bearer fake-id-token' }));
const mockGetIdTokenClient = jest.fn().mockResolvedValue({ getRequestHeaders: mockGetRequestHeaders });
jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({ getIdTokenClient: mockGetIdTokenClient })),
}));

const config = require('../../src/config/env');
const { triggerCompression } = require('../../src/services/imageCompressorClient');

describe('imageCompressorClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    config.imageCompressor.url = null;
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('calls compressAndStoreVariants in-process when no IMAGE_COMPRESSOR_URL is configured', async () => {
    config.imageCompressor.url = null;
    await triggerCompression({ bucketName: 'b', objectPath: '3124/ts/a.jpg' });

    expect(mockCompressAndStoreVariants).toHaveBeenCalledWith({ bucketName: 'b', objectPath: '3124/ts/a.jpg' });
    expect(mockGetIdTokenClient).not.toHaveBeenCalled();
  });

  it('mints an audienced ID token via GoogleAuth and POSTs it as a bearer token when a URL is configured', async () => {
    config.imageCompressor.url = 'https://bcs-image-compressor-xyz.a.run.app';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });

    await triggerCompression({ bucketName: 'b', objectPath: '3124/ts/a.jpg' });

    expect(mockCompressAndStoreVariants).not.toHaveBeenCalled();
    // Same GoogleAuth resolution gcsService uses (key file locally, attached
    // service account on Cloud Run) - audienced to the function's own URL.
    expect(mockGetIdTokenClient).toHaveBeenCalledWith('https://bcs-image-compressor-xyz.a.run.app');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://bcs-image-compressor-xyz.a.run.app');
    // Headers.entries() lowercases names - real HTTP treats this as
    // case-insensitive, but assert what's actually produced.
    expect(options.headers.authorization).toBe('Bearer fake-id-token');
    expect(JSON.parse(options.body)).toEqual({ bucketName: 'b', objectPath: '3124/ts/a.jpg' });
  });

  it('throws if the deployed function responds with a non-2xx status', async () => {
    config.imageCompressor.url = 'https://bcs-image-compressor-xyz.a.run.app';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });

    await expect(triggerCompression({ bucketName: 'b', objectPath: '3124/ts/a.jpg' })).rejects.toThrow(/500/);
  });
});
