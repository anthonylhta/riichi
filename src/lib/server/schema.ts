import { pgTable, serial, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export const games = pgTable('games', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').references(() => users.id),
	finalScores: jsonb('final_scores').notNull(),
	winner: integer('winner').notNull(),
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
