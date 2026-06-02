import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOverview } from '$lib/server/overview';
import type { ReviewPayload } from '$lib/game/review';

// Generated server-side so the Anthropic key never reaches the client.
export const POST: RequestHandler = async ({ request }) => {
	let payload: ReviewPayload;
	try {
		payload = (await request.json()) as ReviewPayload;
	} catch {
		return json({ error: 'Bad request' }, { status: 400 });
	}

	try {
		const overview = await getOverview(payload);
		return json(overview);
	} catch (e) {
		console.error('Post-game overview failed:', e);
		return json({ error: 'Review unavailable right now.' }, { status: 500 });
	}
};
