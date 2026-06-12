# HOUSE EDGE 🎰

An action roguelike where **luck is the core mechanic** — every hit, every
death save, every drop is a visible roll of your LUCK stat against the
rising HOUSE EDGE.

**Play it:** https://positivitty.github.io/house-edge/

## Status

Milestone 4 — **Make It Feel Good**: ZzFX procedural audio brings combat, slot, and status SFX to life; screen shake, hit-stop, and damage flash punch every collision; chip-scatter particles vacuum into your stack; muzzle flashes and projectile trails slice through the air; identity art gives the world personality (suited guards, a chip-shaped player, glowing machines); and slot drama pulls you in with escalating reel reveals, near-miss suspense, an animated lever, and win celebrations. Zero new mechanics—just the juice.
Design spec: [docs/superpowers/specs/2026-06-10-house-edge-design.md](docs/superpowers/specs/2026-06-10-house-edge-design.md)

## Tech

- TypeScript + PixiJS, zero servers, zero APIs — runs entirely in your browser
- Deterministic simulation: all randomness flows from one seeded RNG through
  one luck resolver. Same seed = same run (`?seed=123`)
- Balance is enforced by statistical tests over thousands of seeded trials

## Controls

WASD / arrows to move. **E** at a gold machine sits you down (world pauses):
**◄/►** stake, **SPACE** pull (or ride a win), **ENTER** cash out, **E/ESC** stand up.
Draft: **1/2/3** takes an upgrade, **4/5/6** rerolls. **R** restarts after a bust. **M** mutes.

## Dev

```
npm install && npm run dev   # play locally
npx vitest --run             # run the sim test suite
```
