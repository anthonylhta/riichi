import type { PageServerLoad } from './$types';
import { getOrCreateToday, toPublicPuzzle, toAnswer } from '$lib/server/handOfTheDay';
import { getOrCreateUser } from '$lib/server/users';
import { computeStreak, getResult } from '$lib/server/streak';
import { sydneyDate } from '$lib/server/day';
import type { StreakInfo, DayResult } from '$lib/game/hotd';

// The puzzle is streamed (see ADR 0034) so the shell paints instantly. The answer
// is withheld from the payload — it's revealed only after a tile is submitted
// (POST /api/hand-of-the-day/answer), so streaks can be graded server-side — UNLESS
// the signed-in user already answered today, in which case we send the solved state
// (their locked choice + the revealed answer) so a revisit shows their result.
export const load: PageServerLoad = async ({ locals }) => {
	const clerkId = locals.auth().userId;
	const date = sydneyDate();

	const signedIn = !!clerkId;
	let streak: StreakInfo | null = null;
	let result: DayResult | null = null;
	if (clerkId) {
		const userId = await getOrCreateUser(clerkId);
		[streak, result] = await Promise.all([computeStreak(userId, date), getResult(userId, date)]);
	}
	const answered = result !== null;

	const puzzle = getOrCreateToday()
		.then((today) => ({
			today: {
				date: today.date,
				puzzle: toPublicPuzzle(today.puzzle),
				answer: answered ? toAnswer(today.puzzle) : null
			},
			error: null as string | null
		}))
		.catch((e) => {
			console.error('Hand of the Day failed:', e);
			return {
				today: null,
				error: 'Could not load today’s puzzle. Please try again later.' as string | null
			};
		});

	return { puzzle, signedIn, streak, result };
};
