import type { LayoutServerLoad } from './$types';
import { buildClerkProps } from 'svelte-clerk/server';

// Hand the Clerk auth state to <ClerkProvider> so the client boots already
// knowing whether the visitor is signed in (no auth flash on load).
export const load: LayoutServerLoad = ({ locals }) => {
	return { ...buildClerkProps(locals.auth()) };
};
