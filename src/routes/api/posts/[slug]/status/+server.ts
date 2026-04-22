import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BlogSlugSchema } from '../../../../../openai/model';
import { updatePostStatus, type PostStatus } from '$lib/server/post-library';

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
  const post = updatePostStatus(parsedSlug.data, status as PostStatus, notes);

  if (!post) {
    return json({ error: 'Post not found' }, { status: 404 });
  }

  return json({ post });
};
