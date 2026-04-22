import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BlogSlugSchema } from '../../../../../openai/model';
import { updatePostStatus, type PostStatus } from '$lib/server/post-library';
import { getErrorMessage, logWorkflow } from '$lib/server/workflow-log';

const postStatuses = new Set<PostStatus>(['draft', 'approved', 'rejected', 'committed']);

export const POST: RequestHandler = async ({ params, request }) => {
  const parsedSlug = BlogSlugSchema.safeParse(params.slug);

  if (!parsedSlug.success) {
    return json({ error: 'Invalid slug', issues: parsedSlug.error.issues }, { status: 400 });
  }

  const body = (await request.json().catch(() => undefined)) as unknown;

  if (!body || typeof body !== 'object' || !('status' in body)) {
    return json({ error: 'Expected status in JSON body' }, { status: 400 });
  }

  const status = body.status;

  if (typeof status !== 'string' || !postStatuses.has(status as PostStatus)) {
    return json({ error: 'Invalid status' }, { status: 400 });
  }

  const notes = 'notes' in body && typeof body.notes === 'string' ? body.notes : undefined;
  let post;

  try {
    post = updatePostStatus(parsedSlug.data, status as PostStatus, notes);
  } catch (cause) {
    logWorkflow({
      level: 'error',
      message: 'api.request.failed',
      details: {
        route: '/api/posts/[slug]/status',
        method: 'POST',
        slug: parsedSlug.data,
        status,
        error: getErrorMessage(cause)
      }
    });

    return json({ error: 'Failed to update post status' }, { status: 500 });
  }

  if (!post) {
    return json({ error: 'Post not found' }, { status: 404 });
  }

  return json({ post });
};
