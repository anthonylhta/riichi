import { writable, get } from 'svelte/store';
import type { GameState } from '$lib/game/types';
import type { GameTile } from '$lib/game/tiles';
import {
	initGame,
	continueGame,
	humanDiscard,
	humanDeclareTsumo,
	humanDeclareRon,
	humanClaimPon,
	humanClaimChi,
	humanPassClaim,
	humanDeclareAnkan,
	humanDeclareKakan,
	humanClaimDaiminkan,
	getPlayerKanOptions,
	stepAiTurn
} from '$lib/game/engine';
import type { TileCode } from '$lib/game/tiles';

export const gameState = writable<GameState | null>(null);
export const gameLoading = writable(false);
export const gameError = writable<string | null>(null);

const AI_TURN_DELAY_MS = 500;

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runUntilPlayerTurn(state: GameState): Promise<void> {
	let s = state;
	let safety = 0;
	while (s.phase === 'ai_turn' && safety < 200) {
		await sleep(AI_TURN_DELAY_MS);
		s = await stepAiTurn(s);
		gameState.set(s);
		safety++;
	}
}

// Once in riichi the hand is locked, so each draw is tsumogiri'd automatically
// (Mahjong-Soul style) — unless the draw wins (Tsumo) or offers a kan, where we
// stop and let the player decide. Chains through the AI turns it triggers.
async function autoTsumogiri(): Promise<void> {
	let safety = 0;
	while (safety < 200) {
		const s = get(gameState);
		if (!s || s.phase !== 'player_discard' || s.currentSeat !== 0) break;
		const me = s.players[0];
		if (!me.isRiichi || s.pendingTsumo) break;
		const kan = getPlayerKanOptions(s);
		if (kan.ankan.length > 0 || kan.kakan.length > 0) break;

		await sleep(AI_TURN_DELAY_MS);
		const drawn = me.hand[me.hand.length - 1]; // drawTile appends without re-sorting
		const next = await humanDiscard(s, drawn.id, false);
		gameState.set(next);
		if (next.phase === 'ai_turn') await runUntilPlayerTurn(next);
		safety++;
	}
}

// Set the state, run any AI turns, then handle riichi auto-tsumogiri. Every path
// that can hand the turn back to the human goes through here.
async function settleTurns(state: GameState): Promise<void> {
	gameState.set(state);
	if (state.phase === 'ai_turn') await runUntilPlayerTurn(state);
	await autoTsumogiri();
}

export async function startGame() {
	gameLoading.set(true);
	gameError.set(null);
	try {
		const initial = initGame();
		await settleTurns(initial);
	} catch (e) {
		gameError.set(String(e));
		console.error('startGame failed:', e);
	} finally {
		gameLoading.set(false);
	}
}

export async function discard(tileId: number, declareRiichi = false) {
	const current = get(gameState);
	if (!current) return;
	try {
		const next = await humanDiscard(current, tileId, declareRiichi);
		await settleTurns(next);
	} catch (e) {
		console.error('discard failed:', e);
	}
}

export async function declareTsumo() {
	const current = get(gameState);
	if (!current) return;
	try {
		const next = await humanDeclareTsumo(current);
		gameState.set(next);
	} catch (e) {
		console.error('declareTsumo failed:', e);
	}
}

export async function declareRon() {
	const current = get(gameState);
	if (!current) return;
	try {
		const next = await humanDeclareRon(current);
		gameState.set(next);
	} catch (e) {
		console.error('declareRon failed:', e);
	}
}

export function claimPon(handTiles: GameTile[]) {
	const current = get(gameState);
	if (!current) return;
	try {
		const next = humanClaimPon(current, handTiles);
		gameState.set(next);
	} catch (e) {
		console.error('claimPon failed:', e);
	}
}

export function claimChi(handTiles: GameTile[]) {
	const current = get(gameState);
	if (!current) return;
	try {
		const next = humanClaimChi(current, handTiles);
		gameState.set(next);
	} catch (e) {
		console.error('claimChi failed:', e);
	}
}

export async function claimDaiminkan(handTiles: GameTile[]) {
	const current = get(gameState);
	if (!current) return;
	try {
		const next = await humanClaimDaiminkan(current, handTiles);
		await settleTurns(next);
	} catch (e) {
		console.error('claimDaiminkan failed:', e);
	}
}

export async function declareAnkan(code: TileCode) {
	const current = get(gameState);
	if (!current) return;
	try {
		const next = await humanDeclareAnkan(current, code);
		await settleTurns(next);
	} catch (e) {
		console.error('declareAnkan failed:', e);
	}
}

export async function declareKakan(meldIndex: number) {
	const current = get(gameState);
	if (!current) return;
	try {
		const next = await humanDeclareKakan(current, meldIndex);
		await settleTurns(next);
	} catch (e) {
		console.error('declareKakan failed:', e);
	}
}

export async function passClaim() {
	const current = get(gameState);
	if (!current) return;
	try {
		const next = await humanPassClaim(current);
		await settleTurns(next);
	} catch (e) {
		console.error('passClaim failed:', e);
	}
}

export async function nextRound() {
	const current = get(gameState);
	if (!current) return;
	try {
		const next = continueGame(current);
		await settleTurns(next);
	} catch (e) {
		console.error('nextRound failed:', e);
	}
}
