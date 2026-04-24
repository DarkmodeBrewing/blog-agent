import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIntegrationStatus, getReadiness } from '$lib/server/app-settings';

export const GET: RequestHandler = () => {
  return json({
    integrations: getIntegrationStatus(),
    readiness: getReadiness()
  });
};
