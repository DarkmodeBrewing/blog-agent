import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BlogSlugSchema } from '../../../../../openai/model';
import { createEditableCopy } from '$lib/server/post-library';
import { getErrorMessage, logWorkflow } from '$lib/server/workflow-log';

export const POST: RequestHandler = ({ params }) => {
  const parsedSlug = BlogSlugSchema.safeParse(params.slug);

  if (!parsedSlug.success) {
    return json({ error: 'Invalid slug', issues: parsedSlug.error.issues }, { status: 400 });
  }

  try {
    const post = createEditableCopy(parsedSlug.data);

    if (!post) {
      return json({ error: 'Post not found' }, { status: 404 });
    }

    return json({ post });
  } catch (cause) {
    logWorkflow({
      level: 'error',
      message: 'post.copy.failed',
      details: {
        slug: parsedSlug.data,
        error: getErrorMessage(cause)
      }
    });

    return json(
      {
        error: cause instanceof Error ? cause.message : 'Failed to create copy'
      },
      { status: 400 }
    );
  }
};
