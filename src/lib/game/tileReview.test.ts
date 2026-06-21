import { describe, it, expect } from 'vitest';
import { initGame, continueGame, humanDiscard, humanPassClaim } from './engine';
import { settle } from './autoplay';
import { reviewMoments, mergeReviewedMoments } from './tileReview';
import type { DealInMoment, RiichiMoment, TileMoment, TileReviewResult } from './tileReview';
import type { GameState, Seat } from './types';
import type { GameEvent, Scores } from './events';
import type { GameTile } from './tiles';

const tile = (code: number, id = 0, isRed = false): GameTile => ({ code, id, isRed });
const dealIns = (ms: TileMoment[]) => ms.filter((m): m is DealInMoment => m.kind === 'deal-in');
const riichis = (ms: TileMoment[]) => ms.filter((m): m is RiichiMoment => m.kind === 'riichi');

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

describe('reviewMoments — deal-in extraction', () => {
	it('captures the decision state of a discard that got ronned', () => {
		const drawn = tile(33, 50);
		const moments = dealIns(
			reviewMoments([
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
			])
		);

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
		const moments = dealIns(
			reviewMoments([
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
			])
		);

		const m = moments[0];
		// 1m left seat 2's displayed river when ponned…
		expect(m.seats[2].discards).toEqual([]);
		// …but it is still genbutsu against them, and you held one.
		expect(m.safeTiles).toEqual([1]);
	});

	it('reviews a riichi declaration; a later forced tsumogiri deal-in dedups into it', () => {
		// The declaring discard itself deals in: a (non-forced) deal-in is kept
		// alongside the riichi-declaration moment.
		const declaring = reviewMoments([
			start(),
			draw(0, tile(33, 50)),
			discard(0, tile(33, 50), true), // the riichi declaration deals in
			win(1, 0)
		]);
		expect(dealIns(declaring)).toHaveLength(1);
		expect(dealIns(declaring)[0].forcedByRiichi).toBe(false);
		expect(riichis(declaring)).toHaveLength(1);

		// Riichi, then a later forced tsumogiri deals in. The forced deal-in is the
		// same decision as the riichi — dropped in favour of the riichi moment.
		const locked = reviewMoments([
			start(),
			draw(0, tile(33, 50)),
			discard(0, tile(33, 50), true), // declaration passes
			draw(1, tile(9, 60)),
			discard(1, tile(9, 60)),
			draw(0, tile(34, 51)),
			discard(0, tile(34, 51)), // forced tsumogiri
			win(1, 0)
		]);
		expect(dealIns(locked)).toHaveLength(0);
		expect(riichis(locked)).toHaveLength(1);
		expect(riichis(locked)[0].riichiTile).toBe(33);
	});

	it('extracts a riichi declaration with its wait-snapshot fields', () => {
		const moments = riichis(
			reviewMoments([
				start(),
				draw(0, tile(33, 50)),
				discard(0, tile(33, 50), true), // you declare riichi cutting a green dragon
				draw(1, tile(9, 60)),
				discard(1, tile(9, 60)) // round runs on; no deal-in
			])
		);
		expect(moments).toHaveLength(1);
		expect(moments[0].kind).toBe('riichi');
		expect(moments[0].riichiTile).toBe(33);
		expect(moments[0].turn).toBe(1);
		// No opponent was in riichi, so there are no fold-safe tiles to list.
		expect(moments[0].safeTiles).toEqual([]);
	});

	it('does not turn a robbed kakan (chankan) into a discard moment', () => {
		const moments = reviewMoments([
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

	it('caps total moments at 5, costliest deal-ins first, then game order', () => {
		const dealIn = (round: number, score: number): GameEvent[] => [
			start({ round }),
			draw(0, tile(33, 50)),
			discard(0, tile(33, 50)),
			win(1, 0, score)
		];
		// Six deal-ins → only the single cheapest (1000) is dropped by the 5-cap.
		const moments = dealIns(
			reviewMoments([
				...dealIn(1, 1000),
				...dealIn(2, 12000),
				...dealIn(3, 2000),
				...dealIn(4, 8000),
				...dealIn(5, 1500),
				...dealIn(6, 5000)
			])
		);
		expect(moments.map((m) => [m.round, m.winner.score])).toEqual([
			[2, 12000],
			[3, 2000],
			[4, 8000],
			[5, 1500],
			[6, 5000]
		]);
	});
});

describe('mergeReviewedMoments — the cacheable shape', () => {
	const moment = (round: number, honba: number, dealInTile: number): DealInMoment => ({
		kind: 'deal-in',
		round,
		honba,
		turn: 5,
		tilesLeft: 40,
		doraIndicators: [10],
		hand: [1, 2, 3, dealInTile],
		melds: [],
		dealInTile,
		forcedByRiichi: false,
		safeTiles: [],
		winner: { seat: 2, han: 4, fu: 30, score: 8000, yaku: [] },
		seats: []
	});
	const riichiMoment = (round: number, riichiTile: number): RiichiMoment => ({
		kind: 'riichi',
		round,
		honba: 0,
		turn: 6,
		tilesLeft: 30,
		doraIndicators: [10],
		hand: [1, 2, 3, riichiTile],
		melds: [],
		safeTiles: [],
		seats: [],
		riichiTile
	});

	it('keeps only the card identity + verdict, dropping the decision snapshot', () => {
		const moments = [moment(2, 0, 33), moment(3, 1, 14)];
		const result: TileReviewResult = {
			verdicts: [
				{ verdict: 'avoidable', advice: 'You held a safe 6p.' },
				{ verdict: 'unlucky', advice: 'No way to read it.' }
			]
		};

		const merged = mergeReviewedMoments(moments, result);

		expect(merged).toEqual([
			{
				kind: 'deal-in',
				round: 2,
				honba: 0,
				dealInTile: 33,
				forcedByRiichi: false,
				verdict: 'avoidable',
				advice: 'You held a safe 6p.'
			},
			{
				kind: 'deal-in',
				round: 3,
				honba: 1,
				dealInTile: 14,
				forcedByRiichi: false,
				verdict: 'unlucky',
				advice: 'No way to read it.'
			}
		]);
		// The heavy fields (hand, seats, safeTiles) are not carried into the cache.
		expect(merged[0]).not.toHaveProperty('hand');
		expect(merged[0]).not.toHaveProperty('seats');
	});

	it('carries the riichi tile as the focal tile (forcedByRiichi false)', () => {
		const merged = mergeReviewedMoments([riichiMoment(1, 28)], {
			verdicts: [{ verdict: 'justified', advice: 'Good wait — riichi was right.' }]
		});
		expect(merged[0]).toEqual({
			kind: 'riichi',
			round: 1,
			honba: 0,
			dealInTile: 28, // focal tile = the riichi discard
			forcedByRiichi: false,
			verdict: 'justified',
			advice: 'Good wait — riichi was right.'
		});
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

describe('reviewMoments — real games', () => {
	it('extracted moments are internally consistent', async () => {
		// A tsumogiri human deals in regularly; find a game with at least one.
		for (let g = 0; g < 6; g++) {
			const live = await playGame(400);
			const moments = dealIns(reviewMoments(live.events));
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
