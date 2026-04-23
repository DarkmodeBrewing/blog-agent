import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod/v4';
import { getGenerationJob } from '$lib/server/generation-jobs';

const JobIdSchema = z.string().uuid();

export const GET: RequestHandler = ({ params }) => {
  const parsedId = JobIdSchema.safeParse(params.id);

  if (!parsedId.success) {
    return json({ error: 'Invalid generation job id' }, { status: 400 });
  }

  const job = getGenerationJob(parsedId.data);

  if (!job) {
    return json({ error: 'Generation job not found' }, { status: 404 });
  }

  return json({ job });
};
