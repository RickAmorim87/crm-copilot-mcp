import 'dotenv/config';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { createMemoryRepository, createMongoRepository } from './repository.js';

const config = loadConfig();
const repo = config.mongoUri
  ? await createMongoRepository({ uri: config.mongoUri, dbName: config.mongoDb })
  : createMemoryRepository();

createApp({ config, repo }).listen(config.port, () => {
  console.log(`Customers API on :${config.port} (storage: ${config.mongoUri ? 'MongoDB' : 'in-memory'})`);
});
