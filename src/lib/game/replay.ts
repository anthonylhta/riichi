// Deterministic game replay. The whole engine is deterministic given the wall
// (the only randomness is the initial shuffle), so a game is fully reproducible
// from: each round's wall + the ordered list of human inputs. We capture those
// during play (see stores/game.ts) and re-run them through the SAME settle loop
// the live app uses (autoplay.ts) — so a replay reproduces live play, freezes and
// all. This is the tool for reproducing a stuck game off a player's report.

import type { GameState } from './types';
import type { GameTile } from './tiles';
import { settle } from './autoplay';
import {
	initGame,
	continueGame,
	humanDiscard,
	humanDeclareTsumo,
	humanDeclareRon,
	humanClaimPon,
	humanClaimChi,
	humanClaimDaiminkan,
	humanDeclareAnkan,
	humanDeclareKakan,
	humanDeclareKyuushu,
	humanPassClaim
} from './engine';

// One human action. Tile references are stored as physical tile ids (0–135), which
// are stable across a replay because the same wall deals the same tiles.
export type ReplayInput =
	| { t: 'discard'; tileId: number; riichi: boolean }
	| { t: 'tsumo' }
	| { t: 'ron' }
	| { t: 'pon'; tileIds: number[] }
	| { t: 'chi'; tileIds: number[] }
	| { t: 'daiminkan'; tileIds: number[] }
	| { t: 'ankan'; code: number }
	| { t: 'kakan'; meldIndex: number }
	| { t: 'kyuushu' }
	| { t: 'pass' }
	// `wall` is the next hand's wall, or null when this nextRound ended the game
	// (game_end deals no new hand). Attaching it to the input keeps walls aligned
	// with the rounds they belong to — no separate index to drift.
	| { t: 'nextRound'; wall: GameTile[] | null };

export interface ReplayLog {
	version: 1;
	startWall: GameTile[] | null; // round 0's full 136-tile deal-order wall
	inputs: ReplayInput[];
}

export function newReplayLog(): ReplayLog {
	return { version: 1, startWall: null, inputs: [] };
}

// The full original wall lives, untouched, in liveWall ++ deadWall (draws only
// advance an index). Capture it once at the start of a round.
export function wallFromState(state: GameState): GameTile[] {
	return [...state.liveWall, ...state.deadWall].map((t) => ({ ...t }));
}

function tilesById(state: GameState, ids: number[]): GameTile[] {
	const hand = state.players[0].hand;
	return ids
		.map((id) => hand.find((t) => t.id === id))
		.filter((t): t is GameTile => t !== undefined);
}

// Apply one input exactly as the store does — matching which actions settle (run
// out AI turns) and which just transition (a win, or a call that hands the human
// their discard). `walls` is the queue of not-yet-consumed round walls.
async function applyInput(state: GameState, input: ReplayInput): Promise<GameState> {
	switch (input.t) {
		case 'discard':
			return settle(await humanDiscard(state, input.tileId, input.riichi));
		case 'tsumo':
			return humanDeclareTsumo(state);
		case 'ron':
			return humanDeclareRon(state);
		case 'pon':
			return humanClaimPon(state, tilesById(state, input.tileIds));
		case 'chi':
			return humanClaimChi(state, tilesById(state, input.tileIds));
		case 'daiminkan':
			return settle(await humanClaimDaiminkan(state, tilesById(state, input.tileIds)));
		case 'ankan':
			return settle(await humanDeclareAnkan(state, input.code));
		case 'kakan':
			return settle(await humanDeclareKakan(state, input.meldIndex));
		case 'kyuushu':
			// Abortive draw (round_end); nothing to settle, like tsumo/ron.
			return humanDeclareKyuushu(state);
		case 'pass':
			return settle(await humanPassClaim(state));
		case 'nextRound':
			return settle(continueGame(state, input.wall ?? undefined));
	}
}

export interface ReplayResult {
	states: GameState[]; // [initial settled, ...after each input]
	final: GameState;
}

export async function replayGame(log: ReplayLog): Promise<ReplayResult> {
	if (!log.startWall) throw new Error('replayGame: log has no startWall');

	let state = await settle(initGame(log.startWall.map((t) => ({ ...t }))));
	const states: GameState[] = [state];
	for (const input of log.inputs) {
		state = await applyInput(state, input);
		states.push(state);
	}
	return { states, final: state };
}
