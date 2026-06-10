// Post-game review — capture a lightweight per-round log during play, then flag
// 3–5 key moments CLIENT-SIDE (no API cost) to send to Claude for the narrative.
// Human is always seat 0.

import type { GameState } from './types';

export interface RoundRecord {
	round: number;
	honba: number;
	outcome: 'tsumo' | 'ron' | 'draw';
	winner: number | null;
	loser: number | null; // deal-in seat (ron only)
	han: number | null;
	fu: number | null;
	score: number | null;
	yaku: { name: string; han: number }[];
	tenpaiSeats: number[]; // draws only
	pointChanges: [number, number, number, number];
	scoresAfter: [number, number, number, number];
}

// Snapshot the just-finished round from a round_end state. Returns null if the
// state isn't actually a finished round.
export function recordRound(state: GameState): RoundRecord | null {
	const scoresAfter = state.players.map((p) => p.score) as [number, number, number, number];

	if (state.roundResult) {
		const r = state.roundResult;
		return {
			round: state.round,
			honba: state.honba,
			outcome: r.winType,
			winner: r.winner,
			loser: r.loser,
			han: r.han,
			fu: r.fu,
			score: r.score,
			yaku: r.yaku ?? [],
			tenpaiSeats: [],
			pointChanges: r.pointChanges,
			scoresAfter
		};
	}

	if (state.exhaustiveDrawResult) {
		const e = state.exhaustiveDrawResult;
		return {
			round: state.round,
			honba: state.honba,
			outcome: 'draw',
			winner: null,
			loser: null,
			han: null,
			fu: null,
			score: null,
			yaku: [],
			tenpaiSeats: e.tenpaiSeats as number[],
			pointChanges: e.pointChanges,
			scoresAfter
		};
	}

	return null;
}

export interface ReviewMoment {
	round: number;
	honba: number;
	kind: 'win' | 'deal-in' | 'draw' | 'swing';
	humanDelta: number;
	text: string; // pre-formatted, human-readable
}

export interface ReviewPayload {
	totalRounds: number;
	finalScores: [number, number, number, number];
	placement: number; // human's finishing rank, 1–4
	trajectory: number[]; // human score after each round
	moments: ReviewMoment[];
}

export const SEAT_NAMES = ['You', 'South', 'West', 'North'] as const;
const SEAT = SEAT_NAMES;

// Rounds 1–4 are East, 5–8 South (sudden-death overtime — see ADR 0032).
export function roundTag(round: number, honba: number): string {
	const wind = round <= 4 ? 'East' : 'South';
	const n = round <= 4 ? round : round - 4;
	return `${wind}-${n}${honba ? ` (${honba} honba)` : ''}`;
}

// Shared by the post-game review payload and the game-history detail view.
export function summarize(r: RoundRecord): { kind: ReviewMoment['kind']; text: string } {
	const me = r.pointChanges[0];
	const tag = roundTag(r.round, r.honba);
	const delta = `${me >= 0 ? '+' : ''}${me}`;

	if (r.outcome === 'draw') {
		const youTenpai = r.tenpaiSeats.includes(0);
		return {
			kind: 'draw',
			text: `${tag}: exhaustive draw — you were ${youTenpai ? 'tenpai' : 'noten'} (${delta}).`
		};
	}
	if (r.winner === 0) {
		const yaku = r.yaku.length ? ` [${r.yaku.map((y) => y.name).join(', ')}]` : '';
		return {
			kind: 'win',
			text: `${tag}: you won by ${r.outcome} — ${r.han} han / ${r.fu} fu, ${r.score} pts (${delta})${yaku}.`
		};
	}
	if (r.loser === 0) {
		const yaku = r.yaku.length ? ` [${r.yaku.map((y) => y.name).join(', ')}]` : '';
		return {
			kind: 'deal-in',
			text: `${tag}: you dealt into ${SEAT[r.winner ?? 0]}'s ron — ${r.han} han / ${r.fu} fu (${delta})${yaku}.`
		};
	}
	// Someone else won and you weren't directly involved
	return {
		kind: 'swing',
		text: `${tag}: ${SEAT[r.winner ?? 0]} won by ${r.outcome} (${delta} for you).`
	};
}

// Flag up to 5 key moments: every deal-in and personal win, then the largest
// remaining swings, plus the final round if not already included.
export function buildReviewPayload(history: RoundRecord[]): ReviewPayload {
	const finalScores =
		history.length > 0
			? history[history.length - 1].scoresAfter
			: ([25000, 25000, 25000, 25000] as [number, number, number, number]);

	const ranked = [...finalScores].map((s, seat) => ({ s, seat })).sort((a, b) => b.s - a.s);
	const placement = ranked.findIndex((x) => x.seat === 0) + 1;

	const moments: ReviewMoment[] = history.map((r) => {
		const { kind, text } = summarize(r);
		return { round: r.round, honba: r.honba, kind, humanDelta: r.pointChanges[0], text };
	});

	// Priority: deal-ins + wins first, then biggest |swing|.
	const important = moments.filter((m) => m.kind === 'win' || m.kind === 'deal-in');
	const rest = moments
		.filter((m) => m.kind !== 'win' && m.kind !== 'deal-in')
		.sort((a, b) => Math.abs(b.humanDelta) - Math.abs(a.humanDelta));

	const chosen = new Map<number, ReviewMoment>();
	for (const m of [...important, ...rest]) {
		if (chosen.size >= 5) break;
		chosen.set(m.round * 10 + m.honba, m);
	}
	// Always include the final round so the ending is covered.
	const last = moments[moments.length - 1];
	if (last) chosen.set(last.round * 10 + last.honba, last);

	const selected = [...chosen.values()].sort((a, b) => a.round - b.round || a.honba - b.honba);

	return {
		totalRounds: history.length,
		finalScores,
		placement,
		trajectory: history.map((r) => r.scoresAfter[0]),
		moments: selected
	};
}
