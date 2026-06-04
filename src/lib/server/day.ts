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
