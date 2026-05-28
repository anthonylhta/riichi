import { createWall, shuffleTiles, TC } from './tiles';
import type { GameTile, TileCode } from './tiles';
import type { GameState, PlayerState, RoundResult, Seat } from './types';
import { chooseDiscard, getShanten, shouldDeclareRiichi } from './ai';
import { checkWin } from './scoring';

// Seat winds for scoring: seat 0 = dealer = East
const SEAT_WINDS: TileCode[] = [TC.EAST, TC.SOUTH, TC.WEST, TC.NORTH];

// Round wind: round 1-4 are all East round
function getRoundWind(): TileCode {
	return TC.EAST;
}

function makePlayer(seat: Seat): PlayerState {
	return {
		seat,
		hand: [],
		discards: [],
		score: 25000,
		isHuman: seat === 0,
		difficulty: seat === 0 ? null : seat === 3 ? 'good' : 'basic',
		isRiichi: false,
		riichiTile: null
	};
}

export function initGame(): GameState {
	const shuffled = shuffleTiles(createWall());

	// Last 14 tiles = dead wall; dora indicator is dead wall index 4
	const liveWall = shuffled.slice(0, 122);
	const deadWall = shuffled.slice(122);
	const doraIndicators = [deadWall[4]];

	// Deal 13 tiles to each player
	const players: [PlayerState, PlayerState, PlayerState, PlayerState] = [
		makePlayer(0),
		makePlayer(1),
		makePlayer(2),
		makePlayer(3)
	];

	let pos = 0;
	for (let i = 0; i < 13; i++) {
		for (let seat = 0; seat < 4; seat++) {
			players[seat].hand.push(liveWall[pos++]);
		}
	}

	// Sort each hand
	for (const p of players) {
		p.hand = sortHand(p.hand);
	}

	const state: GameState = {
		phase: 'dealing',
		round: 1,
		honba: 0,
		dealer: 0,
		currentSeat: 0,
		turnCount: 0,
		liveWall,
		wallPos: pos,
		doraIndicators,
		players,
		lastDiscard: null,
		lastDiscardSeat: null,
		roundResult: null
	};

	// Dealer draws the 14th tile to start
	return drawTile(state, 0);
}

function drawTile(state: GameState, seat: Seat): GameState {
	if (state.wallPos >= state.liveWall.length) {
		// Wall exhausted — draw (ryuukyoku)
		return { ...state, phase: 'round_end', roundResult: null };
	}

	const tile = state.liveWall[state.wallPos];
	const players = clonePlayers(state);
	players[seat].hand = [...players[seat].hand, tile];

	const newState: GameState = {
		...state,
		players,
		wallPos: state.wallPos + 1,
		turnCount: state.turnCount + 1,
		phase: seat === 0 ? 'player_discard' : 'ai_turn',
		currentSeat: seat
	};

	return newState;
}

export async function checkTsumo(state: GameState, seat: Seat): Promise<RoundResult | null> {
	const player = state.players[seat];
	const handCodes = player.hand.map((t) => t.code);

	if (handCodes.length !== 14) return null;

	const result = await checkWin({
		handCodes,
		doraIndicators: state.doraIndicators,
		isRiichi: player.isRiichi,
		isTsumo: true,
		ronTileCode: null,
		seatWind: SEAT_WINDS[seat],
		roundWind: getRoundWind()
	});

	if (!result.isWin) return null;

	const pointChanges: [number, number, number, number] = [0, 0, 0, 0];
	const honbaBonus = state.honba * 100;

	if (seat === state.dealer) {
		// Dealer tsumo: each non-dealer pays equally
		const payment = Math.ceil(result.score / 3 / 100) * 100 + honbaBonus;
		for (let i = 0; i < 4; i++) {
			if (i !== seat) pointChanges[i] = -payment;
		}
		pointChanges[seat] = payment * 3;
	} else {
		// Non-dealer tsumo: dealer pays more
		const dealerPayment = Math.ceil(result.score / 2 / 100) * 100 + honbaBonus;
		const nonDealerPayment = Math.ceil(result.score / 4 / 100) * 100 + honbaBonus;
		for (let i = 0; i < 4; i++) {
			if (i === seat) continue;
			pointChanges[i] = i === state.dealer ? -dealerPayment : -nonDealerPayment;
		}
		pointChanges[seat] = dealerPayment + nonDealerPayment * 2;
	}

	return {
		winner: seat,
		winType: 'tsumo',
		loser: null,
		han: result.han,
		fu: result.fu,
		score: result.score,
		pointChanges
	};
}

export async function checkRon(
	state: GameState,
	claimantSeat: Seat,
	discardTile: GameTile,
	discarderSeat: Seat
): Promise<RoundResult | null> {
	const player = state.players[claimantSeat];
	const handCodes = [...player.hand.map((t) => t.code), discardTile.code];

	const result = await checkWin({
		handCodes,
		doraIndicators: state.doraIndicators,
		isRiichi: player.isRiichi,
		isTsumo: false,
		ronTileCode: discardTile.code,
		seatWind: SEAT_WINDS[claimantSeat],
		roundWind: getRoundWind()
	});

	if (!result.isWin) return null;

	const honbaBonus = state.honba * 300;
	const total = result.score + honbaBonus;

	const pointChanges: [number, number, number, number] = [0, 0, 0, 0];
	pointChanges[discarderSeat] = -total;
	pointChanges[claimantSeat] = total;

	return {
		winner: claimantSeat,
		winType: 'ron',
		loser: discarderSeat,
		han: result.han,
		fu: result.fu,
		score: result.score,
		pointChanges
	};
}

