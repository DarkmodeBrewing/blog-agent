import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listPostBundles, listPosts, type PostStatus } from '$lib/server/post-library';

const postStatuses = new Set<PostStatus>(['synced', 'draft', 'approved', 'committed', 'rejected']);

export const GET: RequestHandler = ({ url }) => {
  const status = url.searchParams.get('status');
  const grouped = url.searchParams.get('grouped');
  const deleted = url.searchParams.get('deleted');

  if (status && !postStatuses.has(status as PostStatus)) {
    return json({ error: 'Invalid post status' }, { status: 400 });
  }

  const resolvedStatus = status ? (status as PostStatus) : undefined;
  const onlyDeleted = deleted === '1' || deleted === 'true';

  return json({
    posts: listPosts(resolvedStatus, onlyDeleted ? { onlyDeleted: true } : undefined),
    bundles: listPostBundles(resolvedStatus, onlyDeleted ? { onlyDeleted: true } : undefined),
    grouped:
      grouped === '1' || grouped === 'true'
        ? listPostBundles(resolvedStatus, onlyDeleted ? { onlyDeleted: true } : undefined)
        : undefined
  });
};
