// Tile-level review. The client extracts ≤5 pivotal moments from a replayed
// game (see $lib/game/tileReview) — deal-ins and riichi declarations — and sends
// only those; Claude returns a verdict per moment. The judgment is grounded:
// `safeTiles` (genbutsu) is computed mechanically client-side from the ordered
// events, and the hand's shape/wait is re-derived here with the meld-aware
// mahjong-tile-efficiency lib, so the model argues from facts it was handed.

import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import { analyzeHand } from './efficiency';
import { clamp } from './textLimit';
import { tileText, humanizeHonors, doraFromIndicator } from '$lib/game/tiles';
import type { TileCode } from '$lib/game/tiles';
import type {
	DealInMoment,
	DealInSeat,
	DealInVerdict,
	TileMoment,
	RiichiMoment,
	TileReviewResult
} from '$lib/game/tileReview';

const MODEL = 'claude-sonnet-4-6';

// Hard ceiling (chars) per verdict's advice, so a verbose response can't blow
// up the round cards (same failure mode as the helper panel — see textLimit.ts).
const LIMIT_ADVICE = 320;

const VERDICTS = new Set(['avoidable', 'justified', 'unlucky']);

let client: Anthropic | null = null;
function anthropic(): Anthropic {
	if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
	return client;
}

const str = (codes: TileCode[]) => (codes.length ? codes.map(tileText).join(' ') : '—');

function seatLine(s: DealInSeat): string {
	const who = s.isYou ? 'You' : `Seat ${s.seat}`;
	const riichi = s.isRiichi ? ' [RIICHI]' : '';
	const melds = s.melds.length
		? s.melds.map((m) => `${m.type}(${m.tiles.map(tileText).join(' ')})`).join(', ')
		: 'none';
	return `${who} (${s.score})${riichi}: discards [${str(s.discards)}]; melds ${melds}`;
}

// Numeric shape grounding. analyzeHand is meld-aware (the efficiency lib derives
// sets-needed from the concealed tile count), so open hands work too — we just
// need a post-draw concealed hand (3n+2 tiles), always true at a decision.
function shapeBlock(m: TileMoment): string {
	if (m.hand.length % 3 !== 2) return '';
	const a = analyzeHand(m.hand);
	return `\nHand shape (mahjong-tile-efficiency, authoritative): best discard kept the hand at ${a.bestShanten}-shanten. The hand was ${a.bestShanten === 0 ? 'TENPAI' : `${a.bestShanten} away from tenpai`}.`;
}

// Header shared by every moment kind: when, where, the board.
function header(m: TileMoment, i: number, kind: string): string {
	const wind = m.round <= 4 ? 'East' : 'South';
	const num = ((m.round - 1) % 4) + 1;
	const dora = m.doraIndicators.map((c) => tileText(doraFromIndicator(c))).join(' ');
	const handStr = `${str(m.hand)}${m.melds.length ? ` + melds ${m.melds.map((x) => `${x.type}(${x.tiles.map(tileText).join(' ')})`).join(', ')}` : ''}`;
	return `MOMENT ${i + 1} [${kind}] — ${wind} ${num}, honba ${m.honba}, your discard #${m.turn}, ${m.tilesLeft} tiles left. Dora: ${dora || '—'}.
${m.seats.map(seatLine).join('\n')}
Your hand at the decision: ${handStr}`;
}

function dealInBlock(m: DealInMoment, i: number): string {
	const yaku = m.winner.yaku.map((y) => `${y.name} (${y.han})`).join(', ') || '—';
	const forced = m.forcedByRiichi
		? `\nNOTE: you were locked in riichi — this discard was a forced tsumogiri. Judge the EARLIER riichi declaration (was committing to this hand right?), not the tile itself.`
		: '';
	return `${header(m, i, 'DEAL-IN')}
You discarded: ${tileText(m.dealInTile)} → Seat ${m.winner.seat} RONNED it for ${m.winner.score} (${m.winner.han} han ${m.winner.fu} fu: ${yaku}).
Genbutsu you held (100% safe vs the winner, computed from the record): ${str(m.safeTiles)}${shapeBlock(m)}${forced}`;
}

