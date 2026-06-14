import { describe, it, expect } from 'vitest';
import { buildReplaySteps } from './replayView';
import { initGame, continueGame, humanDiscard, humanPassClaim } from './engine';
import { settle } from './autoplay';
import type { GameEvent } from './events';
import type { GameState } from './types';
import type { GameTile } from './tiles';

const tile = (code: number, id = 0, isRed = false): GameTile => ({ code, id, isRed });
const hand13 = (offset: number): GameTile[] =>
	Array.from({ length: 13 }, (_, i) => tile(((i + offset) % 34) + 1, offset * 100 + i));

const start = (over: Partial<Extract<GameEvent, { type: 'round_start' }>> = {}): GameEvent => ({
	type: 'round_start',
	round: 1,
	honba: 0,
	riichiBets: 0,
	dealer: 0,
	doraIndicator: tile(10, 9000),
	hands: [hand13(0), hand13(1), hand13(2), hand13(3)],
	scores: [25000, 25000, 25000, 25000],
	...over
});

describe('buildReplaySteps — synthetic', () => {
	it('opens with a deal step: four 13-tile hands, one dora, dealer set', () => {
		const steps = buildReplaySteps([start({ dealer: 1 })]);
		expect(steps).toHaveLength(1);
		const s = steps[0];
		expect(s.kind).toBe('deal');
		expect(s.roundLabel).toBe('東1');
		expect(s.view.dealer).toBe(1);
		expect(s.view.doraIndicators).toHaveLength(1);
		for (const p of s.view.players) expect(p.hand).toHaveLength(13);
	});

	it('draw adds a tile and decrements the wall; discard moves it to the river', () => {
		const drawn = tile(20, 500);
		const steps = buildReplaySteps([
			start(),
			{ type: 'draw', seat: 0, tile: drawn, rinshan: false },
			{ type: 'discard', seat: 0, tile: drawn, riichi: false }
		]);
		const afterDraw = steps[1].view;
		expect(afterDraw.players[0].hand).toHaveLength(14);
		expect(afterDraw.wallEnd - afterDraw.wallPos).toBe(69); // 70 − 1 draw

		const afterDiscard = steps[2].view;
		expect(afterDiscard.players[0].hand).toHaveLength(13);
		expect(afterDiscard.players[0].discards.map((t) => t.id)).toEqual([500]);
		expect(steps[2].label).toContain('discards');
	});

	it('a pon removes the consumed tiles, takes the tile out of the discarder river, and melds', () => {
		// seat 1 holds two code-7 tiles (ids 1100, 1101); seat 0 discards a code-7.
		const s1 = [...hand13(1)];
		s1[0] = tile(7, 1100);
		s1[1] = tile(7, 1101);
		const discarded = tile(7, 700);
		const steps = buildReplaySteps([
			start({ hands: [hand13(0), s1, hand13(2), hand13(3)] }),
			{ type: 'draw', seat: 0, tile: discarded, rinshan: false },
			{ type: 'discard', seat: 0, tile: discarded, riichi: false },
			{
				type: 'call',
				call: 'pon',
				seat: 1,
				from: 0,
				tile: discarded,
				consumed: [tile(7, 1100), tile(7, 1101)]
			}
		]);
		const v = steps[3].view;
		expect(v.players[0].discards).toHaveLength(0); // taken from the river
		expect(v.players[1].hand).toHaveLength(11); // 13 − 2 consumed
		expect(v.players[1].melds).toHaveLength(1);
		expect(v.players[1].melds[0].type).toBe('pon');
		expect(v.players[1].melds[0].tiles).toHaveLength(3);
		expect(v.currentSeat).toBe(1);
	});

	it('debits a completed riichi 1000 and shows the stick; a ronned riichi is voided', () => {
		const rt = tile(28, 800);
		const completed = buildReplaySteps([
			start(),
			{ type: 'draw', seat: 0, tile: rt, rinshan: false },
			{ type: 'discard', seat: 0, tile: rt, riichi: true }
		]);
		const v = completed[2].view;
		expect(v.players[0].score).toBe(24000);
		expect(v.players[0].isRiichi).toBe(true);
		expect(v.riichiBets).toBe(1);

		// Same riichi discard, but seat 2 immediately rons it → declaration voided.
		const ronned = buildReplaySteps([
			start(),
			{ type: 'draw', seat: 0, tile: rt, rinshan: false },
			{ type: 'discard', seat: 0, tile: rt, riichi: true },
			{
				type: 'win',
				seat: 2,
				from: 0,
				tile: rt,
				han: 1,
				fu: 30,
				score: 1000,
				yaku: [{ name: 'Riichi', han: 1 }],
				deltas: [-1000, 0, 1000, 0],
				uraIndicators: []
			}
		]);
		// At the riichi-discard step the 1000 is NOT yet debited (it gets ronned).
		expect(ronned[2].view.players[0].score).toBe(25000);
		expect(ronned[2].view.riichiBets).toBe(0);
	});

	it('a win applies deltas, clears the centre sticks, and records the outcome', () => {
		const steps = buildReplaySteps([
			start(),
			{
				type: 'win',
				seat: 1,
				from: 0,
				tile: tile(5, 600),
				han: 3,
				fu: 40,
				score: 5200,
				yaku: [{ name: 'Riichi', han: 1 }],
				deltas: [-5200, 5200, 0, 0],
				uraIndicators: []
			}
		]);
		const win = steps[1];
		expect(win.kind).toBe('win');
		expect(win.view.players[1].score).toBe(30200);
		expect(win.view.players[0].score).toBe(19800);
		expect(win.view.riichiBets).toBe(0);
		expect(win.outcome).toMatchObject({ type: 'win', winner: 1, tsumo: false, score: 5200 });
	});

	it('ignores the game_end event (no extra step)', () => {
		const steps = buildReplaySteps([
			start(),
			{ type: 'game_end', scores: [25000, 25000, 25000, 25000] }
		]);
		expect(steps).toHaveLength(1);
	});
});

