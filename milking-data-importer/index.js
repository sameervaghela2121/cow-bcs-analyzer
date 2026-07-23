const functions = require('@google-cloud/functions-framework');
const { importMilkingFile } = require('./src/importHandler');

functions.http('importMilkingData', async (req, res) => {
  const { bucketName, objectPath } = req.body || {};

  if (!bucketName || !objectPath) {
    res.status(400).json({ error: 'bucketName and objectPath are required' });
    return;
  }

  try {
    const result = await importMilkingFile({ bucketName, objectPath });
    res.status(200).json(result);
  } catch (err) {
    console.error(`importMilkingFile failed for ${bucketName}/${objectPath}:`, err);
    res.status(500).json({ error: err.message });
  }
});
