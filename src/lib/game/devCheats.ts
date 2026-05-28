import { get } from 'svelte/store';
import { gameState } from '$lib/stores/game';
import { checkTsumo, checkRon } from '$lib/game/engine';
import type { GameTile } from '$lib/game/tiles';
import type { GameState, Seat } from '$lib/game/types';

let devId = 900;
function dt(code: number): GameTile {
	return { code, id: devId++, isRed: false };
}

// Tanyao tenpai: sequences M2-4, M5-7, P2-4, S2-4 — tanki wait on S5 (code 23)
const TENPAI_13 = [2, 3, 4, 5, 6, 7, 11, 12, 13, 20, 21, 22, 23];
const WINNING_14 = [...TENPAI_13, 23]; // add second S5 to complete the pair

function patch(state: GameState, overrides: Partial<GameState>): GameState {
	return { ...state, ...overrides };
}

export async function devSetTenpai() {
	const state = get(gameState);
	if (!state) return;
	const hand = TENPAI_13.map(dt);
	const players = state.players.map((p, i) =>
		i === 0 ? { ...p, hand, melds: [] } : p
	) as GameState['players'];
	gameState.set(patch(state, { phase: 'player_discard', currentSeat: 0, players }));
}

export async function devSetWinningHand() {
	const state = get(gameState);
	if (!state) return;
	const hand = WINNING_14.map(dt);
	const players = state.players.map((p, i) =>
		i === 0 ? { ...p, hand, melds: [] } : p
	) as GameState['players'];
	const draft = patch(state, { phase: 'player_discard', currentSeat: 0, players });
	const tsumo = await checkTsumo(draft, 0);
	gameState.set(patch(draft, { pendingTsumo: tsumo }));
}

export async function devSetRonClaim() {
	const state = get(gameState);
	if (!state) return;
	const hand = TENPAI_13.map(dt);
	const discard = dt(23); // S5 — completes the pair
	const players = state.players.map((p, i) =>
		i === 0 ? { ...p, hand, melds: [] } : p
	) as GameState['players'];
	const draft = patch(state, { players, lastDiscard: discard, lastDiscardSeat: 1 });
	const ron = await checkRon(draft, 0, discard, 1);
	gameState.set(
		patch(draft, {
			phase: 'claim_decision',
			pendingRon: ron,
			claimOptions: []
		})
	);
}

export async function devSetPonClaim() {
	const state = get(gameState);
	if (!state) return;
	// Give player two S5s (code 23) plus 11 filler tiles = 13 hand tiles
	const tA = dt(23);
	const tB = dt(23);
	const discard = dt(23);
	const filler = [2, 3, 4, 5, 6, 7, 11, 12, 13, 20, 21].map(dt);
	const hand = [tA, tB, ...filler];
	const players = state.players.map((p, i) =>
		i === 0 ? { ...p, hand, melds: [] } : p
	) as GameState['players'];
	const draft = patch(state, { players, lastDiscard: discard, lastDiscardSeat: 1 });
	const ron = await checkRon(draft, 0, discard, 1);
	gameState.set(
		patch(draft, {
			phase: 'claim_decision',
			pendingRon: ron,
			claimOptions: [{ type: 'pon', handTiles: [tA, tB] as [GameTile, GameTile] }]
		})
	);
}

export async function devSetChiClaim() {
	const state = get(gameState);
	if (!state) return;
	// Player has M3 + M4; seat 3 discards M5 — chi completes M3-M4-M5
	const tA = dt(3); // M3
	const tB = dt(4); // M4
	const discard = dt(5); // M5 from seat 3 (directly left of player)
	const filler = [6, 7, 8, 11, 12, 13, 20, 21, 22, 23, 23].map(dt);
	const hand = [tA, tB, ...filler];
	const players = state.players.map((p, i) =>
		i === 0 ? { ...p, hand, melds: [] } : p
	) as GameState['players'];
	const draft = patch(state, { players, lastDiscard: discard, lastDiscardSeat: 3 as Seat });
	const ron = await checkRon(draft, 0, discard, 3 as Seat);
	gameState.set(
		patch(draft, {
			phase: 'claim_decision',
			pendingRon: ron,
			claimOptions: [{ type: 'chi', handTiles: [tA, tB] as [GameTile, GameTile] }]
		})
	);
}

