import { describe, it, expect } from 'vitest';

// Unlike engine.test.ts, ai.ts is exercised against the REAL shanten library
// (mahjong-tile-efficiency runs fine under vitest — see ADR 0016 for the same
// approach with riichi-rs), so these tests verify actual tenpai detection.
import { chooseDiscard, shouldDeclareRiichi } from './ai';
import type { GameState, PlayerState, Seat, Meld } from './types';
import type { GameTile } from './tiles';

function tile(code: number, id: number): GameTile {
	return { code, id, isRed: false };
}

// 123m 456m 789m 11p 2p 56s — after the best discard (2p) this waits on 4s/7s,
// so the 14-tile hand sits at shanten 0 (tenpai).
const TENPAI_HAND = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 23, 24].map((c, i) => tile(c, i + 1));

function makePlayer(seat: number, overrides: Partial<PlayerState> = {}): PlayerState {
	return {
		seat: seat as Seat,
		hand: [],
		discards: [],
		melds: [],
		score: 25000,
		isHuman: seat === 0,
		difficulty: seat === 0 ? null : 'basic',
		isRiichi: false,
		isDoubleRiichi: false,
		isIppatsu: false,
		riichiTile: null,
		isFuriten: false,
		isTempFuriten: false,
		...overrides
	};
}

function makeState(player1: PlayerState, overrides: Partial<GameState> = {}): GameState {
	const wall = Array.from({ length: 70 }, (_, i) => tile((i % 34) + 1, 200 + i));
	return {
		phase: 'ai_turn',
		round: 1,
		honba: 0,
		dealer: 0,
		currentSeat: 1,
		turnCount: 1,
		liveWall: wall,
		wallPos: 0,
		deadWall: [],
		rinshankPos: 0,
		riichiBets: 0,
		doraIndicators: [],
		uraDoraIndicators: [],
		anyCallMadeThisRound: false,
		players: [makePlayer(0), player1, makePlayer(2), makePlayer(3)] as GameState['players'],
		lastDiscard: null,
		lastDiscardSeat: null,
		pendingTsumo: null,
		pendingRon: null,
		claimOptions: null,
		roundResult: null,
		exhaustiveDrawResult: null,
		...overrides
	};
}

describe('shouldDeclareRiichi — legality', () => {
	it('declares on a closed tenpai hand with points and wall left', () => {
		const state = makeState(makePlayer(1, { hand: TENPAI_HAND }));
		expect(shouldDeclareRiichi(1, state)).toBe(true);
	});

	it('never declares with an open meld (open riichi is illegal)', () => {
		// Same tiles, but three of them sit in a called pon instead of the hand —
		// the partial concealed hand alone is still "tenpai" to the shanten lib,
		// which is exactly how the illegal open riichi slipped through.
		const meld: Meld = {
			type: 'pon',
			tiles: [tile(10, 90), tile(10, 91), tile(10, 92)],
			calledFrom: 0
		};
		const openHand = TENPAI_HAND.slice(0, 11); // 11 concealed tiles + 3 in the meld
		const state = makeState(makePlayer(1, { hand: openHand, melds: [meld] }));
		expect(shouldDeclareRiichi(1, state)).toBe(false);
	});

	it('never declares with fewer than 1000 points', () => {
		const state = makeState(makePlayer(1, { hand: TENPAI_HAND, score: 800 }));
		expect(shouldDeclareRiichi(1, state)).toBe(false);
	});

	it('never declares with fewer than 4 live-wall tiles remaining', () => {
		const state = makeState(makePlayer(1, { hand: TENPAI_HAND }), { wallPos: 67 }); // 3 left
		expect(shouldDeclareRiichi(1, state)).toBe(false);
	});

	it('still declares with exactly 4 live-wall tiles remaining', () => {
		const state = makeState(makePlayer(1, { hand: TENPAI_HAND }), { wallPos: 66 }); // 4 left
		expect(shouldDeclareRiichi(1, state)).toBe(true);
	});

	it('does not declare when already in riichi', () => {
		const state = makeState(makePlayer(1, { hand: TENPAI_HAND, isRiichi: true }));
		expect(shouldDeclareRiichi(1, state)).toBe(false);
	});
});

describe('chooseDiscard — riichi locks the hand', () => {
	// 123m 456m 789m 11p 56s (13 locked tiles) + a just-drawn East appended last.
	const lockedHand = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 23, 24].map((c, i) => tile(c, i + 1));
	const drawnEast = tile(28, 99);

	it('a riichi AI tsumogiris the drawn tile even when a "safe" tile exists', () => {
		// Seat 2 is also in riichi and has discarded 5s, so the good AI's defensive
		// fallback would otherwise discard its own 5s — breaking its locked tenpai.
		const me = makePlayer(1, {
			hand: [...lockedHand, drawnEast],
			isRiichi: true,
			difficulty: 'good'
		});
		const state = makeState(me);
		state.players[2] = makePlayer(2, { isRiichi: true, discards: [tile(23, 80)] });

		const pick = chooseDiscard(1, state);
		expect(pick.id).toBe(drawnEast.id);
	});

	it('the riichi-declaring discard must keep tenpai, even over a safe tile', () => {
		// TENPAI_HAND's only tenpai-keeping discard is 2p. Seat 2's pond makes 6s
		// "safe"; without the declaringRiichi restriction the good AI would pick 6s
		// and declare an illegal riichi on a 1-shanten hand.
		const me = makePlayer(1, { hand: TENPAI_HAND, difficulty: 'good' });
		const state = makeState(me);
		state.players[2] = makePlayer(2, { isRiichi: true, discards: [tile(24, 80)] });

		const pick = chooseDiscard(1, state, true);
		expect(pick.code).toBe(11); // 2p
	});

	it('without riichi, the good AI still prefers the safe tile', () => {
		// Same board as above but no riichi declaration in play — the defensive
		// fallback should keep working as before.
		const me = makePlayer(1, { hand: TENPAI_HAND, difficulty: 'good' });
		const state = makeState(me);
		state.players[2] = makePlayer(2, { isRiichi: true, discards: [tile(24, 80)] });

		const pick = chooseDiscard(1, state);
		expect(pick.code).toBe(24); // 6s, the safe tile
	});
});
