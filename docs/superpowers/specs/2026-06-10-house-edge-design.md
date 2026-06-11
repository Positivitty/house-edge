# HOUSE EDGE — Design Spec (v3)

**Date:** 2026-06-10 (v3 on 2026-06-11 — playable slots)
**Deadline:** 2026-06-22 (hard — last day of Claude access; final deploy must land by end of June 21)
**Status:** v3 approved by Noah 2026-06-11

> **v3 changelog:** Gambling becomes a playable minigame. Auto-spinning by proximity is
> replaced by an interactive slot: press E at a machine, the world pauses, and the player
> bets stakes, pulls the lever, and rides or cashes wins. HEAT now drains **per pull**
> (scaled by stake) instead of per tick, and guard retreat keys off low HEAT instead of
> "currently gambling". Everything else from v2 stands.
>
> **v2 changelog:** After playtesting Milestone 1, the discrete-wave + between-wave-shop
> structure was replaced by **The Floor**: a large explorable casino floor where gambling
> at slot machines is the source of both luck and safety, and stopping is what summons
> the guards. Waves are gone; pressure is continuous and driven by HEAT. Milestone 1
> (luck engine, combat, death saves, determinism, deploy) carries over unchanged.

## What it is

A browser-based action roguelike on a big scrolling casino floor. **Luck is the universal
resolution mechanic** — every hit, crit, death save, loot drop, and slot reel is a visible
roll of LUCK vs the rising HOUSE EDGE. The twist: **gambling is safety**. While you feed a
slot machine, the house treats you as a customer — guards back off. The moment you stop,
you're a problem on the floor and they swarm you, Vampire Survivors-style.

**Goals, in priority order:** (1) finished, deployed, playable by June 22; (2) resume-credible
engineering (deterministic sim, statistical balance tests, performance); (3) actually fun.

**Non-goals:** multiplayer, accounts, monetization, mobile.

## Core loop — The Floor

1. Start a seeded run at the center of a large casino floor (~3200×2400, camera follows).
   Slot machines are scattered across it; one sits near spawn.
2. **Gamble:** stand at a warm machine with chips and it auto-spins — each spin costs chips
   and converts to LUCK via a visible reel roll. While gambling: guards stop spawning,
   existing guards retreat, and HEAT drains.
3. **Jackpot spins deal an upgrade draft:** 3 luck-tilted reels of upgrades, pick one free,
   reroll a reel for chips. (The slot machine IS the progression system.)
4. **Machines run cold** after a fixed number of spins — permanently. To keep gambling you
   must cross the floor to a fresh machine, through whatever is hunting you.
5. **Stop gambling and HEAT climbs.** Guards spawn on a ring just off-screen and converge;
   spawn rate scales with HEAT. Guards drop chips when killed — fighting is the only income.
6. **The triangle:** chips come from fighting, luck and safety come from gambling, survival
   comes from luck. Greed punishes in both directions.
7. **Break the bank:** when LUCK reaches the target, the house knows it's losing — alarm.
   Every machine dies, HEAT pins at maximum, and you must survive the all-out swarm to win.
   Death ends the run with an itemized casino receipt; victory continues as endless.

## The Luck engine (unchanged from v1)

One resolver handles every roll: `resolve(event, luck, houseEdge, rng, modifiers) → {event, roll, chance, success}`.
Events: hit, crit, deathSave, loot, reel. Fairness rules are non-negotiable: rolls are always
visible (popups / reel displays), always manipulable (upgrades now; charms later), and all
randomness flows from one seeded RNG. Death saves: fatal damage triggers a dramatic roll —
survive at 1 HP (limited uses) or bust.

**HOUSE EDGE now rises with elapsed time** (not waves): a per-minute ramp that makes every
roll progressively harder. The run is an arms race between your gambling and the clock.

## HEAT

- Visible meter (with the number), 0–100. Rises every tick on the open floor.
- **Drains per slot pull, scaled by stake** — spending money is what calms the house.
- Below a small threshold: no spawns, and live guards retreat away from you (you're a
  customer in good standing; shooting them in the back remains sanctioned behavior).
- Above it: guard spawn interval scales with HEAT (hotter = faster). On-screen guard
  count is capped so swarms stay survivable-by-skill.
- During the alarm: HEAT is pinned at 100.

## Slot machines — the playable slot

- ~12 per floor, deterministic seeded placement, one guaranteed near spawn. Each machine
  has a fixed number of pulls, then runs cold permanently (forces traversal).
