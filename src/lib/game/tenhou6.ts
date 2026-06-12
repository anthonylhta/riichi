// tenhou.net/6 export — maps the engine's GameEvent record (events.ts) to the
// compact JSON archive format of tenhou.net's log viewer, which is also the
// custom-log input of the Mortal review site (mjai.ekyu.moe) and the
// mjai-reviewer CLI (raw MJAI is NOT accepted there — verified 2026-06-11).
// Player flow: download → paste into mjai.ekyu.moe as a custom log → seat 0.
//
// Format ground truth is mjai-reviewer's parser (convlog/src/tenhou/). The
// salient rules:
//   - tiles: 11–19 man, 21–29 pin, 31–39 sou, 41–47 honors, red fives 51/52/53
//   - each kyoku is a tuple array: [ [kyoku,honba,kyotaku], [scores], [dora
//     indicators], [ura indicators], then haipai/takes/discards for each of the
//     four seats, results ]
//   - chi/pon/daiminkan call strings go in TAKES (a daiminkan leaves a literal
//     0 placeholder in discards); ankan/kakan strings go in DISCARDS. The
//     marker letter's position inside the string encodes which seat the tile
//     came from (start = kamicha, middle = toimen, end = shimocha).
//   - 60 = tsumogiri; an "r"-prefixed discard is the riichi declaration
//   - results: ["和了", deltas, [winner, target, winner, score-text, ...yaku]]
//     or ["流局", deltas]. The parser reads only winner/target; the score text
//     and yaku strings are for human readers.

import type { GameTile } from './tiles';
import type { GameEvent, Scores } from './events';
import type { Seat } from './types';
import { DEFAULT_NAMES } from './mjai';

export function tileToTenhou(t: GameTile): number {
	if (t.isRed) {
		if (t.code === 5) return 51;
		if (t.code === 14) return 52;
		if (t.code === 23) return 53;
	}
	if (t.code <= 9) return 10 + t.code; // 1m–9m → 11–19
	if (t.code <= 18) return 11 + t.code; // 1p–9p → 21–29
	if (t.code <= 27) return 12 + t.code; // 1s–9s → 31–39
	return 13 + t.code; // E S W N haku hatsu chun → 41–47
}

// A take/discard list entry: a tile number, 60 (tsumogiri), 0 (the daiminkan
// placeholder), or a call/riichi string.
export type Tenhou6Action = number | string;

export interface Tenhou6Log {
	log: unknown[][];
	name: string[];
	rule: { disp: string; aka: number };
}

// Relative seat of `from` as seen by `actor`: 3 = kamicha, 2 = toimen,
// 1 = shimocha (the same encoding the marker positions express).
function relSeat(actor: Seat, from: Seat): 1 | 2 | 3 {
	return ((from - actor + 4) % 4) as 1 | 2 | 3;
}

function chiString(called: number, c: number[]): string {
	return `c${called}${c[0]}${c[1]}`;
}

function ponString(called: number, c: number[], rel: 1 | 2 | 3): string {
	if (rel === 3) return `p${called}${c[0]}${c[1]}`;
	if (rel === 2) return `${c[0]}p${called}${c[1]}`;
	return `${c[0]}${c[1]}p${called}`;
}

function daiminkanString(called: number, c: number[], rel: 1 | 2 | 3): string {
	if (rel === 3) return `m${called}${c[0]}${c[1]}${c[2]}`;
	if (rel === 2) return `${c[0]}m${called}${c[1]}${c[2]}`;
	return `${c[0]}${c[1]}${c[2]}m${called}`;
}

// The 'k' marker sits where the original pon's marker sat. Note the parser
// only accepts 'k' at index 0/2/4, so the shimocha form differs from the
// daiminkan layout (the added tile is inserted, not appended).
function kakanString(added: number, c: number[], rel: 1 | 2 | 3): string {
	if (rel === 3) return `k${added}${c[0]}${c[1]}${c[2]}`;
	if (rel === 2) return `${c[0]}k${added}${c[1]}${c[2]}`;
	return `${c[0]}${c[1]}k${added}${c[2]}`;
}

interface KyokuAcc {
	meta: [number, number, number];
	scores: Scores;
	dora: number[];
	ura: number[];
	haipai: [number[], number[], number[], number[]];
	takes: [Tenhou6Action[], Tenhou6Action[], Tenhou6Action[], Tenhou6Action[]];
	discards: [Tenhou6Action[], Tenhou6Action[], Tenhou6Action[], Tenhou6Action[]];
	results: unknown[];
	// How many dora indicators the convlog parser will consume for this kyoku
	// (1 initial + 1 per kan once its reveal point is reached). Our engine
	// leaves a minkan's indicator face-down when the post-kan discard is ronned
	// (ADR 0049), but the parser consumes one at that discard regardless — so
	// the dora array is padded up to this count before the kyoku is closed.
	doraNeeded: number;
	pendingMinkan: [number, number, number, number];
}

