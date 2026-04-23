import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { DraftRequest } from '../../openai/model';
import { generateContentBundle } from './blog-draft';
import { getDatabase } from './database';
import { generationJobs } from './db/schema';
import { getBundlePostsForSlug, getPostBySlug, getRelatedPosts } from './post-library';
import { getErrorMessage, logWorkflow } from './workflow-log';

type GenerationJobStatus = 'queued' | 'running' | 'completed' | 'failed';

const runningJobs = new Set<string>();

const mapGenerationJob = (row: typeof generationJobs.$inferSelect) => {
  const primaryDraft = row.draftSlug ? getPostBySlug(row.draftSlug) : null;
  const bundleDrafts = row.draftSlug ? getBundlePostsForSlug(row.draftSlug) : [];

  return {
    id: row.id,
    status: row.status,
    request: JSON.parse(row.requestJson) as DraftRequest,
    draftSlug: row.draftSlug,
    error: row.error,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    updatedAt: row.updatedAt,
    bundleId: primaryDraft?.bundleId ?? null,
    primaryDraft,
    bundleDrafts,
    draft: primaryDraft,
    relatedDrafts:
      row.draftSlug && primaryDraft
        ? bundleDrafts.filter((draft) => draft.slug !== primaryDraft.slug)
        : row.draftSlug
          ? getRelatedPosts(row.draftSlug)
          : []
  };
};

export const getGenerationJob = (id: string) => {
  const row = getDatabase().select().from(generationJobs).where(eq(generationJobs.id, id)).get();

  return row ? mapGenerationJob(row) : null;
};

export const createGenerationJob = (request: DraftRequest) => {
  const id = randomUUID();

  getDatabase()
    .insert(generationJobs)
    .values({
      id,
      status: 'queued',
      requestJson: JSON.stringify(request)
    })
    .run();

  logWorkflow({
    level: 'info',
    message: 'generation.job.queued',
    details: {
      jobId: id,
      topic: request.topic,
      outputs: request.outputs,
      desiredLength: request.desiredLength,
      referencePostCount: request.referencePostSlugs?.length ?? 0
    }
  });

  queueMicrotask(() => {
    void runGenerationJob(id);
  });

  return getGenerationJob(id);
};

const updateGenerationJobStatus = (
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

export const runGenerationJob = async (id: string) => {
  if (runningJobs.has(id)) return;

  const job = getGenerationJob(id);

  if (!job || job.status !== 'queued') return;

  runningJobs.add(id);
  updateGenerationJobStatus(id, { status: 'running' });

  logWorkflow({
    level: 'info',
    message: 'generation.job.started',
    details: {
      jobId: id,
      topic: job.request.topic,
      outputs: job.request.outputs,
      desiredLength: job.request.desiredLength
    }
  });

  try {
    const bundle = await generateContentBundle(job.request);

    if (!bundle) {
      throw new Error('Model did not return a valid draft');
    }

    updateGenerationJobStatus(id, {
      status: 'completed',
      draftSlug: bundle.primary.slug
    });

    logWorkflow({
      level: 'info',
      message: 'generation.job.completed',
      details: {
        jobId: id,
        draftSlug: bundle.primary.slug,
        title: bundle.primary.title,
        variantCount: bundle.variants.length
      }
    });
  } catch (cause) {
    const error = getErrorMessage(cause);

    updateGenerationJobStatus(id, {
      status: 'failed',
      error
    });

    logWorkflow({
      level: 'error',
      message: 'generation.job.failed',
      details: {
        jobId: id,
        error
      }
    });
  } finally {
    runningJobs.delete(id);
  }
};
