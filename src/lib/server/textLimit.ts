// Pure text-shaping shared by the AI features (in-round helper, post-game
// overview). Kept out of the server modules that pull in the Anthropic SDK +
// private env so it can be unit-tested directly.
//
// We never trust an LLM's "be brief" instruction to bound the UI: a runaway
// response once overflowed the docked helper panel so badly its close button was
// pushed off-screen (UI_09), and the same risk applies to the post-game review
// card. So every model-authored string is clamped on the server before it can
// reach the DOM.

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
