import { RuleSet } from 'mahjong-tile-efficiency';
import { toEffHand, toEffStr } from './tiles';
import type { TileCode, GameTile } from './tiles';
import type { GameState, Seat } from './types';

interface DiscardOption {
	tile: GameTile;
	shanten: number;
	ukeire: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const riichiRuleSet: any = new RuleSet('Riichi');

function calcShantenAndUkeire(codes: TileCode[]): { shanten: number; ukeire: number } {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result: any = riichiRuleSet.calUkeire(toEffHand(codes) as any);
		return {
			shanten: result.shanten ?? 8,
			ukeire: result.totalUkeire ?? 0
		};
	} catch (e) {
		// Don't let a throwing efficiency lib masquerade as a terrible hand — the
		// fallback keeps the game running, but the failure has to be visible.
		console.error('shanten/ukeire calc failed (treated as shanten 8):', e);
		return { shanten: 8, ukeire: 0 };
	}
}

export function getShanten(codes: TileCode[]): number {
	return calcShantenAndUkeire(codes).shanten;
}

function rankDiscards(hand: GameTile[]): DiscardOption[] {
	const options: DiscardOption[] = [];

	for (let i = 0; i < hand.length; i++) {
		const remaining = hand.filter((_, idx) => idx !== i).map((t) => t.code);
		const { shanten, ukeire } = calcShantenAndUkeire(remaining);
		options.push({ tile: hand[i], shanten, ukeire });
	}

	// Sort: lowest shanten first, then highest ukeire as tiebreak
	options.sort((a, b) => a.shanten - b.shanten || b.ukeire - a.ukeire);
	return options;
}

// Returns the tile codes that are safe to discard against a riichi player
function getSafeTiles(state: GameState, riichiSeat: Seat): Set<number> {
	const safe = new Set<number>();
	// Tiles already in the riichi player's discard pile are guaranteed safe
	for (const t of state.players[riichiSeat].discards) {
		safe.add(t.code);
	}
	return safe;
}

export function chooseDiscard(seat: Seat, state: GameState, declaringRiichi = false): GameTile {
	const player = state.players[seat];
	const hand = player.hand;
	const difficulty = player.difficulty;

	// A hand already locked by riichi must tsumogiri. The drawn tile is the last
	// one in the hand: hands are only re-sorted when a discard is applied, and a
	// riichi player can't call, so every draw (wall or rinshan) lands at the end.
	if (player.isRiichi && !declaringRiichi) {
		return hand[hand.length - 1];
	}

	let ranked = rankDiscards(hand);

	// The riichi-declaring discard must keep the hand tenpai — without this, the
	// good AI's safe-tile fallback below could declare riichi and then discard a
	// safe tile that breaks its own tenpai (an illegal riichi).
	if (declaringRiichi) {
		const tenpaiKeepers = ranked.filter((o) => o.shanten === 0);
		if (tenpaiKeepers.length > 0) ranked = tenpaiKeepers;
	}

	if (difficulty === 'basic') {
		return ranked[0].tile;
	}

	// Good AI: avoid tiles that are dangerous against riichi players (not counting
	// our own riichi — defending against ourselves makes no sense)
	const riichSeats = state.players
		.map((p, i) => (p.isRiichi && i !== seat ? (i as Seat) : null))
		.filter((s): s is Seat => s !== null);

	if (riichSeats.length === 0) {
		return ranked[0].tile;
	}

	// Collect safe tiles (in all riichi players' discard piles)
	const allSafe = new Set<number>();
	for (const rs of riichSeats) {
		for (const code of getSafeTiles(state, rs)) {
			allSafe.add(code);
		}
	}

	// Prefer best discard that is safe; fall back to best overall if nothing safe
	const safeOption = ranked.find((opt) => allSafe.has(opt.tile.code));
	return safeOption ? safeOption.tile : ranked[0].tile;
}

export function shouldDeclareRiichi(seat: Seat, state: GameState): boolean {
	const player = state.players[seat];
	if (player.isRiichi) return false;

	// Riichi legality, mirroring the human-side rules in humanDiscard: the hand
	// must be closed, the player must afford the 1000-point stick, and at least
	// 4 live-wall tiles must remain (so every player gets one more draw).
	if (player.melds.length > 0) return false;
	if (player.score < 1000) return false;
	if (state.liveWall.length - state.wallPos < 4) return false;

	const handCodes = player.hand.map((t) => t.code);
	const shanten = getShanten(handCodes);

	// Declare riichi when tenpai (shanten = 0)
	return shanten === 0;
}

// Check if discarding a specific tile leaves the hand tenpai
export function isTenpaiAfterDiscard(hand: GameTile[], discardId: number): boolean {
	const remaining = hand.filter((t) => t.id !== discardId).map((t) => t.code);
	return getShanten(remaining) === 0;
}

// Generate discard tile labels sorted by quality (for UI hints)
export function getDiscardHints(hand: GameTile[]): { tileId: number; label: string }[] {
	const ranked = rankDiscards(hand);
	return ranked.slice(0, 3).map((opt) => ({
		tileId: opt.tile.id,
		label: toEffStr(opt.tile.code)
	}));
}