- **Press E at a warm machine to sit down. The world pauses** (the house pauses the floor
  for a paying customer). E/ESC stands you up, straight back into the action.
- **Stakes:** bet 3 / 10 / 25 chips (←/→ selects). Bigger stakes pay more luck, add a
  bonus to the win roll, and drain more HEAT per pull.
- **SPACE pulls the lever.** Three reels land one by one. Outcomes (all resolved through
  the one luck resolver; symbols are presentation):
  - 🍀🍀🍀 **LUCK win** — luck payout scaled by stake (offered as a ride-or-cash win)
  - 🍒🍒🍒 **CHIPS win** — chips back, multiple of stake (ride-or-cash)
  - 7️⃣7️⃣7️⃣ **JACKPOT** — big luck immediately + the upgrade draft opens
  - 💀 **BUST** (rare) — the pit boss noticed you: HEAT spikes
  - junk — stake lost, nothing happens
- **Double-or-nothing:** any ride-or-cash win offers RIDE (SPACE — double it at slightly
  house-favored odds, repeatable) vs CASH (ENTER — bank it). Standing up auto-cashes.
- Each pull: costs the stake, burns one of the machine's pulls, drains HEAT by stake tier.
- Upgrade draft: unchanged — sim stays frozen ('draft' phase), 3 luck-tilted reels,
  pick one free (1/2/3), reroll a reel for chips (4/5/6).

## Architecture (unchanged foundations, new world)

Stack: Vite + TypeScript strict + PixiJS v8 + Vitest; client-only; GitHub Pages via Actions.
Strict sim/render split: `src/sim/` pure TS (tick(state, input, rng), one resolver, seeded
RNG); `src/render/` PixiJS camera + drawing; `src/content/` data (upgrades; later charms).
Screen is 1280×720; the world is larger and the camera follows the player. Guards spawn on
a ring just outside the view, clamped to world bounds. Statistical balance tests and a
full-sim determinism test (including scripted draft picks) guard every milestone.

## Content scope (current target)

- **Guards:** one chaser type, stats scale with elapsed time. (Variety + Pit Bosses: later.)
- **Weapons:** the auto-fire sidearm; more weapons via drafts later.
- **Upgrades:** ~10 across common/rare/jackpot (luck, speed, hp, damage, fire rate, crit,
  death saves). Charms (roll modifiers) are a later milestone.
- **Floor:** one floor layout per run, seeded machine placement. Multiple floors: stretch.
- **Meta:** local stats/best runs. Daily seed UI: later milestone.

## Presentation

Neon-on-felt procedural visuals (no asset files): gold player chip, red guards, gold/gray
slot machines (warm/cold), HEAT bar, roll popups, slot-reel draft overlay, casino-receipt
death/victory screens (receipt: later milestone). Audio via ZzFX: later milestone.

## Testing

Unit + statistical tests on the sim (resolver bands, spin economy, heat curve, alarm);
determinism test across waves of gambling/fighting including scripted draft commands;
Noah playtests daily — all tunables live in `src/sim/config.ts` so feel fixes are number tweaks.

## Schedule (every day ends playable)

| Days (June) | Goal |
|---|---|
| 10 | ✅ M1 shipped: luck engine, combat, death saves, determinism, live deploy. |
| 11 | ✅ M2 shipped — The Floor: big world + camera, machines, HEAT + guards, drafts, alarm + victory. |
| 11–13 | **M3 — The Playable Slot:** E-to-sit slot minigame (stakes, pulls, ride-or-cash, bust), heat-per-pull economy, guard cap, R-restart, numeric heat. |
| 14–16 | M4 — depth: charms as RollModifiers, hot-streak multiplier, guard variety, Pit Boss. |
| 17–18 | M5 — juice: ZzFX audio, screen shake/hit-stop, reel animations+, death receipt, daily seed. |
| 19–20 | Balance passes from playtests; performance (pooling) if needed. |
| 21 | Buffer: bugs, README/GIFs, final deploy, resume blurb. |

Cut order if life eats days: M5 extras → guard variety → hot streak → charm count.
The Floor loop (slot/heat/fight) and polish on it are never cut.

## Repo & deploy

Public repo `Positivitty/house-edge`; GitHub Pages auto-deploy on push to main; live at
https://positivitty.github.io/house-edge/. No Co-Authored-By lines in commits.
