// Tile-level review — the moment extractor. Walks the GameEvent record
// (events.ts) and pulls out every DEAL-IN: the exact discard of yours that got
// ronned, together with the decision state as you saw it at that instant.
// Pure and client-side (the events come from replaying the stored ReplayLog in
// the browser, the same way the exports work); only these flagged moments are
// sent to /api/tile-review for Claude's verdict — never the full game.
//
// Visible-only discipline (same as the in-round helper): the snapshot carries
// what a human player could see — rivers, melds, riichi declarations, dora,
// scores — never the opponents' concealed tiles. The advice must be "what you
// could have known", not hindsight.
//
// Grounding: `safeTiles` — which of your tiles were genbutsu against the
// winner at that moment — is computed HERE, mechanically, from the ordered
// events (the winner's own discards, plus every tile discarded by anyone after
// the winner's riichi that they passed on). Claude judges; it doesn't get to
// invent safety.

import type { TileCode } from './tiles';
import type { GameEvent } from './events';

export interface DealInMeld {
	type: string;
	tiles: TileCode[];
}

export interface DealInSeat {
	seat: number;
	isYou: boolean;
	isRiichi: boolean; // declared before your deal-in discard
	score: number; // start-of-round score, minus 1000 per declared riichi
	discards: TileCode[]; // their river as displayed (called tiles removed)
	melds: DealInMeld[];
}

export interface DealInWinner {
	seat: number;
	han: number;
	fu: number;
	score: number;
	yaku: { name: string; han: number }[];
}

export interface DealInMoment {
	round: number; // 1–8 (East 1–4, South 1–4)
	honba: number;
	turn: number; // this was your Nth discard of the round
	tilesLeft: number; // drawable live-wall tiles at the moment
	doraIndicators: TileCode[];
	hand: TileCode[]; // your concealed tiles BEFORE the discard (incl. the drawn tile)
	melds: DealInMeld[]; // your melds
	dealInTile: TileCode;
	// True when you were already locked in riichi, so the discard was a forced
	// tsumogiri — the reviewable decision was the riichi itself, not this tile.
	forcedByRiichi: boolean;
	safeTiles: TileCode[]; // tiles in `hand` that were genbutsu vs the winner
	winner: DealInWinner;
	seats: DealInSeat[];
}

// The live wall holds 70 drawable tiles after the deal; each normal draw takes
// one, and each kan takes one more off the tail (the rinshan draw's dead-wall
// replenishment — ADR 0042).
const DRAWABLE_AFTER_DEAL = 70;

const MAX_MOMENTS = 3;

