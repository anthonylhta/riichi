# Riichi

A browser-based riichi mahjong game built to help you learn the game and get better at it.

Live at [riichi.anthonyta.dev](https://riichi.anthonyta.dev)

> Active development, working toward a first complete version. The project is not yet
> feature-complete — this README describes what Riichi _is_ and where it's going, rather
> than tracking which pieces are done at any given moment.

## What this is

Most mahjong clients compete on features and polish. Riichi competes on **understanding**.
It came out of a simple frustration: learning riichi mahjong is hard when good learning
resources are scarce. Riichi is the tool the author wished existed — not another place to
grind games, but a place to understand _why_ a play is good.

It's a passion project and a learning project, and it's free.

## The game

- **Solo play.** One human against three AI opponents — no account needed to start, no
  multiplayer.
- **Real rules, real scoring.** Full riichi rules (riichi, tsumo, ron, pon/chi/kan,
  furiten, dora/ura dora, the situational yaku) with proper yaku detection and scoring.
- **Opponents you can learn from.** The AI is rule-based and comes in two flavours — basic
  opponents that play for pure efficiency, and a stronger one with some defensive sense.
  They're intentionally not world-class: learning to read and punish an opponent's mistakes
  is part of the point.

## Learning features (the direction)

These are what make Riichi a _learning_ tool rather than just a game. They're powered by
the Claude API, designed to be genuinely cheap to run, and are being built on top of the
core game:

- **In-round helper** — an opt-in nudge that looks at exactly what you can see and explains
  one recommendation: what to discard, what kind of hand to aim for, the value of a tile.
- **Post-game overview** — a short narrative of where a game turned and what to do
  differently, focused on a handful of key decisions rather than a wall of stats.
- **Hand of the Day** — a daily puzzle with a question, the answer, and an explanation.
- **Improvement tracking** — win rate, deal-in rate, and efficiency trends over time, for
  players with an account.

Accounts are optional and only needed to _save_ things (history, progress, streaks). You
can always play anonymously.

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

- [SvelteKit](https://kit.svelte.dev/) — frontend framework
- [Neon](https://neon.tech/) — serverless Postgres
- [Vercel](https://vercel.com/) — hosting
- [riichi-rs-bundlers](https://www.npmjs.com/package/riichi-rs-bundlers) — Rust/WASM yaku detection and scoring (a WASM build of [riichi-rust](https://github.com/MahjongPantheon/riichi-rust))
- [mahjong-tile-efficiency](https://www.npmjs.com/package/mahjong-tile-efficiency) — shanten and ukeire calculation
- [Claude API](https://docs.anthropic.com/) — the learning features

## Development

```bash
npm run dev       # start the dev server
npm run build     # production build
npm run check     # type check
npm run lint      # prettier + eslint
npm run test      # run the test suite
npm run db:push   # push schema changes to Neon
npm run db:studio # open Drizzle Studio
```
