import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrCreateToday, toAnswer } from '$lib/server/handOfTheDay';
import { getOrCreateUser } from '$lib/server/users';
import { recordResult, computeStreak } from '$lib/server/streak';
import type { TileCode } from '$lib/game/tiles';
import type { AnswerResponse } from '$lib/game/hotd';

// Server-side grading for the daily puzzle. The answer is revealed only here (it's
// withheld from the page payload), and for signed-in users the first answer of the
// day is recorded + locked, driving the correct-answer streak.
export const POST: RequestHandler = async ({ request, locals }) => {
	let body: { choiceCode?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Bad request' }, { status: 400 });
	}

	const choiceCode = Number(body.choiceCode) as TileCode;
	if (!Number.isInteger(choiceCode) || choiceCode < 1 || choiceCode > 34) {
		return json({ error: 'Invalid tile' }, { status: 400 });
	}

	const today = await getOrCreateToday();
	if (!today.puzzle.hand.includes(choiceCode)) {
		return json({ error: 'Tile not in hand' }, { status: 400 });
	}

	const answer = toAnswer(today.puzzle);
	const graded = today.puzzle.bestDiscards.includes(choiceCode);

	const clerkId = locals.auth().userId;
	if (!clerkId) {
		// Anonymous: grade + reveal, but nothing is saved and there's no streak.
		const res: AnswerResponse = { correct: graded, choiceCode, answer, streak: null };
		return json(res);
	}

	const userId = await getOrCreateUser(clerkId);
	// First answer of the day locks; a re-answer returns the original locked result.
	const locked = await recordResult(userId, today.date, choiceCode, graded);
	const streak = await computeStreak(userId, today.date);
	const res: AnswerResponse = {
		correct: locked.correct,
		choiceCode: locked.choiceCode as TileCode,
		answer,
		streak
	};
	return json(res);
};
