function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  const message = status < 500 ? err.message : 'Internal server error';
  if (status >= 500) console.error(err); // eslint-disable-line no-console
  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
