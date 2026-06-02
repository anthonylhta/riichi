import type { PageServerLoad } from './$types';
import { getOrCreateToday } from '$lib/server/handOfTheDay';

// Generation/caching happens server-side so the API key never reaches the client.
// First visit of the day pays the generation latency; everyone after reads the cache.
export const load: PageServerLoad = async () => {
	try {
		const today = await getOrCreateToday();
		return { today, error: null };
	} catch (e) {
		console.error('Hand of the Day failed:', e);
		return { today: null, error: 'Could not load today’s puzzle. Please try again later.' };
	}
};
