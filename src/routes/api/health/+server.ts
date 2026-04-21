import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
  return json({
    ok: true,
    authenticatedAs: locals.user?.name ?? null
  });
};
