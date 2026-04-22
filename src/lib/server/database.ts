import { env } from '$env/dynamic/private';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = resolve(process.cwd(), env.SQLITE_DATABASE_PATH ?? 'data/blog-agent.sqlite');

let database: Database.Database | undefined;

export const getDatabase = () => {
  if (!database) {
    mkdirSync(dirname(databasePath), { recursive: true });

    database = new Database(databasePath);
    database.pragma('journal_mode = WAL');
    database.pragma('foreign_keys = ON');

    database.exec(`
      CREATE TABLE IF NOT EXISTS log_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
        message TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  return database;
};
