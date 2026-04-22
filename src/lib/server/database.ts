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

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        ingress TEXT,
        body TEXT NOT NULL,
        frontmatter_json TEXT NOT NULL DEFAULT '{}',
        tags_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL CHECK (
          status IN ('synced', 'draft', 'approved', 'committed', 'rejected')
        ),
        github_path TEXT,
        github_sha TEXT,
        source TEXT NOT NULL CHECK (source IN ('github', 'generated', 'manual')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS generation_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER,
        model TEXT NOT NULL,
        prompt TEXT NOT NULL,
        request_json TEXT NOT NULL,
        response_json TEXT NOT NULL,
        source_post_slugs_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS token_usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        stage TEXT NOT NULL,
        model TEXT NOT NULL,
        response_id TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        details_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS post_status_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
      CREATE INDEX IF NOT EXISTS idx_posts_source ON posts(source);
      CREATE INDEX IF NOT EXISTS idx_generation_runs_post_id ON generation_runs(post_id);
      CREATE INDEX IF NOT EXISTS idx_token_usage_events_created_at
        ON token_usage_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_token_usage_events_model
        ON token_usage_events(model);
      CREATE INDEX IF NOT EXISTS idx_token_usage_events_session_id
        ON token_usage_events(session_id);
      CREATE INDEX IF NOT EXISTS idx_post_status_events_post_id ON post_status_events(post_id);
    `);
  }

  return database;
};
