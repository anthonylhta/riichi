import { describe, it, expect } from 'vitest';
import { initGame, continueGame, humanDiscard, humanPassClaim } from './engine';
import { settle } from './autoplay';
import { newReplayLog, wallFromState, replayGame, type ReplayLog } from './replay';
import type { GameState } from './types';

// The deterministic, meaningful slice of a state (full toEqual also holds, but
// this gives a readable diff and avoids comparing the bulky wall arrays).
function projection(s: GameState) {
	return {
		phase: s.phase,
		round: s.round,
		honba: s.honba,
		dealer: s.dealer,
		currentSeat: s.currentSeat,
		wallPos: s.wallPos,
		scores: s.players.map((p) => p.score),
		hands: s.players.map((p) => p.hand.map((t) => t.id)),
		discards: s.players.map((p) => p.discards.map((t) => t.id)),
		melds: s.players.map((p) =>
			p.melds.map((m) => `${m.type}:${m.tiles.map((t) => t.id).join('-')}`)
		)
	};
}

type Outcome =
	| { kind: 'final'; proj: ReturnType<typeof projection> }
	| { kind: 'threw'; msg: string };

// Play a game as a trivial human (tsumogiri, never riichi, pass every claim,
// advance every round), capturing a ReplayLog exactly the way the store does.
// Inputs are recorded BEFORE they're applied, so if the engine throws, the
// triggering input is in the log — letting a replay reproduce the same throw.
async function playAndCapture(maxInputs: number): Promise<{ log: ReplayLog; outcome: Outcome }> {
	const log = newReplayLog();
	let state = await settle(initGame());
	log.startWall = wallFromState(state);

	try {
		let n = 0;
		while (n < maxInputs) {
			if (state.phase === 'game_end') break;
			if (state.phase === 'round_end') {
				const next = continueGame(state);
				log.inputs.push({
					t: 'nextRound',
					wall: next.phase === 'game_end' ? null : wallFromState(next)
				});
				state = await settle(next);
			} else if (state.phase === 'claim_decision') {
				log.inputs.push({ t: 'pass' });
				state = await settle(await humanPassClaim(state));
			} else if (state.phase === 'player_discard' && state.currentSeat === 0) {
				const drawn = state.players[0].hand[state.players[0].hand.length - 1];
				log.inputs.push({ t: 'discard', tileId: drawn.id, riichi: false });
				state = await settle(await humanDiscard(state, drawn.id, false));
			} else {
				break;
			}
			n++;
		}
		return { log, outcome: { kind: 'final', proj: projection(state) } };
	} catch (e) {
		return { log, outcome: { kind: 'threw', msg: (e as Error).message } };
	}
}

async function outcomeFromLog(log: ReplayLog): Promise<Outcome> {
	try {
		const r = await replayGame(log);
		return { kind: 'final', proj: projection(r.final) };
	} catch (e) {
		return { kind: 'threw', msg: (e as Error).message };
	}
}

describe('replay determinism', () => {
	it('re-deals an identical hand from the same wall', () => {
		const a = initGame();
		const wall = wallFromState(a);
		const b = initGame(wall);
		expect(wallFromState(b)).toEqual(wall);
		expect(b.players.map((p) => p.hand.map((t) => t.id))).toEqual(
			a.players.map((p) => p.hand.map((t) => t.id))
		);
	});

	// The core guarantee: replaying the captured log reproduces live play exactly —
	// same final state, or the same crash at the same point (which is what makes a
	// frozen game reproducible from its log).
	it('replay reproduces live play exactly', async () => {
		const { log, outcome } = await playAndCapture(300);
		expect(await outcomeFromLog(log)).toEqual(outcome);
	});

	it('is idempotent — replaying the same log twice agrees', async () => {
		const { log } = await playAndCapture(150);
		expect(await outcomeFromLog(log)).toEqual(await outcomeFromLog(log));
	});

	// Persistence round-trip: a log captured exactly the way the store does must
	// pass the server-side validator after a JSON round-trip (what POST /api/games
	// receives) — otherwise real games would silently save without their replay.
	it('a captured log survives the server validator', async () => {
		const { validateReplayLog } = await import('../server/validate');
		const { log } = await playAndCapture(100);
		const validated = validateReplayLog(JSON.parse(JSON.stringify(log)));
		expect(validated).not.toBeNull();
		expect(validated?.inputs).toEqual(log.inputs);
		expect(validated?.startWall).toEqual(log.startWall);
	});
});
