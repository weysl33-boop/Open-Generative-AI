// Stable connection-layer entrypoint for services and repositories.
export {
  execute,
  getLastErrorDetails,
  getPgPool,
  healthCheck,
  nowIso,
  query,
  queryMany,
  queryOne,
  randomId,
  withTransaction,
} from './pg.js';
