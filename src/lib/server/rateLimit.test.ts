import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, resetRateLimits } from './rateLimit';

describe('rateLimit', () => {
	beforeEach(() => resetRateLimits());

	it('allows calls under the limit', () => {
		const t = 1_000_000;
		expect(rateLimit('a', 3, 60_000, t)).toBe(true);
		expect(rateLimit('a', 3, 60_000, t + 1)).toBe(true);
		expect(rateLimit('a', 3, 60_000, t + 2)).toBe(true);
	});

	it('blocks the call over the limit', () => {
		const t = 1_000_000;
		for (let i = 0; i < 3; i++) rateLimit('a', 3, 60_000, t + i);
		expect(rateLimit('a', 3, 60_000, t + 3)).toBe(false);
	});

	it('frees up as the window slides', () => {
		const t = 1_000_000;
		for (let i = 0; i < 3; i++) rateLimit('a', 3, 60_000, t + i);
		expect(rateLimit('a', 3, 60_000, t + 100)).toBe(false);
		// First call has aged out of the trailing window.
		expect(rateLimit('a', 3, 60_000, t + 60_001)).toBe(true);
	});

	it('keys are independent', () => {
		const t = 1_000_000;
		for (let i = 0; i < 3; i++) rateLimit('a', 3, 60_000, t + i);
		expect(rateLimit('b', 3, 60_000, t + 3)).toBe(true);
	});
});
