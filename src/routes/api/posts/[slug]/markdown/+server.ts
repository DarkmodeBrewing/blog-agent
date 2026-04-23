import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BlogSlugSchema } from '../../../../../openai/model';
import { getPostBySlug } from '$lib/server/post-library';
import { renderPostAsMarkdown } from '$lib/server/publishing';

export const GET: RequestHandler = ({ params }) => {
  const parsedSlug = BlogSlugSchema.safeParse(params.slug);

  if (!parsedSlug.success) {
    return json({ error: 'Invalid slug', issues: parsedSlug.error.issues }, { status: 400 });
  }

  const post = getPostBySlug(parsedSlug.data);

  if (!post) {
    return json({ error: 'Post not found' }, { status: 404 });
  }

  return json({
    post,
    artifact: renderPostAsMarkdown(post)
  });
};
