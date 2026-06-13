import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrCreateUser } from '$lib/server/users';
import { getGameTileReview, saveGameTileReview } from '$lib/server/games';
import { getTileReview } from '$lib/server/tileReview';
import { validateDealInMoments } from '$lib/server/validate';
import { rateLimit } from '$lib/server/rateLimit';
import { mergeReviewedDealIns } from '$lib/game/tileReview';

// Tile-level deal-in review, cached per game (ADR 0055). Signed-in only — the
// verdicts hang off a saved game the caller must own (a foreign id is a plain
// 404, same as the rest of /api/games). First run: the client posts the ≤3
// moments it extracted from the replay; Claude's verdicts are merged into the
// render-ready ReviewedDealIn[] shape, cached on the row, and returned. Every
// later call returns the cache without spending anything — so the rate limit
// guards only the Claude path.
export const POST: RequestHandler = async ({ params, request, locals, getClientAddress }) => {
	const clerkId = locals.auth().userId;
	if (!clerkId) {
		return json({ error: 'Sign in required' }, { status: 401 });
	}

	const gameId = Number(params.id);
	if (!Number.isInteger(gameId) || gameId <= 0) {
		return json({ error: 'Bad request' }, { status: 400 });
	}

	try {
		const userId = await getOrCreateUser(clerkId);
		const cached = await getGameTileReview(userId, gameId);
		if (!cached.found) {
			return json({ error: 'Not found' }, { status: 404 });
		}
		if (cached.review) {
			return json({ reviews: cached.review, cached: true });
		}

		// Cache miss — the expensive path.
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

		const result = await getTileReview(moments);
		const reviews = mergeReviewedDealIns(moments, result);
		// Best-effort: a failed cache write must not cost the player the review
		// they just paid for.
		const saved = await saveGameTileReview(userId, gameId, reviews).catch((e) => {
			console.error('tile review cache write failed:', e);
			return false;
		});
		if (!saved) console.error(`tile review cache not saved for game ${gameId}`);
		return json({ reviews, cached: false });
	} catch (e) {
		console.error('Tile review failed:', e);
		return json({ error: 'Review unavailable right now.' }, { status: 500 });
	}
};
