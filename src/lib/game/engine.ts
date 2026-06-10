import { createWall, shuffleTiles, TC } from './tiles';
import type { GameTile, TileCode } from './tiles';
import type {
	ClaimOption,
	ExhaustiveDrawResult,
	GameState,
	Meld,
	PlayerState,
	RoundResult,
	Seat
} from './types';
import { chooseDiscard, getShanten, shouldDeclareRiichi } from './ai';
import { checkWin } from './scoring';

const WINDS: TileCode[] = [TC.EAST, TC.SOUTH, TC.WEST, TC.NORTH];

// Game-end rule constants (Mahjong Soul tonpuusen defaults).
const TARGET_SCORE = 30000; // "return" points — needed to end the game at the last hand
const LAST_REGULAR_ROUND = 4; // East-4 is the nominal final hand
const ABSOLUTE_LAST_ROUND = 8; // South-4 caps sudden-death overtime

// Rounds 1–4 are East, 5–8 are South (sudden-death overtime). The round wind
// shifts to South in overtime, so South tiles become yakuhai there.
function getRoundWind(round: number): TileCode {
	return round <= LAST_REGULAR_ROUND ? TC.EAST : TC.SOUTH;
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
		isDoubleRiichi: false,
		isIppatsu: false,
		riichiTile: null,
		isFuriten: false,
		isTempFuriten: false
	};
}

function initRound(
	scores: [number, number, number, number],
	dealer: Seat,
	round: number,
	honba: number,
	riichiBets = 0,
	// A pre-shuffled wall (136 tiles, deal order) can be injected to deterministically
	// re-deal a round — this is what makes a game replayable (see replay.ts). When
	// omitted we shuffle a fresh wall as usual.
	wall?: GameTile[]
): GameState {
	const shuffled = wall ?? shuffleTiles(createWall());

	const liveWall = shuffled.slice(0, 122);
	const deadWall = shuffled.slice(122);
	// Dora indicators: deadWall[4..8], ura dora indicators: deadWall[9..13]
	const doraIndicators = [deadWall[4]];
	const uraDoraIndicators = [deadWall[9]];

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
		wallEnd: liveWall.length,
		deadWall,
		rinshankPos: 0,
		doraIndicators,
		uraDoraIndicators,
		anyCallMadeThisRound: false,
		riichiBets,
		players,
		lastDiscard: null,
		lastDiscardSeat: null,
		pendingTsumo: null,
		pendingRon: null,
		claimOptions: null,
		roundResult: null,
		exhaustiveDrawResult: null
	};

	return drawTile(state, dealer);
}

export function initGame(wall?: GameTile[]): GameState {
	return initRound([25000, 25000, 25000, 25000], 0, 1, 0, 0, wall);
}

// End the game, settling any riichi sticks still on the table. Sticks left over
// from exhaustive draws (a win claims them in applyRoundResult) go to 1st place,
// per MJ Soul; a score tie breaks toward the earlier seat.
function endGame(state: GameState): GameState {
	if (state.riichiBets === 0) return { ...state, phase: 'game_end' };
	const top = state.players.reduce((best, p) => (p.score > best.score ? p : best));
	const players = clonePlayers(state);
	players[top.seat].score += state.riichiBets * 1000;
	return { ...state, players, riichiBets: 0, phase: 'game_end' };
}

export function continueGame(state: GameState, wall?: GameTile[]): GameState {
	if (state.phase !== 'round_end') return state;

	const result = state.roundResult;
	let nextDealer = state.dealer;
	let nextHonba = state.honba;
	let nextRound = state.round;

	if (result === null) {
		// Exhaustive draw: honba always advances, but the dealer keeps the deal
		// (renchan) only if tenpai. A noten dealer passes the deal and the round
		// advances — otherwise a noten draw repeats the same hand forever.
		nextHonba++;
		const dealerTenpai = state.exhaustiveDrawResult?.tenpaiSeats.includes(state.dealer) ?? false;
		if (!dealerTenpai) {
			nextDealer = ((state.dealer + 1) % 4) as Seat;
			nextRound++;
		}
	} else if (result.winner === state.dealer) {
		nextHonba++;
	} else {
		nextDealer = ((state.dealer + 1) % 4) as Seat;
		nextHonba = 0;
		nextRound++;
	}

	// MJ Soul tobi: busting is a strictly-negative score; exactly 0 stays alive.
	const bust = state.players.some((p) => p.score < 0);
	if (bust) {
		return endGame(state);
	}

	// Points target + sudden-death overtime. Once we're past the nominal last hand
	// (East-4's dealer has passed, or we're already in South overtime), the game
	// ends as soon as a hand finishes with someone at/over the target. If nobody
	// has reached it, play continues into South (sudden death) — capped at South-4,
	// after which the leader simply wins regardless of the target.
	const topScore = Math.max(...state.players.map((p) => p.score));
	if (nextRound > LAST_REGULAR_ROUND && topScore >= TARGET_SCORE) {
		return endGame(state);
	}
	if (state.round >= ABSOLUTE_LAST_ROUND) {
		return endGame(state);
	}

	const scores = state.players.map((p) => p.score) as [number, number, number, number];
	// Carry riichi sticks over on exhaustive draw; they clear when someone wins
	const carryBets = result === null ? state.riichiBets : 0;
	return initRound(scores, nextDealer, nextRound, nextHonba, carryBets, wall);
}

