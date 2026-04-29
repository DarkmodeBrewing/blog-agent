import { and, eq, isNull } from 'drizzle-orm';
import { getDatabase } from '../database';
import { posts } from '../db/schema';
import { markPostDeletedById, selectPostRowBySlug, upsertPostRow } from './content-repository';

export const selectSyncedPostRowBySlug = (slug: string) => {
  return selectPostRowBySlug(slug);
};

export const selectGitHubSourcedPostRows = (options?: { includeDeleted?: boolean }) => {
  const database = getDatabase();
  const baseFilter = and(eq(posts.source, 'github'));

  if (options?.includeDeleted) {
    return database.select().from(posts).where(baseFilter).all();
  }

  return database
    .select()
    .from(posts)
    .where(and(eq(posts.source, 'github'), isNull(posts.deletedAt)))
    .all();
};

export const softDeleteSyncedPostById = (postId: number) => {
  markPostDeletedById(postId);
};

export const upsertSyncedPostRow = (values: Parameters<typeof upsertPostRow>[0]) => {
  return upsertPostRow(values);
};
