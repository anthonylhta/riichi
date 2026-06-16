import { describe, it, expect } from 'vitest';
import { analyzeHand } from './efficiency';

// Real mahjong-tile-efficiency lib (no mocks). These pin that the analysis is
// meld-aware: passing only an open hand's concealed tiles (14 − 3·melds) yields
// correct shanten/ukeire, because the lib derives the sets-needed from the tile
// count. Codes: man 1-9, pin 10-18, sou 19-27, honours 28-34. See ADR 0069.

describe('analyzeHand — closed hand (Hand of the Day path)', () => {
	it('finds the tenpai discard and its ukeire for a 14-tile hand', () => {
		// 234m 567m 99p 123s 45s East → drop East, tenpai waiting 3s/6s.
		const a = analyzeHand([2, 3, 4, 5, 6, 7, 11, 11, 19, 20, 21, 22, 23, 28]);
		expect(a.bestShanten).toBe(0);
		expect(a.bestDiscards).toEqual([28]);
		expect(a.ukeireTiles.sort((x, y) => x - y)).toEqual([21, 24]); // 3s, 6s
		expect(a.ukeire).toBe(7); // three 3s left (one in hand) + four 6s
	});
});

describe('analyzeHand — meld-aware open hands', () => {
	it('a 1-meld hand (11 concealed) reads as tenpai, not a tile short', () => {
		// One pon elsewhere; concealed 234m 567m 99p 12s + 9m floater → drop 9m,
		// tenpai on 3s (the pon is the 4th set). Only correct if the lib counts the
		// meld — a meld-blind read would call this 1-shanten.
		const a = analyzeHand([2, 3, 4, 5, 6, 7, 11, 11, 19, 20, 9]);
		expect(a.bestShanten).toBe(0);
		expect(a.bestDiscards).toEqual([9]);
		expect(a.ukeireTiles).toEqual([21]); // 3s
		expect(a.ukeire).toBe(4);
	});

	it('a 2-meld hand (8 concealed) reads as tenpai', () => {
		// Two melds; concealed 234m 99p 12s + East floater → drop East, tenpai 3s.
		const a = analyzeHand([2, 3, 4, 11, 11, 19, 20, 28]);
		expect(a.bestShanten).toBe(0);
		expect(a.bestDiscards).toEqual([28]);
		expect(a.ukeireTiles).toEqual([21]); // 3s
	});
});
