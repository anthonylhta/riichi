// Tile codes match riichi-rs-bundlers Tile enum exactly
// Man: 1-9 | Pin: 10-18 | Sou: 19-27
// Wind: East=28, South=29, West=30, North=31
// Dragon: Haku=32, Hatsu=33, Chun=34

export type TileCode = number;

export interface GameTile {
	code: TileCode;
	id: number; // 0-135, unique per physical tile instance
	isRed: boolean;
}

export const TC = {
	M1: 1, M2: 2, M3: 3, M4: 4, M5: 5, M6: 6, M7: 7, M8: 8, M9: 9,
	P1: 10, P2: 11, P3: 12, P4: 13, P5: 14, P6: 15, P7: 16, P8: 17, P9: 18,
	S1: 19, S2: 20, S3: 21, S4: 22, S5: 23, S6: 24, S7: 25, S8: 26, S9: 27,
	EAST: 28, SOUTH: 29, WEST: 30, NORTH: 31,
	HAKU: 32, HATSU: 33, CHUN: 34,
} as const;

export function getSuit(code: TileCode): 'man' | 'pin' | 'sou' | 'wind' | 'dragon' {
	if (code <= 9) return 'man';
	if (code <= 18) return 'pin';
	if (code <= 27) return 'sou';
	if (code <= 31) return 'wind';
	return 'dragon';
}

export function getValue(code: TileCode): number {
	if (code <= 9) return code;
	if (code <= 18) return code - 9;
	if (code <= 27) return code - 18;
	if (code <= 31) return code - 27;
	return code - 31;
}

export function isHonor(code: TileCode): boolean {
	return code >= 28;
}

export function isTerminal(code: TileCode): boolean {
	if (isHonor(code)) return false;
	const v = getValue(code);
	return v === 1 || v === 9;
}

export function isSimple(code: TileCode): boolean {
	return !isHonor(code) && !isTerminal(code);
}

const WIND_LABELS = ['', 'E', 'S', 'W', 'N'];
const DRAGON_LABELS = ['', '白', '発', '中'];

export function tileLabel(code: TileCode): string {
	const suit = getSuit(code);
	const val = getValue(code);
	if (suit === 'wind') return WIND_LABELS[val];
	if (suit === 'dragon') return DRAGON_LABELS[val];
	const suffix = suit === 'man' ? 'm' : suit === 'pin' ? 'p' : 's';
	return `${val}${suffix}`;
}

export function suitClass(code: TileCode): string {
	const suit = getSuit(code);
	if (suit === 'dragon') {
		const val = getValue(code);
		if (val === 3) return 'dragon-chun'; // Chun is red
	}
	return suit;
}

// Convert to mahjong-tile-efficiency string format ('1m', '5z', etc.)
export function toEffStr(code: TileCode): string {
	if (code <= 9) return `${code}m`;
	if (code <= 18) return `${code - 9}p`;
	if (code <= 27) return `${code - 18}s`;
	return `${code - 27}z`; // winds 1-4z, dragons 5-7z
}

// Convert hand of codes to mahjong-tile-efficiency 4-array format
export function toEffHand(codes: TileCode[]): number[][] {
	const h = [new Array(9).fill(0), new Array(9).fill(0), new Array(9).fill(0), new Array(7).fill(0)];
	for (const c of codes) {
		if (c <= 9) h[0][c - 1]++;
		else if (c <= 18) h[1][c - 10]++;
		else if (c <= 27) h[2][c - 19]++;
		else h[3][c - 28]++;
	}
	return h;
}

// Dora indicator → actual dora (next tile in sequence, wrapping)
export function doraFromIndicator(indicator: TileCode): TileCode {
	if (indicator <= 9) return indicator === 9 ? 1 : indicator + 1;
	if (indicator <= 18) return indicator === 18 ? 10 : indicator + 1;
	if (indicator <= 27) return indicator === 27 ? 19 : indicator + 1;
	if (indicator <= 31) return indicator === 31 ? 28 : indicator + 1;
	return indicator === 34 ? 32 : indicator + 1;
}

export function createWall(): GameTile[] {
	const tiles: GameTile[] = [];
	let id = 0;
	for (let code = 1; code <= 34; code++) {
		for (let i = 0; i < 4; i++) {
			tiles.push({ code, id: id++, isRed: false });
		}
	}
	return tiles;
}

export function shuffleTiles<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}
