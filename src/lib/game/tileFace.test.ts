import { describe, it, expect } from 'vitest';
import { tileFaceSvg } from './tileFace';
import { TC } from './tiles';

describe('tileFaceSvg', () => {
	it('produces a well-formed svg for every tile code', () => {
		for (let code = 1; code <= 34; code++) {
			const svg = tileFaceSvg(code);
			expect(svg.startsWith('<svg ')).toBe(true);
			expect(svg.endsWith('</svg>')).toBe(true);
		}
	});

	it('draws man tiles two-tone: a near-black numeral over a red 萬', () => {
		const svg = tileFaceSvg(TC.M3);
		expect(svg).toContain('三');
		expect(svg).toContain('萬');
		// Numeral in near-black ink, 萬 in man red (Mahjong Soul two-tone).
		expect(svg).toMatch(/fill="#2b2b2b"[^>]*>三<\/text>/);
		expect(svg).toMatch(/fill="#b3242b"[^>]*>萬<\/text>/);
	});

	it('draws pin tiles as coins (circles), one ring + centre per pip', () => {
		// 5p has five pips → five rings + five centres = ten circles.
		const svg = tileFaceSvg(TC.P5);
		expect((svg.match(/<circle/g) ?? []).length).toBe(10);
	});

	it('draws the bird for 1 sou, bamboo rects for the rest', () => {
		const oneSou = tileFaceSvg(TC.S1);
		expect(oneSou).toContain('<ellipse'); // bird body
		expect(oneSou).not.toContain('<rect'); // no bamboo

		const twoSou = tileFaceSvg(TC.S2);
		expect(twoSou).toContain('<rect'); // bamboo sticks
		expect(twoSou).not.toContain('<ellipse');
	});

	it('renders honour kanji, but leaves haku blank', () => {
		expect(tileFaceSvg(TC.EAST)).toContain('東');
		expect(tileFaceSvg(TC.HATSU)).toContain('發');
		expect(tileFaceSvg(TC.CHUN)).toContain('中');
		// White dragon is a deliberately blank face — no drawing elements.
		const haku = tileFaceSvg(TC.HAKU);
		expect(haku).not.toMatch(/<(text|circle|rect|ellipse|path|line)/);
	});

	it('corner digit: real value, red-or-black (never suit), none on honours', () => {
		// 3p shows "3" in the corner (the value lives nowhere else as text on pin).
		expect(tileFaceSvg(TC.P3)).toContain('>3</text>');
		// A red five shows its real value 5 (not the old "0"), in crimson.
		const redM5 = tileFaceSvg(TC.M5, true);
		expect(redM5).not.toContain('>0</text>');
		expect(redM5).toMatch(/fill="#c41e3a" font-family="'Inter'[^>]*>5<\/text>/);
		// A plain tile's corner is near-black — NOT its suit colour (pin would be blue).
		expect(tileFaceSvg(TC.P3)).toMatch(/fill="#2b2b2b" font-family="'Inter'[^>]*>3<\/text>/);
		expect(tileFaceSvg(TC.M5, false)).toMatch(/fill="#2b2b2b" font-family="'Inter'[^>]*>5<\/text>/);
		// Honours have no corner digit.
		expect(tileFaceSvg(TC.EAST)).not.toMatch(/>\d<\/text>/);
	});

	it('recolours a red five to crimson rather than its suit ink', () => {
		const plain = tileFaceSvg(TC.S5, false);
		const red = tileFaceSvg(TC.S5, true);
		expect(plain).toContain('#1f7a34'); // sou green
		expect(red).toContain('#c41e3a'); // aka crimson
		expect(red).not.toContain('#1f7a34');
	});
});
