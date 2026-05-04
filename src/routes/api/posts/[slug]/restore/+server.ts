import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BlogSlugSchema } from '../../../../../openai/model';
import { restoreDeletedPost } from '$lib/server/post-library';
import { getErrorMessage, logWorkflow } from '$lib/server/workflow-log';

export const POST: RequestHandler = ({ params }) => {
  const parsedSlug = BlogSlugSchema.safeParse(params.slug);

  if (!parsedSlug.success) {
    return json({ error: 'Invalid slug', issues: parsedSlug.error.issues }, { status: 400 });
  }

  try {
    const post = restoreDeletedPost(parsedSlug.data);

    if (!post) {
      return json({ error: 'Deleted post not found' }, { status: 404 });
    }

    return json({ post });
  } catch (cause) {
    logWorkflow({
      level: 'error',
      message: 'api.request.failed',
      details: {
        route: '/api/posts/[slug]/restore',
        method: 'POST',
        slug: parsedSlug.data,
        error: getErrorMessage(cause)
      }
    });

    return json(
      {
        error: cause instanceof Error ? cause.message : 'Failed to restore post'
      },
      { status: 400 }
    );
  }
};
