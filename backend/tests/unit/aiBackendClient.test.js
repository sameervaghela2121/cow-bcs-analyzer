const nock = require('nock');
const config = require('../../src/config/env');

describe('aiBackendClient.assessImage', () => {
  afterEach(() => nock.cleanAll());

  it('posts a single image to /api/bcs/assess and returns the parsed response', async () => {
    const mockResponse = {
      claude: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null, recommendation: 'ok' },
      gemini: { final_bcs: 3.5, confidence: 'High', status: 'success', error_message: null, recommendation: 'ok' },
      openai: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null, recommendation: 'ok' },
    };
    nock(config.aiBackendUrl).post('/api/bcs/assess').reply(200, mockResponse);

    const { assessImage } = require('../../src/services/aiBackendClient');
    const result = await assessImage({ images: [{ buffer: Buffer.from('fake'), mimeType: 'image/jpeg', filename: 'cow.jpg' }] });

    expect(result).toEqual(mockResponse);
  });

  it('posts all images of a batch in a single request', async () => {
    const mockResponse = {
      claude: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null },
      gemini: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null },
      openai: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null },
    };
    let uploadedFileCount = null;
    nock(config.aiBackendUrl)
      .post('/api/bcs/assess', (body) => {
        uploadedFileCount = (body.match(/name="images"/g) || []).length;
        return true;
      })
      .reply(200, mockResponse);

    const { assessImage } = require('../../src/services/aiBackendClient');
    const result = await assessImage({
      images: [
        { buffer: Buffer.from('fake-a'), mimeType: 'image/jpeg', filename: 'front.jpg' },
        { buffer: Buffer.from('fake-b'), mimeType: 'image/jpeg', filename: 'side.jpg' },
      ],
    });

    expect(result).toEqual(mockResponse);
    expect(uploadedFileCount).toBe(2);
  });

  it('throws a normalized error when ai-backend returns a 500', async () => {
    nock(config.aiBackendUrl).post('/api/bcs/assess').reply(500, { detail: 'All providers failed' });

    const { assessImage } = require('../../src/services/aiBackendClient');
    await expect(
      assessImage({ images: [{ buffer: Buffer.from('fake'), mimeType: 'image/jpeg', filename: 'cow.jpg' }] })
    ).rejects.toThrow();
  });
});
