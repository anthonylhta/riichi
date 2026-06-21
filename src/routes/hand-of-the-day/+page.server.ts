import type { PageServerLoad } from './$types';
import { getTodayPuzzle, toPublicPuzzle, toAnswer } from '$lib/server/handOfTheDay';
import { getOrCreateUser } from '$lib/server/users';
import { computeStreak, getResult } from '$lib/server/streak';
import { sydneyDate } from '$lib/server/day';
import type { StreakInfo, DayResult } from '$lib/game/hotd';

// The puzzle is now curated (no API/DB lookup), so it's derived synchronously and
// returned directly — no streaming needed. The answer is still withheld from the
// payload, revealed only after a tile is submitted (POST /api/hand-of-the-day/answer)
// so streaks are graded server-side — UNLESS the signed-in user already answered
// today, in which case we send the solved state (their locked choice + the revealed
// answer) so a revisit shows their result.
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

	try {
		const today = getTodayPuzzle(date);
		return {
			today: {
				date: today.date,
				puzzle: toPublicPuzzle(today.puzzle),
				answer: answered ? toAnswer(today.puzzle) : null
			},
			error: null as string | null,
			signedIn,
			streak,
			result
		};
	} catch (e) {
		console.error('Hand of the Day failed:', e);
		return {
			today: null,
			error: 'Could not load today’s puzzle. Please try again later.' as string | null,
			signedIn,
			streak,
			result
		};
	}
};
