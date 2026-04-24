import { desc, eq, inArray, sql } from 'drizzle-orm';
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

export const selectPostRows = (status?: PostRow['status']) => {
  const database = getDatabase();

  return status
    ? database
        .select()
        .from(posts)
        .where(eq(posts.status, status))
        .orderBy(desc(posts.updatedAt))
        .all()
    : database.select().from(posts).orderBy(desc(posts.updatedAt)).all();
};

export const selectPostRowBySlug = (slug: string) => {
  return getDatabase().select().from(posts).where(eq(posts.slug, slug)).get();
};

export const selectPostRowsByBundleId = (bundleId: number) => {
  return getDatabase()
    .select()
    .from(posts)
    .where(eq(posts.bundleId, bundleId))
    .orderBy(desc(posts.updatedAt))
    .all();
};

export const selectPostRowById = (id: number) => {
  return getDatabase().select().from(posts).where(eq(posts.id, id)).get();
};

export const selectChildPostRows = (parentPostId: number) => {
  return getDatabase()
    .select()
    .from(posts)
    .where(eq(posts.parentPostId, parentPostId))
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
