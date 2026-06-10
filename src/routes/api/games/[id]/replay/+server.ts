import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrCreateUser } from '$lib/server/users';
import { getGameReplay } from '$lib/server/games';

// Download a saved game's move log (the deterministic ReplayLog: each round's
// wall + the ordered human inputs — replayable via replayGame()). Served as an
// attachment so the history page's "Download replay" link saves a file.
// Ownership is enforced in getGameReplay, so a foreign id is a plain 404.
export const GET: RequestHandler = async ({ params, locals }) => {
	const clerkId = locals.auth().userId;
	if (!clerkId) {
		return json({ error: 'Sign in required' }, { status: 401 });
	}

	const gameId = Number(params.id);
	if (!Number.isInteger(gameId) || gameId <= 0) {
		error(404, 'Game not found');
	}

	const userId = await getOrCreateUser(clerkId);
	const replay = await getGameReplay(userId, gameId);
	if (!replay) {
		error(404, 'No replay for this game');
	}

	return new Response(JSON.stringify(replay), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="riichi-game-${gameId}-replay.json"`
		}
	});
};
