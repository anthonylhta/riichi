import { writable, get } from 'svelte/store';
import type { GameState } from '$lib/game/types';
import { initGame, humanDiscard, humanDeclareRon, stepAiTurn, canHumanRon } from '$lib/game/engine';

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

export async function discard(tileId: number) {
	const current = get(gameState);
	if (!current) return;
	try {
		const next = await humanDiscard(current, tileId);
		gameState.set(next);
		if (next.phase === 'ai_turn') {
			await runUntilPlayerTurn(next);
		}
	} catch (e) {
		console.error('discard failed:', e);
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

export function canRon(): boolean {
	const current = get(gameState);
	if (!current) return false;
	return canHumanRon(current);
}
