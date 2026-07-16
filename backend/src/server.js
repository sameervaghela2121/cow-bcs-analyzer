const { createApp } = require('./app');
const { connectDb } = require('./db/connection');
const config = require('./config/env');

async function start() {
  await connectDb(config.mongodbUrl);
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`BCS Tracker backend listening on port ${config.port}`); // eslint-disable-line no-console
  });
}

start();
