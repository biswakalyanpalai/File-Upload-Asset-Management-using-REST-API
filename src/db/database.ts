import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

let dbInstance: SqlJsDatabase | null = null;
let initPromise: Promise<SqlJsDatabase> | null = null;

export async function getDb(): Promise<SqlJsDatabase> {
  if (dbInstance) return dbInstance;

  if (!initPromise) {
    initPromise = (async () => {
      const SQL = await initSqlJs({
        locateFile: (file) => {
          const wasmPath = path.resolve(process.cwd(), 'node_modules/sql.js/dist', file);
          if (fs.existsSync(wasmPath)) return wasmPath;
          return file;
        },
      });
      if (fs.existsSync(config.dbPath)) {
        try {
          const fileBuffer = fs.readFileSync(config.dbPath);
          dbInstance = new SQL.Database(fileBuffer);
        } catch (_) {
          dbInstance = new SQL.Database();
        }
      } else {
        dbInstance = new SQL.Database();
      }
      return dbInstance;
    })();
  }

  return initPromise;
}

export function saveDatabase() {
  if (!dbInstance) return;
  try {
    const dir = path.dirname(config.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(config.dbPath, buffer);
  } catch (err) {
    // Best-effort save in serverless environment
  }
}

export async function runAsync(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  const db = await getDb();
  db.run(sql, params);
  const changes = db.getRowsModified();
  saveDatabase();
  return { lastID: 0, changes };
}

export async function getAsync<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  const db = await getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let row: T | undefined = undefined;
  if (stmt.step()) {
    row = stmt.getAsObject() as T;
  }
  stmt.free();
  return row;
}

export async function allAsync<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const db = await getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

export async function initDatabase() {
  await getDb();

  await runAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      storage_used INTEGER DEFAULT 0,
      storage_limit INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      parent_id TEXT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
    );
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      folder_id TEXT NULL,
      name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      hash TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      is_trashed INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
    );
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS file_shares (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      share_token TEXT UNIQUE NOT NULL,
      expires_at TEXT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
    );
  `);
}

export default { getDb, runAsync, getAsync, allAsync, initDatabase };
