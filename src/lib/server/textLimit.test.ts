import { describe, it, expect } from 'vitest';
import { clamp } from './textLimit';

describe('clamp', () => {
	it('leaves short text untouched (no ellipsis)', () => {
		expect(clamp('Discard 3p, keep the ryanmen.', 320)).toBe('Discard 3p, keep the ryanmen.');
	});

	it('trims surrounding whitespace', () => {
		expect(clamp('   keep 4s   ', 320)).toBe('keep 4s');
	});

	it('truncates at a word boundary and appends an ellipsis', () => {
		const long = 'one two three four five six seven eight nine ten eleven twelve';
		const out = clamp(long, 20);
		expect(out.endsWith('…')).toBe(true);
		expect(out).not.toContain('  ');
		// no partial word before the ellipsis, and within budget
		expect(
			out
				.slice(0, -1)
				.trim()
				.split(' ')
				.every((w) => long.includes(w))
		).toBe(true);
		expect(out.length).toBeLessThanOrEqual(21);
	});

	it('hard-cuts a single token with no usable space', () => {
		const out = clamp('superlongunbrokenwordwithnospaces', 10);
		expect(out).toBe('superlongu…');
	});

	it('result never exceeds max + 1 (the ellipsis) across a range of limits', () => {
		const blob = 'x '.repeat(500);
		for (const max of [40, 160, 200, 320, 600]) {
			expect(clamp(blob, max).length).toBeLessThanOrEqual(max + 1);
		}
	});
});
