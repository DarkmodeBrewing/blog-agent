import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listPublishTargets } from '$lib/server/publishing';

export const GET: RequestHandler = () => {
  return json({
    targets: listPublishTargets()
  });
};
