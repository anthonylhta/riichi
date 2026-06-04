import { describe, it, expect } from 'vitest';
import { summarizeResults, RECENT_LIMIT } from './profileLogic';
import type { PuzzleDay } from '$lib/game/profile';

const TODAY = '2026-06-04';
const d = (date: string, correct: boolean): PuzzleDay => ({ date, correct });

describe('summarizeResults', () => {
	it('is empty with no history', () => {
		const s = summarizeResults([], TODAY);
		expect(s.totalAnswered).toBe(0);
		expect(s.totalCorrect).toBe(0);
		expect(s.accuracy).toBe(0);
		expect(s.recent).toEqual([]);
		expect(s.streak).toEqual({ current: 0, best: 0, todayDone: false, todayCorrect: null });
	});

	it('counts totals and rounds accuracy', () => {
		const s = summarizeResults(
			[d('2026-06-01', true), d('2026-06-02', false), d('2026-06-03', true)],
			TODAY
		);
		expect(s.totalAnswered).toBe(3);
		expect(s.totalCorrect).toBe(2);
		expect(s.accuracy).toBe(67); // 2/3 = 66.6% → 67
	});

	it('orders recent history most-recent first', () => {
		const s = summarizeResults(
			[d('2026-06-01', true), d('2026-06-03', true), d('2026-06-02', false)],
			TODAY
		);
		expect(s.recent.map((r) => r.date)).toEqual(['2026-06-03', '2026-06-02', '2026-06-01']);
	});

	it('caps recent history at RECENT_LIMIT, keeping the newest', () => {
		const rows = Array.from({ length: RECENT_LIMIT + 5 }, (_, i) => {
			const day = String(i + 1).padStart(2, '0');
			return d(`2026-05-${day}`, true);
		});
		const s = summarizeResults(rows, TODAY);
		expect(s.recent).toHaveLength(RECENT_LIMIT);
		expect(s.recent[0].date).toBe(`2026-05-${String(RECENT_LIMIT + 5).padStart(2, '0')}`);
	});

	it('delegates the streak to streakFromDays', () => {
		const s = summarizeResults(
			[d('2026-06-02', true), d('2026-06-03', true), d('2026-06-04', true)],
			TODAY
		);
		expect(s.streak.current).toBe(3);
		expect(s.streak.best).toBe(3);
	});
});
