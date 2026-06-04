import { withClerkHandler } from 'svelte-clerk/server';

// Authenticates every request and exposes `locals.auth()` (Clerk session) to
// server load functions and endpoints. Anonymous requests still pass through —
// auth is optional; only streak recording requires a signed-in user.
export const handle = withClerkHandler();
