import { describe, it, expect } from 'vitest';
import { initGame, continueGame, humanDiscard, humanPassClaim } from './engine';
import { settle } from './autoplay';
import { tileToTenhou, toTenhou6, type Tenhou6Action } from './tenhou6';
import type { GameState, Seat } from './types';
import type { GameEvent, Scores } from './events';
import type { GameTile } from './tiles';

const tile = (code: number, id = 0, isRed = false): GameTile => ({ code, id, isRed });

// ─── synthetic-event helpers ─────────────────────────────────────────────────

const hands = () =>
	([0, 1, 2, 3] as const).map((s) =>
		Array.from({ length: 13 }, (_, i) => tile(1 + (i % 9), 100 * s + i))
	) as [GameTile[], GameTile[], GameTile[], GameTile[]];

const start = (): GameEvent => ({
	type: 'round_start',
	round: 1,
	honba: 0,
	riichiBets: 0,
	dealer: 0,
	doraIndicator: tile(1, 99),
	hands: hands(),
	scores: [25000, 25000, 25000, 25000]
});

const win = (seat: Seat, from: Seat | null): GameEvent => ({
	type: 'win',
	seat,
	from,
	tile: tile(5, 98),
	han: 2,
	fu: 30,
	score: 2000,
	yaku: [{ name: 'Riichi', han: 1 }],
	deltas: [0, 0, 0, 0] as Scores,
	uraIndicators: []
});

// Field offsets inside a kyoku tuple (convlog RawKyoku order).
const DORA = 2;
const TAKES = (seat: number) => 5 + 3 * seat;
const DISCARDS = (seat: number) => 6 + 3 * seat;

const kyoku0 = (events: GameEvent[]) => toTenhou6(events).log[0] as unknown[];

// ─── tile encoding ───────────────────────────────────────────────────────────

describe('tileToTenhou', () => {
	it('maps suits and honors to tenhou numbers', () => {
		expect(tileToTenhou(tile(1))).toBe(11); // 1m
		expect(tileToTenhou(tile(9))).toBe(19); // 9m
		expect(tileToTenhou(tile(10))).toBe(21); // 1p
		expect(tileToTenhou(tile(18))).toBe(29); // 9p
		expect(tileToTenhou(tile(19))).toBe(31); // 1s
		expect(tileToTenhou(tile(27))).toBe(39); // 9s
		expect(tileToTenhou(tile(28))).toBe(41); // East
		expect(tileToTenhou(tile(34))).toBe(47); // chun
	});

	it('maps red fives to 51/52/53', () => {
		expect(tileToTenhou(tile(5, 0, true))).toBe(51);
		expect(tileToTenhou(tile(14, 0, true))).toBe(52);
		expect(tileToTenhou(tile(23, 0, true))).toBe(53);
		// non-red fives stay plain
		expect(tileToTenhou(tile(5))).toBe(15);
	});
});

// ─── action encoding ─────────────────────────────────────────────────────────

