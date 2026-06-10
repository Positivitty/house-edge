# HOUSE EDGE — Milestone 2: The Floor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed arena with a big explorable casino floor where gambling at slot machines builds luck and keeps guards away, stopping summons them (HEAT), machines run cold to force traversal, jackpots deal upgrade drafts, and hitting the luck target triggers the break-the-bank alarm finale.

**Architecture:** The sim gains machines, HEAT, a 'draft' phase, and time-scaled guard pressure; the world grows to 3200×2400 with the renderer gaining a camera. Gambling is detected per tick (near a warm machine + chips); spins are timer-driven and roll 'reel' through the one resolver. Draft commands (`applyDraftCommand`) are applied between ticks so the tick signature never changes and determinism extends to draft picks. Weapon stats move onto the player so upgrades can mutate them.

**Tech Stack:** unchanged — Vite, TypeScript strict, PixiJS v8, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-house-edge-design.md` (v2 — read "Core loop — The Floor", "HEAT", "Slot machines")

**Conventions for all tasks:** repo root `~/Projects/house-edge`; strict TDD for sim code; ALL randomness through the passed `Rng` (never Math.random/Date.now in src/sim); commits get NO Co-Authored-By lines; do not push until the final task. Test counts are given as "+N new"; always finish a task with the FULL suite green (`npx vitest --run`) and `npx tsc --noEmit` clean.

**File map:** `src/content/upgrades.ts` + `src/sim/draft.ts` (new), `src/sim/{types,config,state,tick}.ts` (modified), `src/render/renderer.ts` + `src/main.ts` (modified in the last tasks).

---

### Task 1: Move weapon stats onto the player (upgrade-ready refactor)

**Files:**
- Modify: `src/sim/types.ts` (Player), `src/sim/state.ts`, `src/sim/tick.ts`
- Test: `src/sim/state.test.ts` (append)

- [ ] **Step 1: Append failing test** to `src/sim/state.test.ts` inside the existing describe:

```ts
  it('initializes player weapon stats from config', () => {
    const s = createInitialState()
    expect(s.player.weapon).toEqual({
      damage: CONFIG.weapon.damage,
      cooldownTicks: CONFIG.weapon.cooldownTicks,
      critMultiplier: CONFIG.weapon.critMultiplier,
    })
  })
```

- [ ] **Step 2:** Run `npx vitest --run src/sim/state.test.ts` — new test FAILS (no weapon field).

- [ ] **Step 3: Implement.** In `src/sim/types.ts`, add to `Player`:

```ts
  weapon: {
    damage: number
    cooldownTicks: number
    critMultiplier: number
  }
```

In `src/sim/state.ts`, add to the player object in `createInitialState()`:

```ts
      weapon: {
        damage: CONFIG.weapon.damage,
        cooldownTicks: CONFIG.weapon.cooldownTicks,
        critMultiplier: CONFIG.weapon.critMultiplier,
      },
```

In `src/sim/tick.ts`: in `fireWeapon`, replace `damage: CONFIG.weapon.damage` with `damage: p.weapon.damage` and `p.fireCooldown = CONFIG.weapon.cooldownTicks` with `p.fireCooldown = p.weapon.cooldownTicks`. In `resolveProjectileHits`, replace `damage *= CONFIG.weapon.critMultiplier` with `damage *= state.player.weapon.critMultiplier`.

(`CONFIG.weapon.projectileSpeed/Radius/Ttl` stay in CONFIG — nothing upgrades them yet. YAGNI.)

- [ ] **Step 4:** Full suite green (+1 new test; defaults match so nothing else moves) and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/sim/types.ts src/sim/state.ts src/sim/tick.ts src/sim/state.test.ts
git commit -m "refactor: weapon stats live on player state so upgrades can mutate them"
```

---

### Task 2: World, machines, HEAT state — types, config, initial state

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/config.ts`, `src/sim/state.ts`, `src/sim/tick.ts` (clamp bounds), `src/render/renderer.ts` (compile-only touch-ups), `src/sim/state.test.ts`

- [ ] **Step 1: Extend `src/sim/types.ts`.** Add:

```ts
export type Phase = 'combat' | 'draft'

export type Rarity = 'common' | 'rare' | 'jackpot'

export interface ReelSlot {
  upgradeId: string
  rarity: Rarity
}

export interface DraftState {
  reels: ReelSlot[]
  rerollCost: number
  version: number // bumped on every reroll so the renderer knows to rebuild
}

export type DraftCommand = { type: 'pick' | 'reroll'; reel: number }

export interface Machine {
  id: number
  pos: Vec2
  spinsLeft: number // 0 = run cold, permanently
}
```

Add to the `SimEvent` union:

```ts
  | { kind: 'spin'; result: RollResult; luckGained: number; pos: Vec2 }
  | { kind: 'jackpot'; pos: Vec2 }
  | { kind: 'alarm' }
  | { kind: 'victory' }
```

In `SimState`: REMOVE the `wave` field, and add:

```ts
  phase: Phase
  draft: DraftState | null
  machines: Machine[]
  heat: number // 0..100
  spinTimer: number // ticks until next slot spin while gambling
  gamblingMachineId: number | null
  alarm: boolean
  alarmTicksLeft: number
  victory: boolean
