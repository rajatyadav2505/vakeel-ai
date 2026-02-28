import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'nyaya-mitra.db');

// Ensure the data directory exists before opening the database
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Create the raw better-sqlite3 connection with WAL mode for better concurrency
const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Create the Drizzle ORM instance with full schema for relational queries
export const db = drizzle(sqlite, { schema });

// Export the raw database for advanced operations or direct SQL
export const rawDb = sqlite;

// Re-export schema for convenience
export { schema };
