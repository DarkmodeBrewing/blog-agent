import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod/v4';
import { BlogSlugSchema } from '../../../../openai/model';
import { getPostBySlug, updatePostContent } from '$lib/server/post-library';

const UpdatePostSchema = z.object({
  title: z.string().min(1),
  ingress: z.string().optional(),
  body: z.string().min(1),
  tags: z.array(z.string()).optional()
});

export const GET: RequestHandler = ({ params }) => {
  const parsedSlug = BlogSlugSchema.safeParse(params.slug);

  if (!parsedSlug.success) {
    return json({ error: 'Invalid slug', issues: parsedSlug.error.issues }, { status: 400 });
  }

  const post = getPostBySlug(parsedSlug.data);

  if (!post) {
    return json({ error: 'Post not found' }, { status: 404 });
  }

  return json({ post });
};

export const PUT: RequestHandler = async ({ params, request }) => {
  const parsedSlug = BlogSlugSchema.safeParse(params.slug);

  if (!parsedSlug.success) {
    return json({ error: 'Invalid slug', issues: parsedSlug.error.issues }, { status: 400 });
  }

  const body = await request.json().catch(() => undefined);
  const parsedBody = UpdatePostSchema.safeParse(body);

  if (!parsedBody.success) {
    return json({ error: 'Invalid post update', issues: parsedBody.error.issues }, { status: 400 });
  }

  const post = updatePostContent(parsedSlug.data, parsedBody.data);

  if (!post) {
    return json({ error: 'Post not found' }, { status: 404 });
  }

  return json({ post });
};