```

- [ ] **Step 2: Rework `src/sim/config.ts`.** Rename `arena` → `screen` and add the new blocks (full CONFIG for clarity — replace the file's CONFIG with this, keeping `as const`):

```ts
export const CONFIG = {
  screen: { w: 1280, h: 720 }, // viewport; the camera follows the player
  world: { w: 3200, h: 2400 }, // the casino floor
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
  },
  guards: {
    ringRadius: 760, // spawn just outside the 1280x720 view
    hpPerMinute: 0.25, // hp multiplier grows +25%/min
    speedPerMinute: 0.04,
    speedCap: 1.9,
    touchPerMinute: 1.2, // +1.2 touch damage per minute (floored)
  },
  heat: {
    risePerTick: 0.04, // ~42s from 0 to 100 while not gambling
    drainPerTick: 0.2, // 5x faster drain while gambling
    spawnThreshold: 10, // below this: no spawns (grace period)
    minSpawnIntervalTicks: 25, // at heat 100
    maxSpawnIntervalTicks: 170, // at the threshold
  },
  machines: {
    count: 12,
    radius: 26, // visual size
    interactRadius: 70, // stand this close to gamble
    spinsPerMachine: 10, // then it runs cold, permanently
    spinIntervalTicks: 45, // a spin every 0.75s while gambling
    spinCost: 3, // chips per spin
    luckOnWin: 3,
    luckOnLoss: 1, // even losing teaches you the machine
    jackpotLuck: 8, // bonus on jackpot (plus an upgrade draft)
  },
  draft: { rerollCost: 5 },
  win: { luckTarget: 100, alarmTicks: 2700 }, // survive 45s of alarm to beat the house
  loot: { chipsOnWin: 5, chipsOnLoss: 1 },
  houseEdge: { start: 0, perMinute: 3 },
} as const
```

(`enemy.spawnIntervalTicks` is gone — guard spawning is heat-driven now.)

- [ ] **Step 3: Rework `src/sim/state.ts`:**

```ts
import { CONFIG } from './config'
import { createRng } from './rng'
import type { Rng } from './rng'
import type { Machine, SimState } from './types'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Deterministic seeded layout: machine 1 guaranteed near spawn, the rest
// jittered across a grid so every run reads differently but reproducibly.
function layoutMachines(rng: Rng): Machine[] {
  const spins = CONFIG.machines.spinsPerMachine
  const ms: Machine[] = [
    { id: 1, pos: { x: CONFIG.world.w / 2 + 260, y: CONFIG.world.h / 2 }, spinsLeft: spins },
  ]
  const cols = 4
  const rows = 3
  let id = 2
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      if (ms.length >= CONFIG.machines.count) break
      const x = ((cx + 0.5) / cols) * CONFIG.world.w + rng.int(-220, 220)
      const y = ((cy + 0.5) / rows) * CONFIG.world.h + rng.int(-220, 220)
      ms.push({
        id: id++,
        pos: { x: clamp(x, 100, CONFIG.world.w - 100), y: clamp(y, 100, CONFIG.world.h - 100) },
        spinsLeft: spins,
      })
    }
  }
  return ms
}

export function createInitialState(rng: Rng = createRng(1)): SimState {
  return {
    tick: 0,
    player: {
      pos: { x: CONFIG.world.w / 2, y: CONFIG.world.h / 2 },
      hp: CONFIG.player.hp,
      maxHp: CONFIG.player.hp,
      luck: CONFIG.player.luck,
      speed: CONFIG.player.speed,
      radius: CONFIG.player.radius,
      deathSavesLeft: CONFIG.player.deathSaves,
      iframes: 0,
      fireCooldown: 0,
      weapon: {
        damage: CONFIG.weapon.damage,
        cooldownTicks: CONFIG.weapon.cooldownTicks,
        critMultiplier: CONFIG.weapon.critMultiplier,
      },
    },
    enemies: [],
    projectiles: [],
    nextId: 1,
    houseEdge: CONFIG.houseEdge.start,
    chips: 30, // seed money — enough for ten spins at the first machine
    spawnTimer: CONFIG.heat.maxSpawnIntervalTicks,
    events: [],
    gameOver: false,
    phase: 'combat',
    draft: null,
    machines: layoutMachines(rng),
    heat: 0,
    spinTimer: CONFIG.machines.spinIntervalTicks,
    gamblingMachineId: null,
    alarm: false,
    alarmTicksLeft: 0,
    victory: false,
  }
}
```

Note `chips: 30` (was 0): the run must be able to START gambling. Note `wave` and the old `spawnTimer: CONFIG.enemy.spawnIntervalTicks` are gone.

- [ ] **Step 4: Compile fixes.** In `src/sim/tick.ts`: `movePlayer` clamps change from `CONFIG.arena.*` to `CONFIG.world.*`; `spawnEnemies` still references `CONFIG.arena` and `CONFIG.enemy.spawnIntervalTicks` — change BOTH to `CONFIG.world` / `CONFIG.heat.maxSpawnIntervalTicks` for now (Task 6 replaces this function wholesale; this keeps the build green). In `src/render/renderer.ts`: replace every `CONFIG.arena` with `CONFIG.screen`, and in the HUD string replace `WAVE ${state.wave}` with `HEAT ${Math.round(state.heat)}`.

- [ ] **Step 5: Update tests.** In `src/sim/state.test.ts`, the centered-player assertion changes to `{ x: CONFIG.world.w / 2, y: CONFIG.world.h / 2 }` and the chips assertion to `expect(s.chips).toBe(30)`. Append:

```ts
  it('lays out machines deterministically with one near spawn', () => {
    const a = createInitialState()
    const b = createInitialState()
    expect(a.machines).toEqual(b.machines)
    expect(a.machines.length).toBe(CONFIG.machines.count)
    const first = a.machines[0]
    const d = Math.hypot(first.pos.x - a.player.pos.x, first.pos.y - a.player.pos.y)
    expect(d).toBeLessThan(300)
    expect(d).toBeGreaterThan(CONFIG.machines.interactRadius) // must walk to it
    expect(a.phase).toBe('combat')
    expect(a.heat).toBe(0)
    expect(a.victory).toBe(false)
  })
```

In `src/sim/tick.test.ts`, the old edge-spawn test ("spawns an enemy at the arena edge when the spawn timer elapses") is now meaningless — DELETE that single test (Task 6 adds the ring-spawn replacement). Everything else stands.

- [ ] **Step 6:** Full suite green (+1 net new) and `npx tsc --noEmit` and `npm run build`.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "feat: the floor - world bounds, seeded machine layout, heat/draft/alarm state"
```

---

### Task 3: The upgrade pool — `src/content/upgrades.ts`

**Files:**
- Create: `src/content/upgrades.ts`
- Test: `src/content/upgrades.test.ts`

- [ ] **Step 1: Write failing tests** — `src/content/upgrades.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { UPGRADES, upgradeById } from './upgrades'
import { createInitialState } from '../sim/state'

describe('upgrade pool', () => {
  it('has unique ids and at least 3 upgrades per rarity', () => {
    const ids = UPGRADES.map((u) => u.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const r of ['common', 'rare', 'jackpot'] as const) {
      expect(UPGRADES.filter((u) => u.rarity === r).length).toBeGreaterThanOrEqual(3)
    }
  })

  it('every upgrade mutates state when applied', () => {
    for (const u of UPGRADES) {
      const s = createInitialState()
      const before = JSON.stringify(s)
      u.apply(s)
      expect(JSON.stringify(s), `${u.id} must change state`).not.toBe(before)
    }
  })

  it('lucky-penny adds 5 luck; extra-life adds a death save and full-heals', () => {
    const s = createInitialState()
    s.player.hp = 1
    upgradeById('lucky-penny').apply(s)
    expect(s.player.luck).toBe(15)
    upgradeById('extra-life').apply(s)
    expect(s.player.deathSavesLeft).toBe(4)
    expect(s.player.hp).toBe(s.player.maxHp)
  })

  it('hair-trigger never drops cooldown below 6 ticks', () => {
    const s = createInitialState()
    for (let i = 0; i < 10; i++) upgradeById('hair-trigger').apply(s)
    expect(s.player.weapon.cooldownTicks).toBeGreaterThanOrEqual(6)
  })
})
```

