import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BlogSlugSchema, PublishTargetSchema } from '../../../../../../openai/model';
import { getReadiness } from '$lib/server/app-settings';
import {
  isPublishTargetReady,
  listPublishTargets,
  publishPost,
  type PublishTarget
} from '$lib/server/publishing';
import { getErrorMessage, logWorkflow } from '$lib/server/workflow-log';

export const POST: RequestHandler = async ({ params }) => {
  const parsedSlug = BlogSlugSchema.safeParse(params.slug);
  const parsedTarget = PublishTargetSchema.safeParse(params.target);

  if (!parsedSlug.success) {
    return json({ error: 'Invalid slug', issues: parsedSlug.error.issues }, { status: 400 });
  }

  if (!parsedTarget.success) {
    return json(
      {
        error: 'Invalid publish target',
        availableTargets: listPublishTargets()
      },
      { status: 400 }
    );
  }

  const target = parsedTarget.data as PublishTarget;
  const readiness = getReadiness();

  if (target === 'github_repo' && !readiness.readyForGitHubPublishing) {
    return json(
      {
        error: 'GitHub publishing settings are incomplete',
        readiness
      },
      { status: 409 }
    );
  }

  if (!isPublishTargetReady(target)) {
    return json(
      {
        error: `Publish target is not ready: ${target}`,
        availableTargets: listPublishTargets()
      },
      { status: 409 }
    );
  }

  try {
    const result = await publishPost(parsedSlug.data, target);

    if (!result) {
      return json({ error: 'Post not found' }, { status: 404 });
    }

    return json({ result });
  } catch (cause) {
    logWorkflow({
      level: 'error',
      message: 'post.publish.failed',
      details: {
        slug: parsedSlug.data,
        target,
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