function riichiBlock(m: RiichiMoment, i: number): string {
	// The wait the riichi locks in — the tiles that complete after cutting the
	// declaration tile (analyzeHand's optimal discard == the riichi discard).
	const a = m.hand.length % 3 === 2 ? analyzeHand(m.hand) : null;
	const wait = a ? `${str(a.ukeireTiles)} (${a.ukeire} tiles live)` : 'unknown';
	const threats = m.seats.filter((s) => !s.isYou && s.isRiichi);
	const danger = threats.length
		? `\nA RIICHI is already out (Seat ${threats.map((s) => s.seat).join(', ')}) — declaring pushes into it. Genbutsu you held instead: ${str(m.safeTiles)}.`
		: '\nNo opponent had declared riichi yet.';
	return `${header(m, i, 'RIICHI')}
You DECLARED RIICHI by cutting ${tileText(m.riichiTile)}.
Your wait: ${wait}.${danger}`;
}

function momentBlock(m: TileMoment, i: number): string {
	return m.kind === 'deal-in' ? dealInBlock(m, i) : riichiBlock(m, i);
}

const SYSTEM = `You are a riichi mahjong coach reviewing a player's pivotal moments after a finished solo game (one human, seat 0/"You", vs three AI; Mahjong Soul defaults). Each moment is tagged [DEAL-IN] or [RIICHI]. You get the exact decision state the player could SEE — their hand, every river and meld, riichi declarations, dora, scores — plus computed ground truth you must treat as authoritative: which of their tiles were genbutsu (guaranteed safe), and how far the hand was from tenpai / what it waits on.

For each moment give a verdict — one of "avoidable", "justified", "unlucky" — meaning, by kind:
- [DEAL-IN]: avoidable = a clearly better discard existed (a listed genbutsu or safer category) and the hand didn't justify pushing; justified = pushing was reasonable (value/shape worth the risk, or folding cost too much); unlucky = no realistic way to see it coming.
- [RIICHI]: avoidable = declaring was the wrong call (a weak wait or cheap hand, or pushing a thin riichi into an existing riichi when staying damaten / folding was clearly better); justified = a good riichi (decent wait, the value/pressure was worth committing and closing the hand); unlucky = a reasonable riichi that simply didn't work out.

Then 2–3 sentences of advice. For a deal-in, name the concrete safer tile (only from the listed genbutsu — if none were held, say so and teach the next-best heuristic like suji or honors, labeled as judgment). For a riichi, judge wait quality, hand value, turn, and danger, and say what you'd have done (riichi / damaten / fold) and why.

Use notation like "3p" for number tiles; refer to honors by their English names (East, South, West, North, White dragon, Green dragon, Red dragon) — never "1z"/"5z" notation. Be concrete, brief, and honest — this renders inside small cards, not an essay.`;

const SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		verdicts: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				properties: {
					verdict: { type: 'string', enum: ['avoidable', 'justified', 'unlucky'] },
					advice: { type: 'string' }
				},
				required: ['verdict', 'advice']
			}
		}
	},
	required: ['verdicts']
} as const;

function textOf(message: Anthropic.Message): string {
	const block = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
	return block?.text ?? '';
}

export async function getTileReview(moments: TileMoment[]): Promise<TileReviewResult> {
	const prompt = `${moments.map(momentBlock).join('\n\n')}

Give one verdict per moment, in order (${moments.length} total).`;

	const res = await anthropic().messages.create({
		model: MODEL,
		max_tokens: 1024,
		thinking: { type: 'disabled' },
		system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
		output_config: { format: { type: 'json_schema', schema: SCHEMA } },
		messages: [{ role: 'user', content: prompt }]
		// output_config isn't in this SDK version's types yet.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any);

	const parsed = JSON.parse(textOf(res)) as TileReviewResult;
	const raw = Array.isArray(parsed.verdicts) ? parsed.verdicts : [];
	// Exactly one verdict per posted moment: clamp lengths, sanitize honors,
	// and pad anything missing rather than misaligning the cards.
	const verdicts: DealInVerdict[] = moments.map((_, i) => {
		const v = raw[i];
		return {
			verdict: VERDICTS.has(v?.verdict) ? (v.verdict as DealInVerdict['verdict']) : 'justified',
			advice: clamp(humanizeHonors(String(v?.advice ?? '')), LIMIT_ADVICE)
		};
	});
	return { verdicts };
}
