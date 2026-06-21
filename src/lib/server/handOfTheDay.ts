// Hand of the Day — a daily riichi "what should I discard?" puzzle.
//
// The puzzle is hand-authored and curated (see ./puzzles); the *correct answer*
// (best discard, shanten, ukeire) is derived deterministically from
// mahjong-tile-efficiency (see ./efficiency), so the puzzle can never ship a wrong
// answer. Today's puzzle is selected from the pool by the Sydney calendar day, so
// every visitor shares the same puzzle and the order follows the authored
// curriculum.
//
// This replaces the old Claude-generated daily puzzle (ADRs 0028/0034/0035/0036):
// the API only ever invented the hand and wrote the prose — the answer always came
// from the lib — so curating the hands removes the API cost, the cold-start
// latency, the dedup/retry machinery, and the daily pre-warm cron, while making
// every puzzle reviewable in a PR. See notes ADR 0073.

import { analyzeHand, shantenOf } from './efficiency';
import { sydneyDate, daysSince } from './day';
import { PUZZLES, PUZZLE_EPOCH, type AuthoredPuzzle } from './puzzles';
import { parseEffStr, isHonor } from '$lib/game/tiles';
import type { TileCode } from '$lib/game/tiles';
import type { PublicPuzzle, PuzzleAnswer } from '$lib/game/hotd';

export interface Puzzle {
	hand: TileCode[]; // 14 tile codes, sorted for display
	seatWind: TileCode;
	roundWind: TileCode;
	doraIndicator: TileCode;
	question: string;
	bestDiscards: TileCode[]; // optimal discard(s), lib-derived (the answer)
	bestShanten: number;
	ukeire: number; // tiles in the wall the optimal discard accepts
	ukeireTiles: TileCode[]; // the accepted tile *types*
	explanation: string;
}

export interface StoredPuzzle {
	date: string;
	puzzle: Puzzle;
}

// The answer-stripped puzzle (PublicPuzzle) and the revealed solution
// (PuzzleAnswer) live in $lib/game/hotd so the client can share them.

export function toPublicPuzzle(p: Puzzle): PublicPuzzle {
	return {
		hand: p.hand,
		seatWind: p.seatWind,
		roundWind: p.roundWind,
		doraIndicator: p.doraIndicator,
		question: p.question
	};
}

export function toAnswer(p: Puzzle): PuzzleAnswer {
	return {
		bestDiscards: p.bestDiscards,
		bestShanten: p.bestShanten,
		ukeire: p.ukeire,
		ukeireTiles: p.ukeireTiles,
		explanation: p.explanation
	};
}

const QUESTION = 'You just drew your 14th tile. Which single tile is the most efficient discard?';

function parseHand(notation: string): TileCode[] {
	const tokens = notation.trim().split(/\s+/).filter(Boolean);
	const codes = tokens.map(parseEffStr);
	if (codes.length !== 14 || codes.some((c) => c === null)) {
		throw new Error(`Hand of the Day: malformed hand "${notation}" (need 14 valid tiles)`);
	}
	const result = codes as TileCode[];
	const counts = new Map<number, number>();
	for (const c of result) counts.set(c, (counts.get(c) ?? 0) + 1);
	for (const n of counts.values()) {
		if (n > 4) throw new Error(`Hand of the Day: illegal hand "${notation}" (>4 of a tile)`);
	}
	return result;
}

// Turn an authored puzzle into the full Puzzle: parse + validate the situation,
// then derive the answer from the efficiency lib. Throws on a malformed puzzle so
// puzzles.test.ts catches it in CI rather than a visitor hitting it at runtime.
export function buildPuzzle(a: AuthoredPuzzle): Puzzle {
	const hand = parseHand(a.hand);
	const seatWind = parseEffStr(a.seatWind);
	const roundWind = parseEffStr(a.roundWind);
	const doraIndicator = parseEffStr(a.doraIndicator);
	if (seatWind === null || roundWind === null || doraIndicator === null) {
		throw new Error('Hand of the Day: malformed seat/round wind or dora indicator');
	}
	if (!isHonor(seatWind) || !isHonor(roundWind)) {
		throw new Error('Hand of the Day: seat/round wind must be an honor tile (1z–4z)');
	}
	// A complete 14-tile hand is a win, not a discard decision — reject it so a
	// degenerate "puzzle" can't ship (e.g. 345678m 234567p 99s).
	if (shantenOf(hand) < 0) {
		throw new Error(`Hand of the Day: hand "${a.hand}" is already a winning hand`);
	}

	const analysis = analyzeHand(hand);
	const sorted = [...hand].sort((x, y) => x - y);
	return {
		hand: sorted,
		seatWind,
		roundWind,
		doraIndicator,
		question: QUESTION,
		bestDiscards: analysis.bestDiscards,
		bestShanten: analysis.bestShanten,
		ukeire: analysis.ukeire,
		ukeireTiles: analysis.ukeireTiles,
		explanation: a.explanation.trim()
	};
}

// Which curated puzzle a given Sydney day shows: a sequential curriculum indexed
// by the day number since PUZZLE_EPOCH, wrapping when the pool is exhausted. The
// modulo is normalised so dates before the epoch still map into range.
export function selectPuzzleIndex(date: string): number {
	const n = PUZZLES.length;
	const day = daysSince(PUZZLE_EPOCH, date);
	return ((day % n) + n) % n;
}

// Today's puzzle. Synchronous and instant — no DB, no API.
export function getTodayPuzzle(date: string = sydneyDate()): StoredPuzzle {
	const authored = PUZZLES[selectPuzzleIndex(date)];
	return { date, puzzle: buildPuzzle(authored) };
}