// A full, real game: every event shape the engine actually emits, folded for real.
async function playToEnd(maxInputs = 4000): Promise<GameState> {
	let state = await settle(initGame());
	let n = 0;
	while (n++ < maxInputs && state.phase !== 'game_end') {
		if (state.phase === 'round_end') {
			state = await settle(continueGame(state));
		} else if (state.phase === 'claim_decision') {
			state = await settle(await humanPassClaim(state));
		} else if (state.phase === 'player_discard' && state.currentSeat === 0) {
			if (state.pendingTsumo) {
				// Take the tsumo so the game can progress to game_end.
				state = await settle(continueGame(state));
				continue;
			}
			const drawn = state.players[0].hand[state.players[0].hand.length - 1];
			state = await settle(await humanDiscard(state, drawn.id, false));
		} else {
			break;
		}
	}
	return state;
}

describe('buildReplaySteps — real game', () => {
	it('folds a full game; points are conserved at every step and the deal count matches', async () => {
		const state = await playToEnd();
		const steps = buildReplaySteps(state.events);
		expect(steps.length).toBeGreaterThan(10);

		const dealEvents = state.events.filter((e) => e.type === 'round_start').length;
		expect(steps.filter((s) => s.kind === 'deal')).toHaveLength(dealEvents);

		for (const s of steps) {
			const pot = s.view.players.reduce((sum, p) => sum + p.score, 0) + s.view.riichiBets * 1000;
			expect(pot).toBe(100000); // 4 × 25,000, sticks accounted for
			const left = s.view.wallEnd - s.view.wallPos;
			expect(left).toBeGreaterThanOrEqual(0);
			expect(left).toBeLessThanOrEqual(70);
			for (const p of s.view.players) {
				// hand + tiles locked in melds never exceeds a 14-tile drawn hand
				const meldTiles = p.melds.reduce((m, meld) => m + Math.min(meld.tiles.length, 3), 0);
				expect(p.hand.length + meldTiles).toBeLessThanOrEqual(14);
			}
		}
	});
});
