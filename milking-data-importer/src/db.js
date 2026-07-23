const mongoose = require('mongoose');

// Lazily connect on first invocation (cold start), reuse the same connection
// across warm invocations - re-calling mongoose.connect() on every request
// would open a new connection pool each time instead of reusing one.
let connectionPromise;

function getConnection() {
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGODB_URL);
  }
  return connectionPromise;
}

module.exports = { getConnection };
