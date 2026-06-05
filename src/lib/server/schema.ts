import {
	pgTable,
	serial,
	text,
	integer,
	boolean,
	timestamp,
	jsonb,
	unique
} from 'drizzle-orm/pg-core';

// One row per Clerk identity. `clerkId` is Clerk's user id (e.g. "user_123"); the
// serial `id` stays the internal FK target so existing relations don't change.
export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	clerkId: text('clerk_id').notNull().unique(),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

// One Hand-of-the-Day attempt per user per day (the first answer locks the day).
// `date` is the Sydney 'YYYY-MM-DD' key, matching the puzzle's own day boundary.
// `correct` drives the streak: consecutive correct days keep it alive.
export const puzzleResults = pgTable(
	'puzzle_results',
	{
		id: serial('id').primaryKey(),
		userId: integer('user_id')
			.references(() => users.id)
			.notNull(),
		date: text('date').notNull(),
		choiceCode: integer('choice_code').notNull(),
		correct: boolean('correct').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => [unique('puzzle_results_user_date').on(t.userId, t.date)]
);

// One row per finished solo game (human is seat 0). `winner` is the seat that
// finished 1st; `placement` is the human's rank (1–4). `rounds` holds the full
// per-round log (RoundRecord[]) so the profile can derive hand-level stats
// (agari / deal-in rate) — turn-level moves stay in `game_moves`, still deferred.
export const games = pgTable('games', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').references(() => users.id),
	finalScores: jsonb('final_scores').notNull(),
	winner: integer('winner').notNull(),
	placement: integer('placement').notNull(),
	rounds: jsonb('rounds').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export const gameMoves = pgTable('game_moves', {
	id: serial('id').primaryKey(),
	gameId: integer('game_id')
		.references(() => games.id)
		.notNull(),
	turnNumber: integer('turn_number').notNull(),
	seat: integer('seat').notNull(),
	action: text('action').notNull(),
	tileCode: integer('tile_code'),
	handSnapshot: jsonb('hand_snapshot'),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

// One shared riichi puzzle per day, cached so Claude generates it only once.
// `date` is the UTC 'YYYY-MM-DD' key; `puzzle` holds the full puzzle payload.
export const handOfTheDay = pgTable('hand_of_the_day', {
	date: text('date').primaryKey(),
	puzzle: jsonb('puzzle').notNull(),
	model: text('model').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull()
});
