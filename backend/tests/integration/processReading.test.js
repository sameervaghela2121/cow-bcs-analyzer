const nock = require('nock');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const config = require('../../src/config/env');
const User = require('../../src/models/User');
const Cow = require('../../src/models/Cow');
const Media = require('../../src/models/Media');
const Reading = require('../../src/models/Reading');
const { processReading } = require('../../src/jobs/processReading');

describe('processReading job', () => {
  let user, cow;

  beforeAll(async () => { await connect(); });
  beforeEach(async () => {
    user = await User.create({ email: 'job@example.com', name: 'Job', role: 'staff', status: 'active', passwordHash: 'x' });
    cow = await Cow.create({ cowId: '4417' });
  });
  afterEach(async () => { await clearDatabase(); nock.cleanAll(); });
  afterAll(async () => { await closeDatabase(); });

  async function makeProcessingReading() {
    const media = await Media.create({ storageKey: 'does-not-need-to-exist.jpg', mimeType: 'image/jpeg', size: 10 });
    return Reading.create({ cow: cow._id, media: [media._id], status: 'processing', capturedAt: new Date(), createdBy: user._id });
  }

  it('scores a reading and denormalizes onto the cow when providers agree', async () => {
    nock(config.aiBackendUrl).post('/api/bcs/assess').reply(200, {
      claude: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null },
      gemini: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null },
      openai: { final_bcs: 3.5, confidence: 'High', status: 'success', error_message: null },
    });

    const reading = await makeProcessingReading();
    const { absolutePath } = require('../../src/services/storageService');
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(path.dirname(absolutePath('does-not-need-to-exist.jpg')), { recursive: true });
    fs.writeFileSync(absolutePath('does-not-need-to-exist.jpg'), Buffer.from('fake'));

    await processReading(reading._id.toString());

    const updated = await Reading.findById(reading._id);
    expect(updated.status).toBe('scored');
    expect(updated.score).toBe(3.25);
    expect(updated.confidence).toBe('high');
    expect(updated.flagged).toBe(false);
    expect(updated.reviewStatus).toBe('not_required');
    expect(updated.providerResults).toHaveLength(3);

    const updatedCow = await Cow.findById(cow._id);
    expect(updatedCow.latestScore).toBe(3.25);
    expect(updatedCow.latestBand).toBe('ideal');
    expect(updatedCow.flagged).toBe(false);
  });

  it('sends all photos of a multi-photo reading in a single ai-backend call', async () => {
    const { absolutePath } = require('../../src/services/storageService');
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(path.dirname(absolutePath('multi-a.jpg')), { recursive: true });
    fs.writeFileSync(absolutePath('multi-a.jpg'), Buffer.from('fake-a'));
    fs.writeFileSync(absolutePath('multi-b.jpg'), Buffer.from('fake-b'));

    const mediaA = await Media.create({ storageKey: 'multi-a.jpg', mimeType: 'image/jpeg', size: 10 });
    const mediaB = await Media.create({ storageKey: 'multi-b.jpg', mimeType: 'image/jpeg', size: 10 });
    const reading = await Reading.create({
      cow: cow._id, media: [mediaA._id, mediaB._id], status: 'processing', capturedAt: new Date(), createdBy: user._id,
    });

    let uploadedFileCount = null;
    const scope = nock(config.aiBackendUrl)
      .post('/api/bcs/assess', (body) => {
        uploadedFileCount = (body.match(/name="images"/g) || []).length;
        return true;
      })
      .reply(200, {
        claude: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null },
        gemini: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null },
        openai: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null },
      });

    await processReading(reading._id.toString());

    expect(scope.isDone()).toBe(true);
    expect(uploadedFileCount).toBe(2);

    const updated = await Reading.findById(reading._id);
    expect(updated.status).toBe('scored');
  });

  it('flags the reading as pending review on a sharp drop from the previous reading', async () => {
    const prevMedia = await Media.create({ storageKey: 'prev.jpg', mimeType: 'image/jpeg', size: 10 });
    await Reading.create({
      cow: cow._id, media: [prevMedia._id], status: 'scored', score: 3.5, band: 'ideal', confidence: 'high',
      reviewStatus: 'not_required', capturedAt: new Date(Date.now() - 86400000), createdBy: user._id,
    });
    await Cow.findByIdAndUpdate(cow._id, { latestScore: 3.5, lastScoredAt: new Date(Date.now() - 86400000) });

    nock(config.aiBackendUrl).post('/api/bcs/assess').reply(200, {
      claude: { final_bcs: 2.75, confidence: 'High', status: 'success', error_message: null },
      gemini: { final_bcs: 2.75, confidence: 'High', status: 'success', error_message: null },
      openai: { final_bcs: 2.75, confidence: 'High', status: 'success', error_message: null },
    });

    const reading = await makeProcessingReading();
    const { absolutePath } = require('../../src/services/storageService');
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(path.dirname(absolutePath('does-not-need-to-exist.jpg')), { recursive: true });
    fs.writeFileSync(absolutePath('does-not-need-to-exist.jpg'), Buffer.from('fake'));

    await processReading(reading._id.toString());

    const updated = await Reading.findById(reading._id);
    expect(updated.flagged).toBe(true);
    expect(updated.reviewStatus).toBe('pending');
    expect(updated.flagReason).toMatch(/dropped/i);
  });

  it('marks the reading as failed when every provider errors', async () => {
    nock(config.aiBackendUrl).post('/api/bcs/assess').reply(200, {
      claude: { status: 'error', error_message: 'timeout' },
      gemini: { status: 'error', error_message: 'timeout' },
      openai: { status: 'error', error_message: 'timeout' },
    });

    const reading = await makeProcessingReading();
    const { absolutePath } = require('../../src/services/storageService');
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(path.dirname(absolutePath('does-not-need-to-exist.jpg')), { recursive: true });
    fs.writeFileSync(absolutePath('does-not-need-to-exist.jpg'), Buffer.from('fake'));

    await processReading(reading._id.toString());

    const updated = await Reading.findById(reading._id);
    expect(updated.status).toBe('failed');
    expect(updated.errorMessage).toBeTruthy();
  });
});
