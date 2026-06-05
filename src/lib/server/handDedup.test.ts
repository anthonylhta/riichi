import { describe, it, expect } from 'vitest';
import { handKey, isRecentHand } from './handDedup';
import type { TileCode } from '$lib/game/tiles';

const hand = (...c: number[]) => c as TileCode[];

describe('handKey', () => {
	it('is order-independent', () => {
		expect(handKey(hand(3, 1, 2))).toBe(handKey(hand(2, 3, 1)));
	});

	it('distinguishes different multisets', () => {
		expect(handKey(hand(1, 1, 2))).not.toBe(handKey(hand(1, 2, 2)));
	});
});

describe('isRecentHand', () => {
	const recent = [hand(2, 3, 4, 6, 7, 12, 13, 14, 16, 17, 20, 20, 33, 33), hand(11, 12, 13)];

	it('flags an exact repeat', () => {
		expect(isRecentHand(hand(2, 3, 4, 6, 7, 12, 13, 14, 16, 17, 20, 20, 33, 33), recent)).toBe(
			true
		);
	});

	it('flags a reordered repeat', () => {
		// Same tiles as the first recent hand, shuffled.
		expect(isRecentHand(hand(33, 20, 17, 16, 14, 13, 12, 7, 6, 4, 3, 2, 33, 20), recent)).toBe(
			true
		);
	});

	it('passes a genuinely new hand', () => {
		expect(isRecentHand(hand(2, 3, 4, 6, 7, 11, 12, 13, 14, 16, 17, 21, 22, 23), recent)).toBe(
			false
		);
	});

	it('passes when there is no history', () => {
		expect(isRecentHand(hand(1, 2, 3), [])).toBe(false);
	});
});
