# HOUSE EDGE 🎰

An action roguelike where **luck is the core mechanic** — every hit, every
death save, every drop is a visible roll of your LUCK stat against the
rising HOUSE EDGE.

**Play it:** https://positivitty.github.io/house-edge/

## Status

Milestone 1 — playable core: movement, enemies, auto-fire, luck-resolved
combat, death saves. Waves, the slot machine, charms, and hot streaks are
in progress. Design spec: [docs/superpowers/specs/2026-06-10-house-edge-design.md](docs/superpowers/specs/2026-06-10-house-edge-design.md)

## Tech

- TypeScript + PixiJS, zero servers, zero APIs — runs entirely in your browser
- Deterministic simulation: all randomness flows from one seeded RNG through
  one luck resolver. Same seed = same run (`?seed=123`)
- Balance is enforced by statistical tests over thousands of seeded trials

## Controls

WASD / arrow keys to move. Your weapon fires itself — the rolls decide the rest.

## Dev

```
npm install && npm run dev   # play locally
npx vitest --run             # run the sim test suite
```
