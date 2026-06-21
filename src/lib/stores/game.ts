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
	humanDeclareKyuushu
} from '$lib/game/engine';
import { settle } from '$lib/game/autoplay';
import {
	newReplayLog,
	replayGame,
	wallFromState,
	type ReplayInput,
	type ReplayLog
} from '$lib/game/replay';
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
// a stuck game survives a reload and can be exported for debugging — and, since
// the mirror carries a status, an interrupted game can be RESUMED: 'live' means
// unfinished (offer to pick it up on the next /game visit), 'done' means it
// finished or the player knowingly abandoned it.
const REPLAY_KEY = 'riichi:lastReplay';
let replayLog: ReplayLog = newReplayLog();
let replayStatus: 'live' | 'done' = 'live';

// What sits under REPLAY_KEY. (Pre-resume mirrors stored the bare ReplayLog;
// those are unreadable as a wrapper and so are simply never offered for resume.)
//
// `saved` marks a finished game already persisted server-side, so the post
// sign-in retro-save (retroSaveLastGame) can't double-save it. It's absent on a
// live game and on a finished anonymous game (which was never saved) — both
// read as falsy, i.e. "not yet saved".
interface ReplayMirror {
	v: 1;
	status: 'live' | 'done';
	saved?: boolean;
	log: ReplayLog;
}

function mirrorReplay() {
	if (typeof localStorage === 'undefined') return;
	try {
		const mirror: ReplayMirror = { v: 1, status: replayStatus, log: replayLog };
		localStorage.setItem(REPLAY_KEY, JSON.stringify(mirror));
	} catch {
		// Quota / serialization issues shouldn't break gameplay.
	}
}

function recordInput(input: ReplayInput) {
	replayLog.inputs.push(input);
	mirrorReplay();
}

// Patch the mirror in place to mark its game as persisted server-side. Read +
// rewritten directly (not via mirrorReplay) so it operates on whatever finished
// game currently sits under the key — used both by the normal signed-in save and
// by the post sign-in retro-save. No mirrorReplay runs after a game ends, so this
// flag is never clobbered.
function setSavedFlag() {
	if (typeof localStorage === 'undefined') return;
	try {
		const raw = localStorage.getItem(REPLAY_KEY);
		if (!raw) return;
		const mirror = JSON.parse(raw) as ReplayMirror;
		if (mirror?.v !== 1) return;
		mirror.saved = true;
		localStorage.setItem(REPLAY_KEY, JSON.stringify(mirror));
	} catch {
		// A missing/corrupt mirror just means nothing to mark.
	}
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
		replayStatus = 'live';
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

// ── Resume an interrupted game ──────────────────────────────────────────────

// The mirrored log of an unfinished game, if one exists — the offer shown on
// /game mount. Only a 'live' wrapper with a dealt wall qualifies; anything
// else (no mirror, finished/abandoned, pre-wrapper legacy shape, corruption)
// means a fresh deal.
export function loadResumableReplay(): ReplayLog | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(REPLAY_KEY);
		if (!raw) return null;
		const mirror = JSON.parse(raw) as Partial<ReplayMirror>;
		if (mirror?.v !== 1 || mirror.status !== 'live') return null;
		const log = mirror.log;
		if (!log || log.version !== 1 || !log.startWall || !Array.isArray(log.inputs)) return null;
		return log;
	} catch {
		return null;
	}
}

// Mark the current game knowingly abandoned (the exit panel's "Leave") so it
// is not offered for resume later.
export function abandonGame() {
	replayStatus = 'done';
	mirrorReplay();
}