function applyExhaustiveDraw(state: GameState): GameState {
	const tenpaiSeats: Seat[] = [];
	for (let seat = 0; seat < 4; seat++) {
		const handCodes = state.players[seat].hand.map((t) => t.code);
		if (getShanten(handCodes) === 0) {
			tenpaiSeats.push(seat as Seat);
		}
	}

	const tenpaiCount = tenpaiSeats.length;
	const notenCount = 4 - tenpaiCount;
	const pointChanges: [number, number, number, number] = [0, 0, 0, 0];

	if (tenpaiCount > 0 && tenpaiCount < 4) {
		const tenpaiGain = 3000 / tenpaiCount;
		const notenLoss = 3000 / notenCount;
		for (let seat = 0; seat < 4; seat++) {
			pointChanges[seat] = tenpaiSeats.includes(seat as Seat) ? tenpaiGain : -notenLoss;
		}
	}

	const players = clonePlayers(state);
	for (let i = 0; i < 4; i++) {
		players[i].score += pointChanges[i];
	}

	const exhaustiveDrawResult: ExhaustiveDrawResult = { tenpaiSeats, pointChanges };
	return { ...state, players, phase: 'round_end', roundResult: null, exhaustiveDrawResult };
}

function drawTile(state: GameState, seat: Seat): GameState {
	if (state.wallPos >= state.wallEnd) {
		return applyExhaustiveDraw(state);
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

function openMeldsFor(player: PlayerState): [boolean, TileCode[]][] {
	return player.melds.map((m) => [m.type !== 'ankan', m.tiles.map((t) => t.code)]);
}

// Count red-five (aka dora) tiles across a set of tiles — used to score aka dora.
function countAka(tiles: GameTile[]): number {
	return tiles.filter((t) => t.isRed).length;
}

function meldTiles(player: PlayerState): GameTile[] {
	return player.melds.flatMap((m) => m.tiles);
}

export async function checkTsumo(
	state: GameState,
	seat: Seat,
	afterKan = false
): Promise<RoundResult | null> {
	const player = state.players[seat];
	// A complete hand has 14 tiles, plus one extra per kan (a kan meld holds 4 tiles
	// but counts as one set). Without the kan adjustment, any winning hand containing
	// a kan totals 15+ here and tsumo (incl. rinshan) was silently never offered.
	const totalTiles = player.hand.length + player.melds.reduce((s, m) => s + m.tiles.length, 0);
	const kanCount = player.melds.filter((m) => m.tiles.length === 4).length;
	if (totalTiles !== 14 + kanCount) return null;

	const isLastTile = state.wallPos >= state.wallEnd;
	const isFirstTake = player.discards.length === 0 && !state.anyCallMadeThisRound;

	const result = await checkWin({
		handCodes: player.hand.map((t) => t.code),
		openMelds: openMeldsFor(player),
		doraIndicators: state.doraIndicators,
		uraDoraIndicators: state.uraDoraIndicators,
		isRiichi: player.isRiichi,
		isDoubleRiichi: player.isDoubleRiichi,
		isIppatsu: player.isIppatsu,
		isTsumo: true,
		afterKan,
		firstTake: isFirstTake,
		lastTile: isLastTile,
		akaCount: countAka(player.hand) + countAka(meldTiles(player)),
		ronTileCode: null,
		seatWind: getSeatWind(seat, state.dealer),
		roundWind: getRoundWind(state.round)
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
		yaku: result.yaku,
		pointChanges
	};
}

export async function checkRon(
	state: GameState,
	claimantSeat: Seat,
	discardTile: GameTile,
	discarderSeat: Seat,
	// True when the "discard" is a tile being added to a kan (kakan) — riichi-rs
	// scores after_kan on a ron as chankan (vs rinshan on a tsumo).
	chankan = false
): Promise<RoundResult | null> {
	const player = state.players[claimantSeat];
	const isLastTile = state.wallPos >= state.wallEnd;

	const result = await checkWin({
		handCodes: player.hand.map((t) => t.code),
		openMelds: openMeldsFor(player),
		doraIndicators: state.doraIndicators,
		uraDoraIndicators: state.uraDoraIndicators,
		isRiichi: player.isRiichi,
		isDoubleRiichi: player.isDoubleRiichi,
		isIppatsu: player.isIppatsu,
		isTsumo: false,
		afterKan: chankan,
		lastTile: isLastTile,
		akaCount: countAka(player.hand) + countAka(meldTiles(player)) + countAka([discardTile]),
		ronTileCode: discardTile.code,
		seatWind: getSeatWind(claimantSeat, state.dealer),
		roundWind: getRoundWind(state.round)
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
		yaku: result.yaku,
		pointChanges
	};
}

// Ron check for an AI seat, with furiten enforced. AI seats don't maintain the
// isFuriten/isTempFuriten flags (those are only computed for the human, seat 0),
// so discard furiten is computed on demand — and only after a ron actually lands,
// keeping the expensive scan off the common no-win path. Temp furiten can't arise
// for AI seats: they never decline an available ron.
async function aiCheckRon(
	state: GameState,
	claimantSeat: Seat,
	discardTile: GameTile,
	discarderSeat: Seat,
	chankan = false
): Promise<RoundResult | null> {
	const ron = await checkRon(state, claimantSeat, discardTile, discarderSeat, chankan);
	if (!ron) return null;
	if (await computeOwnDiscardFuriten(state, claimantSeat)) return null;
	return ron;
}

export function applyRoundResult(state: GameState, result: RoundResult): GameState {
	const players = clonePlayers(state);
	for (let i = 0; i < 4; i++) {
		players[i].score += result.pointChanges[i];
	}
	players[result.winner].score += state.riichiBets * 1000;
	return { ...state, players, roundResult: result, phase: 'round_end', riichiBets: 0 };
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

function getDaiminkanOption(hand: GameTile[], calledTile: GameTile): ClaimOption | null {
	const matching = hand.filter((t) => t.code === calledTile.code);
	if (matching.length >= 3) {
		return { type: 'kan', handTiles: [matching[0], matching[1], matching[2]] };
	}
	return null;
}

function getAnkanOptions(player: PlayerState): TileCode[] {
	const counts = new Map<TileCode, number>();
	for (const t of player.hand) {
		counts.set(t.code, (counts.get(t.code) ?? 0) + 1);
	}
	const result: TileCode[] = [];
	for (const [code, count] of counts) {
		if (count >= 4) result.push(code);
	}
	return result;
}

function getKakanOptions(player: PlayerState): { meldIndex: number; code: TileCode }[] {
	const options: { meldIndex: number; code: TileCode }[] = [];
	for (let i = 0; i < player.melds.length; i++) {
		const meld = player.melds[i];
		if (meld.type === 'pon') {
			const code = meld.tiles[0].code;
			if (player.hand.some((t) => t.code === code)) {
				options.push({ meldIndex: i, code });
			}
		}
	}
	return options;
}

function drawRinshan(state: GameState, seat: Seat): GameState {
	if (state.rinshankPos >= 4) {
		return applyExhaustiveDraw(state);
	}

	const tile = state.deadWall[state.rinshankPos];
	const players = clonePlayers(state);
	players[seat].hand = [...players[seat].hand, tile];

	// Flip a new dora + ura dora indicator after each kan
	const newDoraIdx = 4 + state.doraIndicators.length;
	const newUraDoraIdx = 9 + state.uraDoraIndicators.length;
	const newDoraIndicators =
		newDoraIdx < 9 ? [...state.doraIndicators, state.deadWall[newDoraIdx]] : state.doraIndicators;
	const newUraDoraIndicators =
		newUraDoraIdx < state.deadWall.length
			? [...state.uraDoraIndicators, state.deadWall[newUraDoraIdx]]
			: state.uraDoraIndicators;

	return {
		...state,
		players,
		rinshankPos: state.rinshankPos + 1,
		// The dead wall replenishes from the live wall's tail, so the kan costs the
		// round its final draw — keeping total draws (and haitei timing) correct
		wallEnd: state.wallEnd - 1,
		doraIndicators: newDoraIndicators,
		uraDoraIndicators: newUraDoraIndicators,
		turnCount: state.turnCount + 1,
		phase: seat === 0 ? 'player_discard' : 'ai_turn',
		currentSeat: seat,
		pendingTsumo: null,
		pendingRon: null,
		claimOptions: null
	};
}

export function getHumanClaimOptions(
	state: GameState,
	discardTile: GameTile,
	discarderSeat: Seat
): ClaimOption[] {
	// A declared-riichi hand is locked: no chi/pon/(daimin)kan. Only ron remains,
	// and that is handled separately via pendingRon. Suppressing the options here
	// means the claim_decision is skipped entirely when only a call was available.
	if (state.players[0].isRiichi) return [];

	const hand = state.players[0].hand;
	const options: ClaimOption[] = [];

	const kan = getDaiminkanOption(hand, discardTile);
	if (kan) options.push(kan);

	const pon = getPonOption(hand, discardTile);
	if (pon) options.push(pon);

	options.push(...getChiOptions(hand, discardTile, discarderSeat, 0));

	return options;
}

// ── AI Call Decisions ──────────────────────────────────────────────────────────

function aiPonHandTiles(hand: GameTile[], calledTile: GameTile): [GameTile, GameTile] | null {
	if (getShanten(hand.map((t) => t.code)) === 0) return null;
	const matching = hand.filter((t) => t.code === calledTile.code);
	if (matching.length < 2) return null;
	return [matching[0], matching[1]];
}

function aiDaiminkanHandTiles(
	hand: GameTile[],
	calledTile: GameTile
): [GameTile, GameTile, GameTile] | null {
	if (getShanten(hand.map((t) => t.code)) === 0) return null;
	const matching = hand.filter((t) => t.code === calledTile.code);
	if (matching.length < 3) return null;
	return [matching[0], matching[1], matching[2]];
}

function aiChiHandTiles(
	hand: GameTile[],
	calledTile: GameTile,
	discarderSeat: Seat,
	chiSeat: Seat
): [GameTile, GameTile] | null {
	const opts = getChiOptions(hand, calledTile, discarderSeat, chiSeat);
	if (opts.length === 0) return null;
	const currentShanten = getShanten(hand.map((t) => t.code));
	if (currentShanten === 0) return null;

	let best: [GameTile, GameTile] | null = null;
	let bestShanten = currentShanten;
	for (const opt of opts) {
		const [tA, tB] = opt.handTiles;
		const remaining = hand.filter((t) => t.id !== tA.id && t.id !== tB.id);
		let minSh = 8;
		for (const t of remaining) {
			const sh = getShanten(remaining.filter((r) => r.id !== t.id).map((r) => r.code));
			if (sh < minSh) minSh = sh;
		}
		if (minSh < bestShanten) {
			bestShanten = minSh;
			best = [tA, tB];
		}
	}
	return best;
}

// A call is only legal if the caller still has a tile to discard afterward AND
// keeps at least one concealed tile (the tanki wait) — a hand may have at most 4
// melds, and a 4-meld hand must keep its single waiting tile. Calling into 4 melds
// + 0 concealed tiles is an illegal, undiscardable hand: runAiTurn then reads its
// 14 melded tiles as "post-call" (skips the draw) and chooseDiscard crashes on the
// empty hand, which the store swallows into a freeze.
// See notes/bugs/2026-06-05-ai-call-strands-hand-freeze.md.
//   `consumed`     — concealed tiles the call moves into the meld
//   `drawsRinshan` — kans draw a replacement tile (pon/chi do not)
// After the call the hand has (handLen - consumed + rinshan) tiles; we need ≥ 2 so
// that one can be discarded and ≥ 1 remains.
export function callKeepsLegalHand(
	handLen: number,
	consumed: number,
	drawsRinshan: boolean
): boolean {
	return handLen - consumed + (drawsRinshan ? 1 : 0) >= 2;
}

async function applyAiCalls(
	state: GameState,
	discardTile: GameTile,
	discarderSeat: Seat
): Promise<GameState> {
	// Check pon/daiminkan in turn order from discarder (closest seat wins)
	for (let offset = 1; offset <= 3; offset++) {
		const seat = ((discarderSeat + offset) % 4) as Seat;
		const player = state.players[seat];
		if (player.isHuman || player.isRiichi) continue;

		const daiminkanTiles = aiDaiminkanHandTiles(player.hand, discardTile);
		if (daiminkanTiles && callKeepsLegalHand(player.hand.length, 3, true)) {
			const meld: Meld = {
				type: 'daiminkan',
				tiles: [...daiminkanTiles, discardTile],
				calledFrom: discarderSeat
			};
			const players = clonePlayers(state);
			const ids = new Set(daiminkanTiles.map((t) => t.id));
			players[seat].hand = sortHand(player.hand.filter((t) => !ids.has(t.id)));
			players[seat].melds = [...player.melds, meld];
			for (const p of players) p.isIppatsu = false;
			const postKan = { ...state, players, anyCallMadeThisRound: true };
			const drawn = drawRinshan(postKan, seat);
			return { ...drawn, phase: 'ai_turn', currentSeat: seat };
		}

		const ponTiles = aiPonHandTiles(player.hand, discardTile);
		if (ponTiles && callKeepsLegalHand(player.hand.length, 2, false)) {
			const meld: Meld = {
				type: 'pon',
				tiles: [ponTiles[0], ponTiles[1], discardTile],
				calledFrom: discarderSeat
			};
			const players = clonePlayers(state);
			players[seat].hand = sortHand(
				player.hand.filter((t) => t.id !== ponTiles[0].id && t.id !== ponTiles[1].id)
			);
			players[seat].melds = [...player.melds, meld];
			for (const p of players) p.isIppatsu = false;
			return { ...state, players, anyCallMadeThisRound: true, phase: 'ai_turn', currentSeat: seat };
		}
	}

	// Check chi (only from the seat immediately after discarder)
	const chiSeat = ((discarderSeat + 1) % 4) as Seat;
	const chiPlayer = state.players[chiSeat];
	if (!chiPlayer.isHuman && !chiPlayer.isRiichi) {
		const chiTiles = aiChiHandTiles(chiPlayer.hand, discardTile, discarderSeat, chiSeat);
		if (chiTiles && callKeepsLegalHand(chiPlayer.hand.length, 2, false)) {
			const meld: Meld = {
				type: 'chi',
				tiles: sortHand([chiTiles[0], chiTiles[1], discardTile]),
				calledFrom: discarderSeat
			};
			const players = clonePlayers(state);
			players[chiSeat].hand = sortHand(
				chiPlayer.hand.filter((t) => t.id !== chiTiles[0].id && t.id !== chiTiles[1].id)
			);
			players[chiSeat].melds = [...chiPlayer.melds, meld];
			for (const p of players) p.isIppatsu = false;
			return {
				...state,
				players,
				anyCallMadeThisRound: true,
				phase: 'ai_turn',
				currentSeat: chiSeat
			};
		}
	}

	return state;
}

export async function humanDiscard(
	state: GameState,
	tileId: number,
	declareRiichi = false
): Promise<GameState> {
	if (state.phase !== 'player_discard' || state.currentSeat !== 0) return state;

	const player = state.players[0];
	const tile = player.hand.find((t) => t.id === tileId);
	if (!tile) return state;

	// Riichi is opt-in: the player must explicitly request it, and it is only legal
	// from a closed hand with 1000+ points that stays tenpai after this discard.
	// Without the flag the player simply discards and stays in quiet tenpai.
	const canDeclareRiichi =
		!player.isRiichi &&
		player.melds.length === 0 &&
		player.score >= 1000 &&
		// At least 4 live-wall tiles must remain so every player gets one more draw
		state.wallEnd - state.wallPos >= 4 &&
		getShanten(player.hand.filter((t) => t.id !== tileId).map((t) => t.code)) === 0;
	const willDeclareRiichi = declareRiichi && canDeclareRiichi;

	const players = clonePlayers(state);
	players[0].hand = sortHand(player.hand.filter((t) => t.id !== tileId));
	players[0].discards = [...player.discards, tile];

	if (player.isRiichi && player.isIppatsu) {
		// Post-riichi discard clears the ippatsu window
		players[0].isIppatsu = false;
	}

	if (willDeclareRiichi) {
		players[0].isRiichi = true;
		players[0].isIppatsu = true;
		players[0].isDoubleRiichi = player.discards.length === 0 && !state.anyCallMadeThisRound;
		players[0].riichiTile = tile;
		players[0].score -= 1000;
	}

	const postDiscard: GameState = {
		...state,
		players,
		riichiBets: willDeclareRiichi ? state.riichiBets + 1 : state.riichiBets,
		lastDiscard: tile,
		lastDiscardSeat: 0,
		phase: 'ai_turn',
		currentSeat: 1,
		pendingTsumo: null,
		pendingRon: null,
		claimOptions: null
	};

	// Recompute furiten flags after the discard
	const furitenPlayers = clonePlayers(postDiscard);
	furitenPlayers[0].isFuriten = await computeOwnDiscardFuriten(postDiscard, 0);
	// Temp furiten clears after discard, unless in riichi (riichi furiten is permanent)
	if (!furitenPlayers[0].isRiichi) {
		furitenPlayers[0].isTempFuriten = false;
	}
	const newState = { ...postDiscard, players: furitenPlayers };

	for (let s = 1; s < 4; s++) {
		const ron = await aiCheckRon(newState, s as Seat, tile, 0);
		if (ron) return applyRoundResult(newState, ron);
	}

	return applyAiCalls(newState, tile, 0);
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

function applyCall(state: GameState, players: ReturnType<typeof clonePlayers>): GameState {
	// Any call cancels ippatsu for all players and disqualifies first-take yaku
	for (const p of players) p.isIppatsu = false;
	return { ...state, players, anyCallMadeThisRound: true, pendingRon: null, claimOptions: null };
}

export function humanClaimPon(state: GameState, handTiles: GameTile[]): GameState {
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

	return { ...applyCall(state, players), phase: 'player_discard', currentSeat: 0 };
}

export function humanClaimChi(state: GameState, handTiles: GameTile[]): GameState {
	if (state.phase !== 'claim_decision' || !state.lastDiscard) return state;

	const calledTile = state.lastDiscard;
	const player = state.players[0];

	const meld: Meld = {
		type: 'chi',
		tiles: sortHand([handTiles[0], handTiles[1], calledTile]),
		calledFrom: state.lastDiscardSeat!
	};

	const players = clonePlayers(state);
	players[0].hand = sortHand(
		player.hand.filter((t) => t.id !== handTiles[0].id && t.id !== handTiles[1].id)
	);
	players[0].melds = [...player.melds, meld];

	return { ...applyCall(state, players), phase: 'player_discard', currentSeat: 0 };
}

export async function humanDeclareAnkan(state: GameState, code: TileCode): Promise<GameState> {
	if (state.phase !== 'player_discard' || state.currentSeat !== 0) return state;

	const player = state.players[0];
	const matching = player.hand.filter((t) => t.code === code);
	if (matching.length < 4) return state;

	const players = clonePlayers(state);
	players[0].hand = sortHand(player.hand.filter((t) => t.code !== code));
	players[0].melds = [
		...player.melds,
		{ type: 'ankan', tiles: matching.slice(0, 4), calledFrom: null }
	];
	// Ankan doesn't cancel ippatsu but does mark a call made
	for (const p of players) if (p.seat !== 0) p.isIppatsu = false;
	const postKan = { ...state, players, anyCallMadeThisRound: true };

	const drawn = drawRinshan(postKan, 0);
	const tsumo = await checkTsumo(drawn, 0, true);
	return { ...drawn, pendingTsumo: tsumo };
}

export async function humanDeclareKakan(state: GameState, meldIndex: number): Promise<GameState> {
	if (state.phase !== 'player_discard' || state.currentSeat !== 0) return state;

	const player = state.players[0];
	const meld = player.melds[meldIndex];
	if (!meld || meld.type !== 'pon') return state;

	const code = meld.tiles[0].code;
	const addedTile = player.hand.find((t) => t.code === code);
	if (!addedTile) return state;

	// Chankan: AI opponents can ron the added tile
	for (let s = 1; s < 4; s++) {
		const ron = await aiCheckRon(state, s as Seat, addedTile, 0, true);
		if (ron) return applyRoundResult(state, ron);
	}

	const players = clonePlayers(state);
	players[0].hand = sortHand(player.hand.filter((t) => t.id !== addedTile.id));
	players[0].melds = player.melds.map((m, i) =>
		i === meldIndex ? { ...m, type: 'kakan' as const, tiles: [...m.tiles, addedTile] } : m
	);
	for (const p of players) p.isIppatsu = false;
	const postKan = { ...state, players, anyCallMadeThisRound: true };

	const drawn = drawRinshan(postKan, 0);
	const tsumo = await checkTsumo(drawn, 0, true);
	return { ...drawn, pendingTsumo: tsumo };
}

export async function humanClaimDaiminkan(
	state: GameState,
	handTiles: GameTile[]
): Promise<GameState> {
	if (state.phase !== 'claim_decision' || !state.lastDiscard) return state;

	const calledTile = state.lastDiscard;
	const player = state.players[0];

	const meld: Meld = {
		type: 'daiminkan',
		tiles: [...handTiles, calledTile],
		calledFrom: state.lastDiscardSeat!
	};

	const players = clonePlayers(state);
	const handTileIds = new Set(handTiles.map((t) => t.id));
	players[0].hand = sortHand(player.hand.filter((t) => !handTileIds.has(t.id)));
	players[0].melds = [...player.melds, meld];

	const postKan = applyCall(state, players);
	const drawn = drawRinshan(postKan, 0);
	const tsumo = await checkTsumo(drawn, 0, true);
	return { ...drawn, pendingTsumo: tsumo };
}

export function getPlayerKanOptions(state: GameState): {
	ankan: TileCode[];
	kakan: { meldIndex: number; code: TileCode }[];
} {
	const player = state.players[0];
	return {
		ankan: getAnkanOptions(player),
		kakan: getKakanOptions(player)
	};
}

export async function humanPassClaim(state: GameState): Promise<GameState> {
	if (state.phase !== 'claim_decision') return state;
	if (!state.lastDiscard || state.lastDiscardSeat === null) return state;

	const discardTile = state.lastDiscard;
	const discarderSeat = state.lastDiscardSeat;
	const nextSeat = ((discarderSeat + 1) % 4) as Seat;

	// Passing on an available ron sets temp furiten (permanent if already in riichi)
	const players = clonePlayers(state);
	if (state.pendingRon !== null) {
		players[0].isTempFuriten = true;
	}

	const cleared: GameState = {
		...state,
		players,
		phase: 'ai_turn',
		pendingRon: null,
		claimOptions: null
	};

	// runAiTurn hands the decision to the human *before* it checks AI claims, so a
	// human pass must not silently forfeit them. Resolve the AI's claim on this same
	// discard in priority order — ron first, then pon/chi/daiminkan — before
	// advancing. Head-bump: among multiple winning seats, the one closest to the
	// discarder in turn order takes the ron.
	for (let offset = 1; offset <= 3; offset++) {
		const claimant = ((discarderSeat + offset) % 4) as Seat;
		if (claimant === 0) continue; // the human just passed
		const ron = await aiCheckRon(cleared, claimant, discardTile, discarderSeat);
		if (ron) return applyRoundResult(cleared, ron);
	}

	const afterAiCalls = await applyAiCalls(cleared, discardTile, discarderSeat);
	if (afterAiCalls !== cleared) return afterAiCalls;

	// No AI claimed — advance normally.
	if (nextSeat === 0) {
		const drawn = drawTile(cleared, 0);
		const tsumo = await checkTsumo(drawn, 0);
		return { ...drawn, pendingTsumo: tsumo };
	}

	return { ...cleared, currentSeat: nextSeat };
}

export async function runAiTurn(state: GameState): Promise<GameState> {
	const seat = state.currentSeat as Seat;
	if (state.players[seat].isHuman) return state;

	// After a pon/chi call the AI already holds the extra tile — skip draw and combat
	// yaku checks. A genuine post-call hand always has at least one concealed tile to
	// discard; requiring hand.length > 0 means a degenerate 0-concealed hand (which a
	// 4-meld bug could otherwise produce) draws normally instead of skipping the draw
	// into an empty hand and crashing chooseDiscard (the freeze). Belt-and-suspenders
	// with the callKeepsLegalHand gating that stops such hands forming in the first
	// place. See notes/bugs/2026-06-05-ai-call-strands-hand-freeze.md.
	const preDraw = state.players[seat];
	const totalTiles =
		preDraw.hand.length + preDraw.melds.reduce((acc, m) => acc + m.tiles.length, 0);
	const isPostCall = totalTiles >= 14 && preDraw.hand.length > 0;

	let s = isPostCall ? state : drawTile(state, seat);

	// The draw may have exhausted the wall — drawTile returns an exhaustive-draw
	// (round_end) state. Stop here: there's no turn to play and nothing to discard.
	// (Previously runAiTurn ran on through to chooseDiscard, which crashed on a
	// fully-melded hand. See notes/bugs/2026-06-05-ai-call-strands-hand-freeze.md.)
	if (s.phase === 'round_end') return s;

	if (!isPostCall) {
		const tsumo = await checkTsumo(s, seat);
		if (tsumo) return applyRoundResult(s, tsumo);
	}

	// Good AI declares kan when possible (normal turns only)
	if (!isPostCall && s.players[seat].difficulty === 'good') {
		const ankanCodes = getAnkanOptions(s.players[seat]);
		if (ankanCodes.length > 0 && callKeepsLegalHand(s.players[seat].hand.length, 4, true)) {
			const code = ankanCodes[0];
			const aiPlayer = s.players[seat];
			const matching = aiPlayer.hand.filter((t) => t.code === code);
			const players = clonePlayers(s);
			players[seat].hand = sortHand(aiPlayer.hand.filter((t) => t.code !== code));
			players[seat].melds = [
				...aiPlayer.melds,
				{ type: 'ankan' as const, tiles: matching.slice(0, 4), calledFrom: null }
			];
			for (const p of players) if (p.seat !== seat) p.isIppatsu = false;
			s = drawRinshan({ ...s, players, anyCallMadeThisRound: true }, seat);
			const kanTsumo = await checkTsumo(s, seat, true);
			if (kanTsumo) return applyRoundResult(s, kanTsumo);
		}

		const kakanOpts = getKakanOptions(s.players[seat]);
		if (kakanOpts.length > 0 && callKeepsLegalHand(s.players[seat].hand.length, 1, true)) {
			const { meldIndex, code } = kakanOpts[0];
			const aiPlayer = s.players[seat];
			const addedTile = aiPlayer.hand.find((t) => t.code === code);
			if (addedTile) {
				// Chankan: check if human can ron the added tile (furiten blocks it,
				// same as a ron on a normal discard)
				const human = s.players[0];
				const humanRon =
					human.isFuriten || human.isTempFuriten
						? null
						: await checkRon(s, 0, addedTile, seat, true);
				if (humanRon) return applyRoundResult(s, humanRon);

				const players = clonePlayers(s);
				players[seat].hand = sortHand(aiPlayer.hand.filter((t) => t.id !== addedTile.id));
				players[seat].melds = aiPlayer.melds.map((m, i) =>
					i === meldIndex ? { ...m, type: 'kakan' as const, tiles: [...m.tiles, addedTile] } : m
				);
				for (const p of players) p.isIppatsu = false;
				s = drawRinshan({ ...s, players, anyCallMadeThisRound: true }, seat);
				const kanTsumo = await checkTsumo(s, seat, true);
				if (kanTsumo) return applyRoundResult(s, kanTsumo);
			}
		}
	}

	// A kan's rinshan draw can also exhaust the wall — same bail before discarding.
	if (s.phase === 'round_end') return s;

	// Decide riichi before choosing the discard: the declaring turn picks among
	// tenpai-keeping discards, while a hand already in riichi must tsumogiri —
	// chooseDiscard needs to know which case this is.
	const declaringRiichi = !isPostCall && shouldDeclareRiichi(seat, s);
	if (declaringRiichi) {
		const players = clonePlayers(s);
		players[seat].isRiichi = true;
		players[seat].isIppatsu = true;
		players[seat].isDoubleRiichi = s.players[seat].discards.length === 0 && !s.anyCallMadeThisRound;
		players[seat].score -= 1000;
		s = { ...s, players, riichiBets: s.riichiBets + 1 };
	}

	const discardTile = chooseDiscard(seat, s, declaringRiichi);
	const players = clonePlayers(s);
	players[seat].hand = sortHand(s.players[seat].hand.filter((t) => t.id !== discardTile.id));
	players[seat].discards = [...s.players[seat].discards, discardTile];
	// Post-riichi discard clears this AI player's ippatsu window
	if (s.players[seat].isRiichi && s.players[seat].isIppatsu) {
		players[seat].isIppatsu = false;
	}

	const nextSeat = ((seat + 1) % 4) as Seat;
	s = {
		...s,
		players,
		lastDiscard: discardTile,
		currentSeat: nextSeat,
		lastDiscardSeat: seat,
		phase: 'ai_turn'
	};

	// Check all human claim options: ron, pon, chi
	// Ron is blocked if player is in any form of furiten
	const humanPlayer = s.players[0];
	const inFuriten = humanPlayer.isFuriten || humanPlayer.isTempFuriten;
	const humanRon = inFuriten ? null : await checkRon(s, 0, discardTile, seat);
	const claimOptions = getHumanClaimOptions(s, discardTile, seat);

	if (humanRon || claimOptions.length > 0) {
		return {
			...s,
			phase: 'claim_decision',
			pendingRon: humanRon,
			claimOptions
		};
	}

	// Check AI ron — in turn order from the discarder, so a head-bump between two
	// waiting seats goes to the closer one
	for (let offset = 1; offset <= 3; offset++) {
		const claimant = ((seat + offset) % 4) as Seat;
		if (state.players[claimant].isHuman) continue;
		const ron = await aiCheckRon(s, claimant, discardTile, seat);
		if (ron) return applyRoundResult(s, ron);
	}

	// Check AI pon/chi/daiminkan
	const afterAiCalls = await applyAiCalls(s, discardTile, seat);
	if (afterAiCalls !== s) return afterAiCalls;

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
		melds: [...p.melds],
		isFuriten: p.isFuriten,
		isTempFuriten: p.isTempFuriten
	})) as [PlayerState, PlayerState, PlayerState, PlayerState];
}

async function computeOwnDiscardFuriten(state: GameState, seat: Seat): Promise<boolean> {
	const player = state.players[seat];
	if (player.discards.length === 0) return false;
	const uniqueCodes = [...new Set(player.discards.map((t) => t.code))];
	for (const code of uniqueCodes) {
		const result = await checkWin({
			handCodes: player.hand.map((t) => t.code),
			openMelds: openMeldsFor(player),
			doraIndicators: state.doraIndicators,
			uraDoraIndicators: state.uraDoraIndicators,
			isRiichi: player.isRiichi,
			isDoubleRiichi: player.isDoubleRiichi,
			isIppatsu: player.isIppatsu,
			isTsumo: false,
			ronTileCode: code,
			seatWind: getSeatWind(seat, state.dealer),
			roundWind: getRoundWind(state.round)
		});
		if (result.isWin) return true;
	}
	return false;
}
