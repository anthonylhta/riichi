# Riichi

A browser-based riichi mahjong game built to help you learn the game and get better at it.

### ▶ Play now — [riichi.anthonyta.dev](https://riichi.anthonyta.dev)

No account, no download, no setup. Open it and play.

## What this is

Most mahjong clients compete on features and polish. Riichi competes on **understanding**.
It came out of a simple frustration: learning riichi mahjong is hard when good learning
resources are scarce. Riichi is the tool the author wished existed — not another place to
grind games, but a place to understand _why_ a play is good.

It's a passion project and a learning project, and it's free.

## The game

- **Solo play.** One human against three AI opponents — no account needed to start, no
  multiplayer.
- **Real rules, real scoring.** Full riichi rules — riichi (incl. double riichi, ippatsu),
  tsumo, ron, pon/chi/kan, furiten, dora/ura/aka dora, the situational yaku (haitei/houtei,
  tenhou/chiihou) — with proper yaku detection and scoring, and Mahjong-Soul-accurate
  game-end rules (dealer renchan, tobi, the 30,000 target + sudden-death overtime).
- **Opponents you can learn from.** The AI is rule-based and comes in two flavours — basic
  opponents that play for pure efficiency, and a stronger one with some defensive sense.
  They're intentionally not world-class: learning to read and punish an opponent's mistakes
  is part of the point.

## Learning features

These are what make Riichi a _learning_ tool rather than just a game. They're powered by the
Claude API, designed to be genuinely cheap to run (the heavy correctness work is delegated to
the mahjong libraries — Claude just teaches).

- **In-round helper** — an opt-in nudge that looks at exactly what you can see and explains
  one recommendation: what to discard and why, what kind of hand to aim for, the value of a
  tile. The discard advice is grounded in real efficiency numbers, not the model's guess.
- **Post-game overview** — a short narrative of where a game turned and what to do
  differently. Your client flags a handful of key moments first, so only those are sent to
  Claude — focused coaching instead of a wall of stats.
- **Hand of the Day** — one shared daily "best discard" puzzle for everyone. Claude invents
  the hand and writes the explanation, but the **correct answer is computed from the
  efficiency library**, so it's provably right. Sign in to build a daily streak.

## Accounts

Anonymous-first: play freely, no account required. Sign in (handled by **Clerk**) only to
save things — currently your **Hand of the Day streak**, with game history and progress
tracking on the roadmap. Answers are graded server-side, so streaks can't be gamed.

## How it's built

- The game is a **deterministic, client-side state machine**. One `GameState` value is the
  single source of truth; the rules engine is written as pure functions that take a state
  and return the next one, which keeps it easy to test and reason about.
- The hard, correctness-critical maths is delegated to battle-tested libraries rather than
  hand-rolled: **scoring/yaku** and **shanten/efficiency** each have a dedicated library
  (see Tech stack). Our own code is mostly the game flow, the AI, and the teaching layer.
- Code is organised in clear layers: a pure game engine, a store layer that handles timing
  and orchestration, and the SvelteKit UI on top.

## Tech stack

- [SvelteKit](https://kit.svelte.dev/) (Svelte 5) — frontend framework
- [Neon](https://neon.tech/) + [Drizzle ORM](https://orm.drizzle.team/) — serverless Postgres
- [Clerk](https://clerk.com/) (via [`svelte-clerk`](https://github.com/wobsoriano/svelte-clerk)) — authentication
- [Vercel](https://vercel.com/) — hosting (incl. a daily cron that pre-generates the puzzle)
- [riichi-rs-bundlers](https://www.npmjs.com/package/riichi-rs-bundlers) — Rust/WASM yaku detection and scoring (a WASM build of [riichi-rust](https://github.com/MahjongPantheon/riichi-rust))
- [mahjong-tile-efficiency](https://www.npmjs.com/package/mahjong-tile-efficiency) — shanten and ukeire calculation
- [Claude API](https://docs.anthropic.com/) — the learning features

## Roadmap

The core game and learning features are live. What's next:

- **Improvement tracking** — win rate, deal-in rate, and hand-efficiency trends over time.
- **Game history** — saved, replayable games for signed-in players (the foundation for the
  tracking above and for turn-level post-game analysis).

## Development

```bash
npm run dev       # start the dev server
npm run build     # production build
npm run check     # type check (svelte-check)
npm run lint      # prettier + eslint
npm run test      # run the test suite (vitest)
npm run db:push   # push schema changes to Neon
npm run db:studio # open Drizzle Studio
```

Environment variables are documented in [`.env.example`](.env.example) — a Neon
`DATABASE_URL`, an `ANTHROPIC_API_KEY`, and Clerk keys
(`PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`).
