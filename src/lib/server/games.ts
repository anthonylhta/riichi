import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from './db';
import { games } from './schema';
import { summarizeGames, type GameRow } from './gamesLogic';
import type { RoundRecord } from '$lib/game/review';
import type { ReplayLog } from '$lib/game/replay';
import type { GameStats } from '$lib/game/profile';
import type { GameDetail, GameListItem } from '$lib/game/history';

export interface SavedGameInput {
	finalScores: [number, number, number, number];
	rounds: RoundRecord[];
	// Deterministic move log (null when the client didn't capture one — e.g. a
	// game finished on a build predating replay persistence).
	replay: ReplayLog | null;
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
			rounds: input.rounds,
			replay: input.replay
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

// A user's saved games for the history list, most-recent first. The rounds jsonb
// stays in the database — only its length comes back.
export async function listGames(userId: number): Promise<GameListItem[]> {
	const db = getDb();
	const rows = await db
		.select({
			id: games.id,
			createdAt: games.createdAt,
			placement: games.placement,
			finalScores: games.finalScores,
			liked: games.liked,
			roundCount: sql<number>`jsonb_array_length(${games.rounds})`
		})
		.from(games)
		.where(eq(games.userId, userId))
		.orderBy(desc(games.createdAt));

	return rows.map((r) => ({
		id: r.id,
		playedAt: r.createdAt.getTime(),
		placement: r.placement,
		finalScores: r.finalScores as [number, number, number, number],
		roundCount: Number(r.roundCount),
		liked: r.liked
	}));
}

// One saved game in full, ownership-checked: null when the game doesn't exist
// OR belongs to someone else (the two cases are deliberately indistinguishable).
// The replay jsonb stays in the database — only its presence comes back (the
// blob itself is served by getGameReplay for the export download).
export async function getGame(userId: number, gameId: number): Promise<GameDetail | null> {
	const db = getDb();
	const rows = await db
		.select({
			id: games.id,
			createdAt: games.createdAt,
			placement: games.placement,
			finalScores: games.finalScores,
			winner: games.winner,
			liked: games.liked,
			rounds: games.rounds,
			hasReplay: sql<boolean>`${games.replay} is not null`
		})
		.from(games)
		.where(and(eq(games.id, gameId), eq(games.userId, userId)))
		.limit(1);
	if (!rows.length) return null;

	const r = rows[0];
	return {
		id: r.id,
		playedAt: r.createdAt.getTime(),
		placement: r.placement,
		finalScores: r.finalScores as [number, number, number, number],
		winner: r.winner,
		liked: r.liked,
		rounds: r.rounds as RoundRecord[],
		hasReplay: r.hasReplay
	};
}

// A saved game's move log, ownership-checked like getGame. Null when the game
// doesn't exist, isn't yours, or predates replay persistence.
export async function getGameReplay(userId: number, gameId: number): Promise<ReplayLog | null> {
	const db = getDb();
	const rows = await db
		.select({ replay: games.replay })
		.from(games)
		.where(and(eq(games.id, gameId), eq(games.userId, userId)))
		.limit(1);
	if (!rows.length) return null;
	return (rows[0].replay as ReplayLog | null) ?? null;
}

// Flag/unflag a game as kept. Ownership-checked like getGame; returns false when
// no owned row matched.
export async function setGameLiked(
	userId: number,
	gameId: number,
	liked: boolean
): Promise<boolean> {
	const db = getDb();
	const updated = await db
		.update(games)
		.set({ liked })
		.where(and(eq(games.id, gameId), eq(games.userId, userId)))
		.returning({ id: games.id });
	return updated.length > 0;
}