- [ ] **Step 2:** Run — FAILS (no module).

- [ ] **Step 3: Implement** — `src/content/upgrades.ts`:

```ts
import type { Rarity, SimState } from '../sim/types'

export interface Upgrade {
  id: string
  name: string
  rarity: Rarity
  desc: string
  apply(state: SimState): void
}

export const UPGRADES: Upgrade[] = [
  // common
  { id: 'lucky-penny', name: 'Lucky Penny', rarity: 'common', desc: '+5 LUCK',
    apply: (s) => { s.player.luck += 5 } },
  { id: 'swift-loafers', name: 'Swift Loafers', rarity: 'common', desc: '+10% speed',
    apply: (s) => { s.player.speed = Math.round(s.player.speed * 1.1) } },
  { id: 'house-snack', name: 'House Snack', rarity: 'common', desc: '+15 max HP, heal 15',
    apply: (s) => { s.player.maxHp += 15; s.player.hp = Math.min(s.player.hp + 15, s.player.maxHp) } },
  { id: 'sharper-cards', name: 'Sharper Cards', rarity: 'common', desc: '+3 damage',
    apply: (s) => { s.player.weapon.damage += 3 } },
  // rare
  { id: 'rabbits-foot', name: "Rabbit's Foot", rarity: 'rare', desc: '+12 LUCK',
    apply: (s) => { s.player.luck += 12 } },
  { id: 'hair-trigger', name: 'Hair Trigger', rarity: 'rare', desc: 'fire 8 ticks faster',
    apply: (s) => { s.player.weapon.cooldownTicks = Math.max(s.player.weapon.cooldownTicks - 8, 6) } },
  { id: 'heavy-chips', name: 'Heavy Chips', rarity: 'rare', desc: '+8 damage',
    apply: (s) => { s.player.weapon.damage += 8 } },
  // jackpot
  { id: 'horseshoe', name: 'Horseshoe', rarity: 'jackpot', desc: '+25 LUCK',
    apply: (s) => { s.player.luck += 25 } },
  { id: 'extra-life', name: 'Extra Life', rarity: 'jackpot', desc: '+1 death save, full heal',
    apply: (s) => { s.player.deathSavesLeft += 1; s.player.hp = s.player.maxHp } },
  { id: 'golden-gun', name: 'Golden Gun', rarity: 'jackpot', desc: '+2x crit, +5 damage',
    apply: (s) => { s.player.weapon.critMultiplier += 2; s.player.weapon.damage += 5 } },
]

export function upgradeById(id: string): Upgrade {
  const u = UPGRADES.find((u) => u.id === id)
  if (!u) throw new Error(`unknown upgrade: ${id}`)
  return u
}
```

- [ ] **Step 4:** Full suite green (+4 new) and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/content/upgrades.ts src/content/upgrades.test.ts
git commit -m "feat: upgrade pool - 10 upgrades across three rarities"
```

---

### Task 4: The draft — `src/sim/draft.ts`

**Files:**
- Create: `src/sim/draft.ts`
- Test: `src/sim/draft.test.ts`

Rarity mechanic: one 'reel' roll → success = rare-or-better; a second roll → success = jackpot. Reels show their results in the draft UI (that's the roll visibility), so no popup events here.

- [ ] **Step 1: Write failing tests** — `src/sim/draft.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { openDraft, applyDraftCommand } from './draft'
import { createInitialState } from './state'
import { createRng } from './rng'
import { CONFIG } from './config'
import { UPGRADES } from '../content/upgrades'

describe('openDraft', () => {
  it('enters draft phase with 3 reels of valid upgrades', () => {
    const s = createInitialState()
    openDraft(s, createRng(42))
    expect(s.phase).toBe('draft')
    expect(s.draft).not.toBeNull()
    expect(s.draft!.reels.length).toBe(3)
    for (const reel of s.draft!.reels) {
      const up = UPGRADES.find((u) => u.id === reel.upgradeId)
      expect(up).toBeDefined()
      expect(up!.rarity).toBe(reel.rarity)
    }
    expect(s.draft!.version).toBe(0)
  })

  it('statistical: luck tilts reels toward jackpot', () => {
    const count = (luck: number) => {
      let jackpots = 0
      const rng = createRng(777)
      for (let i = 0; i < 1000; i++) {
        const s = createInitialState()
        s.player.luck = luck
        openDraft(s, rng)
        jackpots += s.draft!.reels.filter((r) => r.rarity === 'jackpot').length
      }
      return jackpots
    }
    expect(count(1000)).toBeGreaterThan(count(0) * 3)
  })
})

describe('applyDraftCommand', () => {
  function draftState(chips = 100) {
    const s = createInitialState()
    s.chips = chips
    openDraft(s, createRng(42))
    return s
  }

  it('pick applies the upgrade and returns to combat', () => {
    const s = draftState()
    const luckBefore = s.player.luck
    s.draft!.reels[1] = { upgradeId: 'lucky-penny', rarity: 'common' }
    applyDraftCommand(s, { type: 'pick', reel: 1 }, createRng(1))
    expect(s.player.luck).toBe(luckBefore + 5)
    expect(s.phase).toBe('combat')
    expect(s.draft).toBeNull()
  })

  it('reroll respins one reel, charges chips, bumps version', () => {
    const s = draftState(100)
    applyDraftCommand(s, { type: 'reroll', reel: 0 }, createRng(9))
    expect(s.chips).toBe(100 - CONFIG.draft.rerollCost)
    expect(s.draft!.version).toBe(1)
    expect(s.phase).toBe('draft')
  })

  it('reroll with insufficient chips is a no-op', () => {
    const s = draftState(CONFIG.draft.rerollCost - 1)
    const before = JSON.stringify(s.draft)
    applyDraftCommand(s, { type: 'reroll', reel: 0 }, createRng(9))
    expect(JSON.stringify(s.draft)).toBe(before)
  })

  it('commands outside draft phase or with bad reel index are no-ops', () => {
    const s = createInitialState()
    applyDraftCommand(s, { type: 'pick', reel: 0 }, createRng(1))
    expect(s.phase).toBe('combat')
    const s2 = draftState()
    applyDraftCommand(s2, { type: 'pick', reel: 7 }, createRng(1))
    expect(s2.phase).toBe('draft')
  })
})
```

- [ ] **Step 2:** Run — FAILS (no module).

- [ ] **Step 3: Implement** — `src/sim/draft.ts`:

```ts
import { CONFIG } from './config'
import { resolve } from './resolve'
import { UPGRADES, upgradeById } from '../content/upgrades'
import type { Rng } from './rng'
import type { DraftCommand, Rarity, ReelSlot, SimState } from './types'

