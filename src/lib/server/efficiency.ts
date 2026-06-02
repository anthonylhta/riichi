// Server-side tile-efficiency analysis for the Hand of the Day puzzle.
// Derives the provably-correct discard from a 14-tile hand using the same
// mahjong-tile-efficiency RuleSet the AI uses, so the puzzle answer never
// depends on the LLM getting the maths right.

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

// Analyse a 14-tile hand: rank each distinct discard by shanten then ukeire,
// and for the optimal discard list the tile types that advance the hand.
export function analyzeHand(hand14: TileCode[]): HandAnalysis {
	const distinct = [...new Set(hand14)];
	const ranked: DiscardOption[] = distinct.map((code) => {
		const { shanten, ukeire } = calc(removeOne(hand14, code));
		return { code, shanten, ukeire };
	});
	ranked.sort((a, b) => a.shanten - b.shanten || b.ukeire - a.ukeire);

	const best = ranked[0];
	const bestDiscards = ranked
		.filter((o) => o.shanten === best.shanten && o.ukeire === best.ukeire)
		.map((o) => o.code);

	// Which tile types advance the hand after the optimal discard?
	const remaining = removeOne(hand14, best.code);
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
