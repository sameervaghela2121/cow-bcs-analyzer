const mockImportMilkingFile = jest.fn().mockResolvedValue({ source: 'SCR', recordsInserted: 4 });
jest.mock('../../../milking-data-importer/src/importHandler', () => ({
  importMilkingFile: mockImportMilkingFile,
}));

const mockGetRequestHeaders = jest.fn().mockResolvedValue(new Headers({ Authorization: 'Bearer fake-id-token' }));
const mockGetIdTokenClient = jest.fn().mockResolvedValue({ getRequestHeaders: mockGetRequestHeaders });
jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({ getIdTokenClient: mockGetIdTokenClient })),
}));

const config = require('../../src/config/env');
const { triggerMilkingImport } = require('../../src/services/milkingImporterClient');

describe('milkingImporterClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    config.milking.importerUrl = null;
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('calls importMilkingFile in-process when no MILKING_IMPORTER_URL is configured', async () => {
    config.milking.importerUrl = null;
    const result = await triggerMilkingImport({ bucketName: 'b', objectPath: '2026-07-22/scr.xlsx' });

    expect(mockImportMilkingFile).toHaveBeenCalledWith({ bucketName: 'b', objectPath: '2026-07-22/scr.xlsx' });
    expect(mockGetIdTokenClient).not.toHaveBeenCalled();
    expect(result).toEqual({ source: 'SCR', recordsInserted: 4 });
  });

  it('mints an audienced ID token and POSTs when a URL is configured', async () => {
    config.milking.importerUrl = 'https://bcs-milking-data-importer-xyz.a.run.app';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ source: 'DelPro', recordsInserted: 9 }) });

    const result = await triggerMilkingImport({ bucketName: 'b', objectPath: '2026-07-22/delpro.xlsx' });

    expect(mockImportMilkingFile).not.toHaveBeenCalled();
    expect(mockGetIdTokenClient).toHaveBeenCalledWith('https://bcs-milking-data-importer-xyz.a.run.app');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://bcs-milking-data-importer-xyz.a.run.app');
    expect(options.headers.authorization).toBe('Bearer fake-id-token');
    expect(JSON.parse(options.body)).toEqual({ bucketName: 'b', objectPath: '2026-07-22/delpro.xlsx' });
    expect(result).toEqual({ source: 'DelPro', recordsInserted: 9 });
  });

  it('throws (does not swallow) when the deployed function responds with a non-2xx status', async () => {
    config.milking.importerUrl = 'https://bcs-milking-data-importer-xyz.a.run.app';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });

    await expect(triggerMilkingImport({ bucketName: 'b', objectPath: '2026-07-22/scr.xlsx' })).rejects.toThrow(/500/);
  });
});
