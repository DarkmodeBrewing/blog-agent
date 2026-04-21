import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';
import auth from 'basic-auth';
import { timingSafeEqual } from 'node:crypto';

const unauthorized = () =>
	new Response('Authentication required', {
		status: 401,
		headers: {
			'WWW-Authenticate': `Basic realm="${env.BASIC_AUTH_REALM ?? 'blog-agent'}"`
		}
	});

const safeCompare = (actual: string, expected: string) => {
	const actualBuffer = Buffer.from(actual);
	const expectedBuffer = Buffer.from(expected);

	return (
		actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
	);
};

export const handle: Handle = async ({ event, resolve }) => {
	const username = env.BASIC_AUTH_USERNAME;
	const password = env.BASIC_AUTH_PASSWORD;

	if (!username || !password) {
		if (dev) {
			return resolve(event);
		}

		return new Response('Basic auth is not configured', { status: 500 });
	}

	const authorization = event.request.headers.get('authorization');
	const credentials = authorization ? auth.parse(authorization) : undefined;

	if (
		!credentials ||
		!safeCompare(credentials.name, username) ||
		!safeCompare(credentials.pass, password)
	) {
		return unauthorized();
	}

	event.locals.user = { name: credentials.name };

	return resolve(event);
};
