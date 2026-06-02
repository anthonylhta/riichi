import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getHelperAdvice } from '$lib/server/helper';
import type { HelperView } from '$lib/game/helper';

// The advice is generated server-side so the Anthropic key never reaches the client.
export const POST: RequestHandler = async ({ request }) => {
	let view: HelperView;
	try {
		view = (await request.json()) as HelperView;
	} catch {
		return json({ error: 'Bad request' }, { status: 400 });
	}

	try {
		const advice = await getHelperAdvice(view);
		return json(advice);
	} catch (e) {
		console.error('In-round helper failed:', e);
		return json({ error: 'Helper unavailable right now.' }, { status: 500 });
	}
};
