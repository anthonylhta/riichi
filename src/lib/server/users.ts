import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { users } from './schema';

// Map a Clerk identity to our internal user row, creating it on first sight.
// Returns the serial `users.id` used as the FK across our tables.
export async function getOrCreateUser(clerkId: string): Promise<number> {
	const db = getDb();

	const existing = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.clerkId, clerkId))
		.limit(1);
	if (existing.length) return existing[0].id;

	const inserted = await db
		.insert(users)
		.values({ clerkId })
		.onConflictDoNothing()
		.returning({ id: users.id });
	if (inserted.length) return inserted[0].id;

	// Lost a race with a concurrent insert — read the row the other request made.
	const row = (
		await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkId)).limit(1)
	)[0];
	return row.id;
}
