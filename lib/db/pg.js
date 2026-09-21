import 'server-only';

import crypto from 'node:crypto';
import pg from 'pg';
import {
  isProductionDatabaseName,
  looksLikeWriteSql,
  overrideHint,
  writeGuardApplies,
} from './write-policy.js';

const { Pool } = pg;
const SEARCH_PATH = 'ai_studio, ops_bill, auth_usr, sys_core, public';
const DEFAULT_MAX = 20;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_STATEMENT_TIMEOUT_MS = 15_000;

let pool;
let productionTargetProbe;

function databaseError(message, cause) {
  const error = new Error(cause?.message ? `${message}: ${cause.message}` : message);
  error.code = cause?.code || 'DATABASE_ERROR';
  error.cause = cause;
  return error;
}

async function resolveTargetDatabaseName() {
  const client = await getPgPool().connect();
  try {
    const { rows } = await client.query('SELECT current_database() AS database');
    return rows[0]?.database || null;
  } finally {
    client.release();
  }
}

// The guard is evaluated per write rather than cached at module load, because a
// script may set or clear the override flags before it reaches the database.
async function assertWriteAllowed(sqlText) {
  if (!looksLikeWriteSql(sqlText)) return;
  if (!writeGuardApplies()) return;
  if (!productionTargetProbe) {
    productionTargetProbe = resolveTargetDatabaseName().catch((error) => {
      productionTargetProbe = undefined;
      throw databaseError('[db-guard] Cannot verify the target database, so refusing to write.', error);
    });
  }
  const database = await productionTargetProbe;
  if (!isProductionDatabaseName(database)) return;
  throw databaseError(`[db-guard] Refusing to write to the live site's "${database}" database. ${overrideHint(database)}`, { code: 'PRODUCTION_DB_WRITE_REFUSED' });
}

function requireDatabaseUrl() {
  const value = String(process.env.DATABASE_URL || '').trim();
  if (!value) {
    throw databaseError('DATABASE_URL is required; PostgreSQL 16 is the only supported database.', { code: 'DATABASE_URL_REQUIRED' });
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw databaseError('DATABASE_URL must be a valid PostgreSQL connection URL.', { code: 'DATABASE_URL_INVALID', cause: error });
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw databaseError('DATABASE_URL must use the postgres:// or postgresql:// scheme.', { code: 'DATABASE_URL_INVALID' });
  }

  return value;
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeErrorDetails(error) {
  return {
    code: error?.code || 'DATABASE_ERROR',
    constraint: error?.constraint,
    table: error?.table,
    column: error?.column,
    detail: error?.detail && !/password|secret|token|authorization|connection|string/i.test(error.detail)
      ? error.detail
      : undefined,
  };
}

async function configureClient(client, { local = false } = {}) {
  const keyword = local ? 'SET LOCAL' : 'SET';
  await client.query(`${keyword} search_path TO ${SEARCH_PATH}`);
  if (local) {
    await client.query(`${keyword} statement_timeout = '${toPositiveInt(process.env.PG_STATEMENT_TIMEOUT_MS, DEFAULT_STATEMENT_TIMEOUT_MS)}ms'`);
    await client.query(`${keyword} lock_timeout = '${toPositiveInt(process.env.PG_LOCK_TIMEOUT_MS, 5_000)}ms'`);
    await client.query(`${keyword} idle_in_transaction_session_timeout = '${toPositiveInt(process.env.PG_IDLE_TRANSACTION_TIMEOUT_MS, 30_000)}ms'`);
  }
}

export function getPgPool() {
  const connectionString = requireDatabaseUrl();
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: toPositiveInt(process.env.PG_MAX_CONNECTIONS, DEFAULT_MAX),
      idleTimeoutMillis: toPositiveInt(process.env.PG_IDLE_TIMEOUT_MS, DEFAULT_IDLE_TIMEOUT_MS),
      connectionTimeoutMillis: toPositiveInt(process.env.PG_CONNECTION_TIMEOUT_MS, DEFAULT_CONNECTION_TIMEOUT_MS),
      statement_timeout: toPositiveInt(process.env.PG_STATEMENT_TIMEOUT_MS, DEFAULT_STATEMENT_TIMEOUT_MS),
      query_timeout: toPositiveInt(process.env.PG_QUERY_TIMEOUT_MS, DEFAULT_STATEMENT_TIMEOUT_MS),
      application_name: process.env.PG_APPLICATION_NAME || 'koyosim',
      maxUses: toPositiveInt(process.env.PG_MAX_USES, 7_500),
    });

    pool.on('error', (error) => {
      console.error('[PostgreSQL pool] idle client error', safeErrorDetails(error));
    });
  }
  return pool;
}

