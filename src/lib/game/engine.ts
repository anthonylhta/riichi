import { createWall, shuffleTiles, TC } from './tiles';
import type { GameTile, TileCode } from './tiles';
import type { ClaimOption, GameState, Meld, PlayerState, RoundResult, Seat } from './types';
import { chooseDiscard, getShanten, shouldDeclareRiichi } from './ai';
import { checkWin } from './scoring';

const WINDS: TileCode[] = [TC.EAST, TC.SOUTH, TC.WEST, TC.NORTH];

function getRoundWind(): TileCode {
	return TC.EAST;
}

function getSeatWind(seat: Seat, dealer: Seat): TileCode {
	return WINDS[(seat - dealer + 4) % 4];
}

function makePlayer(seat: Seat): PlayerState {
	return {
		seat,
		hand: [],
		discards: [],
		melds: [],
		score: 25000,
		isHuman: seat === 0,
		difficulty: seat === 0 ? null : seat === 3 ? 'good' : 'basic',
		isRiichi: false,
		riichiTile: null
	};
}

function initRound(
	scores: [number, number, number, number],
	dealer: Seat,
	round: number,
	honba: number
): GameState {
	const shuffled = shuffleTiles(createWall());

	const liveWall = shuffled.slice(0, 122);
	const deadWall = shuffled.slice(122);
	const doraIndicators = [deadWall[4]];

	const players: [PlayerState, PlayerState, PlayerState, PlayerState] = [
		makePlayer(0),
		makePlayer(1),
		makePlayer(2),
		makePlayer(3)
	];

	for (let i = 0; i < 4; i++) {
		players[i].score = scores[i];
	}

	let pos = 0;
	for (let i = 0; i < 13; i++) {
		for (let seat = 0; seat < 4; seat++) {
			players[seat].hand.push(liveWall[pos++]);
		}
	}

	for (const p of players) {
		p.hand = sortHand(p.hand);
	}

	const state: GameState = {
		phase: 'dealing',
		round,
		honba,
		dealer,
		currentSeat: dealer,
		turnCount: 0,
		liveWall,
		wallPos: pos,
		doraIndicators,
		players,
		lastDiscard: null,
		lastDiscardSeat: null,
		pendingTsumo: null,
		pendingRon: null,
		claimOptions: null,
		roundResult: null
	};

	return drawTile(state, dealer);
}

export function initGame(): GameState {
	return initRound([25000, 25000, 25000, 25000], 0, 1, 0);
}

export function continueGame(state: GameState): GameState {
	if (state.phase !== 'round_end') return state;

	const result = state.roundResult;
	let nextDealer = state.dealer;
	let nextHonba = state.honba;
	let nextRound = state.round;

	if (result === null) {
		nextHonba++;
	} else if (result.winner === state.dealer) {
		nextHonba++;
	} else {
		nextDealer = ((state.dealer + 1) % 4) as Seat;
		nextHonba = 0;
		nextRound++;
	}

	const bust = state.players.some((p) => p.score <= 0);
	if (nextRound > 4 || bust) {
		return { ...state, phase: 'game_end' };
	}

	const scores = state.players.map((p) => p.score) as [number, number, number, number];
	return initRound(scores, nextDealer, nextRound, nextHonba);
}

function drawTile(state: GameState, seat: Seat): GameState {
	if (state.wallPos >= state.liveWall.length) {
		return { ...state, phase: 'round_end', roundResult: null };
	}

	const tile = state.liveWall[state.wallPos];
	const players = clonePlayers(state);
	players[seat].hand = [...players[seat].hand, tile];

	return {
		...state,
		players,
		wallPos: state.wallPos + 1,
		turnCount: state.turnCount + 1,
		phase: seat === 0 ? 'player_discard' : 'ai_turn',
		currentSeat: seat,
		pendingTsumo: null,
		pendingRon: null,
		claimOptions: null
	};
}

function openMeldsFor(player: PlayerState): TileCode[][] {
	return player.melds.map((m) => m.tiles.map((t) => t.code));
}

