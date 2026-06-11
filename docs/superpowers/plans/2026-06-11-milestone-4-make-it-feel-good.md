# HOUSE EDGE — Milestone 4: Make It Feel Good — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The playtest verdict on milestone-3 was "mechanically sound, experientially dead." This milestone adds the missing half of the game: sound, impact feedback, spectacle density, identity art, and slot drama. No new mechanics — fun-per-change is the only metric.

**Architecture:** The sim stays almost untouched (one new `shot` event + pacing retunes in config). Everything else is presentation: a ZzFX audio module in `src/render/`, a shake/flash system on the renderer, hit-stop in the main loop's accumulator (scheduling only — determinism unaffected), and purely-visual particles. Audio reacts to sim events and state-version changes; it never influences the sim.

**Tech Stack:** + `zzfx` (npm, ~1KB, procedural SFX — zero asset files, zero licensing).

**Context for a fresh session:** Game is live at https://positivitty.github.io/house-edge/ (repo Positivitty/house-edge, deploys on push to main). 66 tests green at tag `milestone-3`. Spec: `docs/superpowers/specs/2026-06-10-house-edge-design.md` (v3). Core loop: explore a casino floor; press E at gold slot machines to play them (world pauses; stakes/pull/ride-or-cash); pulls drain HEAT, stopping makes HEAT climb and guards swarm; machines run cold; jackpots open upgrade drafts; luck 100 trips a survive-45s alarm to win. Sim/render split is strict: `src/sim/` pure TS (never import pixi/DOM there), `src/render/` PixiJS v8, all randomness through `resolve()`/`Rng`. Commits: NO Co-Authored-By lines. Don't push until the final task.

**SOUND PARAM NOTE (sanctioned):** the ZzFX arrays below are starting points, not gospel — they are data constants to be tuned by ear in the dev server. Tuning them is expected and does not violate the plan. Get the wiring right; Noah tunes feel.

---

### Task 1: Sim — `shot` event + spectacle pacing retune

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/tick.ts`, `src/sim/config.ts`
- Test: `src/sim/tick.test.ts` (append)

- [ ] **Step 1:** Add to the `SimEvent` union in types.ts: `| { kind: 'shot'; pos: Vec2 }`.

- [ ] **Step 2: Failing test** (append to the weapon describe block in tick.test.ts):

```ts
  it('firing emits a shot event', () => {
    const s = withEnemy(200, 0)
    tick(s, noInput, createRng(4))
    expect(s.events.some((e) => e.kind === 'shot')).toBe(true)
  })
```

- [ ] **Step 3:** In `fireWeapon` in tick.ts, right after the projectile push: `state.events.push({ kind: 'shot', pos: { x: p.pos.x, y: p.pos.y } })`.

- [ ] **Step 4: Pacing retune** in config.ts (denser floor, faster danger — the cap protects perf):

```ts
  heat: {
    risePerTick: 0.055, // ~30s from 0 to 100 — the floor turns hostile faster
    spawnThreshold: 10,
    minSpawnIntervalTicks: 12, // at heat 100: a guard every 0.2s
    maxSpawnIntervalTicks: 120, // at the threshold
  },
```

and in `guards`: `maxOnScreen: 60,` (was 30 — spectacle needs bodies; they're circles, perf is fine).

- [ ] **Step 5:** Full suite — the capped-guards test still passes (cap is read from config). Two heat-arithmetic tests reference `risePerTick` via CONFIG so they self-adjust; the "no guards below threshold" test runs 200 ticks → heat now reaches 11 > threshold — CHECK it: if it fails, reduce its loop to 150 ticks (150 × 0.055 = 8.25 < 10) with a comment. `npx tsc --noEmit`.

- [ ] **Step 6: Commit** — `feat: shot events and denser spectacle pacing`

---

### Task 2: Audio — ZzFX module, combat/slot SFX, gesture unlock, M mute

**Files:**
- Create: `src/render/audio.ts`
- Modify: `src/main.ts`, `src/render/renderer.ts`, `package.json` (dep)

- [ ] **Step 1:** `npm install zzfx`

- [ ] **Step 2: Create `src/render/audio.ts`:**

```ts
// All sound in the game. Renderer-side only — the sim never knows audio exists.
// Param arrays are STARTING POINTS — tune by ear in the dev server.
import { zzfx } from 'zzfx'

