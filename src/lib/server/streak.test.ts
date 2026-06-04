import { describe, it, expect } from 'vitest';
import { streakFromDays } from './streakLogic';

const TODAY = '2026-06-04';
const d = (date: string, correct: boolean) => ({ date, correct });

describe('streakFromDays', () => {
	it('is zero with no history', () => {
		const s = streakFromDays([], TODAY);
		expect(s).toEqual({ current: 0, best: 0, todayDone: false, todayCorrect: null });
	});

	it('counts consecutive correct days ending today', () => {
		const s = streakFromDays(
			[d('2026-06-02', true), d('2026-06-03', true), d('2026-06-04', true)],
			TODAY
		);
		expect(s.current).toBe(3);
		expect(s.best).toBe(3);
		expect(s.todayDone).toBe(true);
		expect(s.todayCorrect).toBe(true);
	});

	it("keeps the streak alive when today isn't answered yet (counts to yesterday)", () => {
		const s = streakFromDays([d('2026-06-02', true), d('2026-06-03', true)], TODAY);
		expect(s.current).toBe(2);
		expect(s.todayDone).toBe(false);
		expect(s.todayCorrect).toBe(null);
	});

	it('breaks the current streak when today is answered wrong', () => {
		const s = streakFromDays(
			[d('2026-06-02', true), d('2026-06-03', true), d('2026-06-04', false)],
			TODAY
		);
		expect(s.current).toBe(0);
		expect(s.best).toBe(2); // the prior correct run still counts as the best
		expect(s.todayCorrect).toBe(false);
	});

	it('resets the current streak across a missed (absent) day', () => {
		// 06-01 correct, then 06-02 missing, then 06-03 + 06-04 correct.
		const s = streakFromDays(
			[d('2026-06-01', true), d('2026-06-03', true), d('2026-06-04', true)],
			TODAY
		);
		expect(s.current).toBe(2); // only 06-03 + 06-04 are contiguous to today
	});

	it('tracks best as the longest contiguous correct run, not the current one', () => {
		const s = streakFromDays(
			[
				d('2026-05-28', true),
				d('2026-05-29', true),
				d('2026-05-30', true),
				d('2026-05-31', true), // best run of 4
				// gap
				d('2026-06-04', true) // current run of 1
			],
			TODAY
		);
		expect(s.current).toBe(1);
		expect(s.best).toBe(4);
	});

	it('a wrong day between correct days breaks contiguity for best', () => {
		const s = streakFromDays(
			[
				d('2026-06-01', true),
				d('2026-06-02', false), // breaks
				d('2026-06-03', true),
				d('2026-06-04', true)
			],
			TODAY
		);
		expect(s.best).toBe(2);
		expect(s.current).toBe(2);
	});
});
