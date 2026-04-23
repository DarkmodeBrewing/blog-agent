import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getReadiness } from '$lib/server/app-settings';

export const GET: RequestHandler = () => {
  return json({
    readiness: getReadiness()
  });
};
