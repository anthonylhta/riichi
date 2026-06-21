// Curated Hand-of-the-Day puzzles.
//
// This is the source of truth for the daily puzzle: a hand-authored, version-
// controlled pool. The *correct answer* (best discard, shanten, ukeire) is still
// derived deterministically from mahjong-tile-efficiency at read time (see
// ./efficiency + ./handOfTheDay), so authors only supply the hand, the situation
// (winds + dora indicator), and the teaching note — never the answer.
//
// Replaces the Claude-generated daily puzzle (old ADRs 0028/0034/0035/0036): the
// API only ever invented the hand and wrote the prose; the answer always came from
// the lib. Curating the pool gives a deliberate difficulty curriculum, removes the
// API cost / cold-start latency / dedup machinery, and makes every puzzle
// reviewable in a PR. See `npm run puzzles:check` (scripts/puzzlesCheck.ts) to
// print each hand's lib-derived answer while authoring, and puzzles.test.ts which
// fails CI on any malformed or non-instructive hand.
//
// To add a puzzle: append to PUZZLES. `hand` is 14 space-separated tiles in
// standard notation — 1m..9m / 1p..9p / 1s..9s / 1z..7z (1z=East 2z=South 3z=West
// 4z=North, 5z=White 6z=Green 7z=Red dragon). Write the explanation against the
// derived best discard (run puzzles:check first). Order is the curriculum order.

export interface AuthoredPuzzle {
	/** 14 tiles, space-separated standard notation, e.g. "2m 3m 4m ... 1z". */
	hand: string;
	/** Player's seat wind, "1z".."4z". */
	seatWind: string;
	/** Round wind, "1z".."4z" (usually "1z" = East). */
	roundWind: string;
	/** Dora indicator tile. */
	doraIndicator: string;
	/** 2–4 sentence teaching note, written against the lib-derived best discard. */
	explanation: string;
}

// Today's puzzle is PUZZLES[daysSince(PUZZLE_EPOCH) mod PUZZLES.length] — a
// sequential curriculum that wraps when exhausted, so every visitor shares the
// same puzzle on a given Sydney calendar day and the order is the authored order.
export const PUZZLE_EPOCH = '2026-06-21';

export const PUZZLES: AuthoredPuzzle[] = [
	{
		// Lone honor → clean tenpai. Best: 1z. (tenpai, accepts 5p/8p, 8 tiles)
		hand: '2m 3m 4m 5m 6m 7m 2p 3p 4p 6p 7p 8s 8s 1z',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '5p',
		explanation:
			'Discard 1z (East). Three runs are already set — 234m, 567m, 234p — alongside the 8s pair and a 6p7p ryanmen, so dropping the lone East is tenpai on 5p/8p (8 tiles). East is the round wind and would score a han as a pair, but a single copy can never justify passing up an immediate two-sided tenpai.'
	},
	{
		// Isolated terminal → tenpai, with the kanchan trap. Best: 9s. (accepts 2s/5s)
		hand: '1m 1m 1m 2m 3m 4m 5p 6p 7p 3s 4s 7s 7s 9s',
		seatWind: '4z',
		roundWind: '1z',
		doraIndicator: '2s',
		explanation:
			'Discard 9s. You already hold three sets — 111m, 234m, 567p — the 7s pair, and a 3s4s ryanmen, so cutting the lone 9s is tenpai on 2s/5s (8 tiles). The 9s only attaches as a weak 7s9s kanchan, and taking that would mean breaking your pair for a strictly worse wait.'
	},
	{
		// Isolated terminal, keep two ryanmen for width. Best: 9s. (37 tiles)
		hand: '2m 3m 4m 5m 6m 2p 3p 4p 6p 7p 8p 4s 5s 9s',
		seatWind: '1z',
		roundWind: '1z',
		doraIndicator: '8m',
		explanation:
			"Discard 9s. It's an isolated terminal doing nothing, while the rest is all live shape: three sets (234m, 234p, 678p) plus the 5m6m and 4s5s ryanmen. Cutting it leaves a 1-shanten with an enormous acceptance — 1m–7m and 3s–6s, 37 tiles — to reach tenpai. Never break a two-sided shape when a dead tile is already in your hand."
	},
	{
		// Trim the spare end of a 4-tile run, keep both pin shapes. Best: 5s/8s. (24)
		hand: '2m 3m 4m 6m 7m 8m 2p 4p 6p 7p 5s 6s 7s 8s',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '1m',
		explanation:
			'Discard 5s (or 8s — the ends are equivalent). 5s6s7s8s only needs to be one run, so an end tile is spare; cutting it keeps both pin shapes, the 2p4p kanchan and the 6p7p ryanmen, for a 1-shanten that accepts a huge 2p–8p (24 tiles). Breaking a pin shape instead would throw away most of that width.'
	},
	{
		// Ryanmen over penchan. Best: 8p/9p. (drop the penchan, accept 4p/7p,3s/6s)
		hand: '1m 1m 2m 3m 4m 6m 7m 8m 5p 6p 8p 9p 4s 5s',
		seatWind: '4z',
		roundWind: '1z',
		doraIndicator: '3m',
		explanation:
			'Discard 9p (or 8p). You hold six blocks — the 1m pair, two sets (234m, 678m), and three partials (5p6p, 8p9p, 4s5s) — one too many. The 8p9p penchan only fills on 7p, which your 5p6p ryanmen already accepts, so it is pure redundancy: dropping it leaves the pair, two sets, and two ryanmen taking 4p/7p and 3s/6s (16 tiles). Shed the penchan before a ryanmen.'
	},
	{
		// Too many blocks: fold the redundant pair into a run. Best: 3p. (28 tiles)
		hand: '3m 4m 5m 7m 8m 9m 3p 3p 4p 5p 7p 8p 2s 3s',
		seatWind: '1z',
		roundWind: '1z',
		doraIndicator: '6m',
		explanation:
			'Discard 3p. You are holding six blocks — two sets (345m, 789m), the 3p pair, and three ryanmen (4p5p, 7p8p, 2s3s) — one more than a hand can use. Discarding a 3p collapses the redundant pair into a 3p4p5p run, leaving three sets and two ryanmen; the resulting 1-shanten still accepts a very wide 6p–9p and 1s–4s (28 tiles).'
	},
	{
		// Hidden three-sided wait inside a run of five. Best: 8p. (1p/4p/7p, 11)
		hand: '2m 3m 4m 6m 7m 8m 2p 3p 4p 5p 6p 8p 5s 5s',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '9p',
		explanation:
			'Discard 8p. It looks like it pairs up with 6p, but cutting it turns 2p3p4p5p6p into a five-tile run with a hidden three-sided wait — 1p, 4p, and 7p (11 tiles) — and you are already tenpai. Keeping 8p and breaking the pin run would leave only a single-sided kanchan. Learn to spot the multi-sided wait inside a run of five.'
	}
];
