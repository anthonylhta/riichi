import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

// The store reads/writes localStorage only inside functions (never at module
// load), so a stub installed before the calls is enough — node has none.
const storage = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
	getItem: (k: string) => storage.get(k) ?? null,
	setItem: (k: string, v: string) => void storage.set(k, v),
	removeItem: (k: string) => void storage.delete(k),
	clear: () => storage.clear()
};

import {
	loadResumableReplay,
	resumeGame,
	abandonGame,
	retroSaveLastGame,
	gameState,
	gameLog
} from './game';
import { initGame, continueGame, humanDiscard, humanPassClaim } from '$lib/game/engine';
import { settle } from '$lib/game/autoplay';
import { newReplayLog, wallFromState, type ReplayLog } from '$lib/game/replay';

const REPLAY_KEY = 'riichi:lastReplay';

const liveMirror = (log: ReplayLog) => JSON.stringify({ v: 1, status: 'live', log });

// Drive a REAL engine game the way the store does (tsumogiri, pass claims,
// advance rounds), capturing the replay log — then stop, either mid-round
// after `minRounds` completed hands (an "interrupted" game) or at game_end.
async function captureGame(opts: { minRounds: number; stopMidRound: boolean }) {
	const log = newReplayLog();
	let state = await settle(initGame());
	log.startWall = wallFromState(state);

	let rounds = 0;
	for (let n = 0; n < 400; n++) {
		if (state.phase === 'game_end') break;
		if (state.phase === 'round_end') {
			const next = continueGame(state);
			log.inputs.push({
				t: 'nextRound',
				wall: next.phase === 'game_end' ? null : wallFromState(next)
			});
			state = await settle(next);
			rounds++;
		} else if (state.phase === 'claim_decision') {
			log.inputs.push({ t: 'pass' });
			state = await settle(await humanPassClaim(state));
		} else if (state.phase === 'player_discard' && state.currentSeat === 0) {
			if (opts.stopMidRound && rounds >= opts.minRounds && state.turnCount > 8) break;
			const drawn = state.players[0].hand[state.players[0].hand.length - 1];
			log.inputs.push({ t: 'discard', tileId: drawn.id, riichi: false });
			state = await settle(await humanDiscard(state, drawn.id, false));
		} else {
			break;
		}
	}
	return { log, state };
}

// Stub fetch for the save POST; default reply mimics a signed-in save.
function mockFetch(reply: { saved?: boolean } = { saved: true }) {
	const fn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
		async () => ({ json: async () => reply }) as unknown as Response
	);
	(globalThis as { fetch?: unknown }).fetch = fn;
	return fn;
}

const doneMirror = (log: ReplayLog, saved = false) =>
	JSON.stringify({ v: 1, status: 'done', saved, log });

beforeEach(() => {
	storage.clear();
	gameState.set(null);
	gameLog.set([]);
	(globalThis as { fetch?: unknown }).fetch = undefined;
});

describe('loadResumableReplay — what qualifies for the resume offer', () => {
	const validLog = (): ReplayLog => ({
		version: 1,
		startWall: [{ code: 1, id: 0, isRed: false }],
		inputs: []
	});

	it('returns null when nothing is mirrored', () => {
		expect(loadResumableReplay()).toBeNull();
	});

	it('returns null for a pre-wrapper legacy mirror (a bare ReplayLog)', () => {
		storage.set(REPLAY_KEY, JSON.stringify(validLog()));
		expect(loadResumableReplay()).toBeNull();
	});

	it('returns null for a finished/abandoned mirror', () => {
		storage.set(REPLAY_KEY, JSON.stringify({ v: 1, status: 'done', log: validLog() }));
		expect(loadResumableReplay()).toBeNull();
	});

	it('returns null for corrupted JSON or a log with no startWall', () => {
		storage.set(REPLAY_KEY, '{not json');
		expect(loadResumableReplay()).toBeNull();
		storage.set(REPLAY_KEY, liveMirror({ ...validLog(), startWall: null }));
		expect(loadResumableReplay()).toBeNull();
	});

	it('returns the log for a live mirror', () => {
		storage.set(REPLAY_KEY, liveMirror(validLog()));
		expect(loadResumableReplay()?.version).toBe(1);
	});
});

describe('abandonGame', () => {
	it('marks the mirror done so no resume is offered', () => {
		abandonGame();
		const mirror = JSON.parse(storage.get(REPLAY_KEY)!);
		expect(mirror.status).toBe('done');
		expect(loadResumableReplay()).toBeNull();
	});
});

