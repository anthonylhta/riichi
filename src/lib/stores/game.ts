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

export async function startGame() {
	gameLoading.set(true);
	gameError.set(null);
	try {
		const initial = initGame();
		gameState.set(initial);
		await runUntilPlayerTurn(initial);
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
		gameState.set(next);
		if (next.phase === 'ai_turn') {
			await runUntilPlayerTurn(next);
		}
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
		gameState.set(next);
		if (next.phase === 'ai_turn') {
			await runUntilPlayerTurn(next);
		}
	} catch (e) {
		console.error('claimDaiminkan failed:', e);
	}
}

export async function declareAnkan(code: TileCode) {
	const current = get(gameState);
	if (!current) return;
	try {
		const next = await humanDeclareAnkan(current, code);
		gameState.set(next);
		if (next.phase === 'ai_turn') {
			await runUntilPlayerTurn(next);
		}
	} catch (e) {
		console.error('declareAnkan failed:', e);
	}
}

export async function declareKakan(meldIndex: number) {
	const current = get(gameState);
	if (!current) return;
	try {
		const next = await humanDeclareKakan(current, meldIndex);
		gameState.set(next);
		if (next.phase === 'ai_turn') {
			await runUntilPlayerTurn(next);
		}
	} catch (e) {
		console.error('declareKakan failed:', e);
	}
}

export async function passClaim() {
	const current = get(gameState);
	if (!current) return;
	try {
		const next = await humanPassClaim(current);
		gameState.set(next);
		if (next.phase === 'ai_turn') {
			await runUntilPlayerTurn(next);
		}
	} catch (e) {
		console.error('passClaim failed:', e);
	}
}

export async function nextRound() {
	const current = get(gameState);
	if (!current) return;
	try {
		const next = continueGame(current);
		gameState.set(next);
		if (next.phase === 'ai_turn') {
			await runUntilPlayerTurn(next);
		}
	} catch (e) {
		console.error('nextRound failed:', e);
	}
}
