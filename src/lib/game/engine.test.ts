import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must mock WASM-dependent modules before any engine import triggers them
vi.mock('./ai', () => ({
	getShanten: vi.fn().mockReturnValue(8),
	chooseDiscard: vi.fn(),
	shouldDeclareRiichi: vi.fn().mockReturnValue(false),
	isTenpaiAfterDiscard: vi.fn().mockReturnValue(false),
	riichiAnkanKeepsWaits: vi.fn().mockReturnValue(true)
}));

vi.mock('./scoring', () => ({
	checkWin: vi
		.fn()
		.mockResolvedValue({ isWin: false, han: 0, fu: 0, score: 0, yaku: [], yakuNames: [] })
}));

import {
	humanClaimPon,
	humanClaimChi,
	humanDeclareTsumo,
	humanDeclareRon,
	humanPassClaim,
	humanDiscard,
	getHumanClaimOptions,
	continueGame,
	runAiTurn,
	humanDeclareKakan,
	humanDeclareAnkan,
	humanClaimDaiminkan,
	getPlayerKanOptions,
	kuikaeForbiddenCodes,
	canDeclareKyuushu,
	humanDeclareKyuushu,
	checkTsumo,
	checkRon
} from './engine';
import { chooseDiscard, getShanten, riichiAnkanKeepsWaits, shouldDeclareRiichi } from './ai';
import { checkWin } from './scoring';
import type { GameState, Meld, PlayerState, RoundResult, Seat } from './types';
import type { GameTile } from './tiles';

// ─── helpers ────────────────────────────────────────────────────────────────

function tile(code: number, id: number): GameTile {
	return { code, id, isRed: false };
}

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
		kuikaeForbidden: [],
		anyDiscardCalled: false,
		paoSeat: null,
		...overrides
	};
}

function makeState(overrides: Partial<GameState> = {}): GameState {
	const wall = Array.from({ length: 70 }, (_, i) => tile((i % 34) + 1, 200 + i));
	const deadWall = Array.from({ length: 14 }, (_, i) => tile((i % 34) + 1, 300 + i));
	return {
		phase: 'player_discard',
		round: 1,
		honba: 0,
		dealer: 0,
		currentSeat: 0,
		turnCount: 1,
		liveWall: wall,
		wallPos: 0,
		wallEnd: wall.length,
		deadWall,
		rinshankPos: 0,
		riichiBets: 0,
		doraIndicators: [tile(1, 100)],
		uraDoraIndicators: [tile(2, 101)],
		pendingKanDora: 0,
		anyCallMadeThisRound: false,
		pendingRiichi: null,
		players: [makePlayer(0), makePlayer(1), makePlayer(2), makePlayer(3)] as [
			PlayerState,
			PlayerState,
			PlayerState,
			PlayerState
		],
		lastDiscard: null,
		lastDiscardSeat: null,
		pendingTsumo: null,
		pendingRon: null,
		claimOptions: null,
		roundResult: null,
		extraRons: [],
		exhaustiveDrawResult: null,
		abortiveDraw: null,
		events: [],
		...overrides
	};
}

// ─── humanClaimPon ───────────────────────────────────────────────────────────

