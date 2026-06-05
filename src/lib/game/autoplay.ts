// The deterministic "settle" loop: after any state change, run out the AI turns
// and (in riichi) auto-tsumogiri until control is back with the human or the round
// ends. This is the SINGLE source of stepping logic — the live store drives it with
// an animation delay + per-step commit, and the replay harness drives it with no
// delay. Keeping one loop means a replay reproduces live play (and its freezes)
// exactly. Store-independent: it threads a local `current` and never touches a store.

import type { GameState } from './types';
import { stepAiTurn, humanDiscard, getPlayerKanOptions } from './engine';

const SAFETY = 200;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SettleOptions {
	// Called after every committed state change (the store uses this to update the UI).
	onStep?: (state: GameState) => void | Promise<void>;
	// Animation pacing between AI steps; 0 for replay/tests.
	delayMs?: number;
}

async function runAiTurns(
	state: GameState,
	commit: (s: GameState) => Promise<void>,
	delayMs: number
): Promise<GameState> {
	let current = state;
	let safety = 0;
	while (current.phase === 'ai_turn' && safety < SAFETY) {
		if (delayMs) await sleep(delayMs);
		current = await stepAiTurn(current);
		await commit(current);
		safety++;
	}
	return current;
}

export async function settle(state: GameState, opts: SettleOptions = {}): Promise<GameState> {
	const { onStep, delayMs = 0 } = opts;
	let current = state;
	const commit = async (s: GameState) => {
		current = s;
		if (onStep) await onStep(s);
	};

	await commit(state);

	if (current.phase === 'ai_turn') current = await runAiTurns(current, commit, delayMs);

	// Once in riichi the hand is locked, so each draw is tsumogiri'd automatically —
	// unless the draw wins (Tsumo) or offers a kan, where we stop for the player.
	let safety = 0;
	while (safety < SAFETY) {
		if (current.phase !== 'player_discard' || current.currentSeat !== 0) break;
		const me = current.players[0];
		if (!me.isRiichi || current.pendingTsumo) break;
		const kan = getPlayerKanOptions(current);
		if (kan.ankan.length > 0 || kan.kakan.length > 0) break;

		if (delayMs) await sleep(delayMs);
		const drawn = me.hand[me.hand.length - 1]; // drawTile appends without re-sorting
		current = await humanDiscard(current, drawn.id, false);
		await commit(current);
		if (current.phase === 'ai_turn') current = await runAiTurns(current, commit, delayMs);
		safety++;
	}

	return current;
}
