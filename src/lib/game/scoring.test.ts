import { describe, it, expect } from 'vitest';
import { checkWin } from './scoring';
import { TC } from './tiles';
import type { GameTile, TileCode } from './tiles';

// Golden tests for scoring.checkWin — run against the REAL riichi-rs-bundlers WASM.
//
// These exist because scoring correctness is the whole value proposition of the
// app, and the riichi-rs API is easy to misuse (e.g. ron requires 13 tiles in
// closed_part, not 14 — a bug we already shipped once). Each test isolates a
// scenario and asserts the yaku our wrapper surfaces plus han/fu/score where
// they are hand-verifiable.

function ind(code: TileCode): GameTile {
	return { code, id: 0, isRed: false };
}

type WinArgs = Parameters<typeof checkWin>[0];

// Sensible defaults for a closed, non-special win. Override per test.
function win(overrides: Partial<WinArgs>): ReturnType<typeof checkWin> {
	return checkWin({
		handCodes: [],
		openMelds: [],
		doraIndicators: [],
		uraDoraIndicators: [],
		isRiichi: false,
		isDoubleRiichi: false,
		isIppatsu: false,
		isTsumo: false,
		ronTileCode: null,
		seatWind: TC.SOUTH,
		roundWind: TC.EAST,
		...overrides
	});
}

describe('checkWin — core wins', () => {
	it('riichi + tsumo + pinfu (closed, all runs)', async () => {
		// Tenpai 23m 678m 345p 789p 55s waiting 1m/4m; tsumo 4m.
		// riichi-rs reads the LAST tile of the hand as the self-drawn winning tile,
		// so 4m must be last for the ryanmen wait (and pinfu) to be recognised.
		const res = await win({
			handCodes: [
				TC.M2,
				TC.M3,
				TC.M6,
				TC.M7,
				TC.M8,
				TC.P3,
				TC.P4,
				TC.P5,
				TC.P7,
				TC.P8,
				TC.P9,
				TC.S5,
				TC.S5,
				TC.M4
			],
			isRiichi: true,
			isTsumo: true
		});
		expect(res.isWin).toBe(true);
		expect(res.yakuNames).toEqual(expect.arrayContaining(['Riichi', 'Menzen Tsumo', 'Pinfu']));
		// riichi(1) + tsumo(1) + pinfu(1) = 3 han, pinfu tsumo = 20 fu
		expect(res.han).toBe(3);
		expect(res.fu).toBe(20);
	});

	it('tsumo wait is read from the LAST hand tile (engine ordering invariant)', async () => {
		// Same 14 tiles, two orderings of the same pinfu-shape hand.
		// The engine appends the drawn tile last and must NOT sort before scoring;
		// this test pins that contract so a stray sort can't silently break tsumo
		// fu/pinfu scoring across the whole app.
		const tiles = [
			TC.M2,
			TC.M3,
			TC.M6,
			TC.M7,
			TC.M8,
			TC.P3,
			TC.P4,
			TC.P5,
			TC.P7,
			TC.P8,
			TC.P9,
			TC.S5,
			TC.S5,
			TC.M4
		];
		const winningLast = await win({ handCodes: tiles, isTsumo: true });
		// Sorted hand puts the 5s pair last -> library infers a tanki/shanpon wait,
		// which is not pinfu and scores different fu.
		const sorted = await win({ handCodes: [...tiles].sort((a, b) => a - b), isTsumo: true });

		expect(winningLast.yakuNames).toContain('Pinfu');
		expect(winningLast.fu).toBe(20);
		expect(sorted.yakuNames).not.toContain('Pinfu');
		expect(sorted.fu).not.toBe(20);
	});

	it('tanyao (closed ron, 13 tiles + ron tile)', async () => {
		// closed 13: 234m 567m 234p 67s 55s ; ron 8s -> 678s
		const res = await win({
			handCodes: [
				TC.M2,
				TC.M3,
				TC.M4,
				TC.M5,
				TC.M6,
				TC.M7,
				TC.P2,
				TC.P3,
				TC.P4,
				TC.S6,
				TC.S7,
				TC.S5,
				TC.S5
			],
			ronTileCode: TC.S8
		});
		expect(res.isWin).toBe(true);
		expect(res.yakuNames).toContain('Tanyao');
	});

	it('yakuhai dragon triplet (open pon, tsumo)', async () => {
		// open pon of Chun; closed 234m 567m 789p 99s (tsumo, 11 tiles)
		const res = await win({
			handCodes: [TC.M2, TC.M3, TC.M4, TC.M5, TC.M6, TC.M7, TC.P7, TC.P8, TC.P9, TC.S9, TC.S9],
			openMelds: [[true, [TC.CHUN, TC.CHUN, TC.CHUN]]],
			isTsumo: true
		});
		expect(res.isWin).toBe(true);
		expect(res.yakuNames).toContain('Chun');
		expect(res.han).toBe(1);
	});

	it('chiitoitsu (closed ron, 25 fu, 2 han)', async () => {
		// 6 pairs + single 4s; ron 4s -> 7th pair
		const res = await win({
			handCodes: [
				TC.M1,
				TC.M1,
				TC.M3,
				TC.M3,
				TC.M5,
				TC.M5,
				TC.P7,
				TC.P7,
				TC.P9,
				TC.P9,
				TC.S2,
				TC.S2,
				TC.S4
			],
			ronTileCode: TC.S4
		});
		expect(res.isWin).toBe(true);
		expect(res.yakuNames).toContain('Chiitoitsu');
		expect(res.han).toBe(2);
		expect(res.fu).toBe(25);
	});

	it('honitsu (closed ron, one suit + honor pair)', async () => {
		// 123m 234m 345m 678m + west pair; ron W (tanki) — south seat / east round
		const res = await win({
			handCodes: [
				TC.M1,
				TC.M2,
				TC.M3,
				TC.M2,
				TC.M3,
				TC.M4,
				TC.M3,
				TC.M4,
				TC.M5,
				TC.M6,
				TC.M7,
				TC.M8,
				TC.WEST
			],
			ronTileCode: TC.WEST
		});
		expect(res.isWin).toBe(true);
		expect(res.yakuNames).toContain('Honitsu');
	});
});

