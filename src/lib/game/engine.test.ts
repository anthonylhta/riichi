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
	getPlayerKanOptions
} from './engine';
import { chooseDiscard, getShanten, riichiAnkanKeepsWaits } from './ai';
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
		exhaustiveDrawResult: null,
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
			exhaustiveDrawResult: { tenpaiSeats, pointChanges: [0, 0, 0, 0] },
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
			exhaustiveDrawResult: { tenpaiSeats: [], pointChanges: [0, 0, 0, 0] },
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
