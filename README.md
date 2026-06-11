# HOUSE EDGE 🎰

An action roguelike where **luck is the core mechanic** — every hit, every
death save, every drop is a visible roll of your LUCK stat against the
rising HOUSE EDGE.

**Play it:** https://positivitty.github.io/house-edge/

## Status

Milestone 2 — **The Floor**: explore a big casino floor where gambling at slot
machines builds LUCK and keeps the guards away. Stop gambling and HEAT climbs —
the floor hunts you. Machines run cold, jackpots deal upgrade drafts, and hitting
the LUCK target trips the alarm: survive it to break the bank.
Next: charms, hot streak, guard variety, audio/juice.
Design spec: [docs/superpowers/specs/2026-06-10-house-edge-design.md](docs/superpowers/specs/2026-06-10-house-edge-design.md)

## Tech

- TypeScript + PixiJS, zero servers, zero APIs — runs entirely in your browser
- Deterministic simulation: all randomness flows from one seeded RNG through
  one luck resolver. Same seed = same run (`?seed=123`)
- Balance is enforced by statistical tests over thousands of seeded trials

## Controls

WASD / arrows to move. Stand at a gold slot machine to gamble (auto-spins —
costs chips, builds LUCK, keeps guards off you). Gray machines are cold.
Draft: 1/2/3 takes an upgrade, 4/5/6 rerolls that reel.

## Dev

```
npm install && npm run dev   # play locally
npx vitest --run             # run the sim test suite
```
