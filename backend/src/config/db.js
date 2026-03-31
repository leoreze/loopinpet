import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

const shouldUseSsl = env.databaseUrl && /render\.com|render\.internal|railway|supabase|neon/i.test(env.databaseUrl);

export const pool = env.databaseUrl
  ? new Pool({
      connectionString: env.databaseUrl,
      ssl: shouldUseSsl ? { rejectUnauthorized: false } : false
    })
  : null;

const DEADLOCK_ERROR_CODES = new Set(['40P01', '40001']);
const TRANSIENT_LOCK_ERROR_CODES = new Set(['55P03']);
const MAX_QUERY_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 120;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryDbError(error) {
  const code = String(error?.code || '').trim();
  return DEADLOCK_ERROR_CODES.has(code) || TRANSIENT_LOCK_ERROR_CODES.has(code);
}

function buildRetryDelay(attempt) {
  const jitter = Math.floor(Math.random() * 60);
  return BASE_RETRY_DELAY_MS * attempt + jitter;
}

async function runQueryWithRetry(executor, text, params = []) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_QUERY_RETRIES; attempt += 1) {
    try {
      return await executor();
    } catch (error) {
      lastError = error;
      if (!shouldRetryDbError(error) || attempt >= MAX_QUERY_RETRIES) {
        throw error;
      }
      const delay = buildRetryDelay(attempt);
      console.warn('[db] transient query failure, retrying', {
        attempt,
        maxAttempts: MAX_QUERY_RETRIES,
        delay,
        code: error?.code || null,
        message: error?.message || null,
        preview: typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, 160) : null,
        paramsCount: Array.isArray(params) ? params.length : 0
      });
      await sleep(delay);
    }
  }

  throw lastError;
}

export async function query(text, params = []) {
  if (!pool) {
    throw new Error('DATABASE_URL não configurada. Crie backend/.env com a conexão PostgreSQL.');
  }
  return runQueryWithRetry(() => pool.query(text, params), text, params);
}

export async function withClient(callback) {
  if (!pool) {
    throw new Error('DATABASE_URL não configurada. Crie backend/.env com a conexão PostgreSQL.');
  }
  const client = await pool.connect();

  const safeClient = {
    query: (text, params = []) => runQueryWithRetry(() => client.query(text, params), text, params),
    rawQuery: (text, params = []) => client.query(text, params)
  };

  try {
    return await callback(safeClient, client);
  } finally {
    client.release();
  }
}

export async function healthcheckDb() {
  if (!pool) {
    return {
      connected: false,
      reason: 'DATABASE_URL não configurada',
      envFileLoaded: env.loadedEnvFile || null
    };
  }

  try {
    await pool.query('select 1');
    return {
      connected: true,
      envFileLoaded: env.loadedEnvFile || null
    };
  } catch (error) {
    return {
      connected: false,
      reason: error.message,
      envFileLoaded: env.loadedEnvFile || null
    };
  }
}
