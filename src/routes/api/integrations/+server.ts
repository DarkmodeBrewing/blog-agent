import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIntegrationStatus } from '$lib/server/clients';

export const GET: RequestHandler = () => {
	return json(getIntegrationStatus());
};
