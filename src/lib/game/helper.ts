// Shared types + builder for the in-round AI helper. Lives outside $lib/server so
// the client can build the view and render the advice; the server module imports
// these types too. The view carries ONLY what a human player can see — never the
// opponents' concealed hands or the wall order.

import type { GameState, Seat } from './types';
import type { TileCode } from './tiles';

export interface HelperMeld {
	type: string;
	tiles: TileCode[];
}

export interface HelperSeatView {
	seat: number;
	isYou: boolean;
	wind: TileCode; // seat wind (28–31)
	isRiichi: boolean;
	score: number;
	discards: TileCode[];
	melds: HelperMeld[];
	concealedCount: number; // how many face-down tiles they hold (count only)
}

export interface HelperView {
	round: number;
	honba: number;
	roundWind: TileCode; // East-only ruleset for now (28)
	wallCount: number;
	doraIndicators: TileCode[];
	hand: TileCode[]; // your concealed hand (incl. the drawn tile)
	melds: HelperMeld[]; // your melds
	seats: HelperSeatView[]; // all four seats, visible info only
}

export interface HelperAdvice {
	discard: string; // tile notation (e.g. "3p"), or "—" when no clear discard
	reasoning: string;
	plan: string; // one-line strategic direction
}

function meldView(melds: GameState['players'][number]['melds']): HelperMeld[] {
	return melds.map((m) => ({ type: m.type, tiles: m.tiles.map((t) => t.code) }));
}

// Build the human-visible view of the current state, from seat 0's perspective.
export function buildHelperView(state: GameState): HelperView {
	const seatWind = (s: Seat) => (28 + ((s - state.dealer + 4) % 4)) as TileCode;
	const me = state.players[0];

	return {
		round: state.round,
		honba: state.honba,
		roundWind: 28 as TileCode,
		wallCount: state.liveWall.length - state.wallPos,
		doraIndicators: state.doraIndicators.map((t) => t.code),
		hand: me.hand.map((t) => t.code),
		melds: meldView(me.melds),
		seats: state.players.map((p) => ({
			seat: p.seat,
			isYou: p.seat === 0,
			wind: seatWind(p.seat),
			isRiichi: p.isRiichi,
			score: p.score,
			discards: p.discards.map((t) => t.code),
			melds: meldView(p.melds),
			concealedCount: p.hand.length
		}))
	};
}
