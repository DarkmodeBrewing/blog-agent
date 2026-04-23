import { env } from '$env/dynamic/private';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './db/schema';

const databasePath = resolve(process.cwd(), env.SQLITE_DATABASE_PATH ?? 'data/blog-agent.sqlite');

let sqliteDatabase: Database.Database | undefined;
let drizzleDatabase: BetterSQLite3Database<typeof schema> | undefined;

export const getSqliteDatabase = () => {
  if (!sqliteDatabase) {
    mkdirSync(dirname(databasePath), { recursive: true });

    sqliteDatabase = new Database(databasePath);
    sqliteDatabase.pragma('journal_mode = WAL');
    sqliteDatabase.pragma('foreign_keys = ON');

    sqliteDatabase.exec(`
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

      CREATE TABLE IF NOT EXISTS content_bundles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
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

      CREATE TABLE IF NOT EXISTS generation_jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        request_json TEXT NOT NULL,
        draft_slug TEXT,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        started_at TEXT,
        completed_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

      CREATE TABLE IF NOT EXISTS post_publications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        target TEXT NOT NULL,
        status TEXT NOT NULL,
        external_id TEXT,
        remote_url TEXT,
        file_path TEXT,
        commit_sha TEXT,
        artifact_json TEXT,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        published_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_content_bundles_key ON content_bundles(key);
      CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
      CREATE INDEX IF NOT EXISTS idx_posts_source ON posts(source);
      CREATE INDEX IF NOT EXISTS idx_generation_runs_post_id ON generation_runs(post_id);
      CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_generation_jobs_created_at ON generation_jobs(created_at);
      CREATE INDEX IF NOT EXISTS idx_token_usage_events_created_at
        ON token_usage_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_token_usage_events_model
        ON token_usage_events(model);
      CREATE INDEX IF NOT EXISTS idx_token_usage_events_session_id
        ON token_usage_events(session_id);
      CREATE INDEX IF NOT EXISTS idx_post_status_events_post_id ON post_status_events(post_id);
      CREATE INDEX IF NOT EXISTS idx_post_publications_post_id ON post_publications(post_id);
      CREATE INDEX IF NOT EXISTS idx_post_publications_target ON post_publications(target);
      CREATE INDEX IF NOT EXISTS idx_post_publications_status ON post_publications(status);
    `);

    const postColumns = sqliteDatabase.prepare(`PRAGMA table_info('posts')`).all() as Array<{
      name: string;
    }>;
    const postColumnNames = new Set(postColumns.map((column) => column.name));
    const addPostColumn = (name: string, definition: string) => {
      if (!postColumnNames.has(name)) {
        sqliteDatabase!.exec(`ALTER TABLE posts ADD COLUMN ${definition}`);
      }
    };

    addPostColumn(
      'bundle_id',
      'bundle_id INTEGER REFERENCES content_bundles(id) ON DELETE SET NULL'
    );
    addPostColumn(
      'parent_post_id',
      'parent_post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL'
    );
    addPostColumn('content_type', "content_type TEXT NOT NULL DEFAULT 'blog'");
    addPostColumn('variant_role', "variant_role TEXT NOT NULL DEFAULT 'standalone'");
    addPostColumn('locked_at', 'locked_at TEXT');

    sqliteDatabase.exec(`
      CREATE INDEX IF NOT EXISTS idx_posts_bundle_id ON posts(bundle_id);
      CREATE INDEX IF NOT EXISTS idx_posts_parent_post_id ON posts(parent_post_id);
      CREATE INDEX IF NOT EXISTS idx_posts_content_type ON posts(content_type);
    `);
  }

  return sqliteDatabase;
};

export const getDatabase = () => {
  if (!drizzleDatabase) {
    drizzleDatabase = drizzle(getSqliteDatabase(), { schema });
  }

  return drizzleDatabase;
};
