import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { getDatabase } from '../database';
import {
  contentBundles,
  generationRuns,
  postPublications,
  posts,
  postStatusEvents
} from '../db/schema';

export type PostRow = typeof posts.$inferSelect;
export type PostInsertRow = typeof posts.$inferInsert;
export type PostPublicationRow = typeof postPublications.$inferSelect;
export type GenerationRunInsertRow = typeof generationRuns.$inferInsert;

type PostQueryOptions = {
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
};

const buildPostFilters = (status?: PostRow['status'], options?: PostQueryOptions) => {
  const filters = [];

  if (options?.onlyDeleted) {
    filters.push(isNotNull(posts.deletedAt));
  } else if (!options?.includeDeleted) {
    filters.push(isNull(posts.deletedAt));
  }

  if (status) {
    filters.push(eq(posts.status, status));
  }

  return filters.length > 0 ? and(...filters) : undefined;
};

export const selectPostRows = (status?: PostRow['status'], options?: PostQueryOptions) => {
  const database = getDatabase();
  const where = buildPostFilters(status, options);

  return where
    ? database.select().from(posts).where(where).orderBy(desc(posts.updatedAt)).all()
    : database.select().from(posts).orderBy(desc(posts.updatedAt)).all();
};

export const selectPostRowBySlug = (slug: string, options?: PostQueryOptions) => {
  const where = buildPostFilters(undefined, options);

  return where
    ? getDatabase()
        .select()
        .from(posts)
        .where(and(eq(posts.slug, slug), where))
        .get()
    : getDatabase().select().from(posts).where(eq(posts.slug, slug)).get();
};

export const selectPostRowsByBundleId = (bundleId: number, options?: PostQueryOptions) => {
  const filters = [eq(posts.bundleId, bundleId)];

  if (options?.onlyDeleted) {
    filters.push(isNotNull(posts.deletedAt));
  } else if (!options?.includeDeleted) {
    filters.push(isNull(posts.deletedAt));
  }

  return getDatabase()
    .select()
    .from(posts)
    .where(and(...filters))
    .orderBy(desc(posts.updatedAt))
    .all();
};

export const selectPostRowById = (id: number, options?: PostQueryOptions) => {
  const filters = [eq(posts.id, id)];

  if (options?.onlyDeleted) {
    filters.push(isNotNull(posts.deletedAt));
  } else if (!options?.includeDeleted) {
    filters.push(isNull(posts.deletedAt));
  }

  return getDatabase()
    .select()
    .from(posts)
    .where(and(...filters))
    .get();
};

export const selectChildPostRows = (parentPostId: number, options?: PostQueryOptions) => {
  const filters = [eq(posts.parentPostId, parentPostId)];

  if (options?.onlyDeleted) {
    filters.push(isNotNull(posts.deletedAt));
  } else if (!options?.includeDeleted) {
    filters.push(isNull(posts.deletedAt));
  }

  return getDatabase()
    .select()
    .from(posts)
    .where(and(...filters))
    .orderBy(desc(posts.updatedAt))
    .all();
};

export const selectPublicationRowsForPost = (postId: number) => {
  return getDatabase()
    .select()
    .from(postPublications)
    .where(eq(postPublications.postId, postId))
    .orderBy(desc(postPublications.updatedAt))
    .all();
};

export const selectPublicationRowsForPosts = (postIds: number[]) => {
  if (postIds.length === 0) {
    return [];
  }

  return getDatabase()
    .select()
    .from(postPublications)
    .where(inArray(postPublications.postId, postIds))
    .orderBy(desc(postPublications.updatedAt))
    .all();
};

export const insertContentBundle = (key: string) => {
  const result = getDatabase().insert(contentBundles).values({ key }).run();

  return Number(result.lastInsertRowid);
};

export const upsertPostRow = (values: PostInsertRow) => {
  return getDatabase()
    .insert(posts)
    .values(values)
    .onConflictDoUpdate({
      target: posts.slug,
      set: {
        bundleId: values.bundleId ?? null,
        parentPostId: values.parentPostId ?? null,
        title: values.title,
        ingress: values.ingress ?? null,
        body: values.body,
        frontmatterJson: values.frontmatterJson,
        tagsJson: values.tagsJson,
        contentType: values.contentType,
        variantRole: values.variantRole,
        status: values.status,
        githubPath: values.githubPath ?? null,
        githubSha: values.githubSha ?? null,
        source: values.source,
        lockedAt: values.lockedAt ?? null,
        updatedAt: sql`datetime('now')`
      }
    })
    .run();
};

export const insertPostStatusEvent = (values: typeof postStatusEvents.$inferInsert) => {
  getDatabase().insert(postStatusEvents).values(values).run();
};

export const insertGenerationRun = (values: GenerationRunInsertRow) => {
  getDatabase().insert(generationRuns).values(values).run();
};

export const insertPostPublication = (values: typeof postPublications.$inferInsert) => {
  getDatabase().insert(postPublications).values(values).run();
};

export const lockPostById = (postId: number) => {
  getDatabase()
    .update(posts)
    .set({
      lockedAt: sql`coalesce(${posts.lockedAt}, datetime('now'))`,
      updatedAt: sql`datetime('now')`
    })
    .where(eq(posts.id, postId))
    .run();
};

export const unlockPostById = (postId: number) => {
  getDatabase()
    .update(posts)
    .set({
      lockedAt: null,
      updatedAt: sql`datetime('now')`
    })
    .where(eq(posts.id, postId))
    .run();
};

export const markPostDeletedById = (postId: number) => {
  getDatabase()
    .update(posts)
    .set({
      deletedAt: sql`datetime('now')`,
      updatedAt: sql`datetime('now')`
    })
    .where(eq(posts.id, postId))
    .run();
};

export const restoreDeletedPostById = (postId: number) => {
  getDatabase()
    .update(posts)
    .set({
      deletedAt: null,
      updatedAt: sql`datetime('now')`
    })
    .where(eq(posts.id, postId))
    .run();
};
