// Pure SVG generator for a tile's *face* art (the suit/honour drawing only — the
// ivory body, shadows and interaction states live in Tile.svelte). Hand-authored
// inline SVG: pin = coins, sou = bamboo (1 = the bird), man = kanji numeral + 萬,
// honours = kanji (haku stays blank). Inline presentation attributes only (no CSS
// classes) so it renders identically in the browser and any rasteriser.
import { getSuit, getValue, type TileCode } from './tiles';

// Suit-true ink. A red five recolours its whole face crimson (the aka-dora look).
const MAN = '#b3242b';
const PIN = '#1763b8';
const SOU = '#1f7a34';
const WIND = '#2b2b2b';
const HATSU = '#1f7a34';
const CHUN = '#c41e3a';
const AKA = '#c41e3a';
// Near-black ink (the off-black used for winds): the man numeral and the corner
// index ride this so they read as "value" without competing with the suit colour.
const INK_DARK = '#2b2b2b';

const MAN_NUMERALS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WIND_KANJI = ['', '東', '南', '西', '北'];
const DRAGON_KANJI = ['', '', '發', '中']; // 1 = haku (blank)

type Coin = { x: number; y: number; r: number };
const PIN_COINS: Record<number, Coin[]> = {
	1: [{ x: 45, y: 60, r: 19 }],
	2: [
		{ x: 45, y: 40, r: 13 },
		{ x: 45, y: 80, r: 13 }
	],
	3: [
		{ x: 26, y: 34, r: 12 },
		{ x: 45, y: 60, r: 12 },
		{ x: 64, y: 86, r: 12 }
	],
	4: [
		{ x: 32, y: 40, r: 12 },
		{ x: 58, y: 40, r: 12 },
		{ x: 32, y: 80, r: 12 },
		{ x: 58, y: 80, r: 12 }
	],
	5: [
		{ x: 31, y: 38, r: 11 },
		{ x: 59, y: 38, r: 11 },
		{ x: 45, y: 60, r: 11 },
		{ x: 31, y: 82, r: 11 },
		{ x: 59, y: 82, r: 11 }
	],
	6: [
		{ x: 32, y: 34, r: 11 },
		{ x: 58, y: 34, r: 11 },
		{ x: 32, y: 60, r: 11 },
		{ x: 58, y: 60, r: 11 },
		{ x: 32, y: 86, r: 11 },
		{ x: 58, y: 86, r: 11 }
	],
	7: [
		{ x: 28, y: 25, r: 9 },
		{ x: 40, y: 32, r: 9 },
		{ x: 52, y: 39, r: 9 },
		{ x: 33, y: 72, r: 10 },
		{ x: 57, y: 72, r: 10 },
		{ x: 33, y: 96, r: 10 },
		{ x: 57, y: 96, r: 10 }
	],
	8: [
		{ x: 33, y: 26, r: 9 },
		{ x: 57, y: 26, r: 9 },
		{ x: 33, y: 49, r: 9 },
		{ x: 57, y: 49, r: 9 },
		{ x: 33, y: 71, r: 9 },
		{ x: 57, y: 71, r: 9 },
		{ x: 33, y: 94, r: 9 },
		{ x: 57, y: 94, r: 9 }
	],
	9: [
		{ x: 27, y: 32, r: 9 },
		{ x: 45, y: 32, r: 9 },
		{ x: 63, y: 32, r: 9 },
		{ x: 27, y: 60, r: 9 },
		{ x: 45, y: 60, r: 9 },
		{ x: 63, y: 60, r: 9 },
		{ x: 27, y: 88, r: 9 },
		{ x: 45, y: 88, r: 9 },
		{ x: 63, y: 88, r: 9 }
	]
};

