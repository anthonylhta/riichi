import { createWall, shuffleTiles, TC, isSimple } from './tiles';
import type { GameTile, TileCode } from './tiles';
import type {
	AbortReason,
	ClaimOption,
	ExhaustiveDrawResult,
	GameState,
	Meld,
	PlayerState,
	RoundResult,
	Seat
} from './types';
import { chooseDiscard, getShanten, riichiAnkanKeepsWaits, shouldDeclareRiichi } from './ai';
import { checkWin } from './scoring';
import type { GameEvent, Scores } from './events';

// Append one event to the game record (see events.ts). Every observable action
// goes through here so exports can read the game without re-deriving it.
function pushEvent(state: GameState, ev: GameEvent): GameState {
	return { ...state, events: [...state.events, ev] };
}

function currentScores(players: GameState['players']): Scores {
	return players.map((p) => p.score) as Scores;
}

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
		isTempFuriten: false,
		kuikaeForbidden: [],
		anyDiscardCalled: false,
		paoSeat: null
	};
}

// Kuikae (swap-call ban): the tile codes a seat may not discard on the turn
// immediately following a chi/pon. After a pon it's just the called tile
// (genbutsu). After a chi it's the called tile PLUS the "suji" other end —
// the tile that, with the same two hand tiles, would have formed the
// equivalent run from the opposite side (only when the call completes an end
// of the run, not a kanchan middle). Codes only; red-five flavour is irrelevant.
export function kuikaeForbiddenCodes(
	callType: 'pon' | 'chi',
	calledCode: TileCode,
	consumedCodes: TileCode[]
): TileCode[] {
	if (callType === 'pon') return [calledCode];

	const forbidden = [calledCode];
	const [lo, , hi] = [...consumedCodes, calledCode].sort((a, b) => a - b);
	const suitStart = Math.floor((calledCode - 1) / 9) * 9 + 1;
	const suitEnd = suitStart + 8;
	if (calledCode === lo && hi + 1 <= suitEnd)
		forbidden.push(hi + 1); // called the low end → swap is one past the high end
	else if (calledCode === hi && lo - 1 >= suitStart) forbidden.push(lo - 1); // called the high end → swap is one below the low end
	return forbidden;
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
	wall?: GameTile[],
	// The game-so-far event record; initRound builds a fresh state, so prior
	// rounds' events must be carried in explicitly (continueGame passes them).
	priorEvents: GameEvent[] = []
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
		pendingKanDora: 0,
		anyCallMadeThisRound: false,
		riichiBets,
		pendingRiichi: null,
		players,
		lastDiscard: null,
		lastDiscardSeat: null,
		pendingTsumo: null,
		pendingRon: null,
		claimOptions: null,
		roundResult: null,
		exhaustiveDrawResult: null,
		abortiveDraw: null,
		events: [
			...priorEvents,
			{
				type: 'round_start',
				round,
				honba,
				riichiBets,
				dealer,
				doraIndicator: doraIndicators[0],
				hands: players.map((p) => [...p.hand]) as [GameTile[], GameTile[], GameTile[], GameTile[]],
				scores: currentScores(players)
			}
		]
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
	let players = state.players;
	if (state.riichiBets > 0) {
		const top = state.players.reduce((best, p) => (p.score > best.score ? p : best));
		players = clonePlayers(state);
		players[top.seat].score += state.riichiBets * 1000;
	}
	const ended: GameState = { ...state, players, riichiBets: 0, phase: 'game_end' };
	return pushEvent(ended, { type: 'game_end', scores: currentScores(players) });
}