describe('toTenhou6 — action encoding', () => {
	it('marks tsumogiri with 60 and a hand discard with the tile number', () => {
		const drawn = tile(9, 50);
		const k = kyoku0([
			start(),
			{ type: 'draw', seat: 0, tile: drawn, rinshan: false },
			{ type: 'discard', seat: 0, tile: drawn, riichi: false }, // tsumogiri
			{ type: 'draw', seat: 0, tile: tile(9, 51), rinshan: false },
			{ type: 'discard', seat: 0, tile: tile(1, 0), riichi: false }, // from hand
			win(1, null)
		]);
		expect(k[DISCARDS(0)]).toEqual([60, 11]);
	});

	it('prefixes the riichi declaration with r (r60 when tsumogiri)', () => {
		const drawn = tile(9, 50);
		const k = kyoku0([
			start(),
			{ type: 'draw', seat: 0, tile: drawn, rinshan: false },
			{ type: 'discard', seat: 0, tile: drawn, riichi: true },
			win(1, null)
		]);
		expect(k[DISCARDS(0)]).toEqual(['r60']);
	});

	it('encodes the pon marker position by source seat', () => {
		const consumed = [tile(14, 1), tile(14, 2)];
		const call = (seat: Seat, from: Seat): GameEvent => ({
			type: 'call',
			call: 'pon',
			seat,
			from,
			tile: tile(14, 3),
			consumed
		});
		// seat 1 pons from seat 0 = kamicha → marker first
		expect(kyoku0([start(), call(1, 0), win(1, null)])[TAKES(1)]).toEqual(['p252525']);
		// seat 2 pons from seat 0 = toimen → marker in the middle
		expect(kyoku0([start(), call(2, 0), win(2, null)])[TAKES(2)]).toEqual(['25p2525']);
		// seat 3 pons from seat 0 = shimocha → marker at the end
		expect(kyoku0([start(), call(3, 0), win(3, null)])[TAKES(3)]).toEqual(['2525p25']);
	});

	it('encodes chi with the called tile right after the marker', () => {
		const k = kyoku0([
			start(),
			{
				type: 'call',
				call: 'chi',
				seat: 1,
				from: 0,
				tile: tile(5, 3),
				consumed: [tile(4, 1), tile(6, 2)]
			},
			win(1, null)
		]);
		expect(k[TAKES(1)]).toEqual(['c151416']);
	});

	it('a daiminkan is a take with a 0 placeholder in the discards', () => {
		const k = kyoku0([
			start(),
			{
				type: 'call',
				call: 'daiminkan',
				seat: 2,
				from: 1, // kamicha of seat 2
				tile: tile(28, 4),
				consumed: [tile(28, 1), tile(28, 2), tile(28, 3)]
			},
			{ type: 'draw', seat: 2, tile: tile(7, 60), rinshan: true },
			{ type: 'discard', seat: 2, tile: tile(7, 60), riichi: false },
			win(1, null)
		]);
		expect(k[TAKES(2)]).toEqual(['m41414141', 17]);
		expect(k[DISCARDS(2)]).toEqual([0, 60]);
	});

	it('ankan and kakan strings go in the discards', () => {
		const k = kyoku0([
			start(),
			{ type: 'draw', seat: 0, tile: tile(33, 50), rinshan: false },
			{
				type: 'ankan',
				seat: 0,
				consumed: [tile(33, 1), tile(33, 2), tile(33, 3), tile(33, 50)]
			},
			{ type: 'draw', seat: 0, tile: tile(7, 60), rinshan: true },
			{ type: 'discard', seat: 0, tile: tile(7, 60), riichi: false },
			win(1, null)
		]);
		expect(k[DISCARDS(0)]).toEqual(['464646a46', 60]);
	});

	it("a kakan repeats the original pon's marker position", () => {
		const k = kyoku0([
			start(),
			{
				type: 'call',
				call: 'pon',
				seat: 0,
				from: 2, // toimen
				tile: tile(31, 3),
				consumed: [tile(31, 1), tile(31, 2)]
			},
			{ type: 'discard', seat: 0, tile: tile(1, 0), riichi: false },
			{ type: 'draw', seat: 0, tile: tile(31, 4), rinshan: false },
			{
				type: 'kakan',
				seat: 0,
				tile: tile(31, 4),
				consumed: [tile(31, 1), tile(31, 2), tile(31, 3)]
			},
			{ type: 'draw', seat: 0, tile: tile(7, 60), rinshan: true },
			{ type: 'discard', seat: 0, tile: tile(7, 60), riichi: false },
			win(1, null)
		]);
		// pon from toimen → 'k' at index 2
		expect(k[DISCARDS(0)]).toEqual([11, '44k444444', 60]);
	});

	it('pads the dora list when a ronned minkan discard left the indicator face-down', () => {
		// Daiminkan, rinshan draw, discard — ronned. Our engine reveals nothing
		// (ADR 0049), but the convlog parser consumes an indicator at that
		// discard, so the exporter must pad the array to length 2.
		const k = kyoku0([
			start(),
			{
				type: 'call',
				call: 'daiminkan',
				seat: 2,
				from: 1,
				tile: tile(28, 4),
				consumed: [tile(28, 1), tile(28, 2), tile(28, 3)]
			},
			{ type: 'draw', seat: 2, tile: tile(7, 60), rinshan: true },
			{ type: 'discard', seat: 2, tile: tile(7, 60), riichi: false },
			win(3, 2)
		]);
		expect(k[DORA]).toHaveLength(2);
	});

	it('shapes the results for a win and a draw', () => {
		const ron = kyoku0([start(), win(2, 0)]);
		const detail = (ron[16] as unknown[])[2] as unknown[];
		expect((ron[16] as unknown[])[0]).toBe('和了');
		expect(detail[0]).toBe(2); // winner
		expect(detail[1]).toBe(0); // discarder
		const draw = kyoku0([
			start(),
			{ type: 'ryuukyoku', tenpaiSeats: [], deltas: [0, 0, 0, 0] as Scores }
		]);
		expect((draw[16] as unknown[])[0]).toBe('流局');
	});
});

