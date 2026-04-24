import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

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

export const contentBundles = sqliteTable(
  'content_bundles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull().unique(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [index('idx_content_bundles_key').on(table.key)]
);

export const posts = sqliteTable(
  'posts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    bundleId: integer('bundle_id').references(() => contentBundles.id, { onDelete: 'set null' }),
    parentPostId: integer('parent_post_id').references((): AnySQLiteColumn => posts.id, {
      onDelete: 'set null'
    }),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    ingress: text('ingress'),
    body: text('body').notNull(),
    frontmatterJson: text('frontmatter_json').notNull().default('{}'),
    tagsJson: text('tags_json').notNull().default('[]'),
    contentType: text('content_type', {
      enum: ['blog', 'x', 'linkedin', 'instagram', 'generic']
    })
      .notNull()
      .default('blog'),
    variantRole: text('variant_role', {
      enum: ['primary', 'derived', 'standalone']
    })
      .notNull()
      .default('standalone'),
    status: text('status', {
      enum: ['synced', 'draft', 'approved', 'committed', 'rejected']
    }).notNull(),
    githubPath: text('github_path'),
    githubSha: text('github_sha'),
    source: text('source', { enum: ['github', 'generated', 'manual'] }).notNull(),
    lockedAt: text('locked_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    index('idx_posts_bundle_id').on(table.bundleId),
    index('idx_posts_parent_post_id').on(table.parentPostId),
    index('idx_posts_content_type').on(table.contentType),
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

export const postPublications = sqliteTable(
  'post_publications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    target: text('target', {
      enum: [
        'markdown_download',
        'markdown_disk_export',
        'github_repo',
        'cms_contentful',
        'social_x',
        'social_linkedin'
      ]
    }).notNull(),
    status: text('status', { enum: ['not_published', 'published', 'failed'] }).notNull(),
    externalId: text('external_id'),
    remoteUrl: text('remote_url'),
    filePath: text('file_path'),
    commitSha: text('commit_sha'),
    artifactJson: text('artifact_json'),
    error: text('error'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    publishedAt: text('published_at'),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    index('idx_post_publications_post_id').on(table.postId),
    index('idx_post_publications_target').on(table.target),
    index('idx_post_publications_status').on(table.status)
  ]
);