describe('humanClaimPon', () => {
	it('removes two hand tiles and creates a pon meld', () => {
		const tA = tile(23, 1);
		const tB = tile(23, 2);
		const tC = tile(23, 3); // the discarded tile
		const other = tile(5, 4);

		const state = makeState({
			phase: 'claim_decision',
			lastDiscard: tC,
			lastDiscardSeat: 1,
			players: [
				makePlayer(0, { hand: [tA, tB, other] }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = humanClaimPon(state, [tA, tB]);

		expect(result.phase).toBe('player_discard');
		expect(result.currentSeat).toBe(0);
		expect(result.players[0].hand).toEqual([other]);
		expect(result.players[0].melds).toHaveLength(1);
		expect(result.players[0].melds[0].type).toBe('pon');
		expect(result.players[0].melds[0].tiles).toEqual([tA, tB, tC]);
		expect(result.players[0].melds[0].calledFrom).toBe(1);
	});

	it('returns state unchanged when not in claim_decision', () => {
		const tA = tile(23, 1);
		const tB = tile(23, 2);
		const state = makeState({ phase: 'player_discard' });

		const result = humanClaimPon(state, [tA, tB]);
		expect(result).toBe(state);
	});
});

// ─── humanClaimChi ───────────────────────────────────────────────────────────

describe('humanClaimChi', () => {
	it('removes two hand tiles and creates a sorted chi meld', () => {
		const t3 = tile(3, 1); // M3
		const t4 = tile(4, 2); // M4
		const t5 = tile(5, 3); // M5 (discarded by seat 3)
		const other = tile(10, 4);

		const state = makeState({
			phase: 'claim_decision',
			lastDiscard: t5,
			lastDiscardSeat: 3,
			players: [
				makePlayer(0, { hand: [t3, t4, other] }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = humanClaimChi(state, [t3, t4]);

		expect(result.phase).toBe('player_discard');
		expect(result.players[0].hand).toEqual([other]);
		expect(result.players[0].melds).toHaveLength(1);
		expect(result.players[0].melds[0].type).toBe('chi');
		// tiles are sorted by code
		expect(result.players[0].melds[0].tiles.map((t) => t.code)).toEqual([3, 4, 5]);
		expect(result.players[0].melds[0].calledFrom).toBe(3);
	});

	it('returns state unchanged when not in claim_decision', () => {
		const tA = tile(3, 1);
		const tB = tile(4, 2);
		const state = makeState({ phase: 'player_discard' });

		const result = humanClaimChi(state, [tA, tB]);
		expect(result).toBe(state);
	});
});

// ─── humanDeclareTsumo ───────────────────────────────────────────────────────

describe('humanDeclareTsumo', () => {
	it('applies pendingTsumo scores and ends the round', async () => {
		const pendingTsumo: RoundResult = {
			winner: 0,
			winType: 'tsumo',
			loser: null,
			han: 2,
			fu: 30,
			score: 2000,
			yaku: [],
			pointChanges: [6000, -2000, -2000, -2000]
		};

		const state = makeState({ pendingTsumo });
		const result = await humanDeclareTsumo(state);

		expect(result.phase).toBe('round_end');
		expect(result.roundResult).toEqual(pendingTsumo);
		expect(result.players[0].score).toBe(31000); // 25000 + 6000
		expect(result.players[1].score).toBe(23000); // 25000 - 2000
		expect(result.players[2].score).toBe(23000);
		expect(result.players[3].score).toBe(23000);
	});

	it('returns state unchanged when pendingTsumo is null', async () => {
		const state = makeState({ pendingTsumo: null });
		const result = await humanDeclareTsumo(state);
		expect(result).toBe(state);
	});
});

// ─── humanDeclareRon ─────────────────────────────────────────────────────────

describe('humanDeclareRon', () => {
	it('applies pendingRon scores from claim_decision and ends the round', async () => {
		const pendingRon: RoundResult = {
			winner: 0,
			winType: 'ron',
			loser: 1,
			han: 3,
			fu: 40,
			score: 7700,
			yaku: [],
			pointChanges: [7700, -7700, 0, 0]
		};

		const state = makeState({ phase: 'claim_decision', pendingRon });
		const result = await humanDeclareRon(state);

		expect(result.phase).toBe('round_end');
		expect(result.roundResult).toEqual(pendingRon);
		expect(result.players[0].score).toBe(32700); // 25000 + 7700
		expect(result.players[1].score).toBe(17300); // 25000 - 7700
	});
});

// ─── humanPassClaim ──────────────────────────────────────────────────────────

describe('humanPassClaim', () => {
	it('advances to the next AI seat when player is not next to draw', async () => {
		// lastDiscardSeat=1 → nextSeat=2, no player draw, no checkTsumo call.
		// AI seats hold empty hands, so no AI claims the discard.
		const state = makeState({
			phase: 'claim_decision',
			lastDiscard: tile(5, 50),
			lastDiscardSeat: 1,
			pendingRon: null,
			claimOptions: []
		});

		const result = await humanPassClaim(state);

		expect(result.phase).toBe('ai_turn');
		expect(result.currentSeat).toBe(2);
		expect(result.pendingRon).toBeNull();
		expect(result.claimOptions).toBeNull();
	});

	it('lets an AI pon the discard the human passed on', async () => {
		// Seat 2 holds two matching tiles for the discarded 23; passing must not
		// forfeit that pon — applyAiCalls should fire and seat 2 becomes current.
		vi.mocked(getShanten).mockReturnValue(8); // not tenpai → AI is willing to pon
		const discarded = tile(23, 50);
		const state = makeState({
			phase: 'claim_decision',
			lastDiscard: discarded,
			lastDiscardSeat: 1,
			pendingRon: null,
			claimOptions: [],
			players: [
				makePlayer(0),
				makePlayer(1),
				// Needs >3 concealed tiles so the pon leaves a discard + a legal hand
				// (callKeepsLegalHand); a 3-tile fixture would now be a strand.
				makePlayer(2, { hand: [tile(23, 60), tile(23, 61), tile(9, 62), tile(8, 63)] }),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanPassClaim(state);

		expect(result.phase).toBe('ai_turn');
		expect(result.currentSeat).toBe(2);
		expect(result.anyCallMadeThisRound).toBe(true);
		expect(result.players[2].melds).toHaveLength(1);
		expect(result.players[2].melds[0].type).toBe('pon');
		expect(result.players[2].melds[0].tiles).toEqual([tile(23, 60), tile(23, 61), discarded]);
	});

	it('returns state unchanged when not in claim_decision', async () => {
		const state = makeState({ phase: 'player_discard' });
		const result = await humanPassClaim(state);
		expect(result).toBe(state);
	});
});

// ─── humanDiscard (riichi auto-declare) ──────────────────────────────────────

describe('humanDiscard — riichi opt-in', () => {
	beforeEach(() => {
		vi.mocked(getShanten).mockReturnValue(8); // default: not tenpai
	});

	it('declares riichi when the flag is set and the discard reaches tenpai (closed hand)', async () => {
		vi.mocked(getShanten).mockReturnValue(0); // tenpai after discard

		const hand = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((code, i) => tile(code, i + 1));
		const discard = hand[12];

		const state = makeState({
			phase: 'player_discard',
			players: [
				makePlayer(0, { hand }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanDiscard(state, discard.id, true);

		expect(result.players[0].isRiichi).toBe(true);
		expect(result.players[0].riichiTile).toEqual(discard);
		expect(result.players[0].score).toBe(24000); // -1000 riichi bet
	});

	it('stays in quiet tenpai when discarding to tenpai without the riichi flag', async () => {
		vi.mocked(getShanten).mockReturnValue(0); // tenpai after discard

		const hand = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((code, i) => tile(code, i + 1));
		const discard = hand[12];

		const state = makeState({
			phase: 'player_discard',
			players: [
				makePlayer(0, { hand }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanDiscard(state, discard.id); // declareRiichi defaults to false

		expect(result.players[0].isRiichi).toBe(false);
		expect(result.players[0].riichiTile).toBe(null);
		expect(result.players[0].score).toBe(25000); // no bet taken
		expect(result.riichiBets).toBe(0);
	});

	it('does not declare riichi with fewer than 1000 points', async () => {
		vi.mocked(getShanten).mockReturnValue(0);

		const hand = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((code, i) => tile(code, i + 1));
		const discard = hand[12];

		const state = makeState({
			phase: 'player_discard',
			players: [
				makePlayer(0, { hand, score: 500 }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanDiscard(state, discard.id, true);

		expect(result.players[0].isRiichi).toBe(false);
		expect(result.players[0].score).toBe(500); // unchanged
	});

	it('does not declare riichi with an open hand (melds present)', async () => {
		vi.mocked(getShanten).mockReturnValue(0);

		const existingMeld = {
			type: 'pon' as const,
			tiles: [tile(5, 90), tile(5, 91), tile(5, 92)] as [GameTile, GameTile, GameTile],
			calledFrom: 1 as Seat
		};
		const hand = [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12].map((code, i) => tile(code, i + 1));
		const discard = hand[10];

		const state = makeState({
			phase: 'player_discard',
			players: [
				makePlayer(0, { hand, melds: [existingMeld] }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanDiscard(state, discard.id, true);

		expect(result.players[0].isRiichi).toBe(false);
		expect(result.players[0].score).toBe(25000);
	});

	it('does not declare riichi when already in riichi', async () => {
		vi.mocked(getShanten).mockReturnValue(0);

		const hand = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((code, i) => tile(code, i + 1));
		const discard = hand[12];

		const state = makeState({
			phase: 'player_discard',
			players: [
				makePlayer(0, { hand, isRiichi: true }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanDiscard(state, discard.id, true);

		expect(result.players[0].isRiichi).toBe(true); // unchanged
		expect(result.players[0].score).toBe(25000); // no additional bet
	});
});

// ─── furiten ─────────────────────────────────────────────────────────────────

describe('furiten', () => {
	it('sets isTempFuriten when passing on an available ron', async () => {
		const pendingRon: RoundResult = {
			winner: 0,
			winType: 'ron',
			loser: 1,
			han: 2,
			fu: 30,
			score: 3900,
			yaku: [],
			pointChanges: [3900, -3900, 0, 0]
		};

		const state = makeState({
			phase: 'claim_decision',
			lastDiscard: tile(5, 50),
			lastDiscardSeat: 1,
			pendingRon,
			claimOptions: []
		});

		const result = await humanPassClaim(state);

		expect(result.players[0].isTempFuriten).toBe(true);
	});

	it('does not set isTempFuriten when passing with no ron available', async () => {
		const state = makeState({
			phase: 'claim_decision',
			lastDiscard: tile(7, 50),
			lastDiscardSeat: 1,
			pendingRon: null,
			claimOptions: [{ type: 'pon', handTiles: [tile(5, 1), tile(5, 2)] }]
		});

		const result = await humanPassClaim(state);

		expect(result.players[0].isTempFuriten).toBe(false);
	});

	it('clears isTempFuriten after the player discards (not in riichi)', async () => {
		vi.mocked(getShanten).mockReturnValue(8);

		const hand = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((code, i) => tile(code, i + 1));
		const discard = hand[12];

		const state = makeState({
			phase: 'player_discard',
			players: [
				makePlayer(0, { hand, isTempFuriten: true }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanDiscard(state, discard.id);

		expect(result.players[0].isTempFuriten).toBe(false);
	});

	it('preserves isTempFuriten after discard when in riichi', async () => {
		vi.mocked(getShanten).mockReturnValue(8);

		const hand = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((code, i) => tile(code, i + 1));
		const discard = hand[12];

		const state = makeState({
			phase: 'player_discard',
			players: [
				makePlayer(0, { hand, isRiichi: true, isTempFuriten: true }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanDiscard(state, discard.id);

		expect(result.players[0].isTempFuriten).toBe(true);
	});
});

// ─── riichi disables calls ───────────────────────────────────────────────────

describe('getHumanClaimOptions — riichi locks the hand', () => {
	// Human holds a pair of 5s (code 23); an opponent discards the third.
	const makeClaimState = (riichi: boolean) =>
		makeState({
			players: [
				makePlayer(0, { hand: [tile(23, 1), tile(23, 2), tile(7, 3)], isRiichi: riichi }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

	it('offers a pon when not in riichi', () => {
		const options = getHumanClaimOptions(makeClaimState(false), tile(23, 99), 1);
		expect(options.some((o) => o.type === 'pon')).toBe(true);
	});

	it('offers no chi/pon/kan once in riichi', () => {
		const options = getHumanClaimOptions(makeClaimState(true), tile(23, 99), 1);
		expect(options).toEqual([]);
	});
});

// ─── continueGame — game-end & renchan rules ─────────────────────────────────

describe('continueGame — exhaustive draw renchan', () => {
	// A round_end state reached via exhaustive draw (roundResult null).
	const drawState = (dealer: Seat, tenpaiSeats: Seat[], overrides: Partial<GameState> = {}) =>
		makeState({
			phase: 'round_end',
			round: 1,
			honba: 0,
			dealer,
			roundResult: null,
			exhaustiveDrawResult: { tenpaiSeats, pointChanges: [0, 0, 0, 0], nagashiSeats: [] },
			...overrides
		});

	it('keeps the dealer and bumps honba when the dealer is tenpai', () => {
		const next = continueGame(drawState(0, [0]));
		expect(next.dealer).toBe(0);
		expect(next.round).toBe(1);
		expect(next.honba).toBe(1);
	});

	it('passes the deal and advances the round when the dealer is noten', () => {
		const next = continueGame(drawState(0, [1, 2]));
		expect(next.dealer).toBe(1);
		expect(next.round).toBe(2);
		expect(next.honba).toBe(1); // honba still advances on a draw
	});

	it('passes the deal when nobody is tenpai', () => {
		const next = continueGame(drawState(0, []));
		expect(next.dealer).toBe(1);
		expect(next.round).toBe(2);
	});
});

describe('continueGame — bust threshold (tobi)', () => {
	const winByNonDealer = (): RoundResult => ({
		winner: 1,
		winType: 'ron',
		loser: 0,
		han: 4,
		fu: 30,
		score: 8000,
		yaku: [],
		pointChanges: [-8000, 8000, 0, 0]
	});

	const stateWithScores = (scores: [number, number, number, number]) =>
		makeState({
			phase: 'round_end',
			round: 1,
			dealer: 0,
			roundResult: winByNonDealer(),
			players: [
				makePlayer(0, { score: scores[0] }),
				makePlayer(1, { score: scores[1] }),
				makePlayer(2, { score: scores[2] }),
				makePlayer(3, { score: scores[3] })
			] as GameState['players']
		});

	it('ends the game when a player is below zero', () => {
		const next = continueGame(stateWithScores([-100, 33100, 25000, 17000]));
		expect(next.phase).toBe('game_end');
	});

	it('does NOT bust at exactly zero — play continues', () => {
		const next = continueGame(stateWithScores([0, 33000, 25000, 17000]));
		expect(next.phase).not.toBe('game_end');
	});
});

describe('continueGame — 30k target + sudden-death overtime', () => {
	const win = (winner: Seat, loser: Seat): RoundResult => ({
		winner,
		winType: 'ron',
		loser,
		han: 3,
		fu: 30,
		score: 3900,
		yaku: [],
		pointChanges: [0, 0, 0, 0]
	});

	// round_end after a win, with explicit scores. `dealer` defaults to the
	// last East seat (3) so a non-dealer win passes the deal past East-4.
	const endState = (
		round: number,
		scores: [number, number, number, number],
		result: RoundResult,
		dealer: Seat = 3
	) =>
		makeState({
			phase: 'round_end',
			round,
			dealer,
			roundResult: result,
			players: scores.map((s, i) => makePlayer(i, { score: s })) as GameState['players']
		});

	it('ends at East-4 when a player has reached the 30k target', () => {
		// East-4, non-dealer (seat 0) wins; leader is at/over 30k.
		const next = continueGame(endState(4, [35000, 25000, 22000, 18000], win(0, 1)));
		expect(next.phase).toBe('game_end');
	});

	it('goes to South overtime when nobody has 30k at East-4', () => {
		const next = continueGame(endState(4, [28000, 27000, 25000, 20000], win(0, 1)));
		expect(next.phase).not.toBe('game_end');
		expect(next.round).toBe(5); // South-1
	});

	it('ends in overtime as soon as someone reaches 30k', () => {
		// South-1 (round 5), non-dealer wins; leader (seat 0) is over the target.
		const next = continueGame(endState(5, [31000, 24000, 25000, 20000], win(1, 0), 0));
		expect(next.phase).toBe('game_end');
	});

	it('keeps playing overtime while everyone is still under 30k', () => {
		const next = continueGame(endState(5, [29000, 26000, 25000, 20000], win(1, 0), 0));
		expect(next.phase).not.toBe('game_end');
		expect(next.round).toBe(6); // South-2
	});

	it('caps overtime at South-4 — game ends even on a dealer renchan under target', () => {
		// South-4 (round 8), dealer (seat 0) wins → would renchan forever otherwise.
		const next = continueGame(endState(8, [29000, 26000, 25000, 20000], win(0, 1), 0));
		expect(next.phase).toBe('game_end');
	});
});

describe('continueGame — agari-yame / tenpai-yame', () => {
	const win = (winner: Seat, loser: Seat): RoundResult => ({
		winner,
		winType: 'ron',
		loser,
		han: 3,
		fu: 30,
		score: 3900,
		yaku: [],
		pointChanges: [0, 0, 0, 0]
	});

	const winState = (
		round: number,
		scores: [number, number, number, number],
		result: RoundResult,
		dealer: Seat = 0
	) =>
		makeState({
			phase: 'round_end',
			round,
			dealer,
			roundResult: result,
			players: scores.map((s, i) => makePlayer(i, { score: s })) as GameState['players']
		});

	const drawState = (
		scores: [number, number, number, number],
		tenpaiSeats: Seat[],
		over: Partial<GameState> = {},
		dealer: Seat = 0
	) =>
		makeState({
			phase: 'round_end',
			round: 4,
			dealer,
			roundResult: null,
			exhaustiveDrawResult: { tenpaiSeats, pointChanges: [0, 0, 0, 0], nagashiSeats: [] },
			players: scores.map((s, i) => makePlayer(i, { score: s })) as GameState['players'],
			...over
		});

	it('ends the game when a 1st-place dealer wins at East-4 over the target (agari-yame)', () => {
		const next = continueGame(winState(4, [33000, 25000, 22000, 20000], win(0, 1)));
		expect(next.phase).toBe('game_end');
	});

	it('ends the game when a 1st-place dealer is tenpai on an East-4 draw (tenpai-yame)', () => {
		const next = continueGame(drawState([32000, 25000, 23000, 20000], [0]));
		expect(next.phase).toBe('game_end');
	});

	it('continues the renchan when the winning dealer is NOT the leader', () => {
		// seat 1 leads; dealer (seat 0) won but can't yame — must keep dealing.
		const next = continueGame(winState(4, [28000, 35000, 22000, 15000], win(0, 1)));
		expect(next.phase).not.toBe('game_end');
		expect(next.round).toBe(4);
		expect(next.dealer).toBe(0);
	});

	it('continues the renchan when the leading dealer is still under the target', () => {
		const next = continueGame(winState(4, [29000, 27000, 24000, 20000], win(0, 1)));
		expect(next.phase).not.toBe('game_end');
		expect(next.round).toBe(4);
	});

	it('does NOT yame on an abortive draw (the hand is just redone)', () => {
		const next = continueGame(
			drawState([32000, 25000, 23000, 20000], [], {
				abortiveDraw: 'suukaikan',
				exhaustiveDrawResult: { tenpaiSeats: [], pointChanges: [0, 0, 0, 0], nagashiSeats: [] }
			})
		);
		expect(next.phase).not.toBe('game_end');
		expect(next.round).toBe(4);
		expect(next.dealer).toBe(0);
	});

	it('does not trigger before the last hand (East-1 dealer win over target)', () => {
		const next = continueGame(winState(1, [33000, 25000, 22000, 20000], win(0, 1)));
		expect(next.phase).not.toBe('game_end');
		expect(next.round).toBe(1);
	});
});

// ─── AI furiten ──────────────────────────────────────────────────────────────

describe('AI ron — furiten', () => {
	// checkWin wins only for the hand carrying the marker tile (code 34). That makes
	// seat 2 the sole winning seat, and also makes its furiten scan "win" on any of
	// its own discards (the scan reuses checkWin against the same marked hand).
	const WIN = { isWin: true, han: 2, fu: 30, score: 2000, yaku: [], yakuNames: [] };
	const NO_WIN = { isWin: false, han: 0, fu: 0, score: 0, yaku: [], yakuNames: [] };

	beforeEach(() => {
		// Tenpai (0): a hand that can ron is tenpai by definition, and the furiten
		// scan's shanten early-exit must not short-circuit these scenarios.
		vi.mocked(getShanten).mockReturnValue(0);
		vi.mocked(checkWin).mockImplementation(async (input: { handCodes: number[] }) =>
			input.handCodes.includes(34) ? WIN : NO_WIN
		);
	});

	const discardState = (seat2Discards: GameTile[]) => {
		const humanHand = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((c, i) => tile(c, i + 1));
		return makeState({
			phase: 'player_discard',
			players: [
				makePlayer(0, { hand: humanHand }),
				makePlayer(1),
				makePlayer(2, { hand: [tile(34, 70)], discards: seat2Discards }),
				makePlayer(3)
			] as GameState['players']
		});
	};

	it('blocks an AI ron when the winning tile class is in its own discards (furiten)', async () => {
		const state = discardState([tile(5, 80)]); // seat 2 already discarded a winner
		const result = await humanDiscard(state, 13); // human discards; seat 2 "wins" on it

		expect(result.roundResult).toBeNull();
		expect(result.phase).not.toBe('round_end');
	});

	it('lets the AI ron when it has no furiten discards', async () => {
		const state = discardState([]); // clean pond → no furiten
		const result = await humanDiscard(state, 13);

		expect(result.phase).toBe('round_end');
		expect(result.roundResult?.winner).toBe(2);
		expect(result.roundResult?.winType).toBe('ron');
	});

	it('head-bump: the AI ron goes to the seat closest to the discarder in turn order', async () => {
		// Seat 2 discards; seats 1 and 3 both win on the tile. Turn order from the
		// discarder is 3 → (0) → 1, so seat 3 must take the ron, not seat 1.
		vi.mocked(chooseDiscard).mockImplementation((seat: Seat, st: GameState) => {
			const hand = st.players[seat].hand;
			return hand[hand.length - 1];
		});
		const state = makeState({
			phase: 'ai_turn',
			currentSeat: 2,
			players: [
				makePlayer(0),
				makePlayer(1, { hand: [tile(34, 71)] }),
				makePlayer(2, { hand: [tile(5, 60)] }),
				makePlayer(3, { hand: [tile(34, 72)] })
			] as GameState['players']
		});

		const result = await runAiTurn(state);

		expect(result.phase).toBe('round_end');
		expect(result.roundResult?.winner).toBe(3);
	});

	it('head-bump on a passed claim: closest AI seat to the discarder takes the ron', async () => {
		// Human (seat 0) discarded and passed its own claim; seats 1 and 3 both win.
		// Turn order from seat 0 is 1 → 2 → 3, so seat 1 takes it.
		const state = makeState({
			phase: 'claim_decision',
			lastDiscard: tile(5, 50),
			lastDiscardSeat: 0,
			pendingRon: null,
			claimOptions: [],
			players: [
				makePlayer(0),
				makePlayer(1, { hand: [tile(34, 71)] }),
				makePlayer(2),
				makePlayer(3, { hand: [tile(34, 72)] })
			] as GameState['players']
		});

		const result = await humanPassClaim(state);

		expect(result.phase).toBe('round_end');
		expect(result.roundResult?.winner).toBe(1);
	});

	it('blocks a furiten AI ron when the human passes a claim', async () => {
		const state = makeState({
			phase: 'claim_decision',
			lastDiscard: tile(5, 50),
			lastDiscardSeat: 0,
			pendingRon: null,
			claimOptions: [],
			players: [
				makePlayer(0),
				makePlayer(1),
				makePlayer(2, { hand: [tile(34, 70)], discards: [tile(5, 80)] }),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanPassClaim(state);

		expect(result.roundResult).toBeNull();
		expect(result.phase).not.toBe('round_end');
	});
});

// ─── chankan flag ────────────────────────────────────────────────────────────

describe('humanDeclareKakan — chankan scoring flag', () => {
	it('checks AI rons on the added tile with the chankan (after_kan) flag set', async () => {
		const NO_WIN = { isWin: false, han: 0, fu: 0, score: 0, yaku: [], yakuNames: [] };
		vi.mocked(checkWin).mockClear(); // drop ron calls recorded by earlier tests
		vi.mocked(checkWin).mockResolvedValue(NO_WIN);
		vi.mocked(getShanten).mockReturnValue(8);

		const ponMeld = {
			type: 'pon' as const,
			tiles: [tile(5, 30), tile(5, 31), tile(5, 32)],
			calledFrom: 1 as Seat
		};
		const state = makeState({
			players: [
				makePlayer(0, { hand: [tile(5, 40), tile(9, 41)], melds: [ponMeld] }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		await humanDeclareKakan(state, 0);

		// The chankan checks are the ron-shaped calls on the added tile (code 5);
		// every one of them must carry afterKan so chankan scores correctly.
		const chankanChecks = vi
			.mocked(checkWin)
			.mock.calls.map(([input]) => input)
			.filter((input) => !input.isTsumo && input.ronTileCode === 5);
		expect(chankanChecks.length).toBeGreaterThan(0);
		for (const input of chankanChecks) {
			expect(input.afterKan).toBe(true);
		}
	});
});

// ─── leftover riichi sticks at game end ──────────────────────────────────────

describe('continueGame — leftover riichi sticks go to 1st place', () => {
	// Carried sticks only exist when the final hand was a draw (a win claims them
	// in applyRoundResult), so these states end with roundResult: null.
	const drawEnd = (round: number, scores: [number, number, number, number], riichiBets: number) =>
		makeState({
			phase: 'round_end',
			round,
			dealer: 3,
			roundResult: null,
			exhaustiveDrawResult: { tenpaiSeats: [], pointChanges: [0, 0, 0, 0], nagashiSeats: [] },
			riichiBets,
			players: scores.map((s, i) => makePlayer(i, { score: s })) as GameState['players']
		});

	it('awards carried sticks to the leader when the game ends at the target', () => {
		// East-4 draw, noten dealer passes → game ends (leader ≥ 30k); 2 sticks carried.
		const next = continueGame(drawEnd(4, [31000, 25000, 23000, 19000], 2));
		expect(next.phase).toBe('game_end');
		expect(next.players[0].score).toBe(33000);
		expect(next.riichiBets).toBe(0);
	});

	it('awards carried sticks to the leader on a bust end', () => {
		const next = continueGame(drawEnd(1, [30000, -1000, 24000, 22000], 1));
		expect(next.phase).toBe('game_end');
		expect(next.players[0].score).toBe(31000);
		expect(next.riichiBets).toBe(0);
	});

	it('breaks a score tie toward the earlier seat', () => {
		const next = continueGame(drawEnd(4, [30000, 30000, 20000, 15000], 1));
		expect(next.phase).toBe('game_end');
		expect(next.players[0].score).toBe(31000);
		expect(next.players[1].score).toBe(30000);
	});
});

// ─── kan shortens the live wall ──────────────────────────────────────────────

describe('kan — live wall shortening (haitei timing)', () => {
	it('an ankan moves the wall end back by one', async () => {
		vi.mocked(getShanten).mockReturnValue(8);
		const quad = [tile(7, 1), tile(7, 2), tile(7, 3), tile(7, 4)];
		const state = makeState({
			players: [
				makePlayer(0, { hand: [...quad, tile(9, 5)] }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const { humanDeclareAnkan } = await import('./engine');
		const result = await humanDeclareAnkan(state, 7);

		expect(result.wallEnd).toBe(state.wallEnd - 1);
	});

	it('the draw exhausts at wallEnd, not at the physical end of the live wall', async () => {
		// One kan has happened: wallEnd sits one short of liveWall.length and the
		// wall position has reached it — the next draw must trigger the draw, even
		// though a physical tile still sits at liveWall[69].
		const state = makeState({
			phase: 'claim_decision',
			lastDiscard: tile(5, 50),
			lastDiscardSeat: 3, // next to draw is the human (seat 0)
			pendingRon: null,
			claimOptions: [],
			wallPos: 69,
			wallEnd: 69
		});

		const result = await humanPassClaim(state);

		expect(result.phase).toBe('round_end');
		expect(result.roundResult).toBeNull();
		expect(result.exhaustiveDrawResult).not.toBeNull();
	});
});

// ─── riichi ankan gate ───────────────────────────────────────────────────────

describe('riichi ankan — just-drawn tile + wait preservation', () => {
	const NO_WIN = { isWin: false, han: 0, fu: 0, score: 0, yaku: [], yakuNames: [] };

	beforeEach(() => {
		vi.mocked(getShanten).mockReturnValue(8);
		vi.mocked(checkWin).mockResolvedValue(NO_WIN);
		vi.mocked(riichiAnkanKeepsWaits).mockClear();
		vi.mocked(riichiAnkanKeepsWaits).mockReturnValue(true);
	});

	// A riichi hand holding three 5p with the 4th just drawn (appended last).
	const riichiQuadPlayer = () =>
		makePlayer(0, {
			isRiichi: true,
			hand: [
				...[1, 2, 3, 7, 8, 9, 20, 21, 22, 30].map((c, i) => tile(c, i + 1)),
				tile(14, 11),
				tile(14, 12),
				tile(14, 13),
				tile(14, 99) // the drawn 4th copy
			]
		});

	it('offers the ankan when the quad is the drawn tile and the wait is preserved', () => {
		const state = makeState({
			players: [
				riichiQuadPlayer(),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		expect(getPlayerKanOptions(state).ankan).toEqual([14]);
	});

	it('suppresses the ankan when it would change the wait', () => {
		vi.mocked(riichiAnkanKeepsWaits).mockReturnValue(false);
		const state = makeState({
			players: [
				riichiQuadPlayer(),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		expect(getPlayerKanOptions(state).ankan).toEqual([]);
	});

	it('suppresses an ankan of a quad that is not the just-drawn tile', () => {
		// The full quad sat in the hand before this draw; the drawn tile is a 1z.
		const player = makePlayer(0, {
			isRiichi: true,
			hand: [
				...[1, 2, 3, 7, 8, 9, 20, 21, 22].map((c, i) => tile(c, i + 1)),
				tile(14, 11),
				tile(14, 12),
				tile(14, 13),
				tile(14, 14),
				tile(28, 99) // drawn tile, not part of the quad
			]
		});
		const state = makeState({
			players: [player, makePlayer(1), makePlayer(2), makePlayer(3)] as GameState['players']
		});

		expect(getPlayerKanOptions(state).ankan).toEqual([]);
		expect(riichiAnkanKeepsWaits).not.toHaveBeenCalled();
	});

	it('does not consult the gate outside riichi', () => {
		const player = makePlayer(0, {
			hand: [tile(14, 11), tile(14, 12), tile(14, 13), tile(14, 14), tile(5, 15)]
		});
		const state = makeState({
			players: [player, makePlayer(1), makePlayer(2), makePlayer(3)] as GameState['players']
		});

		expect(getPlayerKanOptions(state).ankan).toEqual([14]);
		expect(riichiAnkanKeepsWaits).not.toHaveBeenCalled();
	});

	it('humanDeclareAnkan refuses a wait-changing kan during riichi', async () => {
		vi.mocked(riichiAnkanKeepsWaits).mockReturnValue(false);
		const state = makeState({
			players: [
				riichiQuadPlayer(),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanDeclareAnkan(state, 14);

		expect(result).toBe(state); // rejected outright — no meld, no rinshan draw
	});

	it('a riichi AI does not kan a fresh quad that would change its wait', async () => {
		vi.mocked(riichiAnkanKeepsWaits).mockReturnValue(false);
		vi.mocked(chooseDiscard).mockImplementation((seat: Seat, st: GameState) => {
			const hand = st.players[seat].hand;
			return hand[hand.length - 1];
		});
		// Seat 3 (good AI) in riichi holds three 5p; liveWall[wallPos] is the 4th.
		const aiHand = [
			...[1, 2, 3, 7, 8, 9, 20, 21, 22, 30].map((c, i) => tile(c, 50 + i)),
			tile(14, 61),
			tile(14, 62),
			tile(14, 63)
		];
		const state = makeState({
			phase: 'ai_turn',
			currentSeat: 3,
			wallPos: 13, // liveWall[13] has code (13 % 34) + 1 = 14 (5p)
			players: [
				makePlayer(0),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3, { hand: aiHand, isRiichi: true, difficulty: 'good' })
			] as GameState['players']
		});

		const result = await runAiTurn(state);

		expect(result.players[3].melds).toEqual([]);
	});

	it('a riichi AI still kans when the wait is preserved', async () => {
		vi.mocked(chooseDiscard).mockImplementation((seat: Seat, st: GameState) => {
			const hand = st.players[seat].hand;
			return hand[hand.length - 1];
		});
		const aiHand = [
			...[1, 2, 3, 7, 8, 9, 20, 21, 22, 30].map((c, i) => tile(c, 50 + i)),
			tile(14, 61),
			tile(14, 62),
			tile(14, 63)
		];
		const state = makeState({
			phase: 'ai_turn',
			currentSeat: 3,
			wallPos: 13,
			players: [
				makePlayer(0),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3, { hand: aiHand, isRiichi: true, difficulty: 'good' })
			] as GameState['players']
		});

		const result = await runAiTurn(state);

		expect(result.players[3].melds.map((m) => m.type)).toEqual(['ankan']);
	});
});

// ─── ankan breaks own ippatsu ────────────────────────────────────────────────

describe('ankan breaks the declarer’s own ippatsu', () => {
	const NO_WIN = { isWin: false, han: 0, fu: 0, score: 0, yaku: [], yakuNames: [] };

	beforeEach(() => {
		vi.mocked(getShanten).mockReturnValue(8);
		vi.mocked(checkWin).mockClear();
		vi.mocked(checkWin).mockResolvedValue(NO_WIN);
		vi.mocked(riichiAnkanKeepsWaits).mockReturnValue(true);
	});

	it('human: riichi → ankan → the rinshan tsumo check sees no ippatsu', async () => {
		// In riichi with the ippatsu window open, holding three 5p + the drawn 4th.
		const player = makePlayer(0, {
			isRiichi: true,
			isIppatsu: true,
			hand: [
				...[1, 2, 3, 7, 8, 9, 20, 21, 22, 30].map((c, i) => tile(c, i + 1)),
				tile(14, 11),
				tile(14, 12),
				tile(14, 13),
				tile(14, 99)
			]
		});
		const state = makeState({
			players: [player, makePlayer(1), makePlayer(2), makePlayer(3)] as GameState['players']
		});

		const result = await humanDeclareAnkan(state, 14);

		expect(result.players[0].melds.map((m) => m.type)).toEqual(['ankan']);
		expect(result.players[0].isIppatsu).toBe(false);
		// The rinshan tsumo check (afterKan) must already score without ippatsu
		const kanTsumoCall = vi
			.mocked(checkWin)
			.mock.calls.find(([input]) => input.afterKan === true && input.isTsumo === true);
		expect(kanTsumoCall).toBeDefined();
		expect(kanTsumoCall![0].isIppatsu).toBe(false);
	});

	it('AI: riichi → ankan → the rinshan tsumo check sees no ippatsu', async () => {
		vi.mocked(chooseDiscard).mockImplementation((seat: Seat, st: GameState) => {
			const hand = st.players[seat].hand;
			return hand[hand.length - 1];
		});
		// Seat 3 (good AI) in riichi/ippatsu holds three 5p; liveWall[13] is the 4th.
		const aiHand = [
			...[1, 2, 3, 7, 8, 9, 20, 21, 22, 30].map((c, i) => tile(c, 50 + i)),
			tile(14, 61),
			tile(14, 62),
			tile(14, 63)
		];
		const state = makeState({
			phase: 'ai_turn',
			currentSeat: 3,
			wallPos: 13,
			players: [
				makePlayer(0),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3, { hand: aiHand, isRiichi: true, isIppatsu: true, difficulty: 'good' })
			] as GameState['players']
		});

		const result = await runAiTurn(state);

		expect(result.players[3].melds.map((m) => m.type)).toEqual(['ankan']);
		const kanTsumoCall = vi
			.mocked(checkWin)
			.mock.calls.find(([input]) => input.afterKan === true && input.isTsumo === true);
		expect(kanTsumoCall).toBeDefined();
		expect(kanTsumoCall![0].isIppatsu).toBe(false);
	});

	it('still clears the other seats’ ippatsu as before', async () => {
		const player = makePlayer(0, {
			hand: [tile(14, 11), tile(14, 12), tile(14, 13), tile(14, 14), tile(5, 15)]
		});
		const state = makeState({
			players: [
				player,
				makePlayer(1, { isRiichi: true, isIppatsu: true }),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanDeclareAnkan(state, 14);

		expect(result.players[0].melds.map((m) => m.type)).toEqual(['ankan']);
		expect(result.players[1].isIppatsu).toBe(false);
	});
});

// ─── kan needs a live-wall tile ──────────────────────────────────────────────

describe('kan — illegal with an empty live wall', () => {
	const NO_WIN = { isWin: false, han: 0, fu: 0, score: 0, yaku: [], yakuNames: [] };

	beforeEach(() => {
		vi.mocked(getShanten).mockReturnValue(8);
		vi.mocked(checkWin).mockResolvedValue(NO_WIN);
	});

	const quadHand = [tile(14, 11), tile(14, 12), tile(14, 13), tile(14, 14), tile(5, 15)];

	it('offers no kan options when the live wall is empty', () => {
		const state = makeState({
			wallPos: 70, // == wallEnd: nothing left to draw
			players: [
				makePlayer(0, { hand: quadHand }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		expect(getPlayerKanOptions(state)).toEqual({ ankan: [], kakan: [] });
	});

	it('offers no kan options when all four rinshan tiles are used (no 5th kan)', () => {
		const state = makeState({
			rinshankPos: 4,
			players: [
				makePlayer(0, { hand: quadHand }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		expect(getPlayerKanOptions(state)).toEqual({ ankan: [], kakan: [] });
	});

	it('humanDeclareAnkan refuses on an empty live wall', async () => {
		const state = makeState({
			wallPos: 70,
			players: [
				makePlayer(0, { hand: quadHand }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		expect(await humanDeclareAnkan(state, 14)).toBe(state);
	});

	it('humanDeclareKakan refuses on an empty live wall', async () => {
		const pon: Meld = {
			type: 'pon',
			tiles: [tile(14, 11), tile(14, 12), tile(14, 13)],
			calledFrom: 1
		};
		const state = makeState({
			wallPos: 70,
			players: [
				makePlayer(0, { hand: [tile(14, 14), tile(5, 15)], melds: [pon] }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		expect(await humanDeclareKakan(state, 0)).toBe(state);
	});

	it('the human claim options drop the daiminkan but keep the pon', () => {
		const state = makeState({
			wallPos: 70,
			players: [
				makePlayer(0, { hand: [tile(14, 11), tile(14, 12), tile(14, 13), tile(5, 15)] }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const options = getHumanClaimOptions(state, tile(14, 99), 1);
		expect(options.map((o) => o.type)).toEqual(['pon']);
	});

	it('an AI with three matching tiles pons instead of daiminkans on an empty wall', async () => {
		// Seat 1 holds three of the discarded tile + spares; with the wall empty the
		// daiminkan branch must be skipped, falling through to the pon branch.
		const state = makeState({
			wallPos: 70,
			players: [
				makePlayer(0, { hand: [tile(20, 1), tile(21, 2), tile(22, 3), tile(14, 4)] }),
				makePlayer(1, {
					hand: [tile(14, 31), tile(14, 32), tile(14, 33), tile(5, 34), tile(6, 35)]
				}),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanDiscard(state, 4); // discard the 5p (code 14)
		// With an empty wall, humanDiscard's flow still applies AI calls directly.
		expect(result.players[1].melds.map((m) => m.type)).toEqual(['pon']);
	});
});

// ─── kan dora timing ─────────────────────────────────────────────────────────

describe('kan dora timing — ankan flips now, minkan after the discard settles', () => {
	const NO_WIN = { isWin: false, han: 0, fu: 0, score: 0, yaku: [], yakuNames: [] };
	const WIN = { isWin: true, han: 2, fu: 30, score: 2000, yaku: [], yakuNames: [] };

	beforeEach(() => {
		vi.mocked(getShanten).mockReturnValue(8);
		vi.mocked(checkWin).mockClear();
		vi.mocked(checkWin).mockResolvedValue(NO_WIN);
	});

	const doraEvents = (s: GameState) => s.events.filter((e) => e.type === 'dora');

	it('an ankan reveals the new indicator immediately', async () => {
		const state = makeState({
			players: [
				makePlayer(0, {
					hand: [tile(14, 11), tile(14, 12), tile(14, 13), tile(14, 14), tile(5, 15)]
				}),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanDeclareAnkan(state, 14);

		expect(result.doraIndicators).toHaveLength(2);
		expect(result.uraDoraIndicators).toHaveLength(2);
		expect(result.pendingKanDora).toBe(0);
		expect(doraEvents(result)).toHaveLength(1);
	});

	const daiminkanState = (players2and3: PlayerState[] = [makePlayer(2), makePlayer(3)]) =>
		makeState({
			phase: 'claim_decision',
			lastDiscard: tile(14, 99),
			lastDiscardSeat: 1,
			players: [
				makePlayer(0, {
					hand: [tile(14, 11), tile(14, 12), tile(14, 13), tile(5, 15), tile(6, 16)]
				}),
				makePlayer(1),
				...players2and3
			] as GameState['players']
		});

	it('a daiminkan defers the indicator until the post-kan discard passes', async () => {
		const afterKan = await humanClaimDaiminkan(daiminkanState(), [
			tile(14, 11),
			tile(14, 12),
			tile(14, 13)
		]);

		expect(afterKan.doraIndicators).toHaveLength(1); // still hidden
		expect(afterKan.uraDoraIndicators).toHaveLength(1);
		expect(afterKan.pendingKanDora).toBe(1);
		expect(doraEvents(afterKan)).toHaveLength(0);

		// The kan player's discard survives every ron check → the indicator flips.
		const afterDiscard = await humanDiscard(afterKan, 15);

		expect(afterDiscard.doraIndicators).toHaveLength(2);
		expect(afterDiscard.uraDoraIndicators).toHaveLength(2);
		expect(afterDiscard.pendingKanDora).toBe(0);
		expect(doraEvents(afterDiscard)).toHaveLength(1);
	});

	it('a ron on the post-kan discard does NOT count the new indicator', async () => {
		// Seat 2 wins on anything once its marker hand is consulted.
		vi.mocked(checkWin).mockImplementation(async (input: { handCodes: number[] }) =>
			input.handCodes.includes(34) ? WIN : NO_WIN
		);
		const afterKan = await humanClaimDaiminkan(
			daiminkanState([makePlayer(2, { hand: [tile(34, 70)] }), makePlayer(3)]),
			[tile(14, 11), tile(14, 12), tile(14, 13)]
		);
		expect(afterKan.pendingKanDora).toBe(1);

		const afterDiscard = await humanDiscard(afterKan, 15);

		expect(afterDiscard.phase).toBe('round_end');
		expect(afterDiscard.roundResult?.winner).toBe(2);
		// The deferred indicator never flipped — and the winning score was
		// computed against the pre-kan indicators only.
		expect(afterDiscard.doraIndicators).toHaveLength(1);
		const winningCall = vi
			.mocked(checkWin)
			.mock.calls.find(([input]) => input.handCodes.includes(34) && input.ronTileCode !== null);
		expect(winningCall).toBeDefined();
		expect(winningCall![0].doraIndicators).toHaveLength(1);
	});

	it('a kakan defers the indicator too', async () => {
		const pon: Meld = {
			type: 'pon',
			tiles: [tile(14, 11), tile(14, 12), tile(14, 13)],
			calledFrom: 1
		};
		const state = makeState({
			players: [
				makePlayer(0, { hand: [tile(14, 14), tile(5, 15)], melds: [pon] }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanDeclareKakan(state, 0);

		expect(result.players[0].melds.map((m) => m.type)).toEqual(['kakan']);
		expect(result.doraIndicators).toHaveLength(1);
		expect(result.pendingKanDora).toBe(1);
	});

	it('claiming the post-kan discard (pon) still flips the deferred indicator', () => {
		// An AI minkan'd and discarded; the human pons that discard. The discard
		// wasn't ronned, so the deferred indicator must flip with the claim.
		const state = makeState({
			phase: 'claim_decision',
			pendingKanDora: 1,
			lastDiscard: tile(23, 99),
			lastDiscardSeat: 1,
			players: [
				makePlayer(0, { hand: [tile(23, 1), tile(23, 2), tile(5, 3)] }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = humanClaimPon(state, [tile(23, 1), tile(23, 2)]);

		expect(result.doraIndicators).toHaveLength(2);
		expect(result.pendingKanDora).toBe(0);
	});

	it('an AI kakan defers and flips after its own discard settles', async () => {
		vi.mocked(chooseDiscard).mockImplementation((seat: Seat, st: GameState) => {
			const hand = st.players[seat].hand;
			return hand[hand.length - 1];
		});
		const pon: Meld = {
			type: 'pon',
			tiles: [tile(14, 61), tile(14, 62), tile(14, 63)],
			calledFrom: 0
		};
		const aiHand = [
			...[1, 2, 3, 7, 8, 9, 20, 21, 22].map((c, i) => tile(c, 50 + i)),
			tile(14, 64) // the 4th copy for the kakan
		];
		const state = makeState({
			phase: 'ai_turn',
			currentSeat: 3,
			players: [
				makePlayer(0),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3, { hand: aiHand, melds: [pon], difficulty: 'good' })
			] as GameState['players']
		});

		const result = await runAiTurn(state);

		expect(result.players[3].melds.map((m) => m.type)).toEqual(['kakan']);
		// The kan deferred its indicator, the AI's own discard then settled
		// unronned within the same turn — so it is revealed by the end.
		expect(result.pendingKanDora).toBe(0);
		expect(result.doraIndicators).toHaveLength(2);
	});
});

// ─── riichi stick timing ─────────────────────────────────────────────────────

describe('riichi stick — paid only when the declaring discard settles', () => {
	const NO_WIN = { isWin: false, han: 0, fu: 0, score: 0, yaku: [], yakuNames: [] };
	const WIN = { isWin: true, han: 2, fu: 30, score: 2000, yaku: [], yakuNames: [] };

	beforeEach(() => {
		vi.mocked(getShanten).mockReturnValue(0); // riichi legality needs tenpai
		vi.mocked(checkWin).mockClear();
		vi.mocked(checkWin).mockResolvedValue(NO_WIN);
		vi.mocked(shouldDeclareRiichi).mockReturnValue(false);
	});

	const humanHand = Array.from({ length: 14 }, (_, i) => tile(i + 1, i + 1));

	it('pays the stick once the riichi discard survives every ron check', async () => {
		const state = makeState({
			players: [
				makePlayer(0, { hand: humanHand }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanDiscard(state, 14, true);

		expect(result.players[0].isRiichi).toBe(true);
		expect(result.players[0].score).toBe(24000);
		expect(result.riichiBets).toBe(1);
		expect(result.pendingRiichi).toBeNull();
	});

	it('pays NO stick when the riichi discard is ronned', async () => {
		// Seat 2 wins on anything once its marker hand is consulted.
		vi.mocked(checkWin).mockImplementation(async (input: { handCodes: number[] }) =>
			input.handCodes.includes(34) ? WIN : NO_WIN
		);
		const state = makeState({
			players: [
				makePlayer(0, { hand: humanHand }),
				makePlayer(1),
				makePlayer(2, { hand: [tile(34, 70)] }),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanDiscard(state, 14, true);

		expect(result.phase).toBe('round_end');
		expect(result.roundResult?.winner).toBe(2);
		// Declarer pays the ron, but not the 1000-point stick…
		expect(result.players[0].score).toBe(23000); // 25000 − 2000, no stick
		expect(result.riichiBets).toBe(0);
		// …and the winner sweeps no stick either.
		expect(result.players[2].score).toBe(27000); // 25000 + 2000 only
	});

	it('an AI riichi pays once its declaring discard settles', async () => {
		vi.mocked(shouldDeclareRiichi).mockImplementation((seat: Seat) => seat === 1);
		vi.mocked(chooseDiscard).mockImplementation((seat: Seat, st: GameState) => {
			const hand = st.players[seat].hand;
			return hand[hand.length - 1];
		});
		const state = makeState({
			phase: 'ai_turn',
			currentSeat: 1,
			players: [
				makePlayer(0),
				makePlayer(1, { hand: Array.from({ length: 13 }, (_, i) => tile(i + 1, 30 + i)) }),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await runAiTurn(state);

		expect(result.players[1].isRiichi).toBe(true);
		expect(result.players[1].score).toBe(24000);
		expect(result.riichiBets).toBe(1);
		expect(result.pendingRiichi).toBeNull();
	});

	it('an AI riichi pays NO stick when its riichi tile is ronned', async () => {
		vi.mocked(shouldDeclareRiichi).mockImplementation((seat: Seat) => seat === 1);
		vi.mocked(chooseDiscard).mockImplementation((seat: Seat, st: GameState) => {
			const hand = st.players[seat].hand;
			return hand[hand.length - 1];
		});
		vi.mocked(checkWin).mockImplementation(async (input: { handCodes: number[] }) =>
			input.handCodes.includes(34) ? WIN : NO_WIN
		);
		const state = makeState({
			phase: 'ai_turn',
			currentSeat: 1,
			players: [
				makePlayer(0),
				makePlayer(1, { hand: Array.from({ length: 13 }, (_, i) => tile(i + 1, 30 + i)) }),
				makePlayer(2, { hand: [tile(34, 70)] }),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await runAiTurn(state);

		expect(result.phase).toBe('round_end');
		expect(result.roundResult?.winner).toBe(2);
		expect(result.players[1].score).toBe(23000); // ron payment only, no stick
		expect(result.riichiBets).toBe(0);
		expect(result.players[2].score).toBe(27000);
	});

	it('a call on the riichi discard still completes the riichi', () => {
		// Seat 1 declared riichi; the human pons the riichi tile. The declaration
		// completes (stick paid) — only a ron voids it.
		vi.mocked(getShanten).mockReturnValue(8);
		const state = makeState({
			phase: 'claim_decision',
			pendingRiichi: 1,
			lastDiscard: tile(23, 99),
			lastDiscardSeat: 1,
			players: [
				makePlayer(0, { hand: [tile(23, 1), tile(23, 2), tile(5, 3)] }),
				makePlayer(1, { isRiichi: true }),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = humanClaimPon(state, [tile(23, 1), tile(23, 2)]);

		expect(result.players[1].score).toBe(24000);
		expect(result.riichiBets).toBe(1);
		expect(result.pendingRiichi).toBeNull();
	});

	it('a passed claim on the riichi discard completes the riichi', async () => {
		vi.mocked(getShanten).mockReturnValue(8);
		const state = makeState({
			phase: 'claim_decision',
			pendingRiichi: 1,
			lastDiscard: tile(5, 50),
			lastDiscardSeat: 1,
			pendingRon: null,
			claimOptions: [],
			players: [
				makePlayer(0),
				makePlayer(1, { isRiichi: true }),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanPassClaim(state);

		expect(result.players[1].score).toBe(24000);
		expect(result.riichiBets).toBe(1);
		expect(result.pendingRiichi).toBeNull();
	});
});

// ─── AI ippatsu window ───────────────────────────────────────────────────────

describe('AI riichi — the ippatsu window survives the declaring discard', () => {
	const NO_WIN = { isWin: false, han: 0, fu: 0, score: 0, yaku: [], yakuNames: [] };

	beforeEach(() => {
		vi.mocked(getShanten).mockReturnValue(8);
		vi.mocked(checkWin).mockResolvedValue(NO_WIN);
		vi.mocked(shouldDeclareRiichi).mockReturnValue(false);
		vi.mocked(chooseDiscard).mockImplementation((seat: Seat, st: GameState) => {
			const hand = st.players[seat].hand;
			return hand[hand.length - 1];
		});
	});

	const aiHand = () => Array.from({ length: 13 }, (_, i) => tile(i + 1, 30 + i));

	it('stays open after the declaring discard', async () => {
		vi.mocked(shouldDeclareRiichi).mockImplementation((seat: Seat) => seat === 1);
		const state = makeState({
			phase: 'ai_turn',
			currentSeat: 1,
			players: [
				makePlayer(0),
				makePlayer(1, { hand: aiHand() }),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await runAiTurn(state);

		expect(result.players[1].isRiichi).toBe(true);
		expect(result.players[1].isIppatsu).toBe(true);
	});

	it('closes on the next (tsumogiri) discard as before', async () => {
		const state = makeState({
			phase: 'ai_turn',
			currentSeat: 1,
			players: [
				makePlayer(0),
				makePlayer(1, { hand: aiHand(), isRiichi: true, isIppatsu: true }),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await runAiTurn(state);

		expect(result.players[1].isIppatsu).toBe(false);
	});
});

// ─── post-call detection with kan melds ──────────────────────────────────────

describe('runAiTurn — a kan meld does not make later turns look post-call', () => {
	const NO_WIN = { isWin: false, han: 0, fu: 0, score: 0, yaku: [], yakuNames: [] };

	beforeEach(() => {
		vi.mocked(getShanten).mockReturnValue(8);
		vi.mocked(checkWin).mockResolvedValue(NO_WIN);
		vi.mocked(shouldDeclareRiichi).mockReturnValue(false);
		vi.mocked(chooseDiscard).mockImplementation((seat: Seat, st: GameState) => {
			const hand = st.players[seat].hand;
			return hand[hand.length - 1];
		});
	});

	it('an AI holding an ankan draws on its turn (10 concealed + 4 meld tiles)', async () => {
		const ankan: Meld = {
			type: 'ankan',
			tiles: [tile(14, 61), tile(14, 62), tile(14, 63), tile(14, 64)],
			calledFrom: null
		};
		const state = makeState({
			phase: 'ai_turn',
			currentSeat: 1,
			players: [
				makePlayer(0),
				makePlayer(1, {
					hand: Array.from({ length: 10 }, (_, i) => tile(i + 1, 30 + i)),
					melds: [ankan]
				}),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await runAiTurn(state);

		// Drew (wall advanced), then discarded — the hand is back to 10 tiles.
		expect(result.wallPos).toBe(state.wallPos + 1);
		expect(result.players[1].hand).toHaveLength(10);
		expect(result.players[1].discards).toHaveLength(1);
	});

	it('a genuine post-call hand (pon, 11 concealed + 3 meld tiles) still skips the draw', async () => {
		const pon: Meld = {
			type: 'pon',
			tiles: [tile(14, 61), tile(14, 62), tile(14, 63)],
			calledFrom: 0
		};
		const state = makeState({
			phase: 'ai_turn',
			currentSeat: 1,
			players: [
				makePlayer(0),
				makePlayer(1, {
					hand: Array.from({ length: 11 }, (_, i) => tile(i + 1, 30 + i)),
					melds: [pon]
				}),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await runAiTurn(state);

		// No draw — the call already provided the 14th tile.
		expect(result.wallPos).toBe(state.wallPos);
		expect(result.players[1].hand).toHaveLength(10);
		expect(result.players[1].discards).toHaveLength(1);
	});

	it('post-kan: the turn right after the kan discards the rinshan-completed hand without drawing', async () => {
		// 11 concealed + 4-tile kan = the state immediately after a kan's rinshan
		// draw (the kan turn itself) — this IS post-call-like and must not draw.
		const ankan: Meld = {
			type: 'ankan',
			tiles: [tile(14, 61), tile(14, 62), tile(14, 63), tile(14, 64)],
			calledFrom: null
		};
		const state = makeState({
			phase: 'ai_turn',
			currentSeat: 1,
			players: [
				makePlayer(0),
				makePlayer(1, {
					hand: Array.from({ length: 11 }, (_, i) => tile(i + 1, 30 + i)),
					melds: [ankan]
				}),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await runAiTurn(state);

		expect(result.wallPos).toBe(state.wallPos);
		expect(result.players[1].hand).toHaveLength(10);
	});
});

// ─── kuikae (swap-call ban) ──────────────────────────────────────────────────

describe('kuikaeForbiddenCodes', () => {
	it('pon forbids only the called tile (genbutsu)', () => {
		expect(kuikaeForbiddenCodes('pon', 5, [5, 5])).toEqual([5]);
	});

	it('chi calling the low end forbids the called tile + suji high+1', () => {
		// hand 3,4 + called 2 → run 2-3-4; can't discard 2 (genbutsu) or 5 (suji)
		expect(kuikaeForbiddenCodes('chi', 2, [3, 4]).sort((a, b) => a - b)).toEqual([2, 5]);
	});

	it('chi calling the high end forbids the called tile + suji low-1', () => {
		// hand 3,4 + called 5 → run 3-4-5; can't discard 5 or 2
		expect(kuikaeForbiddenCodes('chi', 5, [3, 4]).sort((a, b) => a - b)).toEqual([2, 5]);
	});

	it('chi of a kanchan middle forbids only the called tile (no suji)', () => {
		// hand 4,6 + called 5 → run 4-5-6, kanchan; only 5 is genbutsu-forbidden
		expect(kuikaeForbiddenCodes('chi', 5, [4, 6])).toEqual([5]);
	});

	it('an in-suit suji swap IS forbidden', () => {
		// hand 7m,8m + called 9m → run 7-8-9m; the 7-8 ryanmen also waits on 6m, so
		// discarding 6m is the swap-back — forbidden alongside the genbutsu 9m.
		expect(kuikaeForbiddenCodes('chi', 9, [7, 8]).sort((a, b) => a - b)).toEqual([6, 9]);
	});

	it('does not cross the suit boundary', () => {
		// hand 8m,9m + called 7m → run 7-8-9m, called the low end; the swap tile
		// would be 10m, which doesn't exist (8-9 is a penchan, only waits on 7) → none.
		expect(kuikaeForbiddenCodes('chi', 7, [8, 9])).toEqual([7]);
		// hand 1m,2m + called 3m → run 1-2-3m, called the high end; the swap tile
		// would be 0 off the low edge (1-2 penchan, only waits on 3) → none.
		expect(kuikaeForbiddenCodes('chi', 3, [1, 2])).toEqual([3]);
	});
});

describe('kuikae — engine wiring', () => {
	const NO_WIN = { isWin: false, han: 0, fu: 0, score: 0, yaku: [], yakuNames: [] };

	beforeEach(() => {
		vi.mocked(getShanten).mockReturnValue(8);
		vi.mocked(checkWin).mockResolvedValue(NO_WIN);
	});

	it('a human pon sets the forbidden set; the called tile cannot be discarded', async () => {
		// Hand holds two 7p (code 16) + the discarded 7p is ponned; plus a spare 9p.
		const state = makeState({
			phase: 'claim_decision',
			lastDiscard: tile(16, 90),
			lastDiscardSeat: 1,
			players: [
				makePlayer(0, { hand: [tile(16, 1), tile(16, 2), tile(18, 3)] }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const afterPon = humanClaimPon(state, [tile(16, 1), tile(16, 2)]);
		expect(afterPon.players[0].kuikaeForbidden).toEqual([16]);

		// Trying to discard a 7p (the third one in the meld is gone; the rule is by
		// code, so even a different-id 7p would be blocked — here we discard the 9p
		// instead, which works, while a forbidden discard is a no-op).
		const blocked = await humanDiscard(afterPon, 90 /* not in hand */);
		expect(blocked).toBe(afterPon); // wrong id → no-op anyway
		// The 9p discard succeeds and clears the forbidden set.
		const ok = await humanDiscard(afterPon, 3);
		expect(ok.players[0].discards.map((t) => t.code)).toEqual([18]);
		expect(ok.players[0].kuikaeForbidden).toEqual([]);
	});

	it('rejects discarding the forbidden called tile', async () => {
		// After a pon of 7p, the hand still has a 7p (a 4th copy) it must not dump.
		const state = makeState({
			phase: 'claim_decision',
			lastDiscard: tile(16, 90),
			lastDiscardSeat: 1,
			players: [
				makePlayer(0, { hand: [tile(16, 1), tile(16, 2), tile(16, 4), tile(18, 3)] }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const afterPon = humanClaimPon(state, [tile(16, 1), tile(16, 2)]);
		expect(afterPon.players[0].kuikaeForbidden).toEqual([16]);
		// Discarding the leftover 7p (id 4) is rejected — it's the called code.
		const blocked = await humanDiscard(afterPon, 4);
		expect(blocked).toBe(afterPon);
	});
});

// ─── kokushi can rob an ankan ────────────────────────────────────────────────

describe('kokushi rob of an ankan', () => {
	// A North (code 30, an honor → a kokushi tile) ankan, with 10 filler tiles to
	// make the declaring hand a legal 14.
	function ankanState(): GameState {
		const hand = [
			tile(30, 1),
			tile(30, 2),
			tile(30, 3),
			tile(30, 4),
			...Array.from({ length: 10 }, (_, i) => tile((i % 9) + 1, 10 + i))
		];
		return makeState({
			phase: 'player_discard',
			currentSeat: 0,
			players: [
				makePlayer(0, { hand }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});
	}

	beforeEach(() => {
		vi.mocked(getShanten).mockReturnValue(8);
	});

	it('a kokushi wait robs the ankan — the round ends with that seat winning', async () => {
		vi.mocked(checkWin).mockResolvedValue({
			isWin: true,
			han: 13,
			fu: 0,
			score: 32000,
			yaku: [{ name: 'Kokushi (13-sided)', han: 13 }],
			yakuNames: ['Kokushi (13-sided)']
		});

		const result = await humanDeclareAnkan(ankanState(), 30);
		expect(result.phase).toBe('round_end');
		expect(result.roundResult?.winner).toBe(1);
		expect(result.roundResult?.winType).toBe('ron');
		// The kan never made it onto the declarer's hand — it was robbed.
		expect(result.players[0].melds).toHaveLength(0);
	});

	it('a non-kokushi win does NOT rob the ankan — the kan stands', async () => {
		// A plausible-but-illegal robber: a tanki on North that is not kokushi.
		vi.mocked(checkWin).mockResolvedValue({
			isWin: true,
			han: 2,
			fu: 40,
			score: 2600,
			yaku: [{ name: 'Toitoi', han: 2 }],
			yakuNames: ['Toitoi']
		});

		const result = await humanDeclareAnkan(ankanState(), 30);
		expect(result.roundResult).toBeNull();
		expect(result.players[0].melds).toHaveLength(1);
		expect(result.players[0].melds[0].type).toBe('ankan');
	});
});

// ─── nagashi mangan ──────────────────────────────────────────────────────────

describe('nagashi mangan', () => {
	beforeEach(() => {
		vi.mocked(getShanten).mockReturnValue(8);
		vi.mocked(checkWin).mockResolvedValue({
			isWin: false,
			han: 0,
			fu: 0,
			score: 0,
			yaku: [],
			yakuNames: []
		});
	});

	// Drive the round to an exhaustive draw via a human pass on the last drawable
	// tile (next to draw is seat 0 → drawTile exhausts → applyExhaustiveDraw).
	function drawAt(players: GameState['players'], dealer: Seat = 0): Promise<GameState> {
		const state = makeState({
			phase: 'claim_decision',
			dealer,
			lastDiscard: tile(5, 50),
			lastDiscardSeat: 3,
			pendingRon: null,
			claimOptions: [],
			wallPos: 69,
			wallEnd: 69,
			players
		});
		return humanPassClaim(state);
	}

	it('scores a dealer nagashi as a mangan tsumo (12000), replacing tenpai payments', async () => {
		const result = await drawAt([
			// All four discards terminal/honor (1m, 9m, East, North), none called.
			makePlayer(0, { discards: [tile(1, 1), tile(9, 2), tile(28, 3), tile(31, 4)] }),
			makePlayer(1, { discards: [tile(5, 10)] }),
			makePlayer(2, { discards: [tile(6, 11)] }),
			makePlayer(3, { discards: [tile(7, 12)] })
		] as GameState['players']);

		expect(result.exhaustiveDrawResult?.nagashiSeats).toEqual([0]);
		expect(result.exhaustiveDrawResult?.pointChanges).toEqual([12000, -4000, -4000, -4000]);
	});

	it('scores a non-dealer nagashi as 8000 (4000 from dealer, 2000 each)', async () => {
		const result = await drawAt(
			[
				makePlayer(0, { discards: [tile(5, 1)] }),
				makePlayer(1, { discards: [tile(1, 10), tile(9, 11), tile(28, 12)] }),
				makePlayer(2, { discards: [tile(6, 13)] }),
				makePlayer(3, { discards: [tile(7, 14)] })
			] as GameState['players'],
			0 // dealer is seat 0; the nagashi seat (1) is a non-dealer
		);

		expect(result.exhaustiveDrawResult?.nagashiSeats).toEqual([1]);
		expect(result.exhaustiveDrawResult?.pointChanges).toEqual([-4000, 8000, -2000, -2000]);
	});

	it('a called discard disqualifies the seat (falls back to tenpai payments)', async () => {
		const result = await drawAt([
			makePlayer(0, {
				discards: [tile(1, 1), tile(9, 2), tile(28, 3)],
				anyDiscardCalled: true
			}),
			makePlayer(1, { discards: [tile(5, 10)] }),
			makePlayer(2, { discards: [tile(6, 11)] }),
			makePlayer(3, { discards: [tile(7, 12)] })
		] as GameState['players']);

		expect(result.exhaustiveDrawResult?.nagashiSeats).toEqual([]);
		// All noten (getShanten mocked 8) → no exchange.
		expect(result.exhaustiveDrawResult?.pointChanges).toEqual([0, 0, 0, 0]);
	});

	it('a single simple discard disqualifies the seat', async () => {
		const result = await drawAt([
			makePlayer(0, { discards: [tile(1, 1), tile(5, 2), tile(28, 3)] }), // 5m is simple
			makePlayer(1, { discards: [tile(6, 10)] }),
			makePlayer(2, { discards: [tile(6, 11)] }),
			makePlayer(3, { discards: [tile(7, 12)] })
		] as GameState['players']);

		expect(result.exhaustiveDrawResult?.nagashiSeats).toEqual([]);
	});
});

// ─── abortive draws ──────────────────────────────────────────────────────────

function kanMeld(code: number, base: number): Meld {
	return {
		type: 'ankan',
		tiles: [tile(code, base), tile(code, base + 1), tile(code, base + 2), tile(code, base + 3)],
		calledFrom: null
	};
}

describe('abortive draws', () => {
	beforeEach(() => {
		vi.mocked(checkWin).mockResolvedValue({
			isWin: false,
			han: 0,
			fu: 0,
			score: 0,
			yaku: [],
			yakuNames: []
		});
	});

	it('suufon renda: all four discard the same wind on the first go-around', async () => {
		vi.mocked(getShanten).mockReturnValue(8);
		// Dealer is seat 1, so the human (seat 0) is the fourth discarder. Seats
		// 1–3 have each discarded East already; the human discards East now.
		const state = makeState({
			phase: 'player_discard',
			currentSeat: 0,
			dealer: 1,
			anyCallMadeThisRound: false,
			players: [
				makePlayer(0, { hand: [tile(28, 1), tile(5, 2)], discards: [] }),
				makePlayer(1, { discards: [tile(28, 10)] }),
				makePlayer(2, { discards: [tile(28, 11)] }),
				makePlayer(3, { discards: [tile(28, 12)] })
			] as GameState['players']
		});

		const result = await humanDiscard(state, 1); // discard the East (id 1)
		expect(result.phase).toBe('round_end');
		expect(result.abortiveDraw).toBe('suufon');
	});

	it('a non-wind first go-around does NOT abort', async () => {
		vi.mocked(getShanten).mockReturnValue(8);
		const state = makeState({
			phase: 'player_discard',
			currentSeat: 0,
			dealer: 1,
			anyCallMadeThisRound: false,
			players: [
				makePlayer(0, { hand: [tile(5, 1), tile(6, 2)], discards: [] }),
				makePlayer(1, { discards: [tile(5, 10)] }),
				makePlayer(2, { discards: [tile(5, 11)] }),
				makePlayer(3, { discards: [tile(5, 12)] })
			] as GameState['players']
		});

		const result = await humanDiscard(state, 1); // discard 5m, not a wind
		expect(result.abortiveDraw).toBeNull();
	});

	it('suucha riichi: the fourth riichi aborts the round', async () => {
		vi.mocked(getShanten).mockReturnValue(0); // human hand is tenpai → riichi legal
		const state = makeState({
			phase: 'player_discard',
			currentSeat: 0,
			anyCallMadeThisRound: false,
			players: [
				makePlayer(0, { hand: [tile(5, 1), tile(6, 2)], discards: [tile(9, 50)] }),
				makePlayer(1, { isRiichi: true }),
				makePlayer(2, { isRiichi: true }),
				makePlayer(3, { isRiichi: true })
			] as GameState['players']
		});

		const result = await humanDiscard(state, 1, true); // declare the 4th riichi
		expect(result.phase).toBe('round_end');
		expect(result.abortiveDraw).toBe('suucha-riichi');
	});

	it('suukaikan: four kans across two seats abort', async () => {
		vi.mocked(getShanten).mockReturnValue(8);
		const state = makeState({
			phase: 'player_discard',
			currentSeat: 0,
			players: [
				makePlayer(0, { hand: [tile(5, 1), tile(6, 2)] }),
				makePlayer(1, { melds: [kanMeld(1, 100), kanMeld(2, 110)] }),
				makePlayer(2, { melds: [kanMeld(3, 120), kanMeld(4, 130)] }),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanDiscard(state, 1);
		expect(result.phase).toBe('round_end');
		expect(result.abortiveDraw).toBe('suukaikan');
	});

	it('four kans by ONE seat (suukantsu) does NOT abort', async () => {
		vi.mocked(getShanten).mockReturnValue(8);
		const state = makeState({
			phase: 'player_discard',
			currentSeat: 0,
			players: [
				makePlayer(0, { hand: [tile(5, 1), tile(6, 2)] }),
				makePlayer(1, {
					melds: [kanMeld(1, 100), kanMeld(2, 110), kanMeld(3, 120), kanMeld(4, 130)]
				}),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await humanDiscard(state, 1);
		expect(result.abortiveDraw).toBeNull();
	});
});

describe('kyuushu kyuuhai', () => {
	// A 14-tile hand with 9 distinct terminals/honors (1m 9m 1p 9p 1s 9s E S W).
	const NINE_TYPES = [1, 9, 10, 18, 19, 27, 28, 29, 30];

	it('canDeclareKyuushu is true on a 9+ terminal/honor first draw', () => {
		const hand = [...NINE_TYPES, 1, 9, 10, 18, 19].map((c, i) => tile(c, i + 1));
		const state = makeState({
			phase: 'player_discard',
			currentSeat: 0,
			anyCallMadeThisRound: false,
			players: [
				makePlayer(0, { hand }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});
		expect(canDeclareKyuushu(state)).toBe(true);
		const result = humanDeclareKyuushu(state);
		expect(result.phase).toBe('round_end');
		expect(result.abortiveDraw).toBe('kyuushu');
	});

	it('is false with only 8 distinct terminals/honors', () => {
		const eight = [1, 9, 10, 18, 19, 27, 28, 29];
		const hand = [...eight, 1, 9, 10, 18, 19, 27].map((c, i) => tile(c, i + 1));
		const state = makeState({
			phase: 'player_discard',
			currentSeat: 0,
			anyCallMadeThisRound: false,
			players: [
				makePlayer(0, { hand }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});
		expect(canDeclareKyuushu(state)).toBe(false);
	});

	it('is false once a call has interrupted the first go-around', () => {
		const hand = [...NINE_TYPES, 1, 9, 10, 18, 19].map((c, i) => tile(c, i + 1));
		const state = makeState({
			phase: 'player_discard',
			currentSeat: 0,
			anyCallMadeThisRound: true,
			players: [
				makePlayer(0, { hand }),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});
		expect(canDeclareKyuushu(state)).toBe(false);
	});
});

// ─── pao (sekinin barai) ─────────────────────────────────────────────────────

describe('pao (sekinin barai)', () => {
	const DAISANGEN = {
		isWin: true,
		han: 13,
		fu: 0,
		score: 32000,
		yaku: [{ name: 'Daisangen', han: 13 }],
		yakuNames: ['Daisangen']
	};

	function ponMeld(code: number, base: number, from: Seat): Meld {
		return {
			type: 'pon',
			tiles: [tile(code, base), tile(code, base + 1), tile(code, base + 2)],
			calledFrom: from
		};
	}

	it('a fed 3rd dragon pon attaches pao to the feeder', () => {
		// Human already holds Haku + Hatsu pons; pons the Chun (code 34) fed by seat 2.
		const state = makeState({
			phase: 'claim_decision',
			lastDiscard: tile(34, 90),
			lastDiscardSeat: 2,
			players: [
				makePlayer(0, {
					hand: [tile(34, 1), tile(34, 2)],
					melds: [ponMeld(32, 10, 1), ponMeld(33, 20, 3)]
				}),
				makePlayer(1),
				makePlayer(2),
				makePlayer(3)
			] as GameState['players']
		});

		const after = humanClaimPon(state, [tile(34, 1), tile(34, 2)]);
		expect(after.players[0].paoSeat).toBe(2);
	});

	it('pao tsumo: the liable seat pays the whole yakuman', async () => {
		vi.mocked(checkWin).mockResolvedValue(DAISANGEN);
		const state = makeState({
			dealer: 0,
			honba: 0,
			players: [
				makePlayer(0),
				makePlayer(1),
				makePlayer(2, { hand: Array.from({ length: 14 }, (_, i) => tile(34, i + 1)), paoSeat: 1 }),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await checkTsumo(state, 2);
		expect(result?.pointChanges).toEqual([0, -32000, 32000, 0]);
	});

	it('pao ron off a different discarder: discarder and pao seat split the value', async () => {
		vi.mocked(checkWin).mockResolvedValue(DAISANGEN);
		const state = makeState({
			honba: 0,
			players: [
				makePlayer(0),
				makePlayer(1),
				makePlayer(2, { hand: Array.from({ length: 13 }, (_, i) => tile(34, i + 1)), paoSeat: 1 }),
				makePlayer(3)
			] as GameState['players']
		});

		// Seat 2 rons seat 3's discard; seat 1 is the pao seat.
		const result = await checkRon(state, 2, tile(34, 99), 3);
		expect(result?.pointChanges).toEqual([0, -16000, 32000, -16000]);
	});

	it('pao ron where the pao seat IS the discarder: they pay all', async () => {
		vi.mocked(checkWin).mockResolvedValue(DAISANGEN);
		const state = makeState({
			honba: 0,
			players: [
				makePlayer(0),
				makePlayer(1),
				makePlayer(2, { hand: Array.from({ length: 13 }, (_, i) => tile(34, i + 1)), paoSeat: 1 }),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await checkRon(state, 2, tile(34, 99), 1);
		expect(result?.pointChanges).toEqual([0, -32000, 32000, 0]);
	});

	it('no pao when the win is not the attached yakuman', async () => {
		vi.mocked(checkWin).mockResolvedValue({
			isWin: true,
			han: 3,
			fu: 30,
			score: 3900,
			yaku: [{ name: 'Honitsu', han: 3 }],
			yakuNames: ['Honitsu']
		});
		const state = makeState({
			honba: 0,
			players: [
				makePlayer(0),
				makePlayer(1),
				makePlayer(2, { hand: Array.from({ length: 13 }, (_, i) => tile(5, i + 1)), paoSeat: 1 }),
				makePlayer(3)
			] as GameState['players']
		});

		const result = await checkRon(state, 2, tile(5, 99), 3);
		// Ordinary ron: the discarder (seat 3) pays the whole thing.
		expect(result?.pointChanges).toEqual([0, 0, 3900, -3900]);
	});
});

// ─── double ron / triple ron ─────────────────────────────────────────────────

describe('double ron (pays both) and triple ron (abort)', () => {
	// checkWin reports a win for any hand holding the marker tile (code 7), so the
	// test controls exactly which seats can ron the human's discard.
	function markWin() {
		vi.mocked(getShanten).mockReturnValue(8);
		vi.mocked(checkWin).mockImplementation(async ({ handCodes }) =>
			handCodes.includes(7)
				? {
						isWin: true,
						han: 1,
						fu: 30,
						score: 1000,
						yaku: [{ name: 'Riichi', han: 1 }],
						yakuNames: ['Riichi']
					}
				: { isWin: false, han: 0, fu: 0, score: 0, yaku: [], yakuNames: [] }
		);
	}

	it('two seats ron the same discard — both are paid by the discarder', async () => {
		markWin();
		const state = makeState({
			phase: 'player_discard',
			currentSeat: 0,
			dealer: 0,
			players: [
				makePlayer(0, { hand: [tile(5, 1), tile(2, 2)] }),
				makePlayer(1, { hand: [tile(7, 10)] }), // can ron
				makePlayer(2, { hand: [tile(7, 11)] }), // can ron
				makePlayer(3, { hand: [tile(3, 12)] }) // cannot
			] as GameState['players']
		});

		const result = await humanDiscard(state, 1); // discard 5m
		expect(result.phase).toBe('round_end');
		expect(result.roundResult?.winner).toBe(1); // nearest the discarder
		expect(result.extraRons.map((r) => r.winner)).toEqual([2]);
		// Discarder pays 1000 to each; winners +1000.
		expect(result.players[0].score).toBe(23000);
		expect(result.players[1].score).toBe(26000);
		expect(result.players[2].score).toBe(26000);
		expect(result.players[3].score).toBe(25000);
	});

	it('the nearest winner collects the riichi-stick pool', async () => {
		markWin();
		const state = makeState({
			phase: 'player_discard',
			currentSeat: 0,
			dealer: 0,
			riichiBets: 2, // two 1000-pt sticks on the table
			players: [
				makePlayer(0, { hand: [tile(5, 1), tile(2, 2)] }),
				makePlayer(1, { hand: [tile(7, 10)] }),
				makePlayer(2, { hand: [tile(7, 11)] }),
				makePlayer(3, { hand: [tile(3, 12)] })
			] as GameState['players']
		});

		const result = await humanDiscard(state, 1);
		// Seat 1 (nearest) gets its 1000 + the 2000 stick pool; seat 2 just its 1000.
		expect(result.players[1].score).toBe(28000);
		expect(result.players[2].score).toBe(26000);
		expect(result.riichiBets).toBe(0);
	});

	it('three seats ron the same discard — sanchahou abortive draw', async () => {
		markWin();
		const state = makeState({
			phase: 'player_discard',
			currentSeat: 0,
			dealer: 0,
			players: [
				makePlayer(0, { hand: [tile(5, 1), tile(2, 2)] }),
				makePlayer(1, { hand: [tile(7, 10)] }),
				makePlayer(2, { hand: [tile(7, 11)] }),
				makePlayer(3, { hand: [tile(7, 12)] })
			] as GameState['players']
		});

		const result = await humanDiscard(state, 1);
		expect(result.phase).toBe('round_end');
		expect(result.abortiveDraw).toBe('sanchahou');
		expect(result.roundResult).toBeNull();
	});

	it('dealer renchan when the dealer is one of the double-ron winners', () => {
		const state = makeState({
			phase: 'round_end',
			dealer: 1,
			round: 2,
			roundResult: {
				winner: 1,
				winType: 'ron',
				loser: 0,
				han: 1,
				fu: 30,
				score: 1000,
				yaku: [],
				pointChanges: [-1000, 1000, 0, 0]
			},
			extraRons: [
				{
					winner: 2,
					winType: 'ron',
					loser: 0,
					han: 1,
					fu: 30,
					score: 1000,
					yaku: [],
					pointChanges: [-1000, 0, 1000, 0]
				}
			],
			players: [makePlayer(0), makePlayer(1), makePlayer(2), makePlayer(3)] as GameState['players']
		});

		const next = continueGame(state);
		expect(next.dealer).toBe(1); // dealer kept the deal
		expect(next.round).toBe(2);
	});
});
