Start a new feature branch for this project.

1. Create and check out a branch named `feat/$ARGUMENTS`
2. Remind me of the standard implementation order for this project:
   - `src/lib/game/types.ts` — add any new types or game state fields first
   - `src/lib/game/engine.ts` — pure game logic
   - `src/lib/stores/game.ts` — wire up new engine functions
   - `src/routes/game/+page.svelte` — UI last
3. Remind me to make a separate commit for each of those layers, not one big commit.
