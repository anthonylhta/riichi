import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getHelperAdvice } from '$lib/server/helper';
import { validateHelperView } from '$lib/server/validate';
import { rateLimit } from '$lib/server/rateLimit';

// The advice is generated server-side so the Anthropic key never reaches the
// client. The body is validated and bounds-checked before it goes anywhere near
// a prompt, and the endpoint is rate limited per address — both because every
// call here spends real Claude tokens on our key.
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!rateLimit(`helper:${getClientAddress()}`, 12, 60_000)) {
		return json({ error: 'Too many requests — slow down a little.' }, { status: 429 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Bad request' }, { status: 400 });
	}

	const view = validateHelperView(body);
	if (!view) {
		return json({ error: 'Bad request' }, { status: 400 });
	}

	try {
		const advice = await getHelperAdvice(view);
		return json(advice);
	} catch (e) {
		console.error('In-round helper failed:', e);
		return json({ error: 'Helper unavailable right now.' }, { status: 500 });
	}
};