export function openDraft(state: SimState, rng: Rng): void {
  state.phase = 'draft'
  state.draft = {
    reels: [spinDraftReel(state, rng), spinDraftReel(state, rng), spinDraftReel(state, rng)],
    rerollCost: CONFIG.draft.rerollCost,
    version: 0,
  }
}

// One reel: roll for rare-or-better, then roll again for jackpot.
// Results display in the draft UI as rarity colors — that's the visibility.
function spinDraftReel(state: SimState, rng: Rng): ReelSlot {
  let rarity: Rarity = 'common'
  if (resolve('reel', state.player.luck, state.houseEdge, rng).success) {
    rarity = resolve('reel', state.player.luck, state.houseEdge, rng).success ? 'jackpot' : 'rare'
  }
  const pool = UPGRADES.filter((u) => u.rarity === rarity)
  return { upgradeId: pool[rng.int(0, pool.length - 1)].id, rarity }
}

export function applyDraftCommand(state: SimState, cmd: DraftCommand, rng: Rng): void {
  if (state.phase !== 'draft' || !state.draft) return
  if (cmd.reel < 0 || cmd.reel >= state.draft.reels.length) return

  if (cmd.type === 'reroll') {
    if (state.chips < state.draft.rerollCost) return
    state.chips -= state.draft.rerollCost
    state.draft.reels[cmd.reel] = spinDraftReel(state, rng)
    state.draft.version++
    return
  }

  upgradeById(state.draft.reels[cmd.reel].upgradeId).apply(state)
  state.draft = null
  state.phase = 'combat'
}
```

- [ ] **Step 4:** Full suite green (+6 new) and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/sim/draft.ts src/sim/draft.test.ts
git commit -m "feat: jackpot upgrade draft - luck-tilted reels, free pick, chip rerolls"
```

---

### Task 5: Gambling — slot spins in the tick

**Files:**
- Modify: `src/sim/tick.ts`
- Test: `src/sim/tick.test.ts` (append)

- [ ] **Step 1: Append failing tests** to `src/sim/tick.test.ts`:

```ts
describe('tick: gambling', () => {
  function atMachine(luck = 0, chips = 100) {
    const s = createInitialState()
    s.player.luck = luck
    s.chips = chips
    const m = s.machines[0]
    s.player.pos = { ...m.pos } // standing on the machine
    return s
  }

  it('spins on a timer: costs chips, gains luck, decrements machine spins, emits a spin event', () => {
    const s = atMachine(0, 100)
    const rng = createRng(30)
    for (let i = 0; i < CONFIG.machines.spinIntervalTicks; i++) tick(s, noInput, rng)
    expect(s.chips).toBe(100 - CONFIG.machines.spinCost)
    expect(s.player.luck).toBeGreaterThanOrEqual(CONFIG.machines.luckOnLoss)
    expect(s.machines[0].spinsLeft).toBe(CONFIG.machines.spinsPerMachine - 1)
    expect(s.gamblingMachineId).toBe(s.machines[0].id)
  })

  it('does not gamble when broke, far away, or at a cold machine', () => {
    const broke = atMachine(0, CONFIG.machines.spinCost - 1)
    tick(broke, noInput, createRng(1))
    expect(broke.gamblingMachineId).toBeNull()

    const far = atMachine()
    far.player.pos = { x: 100, y: 100 }
    tick(far, noInput, createRng(1))
    expect(far.gamblingMachineId).toBeNull()

    const cold = atMachine()
    cold.machines[0].spinsLeft = 0
    tick(cold, noInput, createRng(1))
    expect(cold.gamblingMachineId).toBeNull()
  })

  it('jackpot spins open the upgrade draft and freeze the sim', () => {
    const s = atMachine(1000, 1000) // 95% reel chance: jackpots are routine
    const rng = createRng(31)
    let guard = 0
    while (s.phase !== 'draft' && guard++ < 2000) tick(s, noInput, rng)
    expect(s.phase).toBe('draft')
    expect(s.draft).not.toBeNull()
    const t = s.tick
    tick(s, noInput, rng)
    expect(s.tick).toBe(t) // frozen during draft
  })

  it('walking away resets the spin timer (no banked partial spins)', () => {
    const s = atMachine(0, 100)
    const rng = createRng(32)
    for (let i = 0; i < CONFIG.machines.spinIntervalTicks - 5; i++) tick(s, noInput, rng)
    s.player.pos = { x: 100, y: 100 } // leave
    tick(s, noInput, rng)
    s.player.pos = { ...s.machines[0].pos } // come back
    for (let i = 0; i < 10; i++) tick(s, noInput, rng)
    expect(s.chips).toBe(100) // timer restarted — no spin yet
  })
})
```

- [ ] **Step 2:** Run — all four FAIL.

- [ ] **Step 3: Implement** in `src/sim/tick.ts`:

Imports: add `import { openDraft } from './draft'` and extend the type import with `Machine`.

Change the freeze line at the top of `tick()`:

```ts
  if (state.gameOver || state.phase === 'draft') return state
```

In `tick()`, insert `updateGambling(state, rng)` immediately after `movePlayer(state, input)` (guards need to know the gambling state before they move). Add:

```ts
function updateGambling(state: SimState, rng: Rng): void {
  const p = state.player
  let machine: Machine | null = null
  if (!state.alarm && state.chips >= CONFIG.machines.spinCost) {
    for (const m of state.machines) {
      if (m.spinsLeft <= 0) continue
      if (Math.hypot(m.pos.x - p.pos.x, m.pos.y - p.pos.y) > CONFIG.machines.interactRadius) continue
      machine = m
      break
    }
  }
  if (!machine) {
    state.gamblingMachineId = null
    state.spinTimer = CONFIG.machines.spinIntervalTicks // no banked partial spins
    return
  }

  state.gamblingMachineId = machine.id
  state.spinTimer--
  if (state.spinTimer > 0) return
  state.spinTimer = CONFIG.machines.spinIntervalTicks

  state.chips -= CONFIG.machines.spinCost
  machine.spinsLeft--

  const win = resolve('reel', p.luck, state.houseEdge, rng)
  let gained = CONFIG.machines.luckOnLoss
  let jackpot = false
  if (win.success) {
    gained = CONFIG.machines.luckOnWin
    if (resolve('reel', p.luck, state.houseEdge, rng).success) {
      gained += CONFIG.machines.jackpotLuck
      jackpot = true
    }
  }
  p.luck += gained
  state.events.push({ kind: 'spin', result: win, luckGained: gained, pos: { ...machine.pos } })
  if (jackpot) {
    state.events.push({ kind: 'jackpot', pos: { ...machine.pos } })
    openDraft(state, rng)
  }
}
```