// ─── real-game integration ───────────────────────────────────────────────────

// Same trivial-human driver as mjai.test.ts: tsumogiri every draw, never
// riichi, pass every claim — a REAL engine game end to end.
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

const TILE_NUMS = new Set<number>();
for (let i = 1; i <= 9; i++)
	TILE_NUMS.add(10 + i)
		.add(20 + i)
		.add(30 + i);
for (let i = 1; i <= 7; i++) TILE_NUMS.add(40 + i);
[51, 52, 53].forEach((n) => TILE_NUMS.add(n));

const NAKI =
	/^(c(\d{2}){3}|p?(\d{2})p?(\d{2})p?(\d{2})|m?(\d{2})m?(\d{2})m?(\d{2})m?(\d{2})|(\d{2}){3}a(\d{2})|k?(\d{2})k?(\d{2})k?(\d{2})k?(\d{2})|r(\d{2}))$/;

describe('tenhou.net/6 export of a real game', () => {
	it('produces a structurally valid, parser-shaped log', async () => {
		const live = await playGame(400);
		expect(live.phase).toBe('game_end');

		const out = toTenhou6(live.events);

		expect(out.name).toHaveLength(4);
		expect(out.rule.disp).toBe('East');
		expect(out.log.length).toBeGreaterThan(0);

		for (const raw of out.log) {
			const k = raw as unknown[];
			// RawKyoku is a 17-element tuple.
			expect(k).toHaveLength(17);

			const [meta, scores, dora] = k as [number[], number[], number[]];
			expect(meta).toHaveLength(3);
			expect(meta[0]).toBeGreaterThanOrEqual(0);
			expect(meta[0]).toBeLessThan(8);
			// Scores + sticks on the table conserve the 100,000 total.
			expect(scores.reduce((a, b) => a + b, 0) + meta[2] * 1000).toBe(100000);
			expect(dora.length).toBeGreaterThanOrEqual(1);
			for (const d of dora) expect(TILE_NUMS.has(d)).toBe(true);

			for (let seat = 0; seat < 4; seat++) {
				const haipai = k[4 + 3 * seat] as number[];
				const takes = k[TAKES(seat)] as Tenhou6Action[];
				const discards = k[DISCARDS(seat)] as Tenhou6Action[];

				expect(haipai).toHaveLength(13);
				for (const t of haipai) expect(TILE_NUMS.has(t)).toBe(true);

				for (const a of takes) {
					if (typeof a === 'number') {
						expect(TILE_NUMS.has(a)).toBe(true); // never 60/0 in takes
					} else {
						expect(a).toMatch(NAKI);
					}
				}
				for (const a of discards) {
					if (typeof a === 'number') {
						expect(a === 60 || a === 0 || TILE_NUMS.has(a)).toBe(true);
					} else {
						expect(a).toMatch(NAKI);
					}
				}

				// Take/discard pairing: every take has a discard, except possibly
				// the final one (tsumo win or the round ending on another seat).
				expect(discards.length).toBeGreaterThanOrEqual(takes.length - 1);
				expect(discards.length).toBeLessThanOrEqual(takes.length);
			}

			const results = k[16] as unknown[];
			expect(['和了', '流局']).toContain(results[0]);
			if (results[0] === '和了') {
				const detail = results[2] as unknown[];
				expect(typeof detail[0]).toBe('number');
				expect(typeof detail[1]).toBe('number');
			}
		}
	}, 60000);
});
