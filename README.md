# Riichi

A browser-based riichi mahjong game. Play against CPU opponents and learn the game at your own pace.

Live at [riichi.anthonyta.dev](https://riichi.anthonyta.dev)

## What's implemented

- Draw and discard loop against 3 CPU opponents
- East 1–4 round progression with dealer rotation and honba tracking
- AI auto-riichi, tsumo, and ron with full yaku detection and scoring
- Two AI difficulty tiers (basic and good)
- Post-round results overlay and game end final standings
- Neon Postgres schema ready for game persistence

## Roadmap

- [ ] Player riichi declaration
- [ ] Player tsumo and ron
- [ ] Pon / chi / kan (open meld calls)
- [ ] Furiten enforcement
- [ ] In-round hint button (one recommendation per turn)
- [ ] Post-game analysis of key decisions
- [ ] Hand of the Day puzzle
- [ ] Auth and accounts
- [ ] Stats and improvement tracking

## Tech stack

- [SvelteKit](https://kit.svelte.dev/) — frontend framework
- [Neon](https://neon.tech/) — serverless Postgres
- [Vercel](https://vercel.com/) — hosting
- [riichi-rs-bundlers](https://github.com/server-s/riichi-rs) — Rust/WASM yaku and scoring
- [mahjong-tile-efficiency](https://www.npmjs.com/package/mahjong-tile-efficiency) — shanten and ukeire calculation

## Development

```bash
npm run build     # production build
npm run check     # type check
npm run lint      # lint
npm run db:push   # push schema changes to Neon
npm run db:studio # open Drizzle Studio
```