const SFX = {
  shot: [0.3, , 90, , 0.01, 0.03, 4, 1.2, , , , , , , , , , 0.6, 0.01],
  hit: [0.4, , 224, 0.01, 0.02, 0.08, 1, 1.7, -13.9, , , , , , , 0.1, , 0.7, 0.05],
  crit: [0.6, , 471, , 0.09, 0.29, 1, 1.8, , 0.3, , , , 1.2, , 0.3, 0.13, 0.9, 0.06],
  kill: [0.5, , 129, 0.01, 0.06, 0.26, 4, 1.9, , , , , , 0.6, , 0.3, , 0.7, 0.07],
  chip: [0.25, , 1306, , 0.01, 0.06, 1, 2.5, , , 566, 0.04, , , , , , 0.5, 0.01],
  playerHit: [0.6, , 130, 0.01, 0.08, 0.2, 3, 2.3, -0.5, , , , , 1.4, , 0.4, , 0.6, 0.09],
  luckySave: [0.7, , 392, 0.05, 0.25, 0.4, 1, 1.5, , , 200, 0.08, 0.1, , , , , 0.8, 0.2],
  reelTick: [0.2, , 900, , 0.01, 0.02, 1, 3, , , , , , , , , , 0.4, 0.01],
  reelLand: [0.35, , 300, , 0.02, 0.08, 1, 1.6, , , , , , , , , , 0.6, 0.03],
  lever: [0.4, , 150, 0.02, 0.05, 0.12, 4, 0.8, , , , , , , , , , 0.6, 0.05],
  win: [0.5, , 523, 0.04, 0.18, 0.3, 1, 1.3, , , 130, 0.06, 0.08, , , , , 0.8, 0.15],
  jackpot: [0.7, , 392, 0.05, 0.3, 0.5, 1, 1.2, , , 196, 0.1, 0.15, , , 0.2, , 0.9, 0.3],
  bust: [0.6, , 80, 0.02, 0.15, 0.35, 3, 2.8, -2, , , , , 1.8, , 0.5, , 0.7, 0.15],
  rideDrum: [0.4, , 200, 0.02, 0.1, 0.15, 2, 1.5, , , , , 0.1, , , 0.2, , 0.6, 0.08],
  cash: [0.45, , 1046, , 0.04, 0.18, 1, 1.8, , , 262, 0.05, , , , , , 0.7, 0.06],
  alarm: [0.8, , 400, 0.1, 0.4, 0.6, 2, 0.5, , , 100, 0.2, 0.3, , , 0.3, , 0.9, 0.4],
  victory: [0.7, , 523, 0.08, 0.4, 0.7, 1, 1.1, , , 261, 0.15, 0.2, , , , , 0.9, 0.5],
  draftOpen: [0.4, , 660, 0.03, 0.12, 0.25, 1, 1.4, , , 220, 0.07, , , , , , 0.7, 0.1],
  busted: [0.7, , 110, 0.05, 0.3, 0.8, 3, 1.2, -1, , , , , 2, , 0.5, 0.2, 0.6, 0.4],
} as const

export type SfxName = keyof typeof SFX

let unlocked = false
let muted = false
const lastPlayed = new Map<SfxName, number>()

// browsers require a user gesture before audio — call this from any input handler
export function unlockAudio(): void {
  unlocked = true
}

export function toggleMute(): boolean {
  muted = !muted
  return muted
}

