// Pure aggregation of a user's saved games, kept free of any DB import so it's
// unit-testable. The human is always seat 0, so a round's `winner === 0` is an
// agari and `loser === 0` is a deal-in.

import type { RoundRecord } from '$lib/game/review';
import type { GameStats } from '$lib/game/profile';

// One saved game, trimmed to what the stats need.
export interface GameRow {
	placement: number; // human's finishing rank, 1–4
	rounds: RoundRecord[];
}

const EMPTY: GameStats = {
	gamesPlayed: 0,
	totalRounds: 0,
	firstRate: 0,
	avgPlacement: 0,
	agariRate: 0,
	dealInRate: 0
};

export function summarizeGames(rows: GameRow[]): GameStats {
	const gamesPlayed = rows.length;
	if (!gamesPlayed) return EMPTY;

	let firsts = 0;
	let placementSum = 0;
	let totalRounds = 0;
	let agari = 0;
	let dealIns = 0;

	for (const g of rows) {
		if (g.placement === 1) firsts++;
		placementSum += g.placement;
		for (const r of g.rounds) {
			totalRounds++;
			if (r.winner === 0) agari++;
			if (r.loser === 0) dealIns++;
		}
	}

	const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
	return {
		gamesPlayed,
		totalRounds,
		firstRate: pct(firsts, gamesPlayed),
		avgPlacement: Math.round((placementSum / gamesPlayed) * 10) / 10,
		agariRate: pct(agari, totalRounds),
		dealInRate: pct(dealIns, totalRounds)
	};
}
