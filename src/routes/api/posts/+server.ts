import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listPosts, type PostStatus } from '$lib/server/post-library';

const postStatuses = new Set<PostStatus>(['synced', 'draft', 'approved', 'committed', 'rejected']);

export const GET: RequestHandler = ({ url }) => {
  const status = url.searchParams.get('status');

  if (status && !postStatuses.has(status as PostStatus)) {
    return json({ error: 'Invalid post status' }, { status: 400 });
  }

  return json({
    posts: listPosts(status ? (status as PostStatus) : undefined)
  });
};
