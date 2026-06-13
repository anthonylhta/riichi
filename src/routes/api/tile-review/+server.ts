import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTileReview } from '$lib/server/tileReview';
import { validateDealInMoments } from '$lib/server/validate';
import { rateLimit } from '$lib/server/rateLimit';

// Tile-level deal-in review. The client extracts ≤3 moments from a replayed
// game and posts only those. Validated + rebuilt before anything reaches a
// prompt; rate limited tighter than the overview (this is the most expensive
// per-call endpoint, and a legitimate client uses it a few times per game page).
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!rateLimit(`tile-review:${getClientAddress()}`, 4, 60_000)) {
		return json({ error: 'Too many requests — slow down a little.' }, { status: 429 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Bad request' }, { status: 400 });
	}

	const moments = validateDealInMoments(body);
	if (!moments) {
		return json({ error: 'Bad request' }, { status: 400 });
	}

	try {
		const result = await getTileReview(moments);
		return json(result);
	} catch (e) {
		console.error('Tile review failed:', e);
		return json({ error: 'Review unavailable right now.' }, { status: 500 });
	}
};
