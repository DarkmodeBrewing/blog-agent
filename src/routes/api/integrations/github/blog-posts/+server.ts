import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BlogSlugSchema } from '../../../../../openai/model';
import { getPostsFromRepo } from '$lib/server/get-posts-from-repo';
import { getErrorMessage, logWorkflow } from '$lib/server/workflow-log';

export const GET: RequestHandler = async ({ url }) => {
  const slug = url.searchParams.get('slug');
  const parsedSlug = BlogSlugSchema.safeParse(slug);

  if (!parsedSlug.success) {
    return json(
      {
        error: 'Invalid or missing slug',
        issues: parsedSlug.error.issues
      },
      { status: 400 }
    );
  }

  let content;

  try {
    content = await getPostsFromRepo(parsedSlug.data);
  } catch (cause) {
    logWorkflow({
      level: 'error',
      message: 'api.request.failed',
      details: {
        route: '/api/integrations/github/blog-posts',
        method: 'GET',
        slug: parsedSlug.data,
        error: getErrorMessage(cause)
      }
    });

    throw cause;
  }

  return json({ content });
};
