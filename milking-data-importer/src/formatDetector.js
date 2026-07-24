const { MilkingValidationError } = require('./errors');

function detectFormat(headerRow) {
  const normalized = (headerRow || []).map((h) => String(h || '').trim());
  if (normalized.includes('Cow Number')) return 'SCR';
  if (normalized.includes('Animal Number')) return 'DelPro';
  throw new MilkingValidationError(
    'This file has no "Cow Number" or "Animal Number" column, so we can\'t tell which system it came from. Please check the file and try again.'
  );
}

module.exports = { detectFormat };