type Stick = { x: number; y: number; h: number; red?: boolean };
const SOU_STICKS: Record<number, Stick[]> = {
	2: [
		{ x: 36, y: 60, h: 66 },
		{ x: 54, y: 60, h: 66 }
	],
	3: [
		{ x: 45, y: 34, h: 42 },
		{ x: 34, y: 86, h: 42 },
		{ x: 56, y: 86, h: 42 }
	],
	4: [
		{ x: 34, y: 38, h: 46 },
		{ x: 56, y: 38, h: 46 },
		{ x: 34, y: 84, h: 46 },
		{ x: 56, y: 84, h: 46 }
	],
	5: [
		{ x: 31, y: 36, h: 42 },
		{ x: 59, y: 36, h: 42 },
		{ x: 45, y: 60, h: 42, red: true },
		{ x: 31, y: 84, h: 42 },
		{ x: 59, y: 84, h: 42 }
	],
	6: [
		{ x: 29, y: 38, h: 46 },
		{ x: 45, y: 38, h: 46 },
		{ x: 61, y: 38, h: 46 },
		{ x: 29, y: 84, h: 46 },
		{ x: 45, y: 84, h: 46 },
		{ x: 61, y: 84, h: 46 }
	],
	7: [
		{ x: 45, y: 24, h: 30, red: true },
		{ x: 29, y: 58, h: 32 },
		{ x: 45, y: 58, h: 32 },
		{ x: 61, y: 58, h: 32 },
		{ x: 29, y: 94, h: 32 },
		{ x: 45, y: 94, h: 32 },
		{ x: 61, y: 94, h: 32 }
	],
	8: [
		{ x: 25, y: 40, h: 42 },
		{ x: 38, y: 40, h: 42 },
		{ x: 52, y: 40, h: 42 },
		{ x: 65, y: 40, h: 42 },
		{ x: 25, y: 84, h: 42 },
		{ x: 38, y: 84, h: 42 },
		{ x: 52, y: 84, h: 42 },
		{ x: 65, y: 84, h: 42 }
	],
	9: [
		{ x: 29, y: 32, h: 34 },
		{ x: 45, y: 32, h: 34 },
		{ x: 61, y: 32, h: 34 },
		{ x: 29, y: 60, h: 34 },
		{ x: 45, y: 60, h: 34 },
		{ x: 61, y: 60, h: 34 },
		{ x: 29, y: 88, h: 34 },
		{ x: 45, y: 88, h: 34 },
		{ x: 61, y: 88, h: 34 }
	]
};

function inkFor(suit: string, value: number, red: boolean): string {
	if (red) return AKA;
	if (suit === 'man') return MAN;
	if (suit === 'pin') return PIN;
	if (suit === 'sou') return SOU;
	if (suit === 'wind') return WIND;
	return value === 2 ? HATSU : CHUN; // dragons: haku handled separately (blank)
}

const KANJI_FONT = "'Noto Serif JP','Yu Mincho',serif";

function kanjiText(glyph: string, x: number, y: number, size: number, fill: string): string {
	return (
		`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-family="${KANJI_FONT}"` +
		` font-weight="700" text-anchor="middle" dominant-baseline="central">${glyph}</text>`
	);
}

function coin(c: Coin, ink: string): string {
	return (
		`<circle cx="${c.x}" cy="${c.y}" r="${c.r}" fill="none" stroke="${ink}" stroke-width="${(c.r * 0.26).toFixed(2)}"/>` +
		`<circle cx="${c.x}" cy="${c.y}" r="${(c.r * 0.42).toFixed(2)}" fill="${ink}"/>`
	);
}

function bamboo(s: Stick, ink: string, redTile: boolean): string {
	const c = s.red && !redTile ? CHUN : ink;
	const w = 8;
	const x = s.x - w / 2;
	const top = s.y - s.h / 2;
	return (
		`<rect x="${x}" y="${top}" width="${w}" height="${s.h}" rx="3.5" fill="${c}"/>` +
		`<rect x="${x}" y="${(s.y - s.h / 6).toFixed(2)}" width="${w}" height="2.2" fill="#f7f2e8" opacity="0.85"/>` +
		`<rect x="${x}" y="${(s.y + s.h / 6).toFixed(2)}" width="${w}" height="2.2" fill="#f7f2e8" opacity="0.85"/>` +
		`<rect x="${(x + 1).toFixed(2)}" y="${(top + 2).toFixed(2)}" width="1.8" height="${s.h - 4}" rx="1" fill="#ffffff" opacity="0.3"/>`
	);
}

