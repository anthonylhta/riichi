import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTodayPuzzle, toPublicPuzzle } from '$lib/server/handOfTheDay';

// Public, read-only: today's hand, ANSWER-STRIPPED. For external read-only consumers
// (the anthonyta hub's display-only riichi surface — see its ADR 0047). The answer is
// withheld here exactly as it is from the page payload — it's revealed only by
// POST /answer — so this can't be used to peek. Synchronous + pure (no DB), so it's
// cheap; cached briefly since the puzzle only changes once a day. (notes ADR 0074)
export const GET: RequestHandler = () => {
	const { date, puzzle } = getTodayPuzzle();
	return json(
		{ date, puzzle: toPublicPuzzle(puzzle) },
		{ headers: { 'cache-control': 'public, max-age=300' } }
	);
};
