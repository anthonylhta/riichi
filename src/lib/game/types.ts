import type { GameTile } from './tiles';

export type Seat = 0 | 1 | 2 | 3;
export type AiDifficulty = 'basic' | 'good';

export interface Meld {
	type: 'pon' | 'chi' | 'ankan' | 'daiminkan' | 'kakan';
	tiles: GameTile[];
	calledFrom: Seat | null; // null for ankan
}

export interface ClaimOption {
	type: 'pon' | 'chi' | 'kan';
	handTiles: GameTile[];
}

export interface PlayerState {
	seat: Seat;
	hand: GameTile[];
	discards: GameTile[];
	melds: Meld[];
	score: number;
	isHuman: boolean;
	difficulty: AiDifficulty | null;
	isRiichi: boolean;
	isDoubleRiichi: boolean;
	isIppatsu: boolean;
	riichiTile: GameTile | null;
	isFuriten: boolean; // own-discard furiten — any wait tile appears in own discards
	isTempFuriten: boolean; // passed on a ron opportunity; clears after next discard (unless in riichi)
}

export type GamePhase =
	| 'dealing'
	| 'player_discard' // waiting for human to discard
	| 'claim_decision' // waiting for human to ron/pon/chi/pass
	| 'ai_turn'
	| 'round_end'
	| 'game_end';

export interface RoundResult {
	winner: Seat;
	winType: 'tsumo' | 'ron';
	loser: Seat | null;
	han: number;
	fu: number;
	score: number;
	pointChanges: [number, number, number, number];
}

export interface GameState {
	phase: GamePhase;
	round: number;
	honba: number;
	dealer: Seat;
	currentSeat: Seat;
	turnCount: number;

	liveWall: GameTile[];
	wallPos: number;
	deadWall: GameTile[];
	rinshankPos: number; // 0–3, index into deadWall for next rinshan draw
	doraIndicators: GameTile[];
	uraDoraIndicators: GameTile[]; // revealed only on riichi wins; mirrors doraIndicators count

	anyCallMadeThisRound: boolean; // pon/chi/kan made; cancels ippatsu + disqualifies chihou/tenhou

	players: [PlayerState, PlayerState, PlayerState, PlayerState];

	lastDiscard: GameTile | null;
	lastDiscardSeat: Seat | null;

	pendingTsumo: RoundResult | null; // non-null when player can tsumo
	pendingRon: RoundResult | null; // non-null during claim_decision
	claimOptions: ClaimOption[] | null; // pon/chi options during claim_decision

	roundResult: RoundResult | null;
}
