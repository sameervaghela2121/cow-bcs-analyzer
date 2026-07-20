const path = require('path');

// Mirrors image-compressor/src/config.js + paths.js. Deliberately duplicated
// rather than required across the package boundary: backend and
// image-compressor are independently built and deployed (backend's
// Dockerfile only ever COPYs backend/src/), so a relative require reaching
// into the sibling package resolves locally (whole monorepo on disk) but
// has no equivalent file inside the built container image - which crashes
// the server at startup before it can bind to PORT.
const THUMBNAIL = { name: '300X300' };
const DISPLAY = { name: '600X600' };

function buildVariantObjectPath(originalObjectPath, variantName) {
  const dir = path.posix.dirname(originalObjectPath);
  const ext = path.posix.extname(originalObjectPath);
  const base = path.posix.basename(originalObjectPath, ext);
  return `${dir}/${variantName}/${base}.jpg`;
}

module.exports = { THUMBNAIL, DISPLAY, buildVariantObjectPath };
