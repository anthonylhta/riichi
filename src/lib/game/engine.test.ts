import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must mock WASM-dependent modules before any engine import triggers them
vi.mock('./ai', () => ({
	getShanten: vi.fn().mockReturnValue(8),
	chooseDiscard: vi.fn(),
	shouldDeclareRiichi: vi.fn().mockReturnValue(false),
	isTenpaiAfterDiscard: vi.fn().mockReturnValue(false)
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
	runAiTurn
} from './engine';
import { chooseDiscard, getShanten } from './ai';
import { checkWin } from './scoring';
import type { GameState, PlayerState, RoundResult, Seat } from './types';
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
		deadWall,
		rinshankPos: 0,
		riichiBets: 0,
		doraIndicators: [tile(1, 100)],
		uraDoraIndicators: [tile(2, 101)],
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
		vi.mocked(getShanten).mockReturnValue(8);
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
