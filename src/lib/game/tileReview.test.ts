import { describe, it, expect } from 'vitest';
import { initGame, continueGame, humanDiscard, humanPassClaim } from './engine';
import { settle } from './autoplay';
import { dealInMoments } from './tileReview';
import type { GameState, Seat } from './types';
import type { GameEvent, Scores } from './events';
import type { GameTile } from './tiles';

const tile = (code: number, id = 0, isRed = false): GameTile => ({ code, id, isRed });

// ─── synthetic-event helpers ─────────────────────────────────────────────────

// 13-tile human starting hand with known ids (1–13); other seats' hands are
// irrelevant to the extractor.
const HUMAN_HAND = [1, 2, 3, 7, 8, 9, 13, 14, 15, 19, 20, 28, 28];

const start = (
	overrides: Partial<Extract<GameEvent, { type: 'round_start' }>> = {}
): GameEvent => ({
	type: 'round_start',
	round: 1,
	honba: 0,
	riichiBets: 0,
	dealer: 0,
	doraIndicator: tile(10, 99),
	hands: [HUMAN_HAND.map((c, i) => tile(c, i + 1)), [], [], []] as [
		GameTile[],
		GameTile[],
		GameTile[],
		GameTile[]
	],
	scores: [25000, 25000, 25000, 25000],
	...overrides
});

const draw = (seat: Seat, t: GameTile): GameEvent => ({
	type: 'draw',
	seat,
	tile: t,
	rinshan: false
});
const discard = (seat: Seat, t: GameTile, riichi = false): GameEvent => ({
	type: 'discard',
	seat,
	tile: t,
	riichi
});
const win = (seat: Seat, from: Seat, score = 8000): GameEvent => ({
	type: 'win',
	seat,
	from,
	tile: tile(5, 98),
	han: 4,
	fu: 30,
	score,
	yaku: [{ name: 'Riichi', han: 1 }],
	deltas: [0, 0, 0, 0] as Scores,
	uraIndicators: []
});

