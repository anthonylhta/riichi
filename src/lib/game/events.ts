// Semantic game events. The engine appends one event to `state.events` at every
// observable action (deal, draw, discard, call, dora flip, win, draw-end), so the
// finished state carries a complete, self-describing record of the game — every
// seat's moves, not just the human's. This is what the ReplayLog deliberately is
// NOT (a seed + human-input tape, see replay.ts): replaying a log re-derives the
// AI's play, and the events that accumulate during that replay ARE the full game
// record. Exports (MJAI, a human-readable move list, an in-UI viewer) all read
// this stream rather than re-interpreting engine states.
//
// Events reflect what the engine actually did — should the engine ever deviate
// from the rulebook, the export must stay honest to the game as played, not to
// the rulebook.

import type { GameTile } from './tiles';
import type { AbortReason, Seat } from './types';

export type Scores = [number, number, number, number];

export type GameEvent =
	// Hand dealt; emitted before the dealer's first draw. `hands` are the four
	// 13-tile starting hands (sorted), `scores` the points carried into the round,
	// `riichiBets` the sticks carried from previous draws (kyotaku).
	| {
			type: 'round_start';
			round: number;
			honba: number;
			riichiBets: number;
			dealer: Seat;
			doraIndicator: GameTile;
			hands: [GameTile[], GameTile[], GameTile[], GameTile[]];
			scores: Scores;
	  }
	| { type: 'draw'; seat: Seat; tile: GameTile; rinshan: boolean }
	// `riichi` marks the riichi-declaring discard (the hand locks; the stick is
	// paid only once the discard survives every ron check — a ronned riichi
	// tile means the declaration never completed and no stick was paid).
	| { type: 'discard'; seat: Seat; tile: GameTile; riichi: boolean }
	| {
			type: 'call';
			call: 'pon' | 'chi' | 'daiminkan';
			seat: Seat;
			from: Seat;
			tile: GameTile;
			consumed: GameTile[]; // the caller's own tiles that joined the meld
	  }
	| { type: 'ankan'; seat: Seat; consumed: GameTile[] }
	// A kakan is emitted before the chankan check, so a robbed kan still appears
	// in the record (followed by the robber's win) — matching how it plays out.
	| { type: 'kakan'; seat: Seat; tile: GameTile; consumed: GameTile[] }
	| { type: 'dora'; indicator: GameTile }
	// `from` is the discarder on a ron (chankan: the kan declarer), null on tsumo.
	// `deltas` are the full point swings including honba and riichi-stick payouts.
	// `uraIndicators` is non-empty only for a riichi winner.
	| {
			type: 'win';
			seat: Seat;
			from: Seat | null;
			tile: GameTile | null;
			han: number;
			fu: number;
			score: number;
			yaku: { name: string; han: number }[];
			deltas: Scores;
			uraIndicators: GameTile[];
	  }
	// `abortive` is set for an abortive draw (kyuushu/suufon/suucha-riichi/
	// suukaikan/sanchahou): the hand is voided, deltas are all zero, tenpaiSeats
	// is empty. Absent for an ordinary exhaustive draw.
	| { type: 'ryuukyoku'; tenpaiSeats: Seat[]; deltas: Scores; abortive?: AbortReason }
	// Final scores after leftover riichi sticks settle to 1st place.
	| { type: 'game_end'; scores: Scores };
