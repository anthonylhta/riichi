import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '$env/dynamic/private';

// Created lazily on first use. Building this at module top-level calls neon()
// during SvelteKit's build/analyse step (which imports +page.server modules with
// no env vars set) and throws "No database connection string". Defer to runtime.
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
	if (!_db) _db = drizzle(neon(env.DATABASE_URL!));
	return _db;
}
