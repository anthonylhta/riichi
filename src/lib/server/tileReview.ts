// Tile-level review. The client extracts ≤3 deal-in moments from a replayed
// game (see $lib/game/tileReview) and sends only those; Claude returns a
// verdict per moment — was the exact deal-in tile avoidable? The judgment is
// grounded twice over: `safeTiles` (genbutsu vs the winner) is computed
// mechanically client-side from the ordered events, and the hand's shape is
// re-derived here with mahjong-tile-efficiency, so the model argues from
// facts it was handed, not facts it invented.

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

// Numeric shape grounding — closed 14-tile hands only, the same limitation as
// the in-round helper (meld-aware shanten isn't modelled).
function shapeBlock(m: DealInMoment): string {
	if (m.melds.length > 0 || m.hand.length !== 14) return '';
	const a = analyzeHand(m.hand);
	return `\nHand shape (mahjong-tile-efficiency, authoritative): best discard kept the hand at ${a.bestShanten}-shanten. The hand was ${a.bestShanten === 0 ? 'TENPAI' : `${a.bestShanten} away from tenpai`}.`;
}

function momentBlock(m: DealInMoment, i: number): string {
	const wind = m.round <= 4 ? 'East' : 'South';
	const num = ((m.round - 1) % 4) + 1;
	const dora = m.doraIndicators.map((c) => tileText(doraFromIndicator(c))).join(' ');
	const yaku = m.winner.yaku.map((y) => `${y.name} (${y.han})`).join(', ') || '—';
	const forced = m.forcedByRiichi
		? `\nNOTE: you were locked in riichi — this discard was a forced tsumogiri. Judge the EARLIER riichi declaration (was committing to this hand right?), not the tile itself.`
		: '';
	return `MOMENT ${i + 1} — ${wind} ${num}, honba ${m.honba}, your discard #${m.turn}, ${m.tilesLeft} tiles left. Dora: ${dora || '—'}.
${m.seats.map(seatLine).join('\n')}
Your hand before the discard: ${str(m.hand)}${m.melds.length ? ` + melds ${m.melds.map((x) => `${x.type}(${x.tiles.map(tileText).join(' ')})`).join(', ')}` : ''}
You discarded: ${tileText(m.dealInTile)} → Seat ${m.winner.seat} RONNED it for ${m.winner.score} (${m.winner.han} han ${m.winner.fu} fu: ${yaku}).
Genbutsu you held (100% safe vs the winner, computed from the record): ${str(m.safeTiles)}${shapeBlock(m)}${forced}`;
}

const SYSTEM = `You are a riichi mahjong coach reviewing a player's deal-ins after a finished solo game (one human, seat 0/"You", vs three AI; Mahjong Soul defaults). For each moment you get the exact decision state the player could SEE — their hand, every river and meld, riichi declarations, dora, scores — plus two pieces of computed ground truth you must treat as authoritative: which of their tiles were genbutsu (guaranteed safe) against the winner, and how far the hand was from tenpai.

For each moment give a verdict:
- "avoidable" — a clearly better discard existed (a listed genbutsu, or an obviously safer category) and the hand didn't justify pushing.
- "justified" — pushing was reasonable: the hand's value/shape was worth the risk, or folding cost too much.
- "unlucky" — no realistic way to see it coming (early ron, no danger signals, no safe options).

Then 2–3 sentences of advice: name the concrete tile you'd have discarded instead (only from the listed genbutsu — if none were held, say so and teach the next-best heuristic like suji or honors, clearly labeled as judgment, not certainty). Weigh the hand's distance from tenpai against the visible danger; a noten hand pushing into a riichi is the classic avoidable deal-in.

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

export async function getTileReview(moments: DealInMoment[]): Promise<TileReviewResult> {
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
