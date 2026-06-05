// Pure aggregation of a user's Hand-of-the-Day history, kept free of any DB import
// so it's unit-testable. Reuses streakFromDays for the streak so there's a single
// source of truth for "what counts as a streak".

import { streakFromDays } from './streakLogic';
import type { ProfileSummary, PuzzleDay } from '$lib/game/profile';

// How many recent days the profile shows. The DB read is the full history (cheap —
// one row per day), but we only render a recent strip.
export const RECENT_LIMIT = 14;

export function summarizeResults(rows: PuzzleDay[], today: string): ProfileSummary {
	const totalAnswered = rows.length;
	const totalCorrect = rows.reduce((n, r) => n + (r.correct ? 1 : 0), 0);
	const accuracy = totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
	// Most-recent first; dates are 'YYYY-MM-DD' so lexicographic order == chronological.
	const recent = [...rows].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, RECENT_LIMIT);
	return {
		streak: streakFromDays(rows, today),
		totalAnswered,
		totalCorrect,
		accuracy,
		recent
	};
}
