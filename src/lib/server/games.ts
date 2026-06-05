import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { games } from './schema';
import { summarizeGames, type GameRow } from './gamesLogic';
import type { RoundRecord } from '$lib/game/review';
import type { GameStats } from '$lib/game/profile';

export interface SavedGameInput {
	finalScores: [number, number, number, number];
	rounds: RoundRecord[];
}

// Persist one finished game for a signed-in user. `winner` (top-scoring seat) and
// `placement` (human's rank) are derived here from the final scores so the client
// can't disagree with the stored standings.
export async function saveGame(userId: number, input: SavedGameInput): Promise<number> {
	const db = getDb();
	const ranked = input.finalScores
		.map((score, seat) => ({ score, seat }))
		.sort((a, b) => b.score - a.score);
	const winner = ranked[0].seat;
	const placement = ranked.findIndex((r) => r.seat === 0) + 1;

	const inserted = await db
		.insert(games)
		.values({
			userId,
			finalScores: input.finalScores,
			winner,
			placement,
			rounds: input.rounds
		})
		.returning({ id: games.id });
	return inserted[0].id;
}

// Aggregate a user's saved games into the profile's game stats.
export async function getGameStats(userId: number): Promise<GameStats> {
	const db = getDb();
	const rows = await db
		.select({ placement: games.placement, rounds: games.rounds })
		.from(games)
		.where(eq(games.userId, userId));
	return summarizeGames(rows as GameRow[]);
}
