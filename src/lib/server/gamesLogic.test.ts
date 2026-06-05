import { describe, it, expect } from 'vitest';
import { summarizeGames, type GameRow } from './gamesLogic';
import type { RoundRecord } from '$lib/game/review';

// Minimal RoundRecord builder — only the fields summarizeGames reads matter.
function round(winner: number | null, loser: number | null): RoundRecord {
	return {
		round: 1,
		honba: 0,
		outcome: winner === null ? 'draw' : 'ron',
		winner,
		loser,
		han: null,
		fu: null,
		score: null,
		yaku: [],
		tenpaiSeats: [],
		pointChanges: [0, 0, 0, 0],
		scoresAfter: [25000, 25000, 25000, 25000]
	};
}

function game(placement: number, rounds: RoundRecord[]): GameRow {
	return { placement, rounds };
}

describe('summarizeGames', () => {
	it('is all-zero with no games', () => {
		expect(summarizeGames([])).toEqual({
			gamesPlayed: 0,
			totalRounds: 0,
			firstRate: 0,
			avgPlacement: 0,
			agariRate: 0,
			dealInRate: 0
		});
	});

	it('counts placement-based stats', () => {
		const rows = [game(1, []), game(2, []), game(1, []), game(4, [])];
		const s = summarizeGames(rows);
		expect(s.gamesPlayed).toBe(4);
		expect(s.firstRate).toBe(50); // 2/4
		expect(s.avgPlacement).toBe(2); // (1+2+1+4)/4 = 2.0
	});

	it('derives agari and deal-in rates from round outcomes (seat 0)', () => {
		const rows = [
			// You win one, deal in one, draw one.
			game(1, [round(0, null), round(2, 0), round(null, null)]),
			// Someone else wins both (neither agari nor deal-in for you).
			game(3, [round(1, 2), round(3, 1)])
		];
		const s = summarizeGames(rows);
		expect(s.totalRounds).toBe(5);
		expect(s.agariRate).toBe(20); // 1/5
		expect(s.dealInRate).toBe(20); // 1/5
	});

	it('rounds rates to the nearest percent', () => {
		const rows = [game(1, [round(0, null), round(2, 0), round(2, 0)])]; // 1 win, 2 deal-ins of 3
		const s = summarizeGames(rows);
		expect(s.agariRate).toBe(33); // 1/3 = 33.3%
		expect(s.dealInRate).toBe(67); // 2/3 = 66.6%
	});
});
