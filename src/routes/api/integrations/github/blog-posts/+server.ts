import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BlogSlugSchema } from '../../../../../openai/model';
import { getPostsFromRepo } from '$lib/server/get-posts-from-repo';

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

  const content = await getPostsFromRepo(parsedSlug.data);

  return json({ content });
};
