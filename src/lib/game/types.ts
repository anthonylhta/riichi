import type { GameTile } from './tiles';
import type { GameEvent } from './events';

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
	yaku: { name: string; han: number }[];
	pointChanges: [number, number, number, number];
}

export interface ExhaustiveDrawResult {
	tenpaiSeats: Seat[];
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
	// One past the last drawable live-wall index. Starts at liveWall.length and
	// drops by one per kan: the dead wall stays 14 tiles by claiming the live
	// wall's tail, so each rinshan draw costs the round its final draw (this is
	// what keeps haitei timing correct).
	wallEnd: number;
	deadWall: GameTile[];
	rinshankPos: number; // 0–3, index into deadWall for next rinshan draw
	doraIndicators: GameTile[];
	uraDoraIndicators: GameTile[]; // revealed only on riichi wins; mirrors doraIndicators count
	// Dora indicators earned by a daiminkan/kakan but not yet revealed: minkan
	// dora flips only after the kan player's discard survives every ron check
	// (ankan flips immediately). Each pending count flips one dora + ura pair.
	pendingKanDora: number;

	anyCallMadeThisRound: boolean; // pon/chi/kan made; cancels ippatsu + disqualifies chihou/tenhou
	riichiBets: number; // count of 1000pt sticks on the table; awarded to the next winner
	// A riichi declared this discard whose 1000-point stick hasn't been paid yet:
	// the declaration completes (stick paid, riichiBets +1) only once the
	// declaring discard survives every ron check. A ronned riichi discard means
	// the riichi never completed and no stick is paid.
	pendingRiichi: Seat | null;

	players: [PlayerState, PlayerState, PlayerState, PlayerState];

	lastDiscard: GameTile | null;
	lastDiscardSeat: Seat | null;

	pendingTsumo: RoundResult | null; // non-null when player can tsumo
	pendingRon: RoundResult | null; // non-null during claim_decision
	claimOptions: ClaimOption[] | null; // pon/chi options during claim_decision

	roundResult: RoundResult | null;
	exhaustiveDrawResult: ExhaustiveDrawResult | null;

	// Append-only record of every observable action this game (all seats, all
	// rounds — carried across initRound). See events.ts; consumed by mjai.ts.
	events: GameEvent[];
}
