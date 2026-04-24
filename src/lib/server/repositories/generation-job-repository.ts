import { eq, sql } from 'drizzle-orm';
import { getDatabase } from '../database';
import { generationJobs } from '../db/schema';

export type GenerationJobRow = typeof generationJobs.$inferSelect;
export type GenerationJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export const selectGenerationJobRow = (id: string) => {
  return getDatabase().select().from(generationJobs).where(eq(generationJobs.id, id)).get();
};

export const insertGenerationJobRow = (values: typeof generationJobs.$inferInsert) => {
  getDatabase().insert(generationJobs).values(values).run();
};

export const updateGenerationJobRow = (
  id: string,
  input: {
    status: GenerationJobStatus;
    draftSlug?: string | null;
    error?: string | null;
  }
) => {
  getDatabase()
    .update(generationJobs)
    .set({
      status: input.status,
      draftSlug: input.draftSlug ?? sql`${generationJobs.draftSlug}`,
      error: input.error ?? null,
      startedAt:
        input.status === 'running'
          ? sql`coalesce(${generationJobs.startedAt}, datetime('now'))`
          : sql`${generationJobs.startedAt}`,
      completedAt:
        input.status === 'completed' || input.status === 'failed'
          ? sql`datetime('now')`
          : sql`${generationJobs.completedAt}`,
      updatedAt: sql`datetime('now')`
    })
    .where(eq(generationJobs.id, id))
    .run();
};
