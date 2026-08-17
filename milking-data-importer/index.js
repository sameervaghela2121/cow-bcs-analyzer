const functions = require('@google-cloud/functions-framework');
const { importMilkingFile } = require('./src/importHandler');

functions.http('importMilkingData', async (req, res) => {
  const { bucketName, objectPath, milkingDate, facilityId } = req.body || {};

  if (!bucketName || !objectPath || !milkingDate || !facilityId) {
    res.status(400).json({ error: 'bucketName, objectPath, milkingDate and facilityId are required' });
    return;
  }

  try {
    const result = await importMilkingFile({ bucketName, objectPath, milkingDate, facilityId });
    res.status(200).json(result);
  } catch (err) {
    console.error(`importMilkingFile failed for ${bucketName}/${objectPath}:`, err);
    // err.status = 400 marks a bad-file problem (missing/unrecognized data) -
    // its message is meaningful and safe to relay to the end user as-is.
    // Anything else is a genuine system fault, still reported as 500.
    res.status(err.status || 500).json({ error: err.message });
  }
});
