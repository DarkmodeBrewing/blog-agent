import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { renderMarkdown } from '$lib/server/markdown';

export const POST: RequestHandler = async ({ request }) => {
  const body: unknown = await request.json();

  if (!body || typeof body !== 'object' || !('markdown' in body)) {
    return json({ error: 'Expected JSON body with a markdown string' }, { status: 400 });
  }

  const { markdown } = body;

  if (typeof markdown !== 'string') {
    return json({ error: 'Expected markdown to be a string' }, { status: 400 });
  }

  const rendered = await renderMarkdown(markdown);

  return json(rendered);
};
