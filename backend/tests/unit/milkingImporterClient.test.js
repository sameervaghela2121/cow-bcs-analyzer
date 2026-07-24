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

  it('surfaces the Cloud Function\'s own error message and status (does not swallow) on a non-2xx response', async () => {
    config.milking.importerUrl = 'https://bcs-milking-data-importer-xyz.a.run.app';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'This file is missing the Cow Number for row 3. Please fill in the Cow Number for every row and re-upload the file. No records were imported.' }),
    });

    let caught;
    try {
      await triggerMilkingImport({ bucketName: 'b', objectPath: '2026-07-22/scr.xlsx' });
    } catch (err) {
      caught = err;
    }
    expect(caught.message).toBe(
      'This file is missing the Cow Number for row 3. Please fill in the Cow Number for every row and re-upload the file. No records were imported.'
    );
    expect(caught.status).toBe(400);
  });

  it('falls back to a generic message when the response has no parseable JSON body', async () => {
    config.milking.importerUrl = 'https://bcs-milking-data-importer-xyz.a.run.app';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('not json'); } });

    let caught;
    try {
      await triggerMilkingImport({ bucketName: 'b', objectPath: '2026-07-22/scr.xlsx' });
    } catch (err) {
      caught = err;
    }
    expect(caught.message).toMatch(/500/);
    expect(caught.status).toBe(500);
  });
});