// Ankan setup: player has 4 S5s (code 23) in hand — "Ankan 暗槓" button should appear.
export async function devSetAnkan() {
	const state = get(gameState);
	if (!state) return;
	const t1 = dt(23);
	const t2 = dt(23);
	const t3 = dt(23);
	const t4 = dt(23);
	const filler = [2, 3, 4, 5, 6, 7, 11, 12, 13].map(dt); // 9 filler tiles
	const hand = [t1, t2, t3, t4, ...filler]; // 13 tiles total
	const players = state.players.map((p, i) =>
		i === 0 ? { ...p, hand, melds: [] } : p
	) as GameState['players'];
	gameState.set(patch(state, { phase: 'player_discard', currentSeat: 0, players }));
}

// Kakan setup: player has an existing pon of S5 + one S5 in hand — "Kakan 加槓" button should appear.
export async function devSetKakan() {
	const state = get(gameState);
	if (!state) return;
	const ponA = dt(23);
	const ponB = dt(23);
	const ponC = dt(23);
	const addedTile = dt(23); // the 4th S5 to extend the pon
	const filler = [2, 3, 4, 5, 6, 7, 11, 12, 13, 20].map(dt); // 10 filler tiles
	const hand = [addedTile, ...filler]; // 11 tiles in hand (13 - 2 used in meld logic)
	const ponMeld = {
		type: 'pon' as const,
		tiles: [ponA, ponB, ponC],
		calledFrom: 1 as Seat
	};
	const players = state.players.map((p, i) =>
		i === 0 ? { ...p, hand, melds: [ponMeld] } : p
	) as GameState['players'];
	gameState.set(patch(state, { phase: 'player_discard', currentSeat: 0, players }));
}

// Daiminkan setup: player has 3 S5s; seat 1 just discarded S5 — "Kan 槓" button should appear in claim overlay.
export async function devSetDaiminkan() {
	const state = get(gameState);
	if (!state) return;
	const tA = dt(23);
	const tB = dt(23);
	const tC = dt(23);
	const discard = dt(23); // S5 discarded by seat 1
	const filler = [2, 3, 4, 5, 6, 7, 11, 12, 13, 20].map(dt); // 10 filler tiles
	const hand = [tA, tB, tC, ...filler]; // 13 tiles
	const players = state.players.map((p, i) =>
		i === 0 ? { ...p, hand, melds: [] } : p
	) as GameState['players'];
	const draft = patch(state, { players, lastDiscard: discard, lastDiscardSeat: 1 as Seat });
	const ron = await checkRon(draft, 0, discard, 1);
	gameState.set(
		patch(draft, {
			phase: 'claim_decision',
			pendingRon: ron,
			claimOptions: [{ type: 'kan', handTiles: [tA, tB, tC] }]
		})
	);
}

// Furiten setup: player is in tenpai waiting on S5, isTempFuriten=true, and seat 1 just
// discarded S5. Ron button should be absent; 振聴 badge should show.
export async function devSetFuriten() {
	const state = get(gameState);
	if (!state) return;

	const hand = TENPAI_13.map(dt); // 13 tiles, tanki wait on S5 (code 23)
	const discard = dt(23); // S5 — the winning tile
	const players = state.players.map((p, i) =>
		i === 0 ? { ...p, hand, melds: [], isTempFuriten: true, isFuriten: false } : p
	) as GameState['players'];

	gameState.set(
		patch(state, {
			players,
			lastDiscard: discard,
			lastDiscardSeat: 1,
			phase: 'claim_decision',
			pendingRon: null, // blocked by furiten
			claimOptions: []
		})
	);
}
