import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listPostBundles, listPosts, type PostStatus } from '$lib/server/post-library';

const postStatuses = new Set<PostStatus>(['synced', 'draft', 'approved', 'committed', 'rejected']);

export const GET: RequestHandler = ({ url }) => {
  const status = url.searchParams.get('status');
  const grouped = url.searchParams.get('grouped');

  if (status && !postStatuses.has(status as PostStatus)) {
    return json({ error: 'Invalid post status' }, { status: 400 });
  }

  const resolvedStatus = status ? (status as PostStatus) : undefined;

  return json({
    posts: listPosts(resolvedStatus),
    bundles: listPostBundles(resolvedStatus),
    grouped: grouped === '1' || grouped === 'true' ? listPostBundles(resolvedStatus) : undefined
  });
};