- [ ] **Step 4:** Full suite green (+4 new). Pre-existing tests are unaffected: combat/contact tests place the player at world center, ≥190px from machine 1 (interact radius 70), so no accidental gambling. If a pre-existing test DOES start failing, investigate — don't patch blindly.

- [ ] **Step 5:** `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add src/sim/tick.ts src/sim/tick.test.ts
git commit -m "feat: gambling - timed slot spins convert chips to luck, jackpots open drafts"
```

---

### Task 6: HEAT, guard pressure, retreat, time scaling

**Files:**
- Modify: `src/sim/tick.ts`
- Test: `src/sim/tick.test.ts` (append)

- [ ] **Step 1: Append failing tests** to `src/sim/tick.test.ts`:

```ts
describe('tick: heat and guards', () => {
  it('heat rises while not gambling and drains while gambling', () => {
    const s = createInitialState()
    const rng = createRng(40)
    for (let i = 0; i < 100; i++) tick(s, noInput, rng)
    expect(s.heat).toBeCloseTo(100 * CONFIG.heat.risePerTick, 1)

    s.heat = 50
    s.chips = 1000
    s.player.pos = { ...s.machines[0].pos }
    tick(s, noInput, rng)
    expect(s.heat).toBeLessThan(50)
  })

  it('no guards spawn below the heat threshold', () => {
    const s = createInitialState()
    const rng = createRng(41)
    for (let i = 0; i < 200; i++) tick(s, noInput, rng) // heat reaches ~8 — below threshold 10
    expect(s.enemies.length).toBe(0)
  })

  it('hot floor spawns guards on a ring around the player, scaled by elapsed time', () => {
    const s = createInitialState()
    s.heat = 100
    s.tick = 3600 * 2 // pretend 2 minutes elapsed (scaling input)
    const rng = createRng(42)
    for (let i = 0; i < CONFIG.heat.minSpawnIntervalTicks + 2; i++) tick(s, noInput, rng)
    expect(s.enemies.length).toBeGreaterThanOrEqual(1)
    const e = s.enemies[0]
    // spawned ON the ring (could be clamped to world bounds, so allow <=)
    const d = Math.hypot(e.pos.x - s.player.pos.x, e.pos.y - s.player.pos.y)
    expect(d).toBeLessThanOrEqual(CONFIG.guards.ringRadius + 1)
    expect(d).toBeGreaterThan(600) // and not next to the player (world center: no clamping)
    expect(e.hp).toBeGreaterThan(CONFIG.enemy.hp) // time-scaled
  })

  it('guards retreat while the player gambles', () => {
    const s = createInitialState()
    s.chips = 1000
    s.player.pos = { ...s.machines[0].pos }
    s.enemies.push({
      id: 90, pos: { x: s.player.pos.x + 200, y: s.player.pos.y }, hp: 1000,
      speed: CONFIG.enemy.speed, radius: CONFIG.enemy.radius, touchDamage: 0, alive: true,
    })
    const before = 200
    tick(s, noInput, createRng(43))
    const e = s.enemies[0]
    const after = Math.hypot(e.pos.x - s.player.pos.x, e.pos.y - s.player.pos.y)
    expect(after).toBeGreaterThan(before)
  })

  it('house edge rises with elapsed time', () => {
    const s = createInitialState()
    const rng = createRng(44)
    for (let i = 0; i < 3600; i++) tick(s, noInput, rng) // one minute
    expect(s.houseEdge).toBeCloseTo(CONFIG.houseEdge.perMinute, 0)
  })
})
```

- [ ] **Step 2:** Run — FAIL (heat never moves, old spawner still timer-only, no retreat).

- [ ] **Step 3: Implement** in `src/sim/tick.ts`:

New tick order (full pipeline for clarity):

```ts
  movePlayer(state, input)
  updateGambling(state, rng)
  updateHeatAndEdge(state)
  moveEnemies(state)
  spawnGuards(state, rng)
  fireWeapon(state)
  moveProjectiles(state)
  resolveProjectileHits(state, rng)
  resolveContactDamage(state, rng)
```

Add:

```ts
function updateHeatAndEdge(state: SimState): void {
  if (state.alarm) state.heat = 100
  else if (state.gamblingMachineId !== null)
    state.heat = Math.max(0, state.heat - CONFIG.heat.drainPerTick)
  else state.heat = Math.min(100, state.heat + CONFIG.heat.risePerTick)

  const minutes = state.tick / (CONFIG.tickRate * 60)
  state.houseEdge = CONFIG.houseEdge.start + minutes * CONFIG.houseEdge.perMinute
}
```

REPLACE `spawnEnemies` entirely with:

```ts
// Guards spawn on a ring just outside the view, only when the floor is hot,
// never while the player is gambling (the house loves a customer).
function spawnGuards(state: SimState, rng: Rng): void {
  if (state.gamblingMachineId !== null && !state.alarm) return
  if (state.heat < CONFIG.heat.spawnThreshold) return
  state.spawnTimer--
  if (state.spawnTimer > 0) return
  const t = state.heat / 100
  state.spawnTimer = Math.round(
    CONFIG.heat.maxSpawnIntervalTicks -
      t * (CONFIG.heat.maxSpawnIntervalTicks - CONFIG.heat.minSpawnIntervalTicks),
  )

  const minutes = state.tick / (CONFIG.tickRate * 60)
  const angle = rng.next() * Math.PI * 2
  const x = clamp(state.player.pos.x + Math.cos(angle) * CONFIG.guards.ringRadius, 0, CONFIG.world.w)
  const y = clamp(state.player.pos.y + Math.sin(angle) * CONFIG.guards.ringRadius, 0, CONFIG.world.h)

  state.enemies.push({
    id: state.nextId++,
    pos: { x, y },
    hp: Math.round(CONFIG.enemy.hp * (1 + CONFIG.guards.hpPerMinute * minutes)),
    speed: CONFIG.enemy.speed * Math.min(1 + CONFIG.guards.speedPerMinute * minutes, CONFIG.guards.speedCap),
    radius: CONFIG.enemy.radius,
    touchDamage: CONFIG.enemy.touchDamage + Math.floor(CONFIG.guards.touchPerMinute * minutes),
    alive: true,
  })
}
```

(update the call site name: `spawnEnemies(state, rng)` → `spawnGuards(state, rng)`).

REPLACE `moveEnemies` with the retreat-aware version:

```ts
function moveEnemies(state: SimState): void {
  const retreating = state.gamblingMachineId !== null
  for (const e of state.enemies) {
    if (!e.alive) continue
    const dx = state.player.pos.x - e.pos.x
    const dy = state.player.pos.y - e.pos.y
    const len = Math.hypot(dx, dy) || 1
    const dir = retreating ? -1 : 1
    e.pos.x = clamp(e.pos.x + dir * (dx / len) * e.speed * DT, 0, CONFIG.world.w)
    e.pos.y = clamp(e.pos.y + dir * (dy / len) * e.speed * DT, 0, CONFIG.world.h)
    // a retreating guard that reaches the wall slips into the back rooms
    if (
      retreating &&
      (e.pos.x === 0 || e.pos.x === CONFIG.world.w || e.pos.y === 0 || e.pos.y === CONFIG.world.h)
    )
      e.alive = false
  }
  state.enemies = state.enemies.filter((e) => e.alive)
}
```

- [ ] **Step 4:** Full suite green (+5 new). Watch two pre-existing tests:
  - "enemies move toward the player" — player at world center, not gambling → still passes.
  - The determinism test now crosses heat thresholds and spawns guards — still deterministic, still passes (it gets REPLACED next task anyway).
  Any other failure is real — investigate.

- [ ] **Step 5:** `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add src/sim/tick.ts src/sim/tick.test.ts
git commit -m "feat: heat-driven guard pressure, gambling retreat, time-scaled stats"
```

---

### Task 7: Break the bank — alarm and victory

**Files:**
- Modify: `src/sim/tick.ts`
- Test: `src/sim/tick.test.ts` (append)

- [ ] **Step 1: Append failing tests** to `src/sim/tick.test.ts`:

```ts
describe('tick: break the bank', () => {
  it('reaching the luck target trips the alarm: machines die, heat pins at 100', () => {
    const s = createInitialState()
    s.player.luck = CONFIG.win.luckTarget
    tick(s, noInput, createRng(50))
    expect(s.alarm).toBe(true)
    expect(s.alarmTicksLeft).toBe(CONFIG.win.alarmTicks - 1)
    expect(s.machines.every((m) => m.spinsLeft === 0)).toBe(true)
    expect(s.events.some((e) => e.kind === 'alarm')).toBe(true)
    tick(s, noInput, createRng(50))
    expect(s.heat).toBe(100)
  })

  it('surviving the alarm wins the run (and the sim keeps running for endless)', () => {
    const s = createInitialState()
    s.alarm = true
    s.alarmTicksLeft = 2
    const rng = createRng(51)
    tick(s, noInput, rng)
    tick(s, noInput, rng)
    expect(s.victory).toBe(true)
    expect(s.events.some((e) => e.kind === 'victory')).toBe(true)
    const t = s.tick
    tick(s, noInput, rng)
    expect(s.tick).toBe(t + 1) // endless: not frozen
  })

  it('dying during the alarm is still game over', () => {
    const s = createInitialState()
    s.alarm = true
    s.alarmTicksLeft = 10_000
    s.player.hp = 5
    s.player.deathSavesLeft = 0
    s.enemies.push({
      id: 91, pos: { ...s.player.pos }, hp: 1000, speed: 0,
      radius: CONFIG.enemy.radius, touchDamage: 10, alive: true,
    })
    tick(s, noInput, createRng(52))
    expect(s.gameOver).toBe(true)
  })
})
```

- [ ] **Step 2:** Run — FAIL (no alarm logic).

- [ ] **Step 3: Implement** in `src/sim/tick.ts` — append `checkAlarm(state)` to the END of the tick pipeline (after `resolveContactDamage`):

```ts
function checkAlarm(state: SimState): void {
  if (!state.alarm) {
    if (state.player.luck >= CONFIG.win.luckTarget) {
      state.alarm = true
      state.alarmTicksLeft = CONFIG.win.alarmTicks
      for (const m of state.machines) m.spinsLeft = 0 // the house cuts you off
      state.events.push({ kind: 'alarm' })
    }
    return
  }
  if (state.victory) return
  state.alarmTicksLeft--
  if (state.alarmTicksLeft <= 0) {
    state.victory = true
    state.events.push({ kind: 'victory' })
  }
}
```

Note the first test's `alarmTicksLeft` expectation: the alarm trips and the SAME tick's `checkAlarm` does not decrement (it returns after tripping) — but the NEXT tick decrements. Re-read the test: it expects `CONFIG.win.alarmTicks - 1` after one tick. That means trip and decrement must happen on consecutive ticks and the test does `tick` once... Adjust the implementation to match the test by NOT returning early on the trip tick — i.e. trip, then fall through to the countdown in the same call:

```ts
function checkAlarm(state: SimState): void {
  if (!state.alarm) {
    if (state.player.luck < CONFIG.win.luckTarget) return
    state.alarm = true
    state.alarmTicksLeft = CONFIG.win.alarmTicks
    for (const m of state.machines) m.spinsLeft = 0 // the house cuts you off
    state.events.push({ kind: 'alarm' })
  }
  if (state.victory) return
  state.alarmTicksLeft--
  if (state.alarmTicksLeft <= 0) {
    state.victory = true
    state.events.push({ kind: 'victory' })
  }
}
```

Use this second version. (Heat pinning is already handled by `updateHeatAndEdge`.)

- [ ] **Step 4:** Full suite green (+3 new) and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/sim/tick.ts src/sim/tick.test.ts
git commit -m "feat: break the bank - luck target trips the alarm, survive it to win"
```

---

### Task 8: Determinism across gambling and drafts

**Files:**
- Modify: `src/sim/determinism.test.ts`

- [ ] **Step 1: Replace the test file** with a version that gambles, fights, and drafts:

```ts
import { describe, it, expect } from 'vitest'
import { tick } from './tick'
import { createInitialState } from './state'
import { createRng } from './rng'
import { applyDraftCommand } from './draft'
import type { InputState } from './types'

