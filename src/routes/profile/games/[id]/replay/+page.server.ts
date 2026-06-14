import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getOrCreateUser } from '$lib/server/users';
import { getGame } from '$lib/server/games';

// Guard for the replay viewer. Same anonymous-first / ownership pattern as the
// game detail page: a signed-in user only ever sees their own games (getGame's
// ownership check makes a foreign id a 404). The replay blob itself is fetched
// client-side from the ownership-checked /api/games/[id]/replay and re-run in the
// browser, so this load only verifies access and whether a replay exists.
export const load: PageServerLoad = async ({ params, locals }) => {
	const clerkId = locals.auth().userId;
	if (!clerkId) {
		return { signedIn: false, gameId: 0, hasReplay: false, playedAt: 0, placement: 0 };
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

	return {
		signedIn: true,
		gameId: game.id,
		hasReplay: game.hasReplay,
		playedAt: game.playedAt,
		placement: game.placement
	};
};
