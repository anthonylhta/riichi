import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getOrCreateToday } from '$lib/server/handOfTheDay';

// Pre-warm the daily puzzle cache so no real visitor is ever the cold
// first-visitor (which pays the Claude generation latency). Wired to a Vercel
// Cron Job (see vercel.json) that fires just after the Sydney day boundary —
// getOrCreateToday() generates + caches the new day's puzzle if the row is
// missing, otherwise it's a cheap no-op read.
//
// Vercel crons run on a fixed UTC clock, so we fire at 14:05 UTC: that's 00:05
// during AEST and 01:05 during AEDT — always just *after* Sydney midnight, so it
// reliably warms the correct (new) day even with daylight saving and cron jitter.
//
// Vercel attaches `Authorization: Bearer $CRON_SECRET` to scheduled invocations
// when CRON_SECRET is set in the project env. When it's set we require it, so the
// endpoint can't be triggered (and made to spend Claude calls) by the public. In
// dev / when unset, it runs unguarded for convenience.
export const GET: RequestHandler = async ({ request }) => {
	const secret = env.CRON_SECRET;
	if (secret) {
		const auth = request.headers.get('authorization');
		if (auth !== `Bearer ${secret}`) {
			return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
		}
	}

	try {
		const today = await getOrCreateToday();
		return json({ ok: true, date: today.date });
	} catch (e) {
		console.error('Hand of the Day pre-warm failed:', e);
		return json({ ok: false, error: 'warm failed' }, { status: 500 });
	}
};
