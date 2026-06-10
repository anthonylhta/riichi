import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getOrCreateUser } from '$lib/server/users';
import { getGame } from '$lib/server/games';
import type { GameDetail } from '$lib/game/history';

// Round-by-round detail for one saved game. Anonymous visitors get the sign-in
// prompt (same anonymous-first pattern as /profile); a signed-in user only ever
// sees their own games — getGame's ownership check makes a foreign id a 404.
export const load: PageServerLoad = async ({ params, locals }) => {
	const clerkId = locals.auth().userId;
	if (!clerkId) {
		return { signedIn: false, game: null as GameDetail | null };
	}

	const gameId = Number(params.id);
	if (!Number.isInteger(gameId) || gameId <= 0) {
		error(404, 'Game not found');
	}

	const userId = await getOrCreateUser(clerkId);
	const game = await getGame(userId, gameId);
	if (!game) {
		error(404, 'Game not found');
	}

	return { signedIn: true, game };
};
