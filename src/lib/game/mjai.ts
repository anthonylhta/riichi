// MJAI export — maps the engine's GameEvent record (events.ts) to the MJAI
// event protocol: newline-delimited JSON, one event per line, standard tile
// notation. MJAI is mahjong's closest thing to chess PGN — it's self-describing
// (no knowledge of this engine needed to read it) and it's the input format for
// ecosystem tools like the Mortal reviewer. We emit a full-information log
// (every seat's tiles visible), the same as Tenhou→MJAI conversions.
//
// The log reflects the game as our engine played it, including its known rule
// deviations (e.g. the riichi stick is paid even when the riichi tile is
// ronned, so reach_accepted is emitted before that hora).

import type { GameTile } from './tiles';
import type { GameEvent } from './events';
import type { Seat } from './types';

// MJAI tile notation: "1m".."9m" / "1p" / "1s" (red five "5mr"), honors
// E S W N (winds), P F C (white/green/red dragon).
const HONORS = ['E', 'S', 'W', 'N', 'P', 'F', 'C'];

export function tileToMjai(t: GameTile): string {
	const c = t.code;
	const red = t.isRed ? 'r' : '';
	if (c <= 9) return `${c}m${red}`;
	if (c <= 18) return `${c - 9}p${red}`;
	if (c <= 27) return `${c - 18}s${red}`;
	return HONORS[c - 28];
}

// Seat 3 is the 'good' AI, 1–2 are 'basic' (engine.ts makePlayer).
const DEFAULT_NAMES = ['You', 'AI (basic)', 'AI (basic)', 'AI (good)'];

export type MjaiEvent = Record<string, unknown>;

export function toMjaiEvents(events: GameEvent[], names: string[] = DEFAULT_NAMES): MjaiEvent[] {
	const out: MjaiEvent[] = [{ type: 'start_game', names }];

	// The last tile drawn and not yet acted on, per seat — a discard is
	// tsumogiri when it is exactly that tile. Cleared by the seat's own
	// discard and by any call the seat makes (post-call discards are from
	// the hand, never tsumogiri).
	const lastDrawn: (GameTile | null)[] = [null, null, null, null];

	// A riichi discard whose reach_accepted hasn't been emitted yet. Our engine
	// pays the stick at declaration unconditionally, so acceptance is emitted
	// before whatever happens next (even a ron on the riichi tile).
	let pendingReach: Seat | null = null;
	const flushReach = () => {
		if (pendingReach !== null) {
			out.push({ type: 'reach_accepted', actor: pendingReach });
			pendingReach = null;
		}
	};

	for (const ev of events) {
		switch (ev.type) {
			case 'round_start': {
				pendingReach = null;
				lastDrawn.fill(null);
				out.push({
					type: 'start_kyoku',
					bakaze: ev.round <= 4 ? 'E' : 'S',
					kyoku: ((ev.round - 1) % 4) + 1,
					honba: ev.honba,
					kyotaku: ev.riichiBets,
					oya: ev.dealer,
					dora_marker: tileToMjai(ev.doraIndicator),
					scores: ev.scores,
					tehais: ev.hands.map((h) => h.map(tileToMjai))
				});
				break;
			}
			case 'draw': {
				flushReach();
				lastDrawn[ev.seat] = ev.tile;
				out.push({ type: 'tsumo', actor: ev.seat, pai: tileToMjai(ev.tile) });
				break;
			}
			case 'discard': {
				flushReach();
				if (ev.riichi) out.push({ type: 'reach', actor: ev.seat });
				out.push({
					type: 'dahai',
					actor: ev.seat,
					pai: tileToMjai(ev.tile),
					tsumogiri: lastDrawn[ev.seat]?.id === ev.tile.id
				});
				lastDrawn[ev.seat] = null;
				if (ev.riichi) pendingReach = ev.seat;
				break;
			}
			case 'call': {
				flushReach();
				out.push({
					type: ev.call,
					actor: ev.seat,
					target: ev.from,
					pai: tileToMjai(ev.tile),
					consumed: ev.consumed.map(tileToMjai)
				});
				lastDrawn[ev.seat] = null;
				break;
			}
			case 'ankan': {
				flushReach();
				out.push({
					type: 'ankan',
					actor: ev.seat,
					consumed: ev.consumed.map(tileToMjai)
				});
				lastDrawn[ev.seat] = null;
				break;
			}
			case 'kakan': {
				flushReach();
				out.push({
					type: 'kakan',
					actor: ev.seat,
					pai: tileToMjai(ev.tile),
					consumed: ev.consumed.map(tileToMjai)
				});
				lastDrawn[ev.seat] = null;
				break;
			}
			case 'dora': {
				out.push({ type: 'dora', dora_marker: tileToMjai(ev.indicator) });
				break;
			}
			case 'win': {
				flushReach();
				out.push({
					type: 'hora',
					actor: ev.seat,
					// MJAI convention: target = the discarder on a ron, self on tsumo.
					target: ev.from ?? ev.seat,
					pai: ev.tile ? tileToMjai(ev.tile) : '?',
					deltas: ev.deltas,
					ura_markers: ev.uraIndicators.map(tileToMjai),
					// Beyond-spec but tolerated extras — they make the log readable
					// without a score table in hand.
					han: ev.han,
					fu: ev.fu,
					yaku: ev.yaku.map((y) => [y.name, y.han])
				});
				out.push({ type: 'end_kyoku' });
				break;
			}
			case 'ryuukyoku': {
				flushReach();
				out.push({
					type: 'ryukyoku',
					deltas: ev.deltas,
					tenpais: ([0, 1, 2, 3] as Seat[]).map((s) => ev.tenpaiSeats.includes(s))
				});
				out.push({ type: 'end_kyoku' });
				break;
			}
			case 'game_end': {
				out.push({ type: 'end_game', scores: ev.scores });
				break;
			}
		}
	}

	return out;
}

// One JSON object per line — the MJAI wire/log format.
export function toMjaiJsonl(events: GameEvent[], names?: string[]): string {
	return toMjaiEvents(events, names)
		.map((e) => JSON.stringify(e))
		.join('\n');
}
