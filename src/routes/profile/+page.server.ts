import type { PageServerLoad } from './$types';
import { clerkClient } from 'svelte-clerk/server';
import { getOrCreateUser } from '$lib/server/users';
import { getProfileSummary } from '$lib/server/profile';
import { getGameStats } from '$lib/server/games';
import { sydneyDate } from '$lib/server/day';
import type { AccountInfo, GameStats, ProfileSummary } from '$lib/game/profile';

// The profile is account-only — anonymous visitors get a sign-in prompt rather
// than a redirect, so the page itself can stay anonymous-first like the rest of
// the app. For a signed-in user we pull identity from Clerk and aggregate their
// Hand-of-the-Day history from our DB.
export const load: PageServerLoad = async ({ locals }) => {
	const clerkId = locals.auth().userId;
	if (!clerkId) {
		return {
			signedIn: false,
			account: null as AccountInfo | null,
			summary: null as ProfileSummary | null,
			gameStats: null as GameStats | null
		};
	}

	const userId = await getOrCreateUser(clerkId);
	const [summary, gameStats, clerkUser] = await Promise.all([
		getProfileSummary(userId, sydneyDate()),
		getGameStats(userId),
		clerkClient.users.getUser(clerkId)
	]);

	const name =
		[clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') ||
		clerkUser.username ||
		null;
	const email =
		clerkUser.primaryEmailAddress?.emailAddress ??
		clerkUser.emailAddresses[0]?.emailAddress ??
		null;

	const account: AccountInfo = {
		name,
		email,
		imageUrl: clerkUser.imageUrl ?? null,
		memberSince: clerkUser.createdAt
	};

	return { signedIn: true, account, summary, gameStats };
};
