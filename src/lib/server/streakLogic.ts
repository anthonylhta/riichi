import { addDays } from './day';
import type { StreakInfo } from '$lib/game/hotd';

// Pure streak computation under the "answer correctly" rule, kept free of any DB
// import so it's unit-testable. `days` is the user's full per-day history; `today`
// is the Sydney calendar day.
export function streakFromDays(
	days: { date: string; correct: boolean }[],
	today: string
): StreakInfo {
	const correctByDate = new Map<string, boolean>();
	for (const d of days) correctByDate.set(d.date, d.correct);

	// Current: walk back from today (or yesterday, if today isn't answered yet —
	// the streak is still alive and can be extended) while each day is correct.
	let current = 0;
	let cursor = correctByDate.has(today) ? today : addDays(today, -1);
	while (correctByDate.get(cursor) === true) {
		current++;
		cursor = addDays(cursor, -1);
	}

	// Best: longest run of contiguous calendar days that are all correct.
	let best = 0;
	let run = 0;
	let prev: string | null = null;
	for (const date of [...correctByDate.keys()].sort()) {
		const contiguous = prev !== null && addDays(prev, 1) === date;
		run = correctByDate.get(date) ? (contiguous ? run + 1 : 1) : 0;
		if (run > best) best = run;
		prev = date;
	}

	const todayCorrect = correctByDate.has(today) ? correctByDate.get(today)! : null;
	return { current, best, todayDone: correctByDate.has(today), todayCorrect };
}