// 1 sou: the traditional bird (peacock) on a branch.
function bird(ink: string): string {
	return (
		'<g>' +
		`<ellipse cx="42" cy="66" rx="17" ry="13" fill="${ink}"/>` +
		`<circle cx="58" cy="49" r="9.5" fill="${ink}"/>` +
		`<path d="M66 47 L78 44 L67 53 Z" fill="${CHUN}"/>` +
		'<circle cx="59" cy="47" r="2.1" fill="#f7f2e8"/>' +
		'<path d="M30 60 Q44 56 54 66 Q42 70 30 68 Z" fill="#155f28"/>' +
		`<path d="M25 70 L10 78 L26 76 L14 86 L30 78 Z" fill="${ink}"/>` +
		`<line x1="44" y1="78" x2="44" y2="92" stroke="${ink}" stroke-width="2.4"/>` +
		`<line x1="50" y1="78" x2="50" y2="92" stroke="${ink}" stroke-width="2.4"/>` +
		`<line x1="22" y1="94" x2="70" y2="90" stroke="${CHUN}" stroke-width="3" stroke-linecap="round"/>` +
		'</g>'
	);
}

// MS-style top-right index: a small digit on the number suits for quick reading.
// It always shows the tile's real value (a red five reads 5, not 0 — the 0 was
// a text-notation aka marker that looked like a literal zero on the face), and is
// coloured by aka-or-not — crimson for a red five, near-black otherwise — never by
// suit, so the digit reads cleanly without echoing the suit colour. Honours carry
// no index; their kanji already identifies them.
function cornerIndex(suit: string, value: number, red: boolean): string {
	if (suit !== 'man' && suit !== 'pin' && suit !== 'sou') return '';
	const ink = red ? AKA : INK_DARK;
	return (
		`<text x="80" y="20" font-size="23" fill="${ink}"` +
		` font-family="'Inter',system-ui,sans-serif" font-weight="700"` +
		` text-anchor="middle" dominant-baseline="central">${value}</text>`
	);
}

function faceContent(code: TileCode, red: boolean): string {
	const suit = getSuit(code);
	const value = getValue(code);
	const ink = inkFor(suit, value, red);
	const idx = cornerIndex(suit, value, red);

	if (suit === 'man') {
		// Two-tone like Mahjong Soul: the numeral in near-black, 萬 in suit red. This
		// also keeps a normal 5m (black numeral) clearly distinct from the aka 5m
		// (whole face crimson), which an all-red man face blurred together.
		const numInk = red ? ink : INK_DARK;
		return (
			kanjiText(MAN_NUMERALS[value], 45, 34, 50, numInk) + kanjiText('萬', 45, 86, 44, ink) + idx
		);
	}
	if (suit === 'pin') {
		return (PIN_COINS[value] ?? []).map((c) => coin(c, ink)).join('') + idx;
	}
	if (suit === 'sou') {
		const art =
			value === 1 ? bird(ink) : (SOU_STICKS[value] ?? []).map((s) => bamboo(s, ink, red)).join('');
		return art + idx;
	}
	if (suit === 'wind') return kanjiText(WIND_KANJI[value], 45, 60, 62, ink);
	// dragon
	const glyph = DRAGON_KANJI[value];
	return glyph ? kanjiText(glyph, 45, 60, 62, ink) : ''; // haku: blank face
}

export function tileFaceSvg(code: TileCode, red = false): string {
	return (
		'<svg viewBox="0 0 90 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true"' +
		' style="display:block;width:100%;height:100%">' +
		faceContent(code, red) +
		'</svg>'
	);
}
