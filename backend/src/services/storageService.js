const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');

function absolutePath(storageKey) {
  return path.join(path.resolve(config.uploadDir), storageKey);
}

async function saveFile(buffer, originalName) {
  const dir = path.resolve(config.uploadDir);
  await fsp.mkdir(dir, { recursive: true });
  const ext = path.extname(originalName || '') || '';
  const storageKey = `${uuidv4()}${ext}`;
  await fsp.writeFile(path.join(dir, storageKey), buffer);
  return { storageKey, size: buffer.length };
}

async function readFile(storageKey) {
  return fsp.readFile(absolutePath(storageKey));
}

module.exports = { saveFile, readFile, absolutePath };
