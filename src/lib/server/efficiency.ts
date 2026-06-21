// Server-side tile-efficiency analysis. Derives the provably-correct discard from
// a post-draw concealed hand using the same mahjong-tile-efficiency RuleSet the AI
// uses, so the puzzle answer (Hand of the Day) never depends on the LLM's maths,
// and the in-round helper can ground its advice on open hands too.
//
// Meld-aware: the RuleSet derives the number of sets still needed from the
// concealed tile count (floor(len/3)), so passing ONLY the concealed tiles of an
// open hand (14 − 3·melds) yields correct shanten/ukeire — the lib already accounts
// for the called sets. See `efficiency.test.ts` and ADR 0069.

import { RuleSet } from 'mahjong-tile-efficiency';
import { toEffHand } from '$lib/game/tiles';
import type { TileCode } from '$lib/game/tiles';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ruleSet: any = new RuleSet('Riichi');

function calc(codes: TileCode[]): { shanten: number; ukeire: number } {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const r: any = ruleSet.calUkeire(toEffHand(codes) as any);
		return { shanten: r.shanten ?? 8, ukeire: r.totalUkeire ?? 0 };
	} catch {
		return { shanten: 8, ukeire: 0 };
	}
}

// Shanten of a hand as-is (no discard). -1 means it's already a complete winning
// hand — used to reject a Hand-of-the-Day puzzle whose 14-tile hand is a win (you'd
// tsumo, not discard).
export function shantenOf(codes: TileCode[]): number {
	return calc(codes).shanten;
}

function removeOne(codes: TileCode[], code: TileCode): TileCode[] {
	const i = codes.indexOf(code);
	if (i < 0) return codes.slice();
	return [...codes.slice(0, i), ...codes.slice(i + 1)];
}

function countOf(codes: TileCode[], code: TileCode): number {
	return codes.filter((c) => c === code).length;
}

export interface DiscardOption {
	code: TileCode;
	shanten: number;
	ukeire: number;
}

export interface HandAnalysis {
	ranked: DiscardOption[]; // one per distinct discard, best first
	bestDiscards: TileCode[]; // every optimal discard (min shanten, then max ukeire)
	bestShanten: number;
	ukeire: number; // total ukeire (tiles in the wall) after the optimal discard
	ukeireTiles: TileCode[]; // the tile *types* that advance the hand
}

// Analyse a post-draw concealed hand (14 tiles when closed, 14 − 3·melds when
// open — any 3n+2 length): rank each distinct discard by shanten then ukeire, and
// for the optimal discard list the tile types that advance the hand. Meld-aware
// via the lib's count-derived target (see the file header), so an open hand's
// concealed tiles are passed straight through.
export function analyzeHand(hand: TileCode[]): HandAnalysis {
	const distinct = [...new Set(hand)];
	const ranked: DiscardOption[] = distinct.map((code) => {
		const { shanten, ukeire } = calc(removeOne(hand, code));
		return { code, shanten, ukeire };
	});
	ranked.sort((a, b) => a.shanten - b.shanten || b.ukeire - a.ukeire);

	const best = ranked[0];
	const bestDiscards = ranked
		.filter((o) => o.shanten === best.shanten && o.ukeire === best.ukeire)
		.map((o) => o.code);

	// Which tile types advance the hand after the optimal discard?
	const remaining = removeOne(hand, best.code);
	const ukeireTiles: TileCode[] = [];
	for (let c = 1; c <= 34; c++) {
		const code = c as TileCode;
		if (countOf(remaining, code) >= 4) continue;
		if (calc([...remaining, code]).shanten < best.shanten) ukeireTiles.push(code);
	}

	return {
		ranked,
		bestDiscards,
		bestShanten: best.shanten,
		ukeire: best.ukeire,
		ukeireTiles
	};
}
