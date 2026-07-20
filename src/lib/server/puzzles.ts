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
// reviewable in a PR. Run `npm run puzzles:check` to print each hand's lib-derived
// answer while authoring, and puzzles.test.ts fails CI on any malformed or
// non-instructive hand (incl. a hand that's already a winning hand).
//
// To add a puzzle: append to PUZZLES. `hand` is 14 space-separated tiles in
// standard notation — 1m..9m / 1p..9p / 1s..9s / 1z..7z (1z=East 2z=South 3z=West
// 4z=North, 5z=White 6z=Green 7z=Red dragon). Write the explanation against the
// derived best discard (run puzzles:check first). Order is the curriculum order.
//
// `doraIndicator` is decorative — nothing derives from it — but pick one whose
// dora lands on a tile the hand KEEPS. The answer is pure efficiency and knows
// nothing about tile value, so an indicator pointing at the best discard asks the
// player to throw the dora away and teaches against itself. puzzles.test.ts
// enforces this.

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
	},
	{
		// Lone dragon → tenpai. Best: 5z. (6p/9p, 8)
		hand: '3m 4m 5m 6m 7m 8m 3p 4p 5p 7p 8p 2s 2s 5z',
		seatWind: '1z',
		roundWind: '1z',
		doraIndicator: '3p',
		explanation:
			'Discard 5z (White dragon). The hand is already three runs — 345m, 678m, 345p — plus the 2s pair and a 7p8p ryanmen, so dropping the lone dragon is tenpai on 6p/9p (8 tiles). A single honor with no pair behind it is the textbook cut into a ready hand.'
	},
	{
		// Floater drop reveals a 3-sided run wait. Best: 1z. (4p/7p,3s/6s — wide)
		hand: '2m 3m 4m 6m 7m 8m 1p 2p 3p 5p 6p 4s 5s 9s',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '7p',
		explanation:
			'Discard 9s. Three runs (234m, 678m, 123p) plus two ryanmen — 5p6p and 4s5s — leave the 9s as pure overflow. Cutting it gives a 1-shanten with no fixed pair but a big acceptance (4p–7p, 3s–6s; 28 tiles); whichever ryanmen fills first, the other supplies the pair. Don’t break a ryanmen when a lone terminal is sitting there.'
	},
	{
		// Lone wind → 3-sided tenpai inside the pin run. Best: 3z. (3p/6p/9p, 11)
		hand: '2m 3m 4m 5m 6m 7m 4p 5p 6p 7p 8p 6s 6s 3z',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '2p',
		explanation:
			'Discard 3z (West). Cutting the lone wind leaves 234m, 567m, the 6s pair, and the run 4p5p6p7p8p — a five-tile shape with a three-sided wait on 3p/6p/9p (11 tiles). An isolated honor never competes with a tenpai this wide.'
	},
	{
		// Penchan drop reveals the wider pin run. Best: 8p/9p. (1p/4p/7p,3s/6s — 19)
		hand: '3m 3m 5m 6m 7m 2p 3p 4p 5p 6p 8p 9p 4s 5s',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '2m',
		explanation:
			'Discard 9p (or 8p). The 8p9p is a penchan that only fills on 7p — and your pins already form 2p3p4p5p6p, a run that accepts 1p/4p/7p on its own. Dropping the penchan leaves the 3m pair, 567m, that wide pin run, and a 4s5s ryanmen: a 1-shanten taking 1p/4p/7p and 3s/6s (19 tiles). The penchan was adding nothing the run did not already cover.'
	},
	{
		// Fold the duplicate into a run (headless, wide). Best: 5p. (1s–7s, 24)
		hand: '2m 3m 4m 6m 7m 8m 5p 5p 6p 7p 2s 3s 5s 6s',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '1s',
		explanation:
			'Discard 5p. The 5p5p6p7p reads like a pair plus a ryanmen, but it is more efficient as the run 5p6p7p with a spare 5p. Folding the duplicate in leaves 234m, 678m, that pin run, and the 2s3s / 5s6s ryanmen — a 1-shanten accepting nearly the whole sou suit (1s–7s; 24 tiles).'
	},
	{
		// Isolated terminal → tenpai. Best: 9p. (2s/5s, 8)
		hand: '1m 1m 2m 3m 4m 5m 6m 7m 5p 6p 7p 3s 4s 9p',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '5s',
		explanation:
			'Discard 9p. With 1m as the pair, 234m and 567m as runs, 567p complete, and a 3s4s ryanmen, the lone 9p is the only idle tile — cutting it is tenpai on 2s/5s (8 tiles). An isolated terminal is almost always the discard when everything else is working.'
	},
	{
		// Floater drop → very wide headless 1-shanten. Best: 1s. (1p–6p,5s–8s; 33)
		hand: '3m 4m 5m 7m 8m 9m 2p 3p 4p 4p 5p 6s 7s 1s',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '5p',
		explanation:
			'Discard 1s. You have 345m, 789m and 234p done, a 4p5p ryanmen, a 6s7s ryanmen, and the stray 1s. Letting the terminal go keeps both two-sided shapes for a very wide 1-shanten (1p–6p, 5s–8s; 33 tiles).'
	},
	{
		// Lone wind → 3-sided tenpai. Best: 7z. (1p/4p/7p, 11)
		hand: '2m 3m 4m 7m 8m 9m 2p 3p 4p 5p 6p 5s 5s 7z',
		seatWind: '4z',
		roundWind: '1z',
		doraIndicator: '1p',
		explanation:
			'Discard 7z (Red dragon). That leaves 234m, 789m, the 5s pair, and 2p3p4p5p6p — a five-tile run waiting three ways on 1p/4p/7p (11 tiles). The lone dragon can’t compete with an eleven-tile tenpai.'
	},
	{
		// Clean penchan drop. Best: 8p/9p. (4p/7p,2s/5s, 16)
		hand: '2m 2m 4m 5m 6m 7m 8m 9m 8p 9p 5p 6p 3s 4s',
		seatWind: '1z',
		roundWind: '1z',
		doraIndicator: '1m',
		explanation:
			'Discard 9p (or 8p). With the 2m pair, 456m and 789m complete, and ryanmen at 5p6p and 3s4s, the 8p9p penchan is the weakest block — it only reaches on 7p, already covered by 5p6p. Drop it for a clean 1-shanten on 4p/7p and 2s/5s (16 tiles).'
	},
	{
		// Fold the duplicate into a run. Best: 7p. (1s–7s, 24)
		hand: '3m 4m 5m 7m 8m 9m 7p 7p 8p 9p 2s 3s 5s 6s',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '2m',
		explanation:
			'Discard 7p. The 7p7p8p9p is better read as the run 7p8p9p with an extra 7p than as a pair plus a penchan. Dropping the spare leaves 345m, 789m, 789p, and the 2s3s / 5s6s ryanmen — a 1-shanten taking 1s–7s (24 tiles).'
	},
	{
		// Lone wind → tenpai. Best: 4z. (5s/8s, 8)
		hand: '3m 4m 5m 5p 6p 7p 2s 3s 4s 9m 9m 6s 7s 4z',
		seatWind: '1z',
		roundWind: '1z',
		doraIndicator: '8m',
		explanation:
			'Discard 4z (North). The hand has three runs — 345m, 567p, 234s — the 9m pair, and a 6s7s ryanmen, so the lone North is dead weight: drop it and you are tenpai on 5s/8s (8 tiles).'
	},
	{
		// Floater drop → very wide headless 1-shanten. Best: 1z. (2p–8p,2s–5s; 37)
		hand: '1m 2m 3m 5m 6m 7m 3p 4p 5p 6p 7p 3s 4s 1z',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '2s',
		explanation:
			'Discard 1z (East). That leaves 123m, 567m, the run 3p4p5p6p7p, and a 3s4s ryanmen — a 1-shanten accepting a huge spread (2p–8p, 2s–5s; 37 tiles). The lone wind can’t compete with the widest shape on the board.'
	},
	{
		// Floater drop reveals a 3-sided run wait. Best: 9s. (1p/4p/7p, 11)
		hand: '2m 3m 4m 6m 7m 8m 4s 4s 2p 3p 4p 5p 6p 9s',
		seatWind: '1z',
		roundWind: '1z',
		doraIndicator: '1p',
		explanation:
			'Discard 9s. Cutting the lone terminal leaves 234m, 678m, the 4s pair, and the run 2p3p4p5p6p — already tenpai with a three-sided wait on 1p/4p/7p (11 tiles). The five-tile run is doing all the work; the 9s is just noise.'
	},
	{
		// Drop the penchan terminal, keep the backup. Best: 1p. (wide, 25)
		hand: '7s 7s 2m 3m 4m 6m 7m 8m 1p 2p 4p 5p 6s 7s',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '3p',
		explanation:
			'Discard 1p. The 1p2p penchan can only become a set on 3p, which your 4p5p ryanmen already accepts — so the 1p terminal is the redundant tile. Releasing it keeps the 7s pair, two runs (234m, 678m), and the 4p5p / 6s7s ryanmen for a wide 1-shanten (25 tiles).'
	},
	{
		// Isolated terminal → tenpai. Best: 1p. (5s/8s, 8)
		hand: '2m 2m 3m 4m 5m 7m 8m 9m 3p 4p 5p 6s 7s 1p',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '4s',
		explanation:
			'Discard 1p. You hold the 2m pair, runs 345m, 789m and 345p, and a 6s7s ryanmen — the isolated 1p is the only loose tile. Cutting it is tenpai on 5s/8s (8 tiles).'
	},
	{
		// Lone dragon → headless wide 1-shanten. Best: 6z. (3p–6p,1s–4s; 28)
		hand: '2m 3m 4m 6m 7m 8m 7p 8p 9p 4p 5p 2s 3s 6z',
		seatWind: '4z',
		roundWind: '1z',
		doraIndicator: '5p',
		explanation:
			'Discard 6z (Green dragon). Three runs (234m, 678m, 789p) plus the 4p5p and 2s3s ryanmen make the lone dragon the obvious cut, leaving a wide 1-shanten (3p–6p, 1s–4s; 28 tiles).'
	},
	{
		// Floater drop reveals a 3-sided run wait. Best: 1p. (3s/6s/9s, 11)
		hand: '3m 4m 5m 7m 8m 9m 2p 2p 4s 5s 6s 7s 8s 1p',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '3s',
		explanation:
			'Discard 1p. That leaves 345m, 789m, the 2p pair, and 4s5s6s7s8s — a five-tile run waiting three ways on 3s/6s/9s (11 tiles). Spot the multi-sided wait and let the isolated 1p go.'
	},
	{
		// Lone wind → tenpai. Best: 1z. (3s/6s, 8)
		hand: '2m 3m 4m 6m 7m 8m 3p 4p 5p 4s 5s 9m 9m 1z',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '6m',
		explanation:
			'Discard 1z (East). Three runs (234m, 678m, 345p), the 9m pair, and a 4s5s ryanmen are already set; the lone East is the cut, leaving tenpai on 3s/6s (8 tiles). Even a yakuhai wind isn’t worth keeping as a single tile over a made hand.'
	},
	{
		// Floater drop → headless wide 1-shanten. Best: 1z. (6p–9p,4s–7s; 28)
		hand: '2m 3m 4m 5m 6m 7m 3p 4p 5p 7p 8p 5s 6s 1z',
		seatWind: '4z',
		roundWind: '1z',
		doraIndicator: '9p',
		explanation:
			'Discard 1z (East). That leaves 234m, 567m, 345p, a 7p8p ryanmen, and a 5s6s ryanmen — a 1-shanten with no set pair but a wide acceptance (6p–9p, 4s–7s; 28 tiles). The lone wind is the easy release.'
	},
	{
		// Floater drop reveals a 3-sided run wait. Best: 9s. (2p/5p/8p, 11)
		hand: '1m 1m 3m 4m 5m 7m 8m 9m 3p 4p 5p 6p 7p 9s',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '2p',
		explanation:
			'Discard 9s. With 1m as the pair and 345m, 789m set, the run 3p4p5p6p7p gives a three-sided tenpai on 2p/5p/8p (11 tiles). The lone 9s can’t improve on that.'
	},
	{
		// Isolated terminal → tenpai. Best: 9s. (4s/7s, 8)
		hand: '1m 2m 3m 4m 5m 6m 7p 8p 9p 5s 6s 2p 2p 9s',
		seatWind: '4z',
		roundWind: '1z',
		doraIndicator: '5p',
		explanation:
			'Discard 9s. With 123m, 456m and 789p complete, the 2p pair set, and a 5s6s ryanmen, the lone 9s does nothing — drop it for tenpai on 4s/7s (8 tiles).'
	},
	{
		// Floater drop reveals a 3-sided run wait. Best: 9p. (1s/4s/7s, 11)
		hand: '5m 5m 2m 3m 4m 6m 7m 8m 2s 3s 4s 5s 6s 9p',
		seatWind: '1z',
		roundWind: '1z',
		doraIndicator: '1s',
		explanation:
			'Discard 9p. The 5m pair with 234m and 678m, plus the run 2s3s4s5s6s, is a three-sided tenpai on 1s/4s/7s (11 tiles). Drop the stray 9p and take the wide wait.'
	},
	{
		// Penchan drop, keep two ryanmen. Best: 1p/2p. (3p/6p,5s/8s, 16)
		hand: '3m 3m 4m 5m 6m 7m 8m 9m 1p 2p 4p 5p 6s 7s',
		seatWind: '1z',
		roundWind: '1z',
		doraIndicator: '5p',
		explanation:
			'Discard 1p (or 2p). The 1p2p penchan reaches only on 3p, which your 4p5p ryanmen already covers, so it is the redundant block. Dropping it leaves the 3m pair, 456m, 789m, and the 4p5p / 6s7s ryanmen — a 1-shanten on 3p/6p and 5s/8s (16 tiles).'
	},
	{
		// Penchan drop, keep two ryanmen. Best: 8s/9s. (2p/5p,4s/7s, 16)
		hand: '9p 9p 2m 3m 4m 5m 6m 7m 8s 9s 5s 6s 3p 4p',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '8p',
		explanation:
			'Discard 9s (or 8s). The 8s9s penchan only fills on 7s, already accepted by your 5s6s ryanmen, so it adds nothing. Cut it to keep the 9p pair, 234m, 567m, and the 3p4p / 5s6s ryanmen — a clean 1-shanten on 2p/5p and 4s/7s (16 tiles).'
	},
	{
		// Fold the duplicate into a run (headless, wide). Best: 4p. (1s–4s,6s–9s; 28)
		hand: '1m 2m 3m 5m 6m 7m 4p 4p 5p 6p 7s 8s 2s 3s',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '6p',
		explanation:
			'Discard 4p. The 4p4p5p6p is more efficient as the run 4p5p6p with a spare 4p than as a pair plus a ryanmen. Folding the duplicate in leaves 123m, 567m, that pin run, and the 2s3s / 7s8s ryanmen — a 1-shanten accepting almost the whole sou suit (1s–4s, 6s–9s; 28 tiles).'
	},
	{
		// Floater drop reveals a 3-sided run wait. Best: 2s. (3p/6p/9p, 11)
		hand: '1m 1m 4m 5m 6m 7m 8m 9m 4p 5p 6p 7p 8p 2s',
		seatWind: '1z',
		roundWind: '1z',
		doraIndicator: '3p',
		explanation:
			'Discard 2s. With 1m as the pair and 456m, 789m set, the run 4p5p6p7p8p is a three-sided tenpai on 3p/6p/9p (11 tiles). The lone 2s is just a floater — take the wide wait.'
	},
	{
		// Floater drop → headless wide 1-shanten. Best: 9p. (2p–5p,5s–8s; 28)
		hand: '1m 2m 3m 4m 5m 6m 7m 8m 9m 3p 4p 6s 7s 9p',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '2p',
		explanation:
			'Discard 9p. Three runs are complete (123m, 456m, 789m), leaving the 3p4p and 6s7s ryanmen and a lone 9p. Drop the terminal for a 1-shanten with wide acceptance (2p–5p, 5s–8s; 28 tiles) — whichever ryanmen completes first becomes the wait, the other the pair.'
	},
	{
		// Isolated terminal, keep two ryanmen. Best: 1m. (5p–8p,6s–9s; 28)
		hand: '4m 5m 6m 7m 8m 9m 2p 3p 4p 6p 7p 7s 8s 1m',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '5s',
		explanation:
			'Discard 1m. It is an isolated terminal, while 456m, 789m and 234p are done and 6p7p, 7s8s are both ryanmen. Cutting it keeps both two-sided shapes for a wide 1-shanten (5p–8p, 6s–9s; 28 tiles).'
	},
	{
		// Penchan drop, keep two ryanmen. Best: 1s/2s. (3p/6p,3s/6s, 16)
		hand: '9m 9m 2m 3m 4m 5m 6m 7m 1s 2s 4s 5s 4p 5p',
		seatWind: '4z',
		roundWind: '1z',
		doraIndicator: '6p',
		explanation:
			'Discard 1s (or 2s). The 1s2s penchan only reaches on 3s, which your 4s5s ryanmen already accepts. Drop it to keep the 9m pair, 234m, 567m, and the 4p5p / 4s5s ryanmen — a clean 1-shanten on 3p/6p and 3s/6s (16 tiles).'
	},
	{
		// Floater drop reveals a 3-sided run wait. Best: 1m. (2p/5p/8p, 11)
		hand: '4s 4s 3m 4m 5m 7m 8m 9m 3p 4p 5p 6p 7p 1m',
		seatWind: '1z',
		roundWind: '1z',
		doraIndicator: '8p',
		explanation:
			'Discard 1m. The lone terminal aside, you hold 345m, 789m, the 4s pair, and the run 3p4p5p6p7p — a three-sided tenpai on 2p/5p/8p (11 tiles). Let the 1m go and take the wide wait.'
	}
];
