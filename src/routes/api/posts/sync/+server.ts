import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncPostsFromGitHub } from '$lib/server/post-library';

export const POST: RequestHandler = async () => {
  const result = await syncPostsFromGitHub();

  return json(result);
};
