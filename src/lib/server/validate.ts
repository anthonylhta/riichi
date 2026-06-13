// Server-side validation for client-supplied API payloads.
//
// /api/helper and /api/overview interpolate the request body into a Claude
// prompt, so an unvalidated payload is both an open-ended token bill (huge
// arrays → huge input prompts on our key) and a prompt-injection surface.
// /api/games stores its body as jsonb. Each validator rebuilds the object from
// whitelisted, bounds-checked fields — unknown keys are dropped, anything out
// of shape or out of bounds rejects the request (these payloads are produced
// by our own client; a legitimate request never trips the limits).

import type { HelperMeld, HelperSeatView, HelperView } from '$lib/game/helper';
import type { ReviewMoment, ReviewPayload, RoundRecord } from '$lib/game/review';
import type { ReplayInput, ReplayLog } from '$lib/game/replay';
import type { GameTile } from '$lib/game/tiles';
import type { DealInMoment, DealInSeat } from '$lib/game/tileReview';

// Generous upper bounds for a legal game state.
const MAX_DISCARDS = 30; // a single pond can't realistically exceed ~24
const MAX_MELDS = 4;
const MAX_DORA = 5;
const MAX_MOMENTS = 6; // client flags ≤5 + final round
const MAX_MOMENT_TEXT = 240; // summarize() output is well under this
const MAX_ROUNDS = 64; // honba renchans included, a game ends far earlier
const MAX_YAKU = 16;
const MAX_YAKU_NAME = 60;