export function continueGame(state: GameState, wall?: GameTile[]): GameState {
	if (state.phase !== 'round_end') return state;

	const result = state.roundResult;
	let nextDealer = state.dealer;
	let nextHonba = state.honba;
	let nextRound = state.round;

	if (result === null) {
		// Any draw bumps honba. An abortive draw (kyuushu/suufon/suucha-riichi/
		// suukaikan/sanchahou) voids the hand and the dealer always keeps the deal.
		// An ordinary exhaustive draw keeps the dealer only on tenpai (or nagashi);
		// a noten dealer passes — otherwise a noten draw repeats the hand forever.
		nextHonba++;
		if (state.abortiveDraw === null) {
			const dealerTenpai = state.exhaustiveDrawResult?.tenpaiSeats.includes(state.dealer) ?? false;
			const dealerNagashi =
				state.exhaustiveDrawResult?.nagashiSeats.includes(state.dealer) ?? false;
			if (!dealerTenpai && !dealerNagashi) {
				nextDealer = ((state.dealer + 1) % 4) as Seat;
				nextRound++;
			}
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
	return initRound(scores, nextDealer, nextRound, nextHonba, carryBets, wall, state.events);
}

// A seat scores nagashi mangan if every one of its discards is a terminal/honor
// and none of them was ever called by another seat (anyDiscardCalled). A seat
// with no discards at all does not qualify.
function nagashiSeatsOf(state: GameState): Seat[] {
	const seats: Seat[] = [];
	for (let seat = 0; seat < 4; seat++) {
		const p = state.players[seat];
		if (p.discards.length === 0 || p.anyDiscardCalled) continue;
		if (p.discards.every((t) => !isSimple(t.code))) seats.push(seat as Seat);
	}
	return seats;
}

function applyExhaustiveDraw(state: GameState): GameState {
	const tenpaiSeats: Seat[] = [];
	for (let seat = 0; seat < 4; seat++) {
		const handCodes = state.players[seat].hand.map((t) => t.code);
		if (getShanten(handCodes) === 0) {
			tenpaiSeats.push(seat as Seat);
		}
	}

	const nagashiSeats = nagashiSeatsOf(state);
	const pointChanges: [number, number, number, number] = [0, 0, 0, 0];

	if (nagashiSeats.length > 0) {
		// Nagashi mangan is paid like a tsumo (dealer 12000 = 4000 all; non-dealer
		// 8000 = 4000/2000/2000), and REPLACES the ordinary tenpai/noten exchange
		// (Tenhou / MJ Soul). Multiple nagashi each settle independently.
		for (const seat of nagashiSeats) {
			if (seat === state.dealer) {
				for (let i = 0; i < 4; i++) pointChanges[i] += i === seat ? 12000 : -4000;
			} else {
				for (let i = 0; i < 4; i++) {
					if (i === seat) pointChanges[i] += 8000;
					else pointChanges[i] += i === state.dealer ? -4000 : -2000;
				}
			}
		}
	} else {
		const tenpaiCount = tenpaiSeats.length;
		const notenCount = 4 - tenpaiCount;
		if (tenpaiCount > 0 && tenpaiCount < 4) {
			const tenpaiGain = 3000 / tenpaiCount;
			const notenLoss = 3000 / notenCount;
			for (let seat = 0; seat < 4; seat++) {
				pointChanges[seat] = tenpaiSeats.includes(seat as Seat) ? tenpaiGain : -notenLoss;
			}
		}
	}

	const players = clonePlayers(state);
	for (let i = 0; i < 4; i++) {
		players[i].score += pointChanges[i];
	}

	const exhaustiveDrawResult: ExhaustiveDrawResult = { tenpaiSeats, pointChanges, nagashiSeats };
	const ended: GameState = {
		...state,
		players,
		phase: 'round_end',
		roundResult: null,
		exhaustiveDrawResult
	};
	return pushEvent(ended, { type: 'ryuukyoku', tenpaiSeats, deltas: pointChanges });
}

// End the round as an abortive draw: the hand is voided (no scoring), and a
// zeroed exhaustive-draw result is set so the round-end draw overlay still
// renders. continueGame reads `abortiveDraw` to keep the dealer's deal.
function applyAbortiveDraw(state: GameState, reason: AbortReason): GameState {
	const ended: GameState = {
		...state,
		phase: 'round_end',
		roundResult: null,
		exhaustiveDrawResult: { tenpaiSeats: [], pointChanges: [0, 0, 0, 0], nagashiSeats: [] },
		abortiveDraw: reason
	};
	return pushEvent(ended, {
		type: 'ryuukyoku',
		tenpaiSeats: [],
		deltas: [0, 0, 0, 0],
		abortive: reason
	});
}

// Suukaikan: four kans exist across two or more seats. Four kans by ONE seat is
// suukantsu (tenpai) and does NOT abort — only a split set of four does.
function suukaikanAbort(state: GameState): boolean {
	let total = 0;
	const seatsWithKan = new Set<number>();
	for (const p of state.players) {
		const kans = p.melds.filter((m) => m.tiles.length === 4).length;
		total += kans;
		if (kans > 0) seatsWithKan.add(p.seat);
	}
	return total >= 4 && seatsWithKan.size >= 2;
}

const WIND_CODES: TileCode[] = [TC.EAST, TC.SOUTH, TC.WEST, TC.NORTH];

// Abort conditions evaluated right after a discard has survived every ron check,
// before any call on it: suukaikan, suucha riichi (all four in riichi), and
// suufon renda (all four discarded the same wind on the uninterrupted first
// go-around). Returns the aborted round-end state, or null to continue play.
function checkAbortAfterDiscard(state: GameState): GameState | null {
	if (suukaikanAbort(state)) return applyAbortiveDraw(state, 'suukaikan');
	if (state.players.every((p) => p.isRiichi)) return applyAbortiveDraw(state, 'suucha-riichi');
	const firstWind = state.players[0].discards[0];
	if (
		!state.anyCallMadeThisRound &&
		state.players.every((p) => p.discards.length === 1) &&
		firstWind &&
		WIND_CODES.includes(firstWind.code) &&
		state.players.every((p) => p.discards[0].code === firstWind.code)
	) {
		return applyAbortiveDraw(state, 'suufon');
	}
	return null;
}

// Kyuushu kyuuhai: a player may abort on their first uninterrupted draw (no calls
// yet, no discard yet) if the 14-tile hand holds 9+ distinct terminals/honors.
function distinctTerminalsHonors(hand: GameTile[]): number {
	const codes = new Set<TileCode>();
	for (const t of hand) if (!isSimple(t.code)) codes.add(t.code);
	return codes.size;
}

export function canDeclareKyuushu(state: GameState): boolean {
	if (state.phase !== 'player_discard' || state.currentSeat !== 0) return false;
	const player = state.players[0];
	return (
		!state.anyCallMadeThisRound &&
		player.discards.length === 0 &&
		player.melds.length === 0 &&
		distinctTerminalsHonors(player.hand) >= 9
	);
}

export function humanDeclareKyuushu(state: GameState): GameState {
	if (!canDeclareKyuushu(state)) return state;
	return applyAbortiveDraw(state, 'kyuushu');
}

function drawTile(state: GameState, seat: Seat): GameState {
	if (state.wallPos >= state.wallEnd) {
		return applyExhaustiveDraw(state);
	}

	const tile = state.liveWall[state.wallPos];
	const players = clonePlayers(state);
	players[seat].hand = [...players[seat].hand, tile];

	const drawn: GameState = {
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
	return pushEvent(drawn, { type: 'draw', seat, tile, rinshan: false });
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

// Pao (sekinin barai): after a fed pon/daiminkan of a dragon or wind, the feeder
// becomes liable if this completes a daisangen (3 dragon triplet/quad melds) or a
// daisuushii (4 wind triplet/quad melds). A chi can never form one; a concealed
// triplet or ankan has no feeder, so pao is only ever evaluated on a call path.
function paoLiableSeat(melds: Meld[], feeder: Seat): Seat | null {
	const triplets = melds.filter((m) => m.type !== 'chi');
	const dragonMelds = triplets.filter((m) => m.tiles[0].code >= TC.HAKU).length;
	if (dragonMelds === 3) return feeder;
	const windMelds = triplets.filter(
		(m) => m.tiles[0].code >= TC.EAST && m.tiles[0].code <= TC.NORTH
	).length;
	if (windMelds === 4) return feeder;
	return null;
}

// A win is pao-liable only when it actually contains the big-three or big-four-
// winds yakuman the pao was attached to.
function isPaoYakuman(yaku: { name: string }[]): boolean {
	return yaku.some((y) => y.name === 'Daisangen' || y.name === 'Daisuushi');
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

	// Pao tsumo: the liable feeder pays the ENTIRE hand (plus all the honba), the
	// other two opponents pay nothing.
	if (player.paoSeat !== null && isPaoYakuman(result.yaku)) {
		const total = result.score + state.honba * 300;
		pointChanges[seat] = total;
		pointChanges[player.paoSeat] = -total;
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
	pointChanges[claimantSeat] = total;

	// Pao ron: the liable feeder splits the hand value with the discarder (the
	// discarder also covers the honba). When the discarder IS the pao seat, they
	// simply pay all of it.
	const paoSeat = player.paoSeat;
	if (paoSeat !== null && paoSeat !== discarderSeat && isPaoYakuman(result.yaku)) {
		pointChanges[discarderSeat] = -(result.score / 2 + honbaBonus);
		pointChanges[paoSeat] = -(result.score / 2);
	} else {
		pointChanges[discarderSeat] = -total;
	}

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

// Robbing an ankan (chankan on a concealed kan) is legal for KOKUSHI MUSOU ONLY —
// unlike a kakan, which any wait can rob. A normal wait that happens to complete
// on the kanned tile must NOT win here, so we keep the ron only when the hand is
// kokushi (single- or 13-sided wait). Furiten is enforced by the caller's ron path
// (aiCheckRon for AI, the human's flags), so this is a pure post-filter on the win.
function asKokushiRob(ron: RoundResult | null): RoundResult | null {
	if (!ron) return null;
	return ron.yaku.some((y) => y.name.startsWith('Kokushi')) ? ron : null;
}

export function applyRoundResult(
	state: GameState,
	result: RoundResult,
	// The winning tile when the state can't tell us: a chankan ron is checked
	// BEFORE the kakan meld is applied, so state.lastDiscard is stale there.
	winTile?: GameTile
): GameState {
	const players = clonePlayers(state);
	for (let i = 0; i < 4; i++) {
		players[i].score += result.pointChanges[i];
	}
	players[result.winner].score += state.riichiBets * 1000;

	// Tsumo: the drawn tile is the last in the (unsorted) hand — drawTile and
	// drawRinshan both append. Ron: the tile is the live last discard.
	const winnerHand = state.players[result.winner].hand;
	const tile =
		winTile ??
		(result.winType === 'tsumo' ? (winnerHand[winnerHand.length - 1] ?? null) : state.lastDiscard);
	const deltas = result.pointChanges.map((d, i) =>
		i === result.winner ? d + state.riichiBets * 1000 : d
	) as Scores;

	const ended: GameState = {
		...state,
		players,
		roundResult: result,
		phase: 'round_end',
		riichiBets: 0
	};
	return pushEvent(ended, {
		type: 'win',
		seat: result.winner,
		from: result.loser,
		tile,
		han: result.han,
		fu: result.fu,
		score: result.score,
		yaku: result.yaku,
		deltas,
		uraIndicators: state.players[result.winner].isRiichi ? [...state.uraDoraIndicators] : []
	});
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

// No kan of any kind when the live wall is empty — the dead wall replenishes
// from the live wall's tail (ADR 0042), so there must be a tile left to claim
// (and a rinshan draw with wallEnd already at wallPos would go negative). The
// rinshan check makes a 5th kan simply never offered, rather than tripping
// drawRinshan's rinshankPos >= 4 exhaustive-draw fallback.
function canKan(state: GameState): boolean {
	return state.wallEnd - state.wallPos >= 1 && state.rinshankPos < 4;
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
	// A riichi hand is locked: ankan is legal only on the just-drawn tile (the
	// hand's last — draws append, sorting happens on discard, and a riichi hand
	// can't call) and only when it leaves the wait unchanged. This single gate
	// covers every offer site, human (getPlayerKanOptions) and AI (runAiTurn).
	if (player.isRiichi) {
		const drawn = player.hand[player.hand.length - 1];
		return result.filter(
			(code) =>
				code === drawn.code &&
				riichiAnkanKeepsWaits(
					player.hand.map((t) => t.code),
					code
				)
		);
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

// Flip the next dora + ura indicator pair. Indicator slots are capped at five
// (deadWall[4..8] / [9..13]); a kan beyond that reveals nothing more.
function revealNextKanDora(state: GameState): GameState {
	const newDoraIdx = 4 + state.doraIndicators.length;
	const newUraDoraIdx = 9 + state.uraDoraIndicators.length;
	if (newDoraIdx >= 9) return state;
	const indicator = state.deadWall[newDoraIdx];
	const revealed: GameState = {
		...state,
		doraIndicators: [...state.doraIndicators, indicator],
		uraDoraIndicators:
			newUraDoraIdx < state.deadWall.length
				? [...state.uraDoraIndicators, state.deadWall[newUraDoraIdx]]
				: state.uraDoraIndicators
	};
	return pushEvent(revealed, { type: 'dora', indicator });
}

// Commit deferred minkan dora, one indicator pair per pending kan. Called once
// the kan player's discard has survived every ron check — a ron on that discard
// ends the round with these still face-down (the new indicator doesn't count).
function revealPendingKanDora(state: GameState): GameState {
	let s = state;
	while (s.pendingKanDora > 0) {
		s = revealNextKanDora({ ...s, pendingKanDora: s.pendingKanDora - 1 });
	}
	return s;
}

// Complete a pending riichi: the 1000-point stick is paid and joins the table
// pool. The declaration's flags (isRiichi, ippatsu window, riichi tile) are set
// at the discard; only the payment waits for the discard to survive every ron
// check, so a ron on the riichi tile itself costs the declarer no stick.
function settleRiichiStick(state: GameState): GameState {
	if (state.pendingRiichi === null) return state;
	const players = clonePlayers(state);
	players[state.pendingRiichi].score -= 1000;
	return { ...state, players, riichiBets: state.riichiBets + 1, pendingRiichi: null };
}

// Effects that wait for a discard to survive every ron check: deferred minkan
// dora reveals (ADR 0049) and the riichi stick payment (ADR 0050).
function settleDiscard(state: GameState): GameState {
	return settleRiichiStick(revealPendingKanDora(state));
}

// `revealNow` — an ankan flips its new dora indicator immediately; a daiminkan
// or kakan defers it (pendingKanDora) until the kan player's discard settles.
function drawRinshan(state: GameState, seat: Seat, revealNow: boolean): GameState {
	if (state.rinshankPos >= 4) {
		return applyExhaustiveDraw(state);
	}

	const tile = state.deadWall[state.rinshankPos];
	const players = clonePlayers(state);
	players[seat].hand = [...players[seat].hand, tile];

	let drawn: GameState = {
		...state,
		players,
		rinshankPos: state.rinshankPos + 1,
		// The dead wall replenishes from the live wall's tail, so the kan costs the
		// round its final draw — keeping total draws (and haitei timing) correct
		wallEnd: state.wallEnd - 1,
		turnCount: state.turnCount + 1,
		phase: seat === 0 ? 'player_discard' : 'ai_turn',
		currentSeat: seat,
		pendingTsumo: null,
		pendingRon: null,
		claimOptions: null
	};
	drawn = pushEvent(drawn, { type: 'draw', seat, tile, rinshan: true });
	return revealNow
		? revealNextKanDora(drawn)
		: { ...drawn, pendingKanDora: drawn.pendingKanDora + 1 };
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

	const kan = canKan(state) ? getDaiminkanOption(hand, discardTile) : null;
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

		const daiminkanTiles = canKan(state) ? aiDaiminkanHandTiles(player.hand, discardTile) : null;
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
			players[discarderSeat].anyDiscardCalled = true;
			players[seat].paoSeat =
				paoLiableSeat(players[seat].melds, discarderSeat) ?? players[seat].paoSeat;
			for (const p of players) p.isIppatsu = false;
			const postKan = pushEvent(
				{ ...state, players, anyCallMadeThisRound: true },
				{
					type: 'call',
					call: 'daiminkan',
					seat,
					from: discarderSeat,
					tile: discardTile,
					consumed: [...daiminkanTiles]
				}
			);
			const drawn = drawRinshan(postKan, seat, false);
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
			players[seat].kuikaeForbidden = kuikaeForbiddenCodes('pon', discardTile.code, [
				ponTiles[0].code,
				ponTiles[1].code
			]);
			players[discarderSeat].anyDiscardCalled = true;
			players[seat].paoSeat =
				paoLiableSeat(players[seat].melds, discarderSeat) ?? players[seat].paoSeat;
			for (const p of players) p.isIppatsu = false;
			return pushEvent(
				{ ...state, players, anyCallMadeThisRound: true, phase: 'ai_turn', currentSeat: seat },
				{
					type: 'call',
					call: 'pon',
					seat,
					from: discarderSeat,
					tile: discardTile,
					consumed: [ponTiles[0], ponTiles[1]]
				}
			);
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
			players[chiSeat].kuikaeForbidden = kuikaeForbiddenCodes('chi', discardTile.code, [
				chiTiles[0].code,
				chiTiles[1].code
			]);
			players[discarderSeat].anyDiscardCalled = true;
			for (const p of players) p.isIppatsu = false;
			return pushEvent(
				{
					...state,
					players,
					anyCallMadeThisRound: true,
					phase: 'ai_turn',
					currentSeat: chiSeat
				},
				{
					type: 'call',
					call: 'chi',
					seat: chiSeat,
					from: discarderSeat,
					tile: discardTile,
					consumed: [chiTiles[0], chiTiles[1]]
				}
			);
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
	// Kuikae: the called tile (and chi suji other-end) can't be discarded on the
	// turn right after the call. Reject it — the UI also disables these tiles.
	if (player.kuikaeForbidden.includes(tile.code)) return state;

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
	players[0].kuikaeForbidden = []; // the post-call restriction lasts one discard

	if (player.isRiichi && player.isIppatsu) {
		// Post-riichi discard clears the ippatsu window
		players[0].isIppatsu = false;
	}

	if (willDeclareRiichi) {
		players[0].isRiichi = true;
		players[0].isIppatsu = true;
		players[0].isDoubleRiichi = player.discards.length === 0 && !state.anyCallMadeThisRound;
		players[0].riichiTile = tile;
		// The stick is NOT paid here — payment waits for the discard to survive
		// the ron checks below (settleDiscard / the claim handlers).
	}

	const postDiscard: GameState = {
		...state,
		players,
		pendingRiichi: willDeclareRiichi ? 0 : state.pendingRiichi,
		lastDiscard: tile,
		lastDiscardSeat: 0,
		phase: 'ai_turn',
		currentSeat: 1,
		pendingTsumo: null,
		pendingRon: null,
		claimOptions: null,
		events: [...state.events, { type: 'discard', seat: 0, tile, riichi: willDeclareRiichi }]
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

	// The discard survived every ron check — flip any deferred minkan dora and
	// complete a pending riichi.
	const settled = settleDiscard(newState);
	const aborted = checkAbortAfterDiscard(settled);
	if (aborted) return aborted;
	return applyAiCalls(settled, tile, 0);
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
	// Claiming the discard means it wasn't ronned — flip any deferred minkan
	// dora and complete a pending riichi.
	state = settleDiscard(state);
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
	players[0].kuikaeForbidden = kuikaeForbiddenCodes('pon', calledTile.code, [
		handTiles[0].code,
		handTiles[1].code
	]);
	players[state.lastDiscardSeat!].anyDiscardCalled = true;
	players[0].paoSeat =
		paoLiableSeat(players[0].melds, state.lastDiscardSeat!) ?? players[0].paoSeat;

	const called = pushEvent(applyCall(state, players), {
		type: 'call',
		call: 'pon',
		seat: 0,
		from: state.lastDiscardSeat!,
		tile: calledTile,
		consumed: [handTiles[0], handTiles[1]]
	});
	return { ...called, phase: 'player_discard', currentSeat: 0 };
}

export function humanClaimChi(state: GameState, handTiles: GameTile[]): GameState {
	if (state.phase !== 'claim_decision' || !state.lastDiscard) return state;
	const calledTile = state.lastDiscard;
	// Claiming the discard means it wasn't ronned — flip any deferred minkan
	// dora and complete a pending riichi.
	state = settleDiscard(state);
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
	players[0].kuikaeForbidden = kuikaeForbiddenCodes('chi', calledTile.code, [
		handTiles[0].code,
		handTiles[1].code
	]);
	players[state.lastDiscardSeat!].anyDiscardCalled = true;

	const called = pushEvent(applyCall(state, players), {
		type: 'call',
		call: 'chi',
		seat: 0,
		from: state.lastDiscardSeat!,
		tile: calledTile,
		consumed: [handTiles[0], handTiles[1]]
	});
	return { ...called, phase: 'player_discard', currentSeat: 0 };
}

export async function humanDeclareAnkan(state: GameState, code: TileCode): Promise<GameState> {
	if (state.phase !== 'player_discard' || state.currentSeat !== 0) return state;
	if (!canKan(state)) return state;

	const player = state.players[0];
	// Validate through the same gate that offers the kan — in riichi this also
	// enforces just-drawn-tile-only and wait preservation.
	if (!getAnkanOptions(player).includes(code)) return state;
	const matching = player.hand.filter((t) => t.code === code);

	// The ankan is recorded before the chankan-rob check — a robbed kan still
	// happened, and the record shows the ankan followed by the ron. Only kokushi
	// may rob an ankan.
	const declared = pushEvent(state, { type: 'ankan', seat: 0, consumed: matching.slice(0, 4) });
	const robbedTile = matching[0];
	for (let s = 1; s < 4; s++) {
		const ron = asKokushiRob(await aiCheckRon(declared, s as Seat, robbedTile, 0, true));
		if (ron) return applyRoundResult(declared, ron, robbedTile);
	}

	const players = clonePlayers(declared);
	players[0].hand = sortHand(player.hand.filter((t) => t.code !== code));
	players[0].melds = [
		...player.melds,
		{ type: 'ankan', tiles: matching.slice(0, 4), calledFrom: null }
	];
	// ANY call breaks ippatsu for everyone — including the kan declarer's own.
	// (Riichi → ankan → rinshan tsumo scores rinshan only, never ippatsu.)
	for (const p of players) p.isIppatsu = false;
	const postKan = { ...declared, players, anyCallMadeThisRound: true };

	const drawn = drawRinshan(postKan, 0, true);
	const tsumo = await checkTsumo(drawn, 0, true);
	return { ...drawn, pendingTsumo: tsumo };
}

export async function humanDeclareKakan(state: GameState, meldIndex: number): Promise<GameState> {
	if (state.phase !== 'player_discard' || state.currentSeat !== 0) return state;
	if (!canKan(state)) return state;

	const player = state.players[0];
	const meld = player.melds[meldIndex];
	if (!meld || meld.type !== 'pon') return state;

	const code = meld.tiles[0].code;
	const addedTile = player.hand.find((t) => t.code === code);
	if (!addedTile) return state;

	// The kakan is declared (and recorded) before the chankan check — a robbed
	// kan still happened, and the record shows the kakan followed by the ron.
	const declared = pushEvent(state, {
		type: 'kakan',
		seat: 0,
		tile: addedTile,
		consumed: [...meld.tiles]
	});

	// Chankan: AI opponents can ron the added tile
	for (let s = 1; s < 4; s++) {
		const ron = await aiCheckRon(declared, s as Seat, addedTile, 0, true);
		if (ron) return applyRoundResult(declared, ron, addedTile);
	}

	const players = clonePlayers(declared);
	players[0].hand = sortHand(player.hand.filter((t) => t.id !== addedTile.id));
	players[0].melds = player.melds.map((m, i) =>
		i === meldIndex ? { ...m, type: 'kakan' as const, tiles: [...m.tiles, addedTile] } : m
	);
	for (const p of players) p.isIppatsu = false;
	const postKan = { ...declared, players, anyCallMadeThisRound: true };

	const drawn = drawRinshan(postKan, 0, false);
	const tsumo = await checkTsumo(drawn, 0, true);
	return { ...drawn, pendingTsumo: tsumo };
}

export async function humanClaimDaiminkan(
	state: GameState,
	handTiles: GameTile[]
): Promise<GameState> {
	if (state.phase !== 'claim_decision' || !state.lastDiscard) return state;
	if (!canKan(state)) return state;
	const calledTile = state.lastDiscard;
	// Claiming the discard means it wasn't ronned — flip any deferred minkan
	// dora (before this kan defers its own) and complete a pending riichi.
	state = settleDiscard(state);

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
	players[state.lastDiscardSeat!].anyDiscardCalled = true;
	players[0].paoSeat =
		paoLiableSeat(players[0].melds, state.lastDiscardSeat!) ?? players[0].paoSeat;

	const postKan = pushEvent(applyCall(state, players), {
		type: 'call',
		call: 'daiminkan',
		seat: 0,
		from: state.lastDiscardSeat!,
		tile: calledTile,
		consumed: [...handTiles]
	});
	const drawn = drawRinshan(postKan, 0, false);
	const tsumo = await checkTsumo(drawn, 0, true);
	return { ...drawn, pendingTsumo: tsumo };
}

export function getPlayerKanOptions(state: GameState): {
	ankan: TileCode[];
	kakan: { meldIndex: number; code: TileCode }[];
} {
	if (!canKan(state)) return { ankan: [], kakan: [] };
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

	// The discard survived every ron check — flip any deferred minkan dora and
	// complete a pending riichi.
	const settled = settleDiscard(cleared);

	const aborted = checkAbortAfterDiscard(settled);
	if (aborted) return aborted;

	const afterAiCalls = await applyAiCalls(settled, discardTile, discarderSeat);
	if (afterAiCalls !== settled) return afterAiCalls;

	// No AI claimed — advance normally.
	if (nextSeat === 0) {
		const drawn = drawTile(settled, 0);
		const tsumo = await checkTsumo(drawn, 0);
		return { ...drawn, pendingTsumo: tsumo };
	}

	return { ...settled, currentSeat: nextSeat };
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
	// A kan meld holds 4 tiles but counts as one set, so a hand merely WAITING
	// to draw already totals 14 with one kan (10 concealed + 4). Without the kan
	// adjustment (same as checkTsumo's), every turn after a kan looked
	// "post-call": the AI silently skipped its next draw, then played the rest
	// of the round a tile short — and, with checkTsumo kan-adjusted, could never
	// tsumo again. See notes/bugs/2026-06-12-ai-kan-meld-skips-next-draw.md.
	const kanCount = preDraw.melds.filter((m) => m.tiles.length === 4).length;
	const isPostCall = totalTiles >= 14 + kanCount && preDraw.hand.length > 0;

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
		const ankanCodes = canKan(s) ? getAnkanOptions(s.players[seat]) : [];
		if (ankanCodes.length > 0 && callKeepsLegalHand(s.players[seat].hand.length, 4, true)) {
			const code = ankanCodes[0];
			const aiPlayer = s.players[seat];
			const matching = aiPlayer.hand.filter((t) => t.code === code);
			// Record the ankan before the chankan-rob check — only kokushi may rob
			// an ankan, by any other seat (the human via their furiten flags).
			s = pushEvent(s, { type: 'ankan', seat, consumed: matching.slice(0, 4) });
			const robbedTile = matching[0];
			let robbed: GameState | null = null;
			for (let offset = 1; offset <= 3; offset++) {
				const claimant = ((seat + offset) % 4) as Seat;
				const claimer = s.players[claimant];
				const ron = claimer.isHuman
					? claimer.isFuriten || claimer.isTempFuriten
						? null
						: asKokushiRob(await checkRon(s, 0, robbedTile, seat, true))
					: asKokushiRob(await aiCheckRon(s, claimant, robbedTile, seat, true));
				if (ron) {
					robbed = applyRoundResult(s, ron, robbedTile);
					break;
				}
			}
			if (robbed) return robbed;
			const players = clonePlayers(s);
			players[seat].hand = sortHand(aiPlayer.hand.filter((t) => t.code !== code));
			players[seat].melds = [
				...aiPlayer.melds,
				{ type: 'ankan' as const, tiles: matching.slice(0, 4), calledFrom: null }
			];
			// Own kan breaks own ippatsu too — same rule as the human ankan path.
			for (const p of players) p.isIppatsu = false;
			const postKan = { ...s, players, anyCallMadeThisRound: true };
			s = drawRinshan(postKan, seat, true);
			const kanTsumo = await checkTsumo(s, seat, true);
			if (kanTsumo) return applyRoundResult(s, kanTsumo);
		}

		const kakanOpts = canKan(s) ? getKakanOptions(s.players[seat]) : [];
		if (kakanOpts.length > 0 && callKeepsLegalHand(s.players[seat].hand.length, 1, true)) {
			const { meldIndex, code } = kakanOpts[0];
			const aiPlayer = s.players[seat];
			const addedTile = aiPlayer.hand.find((t) => t.code === code);
			if (addedTile) {
				// Declared (and recorded) before the chankan check — a robbed kan
				// still appears in the record, followed by the ron.
				s = pushEvent(s, {
					type: 'kakan',
					seat,
					tile: addedTile,
					consumed: [...aiPlayer.melds[meldIndex].tiles]
				});

				// Chankan: check if human can ron the added tile (furiten blocks it,
				// same as a ron on a normal discard)
				const human = s.players[0];
				const humanRon =
					human.isFuriten || human.isTempFuriten
						? null
						: await checkRon(s, 0, addedTile, seat, true);
				if (humanRon) return applyRoundResult(s, humanRon, addedTile);

				const players = clonePlayers(s);
				players[seat].hand = sortHand(aiPlayer.hand.filter((t) => t.id !== addedTile.id));
				players[seat].melds = aiPlayer.melds.map((m, i) =>
					i === meldIndex ? { ...m, type: 'kakan' as const, tiles: [...m.tiles, addedTile] } : m
				);
				for (const p of players) p.isIppatsu = false;
				s = drawRinshan({ ...s, players, anyCallMadeThisRound: true }, seat, false);
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
		// The stick is NOT paid here — payment waits for the declaring discard
		// to survive the ron checks below (settleDiscard / the claim handlers).
		s = { ...s, players, pendingRiichi: seat };
	}

	const discardTile = chooseDiscard(seat, s, declaringRiichi);
	const players = clonePlayers(s);
	players[seat].hand = sortHand(s.players[seat].hand.filter((t) => t.id !== discardTile.id));
	players[seat].discards = [...s.players[seat].discards, discardTile];
	players[seat].kuikaeForbidden = []; // the post-call restriction lasts one discard
	// Post-riichi discard closes this AI player's ippatsu window — but never on
	// the declaring discard itself: isRiichi is already true by this point (the
	// flags are set just above), and the window is supposed to OPEN here. The
	// human path gets this for free by checking the pre-discard player state.
	if (!declaringRiichi && s.players[seat].isRiichi && s.players[seat].isIppatsu) {
		players[seat].isIppatsu = false;
	}

	const nextSeat = ((seat + 1) % 4) as Seat;
	s = {
		...s,
		players,
		lastDiscard: discardTile,
		currentSeat: nextSeat,
		lastDiscardSeat: seat,
		phase: 'ai_turn',
		events: [...s.events, { type: 'discard', seat, tile: discardTile, riichi: declaringRiichi }]
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

	// The discard survived every ron check — flip any deferred minkan dora and
	// complete a pending riichi. (In the claim_decision path above the human can
	// still ron, so settling waits for humanPassClaim / a claim handler instead.)
	s = settleDiscard(s);

	const aborted = checkAbortAfterDiscard(s);
	if (aborted) return aborted;

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
		isTempFuriten: p.isTempFuriten,
		kuikaeForbidden: [...p.kuikaeForbidden],
		anyDiscardCalled: p.anyDiscardCalled,
		paoSeat: p.paoSeat
	})) as [PlayerState, PlayerState, PlayerState, PlayerState];
}

async function computeOwnDiscardFuriten(state: GameState, seat: Seat): Promise<boolean> {
	const player = state.players[seat];
	if (player.discards.length === 0) return false;
	// A hand with no waits can't be furiten. One cheap shanten check spares the
	// per-discard checkWin scan below (up to ~20 WASM calls) for the vast
	// majority of discards, where the hand isn't tenpai yet.
	if (getShanten(player.hand.map((t) => t.code)) !== 0) return false;
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
