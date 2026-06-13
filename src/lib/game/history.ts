// Client-facing game-history types, shared by the server (games.ts) and the
// profile/history pages so neither side imports the other's server module —
// same split as $lib/game/profile. The human is always seat 0; for seat/round
// labels and per-round text, reuse SEAT_NAMES/roundTag/summarize from ./review.

import type { RoundRecord } from './review';
import type { ReviewedDealIn } from './tileReview';

// One saved game as shown in the history list.
export interface GameListItem {
	id: number;
	playedAt: number; // epoch ms
	placement: number; // human's finishing rank, 1–4
	finalScores: [number, number, number, number];
	roundCount: number;
	liked: boolean;
}

// One saved game in full, for the round-by-round detail view. `hasReplay` says
// whether a move log was saved (games before replay persistence have none) —
// the log itself is only fetched by the export download.
export interface GameDetail {
	id: number;
	playedAt: number;
	placement: number;
	finalScores: [number, number, number, number];
	winner: number; // seat that finished 1st
	liked: boolean;
	rounds: RoundRecord[];
	hasReplay: boolean;
	tileReview: ReviewedDealIn[] | null; // cached verdicts, null until first run
}

const PLACE = ['1st', '2nd', '3rd', '4th'] as const;

export function placeLabel(placement: number): string {
	return PLACE[placement - 1] ?? `${placement}th`;
}
