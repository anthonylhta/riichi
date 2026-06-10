import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOverview } from '$lib/server/overview';
import { validateReviewPayload } from '$lib/server/validate';
import { rateLimit } from '$lib/server/rateLimit';

// Generated server-side so the Anthropic key never reaches the client. The body
// is validated and bounds-checked before it goes anywhere near a prompt, and the
// endpoint is rate limited per address — a legitimate client calls this once per
// finished game.
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!rateLimit(`overview:${getClientAddress()}`, 6, 60_000)) {
		return json({ error: 'Too many requests — slow down a little.' }, { status: 429 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Bad request' }, { status: 400 });
	}

	const payload = validateReviewPayload(body);
	if (!payload) {
		return json({ error: 'Bad request' }, { status: 400 });
	}

	try {
		const overview = await getOverview(payload);
		return json(overview);
	} catch (e) {
		console.error('Post-game overview failed:', e);
		return json({ error: 'Review unavailable right now.' }, { status: 500 });
	}
};