export async function checkTsumo(state: GameState, seat: Seat): Promise<RoundResult | null> {
	const player = state.players[seat];
	const totalTiles = player.hand.length + player.melds.length * 3;
	if (totalTiles !== 14) return null;

	const result = await checkWin({
		handCodes: player.hand.map((t) => t.code),
		openMelds: openMeldsFor(player),
		doraIndicators: state.doraIndicators,
		isRiichi: player.isRiichi,
		isTsumo: true,
		ronTileCode: null,
		seatWind: getSeatWind(seat, state.dealer),
		roundWind: getRoundWind()
	});

	if (!result.isWin) return null;

	const pointChanges: [number, number, number, number] = [0, 0, 0, 0];
	const honbaBonus = state.honba * 100;

	if (seat === state.dealer) {
		const payment = Math.ceil(result.score / 3 / 100) * 100 + honbaBonus;
		for (let i = 0; i < 4; i++) {
			if (i !== seat) pointChanges[i] = -payment;
		}
		pointChanges[seat] = payment * 3;
	} else {
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

	const result = await checkWin({
		handCodes: [...player.hand.map((t) => t.code), discardTile.code],
		openMelds: openMeldsFor(player),
		doraIndicators: state.doraIndicators,
		isRiichi: player.isRiichi,
		isTsumo: false,
		ronTileCode: discardTile.code,
		seatWind: getSeatWind(claimantSeat, state.dealer),
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
	return { ...state, players, roundResult: result, phase: 'round_end' };
}

function getPonOption(hand: GameTile[], calledTile: GameTile): ClaimOption | null {
	const matching = hand.filter((t) => t.code === calledTile.code);
	if (matching.length >= 2) {
		return { type: 'pon', handTiles: [matching[0], matching[1]] };
	}
	return null;
}

function getChiOptions(
	hand: GameTile[],
	calledTile: GameTile,
	discarderSeat: Seat,
	claimerSeat: Seat
): ClaimOption[] {
	// Chi only from the player directly before claimer in turn order
	if ((discarderSeat + 1) % 4 !== claimerSeat) return [];

	const c = calledTile.code;
	if (c < 1 || c > 27) return []; // number tiles only

	const suitStart = Math.floor((c - 1) / 9) * 9 + 1;
	const suitEnd = suitStart + 8;
	const options: ClaimOption[] = [];

	const sequences: [number, number][] = [];
	if (c - 2 >= suitStart) sequences.push([c - 2, c - 1]);
	if (c - 1 >= suitStart && c + 1 <= suitEnd) sequences.push([c - 1, c + 1]);
	if (c + 2 <= suitEnd) sequences.push([c + 1, c + 2]);

	for (const [codeA, codeB] of sequences) {
		const tileA = hand.find((t) => t.code === codeA);
		const tileB = hand.find((t) => t.code === codeB);
		if (tileA && tileB) {
			options.push({ type: 'chi', handTiles: [tileA, tileB] });
		}
	}

	return options;
}

function getHumanClaimOptions(
	state: GameState,
	discardTile: GameTile,
	discarderSeat: Seat
): ClaimOption[] {
	const hand = state.players[0].hand;
	const options: ClaimOption[] = [];

	const pon = getPonOption(hand, discardTile);
	if (pon) options.push(pon);

	options.push(...getChiOptions(hand, discardTile, discarderSeat, 0));

	return options;
}

export async function humanDiscard(state: GameState, tileId: number): Promise<GameState> {
	if (state.phase !== 'player_discard' || state.currentSeat !== 0) return state;

	const player = state.players[0];
	const tile = player.hand.find((t) => t.id === tileId);
	if (!tile) return state;

	// Only auto-declare riichi on a closed hand
	const canDeclareRiichi =
		!player.isRiichi &&
		player.melds.length === 0 &&
		getShanten(player.hand.filter((t) => t.id !== tileId).map((t) => t.code)) === 0;

	const players = clonePlayers(state);
	players[0].hand = sortHand(player.hand.filter((t) => t.id !== tileId));
	players[0].discards = [...player.discards, tile];

	if (canDeclareRiichi) {
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
		currentSeat: 1,
		pendingTsumo: null,
		pendingRon: null,
		claimOptions: null
	};

	for (let s = 1; s < 4; s++) {
		const ron = await checkRon(newState, s as Seat, tile, 0);
		if (ron) return applyRoundResult(newState, ron);
	}

	return newState;
}

export async function humanDeclareTsumo(state: GameState): Promise<GameState> {
	if (!state.pendingTsumo) return state;
	return applyRoundResult(state, state.pendingTsumo);
}

export async function humanDeclareRon(state: GameState): Promise<GameState> {
	if (state.phase === 'claim_decision' && state.pendingRon) {
		return applyRoundResult(state, state.pendingRon);
	}
	if (!state.lastDiscard || state.lastDiscardSeat === null) return state;
	const ron = await checkRon(state, 0, state.lastDiscard, state.lastDiscardSeat);
	if (!ron) return state;
	return applyRoundResult(state, ron);
}

export function humanClaimPon(state: GameState, handTiles: [GameTile, GameTile]): GameState {
	if (state.phase !== 'claim_decision' || !state.lastDiscard) return state;

	const calledTile = state.lastDiscard;
	const player = state.players[0];

	const meld: Meld = {
		type: 'pon',
		tiles: [handTiles[0], handTiles[1], calledTile],
		calledFrom: state.lastDiscardSeat!
	};

	const players = clonePlayers(state);
	players[0].hand = sortHand(
		player.hand.filter((t) => t.id !== handTiles[0].id && t.id !== handTiles[1].id)
	);
	players[0].melds = [...player.melds, meld];

	return {
		...state,
		players,
		phase: 'player_discard',
		currentSeat: 0,
		pendingRon: null,
		claimOptions: null
	};
}

export function humanClaimChi(state: GameState, handTiles: [GameTile, GameTile]): GameState {
	if (state.phase !== 'claim_decision' || !state.lastDiscard) return state;

	const calledTile = state.lastDiscard;
	const player = state.players[0];

	const chiTiles = sortHand([handTiles[0], handTiles[1], calledTile]) as [
		GameTile,
		GameTile,
		GameTile
	];

	const meld: Meld = {
		type: 'chi',
		tiles: chiTiles,
		calledFrom: state.lastDiscardSeat!
	};

	const players = clonePlayers(state);
	players[0].hand = sortHand(
		player.hand.filter((t) => t.id !== handTiles[0].id && t.id !== handTiles[1].id)
	);
	players[0].melds = [...player.melds, meld];

	return {
		...state,
		players,
		phase: 'player_discard',
		currentSeat: 0,
		pendingRon: null,
		claimOptions: null
	};
}

export async function humanPassClaim(state: GameState): Promise<GameState> {
	if (state.phase !== 'claim_decision') return state;

	const nextSeat = (((state.lastDiscardSeat ?? 0) + 1) % 4) as Seat;
	const cleared = { ...state, pendingRon: null, claimOptions: null };

	if (nextSeat === 0) {
		const drawn = drawTile({ ...cleared, phase: 'ai_turn' }, 0);
		const tsumo = await checkTsumo(drawn, 0);
		return { ...drawn, pendingTsumo: tsumo };
	}

	return { ...cleared, phase: 'ai_turn', currentSeat: nextSeat };
}

export async function runAiTurn(state: GameState): Promise<GameState> {
	const seat = state.currentSeat as Seat;
	if (state.players[seat].isHuman) return state;

	let s = drawTile(state, seat);

	const tsumo = await checkTsumo(s, seat);
	if (tsumo) return applyRoundResult(s, tsumo);

	if (shouldDeclareRiichi(seat, s)) {
		const players = clonePlayers(s);
		players[seat].isRiichi = true;
		players[seat].score -= 1000;
		s = { ...s, players };
	}

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
		phase: 'ai_turn'
	};

	// Check all human claim options: ron, pon, chi
	const humanRon = await checkRon(s, 0, discardTile, seat);
	const claimOptions = getHumanClaimOptions(s, discardTile, seat);

	if (humanRon || claimOptions.length > 0) {
		return {
			...s,
			phase: 'claim_decision',
			pendingRon: humanRon,
			claimOptions
		};
	}

	// Check AI ron
	for (let claimant = 0; claimant < 4; claimant++) {
		if (claimant === seat) continue;
		if (state.players[claimant].isHuman) continue;
		const ron = await checkRon(s, claimant as Seat, discardTile, seat);
		if (ron) return applyRoundResult(s, ron);
	}

	// Draw for player if their turn is next
	if (nextSeat === 0) {
		const drawn = drawTile(s, 0);
		const playerTsumo = await checkTsumo(drawn, 0);
		return { ...drawn, pendingTsumo: playerTsumo };
	}

	return s;
}

export async function stepAiTurn(state: GameState): Promise<GameState> {
	if (state.phase !== 'ai_turn') return state;
	return runAiTurn(state);
}

export function canHumanRon(state: GameState): boolean {
	return state.phase === 'claim_decision' && state.pendingRon !== null;
}

function sortHand(tiles: GameTile[]): GameTile[] {
	return [...tiles].sort((a, b) => a.code - b.code);
}

function clonePlayers(state: GameState): [PlayerState, PlayerState, PlayerState, PlayerState] {
	return state.players.map((p) => ({
		...p,
		hand: [...p.hand],
		discards: [...p.discards],
		melds: [...p.melds]
	})) as [PlayerState, PlayerState, PlayerState, PlayerState];
}
