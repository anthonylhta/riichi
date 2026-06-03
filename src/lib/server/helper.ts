// In-round AI helper. The player presses a button on their turn; we send the
// human-visible view (see $lib/game/helper) and ask Claude for ONE grounded
// recommendation. For a closed 14-tile hand we attach the efficiency ranking
// (shanten/ukeire) from mahjong-tile-efficiency so the discard advice is anchored
// in real numbers and Claude focuses on the strategic "why".

import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import { analyzeHand } from './efficiency';
import { tileText, humanizeHonors, doraFromIndicator } from '$lib/game/tiles';
import type { TileCode } from '$lib/game/tiles';
import type { HelperView, HelperAdvice, HelperMeld, HelperSeatView } from '$lib/game/helper';

const MODEL = 'claude-sonnet-4-6';

let client: Anthropic | null = null;
function anthropic(): Anthropic {
	if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
	return client;
}

const str = (codes: TileCode[]) => (codes.length ? codes.map(tileText).join(' ') : '—');
const meldStr = (melds: HelperMeld[]) =>
	melds.length
		? melds.map((m) => `${m.type}(${m.tiles.map(tileText).join(' ')})`).join(', ')
		: 'none';

function seatLine(s: HelperSeatView): string {
	const who = s.isYou ? 'You' : `Seat ${s.seat}`;
	const wind = tileText(s.wind);
	const riichi = s.isRiichi ? ' [RIICHI]' : '';
	return `${who} (${wind}, ${s.score})${riichi}: discards [${str(s.discards)}]; melds ${meldStr(s.melds)}`;
}

function efficiencyBlock(view: HelperView): string {
	// Numeric grounding only makes sense for a concealed 14-tile hand; meld-aware
	// shanten isn't modelled here, so fall back to qualitative advice otherwise.
	if (view.melds.length > 0 || view.hand.length !== 14) return '';
	const a = analyzeHand(view.hand);
	const top = a.ranked
		.slice(0, 6)
		.map((o) => `${tileText(o.code)} → ${o.shanten}-shanten, ${o.ukeire} ukeire`)
		.join('\n  ');
	return `\nEfficiency analysis (mahjong-tile-efficiency, authoritative for raw speed):
  ${top}
  Optimal by pure efficiency: ${str(a.bestDiscards)} (${a.bestShanten}-shanten, accepts ${a.ukeire} tiles: ${str(a.ukeireTiles)})`;
}

const SYSTEM = `You are a riichi mahjong coach giving live, in-game advice. You see exactly what the player sees — your own hand, everyone's discards and called melds, the dora indicators, scores, and riichi declarations — and nothing hidden (no opponents' concealed tiles, no wall order). Mahjong Soul defaults.

Give ONE clear recommendation for the player's current decision. Weigh efficiency, yaku and value, dora, the round/score situation, and safety against any riichi. If an efficiency analysis is provided, treat its numbers as authoritative for raw speed, but you decide the final pick — value or safety can outrank pure ukeire, and say so when it does. Teach: be concrete and brief. Use standard notation like "3p" for number tiles. Refer to honor tiles by their English name — East, South, West, North for the winds, and White dragon, Green dragon, Red dragon — never the "1z"/"5z" notation, in the discard field or anywhere in your reasoning.`;

const SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		discard: { type: 'string' },
		reasoning: { type: 'string' },
		plan: { type: 'string' }
	},
	required: ['discard', 'reasoning', 'plan']
} as const;

function textOf(message: Anthropic.Message): string {
	const block = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
	return block?.text ?? '';
}

export async function getHelperAdvice(view: HelperView): Promise<HelperAdvice> {
	const dora = view.doraIndicators.map((c) => tileText(doraFromIndicator(c)));
	const prompt = `Current situation — East ${view.round}, honba ${view.honba}. ${view.wallCount} tiles left in the wall.
Dora indicator(s): ${str(view.doraIndicators)} (so dora is: ${dora.join(' ') || '—'}).

${view.seats.map(seatLine).join('\n')}

YOUR hand: ${str(view.hand)}
YOUR melds: ${meldStr(view.melds)}
${efficiencyBlock(view)}

What should I do? Recommend the single best tile to discard now (tile notation) with a short teaching reason, plus a one-line plan for the rest of the hand.`;

	const res = await anthropic().messages.create({
		model: MODEL,
		max_tokens: 768,
		// Thinking off for snappiness — the discard is already grounded by the
		// efficiency analysis, so the model just needs to pick + explain.
		thinking: { type: 'disabled' },
		system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
		output_config: {
			format: { type: 'json_schema', schema: SCHEMA },
			effort: 'low'
		},
		messages: [{ role: 'user', content: prompt }]
		// output_config / adaptive thinking aren't in this SDK version's types yet.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any);

	const parsed = JSON.parse(textOf(res)) as HelperAdvice;
	// Belt-and-braces: if the model still slips in raw "Nz" notation, spell it out
	// so honors never reach the UI as "5z" or a blank haku tile.
	return {
		discard: humanizeHonors(String(parsed.discard ?? '—')),
		reasoning: humanizeHonors(String(parsed.reasoning ?? '')),
		plan: humanizeHonors(String(parsed.plan ?? ''))
	};
}
