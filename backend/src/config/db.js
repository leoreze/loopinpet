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

export async function query(text, params = []) {
  if (!pool) {
    throw new Error('DATABASE_URL não configurada. Crie backend/.env com a conexão PostgreSQL.');
  }
  return pool.query(text, params);
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