export function dealInMoments(events: GameEvent[]): DealInMoment[] {
	const all: DealInMoment[] = [];

	// Per-round tracking, reset at every round_start.
	let round = 1;
	let honba = 0;
	let startScores: number[] = [25000, 25000, 25000, 25000];
	let dora: TileCode[] = [];
	let hand: { code: TileCode; id: number }[] = [];
	let rivers: TileCode[][] = [[], [], [], []];
	let melds: DealInMeld[][] = [[], [], [], []];
	let riichi: boolean[] = [false, false, false, false];
	let humanDiscards = 0;
	let drawsTaken = 0;
	// Everything that is genbutsu against each seat, were they to win: their own
	// discards, plus tiles anyone discarded after their riichi (they passed).
	let passedBy: Set<TileCode>[] = [new Set(), new Set(), new Set(), new Set()];
	// The decision snapshot of your latest discard, assembled eagerly so a win
	// event can just attach the winner. Cleared by any other human action so a
	// chankan (robbed kakan) never masquerades as a discard deal-in.
	let pending: Omit<DealInMoment, 'winner' | 'safeTiles'> | null = null;
	// Safety is judged at the DECISION, so the per-seat genbutsu intersection is
	// computed in the snapshot too — by win time, passedBy already (wrongly, for
	// this purpose) contains the deal-in tile itself.
	let pendingSafe: TileCode[][] = [[], [], [], []];

	for (const ev of events) {
		switch (ev.type) {
			case 'round_start': {
				round = ev.round;
				honba = ev.honba;
				startScores = [...ev.scores];
				dora = [ev.doraIndicator.code];
				hand = ev.hands[0].map((t) => ({ code: t.code, id: t.id }));
				rivers = [[], [], [], []];
				melds = [[], [], [], []];
				riichi = [false, false, false, false];
				humanDiscards = 0;
				drawsTaken = 0;
				passedBy = [new Set(), new Set(), new Set(), new Set()];
				pending = null;
				break;
			}
			case 'draw': {
				// Every draw — rinshan included — costs exactly one drawable tile
				// (a kan's wallEnd-1 plus its rinshan draw net out to one; ADR 0042).
				drawsTaken++;
				if (ev.seat === 0) hand.push({ code: ev.tile.code, id: ev.tile.id });
				pending = null;
				break;
			}
			case 'dora': {
				dora.push(ev.indicator.code);
				break;
			}
			case 'discard': {
				if (ev.seat === 0) {
					humanDiscards++;
					// Snapshot the decision BEFORE applying the discard. Forced when
					// already in riichi — the declaring discard itself is a choice.
					const handCodes = [...new Set(hand.map((t) => t.code))];
					pendingSafe = [0, 1, 2, 3].map((s) => handCodes.filter((c) => passedBy[s].has(c)));
					pending = {
						round,
						honba,
						turn: humanDiscards,
						tilesLeft: DRAWABLE_AFTER_DEAL - drawsTaken,
						doraIndicators: [...dora],
						hand: hand.map((t) => t.code),
						melds: melds[0].map((m) => ({ ...m, tiles: [...m.tiles] })),
						dealInTile: ev.tile.code,
						forcedByRiichi: riichi[0] && !ev.riichi,
						seats: [0, 1, 2, 3].map((s) => ({
							seat: s,
							isYou: s === 0,
							isRiichi: riichi[s],
							score: startScores[s] - (riichi[s] ? 1000 : 0),
							discards: [...rivers[s]],
							melds: melds[s].map((m) => ({ ...m, tiles: [...m.tiles] }))
						}))
					};
					hand = hand.filter((t) => t.id !== ev.tile.id);
				} else {
					pending = null;
				}
				if (ev.riichi) riichi[ev.seat] = true;
				rivers[ev.seat].push(ev.tile.code);
				// Every seat in riichi (other than the discarder) just passed on this
				// tile — it is permanently safe against them from now on.
				for (let s = 0; s < 4; s++) {
					if (s !== ev.seat && riichi[s]) passedBy[s].add(ev.tile.code);
				}
				passedBy[ev.seat].add(ev.tile.code);
				break;
			}
			case 'call': {
				// The called tile leaves the discarder's displayed river (it is still
				// genbutsu — the discard happened — so passedBy keeps it).
				rivers[ev.from].pop();
				const tiles = [...ev.consumed.map((t) => t.code), ev.tile.code];
				melds[ev.seat].push({ type: ev.call, tiles });
				if (ev.seat === 0) {
					const ids = new Set(ev.consumed.map((t) => t.id));
					hand = hand.filter((t) => !ids.has(t.id));
				}
				pending = null;
				break;
			}
			case 'ankan': {
				melds[ev.seat].push({ type: 'ankan', tiles: ev.consumed.map((t) => t.code) });
				if (ev.seat === 0) {
					const ids = new Set(ev.consumed.map((t) => t.id));
					hand = hand.filter((t) => !ids.has(t.id));
				}
				pending = null;
				break;
			}
			case 'kakan': {
				const meld = melds[ev.seat].find((m) => m.type === 'pon' && m.tiles[0] === ev.tile.code);
				if (meld) {
					meld.type = 'kakan';
					meld.tiles = [...meld.tiles, ev.tile.code];
				}
				if (ev.seat === 0) hand = hand.filter((t) => t.id !== ev.tile.id);
				pending = null;
				break;
			}
			case 'win': {
				// A deal-in: someone ronned YOUR tile, and the last thing you did was
				// discard it (a robbed kakan clears `pending` above).
				if (ev.from === 0 && ev.seat !== 0 && pending) {
					const w = ev.seat;
					all.push({
						...pending,
						safeTiles: pendingSafe[w],
						winner: {
							seat: w,
							han: ev.han,
							fu: ev.fu,
							score: ev.score,
							yaku: ev.yaku.map((y) => ({ ...y }))
						}
					});
				}
				pending = null;
				break;
			}
			case 'ryuukyoku':
			case 'game_end':
				break;
		}
	}

	// Cap the spend: keep the costliest deal-ins, presented in game order.
	return all
		.sort((a, b) => b.winner.score - a.winner.score)
		.slice(0, MAX_MOMENTS)
		.sort((a, b) => a.round - b.round || a.honba - b.honba);
}

// What the server returns, rendered under the matching round card.
export interface DealInVerdict {
	verdict: 'avoidable' | 'justified' | 'unlucky';
	advice: string;
}

export interface TileReviewResult {
	verdicts: DealInVerdict[]; // aligned with the posted moments
}

// One reviewed deal-in, exactly as the UI renders it — moment identity plus
// the verdict, merged server-side and cached on the games row (ADR 0055) so a
// revisit renders instantly and a re-click never re-pays.
export interface ReviewedDealIn {
	round: number;
	honba: number;
	dealInTile: TileCode;
	forcedByRiichi: boolean;
	verdict: DealInVerdict['verdict'];
	advice: string;
}

// Merge the flagged moments with Claude's verdicts into the render-ready,
// cacheable shape — keeping only the moment identity the card needs (round,
// honba, the dealt-in tile, whether it was a forced riichi tsumogiri) and
// dropping the heavy decision snapshot, which has already served its purpose
// in the prompt. The result is what gets stored on the games row and returned
// to the client. Indices align: verdicts[i] is the verdict for moments[i].
export function mergeReviewedDealIns(
	moments: DealInMoment[],
	result: TileReviewResult
): ReviewedDealIn[] {
	return moments.map((m, i) => ({
		round: m.round,
		honba: m.honba,
		dealInTile: m.dealInTile,
		forcedByRiichi: m.forcedByRiichi,
		verdict: result.verdicts[i].verdict,
		advice: result.verdicts[i].advice
	}));
}