function isInt(v: unknown, min: number, max: number): v is number {
	return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function isScore(v: unknown): v is number {
	return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1_000_000;
}

const isTile = (v: unknown): v is number => isInt(v, 1, 34);

function tileArray(v: unknown, maxLen: number): number[] | null {
	if (!Array.isArray(v) || v.length > maxLen || !v.every(isTile)) return null;
	return v;
}

function scoreTuple(v: unknown): [number, number, number, number] | null {
	if (!Array.isArray(v) || v.length !== 4 || !v.every(isScore)) return null;
	return v as [number, number, number, number];
}

const MELD_TYPES = new Set(['chi', 'pon', 'kan', 'ankan', 'kakan', 'daiminkan']);

function melds(v: unknown): HelperMeld[] | null {
	if (!Array.isArray(v) || v.length > MAX_MELDS) return null;
	const out: HelperMeld[] = [];
	for (const m of v) {
		if (typeof m !== 'object' || m === null) return null;
		const { type, tiles } = m as Record<string, unknown>;
		if (typeof type !== 'string' || !MELD_TYPES.has(type)) return null;
		const t = tileArray(tiles, 4);
		if (!t) return null;
		out.push({ type, tiles: t });
	}
	return out;
}

function helperSeat(v: unknown): HelperSeatView | null {
	if (typeof v !== 'object' || v === null) return null;
	const s = v as Record<string, unknown>;
	const discards = tileArray(s.discards, MAX_DISCARDS);
	const seatMelds = melds(s.melds);
	if (
		!isInt(s.seat, 0, 3) ||
		typeof s.isYou !== 'boolean' ||
		!isInt(s.wind, 28, 31) ||
		typeof s.isRiichi !== 'boolean' ||
		!isScore(s.score) ||
		!discards ||
		!seatMelds ||
		!isInt(s.concealedCount, 0, 14)
	) {
		return null;
	}
	return {
		seat: s.seat,
		isYou: s.isYou,
		wind: s.wind,
		isRiichi: s.isRiichi,
		score: s.score,
		discards,
		melds: seatMelds,
		concealedCount: s.concealedCount
	};
}

export function validateHelperView(body: unknown): HelperView | null {
	if (typeof body !== 'object' || body === null) return null;
	const b = body as Record<string, unknown>;

	const doraIndicators = tileArray(b.doraIndicators, MAX_DORA);
	const hand = tileArray(b.hand, 14);
	const ownMelds = melds(b.melds);
	if (
		!isInt(b.round, 1, 8) ||
		!isInt(b.honba, 0, 30) ||
		!isInt(b.roundWind, 28, 31) ||
		!isInt(b.wallCount, 0, 122) ||
		!doraIndicators ||
		!hand ||
		hand.length === 0 ||
		!ownMelds ||
		!Array.isArray(b.seats) ||
		b.seats.length !== 4
	) {
		return null;
	}

	const seats: HelperSeatView[] = [];
	for (const s of b.seats) {
		const seat = helperSeat(s);
		if (!seat) return null;
		seats.push(seat);
	}

	return {
		round: b.round,
		honba: b.honba,
		roundWind: b.roundWind,
		wallCount: b.wallCount,
		doraIndicators,
		hand,
		melds: ownMelds,
		seats
	};
}

const MOMENT_KINDS = new Set(['win', 'deal-in', 'draw', 'swing']);

function reviewMoment(v: unknown): ReviewMoment | null {
	if (typeof v !== 'object' || v === null) return null;
	const m = v as Record<string, unknown>;
	if (
		!isInt(m.round, 1, 8) ||
		!isInt(m.honba, 0, 30) ||
		typeof m.kind !== 'string' ||
		!MOMENT_KINDS.has(m.kind) ||
		!isScore(m.humanDelta) ||
		typeof m.text !== 'string' ||
		m.text.length > MAX_MOMENT_TEXT
	) {
		return null;
	}
	return {
		round: m.round,
		honba: m.honba,
		kind: m.kind as ReviewMoment['kind'],
		humanDelta: m.humanDelta,
		text: m.text
	};
}

export function validateReviewPayload(body: unknown): ReviewPayload | null {
	if (typeof body !== 'object' || body === null) return null;
	const b = body as Record<string, unknown>;

	const finalScores = scoreTuple(b.finalScores);
	if (
		!isInt(b.totalRounds, 0, MAX_ROUNDS) ||
		!finalScores ||
		!isInt(b.placement, 1, 4) ||
		!Array.isArray(b.trajectory) ||
		b.trajectory.length > MAX_ROUNDS ||
		!b.trajectory.every(isScore) ||
		!Array.isArray(b.moments) ||
		b.moments.length > MAX_MOMENTS
	) {
		return null;
	}

	const moments: ReviewMoment[] = [];
	for (const m of b.moments) {
		const moment = reviewMoment(m);
		if (!moment) return null;
		moments.push(moment);
	}

	return {
		totalRounds: b.totalRounds,
		finalScores,
		placement: b.placement,
		trajectory: b.trajectory as number[],
		moments
	};
}

const OUTCOMES = new Set(['tsumo', 'ron', 'draw']);

function roundRecord(v: unknown): RoundRecord | null {
	if (typeof v !== 'object' || v === null) return null;
	const r = v as Record<string, unknown>;
	const pointChanges = scoreTuple(r.pointChanges);
	const scoresAfter = scoreTuple(r.scoresAfter);
	if (
		!isInt(r.round, 1, 8) ||
		!isInt(r.honba, 0, 30) ||
		typeof r.outcome !== 'string' ||
		!OUTCOMES.has(r.outcome) ||
		!(r.winner === null || isInt(r.winner, 0, 3)) ||
		!(r.loser === null || isInt(r.loser, 0, 3)) ||
		!(r.han === null || isInt(r.han, 0, 200)) ||
		!(r.fu === null || isInt(r.fu, 0, 200)) ||
		!(r.score === null || isScore(r.score)) ||
		!Array.isArray(r.yaku) ||
		r.yaku.length > MAX_YAKU ||
		!Array.isArray(r.tenpaiSeats) ||
		r.tenpaiSeats.length > 4 ||
		!r.tenpaiSeats.every((s) => isInt(s, 0, 3)) ||
		!pointChanges ||
		!scoresAfter
	) {
		return null;
	}
	const yaku: { name: string; han: number }[] = [];
	for (const y of r.yaku) {
		if (typeof y !== 'object' || y === null) return null;
		const { name, han } = y as Record<string, unknown>;
		if (typeof name !== 'string' || name.length > MAX_YAKU_NAME || !isInt(han, 0, 200)) return null;
		yaku.push({ name, han });
	}
	return {
		round: r.round,
		honba: r.honba,
		outcome: r.outcome as RoundRecord['outcome'],
		winner: r.winner as number | null,
		loser: r.loser as number | null,
		han: r.han as number | null,
		fu: r.fu as number | null,
		score: r.score as number | null,
		yaku,
		tenpaiSeats: r.tenpaiSeats as number[],
		pointChanges,
		scoresAfter
	};
}

// Validates the rounds array saved to games.rounds (jsonb) — bounds the row size
// and guarantees the stored shape so the future game-history views can trust it.
export function validateRounds(v: unknown): RoundRecord[] | null {
	if (!Array.isArray(v) || v.length > MAX_ROUNDS) return null;
	const out: RoundRecord[] = [];
	for (const r of v) {
		const record = roundRecord(r);
		if (!record) return null;
		out.push(record);
	}
	return out;
}

// ── Replay log (games.replay jsonb) ─────────────────────────────────────────

const WALL_SIZE = 136;
// Human inputs only (AI moves are derived on replay): generously ~25 per round
// across MAX_ROUNDS hands still sits far below this.
const MAX_REPLAY_INPUTS = 4096;

function gameTile(v: unknown): GameTile | null {
	if (typeof v !== 'object' || v === null) return null;
	const t = v as Record<string, unknown>;
	if (!isTile(t.code) || !isInt(t.id, 0, 135) || typeof t.isRed !== 'boolean') return null;
	return { code: t.code, id: t.id, isRed: t.isRed };
}

// A full deal-order wall: exactly 136 physical tiles.
function wall(v: unknown): GameTile[] | null {
	if (!Array.isArray(v) || v.length !== WALL_SIZE) return null;
	const out: GameTile[] = [];
	for (const t of v) {
		const tile = gameTile(t);
		if (!tile) return null;
		out.push(tile);
	}
	return out;
}

function tileIds(v: unknown, count: number): number[] | null {
	if (!Array.isArray(v) || v.length !== count || !v.every((id) => isInt(id, 0, 135))) return null;
	return v;
}

function replayInput(v: unknown): ReplayInput | null {
	if (typeof v !== 'object' || v === null) return null;
	const i = v as Record<string, unknown>;
	switch (i.t) {
		case 'discard':
			if (!isInt(i.tileId, 0, 135) || typeof i.riichi !== 'boolean') return null;
			return { t: 'discard', tileId: i.tileId, riichi: i.riichi };
		case 'tsumo':
		case 'ron':
		case 'pass':
			return { t: i.t };
		case 'pon':
		case 'chi': {
			const ids = tileIds(i.tileIds, 2);
			return ids ? { t: i.t, tileIds: ids } : null;
		}
		case 'daiminkan': {
			const ids = tileIds(i.tileIds, 3);
			return ids ? { t: 'daiminkan', tileIds: ids } : null;
		}
		case 'ankan':
			return isTile(i.code) ? { t: 'ankan', code: i.code } : null;
		case 'kakan':
			return isInt(i.meldIndex, 0, 3) ? { t: 'kakan', meldIndex: i.meldIndex } : null;
		case 'nextRound': {
			if (i.wall === null) return { t: 'nextRound', wall: null };
			const w = wall(i.wall);
			return w ? { t: 'nextRound', wall: w } : null;
		}
		default:
			return null;
	}
}

// ── Tile review (/api/tile-review) ──────────────────────────────────────────

const MAX_TILE_MOMENTS = 3;

function dealInSeat(v: unknown): DealInSeat | null {
	if (typeof v !== 'object' || v === null) return null;
	const s = v as Record<string, unknown>;
	const discards = tileArray(s.discards, MAX_DISCARDS);
	const seatMelds = melds(s.melds);
	if (
		!isInt(s.seat, 0, 3) ||
		typeof s.isYou !== 'boolean' ||
		typeof s.isRiichi !== 'boolean' ||
		!isScore(s.score) ||
		!discards ||
		!seatMelds
	) {
		return null;
	}
	return {
		seat: s.seat,
		isYou: s.isYou,
		isRiichi: s.isRiichi,
		score: s.score,
		discards,
		melds: seatMelds
	};
}

function dealInMoment(v: unknown): DealInMoment | null {
	if (typeof v !== 'object' || v === null) return null;
	const m = v as Record<string, unknown>;
	const doraIndicators = tileArray(m.doraIndicators, MAX_DORA);
	const hand = tileArray(m.hand, 14);
	const ownMelds = melds(m.melds);
	const safeTiles = tileArray(m.safeTiles, 14);
	if (
		!isInt(m.round, 1, 8) ||
		!isInt(m.honba, 0, 30) ||
		!isInt(m.turn, 1, 40) ||
		!isInt(m.tilesLeft, 0, 70) ||
		!doraIndicators ||
		!hand ||
		hand.length === 0 ||
		!ownMelds ||
		!isTile(m.dealInTile) ||
		typeof m.forcedByRiichi !== 'boolean' ||
		!safeTiles ||
		typeof m.winner !== 'object' ||
		m.winner === null ||
		!Array.isArray(m.seats) ||
		m.seats.length !== 4
	) {
		return null;
	}

	const w = m.winner as Record<string, unknown>;
	if (
		!isInt(w.seat, 1, 3) ||
		!isInt(w.han, 0, 200) ||
		!isInt(w.fu, 0, 200) ||
		!isScore(w.score) ||
		!Array.isArray(w.yaku) ||
		w.yaku.length > MAX_YAKU
	) {
		return null;
	}
	const yaku: { name: string; han: number }[] = [];
	for (const y of w.yaku) {
		if (typeof y !== 'object' || y === null) return null;
		const { name, han } = y as Record<string, unknown>;
		if (typeof name !== 'string' || name.length > MAX_YAKU_NAME || !isInt(han, 0, 200)) return null;
		yaku.push({ name, han });
	}

	const seats: DealInSeat[] = [];
	for (const s of m.seats) {
		const seat = dealInSeat(s);
		if (!seat) return null;
		seats.push(seat);
	}

	return {
		round: m.round,
		honba: m.honba,
		turn: m.turn,
		tilesLeft: m.tilesLeft,
		doraIndicators,
		hand,
		melds: ownMelds,
		dealInTile: m.dealInTile,
		forcedByRiichi: m.forcedByRiichi,
		safeTiles,
		winner: { seat: w.seat, han: w.han, fu: w.fu, score: w.score, yaku },
		seats
	};
}

// Validates the deal-in moments posted to /api/tile-review — each lands in a
// Claude prompt, so everything is rebuilt from bounds-checked fields.
export function validateDealInMoments(body: unknown): DealInMoment[] | null {
	if (typeof body !== 'object' || body === null) return null;
	const b = body as Record<string, unknown>;
	if (!Array.isArray(b.moments) || b.moments.length === 0 || b.moments.length > MAX_TILE_MOMENTS) {
		return null;
	}
	const out: DealInMoment[] = [];
	for (const m of b.moments) {
		const moment = dealInMoment(m);
		if (!moment) return null;
		out.push(moment);
	}
	return out;
}

// Validates the deterministic move log saved to games.replay (jsonb) — bounds
// the row size and guarantees the stored shape is replayable via replayGame().
export function validateReplayLog(v: unknown): ReplayLog | null {
	if (typeof v !== 'object' || v === null) return null;
	const b = v as Record<string, unknown>;
	if (b.version !== 1) return null;

	const startWall = wall(b.startWall);
	if (!startWall) return null;
	if (!Array.isArray(b.inputs) || b.inputs.length > MAX_REPLAY_INPUTS) return null;

	const inputs: ReplayInput[] = [];
	for (const i of b.inputs) {
		const input = replayInput(i);
		if (!input) return null;
		inputs.push(input);
	}

	return { version: 1, startWall, inputs };
}
