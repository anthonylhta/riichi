import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { puzzleResults } from './schema';
import { summarizeResults } from './profileLogic';
import type { ProfileSummary } from '$lib/game/profile';

// Read a user's full Hand-of-the-Day history (one row per answered day) and
// aggregate it. `today` is the Sydney calendar day, for the streak.
export async function getProfileSummary(userId: number, today: string): Promise<ProfileSummary> {
	const db = getDb();
	const rows = await db
		.select({ date: puzzleResults.date, correct: puzzleResults.correct })
		.from(puzzleResults)
		.where(eq(puzzleResults.userId, userId));
	return summarizeResults(rows, today);
}