describe('determinism', () => {
  it('same seed + same inputs + same draft picks = identical state after 5000 ticks', () => {
    const run = () => {
      const layoutRng = createRng(555)
      const s = createInitialState(layoutRng)
      const rng = createRng(777)
      const inputRng = createRng(888) // scripted pseudo-random inputs
      for (let i = 0; i < 5000; i++) {
        if (s.phase === 'draft') {
          applyDraftCommand(s, { type: 'reroll', reel: 0 }, rng)
          applyDraftCommand(s, { type: 'pick', reel: i % 3 }, rng)
        }
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

- [ ] **Step 2:** `npx vitest --run src/sim/determinism.test.ts` — 1 passed. A failure means entropy outside the seeded RNG crept into gambling/heat/draft code — find it, don't mask it.

- [ ] **Step 3:** Full suite + tsc.

- [ ] **Step 4: Commit**

```bash
git add src/sim/determinism.test.ts
git commit -m "test: determinism across gambling, heat, and scripted draft picks"
```

---

### Task 9: Renderer — camera, the floor, machines, HEAT bar, draft overlay

**Files:**
- Modify: `src/render/renderer.ts`

No unit tests (visual). Constraints: zero game logic; read-only state. Verify with `npx tsc --noEmit` + `npm run build` + the existing suite staying green.

- [ ] **Step 1: Implement.** Changes to `src/render/renderer.ts`:

Imports: `import { upgradeById } from '../content/upgrades'`; extend type import to `import type { Rarity, SimState } from '../sim/types'`.

Extend COLORS:

```ts
  machineWarm: 0xffd700,
  machineCold: 0x4a4a4a,
  heatLow: 0x6fdc6f,
  heatHigh: 0xff4040,
  rarityCommon: 0xf4e9c9,
  rarityRare: 0x7df9ff,
  rarityJackpot: 0xffd700,
```

New private fields:

```ts
  private machinesG = new Graphics()
  private floorG = new Graphics()
  private heatG = new Graphics()
  private statusText!: Text
  private draftUI: Container | null = null
  private shownDraftVersion = -1
```

In `init()`:
- The border rect becomes the WORLD border: `.rect(4, 4, CONFIG.world.w - 8, CONFIG.world.h - 8)`.
- Draw a subtle floor grid into `floorG` (so motion is visible while the camera moves):

```ts
    for (let x = 320; x < CONFIG.world.w; x += 320)
      this.floorG.moveTo(x, 0).lineTo(x, CONFIG.world.h)
    for (let y = 320; y < CONFIG.world.h; y += 320)
      this.floorG.moveTo(0, y).lineTo(CONFIG.world.w, y)
    this.floorG.stroke({ width: 1, color: COLORS.feltLine, alpha: 0.5 })
```

- World layering: `this.world.addChild(this.floorG, border, this.machinesG, this.enemiesG, this.projectilesG, this.playerG)`.
- HUD stays on stage. Add the status line and heat bar to the stage:

```ts
    this.statusText = new Text({
      text: '',
      style: { fill: COLORS.hud, fontFamily: 'monospace', fontSize: 16, fontWeight: 'bold' },
    })
    this.statusText.position.set(12, 34)
    this.app.stage.addChild(this.statusText, this.heatG)
```

In `draw(state)`:
- FIRST, position the camera:

```ts
    const camX = Math.min(Math.max(state.player.pos.x - CONFIG.screen.w / 2, 0), CONFIG.world.w - CONFIG.screen.w)
    const camY = Math.min(Math.max(state.player.pos.y - CONFIG.screen.h / 2, 0), CONFIG.world.h - CONFIG.screen.h)
    this.world.position.set(-camX, -camY)
```

- Draw machines each frame (before enemies):

```ts
    this.machinesG.clear()
    for (const m of state.machines) {
      const warm = m.spinsLeft > 0
      this.machinesG
        .roundRect(m.pos.x - 18, m.pos.y - 22, 36, 44, 6)
        .fill(warm ? COLORS.machineWarm : COLORS.machineCold)
      if (state.gamblingMachineId === m.id) {
        this.machinesG.circle(m.pos.x, m.pos.y, CONFIG.machines.interactRadius)
          .stroke({ width: 2, color: COLORS.machineWarm, alpha: 0.6 })
      }
    }
```

- HUD text becomes:

```ts
    this.hud.text =
      `HP ${p.hp}/${p.maxHp}   LUCK ${p.luck}/${CONFIG.win.luckTarget}   ` +
      `CHIPS ${state.chips}   SAVES ${p.deathSavesLeft}`
```

- Status line + heat bar:

```ts
    const alarmSecs = Math.ceil(state.alarmTicksLeft / CONFIG.tickRate)
    this.statusText.text = state.gameOver
      ? '— BUSTED. refresh to re-buy —'
      : state.victory
        ? '🏆 YOU BEAT THE HOUSE (endless mode)'
        : state.alarm
          ? `🚨 ALARM — SURVIVE ${alarmSecs}s`
          : state.gamblingMachineId !== null
            ? 'GAMBLING — the house loves a customer'
            : 'HUNTED — find a machine'

    this.heatG.clear()
    const hw = 260
    this.heatG.rect(CONFIG.screen.w - hw - 16, 14, hw, 14).fill({ color: 0x000000, alpha: 0.5 })
    this.heatG
      .rect(CONFIG.screen.w - hw - 16, 14, (hw * state.heat) / 100, 14)
      .fill(state.heat > 60 ? COLORS.heatHigh : COLORS.heatLow)
```

- Popups must live in WORLD space now (they mark world positions and should scroll with the camera): in `addPopup`, change `this.app.stage.addChild(text)` to `this.world.addChild(text)`.
- New event popups in `drawPopups`'s consumption loop:

```ts
      } else if (ev.kind === 'spin') {
        this.addPopup(`+${ev.luckGained} LUCK`, ev.pos.x, ev.pos.y - 30, COLORS.machineWarm, 14)
      } else if (ev.kind === 'jackpot') {
        this.addPopup('JACKPOT!', ev.pos.x, ev.pos.y - 50, COLORS.rarityJackpot, 32)
      } else if (ev.kind === 'alarm') {
        this.addPopup('🚨 ALARM 🚨', state.player.pos.x, state.player.pos.y - 60, COLORS.heatHigh, 36)
      } else if (ev.kind === 'victory') {
        this.addPopup('🏆 BANK BROKEN', state.player.pos.x, state.player.pos.y - 60, COLORS.rarityJackpot, 36)
      }
```

- Draft overlay — add `this.syncDraft(state)` at the end of `draw()` and the methods:

```ts
  // Draft overlay rebuilds only when the draft opens/changes, never per frame.
  private syncDraft(state: SimState): void {
    const want = state.phase === 'draft' && state.draft ? state.draft.version : -1
    if (want === this.shownDraftVersion && (want >= 0) === !!this.draftUI) return
    this.shownDraftVersion = want
    if (this.draftUI) {
      this.draftUI.destroy({ children: true })
      this.draftUI = null
    }
    if (state.phase !== 'draft' || !state.draft) return

    const ui = new Container()
    ui.addChild(
      new Graphics().rect(0, 0, CONFIG.screen.w, CONFIG.screen.h).fill({ color: 0x000000, alpha: 0.72 }),
    )
    const cx = CONFIG.screen.w / 2
    const title = this.uiText('🎰 THE MACHINE PAYS OUT', 28, COLORS.rarityJackpot)
    title.position.set(cx, 150)
    ui.addChild(title)

    state.draft.reels.forEach((reel, i) => {
      const up = upgradeById(reel.upgradeId)
      const line = this.uiText(
        `[${i + 1}]  ${up.name} — ${up.desc}  (${reel.rarity.toUpperCase()})`,
        20,
        this.rarityColor(reel.rarity),
      )
      line.position.set(cx, 250 + i * 60)
      ui.addChild(line)
    })

    const help = this.uiText(
      `1/2/3 take an upgrade  ·  4/5/6 reroll that reel (${state.draft.rerollCost} chips — you have ${state.chips})`,
      16,
      COLORS.hud,
    )
    help.position.set(cx, 470)
    ui.addChild(help)

    this.app.stage.addChild(ui)
    this.draftUI = ui
  }

  private rarityColor(r: Rarity): number {
    return r === 'jackpot' ? COLORS.rarityJackpot : r === 'rare' ? COLORS.rarityRare : COLORS.rarityCommon
  }

  private uiText(label: string, size: number, color: number): Text {
    const t = new Text({
      text: label,
      style: { fill: color, fontFamily: 'monospace', fontSize: size, fontWeight: 'bold' },
    })
    t.anchor.set(0.5)
    return t
  }
```

- [ ] **Step 2:** `npx tsc --noEmit`, `npm run build`, `npx vitest --run` — all green.

- [ ] **Step 3: Commit**

```bash
git add src/render/renderer.ts
git commit -m "feat: camera, floor grid, machines, heat bar, status line, draft overlay"
```

---

### Task 10: Wire draft input + smoke test

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Replace `src/main.ts`** (adds the draft key queue; everything else is unchanged from M1):

```ts
import { createRng } from './sim/rng'
import { createInitialState } from './sim/state'
import { tick } from './sim/tick'
import { CONFIG } from './sim/config'
import { applyDraftCommand } from './sim/draft'
import { createInput } from './input'
import { Renderer } from './render/renderer'
import type { DraftCommand } from './sim/types'

async function main() {
  const params = new URLSearchParams(location.search)
  const seed = Number(params.get('seed')) || (Date.now() >>> 0)
  const rng = createRng(seed)
  const state = createInitialState(rng)
  const input = createInput()

  // draft one-shots: 1/2/3 pick a reel, 4/5/6 reroll it
  const draftQueue: DraftCommand[] = []
  const DRAFT_KEYS: Record<string, DraftCommand> = {
    Digit1: { type: 'pick', reel: 0 }, Digit2: { type: 'pick', reel: 1 }, Digit3: { type: 'pick', reel: 2 },
    Digit4: { type: 'reroll', reel: 0 }, Digit5: { type: 'reroll', reel: 1 }, Digit6: { type: 'reroll', reel: 2 },
  }
  window.addEventListener('keydown', (e) => {
    const cmd = DRAFT_KEYS[e.code]
    if (cmd && state.phase === 'draft') draftQueue.push({ ...cmd })
  })

  const renderer = new Renderer()
  await renderer.init()
  console.log(`HOUSE EDGE — seed ${seed} (share with ?seed=${seed})`)

  const TICK_MS = 1000 / CONFIG.tickRate
  let acc = 0
  let last = performance.now()

  renderer.app.ticker.add(() => {
    while (draftQueue.length > 0) applyDraftCommand(state, draftQueue.shift()!, rng)
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

void main()
```

Note `createInitialState(rng)` — the machine layout now comes from the run seed.

- [ ] **Step 2:** `npx vitest --run`, `npx tsc --noEmit`, `npm run build` — green. Dev-server smoke: background `npm run dev`, sleep 2, `curl -s http://localhost:5173/house-edge/ | grep -i "house edge"`, kill the server.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: draft controls and seeded machine layout wired - the floor is playable"
```

---

### Task 11: README + ship Milestone 2

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README.** Replace the Status section with:

```markdown
## Status

Milestone 2 — **The Floor**: explore a big casino floor where gambling at slot
machines builds LUCK and keeps the guards away. Stop gambling and HEAT climbs —
the floor hunts you. Machines run cold, jackpots deal upgrade drafts, and hitting
the LUCK target trips the alarm: survive it to break the bank.
Next: charms, hot streak, guard variety, audio/juice.
Design spec: [docs/superpowers/specs/2026-06-10-house-edge-design.md](docs/superpowers/specs/2026-06-10-house-edge-design.md)
```

Replace the Controls section with:

```markdown
## Controls

WASD / arrows to move. Stand at a gold slot machine to gamble (auto-spins —
costs chips, builds LUCK, keeps guards off you). Gray machines are cold.
Draft: 1/2/3 takes an upgrade, 4/5/6 rerolls that reel.
```

- [ ] **Step 2: Ship**

```bash
git add README.md
git commit -m "docs: milestone 2 readme - the floor"
git push
gh run watch --exit-status
```

Verify live: HTML 200 and a FRESH JS bundle 200 at https://positivitty.github.io/house-edge/ (retry up to 5× over ~2 min if Pages serves stale cache).

- [ ] **Step 3: Tag**

```bash
git tag milestone-2
git push --tags
```

---

## Self-review notes (already applied)

- **Spec v2 coverage:** big floor + camera ✓, machines with seeded layout + near-spawn machine ✓, gambling = luck + safety ✓, machines run cold ✓, jackpot upgrade drafts ✓, HEAT ramp/drain/threshold ✓, guards retreat while gambling ✓, time-scaled guards + house edge ✓, break-the-bank alarm + survive-to-win ✓, endless after victory ✓, determinism incl. drafts ✓. Deferred per spec: charms, hot streak, guard variety, Pit Boss, audio/receipt/daily-seed (M3/M4).
- **Type consistency:** `applyDraftCommand(state, cmd, rng)` / `DraftCommand {type, reel}` / `DraftState {reels, rerollCost, version}` / `Machine {id, pos, spinsLeft}` / `createInitialState(rng?)` used identically across Tasks 2–10; `Player.weapon` from Task 1 consumed in Tasks 3/4.
- **Known balance starting points (tune from playtests, all in config):** seed chips 30 ≈ 10 spins; spin economy ≈ +2.2 luck/spin at low luck; luck 100 target ≈ 35–45 spins ≈ 4–5 machines; heat 0→100 ≈ 42s; guard DPS ramps via per-minute multipliers. The statistical tests pin mechanisms, not these feel numbers.
- **Test-impact callouts** are explicit in Tasks 2/5/6 rather than discovered mid-task: one deleted test (edge spawn), two updated assertions (center, chips), everything else additive.