export function applyRoundResult(state: GameState, result: RoundResult): GameState {
	const players = clonePlayers(state);
	for (let i = 0; i < 4; i++) {
		players[i].score += result.pointChanges[i];
	}
	return {
		...state,
		players,
		roundResult: result,
		phase: 'round_end'
	};
}

// Human discards a tile by its ID
export async function humanDiscard(state: GameState, tileId: number): Promise<GameState> {
	if (state.phase !== 'player_discard' || state.currentSeat !== 0) return state;

	const player = state.players[0];
	const tile = player.hand.find((t) => t.id === tileId);
	if (!tile) return state;

	// Check riichi declaration before discarding
	const declareRiichi =
		!player.isRiichi &&
		getShanten(player.hand.filter((t) => t.id !== tileId).map((t) => t.code)) === 0;

	const players = clonePlayers(state);
	players[0].hand = sortHand(player.hand.filter((t) => t.id !== tileId));
	players[0].discards = [...player.discards, tile];

	if (declareRiichi) {
		players[0].isRiichi = true;
		players[0].riichiTile = tile;
		players[0].score -= 1000;
	}

	const newState: GameState = {
		...state,
		players,
		lastDiscard: tile,
		lastDiscardSeat: 0,
		phase: 'ai_turn',
		currentSeat: 1
	};

	// Check if any AI can ron on this discard
	for (let s = 1; s < 4; s++) {
		const ron = await checkRon(newState, s as Seat, tile, 0);
		if (ron) {
			return applyRoundResult(newState, ron);
		}
	}

	return newState;
}

// Run one complete AI turn: draw → optional riichi → discard → check ron
export async function runAiTurn(state: GameState): Promise<GameState> {
	const seat = state.currentSeat as Seat;
	if (state.players[seat].isHuman) return state;

	// Draw
	let s = drawTile(state, seat);

	// Check tsumo
	const tsumo = await checkTsumo(s, seat);
	if (tsumo) return applyRoundResult(s, tsumo);

	// Possibly declare riichi
	if (shouldDeclareRiichi(seat, s)) {
		const players = clonePlayers(s);
		players[seat].isRiichi = true;
		players[seat].score -= 1000;
		s = { ...s, players };
	}

	// Choose discard
	const discardTile = chooseDiscard(seat, s);
	const players = clonePlayers(s);
	players[seat].hand = sortHand(s.players[seat].hand.filter((t) => t.id !== discardTile.id));
	players[seat].discards = [...s.players[seat].discards, discardTile];

	const nextSeat = ((seat + 1) % 4) as Seat;
	s = {
		...s,
		players,
		lastDiscard: discardTile,
		lastDiscardSeat: seat,
		currentSeat: nextSeat,
		phase: nextSeat === 0 ? 'player_discard' : 'ai_turn'
	};

	// Check if human can ron
	const humanRon = await checkRon(s, 0, discardTile, seat);
	if (humanRon) {
		// Don't auto-win for human — let UI present the option
		return { ...s, phase: 'player_discard' };
	}

	// Check if another AI can ron
	for (let claimant = 0; claimant < 4; claimant++) {
		if (claimant === seat) continue;
		if (state.players[claimant].isHuman) continue;
		const ron = await checkRon(s, claimant as Seat, discardTile, seat);
		if (ron) return applyRoundResult(s, ron);
	}

	return s;
}

// Advance one AI step at a time — call repeatedly until phase !== 'ai_turn'
export async function stepAiTurn(state: GameState): Promise<GameState> {
	if (state.phase !== 'ai_turn') return state;
	return runAiTurn(state);
}

export function canHumanRon(state: GameState): boolean {
	if (!state.lastDiscard || state.lastDiscardSeat === null) return false;
	if (state.players[0].isRiichi) {
		// In riichi, furiten check would go here — simplified: allow if tenpai
		const handCodes = state.players[0].hand.map((t) => t.code);
		return getShanten(handCodes) === 0;
	}
	return false;
}

export async function humanDeclareRon(state: GameState): Promise<GameState> {
	if (!state.lastDiscard || state.lastDiscardSeat === null) return state;
	const ron = await checkRon(state, 0, state.lastDiscard, state.lastDiscardSeat);
	if (!ron) return state;
	return applyRoundResult(state, ron);
}

function sortHand(tiles: GameTile[]): GameTile[] {
	return [...tiles].sort((a, b) => a.code - b.code);
}

function clonePlayers(state: GameState): [PlayerState, PlayerState, PlayerState, PlayerState] {
	return state.players.map((p) => ({ ...p, hand: [...p.hand], discards: [...p.discards] })) as [
		PlayerState,
		PlayerState,
		PlayerState,
		PlayerState
	];
}
