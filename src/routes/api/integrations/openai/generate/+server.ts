import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DraftRequestSchema } from '../../../../../openai/model';
import { createGenerationJob } from '$lib/server/generation-jobs';

export const POST: RequestHandler = async ({ request }) => {
  const requestBody = await request.json().catch(() => undefined);
  const parsedBody = DraftRequestSchema.safeParse(requestBody);

  if (!parsedBody.success) {
    return json(
      {
        error: 'Invalid draft request',
        issues: parsedBody.error.issues
      },
      { status: 400 }
    );
  }

  const body = parsedBody.data;
  const job = createGenerationJob(body);

  return json({ job }, { status: 202 });
};