// Re-derive the interrupted game from its log (same engine, no delays) and
// continue from the exact state. Also rebuilds the per-round review log: a
// round finishes right before each nextRound input, and replayGame's states[k]
// is the state BEFORE input k.
export async function resumeGame(log: ReplayLog) {
	gameLoading.set(true);
	gameError.set(null);
	try {
		const { states, final } = await replayGame(log);
		const rounds: RoundRecord[] = [];
		log.inputs.forEach((input, k) => {
			if (input.t === 'nextRound') {
				const r = recordRound(states[k]);
				if (r) rounds.push(r);
			}
		});
		gameLog.set(rounds);
		replayLog = log;
		// A mirror can be 'live' yet replay to game_end (e.g. the tab closed
		// before the finished status was written). Mark it done WITHOUT saving:
		// the original session already fired its save attempt.
		replayStatus = final.phase === 'game_end' ? 'done' : 'live';
		mirrorReplay();
		gameState.set(final);
	} catch (e) {
		// A stale or corrupt mirror must never trap the player — deal fresh.
		console.error('resumeGame failed, dealing a fresh game:', e);
		await startGame();
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

// Kyuushu kyuuhai — the player aborts their first-draw nine-terminals/honors hand.
export async function declareKyuushu() {
	const current = get(gameState);
	if (!current) return;
	try {
		recordInput({ t: 'kyuushu' });
		const next = humanDeclareKyuushu(current);
		await settleTurns(next);
	} catch (e) {
		console.error('declareKyuushu failed:', e);
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
		// The game just ended — mark the mirror finished (no resume offer) and
		// persist it (signed-in only; the endpoint no-ops for anonymous play).
		// Fire-and-forget so the overlay isn't blocked.
		if (next.phase === 'game_end') {
			replayStatus = 'done';
			mirrorReplay();
			void saveFinishedGame(next, log);
		}
	} catch (e) {
		console.error('nextRound failed:', e);
	} finally {
		advancingRound = false;
	}
}

// POST the finished game to be saved against the signed-in account. Best-effort:
// any failure (anonymous, offline, server error) is swallowed — saving is not on
// the critical path of finishing a game. The replay log is complete here: the
// final nextRound input is recorded before settleTurns yields game_end.
async function saveFinishedGame(state: GameState, log: RoundRecord[]) {
	try {
		const finalScores = state.players.map((p) => p.score) as [number, number, number, number];
		const res = await fetch('/api/games', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ finalScores, rounds: log, replay: replayLog })
		});
		const data = (await res.json().catch(() => null)) as { saved?: boolean } | null;
		// Signed-in: mark the mirror saved so the post sign-in retro-save skips it.
		// Anonymous: saved:false — leave it eligible for retro-save once they sign in.
		if (data?.saved) setSavedFlag();
	} catch (e) {
		console.error('saveFinishedGame failed:', e);
	}
}

// Retro-save the last finished game after the player signs in. An anonymous
// player's finished game is mirrored to localStorage ('done') but never saved —
// the /api/games POST no-ops without an account. When they sign in (typically via
// the game-end nudge), this replays that mirror to rebuild its rounds + final
// scores and saves it against the now-signed-in account, making the nudge's "Sign
// in to save your games" promise real. Safe to call on every sign-in:
//   - idempotent — a saved mirror is skipped, and the server marks the mirror
//     saved so a second call can't duplicate it;
//   - finished-only — an abandoned/unfinished mirror (status 'done' via the exit
//     panel but not at game_end) is never persisted (ADR 0039).
export async function retroSaveLastGame(): Promise<void> {
	if (typeof localStorage === 'undefined') return;
	let mirror: ReplayMirror;
	try {
		const raw = localStorage.getItem(REPLAY_KEY);
		if (!raw) return;
		mirror = JSON.parse(raw) as ReplayMirror;
	} catch {
		return;
	}
	if (mirror?.v !== 1 || mirror.status !== 'done' || mirror.saved) return;
	const log = mirror.log;
	if (!log || log.version !== 1 || !log.startWall || !Array.isArray(log.inputs)) return;

	try {
		const { states, final } = await replayGame(log);
		// Only a genuinely finished game is savable; an abandoned game also carries
		// status 'done' but never reaches game_end.
		if (final.phase !== 'game_end') return;

		// Rebuild the per-round log exactly as resumeGame does: a round finishes
		// right before each nextRound input, and states[k] is the state before
		// input k.
		const rounds: RoundRecord[] = [];
		log.inputs.forEach((input, k) => {
			if (input.t === 'nextRound') {
				const r = recordRound(states[k]);
				if (r) rounds.push(r);
			}
		});
		const finalScores = final.players.map((p) => p.score) as [number, number, number, number];

		const res = await fetch('/api/games', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ finalScores, rounds, replay: log })
		});
		const data = (await res.json().catch(() => null)) as { saved?: boolean } | null;
		// Only lock the mirror once the server actually persisted it — a still
		// anonymous response (saved:false) leaves it eligible for the next sign-in.
		if (data?.saved) setSavedFlag();
	} catch (e) {
		console.error('retroSaveLastGame failed:', e);
	}
}
