# HOUSE EDGE — Milestone 1: Playable Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed, playable arena: WASD movement, enemies that chase, an auto-firing weapon, and every hit/death resolved through the seeded luck engine — live on GitHub Pages.

**Architecture:** Strict sim/render split. `src/sim/` is pure TypeScript (no PixiJS/DOM/timers): `tick(state, input, rng)` advances one fixed 60Hz step, and ALL randomness flows through one seeded RNG into one `resolve()` function. `src/render/` is a PixiJS layer that draws sim state and reads per-tick events for popups. TDD for everything in `sim/`.

**Tech Stack:** Vite, TypeScript (strict), PixiJS v8, Vitest. GitHub Pages via Actions.

**Spec:** `docs/superpowers/specs/2026-06-10-house-edge-design.md`

**Conventions for all tasks:** run commands from repo root `~/Projects/house-edge`. Commit messages: conventional style, no Co-Authored-By lines.

---

### Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `.gitignore`

- [ ] **Step 1: Scaffold with Vite and install deps**

```bash
cd ~/Projects/house-edge
npm create vite@latest . -- --template vanilla-ts
npm install pixi.js
npm install -D vitest
```

(If `npm create vite` balks at the non-empty directory, answer "Ignore files and continue" — the existing `docs/` and `.git/` must be preserved.)

