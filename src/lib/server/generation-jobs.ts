import { randomUUID } from 'node:crypto';
import type { DraftRequest } from '../../openai/model';
import { generateBlogDraft } from './blog-draft';
import { getDatabase } from './database';
import { getPostBySlug } from './post-library';
import { getErrorMessage, logWorkflow } from './workflow-log';

type GenerationJobStatus = 'queued' | 'running' | 'completed' | 'failed';

type GenerationJobRow = {
  id: string;
  status: GenerationJobStatus;
  request_json: string;
  draft_slug: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

const runningJobs = new Set<string>();

const mapGenerationJob = (row: GenerationJobRow) => ({
  id: row.id,
  status: row.status,
  request: JSON.parse(row.request_json) as DraftRequest,
  draftSlug: row.draft_slug,
  error: row.error,
  createdAt: row.created_at,
  startedAt: row.started_at,
  completedAt: row.completed_at,
  updatedAt: row.updated_at,
  draft: row.draft_slug ? getPostBySlug(row.draft_slug) : null
});

export const getGenerationJob = (id: string) => {
  const row = getDatabase()
    .prepare<[string], GenerationJobRow>('SELECT * FROM generation_jobs WHERE id = ?')
    .get(id);

  return row ? mapGenerationJob(row) : null;
};

export const createGenerationJob = (request: DraftRequest) => {
  const id = randomUUID();

  getDatabase()
    .prepare<{
      id: string;
      requestJson: string;
    }>(
      `
        INSERT INTO generation_jobs (id, status, request_json)
        VALUES (@id, 'queued', @requestJson)
      `
    )
    .run({
      id,
      requestJson: JSON.stringify(request)
    });

  logWorkflow({
    level: 'info',
    message: 'generation.job.queued',
    details: {
      jobId: id,
      topic: request.topic,
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
    .prepare<{
      id: string;
      status: GenerationJobStatus;
      draftSlug: string | null;
      error: string | null;
    }>(
      `
        UPDATE generation_jobs
        SET
          status = @status,
          draft_slug = COALESCE(@draftSlug, draft_slug),
          error = @error,
          started_at = CASE
            WHEN @status = 'running' AND started_at IS NULL THEN datetime('now')
            ELSE started_at
          END,
          completed_at = CASE
            WHEN @status IN ('completed', 'failed') THEN datetime('now')
            ELSE completed_at
          END,
          updated_at = datetime('now')
        WHERE id = @id
      `
    )
    .run({
      id,
      status: input.status,
      draftSlug: input.draftSlug ?? null,
      error: input.error ?? null
    });
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
      desiredLength: job.request.desiredLength
    }
  });

  try {
    const draft = await generateBlogDraft(job.request);

    if (!draft) {
      throw new Error('Model did not return a valid draft');
    }

    updateGenerationJobStatus(id, {
      status: 'completed',
      draftSlug: draft.slug
    });

    logWorkflow({
      level: 'info',
      message: 'generation.job.completed',
      details: {
        jobId: id,
        draftSlug: draft.slug,
        title: draft.title
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
