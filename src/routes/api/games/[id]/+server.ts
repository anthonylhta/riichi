import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrCreateUser } from '$lib/server/users';
import { setGameLiked } from '$lib/server/games';

// Flag/unflag a saved game as kept (the ★ in the history list). Signed-in only —
// anonymous players have no saved games to flag. Ownership is enforced in
// setGameLiked, so a wrong/foreign id is a plain 404.
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const clerkId = locals.auth().userId;
	if (!clerkId) {
		return json({ error: 'Sign in required' }, { status: 401 });
	}

	const gameId = Number(params.id);
	if (!Number.isInteger(gameId) || gameId <= 0) {
		return json({ error: 'Bad request' }, { status: 400 });
	}

	let body: { liked?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Bad request' }, { status: 400 });
	}
	if (typeof body.liked !== 'boolean') {
		return json({ error: 'Bad request' }, { status: 400 });
	}

	try {
		const userId = await getOrCreateUser(clerkId);
		const updated = await setGameLiked(userId, gameId, body.liked);
		if (!updated) {
			return json({ error: 'Not found' }, { status: 404 });
		}
		return json({ liked: body.liked });
	} catch (e) {
		console.error('Update game failed:', e);
		return json({ error: 'Could not update game.' }, { status: 500 });
	}
};
