import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DraftRequestSchema } from '../../../../../openai/model';
import { generateBlogDraft } from '$lib/server/blog-draft';

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

  const draft = await generateBlogDraft(body);

  if (!draft) {
    return json({ error: 'Model did not return a valid draft' }, { status: 502 });
  }

  return json({ draft });
};