export function toTenhou6(events: GameEvent[], names: string[] = DEFAULT_NAMES): Tenhou6Log {
	const log: unknown[][] = [];
	let k: KyokuAcc | null = null;

	// The last tile drawn and not yet acted on, per seat — a discard is
	// tsumogiri (60) when it is exactly that tile. Same tracking as mjai.ts.
	const lastDrawn: (GameTile | null)[] = [null, null, null, null];

	// Where each seat's pon of a given tile code was called from — the kakan
	// string's marker position must repeat the original pon's source.
	const ponFrom = new Map<string, Seat>();

	const closeKyoku = (acc: KyokuAcc) => {
		while (acc.dora.length < acc.doraNeeded) {
			acc.dora.push(acc.dora[acc.dora.length - 1]);
		}
		log.push([
			acc.meta,
			acc.scores,
			acc.dora,
			acc.ura,
			acc.haipai[0],
			acc.takes[0],
			acc.discards[0],
			acc.haipai[1],
			acc.takes[1],
			acc.discards[1],
			acc.haipai[2],
			acc.takes[2],
			acc.discards[2],
			acc.haipai[3],
			acc.takes[3],
			acc.discards[3],
			acc.results
		]);
	};

	for (const ev of events) {
		switch (ev.type) {
			case 'round_start': {
				lastDrawn.fill(null);
				ponFrom.clear();
				k = {
					// rounds 1–8 → kyoku_num 0–7 (East 1–4, South 1–4); the dealer is
					// kyoku_num % 4 by construction (the deal starts at seat 0 and
					// passes in seat order whenever the round number advances).
					meta: [ev.round - 1, ev.honba, ev.riichiBets],
					scores: ev.scores,
					dora: [tileToTenhou(ev.doraIndicator)],
					ura: [],
					haipai: ev.hands.map((h) => h.map(tileToTenhou)) as KyokuAcc['haipai'],
					takes: [[], [], [], []],
					discards: [[], [], [], []],
					results: [],
					doraNeeded: 1,
					pendingMinkan: [0, 0, 0, 0]
				};
				break;
			}
			case 'draw': {
				if (!k) break;
				lastDrawn[ev.seat] = ev.tile;
				k.takes[ev.seat].push(tileToTenhou(ev.tile));
				break;
			}
			case 'discard': {
				if (!k) break;
				const num = tileToTenhou(ev.tile);
				const tsumogiri = lastDrawn[ev.seat]?.id === ev.tile.id;
				k.discards[ev.seat].push(ev.riichi ? `r${tsumogiri ? 60 : num}` : tsumogiri ? 60 : num);
				lastDrawn[ev.seat] = null;
				k.doraNeeded += k.pendingMinkan[ev.seat];
				k.pendingMinkan[ev.seat] = 0;
				break;
			}
			case 'call': {
				if (!k) break;
				const called = tileToTenhou(ev.tile);
				const consumed = ev.consumed.map(tileToTenhou);
				const rel = relSeat(ev.seat, ev.from);
				if (ev.call === 'chi') {
					k.takes[ev.seat].push(chiString(called, consumed));
				} else if (ev.call === 'pon') {
					ponFrom.set(`${ev.seat}:${ev.tile.code}`, ev.from);
					k.takes[ev.seat].push(ponString(called, consumed, rel));
				} else {
					// daiminkan: the call is a take; its discard slot is a literal 0
					// (the rinshan draw + real discard follow as the next pair).
					k.takes[ev.seat].push(daiminkanString(called, consumed, rel));
					k.discards[ev.seat].push(0);
					k.pendingMinkan[ev.seat]++;
				}
				lastDrawn[ev.seat] = null;
				break;
			}
			case 'ankan': {
				if (!k) break;
				const c = ev.consumed.map(tileToTenhou);
				k.discards[ev.seat].push(`${c[0]}${c[1]}${c[2]}a${c[3]}`);
				lastDrawn[ev.seat] = null;
				// The parser flips an ankan's indicator immediately, and any of this
				// seat's still-pending minkan indicators at the same point.
				k.doraNeeded += 1 + k.pendingMinkan[ev.seat];
				k.pendingMinkan[ev.seat] = 0;
				break;
			}
			case 'kakan': {
				if (!k) break;
				const from = ponFrom.get(`${ev.seat}:${ev.tile.code}`) ?? (((ev.seat + 3) % 4) as Seat);
				const rel = relSeat(ev.seat, from);
				k.discards[ev.seat].push(
					kakanString(tileToTenhou(ev.tile), ev.consumed.map(tileToTenhou), rel)
				);
				lastDrawn[ev.seat] = null;
				k.pendingMinkan[ev.seat]++;
				break;
			}
			case 'dora': {
				if (!k) break;
				k.dora.push(tileToTenhou(ev.indicator));
				break;
			}
			case 'win': {
				if (!k) break;
				k.ura = ev.uraIndicators.map(tileToTenhou);
				// Score text + yaku are display-only (the parser ignores them).
				const scoreText = `${ev.fu}符${ev.han}飜${ev.score}点`;
				const yaku = ev.yaku.map((y) => `${y.name}(${y.han}飜)`);
				k.results = ['和了', ev.deltas, [ev.seat, ev.from ?? ev.seat, ev.seat, scoreText, ...yaku]];
				closeKyoku(k);
				k = null;
				break;
			}
			case 'ryuukyoku': {
				if (!k) break;
				k.results = ['流局', ev.deltas];
				closeKyoku(k);
				k = null;
				break;
			}
			case 'game_end':
				break;
		}
	}

	// "East" marks the game as tonpuusen for the parser; aka > 0 marks red
	// fives in play (the tiles themselves carry it via 51/52/53).
	return { log, name: [...names], rule: { disp: 'East', aka: 1 } };
}

export function toTenhou6Json(events: GameEvent[], names?: string[]): string {
	return JSON.stringify(toTenhou6(events, names));
}
