// Hand of the Day — a daily riichi "what should I discard?" puzzle.
//
// Claude (Opus 4.8) invents an instructive 14-tile hand and writes the teaching
// explanation, but the *correct answer* is derived deterministically from
// mahjong-tile-efficiency (see ./efficiency) — so the puzzle can never ship a
// wrong answer even if the model's own maths is off. One puzzle per UTC day is
// generated and cached in Neon, shared by every visitor.

import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { handOfTheDay } from './schema';
import { analyzeHand } from './efficiency';
import { toEffStr, parseEffStr, isHonor } from '$lib/game/tiles';
import type { TileCode } from '$lib/game/tiles';

const MODEL = 'claude-opus-4-8';

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
	model: string;
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
	if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
	return client;
}

// The daily puzzle is keyed on the Sydney calendar day, so it rolls over at
// Sydney midnight (not UTC midnight). 'en-CA' formats as ISO YYYY-MM-DD, and the
// Australia/Sydney time zone handles AEST/AEDT (daylight saving) automatically.
function sydneyDate(): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
}

// ── Claude call 1: invent a hand ────────────────────────────────────────────

const GEN_SYSTEM = `You design daily riichi mahjong "efficiency" puzzles for learners.

Produce ONE concealed 14-tile hand where the player has just drawn and must choose
the single most efficient tile to discard. Requirements:
- Standard notation: "1m".."9m" (manzu), "1p".."9p" (pinzu), "1s".."9s" (souzu),
  and "1z".."7z" for honors (1z=East, 2z=South, 3z=West, 4z=North, 5z=White dragon,
  6z=Green dragon, 7z=Red dragon).
- Exactly 14 tiles, a legal closed hand: at most 4 of any single tile.
- The hand should be TENPAI or 1-SHANTEN, with a genuinely instructive decision —
  the best discard should not be glaringly obvious (e.g. reward keeping good shapes,
  ryanmen over kanchan, dora, or yaku potential).
- Also give the player's seat wind and the round wind as "1z".."4z" (round wind is
  usually "1z"), and a dora indicator tile.

Return only the structured object. Do not state which tile to discard — that is
computed separately.`;

const HAND_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		hand: { type: 'array', items: { type: 'string' } },
		seatWind: { type: 'string' },
		roundWind: { type: 'string' },
		doraIndicator: { type: 'string' }
	},
	required: ['hand', 'seatWind', 'roundWind', 'doraIndicator']
} as const;

interface GeneratedHand {
	hand: TileCode[];
	seatWind: TileCode;
	roundWind: TileCode;
	doraIndicator: TileCode;
}

function textOf(message: Anthropic.Message): string {
	const block = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
	return block?.text ?? '';
}

function countLegal(codes: TileCode[]): boolean {
	const counts = new Map<number, number>();
	for (const c of codes) counts.set(c, (counts.get(c) ?? 0) + 1);
	for (const n of counts.values()) if (n > 4) return false;
	return true;
}

