import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod/v4';
import {
  getAppSettingsSnapshot,
  getReadiness,
  logSettingsFailure,
  updateAppSettings
} from '$lib/server/app-settings';

const SettingsUpdateSchema = z.object({
  openai: z.object({
    apiKey: z.string().optional(),
    clearApiKey: z.boolean().optional(),
    models: z.array(z.string().trim().min(1)).min(1),
    selectedModel: z.string().trim().min(1)
  }),
  github: z.object({
    enabled: z.boolean(),
    token: z.string().optional(),
    clearToken: z.boolean().optional(),
    owner: z.string(),
    repo: z.string(),
    branch: z.string(),
    blogPostPath: z.string()
  }),
  markdownExport: z.object({
    downloadEnabled: z.boolean(),
    diskExportEnabled: z.boolean(),
    diskExportPath: z.string()
  }),
  frontmatter: z.object({
    title: z.boolean(),
    slug: z.boolean(),
    ingress: z.boolean(),
    tags: z.boolean(),
    category: z.boolean(),
    date: z.boolean(),
    draft: z.boolean(),
    draftDefault: z.boolean()
  })
});

export const GET: RequestHandler = () => {
  return json({
    settings: getAppSettingsSnapshot(),
    readiness: getReadiness()
  });
};

export const PUT: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => undefined);
  const parsedBody = SettingsUpdateSchema.safeParse(body);

  if (!parsedBody.success) {
    return json(
      { error: 'Invalid app settings', issues: parsedBody.error.issues },
      { status: 400 }
    );
  }

  try {
    return json(updateAppSettings(parsedBody.data));
  } catch (cause) {
    logSettingsFailure('settings.app.update_failed', cause);

    return json(
      {
        error: cause instanceof Error ? cause.message : 'Failed to update settings'
      },
      { status: 400 }
    );
  }
};
