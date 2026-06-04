// Post-game overview. The client flags 3–5 key moments (see $lib/game/review) and
// sends only those — not the full game log — so Claude writes the narrative cheaply
// (~$0.01/game). Sonnet 4.6, thinking off for snappiness.

import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import { clamp } from './textLimit';
import type { ReviewPayload } from '$lib/game/review';

const MODEL = 'claude-sonnet-4-6';

// Hard ceilings on the model-authored review, so a verbose response can't grow the
// game-end card past the viewport and push the "New Game" button off-screen (the
// same failure mode as the helper panel — see textLimit.ts / UI_09). Both the
// length of each string AND the number of lessons are capped server-side.
const LIMITS = { narrative: 600, lesson: 200 } as const;
const MAX_LESSONS = 4;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
	if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
	return client;
}

export interface Overview {
	narrative: string;
	lessons: string[];
}

const SYSTEM = `You are a riichi mahjong coach reviewing a finished solo game — one human ("You", seat 0) versus three AI, East-only (Mahjong Soul defaults). You are given the final placement and the key moments the client already flagged (deal-ins, your wins, big swings), not the full log.

Write a short, honest, encouraging post-game review for the player:
- A 2–3 sentence narrative of how the game went and where it turned.
- 2–3 concrete, actionable lessons to improve, grounded in the moments given.
Be specific (reference the rounds/events provided). Don't invent tiles or events that aren't in the data. Use "you" and a warm coaching tone. Keep it tight: the narrative is at most three sentences, and give at most four short lessons (each one sentence) — this is a card on the game-over screen, not an essay.`;

const SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		narrative: { type: 'string' },
		lessons: { type: 'array', items: { type: 'string' } }
	},
	required: ['narrative', 'lessons']
} as const;

function textOf(message: Anthropic.Message): string {
	const block = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
	return block?.text ?? '';
}

const place = ['1st', '2nd', '3rd', '4th'];

export async function getOverview(payload: ReviewPayload): Promise<Overview> {
	const prompt = `Result: you finished ${place[payload.placement - 1] ?? `${payload.placement}th`} of 4 over ${payload.totalRounds} round(s).
Final scores — You: ${payload.finalScores[0]}, South: ${payload.finalScores[1]}, West: ${payload.finalScores[2]}, North: ${payload.finalScores[3]}.
Your score after each round: ${payload.trajectory.join(' → ')}.

Key moments:
${payload.moments.map((m) => `- ${m.text}`).join('\n')}

Write the review.`;

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

	const parsed = JSON.parse(textOf(res)) as Overview;
	return {
		narrative: clamp(String(parsed.narrative ?? ''), LIMITS.narrative),
		// Cap both the count and the length of the lessons so the game-over card
		// can't outgrow the viewport.
		lessons: Array.isArray(parsed.lessons)
			? parsed.lessons.slice(0, MAX_LESSONS).map((l) => clamp(String(l), LIMITS.lesson))
			: []
	};
}
