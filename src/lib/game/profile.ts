// Client-facing profile types, shared by the server (profileLogic/profile) and the
// /profile page so neither side imports the other's server module. HotD-only for
// now; game stats (win rate, deal-ins) arrive once finished games are persisted.

import type { StreakInfo } from './hotd';

// One day's Hand-of-the-Day outcome, trimmed to what the profile renders.
export interface PuzzleDay {
	date: string; // Sydney 'YYYY-MM-DD'
	correct: boolean;
}

// Aggregated Hand-of-the-Day performance for one user.
export interface ProfileSummary {
	streak: StreakInfo;
	totalAnswered: number;
	totalCorrect: number;
	accuracy: number; // integer percent (0–100); 0 when nothing answered yet
	recent: PuzzleDay[]; // most-recent first, capped (see RECENT_LIMIT)
}

// Aggregated solo-game performance for one user, derived from saved games.
// Rates are integer percents (0–100); avgPlacement is 1–4 to one decimal.
// All zero when no games have been saved yet (`gamesPlayed === 0`).
export interface GameStats {
	gamesPlayed: number;
	totalRounds: number;
	firstRate: number; // % of games finished in 1st
	avgPlacement: number; // mean finishing rank, 1–4
	agariRate: number; // % of hands (rounds) the player won
	dealInRate: number; // % of hands the player dealt into
}

// Identity pulled from Clerk for the account header.
export interface AccountInfo {
	name: string | null;
	email: string | null;
	imageUrl: string | null;
	memberSince: number; // Clerk createdAt, epoch ms
}
