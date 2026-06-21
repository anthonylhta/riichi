import { describe, it, expect } from 'vitest';
import { PUZZLES } from './puzzles';
import { buildPuzzle, selectPuzzleIndex } from './handOfTheDay';
import { toEffStr } from '$lib/game/tiles';

// Validates the whole curated pool against the real efficiency lib, so a malformed
// or non-instructive authored hand fails CI instead of reaching a visitor. Set
// PUZZLES_PRINT=1 to dump each hand's lib-derived answer while authoring
// (`npm run puzzles:check`).
describe('curated Hand-of-the-Day pool', () => {
	if (process.env.PUZZLES_PRINT) {
		it('prints each derived answer', () => {
			for (const [i, a] of PUZZLES.entries()) {
				const p = buildPuzzle(a);
				console.log(
					`#${i}  ${a.hand}\n` +
						`     best=${p.bestDiscards.map(toEffStr).join('/')}  ` +
						`shanten=${p.bestShanten}  ukeire=${p.ukeire} (${p.ukeireTiles.map(toEffStr).join(',')})`
				);
			}
			expect(PUZZLES.length).toBeGreaterThan(0);
		});
	}

	it.each(PUZZLES.map((a, i) => [i, a] as const))('puzzle #%i is valid', (_i, a) => {
		const p = buildPuzzle(a); // throws on malformed hand / winds
		expect(p.hand).toHaveLength(14);
		// Instructive: tenpai or 1-shanten, with a real choice and at least one tile
		// that advances the hand.
		expect(p.bestShanten).toBeLessThanOrEqual(1);
		expect(p.bestDiscards.length).toBeGreaterThan(0);
		expect(p.ukeireTiles.length).toBeGreaterThan(0);
		// A genuine decision: more than one distinct discard to consider.
		expect(new Set(p.hand).size).toBeGreaterThan(1);
		// Explanation written and references the answer's notation somewhere.
		expect(p.explanation.length).toBeGreaterThan(20);
	});
});

describe('selectPuzzleIndex', () => {
	it('is sequential from the epoch and wraps', () => {
		const n = PUZZLES.length;
		expect(selectPuzzleIndex('2026-06-21')).toBe(0);
		expect(selectPuzzleIndex('2026-06-22')).toBe(1 % n);
		expect(selectPuzzleIndex('2026-06-21')).toBe(0);
		// wraps after the pool is exhausted
		expect(selectPuzzleIndex(addDaysLocal('2026-06-21', n))).toBe(0);
		expect(selectPuzzleIndex(addDaysLocal('2026-06-21', n + 1))).toBe(1 % n);
	});

	it('maps dates before the epoch into range', () => {
		expect(selectPuzzleIndex('2026-06-20')).toBeGreaterThanOrEqual(0);
		expect(selectPuzzleIndex('2026-06-20')).toBeLessThan(PUZZLES.length);
	});
});

// local copy to avoid importing the server day helper's other exports here
function addDaysLocal(date: string, delta: number): string {
	const d = new Date(date + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + delta);
	return d.toISOString().slice(0, 10);
}