describe('dealInMoments — extraction', () => {
	it('captures the decision state of a discard that got ronned', () => {
		const drawn = tile(33, 50);
		const moments = dealInMoments([
			start(),
			// Seat 2 declares riichi on a 6p, then passes on seat 3's 9s.
			draw(2, tile(15, 60)),
			discard(2, tile(15, 60), true),
			draw(3, tile(27, 61)),
			discard(3, tile(27, 61)),
			// Your turn: draw a green dragon and deal it in.
			draw(0, drawn),
			discard(0, drawn),
			win(2, 0)
		]);

		expect(moments).toHaveLength(1);
		const m = moments[0];
		expect(m.round).toBe(1);
		expect(m.turn).toBe(1);
		expect(m.dealInTile).toBe(33);
		expect(m.forcedByRiichi).toBe(false);
		// The hand snapshot includes the drawn tile (14 tiles, pre-discard).
		expect(m.hand).toHaveLength(14);
		expect(m.hand).toContain(33);
		// Three draws happened before the snapshot.
		expect(m.tilesLeft).toBe(70 - 3);
		// The winner's riichi is visible. Genbutsu vs seat 2 = their own 6p (15)
		// plus the 9s (27) they passed on; of those, your hand held the 6p — and
		// crucially NOT the deal-in tile itself (safety is judged pre-discard).
		expect(m.seats[2].isRiichi).toBe(true);
		expect(m.safeTiles).toEqual([15]);
		expect(m.safeTiles).not.toContain(33);
		expect(m.winner.seat).toBe(2);
		expect(m.winner.score).toBe(8000);
	});

	it('lists genbutsu you actually held, including tiles called away from the river', () => {
		const moments = dealInMoments([
			start(),
			// Seat 2 discards a 1m (your hand holds 1m), then seat 1 pons it away.
			draw(2, tile(1, 60)),
			discard(2, tile(1, 60)),
			{
				type: 'call',
				call: 'pon',
				seat: 1,
				from: 2,
				tile: tile(1, 60),
				consumed: [tile(1, 61), tile(1, 62)]
			},
			discard(1, tile(9, 63)),
			draw(0, tile(33, 50)),
			discard(0, tile(33, 50)),
			win(2, 0)
		]);

		const m = moments[0];
		// 1m left seat 2's displayed river when ponned…
		expect(m.seats[2].discards).toEqual([]);
		// …but it is still genbutsu against them, and you held one.
		expect(m.safeTiles).toEqual([1]);
	});

	it('flags a riichi tsumogiri as forced, but not the declaring discard itself', () => {
		const declaring = dealInMoments([
			start(),
			draw(0, tile(33, 50)),
			discard(0, tile(33, 50), true), // the riichi declaration deals in
			win(1, 0)
		]);
		expect(declaring[0].forcedByRiichi).toBe(false);

		const locked = dealInMoments([
			start(),
			draw(0, tile(33, 50)),
			discard(0, tile(33, 50), true), // declaration passes
			draw(1, tile(9, 60)),
			discard(1, tile(9, 60)),
			draw(0, tile(34, 51)),
			discard(0, tile(34, 51)), // forced tsumogiri
			win(1, 0)
		]);
		expect(locked[0].forcedByRiichi).toBe(true);
	});

	it('does not turn a robbed kakan (chankan) into a discard moment', () => {
		const moments = dealInMoments([
			start(),
			draw(0, tile(31, 50)),
			{
				type: 'kakan',
				seat: 0,
				tile: tile(31, 50),
				consumed: [tile(31, 51), tile(31, 52), tile(31, 53)]
			},
			win(2, 0) // chankan — the "from" is the kan declarer
		]);
		expect(moments).toHaveLength(0);
	});

	it('keeps the 3 costliest deal-ins, in game order', () => {
		const dealIn = (round: number, score: number): GameEvent[] => [
			start({ round }),
			draw(0, tile(33, 50)),
			discard(0, tile(33, 50)),
			win(1, 0, score)
		];
		const moments = dealInMoments([
			...dealIn(1, 1000),
			...dealIn(2, 12000),
			...dealIn(3, 2000),
			...dealIn(4, 8000)
		]);
		expect(moments.map((m) => [m.round, m.winner.score])).toEqual([
			[2, 12000],
			[3, 2000],
			[4, 8000]
		]);
	});
});

// ─── real-game integration ───────────────────────────────────────────────────

async function playGame(maxInputs: number): Promise<GameState> {
	let state = await settle(initGame());
	let n = 0;
	while (n < maxInputs) {
		if (state.phase === 'game_end') break;
		if (state.phase === 'round_end') {
			state = await settle(continueGame(state));
		} else if (state.phase === 'claim_decision') {
			state = await settle(await humanPassClaim(state));
		} else if (state.phase === 'player_discard' && state.currentSeat === 0) {
			const drawn = state.players[0].hand[state.players[0].hand.length - 1];
			state = await settle(await humanDiscard(state, drawn.id, false));
		} else {
			break;
		}
		n++;
	}
	return state;
}

describe('dealInMoments — real games', () => {
	it('extracted moments are internally consistent', async () => {
		// A tsumogiri human deals in regularly; find a game with at least one.
		for (let g = 0; g < 6; g++) {
			const live = await playGame(400);
			const moments = dealInMoments(live.events);
			if (moments.length === 0) continue;

			for (const m of moments) {
				expect(m.hand.length).toBeGreaterThanOrEqual(2);
				expect(m.hand.length).toBeLessThanOrEqual(14);
				expect(m.hand).toContain(m.dealInTile);
				// Safe tiles are a subset of the hand.
				for (const c of m.safeTiles) expect(m.hand).toContain(c);
				// The winner can't be you, and their river is visible.
				expect(m.winner.seat).toBeGreaterThanOrEqual(1);
				expect(m.tilesLeft).toBeGreaterThanOrEqual(0);
				expect(m.tilesLeft).toBeLessThanOrEqual(70);
				expect(m.seats).toHaveLength(4);
			}
			return;
		}
		throw new Error('no deal-in occurred across 6 games — investigate, this should be common');
	}, 120000);
});