async function generateHand(date: string): Promise<GeneratedHand | null> {
	const res = await anthropic().messages.create({
		model: MODEL,
		max_tokens: 2048,
		thinking: { type: 'adaptive' },
		system: [{ type: 'text', text: GEN_SYSTEM, cache_control: { type: 'ephemeral' } }],
		output_config: { format: { type: 'json_schema', schema: HAND_SCHEMA } },
		messages: [
			{
				role: 'user',
				content: `Create today's puzzle (date ${date}). Make it distinct from a typical textbook hand.`
			}
		]
		// output_config + adaptive thinking aren't in this SDK version's types yet.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any);

	let parsed: { hand?: unknown; seatWind?: unknown; roundWind?: unknown; doraIndicator?: unknown };
	try {
		parsed = JSON.parse(textOf(res));
	} catch {
		return null;
	}

	const hand = Array.isArray(parsed.hand) ? parsed.hand.map((s) => parseEffStr(String(s))) : [];
	const seatWind = parseEffStr(String(parsed.seatWind));
	const roundWind = parseEffStr(String(parsed.roundWind));
	const doraIndicator = parseEffStr(String(parsed.doraIndicator));

	if (hand.length !== 14 || hand.some((c) => c === null)) return null;
	if (seatWind === null || roundWind === null || doraIndicator === null) return null;
	const codes = hand as TileCode[];
	if (!countLegal(codes)) return null;
	if (!isHonor(seatWind) || !isHonor(roundWind)) return null;

	return { hand: codes, seatWind, roundWind, doraIndicator };
}

// ── Claude call 2: explain the (verified) answer ────────────────────────────

function tilesToStr(codes: TileCode[]): string {
	return codes.map(toEffStr).join(' ');
}

async function generateExplanation(
	gen: GeneratedHand,
	best: TileCode[],
	ukeire: number,
	ukeireTiles: TileCode[],
	shanten: number
): Promise<string> {
	const res = await anthropic().messages.create({
		model: MODEL,
		max_tokens: 1024,
		thinking: { type: 'adaptive' },
		messages: [
			{
				role: 'user',
				content: `A concealed riichi hand (you just drew the 14th tile):
${tilesToStr(gen.hand)}
Seat wind ${toEffStr(gen.seatWind)}, round wind ${toEffStr(gen.roundWind)}, dora indicator ${toEffStr(gen.doraIndicator)}.

The most efficient discard is: ${tilesToStr(best)} (this leaves the hand at ${shanten}-shanten and accepts ${ukeire} tiles: ${tilesToStr(ukeireTiles)}).

Write a clear 2–4 sentence explanation for a learner: why this discard is best, what shape it keeps, and why it beats the obvious alternative. Use tile notation like "3p". Do not contradict the stated answer. Reply with the explanation only — no preamble.`
			}
		]
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any);
	return textOf(res).trim();
}

// ── Orchestration ───────────────────────────────────────────────────────────

async function generatePuzzle(date: string): Promise<{ puzzle: Puzzle; model: string }> {
	let gen: GeneratedHand | null = null;
	let analysis: ReturnType<typeof analyzeHand> | null = null;

	// A few attempts: skip degenerate hands (too far from tenpai, or no real choice).
	for (let attempt = 0; attempt < 4; attempt++) {
		const candidate = await generateHand(date);
		if (!candidate) continue;
		const a = analyzeHand(candidate.hand);
		const sharp = a.bestShanten <= 1 && a.ranked.length >= 2 && a.ukeireTiles.length > 0;
		if (sharp) {
			gen = candidate;
			analysis = a;
			break;
		}
		// Keep the best fallback we've seen even if not "sharp".
		if (!gen && a.bestShanten <= 2) {
			gen = candidate;
			analysis = a;
		}
	}

	if (!gen || !analysis) {
		throw new Error('Hand of the Day: could not generate a valid puzzle');
	}

	const explanation = await generateExplanation(
		gen,
		analysis.bestDiscards,
		analysis.ukeire,
		analysis.ukeireTiles,
		analysis.bestShanten
	);

	const sorted = [...gen.hand].sort((a, b) => a - b);
	const puzzle: Puzzle = {
		hand: sorted,
		seatWind: gen.seatWind,
		roundWind: gen.roundWind,
		doraIndicator: gen.doraIndicator,
		question: 'You just drew your 14th tile. Which single tile is the most efficient discard?',
		bestDiscards: analysis.bestDiscards,
		bestShanten: analysis.bestShanten,
		ukeire: analysis.ukeire,
		ukeireTiles: analysis.ukeireTiles,
		explanation
	};
	return { puzzle, model: MODEL };
}

// Today's puzzle — generated once and cached in Neon, shared by all visitors.
// onConflictDoNothing handles the race where two first-visitors generate at once.
export async function getOrCreateToday(): Promise<StoredPuzzle> {
	const db = getDb();
	const date = sydneyDate();

	const existing = await db.select().from(handOfTheDay).where(eq(handOfTheDay.date, date)).limit(1);
	if (existing.length) {
		const row = existing[0];
		return { date: row.date, puzzle: row.puzzle as Puzzle, model: row.model };
	}

	const { puzzle, model } = await generatePuzzle(date);
	await db.insert(handOfTheDay).values({ date, puzzle, model }).onConflictDoNothing();

	const row = (await db.select().from(handOfTheDay).where(eq(handOfTheDay.date, date)).limit(1))[0];
	return { date: row.date, puzzle: row.puzzle as Puzzle, model: row.model };
}
