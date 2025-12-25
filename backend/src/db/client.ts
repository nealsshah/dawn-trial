import { Pool, PoolClient, QueryResultRow } from 'pg';
import path from 'path';
import dotenv from 'dotenv';

// Load .env files for local development
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Use DATABASE_URL from environment, fallback to Docker for local dev
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/trades';

// Check if we're connecting to a cloud database (Neon, Supabase, etc.)
const isCloudDB = DATABASE_URL.includes('neon.tech') || 
                  DATABASE_URL.includes('supabase') || 
                  DATABASE_URL.includes('amazonaws') ||
                  process.env.NODE_ENV === 'production';

console.log('[DB] Connecting to:', DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
console.log('[DB] SSL enabled:', isCloudDB);

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isCloudDB ? { rejectUnauthorized: false } : false,
});

// Test connection on startup
pool.on('connect', () => {
  console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

export const db = {
  query: <T extends QueryResultRow = any>(text: string, params?: any[]) => pool.query<T>(text, params),
  getClient: (): Promise<PoolClient> => pool.connect(),
  pool,
};

export default db;

