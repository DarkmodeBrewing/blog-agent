import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const logEvents = sqliteTable('log_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  level: text('level', { enum: ['debug', 'info', 'warn', 'error'] }).notNull(),
  message: text('message').notNull(),
  details: text('details'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`)
});

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`)
});

export const posts = sqliteTable(
  'posts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    ingress: text('ingress'),
    body: text('body').notNull(),
    frontmatterJson: text('frontmatter_json').notNull().default('{}'),
    tagsJson: text('tags_json').notNull().default('[]'),
    status: text('status', {
      enum: ['synced', 'draft', 'approved', 'committed', 'rejected']
    }).notNull(),
    githubPath: text('github_path'),
    githubSha: text('github_sha'),
    source: text('source', { enum: ['github', 'generated', 'manual'] }).notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    index('idx_posts_status').on(table.status),
    index('idx_posts_source').on(table.source)
  ]
);

export const generationRuns = sqliteTable(
  'generation_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    postId: integer('post_id').references(() => posts.id, { onDelete: 'set null' }),
    model: text('model').notNull(),
    prompt: text('prompt').notNull(),
    requestJson: text('request_json').notNull(),
    responseJson: text('response_json').notNull(),
    sourcePostSlugsJson: text('source_post_slugs_json').notNull().default('[]'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [index('idx_generation_runs_post_id').on(table.postId)]
);

export const generationJobs = sqliteTable(
  'generation_jobs',
  {
    id: text('id').primaryKey(),
    status: text('status', { enum: ['queued', 'running', 'completed', 'failed'] }).notNull(),
    requestJson: text('request_json').notNull(),
    draftSlug: text('draft_slug'),
    error: text('error'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    index('idx_generation_jobs_status').on(table.status),
    index('idx_generation_jobs_created_at').on(table.createdAt)
  ]
);

export const tokenUsageEvents = sqliteTable(
  'token_usage_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id').notNull(),
    operation: text('operation').notNull(),
    stage: text('stage').notNull(),
    model: text('model').notNull(),
    responseId: text('response_id'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    detailsJson: text('details_json').notNull().default('{}'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    index('idx_token_usage_events_created_at').on(table.createdAt),
    index('idx_token_usage_events_model').on(table.model),
    index('idx_token_usage_events_session_id').on(table.sessionId)
  ]
);

export const postStatusEvents = sqliteTable(
  'post_status_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [index('idx_post_status_events_post_id').on(table.postId)]
);
