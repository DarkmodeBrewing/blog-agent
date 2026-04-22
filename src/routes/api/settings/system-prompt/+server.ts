import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSystemPrompt, resetSystemPrompt, setSystemPrompt } from '$lib/server/prompt-settings';

export const GET: RequestHandler = () => {
  return json({ prompt: getSystemPrompt() });
};

export const PUT: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => undefined)) as unknown;

  if (!body || typeof body !== 'object' || !('prompt' in body) || typeof body.prompt !== 'string') {
    return json({ error: 'Expected prompt string' }, { status: 400 });
  }

  const prompt = body.prompt.trim();

  if (prompt.length < 100) {
    return json({ error: 'Prompt must be at least 100 characters' }, { status: 400 });
  }

  return json({ prompt: setSystemPrompt(prompt) });
};

export const DELETE: RequestHandler = () => {
  return json({ prompt: resetSystemPrompt() });
};
