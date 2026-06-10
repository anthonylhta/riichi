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
	humanClaimDaiminkan
} from '$lib/game/engine';
import { settle } from '$lib/game/autoplay';
import { newReplayLog, wallFromState, type ReplayInput, type ReplayLog } from '$lib/game/replay';
import type { TileCode } from '$lib/game/tiles';
import { recordRound, type RoundRecord } from '$lib/game/review';

export const gameState = writable<GameState | null>(null);
export const gameLoading = writable(false);
export const gameError = writable<string | null>(null);
// Per-round log accumulated across the game, for the post-game overview.
export const gameLog = writable<RoundRecord[]>([]);

const AI_TURN_DELAY_MS = 500;

// ── Replay capture ──────────────────────────────────────────────────────────
// Record each round's wall + every human input so a game (a freeze included) can
// be reproduced via replayGame(). Mirrored to localStorage after every change so
// a stuck game survives a reload and can be exported for debugging.
const REPLAY_KEY = 'riichi:lastReplay';
let replayLog: ReplayLog = newReplayLog();

function mirrorReplay() {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(REPLAY_KEY, JSON.stringify(replayLog));
	} catch {
		// Quota / serialization issues shouldn't break gameplay.
	}
}

function recordInput(input: ReplayInput) {
	replayLog.inputs.push(input);
	mirrorReplay();
}

// The replay log of the current/last game — JSON-serializable. Use the console
// hook `window.riichiReplay()` to copy a frozen game's log for a bug report.
export function getReplayLog(): ReplayLog {
	return replayLog;
}

if (typeof window !== 'undefined') {
	(window as unknown as { riichiReplay: () => string }).riichiReplay = () =>
		JSON.stringify(replayLog);
}

// Run the shared settle loop (AI turns + riichi auto-tsumogiri), committing each
// step to the UI store with animation pacing. The replay harness drives the very
// same loop (autoplay.ts) with no delay, so a replay reproduces live play exactly.
async function settleTurns(state: GameState): Promise<void> {
	await settle(state, { delayMs: AI_TURN_DELAY_MS, onStep: (s) => gameState.set(s) });
}

export async function startGame() {
	gameLoading.set(true);
	gameError.set(null);
	try {
		gameLog.set([]);
		replayLog = newReplayLog();
		const initial = initGame();
		replayLog.startWall = wallFromState(initial);
		mirrorReplay();
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
		recordInput({ t: 'discard', tileId, riichi: declareRiichi });
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
		recordInput({ t: 'tsumo' });
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
		recordInput({ t: 'ron' });
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
		recordInput({ t: 'pon', tileIds: handTiles.map((t) => t.id) });
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
		recordInput({ t: 'chi', tileIds: handTiles.map((t) => t.id) });
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
		recordInput({ t: 'daiminkan', tileIds: handTiles.map((t) => t.id) });
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
		recordInput({ t: 'ankan', code });
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
		recordInput({ t: 'kakan', meldIndex });
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
		recordInput({ t: 'pass' });
		const next = await humanPassClaim(current);
		await settleTurns(next);
	} catch (e) {
		console.error('passClaim failed:', e);
	}
}

// Re-entry guard for nextRound: the settle loop below is async, so a fast
// double-click on "Next round" could read the same round_end state twice and
// record the finished round twice (duplicating it in the review payload and
// the saved game).
let advancingRound = false;

export async function nextRound() {
	const current = get(gameState);
	if (!current) return;
	if (current.phase !== 'round_end' || advancingRound) return;
	advancingRound = true;
	try {
		// Capture the round that just finished before advancing.
		const record = recordRound(current);
		const log = record ? [...get(gameLog), record] : get(gameLog);
		if (record) gameLog.set(log);
		const next = continueGame(current);
		// Capture the new hand's wall (null if the game just ended) on the input so
		// replay re-deals the same hand.
		recordInput({ t: 'nextRound', wall: next.phase === 'game_end' ? null : wallFromState(next) });
		await settleTurns(next);
		// The game just ended — persist it (signed-in only; the endpoint no-ops
		// for anonymous play). Fire-and-forget so the overlay isn't blocked.
		if (next.phase === 'game_end') void saveFinishedGame(next, log);
	} catch (e) {
		console.error('nextRound failed:', e);
	} finally {
		advancingRound = false;
	}
}

// POST the finished game to be saved against the signed-in account. Best-effort:
// any failure (anonymous, offline, server error) is swallowed — saving is not on
// the critical path of finishing a game.
async function saveFinishedGame(state: GameState, log: RoundRecord[]) {
	try {
		const finalScores = state.players.map((p) => p.score) as [number, number, number, number];
		await fetch('/api/games', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ finalScores, rounds: log })
		});
	} catch (e) {
		console.error('saveFinishedGame failed:', e);
	}
}
