// Client-facing Hand-of-the-Day types, shared by the server (handOfTheDay/streak)
// and the page/PuzzleView so neither side imports the other's server module.

import type { TileCode } from './tiles';

// The puzzle before an answer is submitted — solution fields withheld.
export interface PublicPuzzle {
	hand: TileCode[];
	seatWind: TileCode;
	roundWind: TileCode;
	doraIndicator: TileCode;
	question: string;
}

// The solution, revealed only after a tile is submitted.
export interface PuzzleAnswer {
	bestDiscards: TileCode[];
	bestShanten: number;
	ukeire: number;
	ukeireTiles: TileCode[];
	explanation: string;
}

// A signed-in user's recorded answer for one day.
export interface DayResult {
	date: string;
	choiceCode: TileCode;
	correct: boolean;
}

export interface StreakInfo {
	current: number; // consecutive correct days ending today (or yesterday if today's not answered yet)
	best: number; // longest consecutive-correct run ever
	todayDone: boolean;
	todayCorrect: boolean | null;
}

// Response from POST /api/hand-of-the-day/answer.
export interface AnswerResponse {
	correct: boolean;
	choiceCode: TileCode; // the graded (locked, for signed-in users) choice
	answer: PuzzleAnswer;
	streak: StreakInfo | null; // null for anonymous players (nothing saved)
}
