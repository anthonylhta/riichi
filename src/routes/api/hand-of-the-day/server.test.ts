import { describe, it, expect } from 'vitest';
import { GET } from './+server';

// The public GET must serve today's hand but never the answer — the solution stays
// behind POST /answer (notes ADR 0074).
describe('GET /api/hand-of-the-day', () => {
	it("returns today's public puzzle, answer-stripped", async () => {
		const res = await GET({} as never);
		const body = await res.json();

		expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(body.puzzle.hand).toHaveLength(14);
		expect(body.puzzle.question).toBeTruthy();

		// the solution must NOT leak
		for (const k of ['bestDiscards', 'bestShanten', 'ukeire', 'ukeireTiles', 'explanation']) {
			expect(body.puzzle).not.toHaveProperty(k);
		}
	});
});
