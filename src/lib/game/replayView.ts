// Fold the semantic GameEvent stream (events.ts) into a sequence of board
// snapshots for the in-UI replay viewer. Pure + deterministic: one ReplayStep per
// observable action, each carrying a full BoardView (the table as it stood right
// after that action) plus a human-readable label. All four hands are reconstructed
// exactly — round_start gives the deals, then draws add / discards + calls remove —
// so revealing opponents' hands is free, and rivers/melds stay precise.
//
// This reads the event record, never re-interpreting engine internals; it stays
// honest to the game as played (see the events.ts note).

import type { GameEvent } from './events';
import type { GameTile } from './tiles';
import { tileLabel } from './tiles';
import type { AbortReason, BoardView, Meld, Seat } from './types';

// Drawable live-wall tiles at the start of a hand: 136 − 13×4 dealt − 14 dead wall.
// "tiles left" = INITIAL_DRAWS − normal draws − kans (each kan moves one live tile
// to the dead wall; rinshan draws come from the dead wall). Matches wallEnd−wallPos.
const INITIAL_DRAWS = 70;

const WIND_NAMES = ['East', 'South', 'West', 'North'];

export type StepKind = 'deal' | 'draw' | 'discard' | 'call' | 'kan' | 'dora' | 'win' | 'draw_end';

export type StepOutcome =
	| {
			type: 'win';
			winner: Seat;
			winnerName: string;
			tsumo: boolean;
			han: number;
			fu: number;
			score: number;
			yaku: { name: string; han: number }[];
	  }
	| { type: 'draw'; abortive: AbortReason | null; tenpaiNames: string[] };

export interface ReplayStep {
	view: BoardView;
	label: string;
	roundLabel: string; // e.g. "東1" / "南2"
	roundWindKanji: string;
	roundNumber: number;
	kind: StepKind;
	outcome?: StepOutcome;
}

export interface MoveGroup {
	header: string; // e.g. "東1" or "東1 · 2本場"
	items: { idx: number; label: string; kind: StepKind }[];
}

// Group the steps into hands for the move-list sidebar. A new group starts at each
// deal step, so a renchan's repeated round reads as its own block (with its honba).
// `idx` is the step index, so a list row can jump the viewer straight to it.
export function groupMovesByRound(steps: ReplayStep[]): MoveGroup[] {
	const groups: MoveGroup[] = [];
	steps.forEach((s, idx) => {
		if (s.kind === 'deal' || groups.length === 0) {
			const honba = s.view.honba;
			groups.push({ header: s.roundLabel + (honba > 0 ? ` · ${honba}本場` : ''), items: [] });
		}
		// The deal step's own label repeats the header, so trim it in the list.
		const label = s.kind === 'deal' ? 'Hands dealt' : s.label;
		groups[groups.length - 1].items.push({ idx, label, kind: s.kind });
	});
	return groups;
}

function windIndex(seat: Seat, dealer: Seat): number {
	return (seat - dealer + 4) % 4;
}

function sortHand(hand: GameTile[]): GameTile[] {
	return [...hand].sort((a, b) => a.code - b.code || a.id - b.id);
}

function removeIds(hand: GameTile[], ids: number[]): GameTile[] {
	const drop = new Set(ids);
	return hand.filter((t) => !drop.has(t.id));
}

// Mutable working board the fold updates in place; snapshotted (deep enough) per step.
interface Working {
	hands: GameTile[][];
	discards: GameTile[][];
	melds: Meld[][];
	scores: number[];
	riichi: boolean[];
	dealer: Seat;
	currentSeat: Seat;
	round: number;
	honba: number;
	doraIndicators: GameTile[];
	sticksOnTable: number; // riichi sticks (kyotaku) currently in the centre
	normalDraws: number;
	kans: number;
}

function snapshot(w: Working): BoardView {
	const players = ([0, 1, 2, 3] as const).map((seat) => ({
		hand: [...w.hands[seat]],
		discards: [...w.discards[seat]],
		melds: w.melds[seat].map((m) => ({ ...m, tiles: [...m.tiles] })),
		score: w.scores[seat],
		isRiichi: w.riichi[seat],
		isFuriten: false,
		isTempFuriten: false
	}));
	return {
		players: players as BoardView['players'],
		currentSeat: w.currentSeat,
		dealer: w.dealer,
		honba: w.honba,
		wallPos: w.normalDraws,
		wallEnd: INITIAL_DRAWS - w.kans,
		doraIndicators: [...w.doraIndicators],
		riichiBets: w.sticksOnTable
	};
}

