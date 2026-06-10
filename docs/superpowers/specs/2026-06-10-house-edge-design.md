# HOUSE EDGE — Design Spec

**Date:** 2026-06-10
**Deadline:** 2026-06-22 (hard — last day of Claude access; final deploy must land by end of June 21)
**Status:** Approved by Noah 2026-06-10

## What it is

A browser-based action roguelike (Vampire Survivors-style wave survival) where **luck is the universal resolution mechanic**. Every consequential event — attack hits, crits, death saves, loot rarity, upgrade offers — is a visible roll of the player's LUCK stat against the rising HOUSE EDGE. Casino theme throughout: the arena is a casino floor trying to kill you, currency is chips, upgrades come from a slot machine, minibosses are Pit Bosses.

**Goals, in priority order:**
1. A finished, deployed, playable game by June 22 (portfolio piece — public repo, free GitHub Pages hosting, $0 running cost forever).
2. Resume-credible engineering: deterministic simulation, statistical balance testing, performance at scale.
3. Fun enough that people actually play it.

**Non-goals:** multiplayer, accounts, monetization, mobile-first (desktop browser with keyboard is the target; mobile is out of scope).

## Core loop

1. Start a run (seeded — daily seed and shareable custom seeds supported).
2. Survive escalating waves on the casino floor. Weapons auto-fire; the player steers and dodges. Enemies drop **chips**.
3. Between waves: the **slot machine** deals 3 reels of upgrade options. Pick one. Spend chips to reroll individual reels or hold good ones.
4. Every 5th wave: a **PIT BOSS** miniboss with a luck-themed gimmick.
5. Survive wave 20 → **beat the house** (win screen + "cash out" receipt of the run). Endless mode continues after.
6. Death ends the run with the same itemized casino-receipt results screen.

## The Luck engine

**One rule resolves everything.** A single resolver function handles every roll in the game:

```
resolve(event, luckStat, houseEdge, modifiers) → outcome
```

- **Events resolved by rolls:** attack hit/crit, incoming-damage death save, loot drop rarity, slot machine reel quality.
- **Death save:** fatal damage triggers a dramatic slow-mo dice roll. Success = survive at 1 HP with a screen-filling "LUCKY!". Limited uses per run (uses remaining shown in HUD) so it cannot be farmed.
- **HOUSE EDGE is the difficulty curve:** rises every wave, making all rolls harder. The run is an arms race — stack luck faster than the house stacks odds.
- **Hot streak:** consecutive successful rolls build a multiplier. The player chooses to ride it (bigger bonuses, lose it all on one failure) or cash it out (bank a smaller bonus). Push-your-luck on every roll.

**Fairness rules (non-negotiable — this is what keeps RNG from feeling unfair):**
1. Rolls are always **visible** — dice/reel popups, never silent coin flips.
2. Rolls are always **manipulable** — three layers:
   - **Charms:** passive items that bend rolls (reroll 1s, flat +luck, preview next roll, double-or-nothing).
   - **Chips:** spendable in the moment to reroll a bad roll.
   - **Hot streak:** the multiplier decision layer.
3. All randomness flows from **one seeded RNG** through the one resolver. Charms register as modifiers on the resolver — new charms cannot introduce new RNG paths.

## Architecture

**Stack:** Vite + TypeScript + PixiJS (WebGL) + Vitest. No server, no APIs, no paid services. Deployed to GitHub Pages via GitHub Action on push to main.

**Load-bearing decision — simulation/rendering split:**

```
src/
  sim/      Pure TypeScript game logic. No PixiJS, no DOM, no timers.
            tick(state, input) → new state. Seeded RNG. The one luck
            resolver lives here.
  render/   PixiJS layer drawing sim state. All juice (shake, hit-stop,
            particles, dice popups, slot reel animation) lives here.
  content/  Plain data: enemies, weapons, charms, waves, bosses.
            Adding content = adding objects to lists, no logic changes.
  ui/       HUD, title screen, slot-machine screen, results receipt.
```

**Why:** the sim is unit-testable (including statistical balance tests over thousands of seeded trials), deterministic (daily seeds, shareable seeds, reproducible bug reports), and safe for Claude to extend autonomously. Rendering stays a thin replaceable layer.

**Performance plan:** object pooling for enemies/projectiles/particles; spatial hash for collision. Target 60fps with 300+ live entities on a mid-range laptop.

## Content scope

All data-driven and individually cuttable:

- **Enemies — 8 types:** melee chasers, ranged card-throwers, splitting dice blobs, exploding chips, plus faster/tankier variants. Simple chase/shoot AI only.
- **Pit Bosses — 3:** every 5th wave, each with a luck gimmick (e.g., steals luck on hit; forces double-or-nothing rolls; jams the slot machine).
- **Weapons — 6:** auto-firing gambling devices (card flurry, roulette beam, dice mortar, chip ricochet, …). Start with one; acquire/upgrade via slot machine.
- **Charms — 20:** passive roll-benders; the build-variety engine. Examples: Loaded Dice (reroll 1s), Rabbit's Foot (+luck), Card Counter (preview next roll), Cursed Coin (every roll is double-or-nothing).
- **Arena:** one casino-floor arena. A second arena is a stretch goal.
- **Meta:** local-storage stats and best runs. Unlockable characters = stretch goal, not promised.

## Presentation

- **Visuals:** fully procedural neon-on-felt casino palette — chips, cards, dice, glow. No external asset files.
- **Juice:** screen shake, hit-stop on crits, particle bursts on rolls, slot reels with mechanical clunk, slow-mo death saves.
- **Audio:** ZzFX procedurally generated SFX. No audio files, no licensing, $0.
- **Results screen:** itemized casino receipt (rolls won/lost, biggest streak, chips earned, cause of death).

## Testing

- **Unit tests (Vitest)** on the sim: resolver behavior, charm modifiers, wave spawning, death-save limits.
- **Statistical balance tests:** e.g., "death save at 80 luck vs house edge 12 succeeds 65–75% over 10k seeded trials." Balance is asserted math, not vibes.
- **Determinism test:** same seed + same inputs → identical state hash.
- **Feel:** Noah playtests daily and files feel-notes; tunable values (spawn rates, luck curves, house-edge growth) live in content/config data so feel fixes are number tweaks.

## Schedule (every day ends playable)

| Days (June) | Goal |
|---|---|
| 10–11 | Scaffold, sim core, luck resolver, player + enemies + one weapon. Deploy pipeline live day 1. Playable by day 2. |
| 12–13 | Waves, chips, slot-machine draft, death saves. Full loop exists. |
| 14–16 | Charms system, hot streak, enemy variety, first Pit Boss. Daily playtests + statistical balance tests. |
| 17–18 | Content fill (20 charms, 8 enemies, 3 bosses), endless mode, daily seed. |
| 19–20 | Juice pass, audio, title/results screens, balance pass. |
| 21 | Buffer: bugs, README with GIFs, final deploy, resume blurb. |

If real life eats days, the cut order is: stretch goals → content counts (fewer charms/enemies/bosses) → endless mode → daily seed. The core loop and polish are never cut.

## Repo & deploy

- Fresh public repo: `~/Projects/house-edge` → Noah's personal GitHub.
- GitHub Pages via Actions on every push to main — live from the first day.
- No Co-Authored-By lines in commits.
