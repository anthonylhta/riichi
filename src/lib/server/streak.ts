import { and, eq } from 'drizzle-orm';
import { getDb } from './db';
import { puzzleResults } from './schema';
import { streakFromDays } from './streakLogic';
import type { StreakInfo, DayResult } from '$lib/game/hotd';

// Read one user/day result (null if they haven't answered that day).
export async function getResult(userId: number, date: string): Promise<DayResult | null> {
	const db = getDb();
	const rows = await db
		.select({
			date: puzzleResults.date,
			choiceCode: puzzleResults.choiceCode,
			correct: puzzleResults.correct
		})
		.from(puzzleResults)
		.where(and(eq(puzzleResults.userId, userId), eq(puzzleResults.date, date)))
		.limit(1);
	return rows[0] ?? null;
}

// Record a day's answer. The unique (userId, date) constraint + onConflictDoNothing
// means the FIRST answer locks the day — re-answering is a no-op. Returns the
// authoritative (locked) row.
export async function recordResult(
	userId: number,
	date: string,
	choiceCode: number,
	correct: boolean
): Promise<DayResult> {
	const db = getDb();
	await db
		.insert(puzzleResults)
		.values({ userId, date, choiceCode, correct })
		.onConflictDoNothing();
	return (await getResult(userId, date))!;
}

// Current + best streak for a user, read from the full per-day history.
// `today` is the Sydney calendar day.
export async function computeStreak(userId: number, today: string): Promise<StreakInfo> {
	const db = getDb();
	const rows = await db
		.select({ date: puzzleResults.date, correct: puzzleResults.correct })
		.from(puzzleResults)
		.where(eq(puzzleResults.userId, userId));
	return streakFromDays(rows, today);
}
