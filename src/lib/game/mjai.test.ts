import { describe, it, expect } from 'vitest';
import { initGame, continueGame, humanDiscard, humanPassClaim } from './engine';
import { settle } from './autoplay';
import { newReplayLog, wallFromState, replayGame, type ReplayLog } from './replay';
import { tileToMjai, toMjaiEvents, toMjaiJsonl } from './mjai';
import type { GameState } from './types';

const tile = (code: number, id = 0, isRed = false) => ({ code, id, isRed });

// Same trivial-human driver as replay.test.ts: tsumogiri every draw, never
// riichi, pass every claim, advance every round — but a REAL engine game
// (real walls, real AI, real scoring), captured the way the store captures it.
async function playAndCapture(maxInputs: number): Promise<{ log: ReplayLog; live: GameState }> {
	const log = newReplayLog();
	let state = await settle(initGame());
	log.startWall = wallFromState(state);

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
	return { log, live: state };
}

const PAI = /^([1-9][mps]r?|[ESWNPFC])$/;

describe('tileToMjai', () => {
	it('maps suits, honors, and red fives to MJAI notation', () => {
		expect(tileToMjai(tile(1))).toBe('1m');
		expect(tileToMjai(tile(9))).toBe('9m');
		expect(tileToMjai(tile(10))).toBe('1p');
		expect(tileToMjai(tile(18))).toBe('9p');
		expect(tileToMjai(tile(19))).toBe('1s');
		expect(tileToMjai(tile(27))).toBe('9s');
		expect(tileToMjai(tile(5, 0, true))).toBe('5mr');
		expect(tileToMjai(tile(14, 0, true))).toBe('5pr');
		expect(tileToMjai(tile(23, 0, true))).toBe('5sr');
		expect(tileToMjai(tile(28))).toBe('E');
		expect(tileToMjai(tile(29))).toBe('S');
		expect(tileToMjai(tile(30))).toBe('W');
		expect(tileToMjai(tile(31))).toBe('N');
		expect(tileToMjai(tile(32))).toBe('P'); // haku
		expect(tileToMjai(tile(33))).toBe('F'); // hatsu
		expect(tileToMjai(tile(34))).toBe('C'); // chun
	});
});

