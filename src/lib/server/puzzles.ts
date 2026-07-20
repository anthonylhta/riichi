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
		doraIndicator: '7p',
		explanation:
			'Discard 9p (or 8p). The 8p9p is a penchan that only fills on 7p — and your pins already form 2p3p4p5p6p, a run that accepts 1p/4p/7p on its own. Dropping the penchan leaves the 3m pair, 567m, that wide pin run, and a 4s5s ryanmen: a 1-shanten taking 1p/4p/7p and 3s/6s (19 tiles). The penchan was adding nothing the run did not already cover.'
	},
	{
		// Fold the duplicate into a run (headless, wide). Best: 5p. (1s–7s, 24)
		hand: '2m 3m 4m 6m 7m 8m 5p 5p 6p 7p 2s 3s 5s 6s',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '4p',
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
		doraIndicator: '7p',
		explanation:
			'Discard 9p (or 8p). With the 2m pair, 456m and 789m complete, and ryanmen at 5p6p and 3s4s, the 8p9p penchan is the weakest block — it only reaches on 7p, already covered by 5p6p. Drop it for a clean 1-shanten on 4p/7p and 2s/5s (16 tiles).'
	},
	{
		// Fold the duplicate into a run. Best: 7p. (1s–7s, 24)
		hand: '3m 4m 5m 7m 8m 9m 7p 7p 8p 9p 2s 3s 5s 6s',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '6p',
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
		doraIndicator: '7s',
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
	},
	{
		// A good tile with no block to join. Best: 5m. (2s/5s, 8)
		hand: '1m 2m 3m 5m 9m 9m 4p 5p 6p 7p 8p 9p 3s 4s',
		seatWind: '1z',
		roundWind: '1z',
		doraIndicator: '2s',
		explanation:
			'Discard 5m. A lone 5 is normally the last tile you throw — it connects in more directions than any other — but here 123m, the 9m pair, 456p, 789p and the 3s4s ryanmen already fill all five blocks, so there is nowhere to put it. Cutting it is tenpai on 2s/5s (8 tiles). Tile quality only matters when the hand has room for the tile.'
	},
	{
		// Trim the spare end of a four-tile run into tenpai. Best: 4p/7p. (1s/4s, 8)
		hand: '1m 1m 3m 4m 5m 7m 8m 9m 4p 5p 6p 7p 2s 3s',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '4m',
		explanation:
			'Discard 7p (or 4p — the ends are interchangeable). 4p5p6p7p only ever needs to be one run, so one end is spare, and spending it takes you to tenpai: the 1m pair, 345m, 789m, a pin run, and the 2s3s ryanmen wait on 1s/4s (8 tiles). Cutting into the sou ryanmen instead would trade a two-sided wait for nothing.'
	},
	{
		// Nobetan: four-tile run is pair + two-sided wait. Best: 9m. (3s/6s, 6)
		hand: '2m 3m 4m 5m 6m 7m 9m 2p 3p 4p 3s 4s 5s 6s',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '4s',
		explanation:
			'Discard 9m. 3s4s5s6s is not a run plus a floater — it is a nobetan, a run and a pair rolled into one shape that is already tenpai on 3s and 6s (6 tiles), whichever end arrives becoming the pair. Cutting 3s or 6s instead leaves a lone 9m tanki on 3 tiles. Four consecutive tiles wait on both ends.'
	},
	{
		// Nobetan again, this time in man. Best: 1z. (4m/7m, 6)
		hand: '3p 4p 5p 6p 7p 8p 2s 3s 4s 4m 5m 6m 7m 1z',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '5m',
		explanation:
			'Discard 1z (East). With 345p, 678p and 234s complete, 4m5m6m7m is your last block — and as a nobetan it is a finished tenpai waiting 4m/7m (6 tiles). The lone East is the only tile outside the hand’s shape. Learn the nobetan on sight: it saves you from breaking it into "run plus junk".'
	},
	{
		// Sanmenchan, this time in the man suit. Best: 1z. (2m/5m/8m, 11)
		hand: '3m 4m 5m 6m 7m 2p 3p 4p 6p 7p 8p 4s 4s 1z',
		seatWind: '4z',
		roundWind: '1z',
		doraIndicator: '3s',
		explanation:
			'Discard 1z (East). Drop the lone wind and 3m4m5m6m7m becomes a five-tile run waiting three ways — 2m, 5m and 8m (11 tiles) — behind 234p, 678p and the 4s pair. The three-sided wait hides in any run of five: read the block, not the individual tiles.'
	},
	{
		// Pair + run + spare inside one pin block. Best: 2p/5p. (5s/8s, 8)
		hand: '2m 3m 4m 7m 8m 9m 1p 1p 2p 3p 4p 5p 6s 7s',
		seatWind: '1z',
		roundWind: '1z',
		doraIndicator: '8m',
		explanation:
			'Discard 5p (or 2p). 1p1p2p3p4p5p holds everything you need from the pin suit — the 1p pair as the head and one run — but it is six tiles doing a five-tile job, so the spare goes. That leaves 234m, 789m, the pin pair and run, and the 6s7s ryanmen: tenpai on 5s/8s (8 tiles).'
	},
	{
		// Lone honors go, honor PAIRS stay. Best: 1s. (3p/6p/9p, 11)
		hand: '2m 3m 4m 5m 6m 7m 4p 5p 6p 7p 8p 7z 7z 1s',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '6z',
		explanation:
			'Discard 1s. Every other puzzle says cut the honor — but a pair is not a lone tile: the two Red dragons are your head, and a yakuhai one at that. With 234m, 567m and 45678p already three-sided on 3p/6p/9p (11 tiles), the isolated 1s is the only tile not working. Lone honors go; honor pairs stay.'
	},
	{
		// Double East as the head. Best: 9s. (1p/4p/7p, 11)
		hand: '2m 3m 4m 5m 6m 7m 2p 3p 4p 5p 6p 1z 1z 9s',
		seatWind: '1z',
		roundWind: '1z',
		doraIndicator: '3m',
		explanation:
			'Discard 9s. The East pair is both your seat wind and the round wind, so it is a head that would be worth two han if it ever became a triplet — and it costs you nothing to keep, because 234m, 567m and 23456p already make a three-sided tenpai on 1p/4p/7p (11 tiles). The stray terminal is the free discard.'
	},
	{
		// An honor triplet is a finished set. Best: 9p. (2p–5p, 4s–7s; 28)
		hand: '2m 3m 4m 6m 7m 8m 5z 5z 5z 3p 4p 5s 6s 9p',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '7z',
		explanation:
			'Discard 9p. Three White dragons are not "honors to cut" — they are a completed set and a yaku by themselves, so the hand reads 234m, 678m, 555z, plus the 3p4p and 5s6s ryanmen. Only the lone 9p is idle; cutting it leaves a 1-shanten accepting 2p–5p and 4s–7s (28 tiles), with whichever ryanmen fills first supplying the pair.'
	},
	{
		// Cutting the terminal reveals a two-kanchan chain. Best: 1p. (3p/5p,6s/9s; 16)
		hand: '2m 3m 4m 6m 7m 8m 1p 2p 4p 6p 5s 5s 7s 8s',
		seatWind: '4z',
		roundWind: '1z',
		doraIndicator: '4s',
		explanation:
			'Discard 1p. 1p2p4p6p looks like a penchan with debris attached, but let the terminal go and what remains is 2p4p6p — two overlapping kanchan that accept both 3p and 5p. With 234m, 678m, the 5s pair and the 7s8s ryanmen, that is a 1-shanten on 3p/5p/6s/9s (16 tiles); cutting the 6p instead would leave the penchan reaching on 3p alone.'
	},
	{
		// A chain of kanchan can out-accept a ryanmen. Best: 6s. (2p/4p/6p/8p, 16)
		hand: '2m 3m 4m 6m 7m 8m 1p 3p 5p 7p 9p 4s 4s 6s',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '3s',
		explanation:
			'Discard 6s. 1p3p5p7p9p is four overlapping kanchan in a row: it accepts 2p, 4p, 6p and 8p — 16 tiles, more than any single two-sided shape in the hand. Behind 234m, 678m and the 4s pair you only need one of them, so the loose 6s is the cut. Odd-numbered chains are worth far more than they look.'
	},
	{
		// Six blocks: the kanchan leaves before any ryanmen. Best: 2p/4p. (16)
		hand: '3m 4m 5m 7m 8m 2p 4p 6p 7p 8p 3s 3s 5s 6s',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '2s',
		explanation:
			'Discard 2p (or 4p). Count the blocks: 345m, 7m8m, 2p4p, 678p, the 3s pair and 5s6s — six candidates for five slots, so one must go. The 2p4p kanchan is the weakest of them (one tile fills it, against four for each ryanmen), and the surviving half follows next turn. That leaves a 1-shanten on 6m/9m and 4s/7s (16 tiles).'
	},
	{
		// Don't cannibalise a finished run to build a sixth block. Best: 2p. (42)
		hand: '2m 3m 4m 5m 6m 7m 8m 9m 4p 5p 6p 3s 4s 2p',
		seatWind: '4z',
		roundWind: '1z',
		doraIndicator: '7m',
		explanation:
			'Discard 2p. The 2p is only "useful" as a 2p4p kanchan — and building it would mean borrowing the 4p out of your finished 456p, turning one complete set into two incomplete shapes. You already have five blocks in 23456789m, 456p and 3s4s, so let it go: the resulting 1-shanten accepts the whole man suit and 2s–5s (42 tiles).'
	},
	{
		// The exception: a penchan you actually need. Best: 2s. (1m–3m, 5s–8s; 24)
		hand: '1m 2m 4m 5m 6m 7m 8m 9m 3p 4p 5p 6s 7s 2s',
		seatWind: '1z',
		roundWind: '1z',
		doraIndicator: '8m',
		explanation:
			'Discard 2s. Most puzzles here throw the penchan away — but that is only right when something better wants its slot. With 456m, 789m and 345p set and just the 1m2m penchan and 6s7s ryanmen left, you need both to reach five blocks, and the loose 2s is the sixth wheel. Cutting it keeps a 1-shanten on 1m–3m and 5s–8s (24 tiles).'
	},
	{
		// Fold the duplicate into the run beside it. Best: 2p. (all man + 4s–7s; 42)
		hand: '2m 3m 4m 5m 6m 7m 8m 9m 2p 2p 3p 4p 5s 6s',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '4s',
		explanation:
			'Discard 2p. 2p2p3p4p reads as a pair plus a ryanmen, but it works harder as the run 2p3p4p with a spare 2p — the man block is already long enough to supply the head. Folding the duplicate in leaves 23456789m, 234p and the 5s6s ryanmen: a 1-shanten accepting every man tile plus 4s–7s (42 tiles).'
	},
	{
		// Two floaters — keep the one with a future. Best: 9s. (all man + 4s–8s; 46)
		hand: '1m 1m 2m 3m 4m 5m 6m 7m 8m 3p 4p 5p 6s 9s',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '2p',
		explanation:
			'Discard 9s. Both sou tiles are floaters, so cut the one with less future: a 6s can still grow into a ryanmen off 4s–8s, while a 9s only ever pairs with 7s or 8s. Keeping the better floater beside 11m, 2345678m and 345p leaves a 1-shanten accepting the entire man suit and 4s–8s — 46 tiles, against 38 if you cut the 6s instead.'
	},
	{
		// Read the whole block: 35567p is a run, a kanchan and a spare. Best: 1z. (27)
		hand: '2m 3m 4m 6m 7m 8m 3p 5p 5p 6p 7p 4s 5s 1z',
		seatWind: '4z',
		roundWind: '1z',
		doraIndicator: '3s',
		explanation:
			'Discard 1z (East). The pin block is busier than it looks: 5p6p7p is already a run, which leaves 3p5p as a kanchan with a spare 5p that can pair — three jobs from five tiles. With 234m, 678m and the 4s5s ryanmen behind it, the lone East is the only genuine spare, and cutting it leaves a 1-shanten on 3p/4p/5p/8p and 3s–6s (27 tiles).'
	},
	{
		// Doubled-up middle tiles are worth two blocks. Best: 1z. (5m–9m, 4s–7s; 29)
		hand: '2m 3m 4m 6m 6m 7m 7m 8m 3p 4p 5p 5s 6s 1z',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '5m',
		explanation:
			'Discard 1z (East). 6m6m7m7m8m is one block pretending to be two: 678m is complete and the leftover 6m7m is a ryanmen in its own right, so the man suit alone can produce two sets. Add 234m, 345p and the 5s6s ryanmen and the lone East is dead weight — cutting it gives a 1-shanten on 5m–9m and 4s–7s (29 tiles).'
	},
	{
		// A triplet on the end of a long run adds a wait. Best: 3s. (1m/4m/7m/5p, 9)
		hand: '1m 1m 1m 2m 3m 4m 5m 6m 7m 8m 9m 5p 5p 3s',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '4p',
		explanation:
			'Discard 3s. Eleven man tiles and a pair is already tenpai — and the wait is four-sided: 1m, 4m and 7m all extend the run, while 5p completes a shanpon against the 111m triplet (9 tiles in total). Long chunky blocks are worth counting carefully; the naive read misses the 5p entirely.'
	},
	{
		// Eight man tiles are ONE block, not two. Best: 9s. (1m/4m/7m, 10)
		hand: '2m 3m 4m 5m 5m 6m 6m 7m 2p 3p 4p 8s 8s 9s',
		seatWind: '1z',
		roundWind: '1z',
		doraIndicator: '7s',
		explanation:
			'Discard 9s. It is tempting to read the man tiles as "234m plus a mess", but 2m3m4m5m5m6m6m7m is a single eight-tile block: add 1m, 4m or 7m and it becomes three clean runs (10 tiles). With 234p and the 8s pair behind it, cutting the lone 9s is tenpai on all three.'
	},
	{
		// A duplicated middle tile widens the wait. Best: 1s. (2m/5m/8m, 9)
		hand: '2m 3m 4m 5m 5m 6m 7m 2p 3p 4p 7p 8p 9p 1s',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '4m',
		explanation:
			'Discard 1s. 2m3m4m5m5m6m7m carries a run, a spare 5m that pairs, and a three-sided wait on 2m/5m/8m (9 tiles) — all at once. Behind 234p and 789p there is nothing for the terminal to do, so let it go and take the wide tenpai.'
	},
	{
		// Long run in one suit, pair + run in the other. Best: 4p/7p. (1m/4m/7m, 10)
		hand: '2m 3m 4m 5m 6m 7m 8m 9m 3p 3p 4p 5p 6p 7p',
		seatWind: '4z',
		roundWind: '1z',
		doraIndicator: '2p',
		explanation:
			'Discard 7p (or 4p). The man block 23456789m is two runs with a three-sided extension on 1m/4m/7m (10 tiles); the pins only have to supply the head and one run, which 3p3p plus 456p (or 567p) already does with a tile to spare. Trim the spare pin, not the man block.'
	},
	{
		// Ten man tiles: three sets, a pair, and a three-sided wait. Best: 5s. (8)
		hand: '1m 1m 2m 3m 4m 5m 6m 7m 8m 9m 2p 3p 4p 5s',
		seatWind: '1z',
		roundWind: '1z',
		doraIndicator: '1p',
		explanation:
			'Discard 5s. Ten consecutive man tiles with a doubled 1m already contain the pair and every set you need — 234p completes the hand and the wait comes out three-sided on 1m/4m/7m (8 tiles). Against a block that big, a lone 5s has nothing to add.'
	},
	{
		// A triplet plus a run gives a five-sided wait. Best: 1z. (2m/4m/5m/7m/8m, 17)
		hand: '3m 3m 3m 4m 5m 6m 7m 2p 3p 4p 5s 6s 7s 1z',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '2m',
		explanation:
			'Discard 1z (East). 3m3m3m4m5m6m7m is the widest shape you will meet: the triplet can be a set with 4m5m6m7m waiting 4m/7m, or split as a pair with 345m and 67m — together it accepts 2m, 4m, 5m, 7m and 8m, 17 tiles. Cut the lone East, keep 234p and 567s, and take the five-sided tenpai.'
	},
	{
		// The 1112 shape waits on two tiles. Best: 1z. (2p/3p, 7)
		hand: '2m 3m 4m 6m 7m 8m 1p 1p 1p 2p 5s 6s 7s 1z',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '4s',
		explanation:
			'Discard 1z (East). 1p1p1p2p is a shape worth memorising: it is tenpai on 2p (the triplet plus a 2p pair) and on 3p (the 11p pair plus 123p) — 7 tiles. With 234m, 678m and 567s complete, the lone East is the cut; discarding the 2p instead would leave a bare tanki on 3.'
	},
	{
		// A five-tile run at the EDGE only waits two ways. Best: 9m. (3p/6p, 7)
		hand: '2m 3m 4m 7m 8m 9m 1p 2p 3p 4p 5p 7s 7s 9m',
		seatWind: '4z',
		roundWind: '1z',
		doraIndicator: '6s',
		explanation:
			'Discard 9m — you are holding a spare beside the finished 789m. That leaves 234m, 789m, the 7s pair and 1p2p3p4p5p, and here is the lesson: a five-tile run only waits three ways when it has room on both sides. Pinned against the 1p end, this one waits on 3p/6p alone (7 tiles), where 34567p would have taken 2p/5p/8p.'
	},
	{
		// One pair is enough — break the second to widen the wait. Best: 5p. (4p/7p, 7)
		hand: '2m 3m 4m 5p 5p 6p 7p 8p 9p 3s 3s 4s 5s 6s',
		seatWind: '1z',
		roundWind: '1z',
		doraIndicator: '2s',
		explanation:
			'Discard 5p. Two pairs are competing for one head, and the 3s pair is the one to keep: breaking the 5p turns 5p5p6p7p8p9p into 789p plus a 5p6p ryanmen, so the hand waits 4p/7p (7 tiles) instead of a 4-tile shanpon. Keeping both pairs would keep the narrower wait.'
	},
	{
		// A 4-tile tenpai still beats a 20-tile 1-shanten. Best: 1z. (3s/4s, 4)
		hand: '2m 3m 4m 5m 6m 7m 2p 3p 4p 3s 3s 4s 4s 1z',
		seatWind: '2z',
		roundWind: '1z',
		doraIndicator: '2s',
		explanation:
			'Discard 1z (East). 3s3s4s4s is a shanpon tenpai on 3s/4s — only 4 tiles, and cutting a sou instead would leave a 1-shanten accepting 20. Take the tenpai anyway: you can declare riichi now, and the shape upgrades itself if you later draw 2s or 5s. A narrow ready hand outruns a wide unready one.'
	},
	{
		// Same lesson, sharper temptation: 4 tiles ready vs 35 unready. Best: 1s. (3p, 4)
		hand: '2m 3m 4m 5m 6m 7m 2p 4p 6p 7p 8p 9s 9s 1s',
		seatWind: '3z',
		roundWind: '1z',
		doraIndicator: '8s',
		explanation:
			'Discard 1s. Cutting the 2p would leave a gorgeous 1-shanten taking 35 tiles — and it would still be wrong, because dropping the terminal is tenpai right now: 234m, 567m, 678p, the 9s pair and the 2p4p kanchan wait on 3p (4 tiles). Riichi turns those four tiles into a scoring hand; the 35-tile shape is still one draw from nothing.'
	},
	{
		// When the hand is all pairs, count chiitoitsu. Best: 4s/6s. (3)
		hand: '1m 1m 5m 5m 9m 9m 3p 3p 7p 7p 2s 2s 4s 6s',
		seatWind: '4z',
		roundWind: '1z',
		doraIndicator: '4m',
		explanation:
			'Discard 6s (or 4s). Counted as a standard hand this is a disaster — scattered pairs make almost no sets — but as chiitoitsu, seven distinct pairs, it is already tenpai: six pairs plus a tanki on whichever sou tile you keep (3 tiles). When your hand is nothing but pairs, stop counting runs and start counting pairs.'
	}
];