- [ ] **Step 2: Replace `vite.config.ts` (create it — the vanilla template doesn't include one)**

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/house-edge/',
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 3: Set scripts in `package.json`** — edit the `scripts` block to exactly:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "test": "vitest"
}
```

- [ ] **Step 4: Gut the template.** Delete `src/counter.ts`, `src/typescript.svg`, `public/vite.svg`, `src/style.css`. Replace `index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HOUSE EDGE</title>
    <style>
      html, body { margin: 0; padding: 0; background: #0a0e0a; overflow: hidden; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Replace `src/main.ts` with a placeholder (wired up for real in Task 12):

```ts
console.log('HOUSE EDGE')
```

- [ ] **Step 5: Verify build and test runner work**

Run: `npm run build`
Expected: builds with no errors, `dist/` created.

Run: `npx vitest --run`
Expected: "No test files found" (exit is fine — runner works).

- [ ] **Step 6: Ensure `.gitignore` covers `node_modules` and `dist`** (the Vite template includes both — verify), then commit

```bash
git add -A
git commit -m "chore: scaffold vite + typescript + pixi + vitest"
```

---

### Task 2: GitHub repo + Pages deploy pipeline

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create `.github/workflows/deploy.yml`**

```yaml
name: deploy
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx vitest --run --passWithNoTests
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit, create the public repo, push**

```bash
git add .github
git commit -m "ci: deploy to github pages on push to main"
gh repo create house-edge --public --source=. --push
```

- [ ] **Step 3: Enable Pages with workflow builds**

```bash
gh api -X POST "repos/$(gh api user -q .login)/house-edge/pages" -f build_type=workflow
```

(If this errors saying Pages already exists, that's fine. If it errors otherwise, enable manually: repo Settings → Pages → Source: GitHub Actions, then re-run the failed workflow.)

- [ ] **Step 4: Verify deploy**

Run: `gh run watch --exit-status` (then visit the Pages URL)
Expected: workflow green; `https://<username>.github.io/house-edge/` loads a dark page with "HOUSE EDGE" in the console.

---

### Task 3: Seeded RNG

**Files:**
- Create: `src/sim/rng.ts`
- Test: `src/sim/rng.test.ts`

- [ ] **Step 1: Write the failing test** — `src/sim/rng.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createRng } from './rng'

describe('createRng', () => {
  it('same seed produces identical sequences', () => {
    const a = createRng(12345)
    const b = createRng(12345)
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next())
  })

  it('different seeds produce different sequences', () => {
    const a = createRng(1)
    const b = createRng(2)
    const seqA = Array.from({ length: 10 }, () => a.next())
    const seqB = Array.from({ length: 10 }, () => b.next())
    expect(seqA).not.toEqual(seqB)
  })

  it('next() returns values in [0, 1)', () => {
    const rng = createRng(99)
    for (let i = 0; i < 1000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('int(min, max) is inclusive on both ends and stays in range', () => {
    const rng = createRng(7)
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(1, 6)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
      seen.add(v)
    }
    expect(seen.size).toBe(6)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run src/sim/rng.test.ts`
Expected: FAIL — cannot find module './rng'

- [ ] **Step 3: Implement** — `src/sim/rng.ts` (mulberry32 — tiny, fast, deterministic):

```ts
export interface Rng {
  next(): number
  int(min: number, max: number): number
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run src/sim/rng.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add src/sim/rng.ts src/sim/rng.test.ts
git commit -m "feat: seeded mulberry32 rng"
```

---

### Task 4: The luck resolver

**Files:**
- Create: `src/sim/resolve.ts`
- Test: `src/sim/resolve.test.ts`

This is the heart of the game — every roll (hits, crits, death saves, loot, slot reels) goes through `resolve()`. Modifiers (charms, later) transform the roll context; they are the ONLY sanctioned way to bend rolls.

- [ ] **Step 1: Write the failing tests** — `src/sim/resolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolve, type RollModifier } from './resolve'
import { createRng } from './rng'

function successRate(
  event: Parameters<typeof resolve>[0],
  luck: number,
  houseEdge: number,
  trials = 10_000,
): number {
  const rng = createRng(424242)
  let wins = 0
  for (let i = 0; i < trials; i++) {
    if (resolve(event, luck, houseEdge, rng).success) wins++
  }
  return wins / trials
}

describe('resolve', () => {
  it('returns roll, chance, and success consistent with each other', () => {
    const rng = createRng(1)
    const r = resolve('hit', 10, 0, rng)
    expect(r.event).toBe('hit')
    expect(r.roll).toBeGreaterThanOrEqual(1)
    expect(r.roll).toBeLessThanOrEqual(100)
    expect(r.success).toBe(r.roll <= r.chance)
  })

  it('statistical: base hit chance at luck 0, edge 0 is ~70%', () => {
    const rate = successRate('hit', 0, 0)
    expect(rate).toBeGreaterThan(0.66)
    expect(rate).toBeLessThan(0.74)
  })

  it('more luck means more success; more house edge means less', () => {
    expect(successRate('hit', 40, 0)).toBeGreaterThan(successRate('hit', 0, 0))
    expect(successRate('hit', 0, 20)).toBeLessThan(successRate('hit', 0, 0))
  })

  it('statistical: death save at luck 80, edge 12 lands in the 65-75% band', () => {
    const rate = successRate('deathSave', 80, 12)
    expect(rate).toBeGreaterThan(0.62)
    expect(rate).toBeLessThan(0.78)
  })

  it('chance is clamped to [5, 95] — never impossible, never guaranteed', () => {
    const rng = createRng(3)
    expect(resolve('hit', 1000, 0, rng).chance).toBe(95)
    expect(resolve('hit', 0, 1000, rng).chance).toBe(5)
  })

  it('modifiers transform the chance before the roll', () => {
    const plus20: RollModifier = {
      id: 'test-plus-20',
      apply: (ctx) => ({ ...ctx, chance: ctx.chance + 20 }),
    }
    const rng = createRng(5)
    const base = resolve('crit', 0, 0, createRng(5))
    const boosted = resolve('crit', 0, 0, rng, [plus20])
    expect(boosted.chance).toBe(base.chance + 20)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest --run src/sim/resolve.test.ts`
Expected: FAIL — cannot find module './resolve'

- [ ] **Step 3: Implement** — `src/sim/resolve.ts`:

```ts
import type { Rng } from './rng'

export type RollEvent = 'hit' | 'crit' | 'deathSave' | 'loot' | 'reel'

export interface RollContext {
  event: RollEvent
  chance: number
}

export interface RollModifier {
  id: string
  apply(ctx: RollContext): RollContext
}

export interface RollResult {
  event: RollEvent
  roll: number
  chance: number
  success: boolean
}

// base: chance at luck 0 / edge 0. luckW & edgeW: percentage points per
// point of luck / house edge. Tuned via the statistical tests.
const TABLE: Record<RollEvent, { base: number; luckW: number; edgeW: number }> = {
  hit: { base: 70, luckW: 0.5, edgeW: 1.0 },
  crit: { base: 5, luckW: 0.4, edgeW: 0.2 },
  deathSave: { base: 40, luckW: 0.6, edgeW: 1.5 },
  loot: { base: 25, luckW: 0.6, edgeW: 0.5 },
  reel: { base: 30, luckW: 0.5, edgeW: 0.5 },
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function resolve(
  event: RollEvent,
  luck: number,
  houseEdge: number,
  rng: Rng,
  modifiers: RollModifier[] = [],
): RollResult {
  const spec = TABLE[event]
  let ctx: RollContext = {
    event,
    chance: spec.base + luck * spec.luckW - houseEdge * spec.edgeW,
  }
  for (const m of modifiers) ctx = m.apply(ctx)
  const chance = clamp(Math.round(ctx.chance), 5, 95)
  const roll = rng.int(1, 100)
  return { event, roll, chance, success: roll <= chance }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run src/sim/resolve.test.ts`
Expected: 6 passed. (If a statistical band fails, adjust the `TABLE` weights — not the band — until the spec's intent holds: deathSave at 80/12 ≈ 70%.)

- [ ] **Step 5: Commit**

```bash
git add src/sim/resolve.ts src/sim/resolve.test.ts
git commit -m "feat: luck resolver - one roll function for every random event"
```

---

### Task 5: Sim types, config, and initial state

**Files:**
- Create: `src/sim/types.ts`, `src/sim/config.ts`, `src/sim/state.ts`
- Test: `src/sim/state.test.ts`

- [ ] **Step 1: Create `src/sim/types.ts`**

```ts
import type { RollResult } from './resolve'

export interface Vec2 {
  x: number
  y: number
}

export interface Player {
  pos: Vec2
  hp: number
  maxHp: number
  luck: number
  speed: number
  radius: number
  deathSavesLeft: number
  iframes: number // ticks of invulnerability remaining
  fireCooldown: number // ticks until next shot
}

export interface Enemy {
  id: number
  pos: Vec2
  hp: number
  speed: number
  radius: number
  touchDamage: number
  alive: boolean
}

export interface Projectile {
  id: number
  pos: Vec2
  vel: Vec2
  damage: number
  radius: number
  ttl: number // ticks to live
  alive: boolean
}

// Per-tick events for the render layer (popups, shake). Cleared each tick.
export type SimEvent =
  | { kind: 'roll'; result: RollResult; pos: Vec2 }
  | { kind: 'kill'; pos: Vec2; chips: number }
  | { kind: 'playerHit'; pos: Vec2 }
  | { kind: 'luckySave'; pos: Vec2 }

export interface InputState {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}

export interface SimState {
  tick: number
  player: Player
  enemies: Enemy[]
  projectiles: Projectile[]
  nextId: number
  wave: number
  houseEdge: number
  chips: number
  spawnTimer: number // ticks until next enemy spawn
  events: SimEvent[]
  gameOver: boolean
}
```

- [ ] **Step 2: Create `src/sim/config.ts`** — every tunable in one place (feel fixes = number tweaks, per spec):

```ts
export const CONFIG = {
  arena: { w: 1280, h: 720 },
  tickRate: 60,
  player: {
    hp: 100,
    luck: 10,
    speed: 220, // px/sec
    radius: 14,
    deathSaves: 3,
    iframeTicks: 45,
  },
  weapon: {
    damage: 10,
    cooldownTicks: 30,
    projectileSpeed: 500, // px/sec
    projectileRadius: 5,
    projectileTtl: 120,
    critMultiplier: 3,
  },
  enemy: {
    hp: 20,
    speed: 80, // px/sec
    radius: 12,
    touchDamage: 10,
    spawnIntervalTicks: 90,
  },
  loot: { chipsOnWin: 5, chipsOnLoss: 1 },
  houseEdge: { start: 0 },
} as const
```

- [ ] **Step 3: Write the failing test** — `src/sim/state.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createInitialState } from './state'
import { CONFIG } from './config'

describe('createInitialState', () => {
  it('starts the player centered with config stats and no entities', () => {
    const s = createInitialState()
    expect(s.player.pos).toEqual({ x: CONFIG.arena.w / 2, y: CONFIG.arena.h / 2 })
    expect(s.player.hp).toBe(CONFIG.player.hp)
    expect(s.player.deathSavesLeft).toBe(CONFIG.player.deathSaves)
    expect(s.enemies).toEqual([])
    expect(s.projectiles).toEqual([])
    expect(s.chips).toBe(0)
    expect(s.gameOver).toBe(false)
    expect(s.tick).toBe(0)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest --run src/sim/state.test.ts`
Expected: FAIL — cannot find module './state'

- [ ] **Step 5: Implement** — `src/sim/state.ts`:

```ts
import { CONFIG } from './config'
import type { SimState } from './types'

export function createInitialState(): SimState {
  return {
    tick: 0,
    player: {
      pos: { x: CONFIG.arena.w / 2, y: CONFIG.arena.h / 2 },
      hp: CONFIG.player.hp,
      maxHp: CONFIG.player.hp,
      luck: CONFIG.player.luck,
      speed: CONFIG.player.speed,
      radius: CONFIG.player.radius,
      deathSavesLeft: CONFIG.player.deathSaves,
      iframes: 0,
      fireCooldown: 0,
    },
    enemies: [],
    projectiles: [],
    nextId: 1,
    wave: 1,
    houseEdge: CONFIG.houseEdge.start,
    chips: 0,
    spawnTimer: CONFIG.enemy.spawnIntervalTicks,
    events: [],
    gameOver: false,
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest --run src/sim/state.test.ts`
Expected: 1 passed

- [ ] **Step 7: Commit**

```bash
git add src/sim/types.ts src/sim/config.ts src/sim/state.ts src/sim/state.test.ts
git commit -m "feat: sim types, tunables config, initial state"
```

---

### Task 6: tick() — player movement

**Files:**
- Create: `src/sim/tick.ts`
- Test: `src/sim/tick.test.ts`

`tick(state, input, rng)` mutates `state` in place (object pooling and per-frame allocation discipline come later; mutation is the perf-friendly convention from day one) and advances exactly one 1/60s step.

- [ ] **Step 1: Write the failing tests** — `src/sim/tick.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { tick } from './tick'
import { createInitialState } from './state'
import { createRng } from './rng'
import { CONFIG } from './config'
import type { InputState } from './types'

export const noInput: InputState = { up: false, down: false, left: false, right: false }

describe('tick: player movement', () => {
  it('moves the player right at config speed', () => {
    const s = createInitialState()
    const x0 = s.player.pos.x
    tick(s, { ...noInput, right: true }, createRng(1))
    expect(s.player.pos.x).toBeCloseTo(x0 + CONFIG.player.speed / CONFIG.tickRate)
    expect(s.tick).toBe(1)
  })

  it('normalizes diagonal movement (no speed boost)', () => {
    const s = createInitialState()
    const { x: x0, y: y0 } = s.player.pos
    tick(s, { ...noInput, right: true, down: true }, createRng(1))
    const dx = s.player.pos.x - x0
    const dy = s.player.pos.y - y0
    const dist = Math.hypot(dx, dy)
    expect(dist).toBeCloseTo(CONFIG.player.speed / CONFIG.tickRate)
  })

  it('clamps the player inside the arena', () => {
    const s = createInitialState()
    s.player.pos.x = CONFIG.player.radius + 1
    for (let i = 0; i < 60; i++) tick(s, { ...noInput, left: true }, createRng(1))
    expect(s.player.pos.x).toBe(CONFIG.player.radius)
  })

  it('clears events from the previous tick', () => {
    const s = createInitialState()
    s.events.push({ kind: 'playerHit', pos: { x: 0, y: 0 } })
    tick(s, noInput, createRng(1))
    expect(s.events).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest --run src/sim/tick.test.ts`
Expected: FAIL — cannot find module './tick'

- [ ] **Step 3: Implement** — `src/sim/tick.ts`:

```ts
import { CONFIG } from './config'
import type { Rng } from './rng'
import type { InputState, SimState } from './types'

const DT = 1 / CONFIG.tickRate
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function tick(state: SimState, input: InputState, rng: Rng): SimState {
  if (state.gameOver) return state
  state.events.length = 0
  state.tick++

  movePlayer(state, input)
  return state
}

function movePlayer(state: SimState, input: InputState): void {
  const p = state.player
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0)
  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy)
    dx /= len
    dy /= len
    p.pos.x = clamp(p.pos.x + dx * p.speed * DT, p.radius, CONFIG.arena.w - p.radius)
    p.pos.y = clamp(p.pos.y + dy * p.speed * DT, p.radius, CONFIG.arena.h - p.radius)
  }
}
```

(`rng` is unused this task — it joins in Task 8. The signature is final from the start so call sites never change.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run src/sim/tick.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add src/sim/tick.ts src/sim/tick.test.ts
git commit -m "feat: tick loop with player movement"
```

---

### Task 7: tick() — enemy spawning and chasing

**Files:**
- Modify: `src/sim/tick.ts`
- Test: `src/sim/tick.test.ts` (append)

- [ ] **Step 1: Append failing tests** to `src/sim/tick.test.ts`:

```ts
describe('tick: enemies', () => {
  it('spawns an enemy at the arena edge when the spawn timer elapses', () => {
    const s = createInitialState()
    const rng = createRng(2)
    for (let i = 0; i < CONFIG.enemy.spawnIntervalTicks; i++) tick(s, noInput, rng)
    expect(s.enemies.length).toBe(1)
    const e = s.enemies[0]
    const onEdge =
      e.pos.x === 0 || e.pos.x === CONFIG.arena.w || e.pos.y === 0 || e.pos.y === CONFIG.arena.h
    expect(onEdge).toBe(true)
  })

  it('enemies move toward the player', () => {
    const s = createInitialState()
    s.enemies.push({
      id: 99, pos: { x: 0, y: 0 }, hp: 20, speed: CONFIG.enemy.speed,
      radius: CONFIG.enemy.radius, touchDamage: CONFIG.enemy.touchDamage, alive: true,
    })
    const before = Math.hypot(s.player.pos.x - 0, s.player.pos.y - 0)
    tick(s, noInput, createRng(3))
    const e = s.enemies[0]
    const after = Math.hypot(s.player.pos.x - e.pos.x, s.player.pos.y - e.pos.y)
    expect(after).toBeLessThan(before)
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest --run src/sim/tick.test.ts`
Expected: the two new tests FAIL (no spawning/movement implemented)

- [ ] **Step 3: Implement** — in `src/sim/tick.ts`, add to `tick()` after `movePlayer(state, input)`:

```ts
  spawnEnemies(state, rng)
  moveEnemies(state)
```

and add the functions:

```ts
function spawnEnemies(state: SimState, rng: Rng): void {
  state.spawnTimer--
  if (state.spawnTimer > 0) return
  state.spawnTimer = CONFIG.enemy.spawnIntervalTicks

  // pick a random point on a random arena edge
  const side = rng.int(0, 3)
  const x = side === 0 ? 0 : side === 1 ? CONFIG.arena.w : rng.int(0, CONFIG.arena.w)
  const y = side === 2 ? 0 : side === 3 ? CONFIG.arena.h : rng.int(0, CONFIG.arena.h)

  state.enemies.push({
    id: state.nextId++,
    pos: { x, y },
    hp: CONFIG.enemy.hp,
    speed: CONFIG.enemy.speed,
    radius: CONFIG.enemy.radius,
    touchDamage: CONFIG.enemy.touchDamage,
    alive: true,
  })
}

function moveEnemies(state: SimState): void {
  for (const e of state.enemies) {
    if (!e.alive) continue
    const dx = state.player.pos.x - e.pos.x
    const dy = state.player.pos.y - e.pos.y
    const len = Math.hypot(dx, dy) || 1
    e.pos.x += (dx / len) * e.speed * DT
    e.pos.y += (dy / len) * e.speed * DT
  }
}
```

(Note the edge-pick: sides 0/1 pin x and randomize y, sides 2/3 pin y and randomize x — write it exactly as above so a spawned enemy always satisfies the on-edge assertion: `side === 0 ? 0 : side === 1 ? CONFIG.arena.w : rng.int(...)` for x, `side === 2 ? 0 : side === 3 ? CONFIG.arena.h : rng.int(...)` for y.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run src/sim/tick.test.ts`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add src/sim/tick.ts src/sim/tick.test.ts
git commit -m "feat: enemy spawning at arena edges and chase movement"
```

---

### Task 8: tick() — auto-fire weapon and projectiles

**Files:**
- Modify: `src/sim/tick.ts`
- Test: `src/sim/tick.test.ts` (append)

- [ ] **Step 1: Append failing tests** to `src/sim/tick.test.ts`:

```ts
describe('tick: weapon', () => {
  function withEnemy(dx: number, dy: number) {
    const s = createInitialState()
    s.enemies.push({
      id: 50,
      pos: { x: s.player.pos.x + dx, y: s.player.pos.y + dy },
      hp: 1000, speed: 0, radius: CONFIG.enemy.radius, touchDamage: 0, alive: true,
    })
    return s
  }

  it('fires a projectile toward the nearest enemy when cooldown is ready', () => {
    const s = withEnemy(200, 0)
    tick(s, noInput, createRng(4))
    expect(s.projectiles.length).toBe(1)
    expect(s.projectiles[0].vel.x).toBeGreaterThan(0)
    expect(Math.abs(s.projectiles[0].vel.y)).toBeLessThan(1)
  })

  it('respects the fire cooldown', () => {
    const s = withEnemy(200, 0)
    const rng = createRng(4)
    tick(s, noInput, rng) // fires
    tick(s, noInput, rng) // cooling down
    expect(s.projectiles.length).toBe(1)
    for (let i = 0; i < CONFIG.weapon.cooldownTicks; i++) tick(s, noInput, rng)
    expect(s.projectiles.length).toBe(2)
  })

  it('does not fire with no enemies alive', () => {
    const s = createInitialState()
    tick(s, noInput, createRng(4))
    expect(s.projectiles.length).toBe(0)
  })

  it('projectiles move and expire after ttl', () => {
    const s = withEnemy(10_000, 0) // far away: projectile will never reach it
    s.enemies[0].pos.x = 10_000
    const rng = createRng(4)
    tick(s, noInput, rng)
    const px0 = s.projectiles[0].pos.x
    tick(s, noInput, rng)
    expect(s.projectiles[0].pos.x).toBeGreaterThan(px0)
    for (let i = 0; i < CONFIG.weapon.projectileTtl + 1; i++) tick(s, noInput, rng)
    expect(s.projectiles.length).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest --run src/sim/tick.test.ts`
Expected: new weapon tests FAIL

- [ ] **Step 3: Implement** — in `src/sim/tick.ts`, add to `tick()` after `moveEnemies(state)`:

```ts
  fireWeapon(state)
  moveProjectiles(state)
```

and add the functions:

```ts
function fireWeapon(state: SimState): void {
  const p = state.player
  if (p.fireCooldown > 0) {
    p.fireCooldown--
    return
  }
  let nearest = null as SimState['enemies'][number] | null
  let nearestDist = Infinity
  for (const e of state.enemies) {
    if (!e.alive) continue
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y)
    if (d < nearestDist) {
      nearest = e
      nearestDist = d
    }
  }
  if (!nearest) return

  const dx = (nearest.pos.x - p.pos.x) / nearestDist
  const dy = (nearest.pos.y - p.pos.y) / nearestDist
  state.projectiles.push({
    id: state.nextId++,
    pos: { x: p.pos.x, y: p.pos.y },
    vel: { x: dx * CONFIG.weapon.projectileSpeed, y: dy * CONFIG.weapon.projectileSpeed },
    damage: CONFIG.weapon.damage,
    radius: CONFIG.weapon.projectileRadius,
    ttl: CONFIG.weapon.projectileTtl,
    alive: true,
  })
  p.fireCooldown = CONFIG.weapon.cooldownTicks
}

function moveProjectiles(state: SimState): void {
  for (const pr of state.projectiles) {
    pr.pos.x += pr.vel.x * DT
    pr.pos.y += pr.vel.y * DT
    pr.ttl--
    if (pr.ttl <= 0) pr.alive = false
  }
  state.projectiles = state.projectiles.filter((pr) => pr.alive)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run src/sim/tick.test.ts`
Expected: 10 passed

- [ ] **Step 5: Commit**

```bash
git add src/sim/tick.ts src/sim/tick.test.ts
git commit -m "feat: auto-fire weapon targeting nearest enemy, projectile movement"
```

---

### Task 9: tick() — projectile hits resolve through luck (hit roll, crit roll, loot roll, chips)

**Files:**
- Modify: `src/sim/tick.ts`
- Test: `src/sim/tick.test.ts` (append)

The first place the luck engine touches gameplay: a projectile touching an enemy triggers a **hit roll**. Success → damage (plus a **crit roll** for triple damage). Miss → the projectile whiffs through. Kills trigger a **loot roll**: success = 5 chips, failure = 1 chip. Every roll emits a `roll` event for the render layer.

- [ ] **Step 1: Append failing tests** to `src/sim/tick.test.ts`:

```ts
describe('tick: combat resolution', () => {
  function combatState(luck = 1000) {
    // luck 1000 clamps hit chance to 95 — kills are near-deterministic across seeds;
    // luck -1000 clamps to 5 for the miss case.
    const s = createInitialState()
    s.player.luck = luck
    s.enemies.push({
      id: 60, pos: { x: s.player.pos.x + 30, y: s.player.pos.y }, hp: 10,
      speed: 0, radius: CONFIG.enemy.radius, touchDamage: 0, alive: true,
    })
    s.projectiles.push({
      id: 61, pos: { x: s.player.pos.x + 30, y: s.player.pos.y },
      vel: { x: 0, y: 0 }, damage: 10, radius: CONFIG.weapon.projectileRadius,
      ttl: 100, alive: true,
    })
    return s
  }

  it('successful hit roll damages and can kill; kill emits chips', () => {
    const s = combatState(1000)
    let guard = 0
    while (s.enemies.length > 0 && guard++ < 50) tick(s, noInput, createRng(guard))
    expect(s.enemies.length).toBe(0)
    expect(s.chips).toBeGreaterThanOrEqual(CONFIG.loot.chipsOnLoss)
  })

  it('hit rolls emit roll events for the render layer', () => {
    const s = combatState(1000)
    tick(s, noInput, createRng(8))
    const rollEvents = s.events.filter((e) => e.kind === 'roll')
    expect(rollEvents.length).toBeGreaterThan(0)
  })

  it('a missed hit roll leaves the enemy undamaged', () => {
    const s = combatState(-1000) // hit chance clamps to 5%
    const rng = createRng(11) // first roll with this seed is > 5 (verify; if not, bump seed)
    tick(s, noInput, rng)
    expect(s.enemies[0].hp).toBe(10)
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest --run src/sim/tick.test.ts`
Expected: combat tests FAIL (projectiles never collide yet)

- [ ] **Step 3: Implement** — in `src/sim/tick.ts`:

Add imports at the top:

```ts
import { resolve } from './resolve'
```

Add to `tick()` after `moveProjectiles(state)`:

```ts
  resolveProjectileHits(state, rng)
```

Add the function:

```ts
function resolveProjectileHits(state: SimState, rng: Rng): void {
  const luck = state.player.luck
  for (const pr of state.projectiles) {
    if (!pr.alive) continue
    for (const e of state.enemies) {
      if (!e.alive) continue
      const d = Math.hypot(e.pos.x - pr.pos.x, e.pos.y - pr.pos.y)
      if (d > e.radius + pr.radius) continue

      pr.alive = false
      const hit = resolve('hit', luck, state.houseEdge, rng)
      state.events.push({ kind: 'roll', result: hit, pos: { ...e.pos } })
      if (!hit.success) break // whiffed — projectile spent, enemy untouched

      let damage = pr.damage
      const crit = resolve('crit', luck, state.houseEdge, rng)
      if (crit.success) {
        damage *= CONFIG.weapon.critMultiplier
        state.events.push({ kind: 'roll', result: crit, pos: { ...e.pos } })
      }
      e.hp -= damage

      if (e.hp <= 0) {
        e.alive = false
        const loot = resolve('loot', luck, state.houseEdge, rng)
        const chips = loot.success ? CONFIG.loot.chipsOnWin : CONFIG.loot.chipsOnLoss
        state.chips += chips
        state.events.push({ kind: 'roll', result: loot, pos: { ...e.pos } })
        state.events.push({ kind: 'kill', pos: { ...e.pos }, chips })
      }
      break
    }
  }
  state.projectiles = state.projectiles.filter((pr) => pr.alive)
  state.enemies = state.enemies.filter((e) => e.alive)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run src/sim/tick.test.ts`
Expected: 13 passed. (The miss-case test depends on the seed's first roll being > 5 — if seed 11 happens to roll ≤ 5, bump the seed in the test and note it in a comment.)

- [ ] **Step 5: Commit**

```bash
git add src/sim/tick.ts src/sim/tick.test.ts
git commit -m "feat: projectile hits resolve through luck engine - hit/crit/loot rolls"
```

---

### Task 10: tick() — enemy contact damage and death saves

**Files:**
- Modify: `src/sim/tick.ts`
- Test: `src/sim/tick.test.ts` (append)

Enemy touches player → damage + iframes. If damage would be fatal: **death save roll**. Success → survive at 1 HP, lose a death save, emit `luckySave`. Failure (or no saves left) → `gameOver`.

- [ ] **Step 1: Append failing tests** to `src/sim/tick.test.ts`:

```ts
describe('tick: contact damage and death saves', () => {
  function touchingEnemyState(playerHp: number, luck = 0) {
    const s = createInitialState()
    s.player.hp = playerHp
    s.player.luck = luck
    s.enemies.push({
      id: 70, pos: { x: s.player.pos.x, y: s.player.pos.y }, hp: 1000,
      speed: 0, radius: CONFIG.enemy.radius,
      touchDamage: CONFIG.enemy.touchDamage, alive: true,
    })
    return s
  }

  it('touching enemy damages the player and grants iframes', () => {
    const s = touchingEnemyState(100)
    tick(s, noInput, createRng(20))
    expect(s.player.hp).toBe(100 - CONFIG.enemy.touchDamage)
    expect(s.player.iframes).toBe(CONFIG.player.iframeTicks)
  })

  it('iframes prevent repeat damage', () => {
    const s = touchingEnemyState(100)
    const rng = createRng(20)
    tick(s, noInput, rng)
    tick(s, noInput, rng)
    expect(s.player.hp).toBe(100 - CONFIG.enemy.touchDamage)
  })

  it('fatal damage with luck 1000 (95% save) survives at 1 hp and spends a death save', () => {
    const s = touchingEnemyState(5, 1000)
    tick(s, noInput, createRng(21)) // 95% save chance — if this seed rolls 96+, bump it
    expect(s.gameOver).toBe(false)
    expect(s.player.hp).toBe(1)
    expect(s.player.deathSavesLeft).toBe(CONFIG.player.deathSaves - 1)
    expect(s.events.some((e) => e.kind === 'luckySave')).toBe(true)
  })

  it('fatal damage with no death saves left is game over', () => {
    const s = touchingEnemyState(5, 1000)
    s.player.deathSavesLeft = 0
    tick(s, noInput, createRng(21))
    expect(s.gameOver).toBe(true)
  })

  it('gameOver freezes the sim', () => {
    const s = touchingEnemyState(5, 1000)
    s.player.deathSavesLeft = 0
    const rng = createRng(21)
    tick(s, noInput, rng)
    const t = s.tick
    tick(s, noInput, rng)
    expect(s.tick).toBe(t)
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest --run src/sim/tick.test.ts`
Expected: new tests FAIL

- [ ] **Step 3: Implement** — in `src/sim/tick.ts`, add to `tick()` after `resolveProjectileHits(state, rng)`:

```ts
  resolveContactDamage(state, rng)
```

Add the function:

```ts
function resolveContactDamage(state: SimState, rng: Rng): void {
  const p = state.player
  if (p.iframes > 0) {
    p.iframes--
    return
  }
  for (const e of state.enemies) {
    if (!e.alive) continue
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y)
    if (d > e.radius + p.radius) continue

    state.events.push({ kind: 'playerHit', pos: { ...p.pos } })

    if (p.hp - e.touchDamage <= 0) {
      // death save: the most dramatic roll in the game
      if (p.deathSavesLeft > 0) {
        const save = resolve('deathSave', p.luck, state.houseEdge, rng)
        state.events.push({ kind: 'roll', result: save, pos: { ...p.pos } })
        if (save.success) {
          p.hp = 1
          p.deathSavesLeft--
          p.iframes = CONFIG.player.iframeTicks
          state.events.push({ kind: 'luckySave', pos: { ...p.pos } })
          return
        }
      }
      p.hp = 0
      state.gameOver = true
      return
    }

    p.hp -= e.touchDamage
    p.iframes = CONFIG.player.iframeTicks
    return // one contact hit per tick is plenty
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run src/sim/tick.test.ts`
Expected: 18 passed

- [ ] **Step 5: Commit**

```bash
git add src/sim/tick.ts src/sim/tick.test.ts
git commit -m "feat: contact damage, iframes, death saves through luck engine"
```

---

### Task 11: Determinism test

**Files:**
- Test: `src/sim/determinism.test.ts`

- [ ] **Step 1: Write the test** — `src/sim/determinism.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { tick } from './tick'
import { createInitialState } from './state'
import { createRng } from './rng'
import type { InputState } from './types'

describe('determinism', () => {
  it('same seed + same inputs = identical state after 1000 ticks', () => {
    const run = () => {
      const s = createInitialState()
      const rng = createRng(777)
      const inputRng = createRng(888) // scripted pseudo-random inputs
      for (let i = 0; i < 1000; i++) {
        const input: InputState = {
          up: inputRng.next() < 0.3,
          down: inputRng.next() < 0.3,
          left: inputRng.next() < 0.3,
          right: inputRng.next() < 0.3,
        }
        tick(s, input, rng)
      }
      return s
    }
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
  })
})
```

- [ ] **Step 2: Run it**

Run: `npx vitest --run src/sim/determinism.test.ts`
Expected: 1 passed. If it fails, something in the sim is drawing entropy outside the seeded RNG (e.g. `Math.random`, `Date.now`, iteration-order dependence) — that's a real bug; find it before proceeding.

- [ ] **Step 3: Run the full suite**

Run: `npx vitest --run`
Expected: all tests pass (19 total).

- [ ] **Step 4: Commit**

```bash
git add src/sim/determinism.test.ts
git commit -m "test: full-sim determinism under seeded rng"
```

---

### Task 12: Render layer — PixiJS draws the sim

**Files:**
- Create: `src/render/renderer.ts`
- Modify: `src/main.ts`

No tests for render (visual layer — verified by eye); keep ALL game logic out of it.

- [ ] **Step 1: Create `src/render/renderer.ts`**

```ts
import { Application, Container, Graphics, Text } from 'pixi.js'
import { CONFIG } from '../sim/config'
import type { SimState } from '../sim/types'

// Neon-on-felt palette (spec: procedural casino look)
const COLORS = {
  felt: 0x0d2818,
  feltLine: 0x1a4a2e,
  player: 0xffd700, // gold chip
  enemy: 0xe43d5a, // hostile red
  projectile: 0x7df9ff, // electric blue card glint
  hud: 0xf4e9c9,
}

export class Renderer {
  readonly app: Application
  private world = new Container()
  private playerG = new Graphics()
  private enemiesG = new Graphics()
  private projectilesG = new Graphics()
  private hud!: Text
  private popups: { text: Text; ttl: number }[] = []

  constructor() {
    this.app = new Application()
  }

  async init(): Promise<void> {
    await this.app.init({
      width: CONFIG.arena.w,
      height: CONFIG.arena.h,
      background: COLORS.felt,
      antialias: true,
    })
    document.body.appendChild(this.app.canvas)

    // felt table border
    const border = new Graphics()
      .rect(4, 4, CONFIG.arena.w - 8, CONFIG.arena.h - 8)
      .stroke({ width: 3, color: COLORS.feltLine })
    this.world.addChild(border, this.enemiesG, this.projectilesG, this.playerG)
    this.app.stage.addChild(this.world)

    this.hud = new Text({
      text: '',
      style: { fill: COLORS.hud, fontFamily: 'monospace', fontSize: 18 },
    })
    this.hud.position.set(12, 8)
    this.app.stage.addChild(this.hud)
  }

  draw(state: SimState): void {
    const p = state.player
    this.playerG
      .clear()
      .circle(p.pos.x, p.pos.y, p.radius)
      .fill(COLORS.player)
    if (p.iframes > 0) this.playerG.alpha = 0.5
    else this.playerG.alpha = 1

    this.enemiesG.clear()
    for (const e of state.enemies) {
      this.enemiesG.circle(e.pos.x, e.pos.y, e.radius).fill(COLORS.enemy)
    }

    this.projectilesG.clear()
    for (const pr of state.projectiles) {
      this.projectilesG.circle(pr.pos.x, pr.pos.y, pr.radius).fill(COLORS.projectile)
    }

    this.hud.text =
      `HP ${p.hp}/${p.maxHp}   LUCK ${p.luck}   CHIPS ${state.chips}   ` +
      `SAVES ${p.deathSavesLeft}   WAVE ${state.wave}` +
      (state.gameOver ? '   — BUSTED. refresh to re-buy —' : '')

    this.drawPopups(state)
  }

  private drawPopups(state: SimState): void {
    for (const ev of state.events) {
      if (ev.kind === 'roll') {
        const r = ev.result
        const label =
          r.event === 'deathSave'
            ? r.success ? 'LUCKY!' : 'BUST'
            : `${r.roll}/${r.chance}${r.success ? '' : ' miss'}`
        this.addPopup(label, ev.pos.x, ev.pos.y, r.success ? 0x9fff8a : 0xff6b6b,
          r.event === 'deathSave' ? 32 : 14)
      } else if (ev.kind === 'kill') {
        this.addPopup(`+${ev.chips}`, ev.pos.x, ev.pos.y - 16, 0xffd700, 16)
      }
    }
    for (const pop of this.popups) {
      pop.ttl--
      pop.text.y -= 0.6
      pop.text.alpha = pop.ttl / 60
      if (pop.ttl <= 0) pop.text.destroy()
    }
    this.popups = this.popups.filter((p) => p.ttl > 0)
  }

  private addPopup(label: string, x: number, y: number, color: number, size: number): void {
    const text = new Text({
      text: label,
      style: { fill: color, fontFamily: 'monospace', fontSize: size, fontWeight: 'bold' },
    })
    text.position.set(x, y)
    text.anchor.set(0.5)
    this.app.stage.addChild(text)
    this.popups.push({ text, ttl: 60 })
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/render/renderer.ts
git commit -m "feat: pixi renderer - felt arena, entities, hud, roll popups"
```

---

### Task 13: Input + fixed-timestep game loop

**Files:**
- Create: `src/input.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create `src/input.ts`**

```ts
import type { InputState } from './sim/types'

const KEYMAP: Record<string, keyof InputState> = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
}

export function createInput(): InputState {
  const input: InputState = { up: false, down: false, left: false, right: false }
  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code]
    if (k) { input[k] = true; e.preventDefault() }
  })
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code]
    if (k) input[k] = false
  })
  return input
}
```

- [ ] **Step 2: Replace `src/main.ts`** — fixed 60Hz sim steps decoupled from render frames; seed from URL (`?seed=123`) for shareable runs:

```ts
import { createRng } from './sim/rng'
import { createInitialState } from './sim/state'
import { tick } from './sim/tick'
import { CONFIG } from './sim/config'
import { createInput } from './input'
import { Renderer } from './render/renderer'

async function main() {
  const params = new URLSearchParams(location.search)
  const seed = Number(params.get('seed')) || (Date.now() >>> 0)
  const rng = createRng(seed)
  const state = createInitialState()
  const input = createInput()

  const renderer = new Renderer()
  await renderer.init()
  console.log(`HOUSE EDGE — seed ${seed} (share with ?seed=${seed})`)

  const TICK_MS = 1000 / CONFIG.tickRate
  let acc = 0
  let last = performance.now()

  renderer.app.ticker.add(() => {
    const now = performance.now()
    acc += Math.min(now - last, 250) // clamp huge tab-switch deltas
    last = now
    while (acc >= TICK_MS) {
      tick(state, input, rng)
      acc -= TICK_MS
    }
    renderer.draw(state)
  })
}

main()
```

- [ ] **Step 3: Play it**

Run: `npm run dev` and open the URL.
Expected: gold chip moves with WASD/arrows, red enemies stream in from edges and chase, blue projectiles auto-fire at the nearest enemy, roll popups float up (`74/85`, `miss`, `+5`), HP drops on contact, a fatal hit triggers LUCKY! or BUSTED, HUD tracks everything. Confirm ~60fps in devtools performance tab.

- [ ] **Step 4: Full check and commit**

Run: `npx vitest --run && npx tsc --noEmit && npm run build`
Expected: all green.

```bash
git add src/input.ts src/main.ts
git commit -m "feat: input handling and fixed-timestep game loop - playable"
```

---

### Task 14: Ship Milestone 1

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# HOUSE EDGE 🎰

An action roguelike where **luck is the core mechanic** — every hit, every
death save, every drop is a visible roll of your LUCK stat against the
rising HOUSE EDGE.

**Play it:** https://<username>.github.io/house-edge/

(Replace `<username>` with the actual GitHub username before committing.)

## Status

Milestone 1 — playable core: movement, enemies, auto-fire, luck-resolved
combat, death saves. Waves, the slot machine, charms, and hot streaks are
in progress. Design spec: `docs/superpowers/specs/2026-06-10-house-edge-design.md`.

## Tech

- TypeScript + PixiJS, zero servers, zero APIs — runs entirely in your browser
- Deterministic simulation: all randomness flows from one seeded RNG through
  one luck resolver. Same seed = same run (`?seed=123`)
- Balance is enforced by statistical tests over thousands of seeded trials

## Dev

npm install && npm run dev — play locally
npx vitest --run — run the sim test suite
```

- [ ] **Step 2: Push and verify the deployed game**

```bash
git add README.md
git commit -m "docs: readme"
git push
gh run watch --exit-status
```

Then open `https://<username>.github.io/house-edge/` and play one run to death or LUCKY-save.
Expected: the deployed game matches local dev.

- [ ] **Step 3: Tag it**

```bash
git tag milestone-1
git push --tags
```

---

## Self-review notes (already applied)

- **Spec coverage for this milestone:** sim/render split ✓, one resolver + seeded RNG ✓, visible rolls ✓, death saves with limited uses ✓, deploy-from-day-1 ✓, statistical balance test (deathSave 80/12 band) ✓, determinism test ✓, tunables centralized in config ✓. Deferred to M2+: waves/houseEdge growth (state fields exist, growth logic in M2), chips spending, slot machine, charms (RollModifier interface ready), hot streak, ZzFX, bosses.
- **Seed-dependent tests** (Task 9 miss case, Task 10 death save): statistical clamps (5%/95%) make failure unlikely but possible — each test notes "bump the seed" as the sanctioned fix.
- **Type consistency:** `resolve(event, luck, houseEdge, rng, modifiers?)`, `tick(state, input, rng)`, `RollResult {event, roll, chance, success}` used identically across Tasks 4–13.