async function withClient(callback) {
  const client = await getPgPool().connect();
  try {
    await configureClient(client);
    return await callback(client);
  } catch (error) {
    throw databaseError('PostgreSQL operation failed.', error);
  } finally {
    client.release();
  }
}

function resultOf(result) {
  const finalResult = Array.isArray(result) ? result[result.length - 1] : result;
  return {
    rows: (finalResult?.rows || []).map((row) => ({ ...row })),
    rowCount: finalResult?.rowCount || 0,
    command: finalResult?.command,
    fields: finalResult?.fields,
  };
}

export async function query(sqlText, params = []) {
  if (typeof sqlText !== 'string' || !sqlText.trim()) throw new TypeError('sqlText must be a non-empty string.');
  if (!Array.isArray(params)) throw new TypeError('PostgreSQL parameters must be an array.');
  await assertWriteAllowed(sqlText);
  return withClient((client) => client.query(sqlText, params).then(resultOf));
}

export async function queryOne(sqlText, params = []) {
  const result = await query(sqlText, params);
  return result.rows[0] || null;
}

export async function queryMany(sqlText, params = []) {
  const result = await query(sqlText, params);
  return result.rows;
}

export async function execute(sqlText, params = []) {
  const result = await query(sqlText, params);
  return result.rowCount;
}

export async function withTransaction(callback) {
  if (typeof callback !== 'function') throw new TypeError('withTransaction requires a callback.');
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    await configureClient(client, { local: true });
    const transaction = {
      query: async (sqlText, params = []) => {
        await assertWriteAllowed(sqlText);
        return resultOf(await client.query(sqlText, params));
      },
      queryOne: async (sqlText, params = []) => {
        await assertWriteAllowed(sqlText);
        const result = resultOf(await client.query(sqlText, params));
        return result.rows[0] ? { ...result.rows[0] } : null;
      },
      queryMany: async (sqlText, params = []) => {
        await assertWriteAllowed(sqlText);
        const result = resultOf(await client.query(sqlText, params));
        return result.rows.map((row) => ({ ...row }));
      },
      execute: async (sqlText, params = []) => {
        await assertWriteAllowed(sqlText);
        const result = resultOf(await client.query(sqlText, params));
        return result.rowCount || 0;
      },
    };
    const value = await callback(transaction);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch (rollbackError) { console.error('[PostgreSQL transaction] rollback failed', safeErrorDetails(rollbackError)); }
    throw databaseError('PostgreSQL transaction failed.', error);
  } finally {
    client.release();
  }
}

export async function healthCheck() {
  const poolInstance = getPgPool();
  const startedAt = Date.now();
  const result = await queryOne('SELECT 1 AS ok, current_database() AS database, current_user AS user');
  return {
    ok: result?.ok === 1,
    latencyMs: Date.now() - startedAt,
    pool: { total: poolInstance.totalCount, idle: poolInstance.idleCount, waiting: poolInstance.waitingCount, max: poolInstance.options.max },
    database: result?.database || null,
    user: result?.user || null,
  };
}

export async function closePgPool() {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
}

export function getLastErrorDetails(error) { return safeErrorDetails(error); }
export function nowIso() { return new Date().toISOString(); }
export function randomId(prefix = 'id') { return `${prefix}_${crypto.randomBytes(12).toString('hex')}`; }
