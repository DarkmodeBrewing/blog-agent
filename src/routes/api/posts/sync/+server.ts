import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncPostsFromGitHub } from '$lib/server/post-library';
import { getErrorMessage, logWorkflow } from '$lib/server/workflow-log';

export const POST: RequestHandler = async () => {
  try {
    const result = await syncPostsFromGitHub();

    return json(result);
  } catch (cause) {
    logWorkflow({
      level: 'error',
      message: 'sync.failed',
      details: {
        stage: 'api.posts.sync',
        error: getErrorMessage(cause)
      }
    });

    return json({ error: 'GitHub sync failed' }, { status: 502 });
  }
};
