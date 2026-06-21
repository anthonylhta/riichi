// Day-boundary helpers. The Hand of the Day (and its streaks) roll over at
// Sydney midnight, so the calendar day is computed in Australia/Sydney — DST-safe
// via Intl. 'en-CA' formats as ISO YYYY-MM-DD.

export function sydneyDate(at: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(at);
}

// Shift a 'YYYY-MM-DD' string by whole days using pure calendar arithmetic (UTC
// midnight anchor), so it's unaffected by time zones or DST.
export function addDays(date: string, delta: number): string {
	const d = new Date(date + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + delta);
	return d.toISOString().slice(0, 10);
}

// Whole days from `from` to `to` (both 'YYYY-MM-DD'), via the same UTC-midnight
// anchor, so it's DST-safe. Negative if `to` precedes `from`. Used to index the
// curated Hand-of-the-Day curriculum by the day number since its epoch.
export function daysSince(from: string, to: string): number {
	const a = Date.parse(from + 'T00:00:00Z');
	const b = Date.parse(to + 'T00:00:00Z');
	return Math.round((b - a) / 86_400_000);
}