describe('checkWin — yakuman', () => {
	it('daisangen (three dragon triplets, non-dealer ron = 32000)', async () => {
		// closed 13: 白白白 發發發 中中 234m 99p ; ron Chun -> 中中中
		const res = await win({
			handCodes: [
				TC.HAKU,
				TC.HAKU,
				TC.HAKU,
				TC.HATSU,
				TC.HATSU,
				TC.HATSU,
				TC.CHUN,
				TC.CHUN,
				TC.M2,
				TC.M3,
				TC.M4,
				TC.P9,
				TC.P9
			],
			ronTileCode: TC.CHUN
		});
		expect(res.isWin).toBe(true);
		expect(res.yakuNames).toContain('Daisangen');
		expect(res.score).toBe(32000);
	});

	it('kokushi musou (13 orphans)', async () => {
		// 13 distinct terminals/honors; ron the duplicate
		const res = await win({
			handCodes: [
				TC.M1,
				TC.M9,
				TC.P1,
				TC.P9,
				TC.S1,
				TC.S9,
				TC.EAST,
				TC.SOUTH,
				TC.WEST,
				TC.NORTH,
				TC.HAKU,
				TC.HATSU,
				TC.CHUN
			],
			ronTileCode: TC.M1
		});
		expect(res.isWin).toBe(true);
		expect(res.yakuNames).toEqual(expect.arrayContaining([expect.stringContaining('Kokushi')]));
		expect(res.score).toBe(32000);
	});
});

describe('checkWin — open meld format & sanshoku', () => {
	it('open sanshoku doujun (called chi, tsumo)', async () => {
		// open chi 234m; closed 234p 234s 567s 99m (tsumo, 11 tiles)
		const res = await win({
			handCodes: [TC.P2, TC.P3, TC.P4, TC.S2, TC.S3, TC.S4, TC.S5, TC.S6, TC.S7, TC.M9, TC.M9],
			openMelds: [[true, [TC.M2, TC.M3, TC.M4]]],
			isTsumo: true
		});
		expect(res.isWin).toBe(true);
		expect(res.yakuNames).toContain('Sanshoku');
	});
});

describe('checkWin — dora and ura dora', () => {
	// Base hand is tanyao + pinfu (all simples, all runs, ryanmen ron, 55s pair) = 2 han.
	const tanyaoHand = {
		handCodes: [
			TC.M2,
			TC.M3,
			TC.M4,
			TC.M5,
			TC.M6,
			TC.M7,
			TC.P2,
			TC.P3,
			TC.P4,
			TC.S6,
			TC.S7,
			TC.S5,
			TC.S5
		],
		ronTileCode: TC.S8 as TileCode
	};

	it('base hand (tanyao + pinfu) is 2 han with no dora', async () => {
		const res = await win({ ...tanyaoHand });
		expect(res.isWin).toBe(true);
		expect(res.yakuNames).toEqual(expect.arrayContaining(['Tanyao', 'Pinfu']));
		expect(res.han).toBe(2);
	});

	it('counts dora from the indicator', async () => {
		// indicator 1m -> dora 2m; hand has one 2m
		const res = await win({ ...tanyaoHand, doraIndicators: [ind(TC.M1)] });
		expect(res.isWin).toBe(true);
		expect(res.yakuNames).toContain('Dora');
		expect(res.han).toBe(3); // tanyao + pinfu + dora(1)
	});

	it('does NOT count ura dora when the hand is not in riichi', async () => {
		// ura indicator 1m -> ura 2m matches a hand tile, but no riichi -> ignored
		const res = await win({ ...tanyaoHand, uraDoraIndicators: [ind(TC.M1)] });
		expect(res.isWin).toBe(true);
		expect(res.han).toBe(2); // unchanged from base
	});

	it('counts ura dora toward han when in riichi', async () => {
		const withoutUra = await win({ ...tanyaoHand, isRiichi: true });
		const withUra = await win({
			...tanyaoHand,
			isRiichi: true,
			uraDoraIndicators: [ind(TC.M1)]
		});
		expect(withoutUra.han).toBe(3); // tanyao + pinfu + riichi
		expect(withUra.han).toBe(4); // + ura dora(1)
		// NOTE: riichi-rs-bundlers exposes only a single `dora` input, so the
		// wrapper folds ura dora into it. Ura dora is therefore counted correctly
		// in han but surfaced under the "Dora" label, never "Ura Dora".
		expect(withUra.yakuNames).toContain('Dora');
		expect(withUra.yakuNames).not.toContain('Ura Dora');
	});
});

describe('checkWin — non-wins', () => {
	it('returns isWin:false for an incomplete hand', async () => {
		const res = await win({
			handCodes: [
				TC.M1,
				TC.M2,
				TC.M4,
				TC.M5,
				TC.M7,
				TC.M8,
				TC.P1,
				TC.P3,
				TC.P5,
				TC.S2,
				TC.S4,
				TC.S6,
				TC.S8
			],
			ronTileCode: TC.S9
		});
		expect(res.isWin).toBe(false);
	});
});
