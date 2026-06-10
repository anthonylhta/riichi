import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrCreateUser } from '$lib/server/users';
import { saveGame, type SavedGameInput } from '$lib/server/games';
import { validateRounds } from '$lib/server/validate';

// Persist a finished solo game. Signed-in users get the game saved (feeding the
// profile's game stats); anonymous users are a no-op — nothing is gated, matching
// the anonymous-first model, so this just returns `saved: false`.
export const POST: RequestHandler = async ({ request, locals }) => {
	let body: { finalScores?: unknown; rounds?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Bad request' }, { status: 400 });
	}

	const finalScores = body.finalScores;
	if (
		!Array.isArray(finalScores) ||
		finalScores.length !== 4 ||
		!finalScores.every((n) => Number.isFinite(n))
	) {
		return json({ error: 'Invalid finalScores' }, { status: 400 });
	}
	// Full shape + bounds validation: rounds goes into a jsonb column, so this
	// caps the row size and guarantees the stored shape for future history views.
	const rounds = validateRounds(body.rounds);
	if (!rounds) {
		return json({ error: 'Invalid rounds' }, { status: 400 });
	}

	const clerkId = locals.auth().userId;
	if (!clerkId) {
		// Anonymous games aren't saved (no account to attribute them to).
		return json({ saved: false });
	}

	const input: SavedGameInput = {
		finalScores: finalScores as [number, number, number, number],
		rounds
	};

	try {
		const userId = await getOrCreateUser(clerkId);
		const gameId = await saveGame(userId, input);
		return json({ saved: true, gameId });
	} catch (e) {
		console.error('Save game failed:', e);
		return json({ error: 'Could not save game.' }, { status: 500 });
	}
};
