const path = require('path');

function buildVariantObjectPath(originalObjectPath, variantName) {
  const dir = path.posix.dirname(originalObjectPath);
  const ext = path.posix.extname(originalObjectPath);
  const base = path.posix.basename(originalObjectPath, ext);
  return `${dir}/${variantName}/${base}.jpg`;
}

module.exports = { buildVariantObjectPath };
