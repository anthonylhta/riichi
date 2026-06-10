import { describe, it, expect } from 'vitest';
import { roundTag, summarize } from './review';
import type { RoundRecord } from './review';

function round(overrides: Partial<RoundRecord> = {}): RoundRecord {
	return {
		round: 1,
		honba: 0,
		outcome: 'ron',
		winner: 0,
		loser: 2,
		han: 3,
		fu: 30,
		score: 5800,
		yaku: [{ name: 'Riichi', han: 1 }],
		tenpaiSeats: [],
		pointChanges: [5800, 0, -5800, 0],
		scoresAfter: [30800, 25000, 19200, 25000],
		...overrides
	};
}

describe('roundTag', () => {
	it('labels rounds 1–4 as East', () => {
		expect(roundTag(1, 0)).toBe('East-1');
		expect(roundTag(4, 0)).toBe('East-4');
	});

	it('labels rounds 5–8 as South (sudden-death overtime)', () => {
		expect(roundTag(5, 0)).toBe('South-1');
		expect(roundTag(8, 0)).toBe('South-4');
	});

	it('appends honba when non-zero', () => {
		expect(roundTag(2, 3)).toBe('East-2 (3 honba)');
	});
});

describe('summarize', () => {
	it('describes a win with han/fu and yaku', () => {
		const { kind, text } = summarize(round());
		expect(kind).toBe('win');
		expect(text).toContain('East-1');
		expect(text).toContain('3 han / 30 fu');
		expect(text).toContain('Riichi');
	});

	it('describes a deal-in with the winner seat name', () => {
		const { kind, text } = summarize(
			round({ winner: 2, loser: 0, pointChanges: [-5800, 0, 5800, 0] })
		);
		expect(kind).toBe('deal-in');
		expect(text).toContain('West');
		expect(text).toContain('-5800');
	});

	it('uses the South tag in overtime rounds', () => {
		const { text } = summarize(round({ round: 6 }));
		expect(text).toContain('South-2');
	});
});
