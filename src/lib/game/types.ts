import type { GameTile } from './tiles';

export type Seat = 0 | 1 | 2 | 3;
export type AiDifficulty = 'basic' | 'good';

export interface PlayerState {
	seat: Seat;
	hand: GameTile[]; // 13 tiles at rest, 14 after drawing
	discards: GameTile[];
	score: number;
	isHuman: boolean;
	difficulty: AiDifficulty | null;
	isRiichi: boolean;
	riichiTile: GameTile | null;
}

export type GamePhase =
	| 'dealing'
	| 'player_discard' // waiting for human to click a tile
	| 'ai_turn'        // AI moves, automated
	| 'round_end'
	| 'game_end';

export interface RoundResult {
	winner: Seat;
	winType: 'tsumo' | 'ron';
	loser: Seat | null; // null = tsumo
	han: number;
	fu: number;
	score: number; // total points transferred
	pointChanges: [number, number, number, number];
}

export interface GameState {
	phase: GamePhase;
	round: number; // 1-4 (East 1-4)
	honba: number;
	dealer: Seat;
	currentSeat: Seat;
	turnCount: number;

	liveWall: GameTile[];
	wallPos: number;
	doraIndicators: GameTile[];

	players: [PlayerState, PlayerState, PlayerState, PlayerState];

	lastDiscard: GameTile | null;
	lastDiscardSeat: Seat | null;

	roundResult: RoundResult | null;
}
