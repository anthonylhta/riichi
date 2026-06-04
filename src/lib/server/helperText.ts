// Pure text-shaping for the in-round helper, kept out of helper.ts (which pulls in
// the Anthropic SDK + private env) so it can be unit-tested directly.

// Hard ceilings on the returned text. The prompt already asks for brevity, but a
// runaway response once overflowed the docked panel so badly the close button was
// pushed off-screen (UI_09) — so we clamp on the server too, never trusting the
// model's self-restraint.
export const LIMITS = { discard: 40, reasoning: 320, plan: 160 } as const;

// Truncate to `max` characters at a word boundary (falling back to a hard cut for
// a single very long token), appending an ellipsis. Trims first so whitespace
// doesn't eat the budget.
export function clamp(text: string, max: number): string {
	const t = text.trim();
	if (t.length <= max) return t;
	const cut = t.slice(0, max);
	const lastSpace = cut.lastIndexOf(' ');
	return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}
