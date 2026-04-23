import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod/v4';
import {
  getPromptTemplates,
  logSettingsFailure,
  resetPromptTemplates,
  setPromptTemplates
} from '$lib/server/prompt-settings';

const PromptTemplatesSchema = z.object({
  sharedVoice: z.string().trim().min(50),
  blogGeneration: z.string().trim().min(50),
  socialGeneration: z.string().trim().min(50),
  guardrails: z.string().trim().min(50)
});

export const GET: RequestHandler = () => {
  return json({ templates: getPromptTemplates() });
};

export const PUT: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => undefined);
  const parsedBody = PromptTemplatesSchema.safeParse(body);

  if (!parsedBody.success) {
    return json(
      { error: 'Invalid prompt templates', issues: parsedBody.error.issues },
      { status: 400 }
    );
  }

  try {
    return json({ templates: setPromptTemplates(parsedBody.data) });
  } catch (cause) {
    logSettingsFailure('settings.prompt_templates.update_failed', cause);

    return json(
      {
        error: cause instanceof Error ? cause.message : 'Failed to update prompt templates'
      },
      { status: 400 }
    );
  }
};

export const DELETE: RequestHandler = () => {
  return json({ templates: resetPromptTemplates() });
};
