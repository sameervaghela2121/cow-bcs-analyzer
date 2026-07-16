const nock = require('nock');
const config = require('../../src/config/env');

describe('aiBackendClient.assessImage', () => {
  afterEach(() => nock.cleanAll());

  it('posts the image to /api/bcs/assess and returns the parsed response', async () => {
    const mockResponse = {
      claude: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null, recommendation: 'ok' },
      gemini: { final_bcs: 3.5, confidence: 'High', status: 'success', error_message: null, recommendation: 'ok' },
      openai: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null, recommendation: 'ok' },
    };
    nock(config.aiBackendUrl).post('/api/bcs/assess').reply(200, mockResponse);

    const { assessImage } = require('../../src/services/aiBackendClient');
    const result = await assessImage({ buffer: Buffer.from('fake'), mimeType: 'image/jpeg', filename: 'cow.jpg' });

    expect(result).toEqual(mockResponse);
  });

  it('throws a normalized error when ai-backend returns a 500', async () => {
    nock(config.aiBackendUrl).post('/api/bcs/assess').reply(500, { detail: 'All providers failed' });

    const { assessImage } = require('../../src/services/aiBackendClient');
    await expect(
      assessImage({ buffer: Buffer.from('fake'), mimeType: 'image/jpeg', filename: 'cow.jpg' })
    ).rejects.toThrow();
  });
});