describe('MJAI export of a real game', () => {
	it('is structurally valid and points-conserving, and the replayed log exports identically', async () => {
		const { log, live } = await playAndCapture(400);

		// A tsumogiri-only game must run to completion well within 400 inputs.
		expect(live.phase).toBe('game_end');

		const lines = toMjaiEvents(live.events);

		// Bookends.
		expect(lines[0].type).toBe('start_game');
		expect(lines[1].type).toBe('start_kyoku');
		expect(lines[lines.length - 1].type).toBe('end_game');

		// Every started hand ends.
		const count = (t: string) => lines.filter((l) => l.type === t).length;
		expect(count('start_kyoku')).toBeGreaterThan(0);
		expect(count('start_kyoku')).toBe(count('end_kyoku'));
		expect(count('hora') + count('ryukyoku')).toBe(count('end_kyoku'));

		// Every tile reference is valid MJAI notation; every actor a seat.
		for (const l of lines) {
			if ('pai' in l && l.pai !== '?') expect(String(l.pai)).toMatch(PAI);
			if ('dora_marker' in l) expect(String(l.dora_marker)).toMatch(PAI);
			if ('actor' in l) expect([0, 1, 2, 3]).toContain(l.actor);
			if ('consumed' in l) {
				for (const c of l.consumed as string[]) expect(c).toMatch(PAI);
			}
			if ('tehais' in l) {
				const tehais = l.tehais as string[][];
				expect(tehais).toHaveLength(4);
				for (const h of tehais) {
					expect(h).toHaveLength(13);
					for (const p of h) expect(p).toMatch(PAI);
				}
			}
		}

		// Points conservation: at every start_kyoku the seats' scores plus the
		// sticks on the table total 100,000; every hora's deltas sum to exactly
		// the kyotaku it sweeps (reach sticks placed this hand included); every
		// ryukyoku's tenpai payments sum to zero; the final scores, with
		// leftover sticks settled to 1st, total 100,000 again.
		let kyotaku = 0;
		for (const l of lines) {
			if (l.type === 'start_kyoku') {
				kyotaku = l.kyotaku as number;
				const scores = l.scores as number[];
				expect(scores.reduce((a, b) => a + b, 0) + kyotaku * 1000).toBe(100000);
			} else if (l.type === 'reach_accepted') {
				kyotaku++;
			} else if (l.type === 'hora') {
				const deltas = l.deltas as number[];
				expect(deltas.reduce((a, b) => a + b, 0)).toBe(kyotaku * 1000);
			} else if (l.type === 'ryukyoku') {
				const deltas = l.deltas as number[];
				expect(deltas.reduce((a, b) => a + b, 0)).toBe(0);
			} else if (l.type === 'end_game') {
				const scores = l.scores as number[];
				expect(scores.reduce((a, b) => a + b, 0)).toBe(100000);
			}
		}

		// The point of the feature: the export is fully derivable from the stored
		// ReplayLog — replaying it yields the identical MJAI log, byte for byte.
		const replayed = await replayGame(JSON.parse(JSON.stringify(log)));
		expect(toMjaiJsonl(replayed.final.events)).toBe(toMjaiJsonl(live.events));
	}, 60000);

	it('marks riichi with reach + reach_accepted and locks tsumogiri afterwards', async () => {
		// Drive games until one contains an AI riichi (good AI riichis whenever
		// legal, so this is near-certain within a few games).
		for (let attempt = 0; attempt < 6; attempt++) {
			const { live } = await playAndCapture(400);
			const lines = toMjaiEvents(live.events);
			const reachIdx = lines.findIndex((l) => l.type === 'reach');
			if (reachIdx === -1) continue;

			const actor = lines[reachIdx].actor as number;
			// The riichi declaration is immediately followed by that seat's dahai.
			expect(lines[reachIdx + 1].type).toBe('dahai');
			expect(lines[reachIdx + 1].actor).toBe(actor);
			const after = lines.slice(reachIdx + 2);
			const accepted = after.findIndex((l) => l.type === 'reach_accepted' && l.actor === actor);
			if (after[0]?.type === 'hora') {
				// The riichi tile itself was ronned — the declaration never
				// completed, so no reach_accepted (and no stick was paid).
				expect(accepted).toBe(-1);
			} else {
				// Otherwise a reach_accepted for the seat follows before its next draw.
				const nextDraw = after.findIndex((l) => l.type === 'tsumo' && l.actor === actor);
				expect(accepted).toBeGreaterThanOrEqual(0);
				if (nextDraw !== -1) expect(accepted).toBeLessThan(nextDraw);
			}

			// Post-riichi discards by that seat are tsumogiri until the hand ends.
			const kyokuEnd = after.findIndex((l) => l.type === 'end_kyoku');
			const inRiichi = after.slice(0, kyokuEnd === -1 ? undefined : kyokuEnd);
			for (const l of inRiichi) {
				if (l.type === 'dahai' && l.actor === actor) expect(l.tsumogiri).toBe(true);
			}
			return;
		}
		throw new Error('no riichi occurred across 6 games — investigate, this should be near-certain');
	}, 120000);
});

describe('reach_accepted vs a ron on the riichi tile', () => {
	const baseStart = {
		type: 'round_start' as const,
		round: 1,
		honba: 0,
		riichiBets: 0,
		dealer: 0 as const,
		doraIndicator: tile(1, 1),
		hands: [[], [], [], []] as [
			ReturnType<typeof tile>[],
			ReturnType<typeof tile>[],
			ReturnType<typeof tile>[],
			ReturnType<typeof tile>[]
		],
		scores: [25000, 25000, 25000, 25000] as [number, number, number, number]
	};

	it('emits reach_accepted once play continues past the riichi discard', () => {
		const lines = toMjaiEvents([
			baseStart,
			{ type: 'discard', seat: 0, tile: tile(5, 10), riichi: true },
			{ type: 'draw', seat: 1, tile: tile(6, 11), rinshan: false }
		]);
		const types = lines.map((l) => l.type);
		expect(types).toContain('reach_accepted');
		expect(types.indexOf('reach_accepted')).toBeLessThan(types.indexOf('tsumo'));
	});

	it('emits NO reach_accepted when the riichi discard is ronned', () => {
		const lines = toMjaiEvents([
			baseStart,
			{ type: 'discard', seat: 0, tile: tile(5, 10), riichi: true },
			{
				type: 'win',
				seat: 2,
				from: 0,
				tile: tile(5, 10),
				han: 2,
				fu: 30,
				score: 2000,
				yaku: [],
				deltas: [-2000, 0, 2000, 0],
				uraIndicators: []
			}
		]);
		const types = lines.map((l) => l.type);
		expect(types).toContain('reach');
		expect(types).toContain('hora');
		expect(types).not.toContain('reach_accepted');
	});
});
