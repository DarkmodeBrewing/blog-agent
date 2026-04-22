import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod/v4';
import { getModelSettings, setModelSettings } from '$lib/server/prompt-settings';

const ModelSettingsSchema = z.object({
  models: z.array(z.string().trim().min(1)).min(1),
  selectedModel: z.string().trim().min(1)
});

export const GET: RequestHandler = () => {
  return json(getModelSettings());
};

export const PUT: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => undefined);
  const parsedBody = ModelSettingsSchema.safeParse(body);

  if (!parsedBody.success) {
    return json(
      { error: 'Invalid model settings', issues: parsedBody.error.issues },
      { status: 400 }
    );
  }

  try {
    return json(setModelSettings(parsedBody.data));
  } catch (cause) {
    return json(
      {
        error: cause instanceof Error ? cause.message : 'Failed to update model settings'
      },
      { status: 400 }
    );
  }
};