export function buildReplaySteps(events: GameEvent[]): ReplayStep[] {
	const w: Working = {
		hands: [[], [], [], []],
		discards: [[], [], [], []],
		melds: [[], [], [], []],
		scores: [25000, 25000, 25000, 25000],
		riichi: [false, false, false, false],
		dealer: 0,
		currentSeat: 0,
		round: 1,
		honba: 0,
		doraIndicators: [],
		sticksOnTable: 0,
		normalDraws: 0,
		kans: 0
	};

	const steps: ReplayStep[] = [];
	const name = (seat: Seat) => (seat === 0 ? 'You' : WIND_NAMES[windIndex(seat, w.dealer)]);
	const push = (kind: StepKind, label: string, outcome?: StepOutcome) => {
		const roundWindKanji = w.round <= 4 ? '東' : '南';
		const roundNumber = ((w.round - 1) % 4) + 1;
		steps.push({
			view: snapshot(w),
			label,
			roundLabel: `${roundWindKanji}${roundNumber}`,
			roundWindKanji,
			roundNumber,
			kind,
			outcome
		});
	};

	for (let i = 0; i < events.length; i++) {
		const e = events[i];
		switch (e.type) {
			case 'round_start': {
				w.dealer = e.dealer;
				w.round = e.round;
				w.honba = e.honba;
				w.scores = [...e.scores];
				w.sticksOnTable = e.riichiBets;
				w.normalDraws = 0;
				w.kans = 0;
				w.hands = e.hands.map((h) => sortHand(h));
				w.discards = [[], [], [], []];
				w.melds = [[], [], [], []];
				w.riichi = [false, false, false, false];
				w.doraIndicators = [e.doraIndicator];
				w.currentSeat = e.dealer;
				const wk = w.round <= 4 ? '東' : '南';
				push('deal', `${wk}${((w.round - 1) % 4) + 1} — hands dealt`);
				break;
			}
			case 'draw': {
				w.currentSeat = e.seat;
				w.hands[e.seat] = [...w.hands[e.seat], e.tile];
				if (!e.rinshan) w.normalDraws++;
				push('draw', e.seat === 0 ? `You draw ${tileLabel(e.tile.code)}` : `${name(e.seat)} draws`);
				break;
			}
			case 'discard': {
				w.currentSeat = e.seat;
				w.hands[e.seat] = sortHand(removeIds(w.hands[e.seat], [e.tile.id]));
				w.discards[e.seat] = [...w.discards[e.seat], e.tile];
				if (e.riichi) {
					w.riichi[e.seat] = true;
					// The 1000-point stick is paid (and the score debited) only once the
					// declaring discard survives every ron check — a ron on the riichi tile
					// voids the declaration (ADR 0050). The event deltas don't carry the
					// debit, so apply it here, skipping the ronned case via a 1-event peek.
					const next = events[i + 1];
					const ronned =
						next?.type === 'win' && next.from === e.seat && next.tile?.id === e.tile.id;
					if (!ronned) {
						w.scores[e.seat] -= 1000;
						w.sticksOnTable++;
					}
				}
				const verb = e.riichi ? 'declares riichi —' : 'discards';
				push('discard', `${name(e.seat)} ${verb} ${tileLabel(e.tile.code)}`);
				break;
			}
			case 'call': {
				const from = e.from;
				w.currentSeat = e.seat;
				w.hands[e.seat] = sortHand(
					removeIds(
						w.hands[e.seat],
						e.consumed.map((t) => t.id)
					)
				);
				// The claimed tile leaves the discarder's river.
				w.discards[from] = w.discards[from].filter((t) => t.id !== e.tile.id);
				w.melds[e.seat] = [
					...w.melds[e.seat],
					{ type: e.call, tiles: [...e.consumed, e.tile], calledFrom: from }
				];
				if (e.call === 'daiminkan') w.kans++;
				push('call', `${name(e.seat)} ${e.call} ${tileLabel(e.tile.code)} from ${name(from)}`);
				break;
			}
			case 'ankan': {
				w.currentSeat = e.seat;
				w.hands[e.seat] = sortHand(
					removeIds(
						w.hands[e.seat],
						e.consumed.map((t) => t.id)
					)
				);
				w.melds[e.seat] = [
					...w.melds[e.seat],
					{ type: 'ankan', tiles: [...e.consumed], calledFrom: null }
				];
				w.kans++;
				push('kan', `${name(e.seat)} ankan ${tileLabel(e.consumed[0].code)}`);
				break;
			}
			case 'kakan': {
				w.currentSeat = e.seat;
				w.hands[e.seat] = sortHand(removeIds(w.hands[e.seat], [e.tile.id]));
				const meld = w.melds[e.seat].find(
					(m) => m.type === 'pon' && m.tiles[0]?.code === e.tile.code
				);
				if (meld) {
					meld.type = 'kakan';
					meld.tiles = [...meld.tiles, e.tile];
				}
				w.kans++;
				push('kan', `${name(e.seat)} kakan ${tileLabel(e.tile.code)}`);
				break;
			}
			case 'dora': {
				w.doraIndicators = [...w.doraIndicators, e.indicator];
				push('dora', `New dora indicator: ${tileLabel(e.indicator.code)}`);
				break;
			}
			case 'win': {
				w.currentSeat = e.seat;
				w.scores = w.scores.map((s, idx) => s + e.deltas[idx]);
				w.sticksOnTable = 0; // the winner collects the kyotaku (already in deltas)
				const tsumo = e.from === null;
				push('win', `${name(e.seat)} ${tsumo ? 'tsumo' : 'ron'} — ${e.score} points`, {
					type: 'win',
					winner: e.seat,
					winnerName: name(e.seat),
					tsumo,
					han: e.han,
					fu: e.fu,
					score: e.score,
					yaku: e.yaku
				});
				break;
			}
			case 'ryuukyoku': {
				w.scores = w.scores.map((s, idx) => s + e.deltas[idx]);
				const label = e.abortive
					? `Abortive draw — ${e.abortive}`
					: e.tenpaiSeats.length > 0
						? `Exhaustive draw — tenpai: ${e.tenpaiSeats.map((s) => name(s)).join(', ')}`
						: 'Exhaustive draw — all noten';
				push('draw_end', label, {
					type: 'draw',
					abortive: e.abortive ?? null,
					tenpaiNames: e.tenpaiSeats.map((s) => name(s))
				});
				break;
			}
			case 'game_end':
				// Final scores already reflected by the last win/draw; nothing to render.
				break;
		}
	}

	return steps;
}
