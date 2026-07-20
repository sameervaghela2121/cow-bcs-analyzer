const sharp = require('sharp');
const { Storage } = require('@google-cloud/storage');
const { VARIANTS } = require('./config');
const { buildVariantObjectPath } = require('./paths');

let storageClient;

function getStorage() {
  if (!storageClient) {
    storageClient = new Storage();
  }
  return storageClient;
}

async function compressAndStoreVariants({ bucketName, objectPath }) {
  const bucket = getStorage().bucket(bucketName);
  const [originalBuffer] = await bucket.file(objectPath).download();

  const variants = [];
  for (const variant of VARIANTS) {
    const variantBuffer = await sharp(originalBuffer)
      .resize({
        width: variant.maxDimension,
        height: variant.maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: variant.quality })
      .toBuffer();

    const variantObjectPath = buildVariantObjectPath(objectPath, variant.name);
    await bucket.file(variantObjectPath).save(variantBuffer, {
      contentType: 'image/jpeg',
      metadata: {
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    variants.push({ name: variant.name, objectPath: variantObjectPath });
  }

  return { variants };
}

module.exports = { compressAndStoreVariants };
