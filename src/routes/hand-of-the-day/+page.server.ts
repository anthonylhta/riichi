import type { PageServerLoad } from './$types';
import { getOrCreateToday } from '$lib/server/handOfTheDay';

// Generation/caching happens server-side so the API key never reaches the client.
// We DON'T await here: returning the promise un-resolved lets SvelteKit stream it,
// so the page shell renders immediately and the (potentially slow) first-visit
// generation resolves in place behind a skeleton. Everyone after reads the cache.
export const load: PageServerLoad = () => {
	const puzzle = getOrCreateToday()
		.then((today) => ({ today, error: null as string | null }))
		.catch((e) => {
			console.error('Hand of the Day failed:', e);
			return {
				today: null,
				error: 'Could not load today’s puzzle. Please try again later.' as string | null
			};
		});

	return { puzzle };
};
