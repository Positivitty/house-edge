# HOUSE EDGE 🎰

An action roguelike where **luck is the core mechanic** — every hit, every
death save, every drop is a visible roll of your LUCK stat against the
rising HOUSE EDGE.

**Play it:** https://positivitty.github.io/house-edge/

## Status

Milestone 3 — **The Playable Slot**: walk up to a machine and press E — the
world pauses while you bet stakes, pull the lever, and ride or cash your wins.
Pulls drain HEAT (the house loves a customer); busts spike it. Machines still
run cold, jackpots still deal upgrade drafts, luck 100 still trips the alarm.
Next: charms, hot streak, guard variety, audio/juice.
Design spec: [docs/superpowers/specs/2026-06-10-house-edge-design.md](docs/superpowers/specs/2026-06-10-house-edge-design.md)

## Tech

- TypeScript + PixiJS, zero servers, zero APIs — runs entirely in your browser
- Deterministic simulation: all randomness flows from one seeded RNG through
  one luck resolver. Same seed = same run (`?seed=123`)
- Balance is enforced by statistical tests over thousands of seeded trials

## Controls

WASD / arrows to move. **E** at a gold machine sits you down (world pauses):
**◄/►** stake, **SPACE** pull (or ride a win), **ENTER** cash out, **E/ESC** stand up.
Draft: **1/2/3** takes an upgrade, **4/5/6** rerolls. **R** restarts after a bust.

## Dev

```
npm install && npm run dev   # play locally
npx vitest --run             # run the sim test suite
```
