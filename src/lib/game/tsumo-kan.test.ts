import { describe, it, expect } from 'vitest';
import { checkTsumo } from './engine';
import type { GameState, PlayerState, Meld } from './types';
import type { GameTile } from './tiles';

// Real checkWin (no scoring mock) — this is an end-to-end check that a melded,
// kanned hand is actually recognised as a tsumo. Regression for the bug where
// checkTsumo's `totalTiles !== 14` guard rejected any winning hand with a kan
// (a kan adds a tile), so tsumo was never offered (incl. rinshan).
// See notes/bugs/2026-06-05-tsumo-with-kan-not-offered.md.

const t = (code: number, id: number): GameTile => ({ code, id, isRed: false });

function player(overrides: Partial<PlayerState>): PlayerState {
	return {
		seat: 0,
		hand: [],
		discards: [],
		melds: [],
		score: 25000,
		isHuman: true,
		difficulty: null,
		isRiichi: false,
		isDoubleRiichi: false,
		isIppatsu: false,
		riichiTile: null,
		isFuriten: false,
		isTempFuriten: false,
		kuikaeForbidden: [],
		anyDiscardCalled: false,
		paoSeat: null,
		...overrides
	};
}

function stateWith(p: PlayerState): GameState {
	const liveWall = Array.from({ length: 30 }, (_, i) => t((i % 34) + 1, 400 + i));
	return {
		phase: 'player_discard',
		round: 1, // East round
		honba: 0,
		dealer: 0,
		currentSeat: 0,
		turnCount: 1,
		liveWall,
		wallPos: 5, // not the last tile
		wallEnd: liveWall.length,
		deadWall: Array.from({ length: 14 }, (_, i) => t((i % 34) + 1, 500 + i)),
		rinshankPos: 0,
		riichiBets: 0,
		doraIndicators: [t(33, 600)], // arbitrary, no bearing on the yaku
		uraDoraIndicators: [t(34, 601)],
		pendingKanDora: 0,
		anyCallMadeThisRound: true,
		pendingRiichi: null,
		players: [
			p,
			player({ seat: 1 }),
			player({ seat: 2 }),
			player({ seat: 3 })
		] as GameState['players'],
		lastDiscard: null,
		lastDiscardSeat: null,
		pendingTsumo: null,
		pendingRon: null,
		claimOptions: null,
		roundResult: null,
		extraRons: [],
		exhaustiveDrawResult: null,
		abortiveDraw: null,
		events: []
	};
}

describe('checkTsumo with a kan (regression)', () => {
	// Hand: 2m2m 3s4s5s 7s8s9s (drew 9s) + ankan East + chi 6s7s8s. Dealer, East-1,
	// so the East kan is double yakuhai (seat + round wind) — a valid 2-han tsumo.
	const kanEast: Meld = {
		type: 'ankan',
		tiles: [t(28, 1), t(28, 2), t(28, 3), t(28, 4)],
		calledFrom: null
	};
	const chi678: Meld = { type: 'chi', tiles: [t(24, 5), t(25, 6), t(26, 7)], calledFrom: 1 };
	const hand = [
		t(2, 10),
		t(2, 11),
		t(21, 12),
		t(22, 13),
		t(23, 14),
		t(25, 15),
		t(26, 16),
		t(27, 17)
	];

	it('recognises the tsumo and scores it', async () => {
		const result = await checkTsumo(stateWith(player({ melds: [kanEast, chi678], hand })), 0);
		expect(result).not.toBeNull();
		expect(result?.winType).toBe('tsumo');
		expect(result?.han).toBe(2); // double East
	});

	it('still rejects a non-winning kanned hand', async () => {
		// Same melds but a broken concealed shape (no pair/sets completable).
		const broken = [
			t(2, 10),
			t(5, 11),
			t(21, 12),
			t(24, 13),
			t(27, 14),
			t(9, 15),
			t(13, 16),
			t(30, 17)
		];
		const result = await checkTsumo(
			stateWith(player({ melds: [kanEast, chi678], hand: broken })),
			0
		);
		expect(result).toBeNull();
	});
});
