const functions = require('@google-cloud/functions-framework');
const { compressAndStoreVariants } = require('./src/compress');

functions.http('compressImage', async (req, res) => {
  const { bucketName, objectPath } = req.body || {};

  if (!bucketName || !objectPath) {
    res.status(400).json({ error: 'bucketName and objectPath are required' });
    return;
  }

  try {
    const result = await compressAndStoreVariants({ bucketName, objectPath });
    res.status(200).json(result);
  } catch (err) {
    console.error(`compressAndStoreVariants failed for ${bucketName}/${objectPath}:`, err);
    res.status(500).json({ error: err.message });
  }
});
