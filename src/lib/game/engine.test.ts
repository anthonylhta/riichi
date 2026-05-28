import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must mock WASM-dependent modules before any engine import triggers them
vi.mock('./ai', () => ({
	getShanten: vi.fn().mockReturnValue(8),
	chooseDiscard: vi.fn(),
	shouldDeclareRiichi: vi.fn().mockReturnValue(false),
	isTenpaiAfterDiscard: vi.fn().mockReturnValue(false)
}));

vi.mock('./scoring', () => ({
	checkWin: vi.fn().mockResolvedValue({ isWin: false, han: 0, fu: 0, score: 0, yakuNames: [] })
}));

import {
	humanClaimPon,
	humanClaimChi,
	humanDeclareTsumo,
	humanDeclareRon,
	humanPassClaim,
	humanDiscard
} from './engine';
import { getShanten } from './ai';
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
		riichiTile: null,
		isFuriten: false,
		isTempFuriten: false,
		...overrides
	};
}

function makeState(overrides: Partial<GameState> = {}): GameState {
	const wall = Array.from({ length: 70 }, (_, i) => tile((i % 34) + 1, 200 + i));
	return {
		phase: 'player_discard',
		round: 1,
		honba: 0,
		dealer: 0,
		currentSeat: 0,
		turnCount: 1,
		liveWall: wall,
		wallPos: 0,
		doraIndicators: [tile(1, 100)],
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
		// lastDiscardSeat=1 → nextSeat=2, no player draw, no checkTsumo call
		const state = makeState({
			phase: 'claim_decision',
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

	it('returns state unchanged when not in claim_decision', async () => {
		const state = makeState({ phase: 'player_discard' });
		const result = await humanPassClaim(state);
		expect(result).toBe(state);
	});
});

// ─── humanDiscard (riichi auto-declare) ──────────────────────────────────────

describe('humanDiscard — riichi auto-declare', () => {
	beforeEach(() => {
		vi.mocked(getShanten).mockReturnValue(8); // default: not tenpai
	});

	it('auto-declares riichi when discarding to tenpai with a closed hand', async () => {
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

		const result = await humanDiscard(state, discard.id);

		expect(result.players[0].isRiichi).toBe(true);
		expect(result.players[0].riichiTile).toEqual(discard);
		expect(result.players[0].score).toBe(24000); // -1000 riichi bet
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

		const result = await humanDiscard(state, discard.id);

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

		const result = await humanDiscard(state, discard.id);

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
			pointChanges: [3900, -3900, 0, 0]
		};

		const state = makeState({
			phase: 'claim_decision',
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
