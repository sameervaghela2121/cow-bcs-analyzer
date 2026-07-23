function detectFormat(headerRow) {
  const normalized = (headerRow || []).map((h) => String(h || '').trim());
  if (normalized.includes('Cow Number')) return 'SCR';
  if (normalized.includes('Animal Number')) return 'DelPro';
  throw new Error(
    `Unrecognized milking sheet format - header row did not contain "Cow Number" or "Animal Number". Found: ${normalized.join(', ')}`
  );
}

module.exports = { detectFormat };
