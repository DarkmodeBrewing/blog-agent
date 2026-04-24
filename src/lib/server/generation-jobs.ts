import { randomUUID } from 'node:crypto';
import type { DraftRequest } from '../../openai/model';
import { generateContentBundle } from './blog-draft';
import { getBundlePostsForSlug, getPostBySlug, getRelatedPosts } from './post-library';
import { getErrorMessage, logWorkflow } from './workflow-log';
import {
  insertGenerationJobRow,
  selectGenerationJobRow,
  updateGenerationJobRow,
  type GenerationJobRow,
  type GenerationJobStatus
} from './repositories/generation-job-repository';

const runningJobs = new Set<string>();

const mapGenerationJob = (row: GenerationJobRow) => {
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
  const row = selectGenerationJobRow(id);

  return row ? mapGenerationJob(row) : null;
};

export const createGenerationJob = (request: DraftRequest) => {
  const id = randomUUID();
  const actionId = `generate_${id.slice(0, 12)}`;

  insertGenerationJobRow({
    id,
    status: 'queued',
    requestJson: JSON.stringify(request)
  });

  logWorkflow({
    level: 'info',
    message: 'generation.job.queued',
    context: {
      actionId,
      jobId: id
    },
    details: {
      jobId: id,
      topic: request.topic,
      outputs: request.outputs,
      desiredLength: request.desiredLength,
      referencePostCount: request.referencePostSlugs?.length ?? 0
    }
  });

  queueMicrotask(() => {
    void runGenerationJob(id, actionId);
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
  updateGenerationJobRow(id, input);
};

export const runGenerationJob = async (id: string, actionId?: string) => {
  if (runningJobs.has(id)) return;

  const job = getGenerationJob(id);

  if (!job || job.status !== 'queued') return;

  runningJobs.add(id);
  updateGenerationJobStatus(id, { status: 'running' });

  logWorkflow({
    level: 'info',
    message: 'generation.job.started',
    context: {
      actionId: actionId ?? null,
      jobId: id
    },
    details: {
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
      context: {
        actionId: actionId ?? null,
        jobId: id,
        slug: bundle.primary.slug
      },
      details: {
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
      context: {
        actionId: actionId ?? null,
        jobId: id
      },
      details: {
        error
      }
    });
  } finally {
    runningJobs.delete(id);
  }
};
