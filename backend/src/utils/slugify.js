// Turns a display name into a URL/path-safe slug - lowercase, non-alphanumeric
// runs collapsed to a single hyphen, no leading/trailing hyphens.
function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { slugify };