export function play(name: SfxName, throttleMs = 30): void {
  if (!unlocked || muted) return
  const now = performance.now()
  const last = lastPlayed.get(name) ?? 0
  if (now - last < throttleMs) return // density protection: 60 kills/sec ≠ 60 overlapping sfx
  lastPlayed.set(name, now)
  zzfx(...(SFX[name] as unknown as number[]))
}
```

If the `zzfx` package has no TypeScript types, add `src/zzfx.d.ts` with `declare module 'zzfx' { export function zzfx(...params: (number | undefined)[]): AudioBufferSourceNode }`.

- [ ] **Step 3: Wire combat sounds in renderer.ts** — in the event-consumption loop of `drawPopups` (which already runs at most once per sim tick), play: `shot`→shot (throttle 80ms), `roll` with `result.event==='hit' && success`→hit, crit success→crit, `kill`→kill + chip, `playerHit`→playerHit, `luckySave`→luckySave, `alarm`→alarm, `victory`→victory. Import `{ play }` from './audio'.

- [ ] **Step 4: Wire slot/draft/status sounds.** Slot sounds key off version changes in `syncSlot`'s REBUILD path (which runs once per slot mutation): outcome kind 'luck'/'chips'→win, 'jackpot' is unreachable there (slot closes) — instead play `jackpot` + `draftOpen` in `syncDraft`'s open path; 'bust'→bust, 'rideWin'→rideDrum, 'rideLoss'→bust (quieter: pass a custom throttle, fine), cash → in the rebuild after a cash (outcome null + version changed) play cash. Pull lever: play `lever` on rebuild when reels reference CHANGED (the fresh-pull detection from the reel-flicker fix). Reel sounds in `animateReels`: while flickering play `reelTick` (throttle 60ms); at each reveal moment play `reelLand`. GameOver: in `draw()`, play `busted` once when `state.gameOver` first becomes true (track a `playedBusted` flag, reset if state.gameOver is false).

- [ ] **Step 5: main.ts** — `import { unlockAudio, toggleMute } from './render/audio'`; call `unlockAudio()` as the first line of the keydown handler; add `if (e.code === 'KeyM') toggleMute()` in the combat branch (and document M in the help/README later task).

- [ ] **Step 6:** `npx vitest --run` (67), `npx tsc --noEmit`, `npm run build`. Audio is untestable headlessly — correctness = compiles + wiring points verified by reading.

- [ ] **Step 7: Commit** — `feat: zzfx audio - combat, slot, and status sfx with mute`

---

### Task 3: Impact — screen shake, hit-stop, damage flash

**Files:**
- Modify: `src/render/renderer.ts`, `src/main.ts`

- [ ] **Step 1: Shake system in renderer.ts.** Fields: `private shake = 0`. Public method `addShake(n: number): void { this.shake = Math.min(this.shake + n, 24) }`. In `draw()`, AFTER computing camX/camY: if `this.shake > 0.1`, offset both by `(Math.random() - 0.5) * this.shake` (render-only randomness is allowed — it never touches the sim) and decay `this.shake *= 0.88`. Trigger from the event loop: kill→addShake(3), crit→addShake(6), playerHit→addShake(8), luckySave→addShake(14), alarm→addShake(20). Bust (slot): addShake(10) from syncSlot's rebuild on bust outcome.

- [ ] **Step 2: Damage flash.** Field `private flash = 0` + a fullscreen white Graphics overlay (stage-level, alpha 0) created in init. playerHit→`this.flash = 0.35`; luckySave→`this.flash = 0.6` (gold tint: set the overlay fill color per case — simplest: two overlays, white and gold). Each draw: overlay.alpha = flash, flash *= 0.85.

- [ ] **Step 3: Hit-stop in main.ts.** On kill events the game should freeze for a few frames. Implementation: renderer exposes `consumeHitStop(): number` — during event consumption it accumulates `hitStopFrames` (kill→2, crit kill→4 — kills following a successful crit roll in the same tick; simplest: kill→3 flat). In the ticker loop, before draining the accumulator: `const stop = renderer.consumeHitStop(); if (stop > 0) { acc = 0; hitStopLeft = stop }` and `if (hitStopLeft > 0) { hitStopLeft--; renderer.draw(state); return }` (skip sim ticks, keep drawing). Keep it SIMPLE — a `hitStopLeft` counter in main(), decremented per frame, skipping the accumulator drain while positive. Determinism is unaffected (same ticks, different wall-clock).

- [ ] **Step 4:** Suite (67), tsc, build. Play it locally — shake on kills, freeze-frames, flash on damage.

- [ ] **Step 5: Commit** — `feat: screen shake, hit-stop, damage flash`

---

### Task 4: Particles — chip scatter, projectile trails, muzzle flash

**Files:**
- Modify: `src/render/renderer.ts`

All purely visual (render-local state; the sim's chips counter is already correct — these are the money FEELING like money).

- [ ] **Step 1: Particle system.** A `private particles: {g: Graphics, vx: number, vy: number, ttl: number, maxTtl: number, kind: 'chip'|'spark'}[] = []` pool on the renderer, drawn into the world container. Update each draw: integrate velocity (chips decelerate ×0.92/frame), fade alpha by ttl/maxTtl, destroy at 0. Cap at 400 live particles (skip spawning beyond).

- [ ] **Step 2: Kill → chip scatter.** On `kill` events: spawn `4 + min(ev.chips, 8)` small gold circles (radius 3) at the kill position with random velocities (speed 2–5 px/frame, random angle), ttl ~40. After 12 frames of scatter, give them homing toward the player's CURRENT position (lerp velocity toward player at increasing strength) and destroy on arrival (<20px), playing the `chip` sfx (throttled). The vacuum is the dopamine.

- [ ] **Step 3: Sparks.** On `roll` hit-success events: 3 cyan sparks at the position, fast, ttl 12. On `playerHit`: 6 red sparks. On bust (syncSlot rebuild): 12 red sparks at screen center of the slot UI — skip if fiddly; the shake+sound carry it.

- [ ] **Step 4: Muzzle flash + trails.** Muzzle: on `shot` events, a small bright circle at the player edge facing the shot for 2 frames (a particle with ttl 2, kind spark, radius 6). Trails: in the projectile drawing loop, draw each projectile twice more at 60%/30% alpha offset backward along `-vel * DT * 1.5` and `* 3` — fake trail, zero state.

- [ ] **Step 5:** Suite (67), tsc, build, eyeball in dev server.

- [ ] **Step 6: Commit** — `feat: chip scatter with vacuum, sparks, muzzle flash, trails`

---

### Task 5: Identity art — guards, player, machines (still procedural)

**Files:**
- Modify: `src/render/renderer.ts`

- [ ] **Step 1: Guards become casino muscle.** Replace the plain red circle: dark suit (rounded rect body 18×22, color 0x1a1a22), white shirt triangle, red tie (thin rect), pale head circle on top. Draw via the existing per-frame `enemiesG.clear()` loop (a few primitives per guard × 60 = fine). Subtle 2-frame walk bob: offset y by `Math.sin((state.tick + e.id * 7) * 0.3) * 1.5` — uses sim tick, deterministic, fine.

- [ ] **Step 2: Player reads as THE chip.** Gold circle + inner ring + 4 edge notches (casino chip), tiny tilt wobble while moving (rotate the Graphics container by sin(tick·0.2)·0.06 when input held — pass a `moving` hint by comparing player pos to a `lastPlayerPos` field).

- [ ] **Step 3: Machines glow.** Warm machines: pulsing outer glow (second roundRect, alpha = 0.25 + 0.15·sin(tick·0.05 + m.id), color machineWarm) + tiny screen rect that flickers color by `(tick + m.id) % N` buckets. Cold machines stay flat gray, plus a dark "OUT OF ORDER" diagonal strip (thin rotated rect — if rotation on Graphics paths is awkward in v8, a contrasting horizontal strip is fine).

- [ ] **Step 4:** Suite (67), tsc, build, eyeball.

- [ ] **Step 5: Commit** — `feat: identity art - suited guards, chip player, glowing machines`

---

### Task 6: Slot drama — reveal pacing, near-miss, lever, celebration

**Files:**
- Modify: `src/render/renderer.ts`

- [ ] **Step 1: Slower, escalating reveal.** Reveal frames become 25/55/95 (≈0.4s/0.9s/1.6s) instead of 18/36/54. `reelTick` cadence rises as each reveal approaches (play when `reelRevealFrame % max(2, 8 - Math.floor(reelRevealFrame/12)) === 0`).

- [ ] **Step 2: Near-miss tension.** In `animateReels`, when the first two revealed symbols MATCH and the third is still spinning, delay the third reveal by +40 frames (set once — track a `nearMissApplied` flag reset per spin) and shake slightly (addShake(2) every ~10 frames during the extension). Two 7s with a spinning third reel is the most important moment in the whole game — let it breathe.

- [ ] **Step 3: Lever.** A drawn lever (rod + ball) on the right side of the machine frame; on fresh-pull rebuild animate it yanking down over ~8 frames then springing back (render-local frame counter; redraw as part of slot UI).

- [ ] **Step 4: Win/jackpot celebration.** On luck/chips win reveal completion: pulse the result text scale (1→1.3→1, ~12 frames) and spawn 10 gold sparks at the reels. Jackpot path: the draft opens instead — make `syncDraft`'s open BIG: flash gold (use the flash system at 0.5), addShake(12), the already-wired jackpot sting.

- [ ] **Step 5:** Suite (67), tsc, build, and PLAY a full slot session in dev — pull, near-miss, win, ride, bust.

- [ ] **Step 6: Commit** — `feat: slot drama - escalating reveals, near-miss tension, lever, celebration`

---

### Task 7: Ship Milestone 4

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** README Status section — rewrite to mention sound + feel (one short paragraph, keep the existing structure); add `**M** mutes` to Controls.

- [ ] **Step 2:** `git add README.md && git commit -m "docs: milestone 4 readme - make it feel good"`, push, `gh run watch --exit-status`, verify live (200 + fresh bundle hash ≠ index-eIvKLQnK.js).

- [ ] **Step 3:** `git tag milestone-4 && git push --tags`

---

## Self-review notes (already applied)

- **Scope honesty:** zero new mechanics; sim changes limited to one event + config pacing numbers. Everything else renderer/main. Sim purity preserved (audio/particles/shake never imported by src/sim).
- **Determinism:** untouched — hit-stop is wall-clock scheduling; shake/particles use render-local Math.random which never feeds the sim; walk-bob uses state.tick (deterministic input, render output).
- **Type consistency:** `play(name, throttleMs?)`, `addShake(n)`, `consumeHitStop()`, SimEvent `shot` — defined once, consumed in Tasks 2–6 as written.
- **The fun thesis being tested:** sound + impact + density + drama. If the next playtest still says "nothing jumps out," the problem is depth (enemy variety/charms) and that's the M5 pivot.
