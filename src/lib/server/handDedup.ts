// Pure helpers for "is this Hand-of-the-Day hand a repeat?" — kept free of any
// SDK/DB/env import so they're unit-testable. Used by handOfTheDay generation to
// reject a candidate that matches a recent day (the duplicate-puzzle bug, see
// notes/bugs/2026-06-05-hotd-duplicate-puzzle.md).

import type { TileCode } from '$lib/game/tiles';

// Order-independent hand identity, so a re-arranged copy of a hand still matches.
export function handKey(codes: TileCode[]): string {
	return [...codes].sort((a, b) => a - b).join(',');
}

export function isRecentHand(hand: TileCode[], recent: TileCode[][]): boolean {
	const key = handKey(hand);
	return recent.some((h) => handKey(h) === key);
}
