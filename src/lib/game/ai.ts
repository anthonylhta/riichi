import { tilesToHand, RuleSet } from 'mahjong-tile-efficiency';
import { toEffHand, toEffStr } from './tiles';
import type { TileCode, GameTile } from './tiles';
import type { GameState, Seat } from './types';

interface DiscardOption {
	tile: GameTile;
	shanten: number;
	ukeire: number;
}

const riichiRuleSet = new RuleSet('Riichi');

function calcShantenAndUkeire(codes: TileCode[]): { shanten: number; ukeire: number } {
	try {
		const hand = toEffHand(codes);
		const result = riichiRuleSet.calUkeire(hand);
		return {
			shanten: result.shanten,
			ukeire: result.totalUkeire ?? 0,
		};
	} catch {
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

export function chooseDiscard(seat: Seat, state: GameState): GameTile {
	const player = state.players[seat];
	const hand = player.hand;
	const difficulty = player.difficulty;

	const ranked = rankDiscards(hand);

	if (difficulty === 'basic') {
		return ranked[0].tile;
	}

	// Good AI: avoid tiles that are dangerous against riichi players
	const riichSeats = state.players
		.map((p, i) => (p.isRiichi ? (i as Seat) : null))
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

	const handCodes = player.hand.map((t) => t.code);
	const shanten = getShanten(handCodes);

	// Declare riichi when tenpai (shanten = 0) and hand is closed
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
		label: toEffStr(opt.tile.code),
	}));
}
