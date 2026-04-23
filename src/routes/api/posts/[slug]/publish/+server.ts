import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BlogSlugSchema } from '../../../../../openai/model';
import { getReadiness } from '$lib/server/app-settings';
import { publishApprovedDraft } from '$lib/server/post-library';
import { getErrorMessage, logWorkflow } from '$lib/server/workflow-log';

export const POST: RequestHandler = async ({ params }) => {
  const readiness = getReadiness();

  if (!readiness.readyForGitHubPublishing) {
    return json(
      {
        error: 'GitHub publishing settings are incomplete',
        readiness
      },
      { status: 409 }
    );
  }

  const parsedSlug = BlogSlugSchema.safeParse(params.slug);

  if (!parsedSlug.success) {
    return json({ error: 'Invalid slug', issues: parsedSlug.error.issues }, { status: 400 });
  }

  try {
    const post = await publishApprovedDraft(parsedSlug.data);

    if (!post) {
      return json({ error: 'Post not found' }, { status: 404 });
    }

    return json({ post });
  } catch (cause) {
    logWorkflow({
      level: 'error',
      message: 'post.publish.failed',
      details: {
        slug: parsedSlug.data,
        error: getErrorMessage(cause)
      }
    });

    return json(
      {
        error: cause instanceof Error ? cause.message : 'Failed to publish post'
      },
      { status: 400 }
    );
  }
};
