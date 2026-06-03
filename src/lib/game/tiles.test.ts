import { describe, it, expect } from 'vitest';
import { honorName, tileText, humanizeHonors, TC } from './tiles';

describe('honorName', () => {
	it('names the four winds', () => {
		expect(honorName(TC.EAST)).toBe('East');
		expect(honorName(TC.SOUTH)).toBe('South');
		expect(honorName(TC.WEST)).toBe('West');
		expect(honorName(TC.NORTH)).toBe('North');
	});

	it('names the three dragons (haku is never blank)', () => {
		expect(honorName(TC.HAKU)).toBe('White dragon');
		expect(honorName(TC.HATSU)).toBe('Green dragon');
		expect(honorName(TC.CHUN)).toBe('Red dragon');
	});

	it('returns empty for number tiles', () => {
		expect(honorName(1)).toBe(''); // 1m
		expect(honorName(14)).toBe(''); // 5p
	});
});

describe('tileText', () => {
	it('uses notation for number tiles', () => {
		expect(tileText(1)).toBe('1m');
		expect(tileText(14)).toBe('5p');
		expect(tileText(27)).toBe('9s');
	});

	it('uses the spelled-out name for honors', () => {
		expect(tileText(TC.WEST)).toBe('West');
		expect(tileText(TC.HAKU)).toBe('White dragon');
	});
});

describe('humanizeHonors', () => {
	it('rewrites raw honor notation to names', () => {
		expect(humanizeHonors('Discard 5z')).toBe('Discard White dragon');
		expect(humanizeHonors('keep 2z, cut 7z')).toBe('keep South, cut Red dragon');
	});

	it('leaves number-tile notation untouched', () => {
		expect(humanizeHonors('discard 3p, then 5m')).toBe('discard 3p, then 5m');
	});

	it('does not touch digits that are not honor tokens', () => {
		// "10z" has no valid honor and the boundary guard means "0z" is not a honor.
		expect(humanizeHonors('around 2pm')).toBe('around 2pm');
	});
});
