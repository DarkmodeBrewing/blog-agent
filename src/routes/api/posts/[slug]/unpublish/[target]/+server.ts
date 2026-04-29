import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BlogSlugSchema, PublishTargetSchema } from '../../../../../../openai/model';
import { getReadiness } from '$lib/server/app-settings';
import {
  canUnpublishTarget,
  isPublishTargetReady,
  listPublishTargets,
  type PublishTarget,
  unpublishPost
} from '$lib/server/publishing';
import { createRequestId, getErrorMessage, logWorkflow } from '$lib/server/workflow-log';

export const POST: RequestHandler = async ({ params, request }) => {
  const requestId = createRequestId();
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
  const body = (await request.json().catch(() => ({}))) as { returnToDraft?: unknown };
  const returnToDraft = body.returnToDraft === true;
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

  if (!canUnpublishTarget(target)) {
    return json(
      {
        error: `Unpublish is not supported for target: ${target}`,
        availableTargets: listPublishTargets()
      },
      { status: 400 }
    );
  }

  try {
    const actionId = `unpublish_${parsedSlug.data}_${target}`;
    const result = await unpublishPost(parsedSlug.data, target, {
      actionId,
      requestId,
      returnToDraft
    });

    if (!result) {
      return json({ error: 'Post not found' }, { status: 404 });
    }

    return json({ result });
  } catch (cause) {
    logWorkflow({
      level: 'error',
      message: 'post.unpublish.failed',
      context: {
        actionId: `unpublish_${parsedSlug.data}_${target}`,
        requestId,
        slug: parsedSlug.data,
        target
      },
      details: {
        error: getErrorMessage(cause)
      }
    });

    return json(
      {
        error: cause instanceof Error ? cause.message : 'Failed to unpublish post'
      },
      { status: 400 }
    );
  }
};
