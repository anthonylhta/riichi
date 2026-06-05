import { describe, it, expect } from 'vitest';
import { callKeepsLegalHand, initGame, runAiTurn } from './engine';
import type { Seat } from './types';

// A call is allowed only if afterwards the hand can discard one tile and still
// keep at least one concealed tile (the tanki wait of a max 4-meld hand). Calling
// into 4 melds + 0 concealed is the illegal, undiscardable hand that froze the
// game. See notes/bugs/2026-06-05-ai-call-strands-hand-freeze.md.
describe('callKeepsLegalHand', () => {
	it('pon/chi (consume 2, no draw): need ≥ 4 concealed', () => {
		expect(callKeepsLegalHand(4, 2, false)).toBe(true); // → tanki, legal
		expect(callKeepsLegalHand(3, 2, false)).toBe(false); // → 0 after discard, illegal
		expect(callKeepsLegalHand(2, 2, false)).toBe(false); // → empty, the crash
	});

	it('daiminkan (consume 3, +rinshan): need ≥ 4 concealed', () => {
		expect(callKeepsLegalHand(4, 3, true)).toBe(true);
		expect(callKeepsLegalHand(3, 3, true)).toBe(false);
	});

	it('ankan (consume 4, +rinshan): need ≥ 5 concealed', () => {
		expect(callKeepsLegalHand(5, 4, true)).toBe(true);
		expect(callKeepsLegalHand(4, 4, true)).toBe(false); // exactly the quad, nothing else
	});

	it('kakan (consume 1, +rinshan): need ≥ 2 concealed', () => {
		expect(callKeepsLegalHand(2, 1, true)).toBe(true);
		expect(callKeepsLegalHand(1, 1, true)).toBe(false);
	});
});

// The other half of the freeze: when an AI's draw exhausts the wall, runAiTurn must
// stop at the exhaustive draw, not plough on to chooseDiscard (which crashed on a
// fully-melded hand). With the wall empty, the AI's turn resolves to round_end.
describe('runAiTurn bails on an exhausted wall', () => {
	it('returns the exhaustive-draw round_end instead of discarding', async () => {
		const g = initGame();
		const exhausted = {
			...g,
			phase: 'ai_turn' as const,
			currentSeat: 1 as Seat,
			wallPos: g.liveWall.length // next draw exhausts the wall
		};
		const result = await runAiTurn(exhausted);
		expect(result.phase).toBe('round_end');
		expect(result.exhaustiveDrawResult).not.toBeNull();
	});
});