describe('resumeGame — a real interrupted game', () => {
	it('re-derives the exact state and rebuilds the round log', async () => {
		const { log, state: liveState } = await captureGame({ minRounds: 1, stopMidRound: true });
		// The capture really did stop mid-round with completed hands behind it.
		expect(liveState.phase).toBe('player_discard');
		const roundsPlayed = log.inputs.filter((i) => i.t === 'nextRound').length;
		expect(roundsPlayed).toBeGreaterThanOrEqual(1);

		await resumeGame(JSON.parse(JSON.stringify(log)));

		const resumed = get(gameState);
		expect(resumed).not.toBeNull();
		// Same deterministic engine, same log — the resumed state IS the live one.
		expect(resumed!.phase).toBe(liveState.phase);
		expect(resumed!.round).toBe(liveState.round);
		expect(resumed!.turnCount).toBe(liveState.turnCount);
		expect(resumed!.players.map((p) => p.score)).toEqual(liveState.players.map((p) => p.score));
		expect(resumed!.players[0].hand.map((t) => t.id)).toEqual(
			liveState.players[0].hand.map((t) => t.id)
		);
		// One RoundRecord per finished hand, so the post-game review still works.
		expect(get(gameLog)).toHaveLength(roundsPlayed);
		// The adopted log keeps mirroring as live — still resumable after a reload.
		expect(loadResumableReplay()).not.toBeNull();
	}, 60000);

	it('a log that replays to game_end is marked done (no re-offer, no re-save)', async () => {
		const { log, state } = await captureGame({ minRounds: 99, stopMidRound: false });
		expect(state.phase).toBe('game_end');

		await resumeGame(JSON.parse(JSON.stringify(log)));

		expect(get(gameState)?.phase).toBe('game_end');
		expect(loadResumableReplay()).toBeNull();
	}, 60000);
});

describe('retroSaveLastGame — saving the last anonymous game after sign-in', () => {
	it('does nothing when there is no mirror', async () => {
		const fetchFn = mockFetch();
		await retroSaveLastGame();
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('does nothing for a live (unfinished) mirror', async () => {
		const fetchFn = mockFetch();
		storage.set(REPLAY_KEY, liveMirror({ version: 1, startWall: [], inputs: [] }));
		await retroSaveLastGame();
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('does nothing for an already-saved mirror (idempotent)', async () => {
		const { log } = await captureGame({ minRounds: 99, stopMidRound: false });
		const fetchFn = mockFetch();
		storage.set(REPLAY_KEY, doneMirror(log, true));
		await retroSaveLastGame();
		expect(fetchFn).not.toHaveBeenCalled();
	}, 60000);

	it('does NOT save an abandoned game (done but never reached game_end)', async () => {
		// A mid-round capture marked done = the exit panel's "Leave" path.
		const { log, state } = await captureGame({ minRounds: 1, stopMidRound: true });
		expect(state.phase).not.toBe('game_end');
		const fetchFn = mockFetch();
		storage.set(REPLAY_KEY, doneMirror(log));
		await retroSaveLastGame();
		expect(fetchFn).not.toHaveBeenCalled();
	}, 60000);

	it('replays a finished mirror, POSTs the rebuilt game, and locks it saved', async () => {
		const { log, state } = await captureGame({ minRounds: 99, stopMidRound: false });
		expect(state.phase).toBe('game_end');
		const fetchFn = mockFetch({ saved: true });
		storage.set(REPLAY_KEY, doneMirror(log));

		await retroSaveLastGame();

		expect(fetchFn).toHaveBeenCalledTimes(1);
		const [url, init] = fetchFn.mock.calls[0];
		expect(url).toBe('/api/games');
		const body = JSON.parse(init!.body as string);
		// Final scores match the replayed game; one round record per finished hand.
		expect(body.finalScores).toEqual(state.players.map((p) => p.score));
		const roundsPlayed = log.inputs.filter((i) => i.t === 'nextRound').length;
		expect(body.rounds).toHaveLength(roundsPlayed);
		// The mirror is now marked saved so a second sign-in can't double-save.
		expect(JSON.parse(storage.get(REPLAY_KEY)!).saved).toBe(true);
	}, 60000);

	it('leaves the mirror eligible when the server did not save (still anonymous)', async () => {
		const { log } = await captureGame({ minRounds: 99, stopMidRound: false });
		const fetchFn = mockFetch({ saved: false });
		storage.set(REPLAY_KEY, doneMirror(log));

		await retroSaveLastGame();

		expect(fetchFn).toHaveBeenCalledTimes(1);
		// Not locked — a later sign-in can still retro-save it.
		expect(JSON.parse(storage.get(REPLAY_KEY)!).saved).toBeFalsy();
	}, 60000);
});
