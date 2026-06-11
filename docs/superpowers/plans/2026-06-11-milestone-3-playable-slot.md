# HOUSE EDGE — Milestone 3: The Playable Slot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace proximity auto-gambling with a playable slot minigame — E to sit (world pauses), stake selection, manual pulls with sequential reel reveals, ride-or-cash double-or-nothing, bust risk — plus the playtest essentials: heat-per-pull economy, guard cap, numeric heat, R-restart.

**Architecture:** A new `'slot'` phase freezes the tick exactly like `'draft'`. All slot interaction is explicit commands (`applySlotCommand(state, cmd, rng)`) applied between ticks — same pattern as drafts, so determinism extends to slot sessions. Every outcome flows through the one luck resolver; reel symbols are pure presentation derived from the resolved outcome. HEAT stops draining per tick and instead drains per pull (stake-scaled); guard retreat keys off `heat < spawnThreshold`.

**Tech Stack:** unchanged — Vite, TypeScript strict, PixiJS v8, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-house-edge-design.md` (v3 — "Slot machines — the playable slot", "HEAT")

**Conventions:** repo root `~/Projects/house-edge`; strict TDD for sim; all randomness via the passed `Rng`; NO Co-Authored-By lines; do not push until the final task; finish every task with the FULL suite green + `npx tsc --noEmit` clean.

---

### Task 1: Strip auto-gambling (sim + tests + renderer stay green)

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/config.ts`, `src/sim/state.ts`, `src/sim/tick.ts`, `src/render/renderer.ts`
- Test: `src/sim/tick.test.ts`, `src/sim/determinism.test.ts`

The old proximity auto-spin dies here; the new slot arrives in Tasks 2–4. This task ends with a compiling, green build where gambling simply doesn't exist yet.

- [ ] **Step 1: types.ts.** Remove `spinTimer` and `gamblingMachineId` from `SimState`. Remove the `spin` and `jackpot` variants from `SimEvent` (slot results display in the slot UI; popups for them died with auto-spin).

- [ ] **Step 2: config.ts.** Slim `machines` to:

```ts
  machines: {
    count: 12,
    radius: 26, // visual size
    interactRadius: 70, // stand this close to sit down (E)
    spinsPerMachine: 10, // pulls before it runs cold, permanently
  },
```

(`spinIntervalTicks`, `spinCost`, `luckOnWin`, `luckOnLoss`, `jackpotLuck` deleted — the slot block in Task 2 replaces them.)

- [ ] **Step 3: state.ts.** Remove `spinTimer` and `gamblingMachineId` from the returned object.

- [ ] **Step 4: tick.ts.**
- Delete `updateGambling` entirely and its call (and the draft early-return right after it — the freeze check at the top of `tick()` covers draft already; verify the top says `if (state.gameOver || state.phase === 'draft') return state` and remove the now-dead mid-pipeline return).
- Delete the `openDraft` import if now unused (it is — drafts now open from the slot module in Task 4; if tsc flags it unused, remove it).
- `updateHeatAndEdge`: remove the gambling-drain branch:

```ts
function updateHeatAndEdge(state: SimState): void {
  if (state.alarm) state.heat = 100
  else state.heat = Math.min(100, state.heat + CONFIG.heat.risePerTick)

  const minutes = state.tick / (CONFIG.tickRate * 60)
  state.houseEdge = CONFIG.houseEdge.start + minutes * CONFIG.houseEdge.perMinute
}
```

- `moveEnemies`: retreat now keys off heat: `const retreating = !state.alarm && state.heat < CONFIG.heat.spawnThreshold`.
- `spawnGuards`: replace the gambling clause — first lines become:

```ts
  if (state.heat < CONFIG.heat.spawnThreshold) return
```

(the old `gamblingMachineId` check is gone).

- [ ] **Step 5: renderer.ts.** Remove the `spin`/`jackpot` popup branches from `drawPopups`; remove the gambling interact-ring (the `state.gamblingMachineId === m.id` block) from the machine drawing; in the status line, replace the `gamblingMachineId !== null ? 'GAMBLING...'` branch — the chain becomes gameOver > victory > alarm > `'HUNTED — find a machine (E to play)'`.

- [ ] **Step 6: tests.** In `src/sim/tick.test.ts`: DELETE the whole `describe('tick: gambling', ...)` block (the slot module gets its own suite). In the heat tests, the "drains while gambling" sub-assertion of the first test must go — replace that test with:

```ts
  it('heat rises on the open floor', () => {
    const s = createInitialState()
    const rng = createRng(40)
    for (let i = 0; i < 100; i++) tick(s, noInput, rng)
    expect(s.heat).toBeCloseTo(100 * CONFIG.heat.risePerTick, 1)
  })
```

In the "guards retreat" test, replace the gambling setup with heat-based retreat: set `s.heat = 0` (below threshold), DON'T place the player at a machine, keep the enemy 200px away, tick once, expect distance increased. In `src/sim/determinism.test.ts`: no changes needed yet (Task 5 rewrites it) — but it must still pass.

- [ ] **Step 7:** Full suite green (report the count — the gambling block removal drops ~6 tests), `npx tsc --noEmit`, `npm run build`.

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "refactor: remove proximity auto-gambling; heat-threshold guard retreat"
```

---

### Task 2: Slot types and config

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/config.ts`

- [ ] **Step 1: types.ts.** `Phase` becomes `'combat' | 'draft' | 'slot'`. Add:

```ts
export type SlotSymbol = 'clover' | 'cherry' | 'seven' | 'bust' | 'blank'

export type SlotOutcomeKind =
  | 'luck' | 'chips' | 'jackpot' | 'bust' | 'nothing' | 'rideWin' | 'rideLoss'

export interface SlotOutcome {
  kind: SlotOutcomeKind
  amount: number
}

export interface SlotState {
  machineId: number
  stakeIndex: number // index into CONFIG.slot.stakes
  reels: SlotSymbol[] | null // last landed symbols (null before first pull)
  outcome: SlotOutcome | null
  pendingWin: { kind: 'luck' | 'chips'; amount: number } | null // ride-or-cash
  version: number // bumped on every change so the renderer rebuilds
}

export type SlotCommand =
  | { type: 'enter' }
  | { type: 'exit' }
  | { type: 'stake'; dir: -1 | 1 }
  | { type: 'pull' }
  | { type: 'ride' }
  | { type: 'cash' }
```

Add to `SimState`: `slot: SlotState | null`.

- [ ] **Step 2: config.ts.** Add the slot block (sibling of `draft`):

```ts
  slot: {
    stakes: [3, 10, 25], // chips per pull
    luckPayout: [3, 8, 18], // luck win, by stake tier
    chipsPayoutMult: 3, // chips win pays stake * this
    winBonus: [0, 5, 10], // added to luck for the win roll, by stake tier
    heatDrainPerPull: [6, 12, 22], // the house loves a whale
    chipsWinChance: 0.35, // share of non-jackpot wins that pay chips
    bustChance: 0.08, // share of losses where the pit boss notices you
    bustHeat: 15,
    jackpotLuck: [8, 12, 20], // immediate luck on jackpot, by stake tier
    rideEdge: 10, // extra house edge on double-or-nothing rolls
  },
```

- [ ] **Step 3: state.ts.** Add `slot: null,` to the returned object.

- [ ] **Step 4:** Suite green (no behavior change), tsc clean. Commit:

```bash
git add src/sim/types.ts src/sim/config.ts src/sim/state.ts
git commit -m "feat: slot phase, state, and tuning config"
```

---

### Task 3: Slot module — enter, exit, stake (sim/slot.ts)

**Files:**
- Create: `src/sim/slot.ts`
- Test: `src/sim/slot.test.ts`
- Modify: `src/sim/tick.ts` (freeze on 'slot')

- [ ] **Step 1: Write failing tests** — `src/sim/slot.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { applySlotCommand } from './slot'
import { createInitialState } from './state'
import { createRng } from './rng'
import { CONFIG } from './config'
import { tick } from './tick'
import type { InputState } from './types'

const noInput: InputState = { up: false, down: false, left: false, right: false }

export function atMachineState(chips = 100) {
  const s = createInitialState()
  s.chips = chips
  s.player.pos = { ...s.machines[0].pos }
  return s
}

describe('slot: enter/exit/stake', () => {
  it('E at a warm machine enters slot phase and freezes the sim', () => {
    const s = atMachineState()
    applySlotCommand(s, { type: 'enter' }, createRng(1))
    expect(s.phase).toBe('slot')
    expect(s.slot).not.toBeNull()
    expect(s.slot!.machineId).toBe(s.machines[0].id)
    expect(s.slot!.stakeIndex).toBe(0)
    const t = s.tick
    tick(s, noInput, createRng(1))
    expect(s.tick).toBe(t) // frozen
  })

  it('cannot enter when far, broke, at a cold machine, during alarm, or mid-draft', () => {
    const far = atMachineState()
    far.player.pos = { x: 100, y: 100 }
    applySlotCommand(far, { type: 'enter' }, createRng(1))
    expect(far.phase).toBe('combat')

    const broke = atMachineState(CONFIG.slot.stakes[0] - 1)
    applySlotCommand(broke, { type: 'enter' }, createRng(1))
    expect(broke.phase).toBe('combat')

    const cold = atMachineState()
    cold.machines[0].spinsLeft = 0
    applySlotCommand(cold, { type: 'enter' }, createRng(1))
    expect(cold.phase).toBe('combat')

    const alarmed = atMachineState()
    alarmed.alarm = true
    applySlotCommand(alarmed, { type: 'enter' }, createRng(1))
    expect(alarmed.phase).toBe('combat')
  })

  it('exit returns to combat and clears slot state', () => {
    const s = atMachineState()
    applySlotCommand(s, { type: 'enter' }, createRng(1))
    applySlotCommand(s, { type: 'exit' }, createRng(1))
    expect(s.phase).toBe('combat')
    expect(s.slot).toBeNull()
  })

  it('stake selection clamps to the table and bumps version', () => {
    const s = atMachineState()
    applySlotCommand(s, { type: 'enter' }, createRng(1))
    applySlotCommand(s, { type: 'stake', dir: 1 }, createRng(1))
    expect(s.slot!.stakeIndex).toBe(1)
    applySlotCommand(s, { type: 'stake', dir: 1 }, createRng(1))
    applySlotCommand(s, { type: 'stake', dir: 1 }, createRng(1))
    expect(s.slot!.stakeIndex).toBe(CONFIG.slot.stakes.length - 1) // clamped
    applySlotCommand(s, { type: 'stake', dir: -1 }, createRng(1))
    expect(s.slot!.stakeIndex).toBe(1)
    expect(s.slot!.version).toBeGreaterThanOrEqual(4)
  })
})
```

- [ ] **Step 2:** Run — FAILS (no module).

- [ ] **Step 3: Implement** — `src/sim/slot.ts` (pull/ride/cash arrive in Task 4 as stubs that do nothing yet — do NOT add empty case branches that lie; switch only on what exists and let Task 4 extend):

```ts
import { CONFIG } from './config'
import type { Rng } from './rng'
import type { SimState, SlotCommand } from './types'

export function applySlotCommand(state: SimState, cmd: SlotCommand, rng: Rng): void {
  if (cmd.type === 'enter') {
    tryEnter(state)
    return
  }
  if (state.phase !== 'slot' || !state.slot) return
  if (cmd.type === 'exit') {
    closeSlot(state)
    return
  }
  if (cmd.type === 'stake') {
    const max = CONFIG.slot.stakes.length - 1
    state.slot.stakeIndex = Math.min(max, Math.max(0, state.slot.stakeIndex + cmd.dir))
    state.slot.version++
    return
  }
  void rng // pull/ride/cash land in the next task
}

function tryEnter(state: SimState): void {
  if (state.phase !== 'combat' || state.alarm || state.gameOver) return
  if (state.chips < CONFIG.slot.stakes[0]) return
  const p = state.player.pos
  for (const m of state.machines) {
    if (m.spinsLeft <= 0) continue
    if (Math.hypot(m.pos.x - p.x, m.pos.y - p.y) > CONFIG.machines.interactRadius) continue
    state.phase = 'slot'
    state.slot = {
      machineId: m.id,
      stakeIndex: 0,
      reels: null,
      outcome: null,
      pendingWin: null,
      version: 0,
    }
    return
  }
}

export function closeSlot(state: SimState): void {
  // standing up banks any un-decided win (the machine doesn't hold your money)
  const w = state.slot?.pendingWin
  if (w) {
    if (w.kind === 'luck') state.player.luck += w.amount
    else state.chips += w.amount
  }
  state.slot = null
  state.phase = 'combat'
}
```

- [ ] **Step 4: tick.ts** — the freeze line becomes:

```ts
  if (state.gameOver || state.phase !== 'combat') return state
```

(covers 'draft' and 'slot' in one honest check).

- [ ] **Step 5:** Full suite green (+4 new), tsc. Commit:

```bash
git add src/sim/slot.ts src/sim/slot.test.ts src/sim/tick.ts
git commit -m "feat: slot sessions - sit down, stand up, pick your stake"
```

---

### Task 4: The pull — outcomes, symbols, ride-or-cash

**Files:**
- Modify: `src/sim/slot.ts`
- Test: `src/sim/slot.test.ts` (append)

Outcome skeleton per pull (all through `resolve`): win roll (luck + stake bonus) → success: jackpot roll → success: JACKPOT (immediate luck + draft); else chips-vs-luck split by `rng.next() < chipsWinChance` → pendingWin (ride-or-cash). Failure: `rng.next() < bustChance` → BUST (+heat); else nothing. Symbols are derived from the outcome: jackpot `[seven,seven,seven]`, luck `[clover,clover,clover]`, chips `[cherry,cherry,cherry]`, bust `[bust, draw, blank]`, nothing `[draw, draw, blank]` (draws from `['clover','cherry','seven']` — near-misses are good slot psychology).

- [ ] **Step 1: Append failing tests** to `src/sim/slot.test.ts`:

```ts
import { UPGRADES } from '../content/upgrades'

describe('slot: pulls', () => {
  function enter(chips = 1000, luck = 0) {
    const s = atMachineState(chips)
    s.player.luck = luck
    applySlotCommand(s, { type: 'enter' }, createRng(1))
    return s
  }

  it('a pull costs the stake, burns a machine spin, drains heat by stake tier', () => {
    const s = enter(1000)
    s.heat = 50
    applySlotCommand(s, { type: 'pull' }, createRng(60))
    expect(s.chips).toBeLessThanOrEqual(1000 - CONFIG.slot.stakes[0])
    expect(s.machines[0].spinsLeft).toBe(CONFIG.machines.spinsPerMachine - 1)
    expect(s.heat).toBeLessThanOrEqual(50 - CONFIG.slot.heatDrainPerPull[0] + CONFIG.slot.bustHeat)
    expect(s.slot!.reels).not.toBeNull()
    expect(s.slot!.outcome).not.toBeNull()
  })

  it('cannot pull while a win is pending or when broke', () => {
    const s = enter(1000, 1000) // 95% wins: find a pending win fast
    let guard = 0
    while (!s.slot!.pendingWin && s.phase === 'slot' && guard++ < 50)
      applySlotCommand(s, { type: 'pull' }, createRng(61 + guard))
    if (s.phase !== 'slot') return // jackpot ended the session — acceptable for this seed walk
    const chipsBefore = s.chips
    applySlotCommand(s, { type: 'pull' }, createRng(99))
    expect(s.chips).toBe(chipsBefore) // pull refused while deciding

    const broke = enter(CONFIG.slot.stakes[0])
    applySlotCommand(broke, { type: 'pull' }, createRng(62)) // spends down to < stake...
    const before = JSON.stringify(broke.slot)
    if (broke.phase === 'slot' && !broke.slot!.pendingWin) {
      applySlotCommand(broke, { type: 'pull' }, createRng(63))
      expect(JSON.stringify(broke.slot)).toBe(before) // refused: can't afford
    }
  })

  it('jackpot pays luck immediately and opens the draft', () => {
    const s = enter(100_000, 1000) // both rolls clamp to 95%
    let guard = 0
    while (s.phase === 'slot' && guard++ < 200)
      applySlotCommand(s, { type: 'pull' }, createRng(70 + guard))
    expect(s.phase).toBe('draft')
    expect(s.draft).not.toBeNull()
    expect(s.slot).toBeNull()
    expect(s.player.luck).toBeGreaterThan(1000)
  })

  it('cash banks a pending win; ride doubles it or loses it', () => {
    const s = enter(1000, 0)
    s.slot!.pendingWin = { kind: 'chips', amount: 30 }
    const chips = s.chips
    applySlotCommand(s, { type: 'cash' }, createRng(80))
    expect(s.chips).toBe(chips + 30)
    expect(s.slot!.pendingWin).toBeNull()

    s.slot!.pendingWin = { kind: 'luck', amount: 10 }
    applySlotCommand(s, { type: 'ride' }, createRng(81))
    const w = s.slot!.pendingWin
    expect(w === null || w.amount === 20).toBe(true) // lost it, or doubled
  })

  it('standing up auto-cashes a pending win', () => {
    const s = enter(1000, 0)
    s.slot!.pendingWin = { kind: 'luck', amount: 10 }
    const luck = s.player.luck
    applySlotCommand(s, { type: 'exit' }, createRng(82))
    expect(s.player.luck).toBe(luck + 10)
  })

  it('statistical: pull win rate tracks the resolver (luck 0, stake 0 ≈ 30%)', () => {
    let wins = 0
    const rng = createRng(4242)
    for (let i = 0; i < 2000; i++) {
      const s = enter(1000, 0)
      applySlotCommand(s, { type: 'pull' }, rng)
      const k = s.phase === 'draft' ? 'jackpot' : s.slot!.outcome!.kind
      if (k === 'luck' || k === 'chips' || k === 'jackpot') wins++
    }
    expect(wins / 2000).toBeGreaterThan(0.26)
    expect(wins / 2000).toBeLessThan(0.34)
  })

  it('symbols honestly present the outcome', () => {
    const rng = createRng(90)
    for (let i = 0; i < 200; i++) {
      const s = enter(1000, 50)
      applySlotCommand(s, { type: 'pull' }, rng)
      if (s.phase === 'draft') continue // jackpot: slot closed; symbols were [7,7,7] by construction
      const o = s.slot!.outcome!
      const r = s.slot!.reels!
      if (o.kind === 'luck') expect(r).toEqual(['clover', 'clover', 'clover'])
      if (o.kind === 'chips') expect(r).toEqual(['cherry', 'cherry', 'cherry'])
      if (o.kind === 'bust') expect(r[0]).toBe('bust')
      if (o.kind === 'nothing') expect(r).not.toEqual(['clover', 'clover', 'clover'])
    }
  })
})
```

- [ ] **Step 2:** Run — FAIL (pull/ride/cash do nothing).

- [ ] **Step 3: Implement** in `src/sim/slot.ts`. Add imports: `resolve` from './resolve', `openDraft` from './draft', types `SlotOutcome`, `SlotSymbol`. Replace the `void rng` line with the three command branches:

```ts
  if (cmd.type === 'pull') {
    pull(state, rng)
    return
  }
  if (cmd.type === 'ride') {
    ride(state, rng)
    return
  }
  if (cmd.type === 'cash') {
    cash(state)
    return
  }
```

Add the functions:

```ts
const PRESENT_POOL: SlotSymbol[] = ['clover', 'cherry', 'seven']

function pull(state: SimState, rng: Rng): void {
  const slot = state.slot!
  if (slot.pendingWin) return // decide first
  const machine = state.machines.find((m) => m.id === slot.machineId)
  if (!machine || machine.spinsLeft <= 0) return
  const stake = CONFIG.slot.stakes[slot.stakeIndex]
  if (state.chips < stake) return

  state.chips -= stake
  machine.spinsLeft--
  state.heat = Math.max(0, state.heat - CONFIG.slot.heatDrainPerPull[slot.stakeIndex])

  const luck = state.player.luck + CONFIG.slot.winBonus[slot.stakeIndex]
  const win = resolve('reel', luck, state.houseEdge, rng)
  let outcome: SlotOutcome

  if (win.success) {
    if (resolve('reel', luck, state.houseEdge, rng).success) {
      outcome = { kind: 'jackpot', amount: CONFIG.slot.jackpotLuck[slot.stakeIndex] }
    } else if (rng.next() < CONFIG.slot.chipsWinChance) {
      outcome = { kind: 'chips', amount: stake * CONFIG.slot.chipsPayoutMult }
      slot.pendingWin = { kind: 'chips', amount: outcome.amount }
    } else {
      outcome = { kind: 'luck', amount: CONFIG.slot.luckPayout[slot.stakeIndex] }
      slot.pendingWin = { kind: 'luck', amount: outcome.amount }
    }
  } else if (rng.next() < CONFIG.slot.bustChance) {
    outcome = { kind: 'bust', amount: CONFIG.slot.bustHeat }
    state.heat = Math.min(100, state.heat + CONFIG.slot.bustHeat)
  } else {
    outcome = { kind: 'nothing', amount: 0 }
  }

  slot.outcome = outcome
  slot.reels = symbolsFor(outcome, rng)
  slot.version++

  if (outcome.kind === 'jackpot') {
    state.player.luck += outcome.amount
    state.slot = null
    openDraft(state, rng) // phase: 'slot' -> 'draft'
  }
}

function symbolsFor(outcome: SlotOutcome, rng: Rng): SlotSymbol[] {
  switch (outcome.kind) {
    case 'jackpot':
      return ['seven', 'seven', 'seven']
    case 'luck':
      return ['clover', 'clover', 'clover']
    case 'chips':
      return ['cherry', 'cherry', 'cherry']
    case 'bust':
      return ['bust', PRESENT_POOL[rng.int(0, 2)], 'blank']
    default:
      // near-misses are good slot psychology; the blank guarantees no triple
      return [PRESENT_POOL[rng.int(0, 2)], PRESENT_POOL[rng.int(0, 2)], 'blank']
  }
}

function ride(state: SimState, rng: Rng): void {
  const slot = state.slot!
  const w = slot.pendingWin
  if (!w) return
  const r = resolve('reel', state.player.luck, state.houseEdge + CONFIG.slot.rideEdge, rng)
  if (r.success) {
    w.amount *= 2
    slot.outcome = { kind: 'rideWin', amount: w.amount }
  } else {
    slot.pendingWin = null
    slot.outcome = { kind: 'rideLoss', amount: 0 }
  }
  slot.version++
}

function cash(state: SimState): void {
  const slot = state.slot!
  const w = slot.pendingWin
  if (!w) return
  if (w.kind === 'luck') state.player.luck += w.amount
  else state.chips += w.amount
  slot.pendingWin = null
  slot.outcome = null
  slot.version++
}
```

Note on `closeSlot`: already auto-cashes (Task 3). Note the luck-target interaction: luck gained at the slot trips the alarm via `checkAlarm` on the next combat tick — already correct.

- [ ] **Step 4:** Full suite green (+7 new), tsc.

- [ ] **Step 5: Commit**

```bash
git add src/sim/slot.ts src/sim/slot.test.ts
git commit -m "feat: the pull - staked spins, ride-or-cash, busts, jackpot drafts"
```

---

### Task 5: Determinism v3 + guard cap

**Files:**
- Modify: `src/sim/determinism.test.ts`, `src/sim/tick.ts`, `src/sim/config.ts`
- Test: `src/sim/tick.test.ts` (append)

- [ ] **Step 1: Guard cap.** In config `guards` block add `maxOnScreen: 30,`. In `spawnGuards`, after the heat-threshold check add:

```ts
  if (state.enemies.length >= CONFIG.guards.maxOnScreen) return
```

Append test to `tick.test.ts` (heat/guards describe):

```ts
  it('on-screen guards are capped', () => {
    const s = createInitialState()
    s.heat = 100
    s.spawnTimer = 0
    s.player.hp = 1_000_000
    s.player.maxHp = 1_000_000
    const rng = createRng(45)
    for (let i = 0; i < 5000; i++) tick(s, noInput, rng)
    expect(s.enemies.length).toBeLessThanOrEqual(CONFIG.guards.maxOnScreen)
  })
```

- [ ] **Step 2: Determinism v3.** Replace the loop body in `determinism.test.ts` so slot sessions are scripted too (imports: add `applySlotCommand` from './slot'):

```ts
      for (let i = 0; i < 5000; i++) {
        if (s.phase === 'draft') {
          applyDraftCommand(s, { type: 'reroll', reel: 0 }, rng)
          applyDraftCommand(s, { type: 'pick', reel: i % 3 }, rng)
        } else if (s.phase === 'slot') {
          const step = i % 5
          if (step === 0) applySlotCommand(s, { type: 'stake', dir: 1 }, rng)
          else if (step < 3) applySlotCommand(s, { type: 'pull' }, rng)
          else if (s.slot?.pendingWin) applySlotCommand(s, { type: i % 2 ? 'ride' : 'cash' }, rng)
          else applySlotCommand(s, { type: 'exit' }, rng)
        } else if (i % 97 === 0) {
          applySlotCommand(s, { type: 'enter' }, rng) // no-op unless near a warm machine
        }
        // ...existing input + tick lines unchanged
      }
```

- [ ] **Step 3:** Run determinism alone, then the full suite, then tsc. A determinism failure is a real bug — find it.

- [ ] **Step 4: Commit**

```bash
git add src/sim/determinism.test.ts src/sim/tick.ts src/sim/tick.test.ts src/sim/config.ts
git commit -m "feat: on-screen guard cap; determinism across scripted slot sessions"
```

---

### Task 6: Renderer — the slot UI

**Files:**
- Modify: `src/render/renderer.ts`

No unit tests (visual). Zero game logic; read state, draw. Version-gated rebuild like `syncDraft`. Staggered reel reveal is RENDERER-LOCAL presentation (the sim already resolved the outcome).

- [ ] **Step 1: Implement.**

New fields:

```ts
  private slotUI: Container | null = null
  private shownSlotVersion = -1
  private reelTexts: Text[] = []
  private reelRevealFrame = 0
```

Symbol/text helpers:

```ts
  private static SYMBOL_GLYPHS: Record<string, string> = {
    clover: '🍀', cherry: '🍒', seven: '7️⃣', bust: '💀', blank: '▫️',
  }
```

Call `this.syncSlot(state)` at the end of `draw()` (next to `syncDraft`). Methods:

```ts
  private syncSlot(state: SimState): void {
    const want = state.phase === 'slot' && state.slot ? state.slot.version : -1
    if (want === this.shownSlotVersion && (want >= 0) === !!this.slotUI) {
      this.animateReels()
      return
    }
    this.shownSlotVersion = want
    if (this.slotUI) {
      this.slotUI.destroy({ children: true })
      this.slotUI = null
      this.reelTexts = []
    }
    if (state.phase !== 'slot' || !state.slot) return

    const slot = state.slot
    const machine = state.machines.find((m) => m.id === slot.machineId)
    const ui = new Container()
    const cx = CONFIG.screen.w / 2

    ui.addChild(
      new Graphics().rect(0, 0, CONFIG.screen.w, CONFIG.screen.h).fill({ color: 0x000000, alpha: 0.78 }),
    )
    const frame = new Graphics()
      .roundRect(cx - 260, 120, 520, 420, 18)
      .fill(0x12100a)
      .stroke({ width: 3, color: COLORS.machineWarm })
    ui.addChild(frame)

    const title = this.uiText('🎰 LUCKY DEVIL DELUXE', 24, COLORS.machineWarm)
    title.position.set(cx, 160)
    ui.addChild(title)

    // reels — revealed one by one by animateReels()
    this.reelTexts = [0, 1, 2].map((i) => {
      const t = this.uiText('▫️', 56, COLORS.hud)
      t.position.set(cx - 120 + i * 120, 260)
      ui.addChild(t)
      return t
    })
    this.reelRevealFrame = 0

    const stake = CONFIG.slot.stakes[slot.stakeIndex]
    const stakeLine = this.uiText(
      `◄ STAKE ${stake} ►    pulls left ${machine?.spinsLeft ?? 0}    chips ${state.chips}`,
      16,
      COLORS.hud,
    )
    stakeLine.position.set(cx, 350)
    ui.addChild(stakeLine)

    const o = slot.outcome
    const resultText = !o
      ? 'SPACE to pull the lever'
      : o.kind === 'luck' ? `🍀 +${o.amount} LUCK on the line`
      : o.kind === 'chips' ? `🍒 +${o.amount} CHIPS on the line`
      : o.kind === 'rideWin' ? `🔥 RODE IT — ${o.amount} on the line`
      : o.kind === 'rideLoss' ? '💨 gone. the house thanks you'
      : o.kind === 'bust' ? `💀 BUST — the pit boss noticed (+${o.amount} HEAT)`
      : 'nothing. SPACE to go again'
    const result = this.uiText(resultText, 18,
      o && (o.kind === 'bust' || o.kind === 'rideLoss') ? COLORS.heatHigh : COLORS.rarityJackpot)
    result.position.set(cx, 410)
    ui.addChild(result)

    const help = slot.pendingWin
      ? this.uiText('SPACE ride it (double or nothing)  ·  ENTER cash out', 16, COLORS.hud)
      : this.uiText('SPACE pull  ·  ◄/► stake  ·  E/ESC stand up', 16, COLORS.hud)
    help.position.set(cx, 470)
    ui.addChild(help)

    const heat = this.uiText(`HEAT ${Math.round(state.heat)} — each pull cools the floor`, 14, COLORS.heatLow)
    heat.position.set(cx, 510)
    ui.addChild(heat)

    this.app.stage.addChild(ui)
    this.slotUI = ui
    this.lastSlotReels = state.slot.reels // stash for the reveal
  }

  private lastSlotReels: import('../sim/types').SlotSymbol[] | null = null

  private animateReels(): void {
    if (!this.slotUI || !this.lastSlotReels) return
    this.reelRevealFrame++
    this.lastSlotReels.forEach((sym, i) => {
      const t = this.reelTexts[i]
      if (!t) return
      const revealAt = (i + 1) * 18 // ~0.3s apart at 60fps
      if (this.reelRevealFrame >= revealAt) t.text = Renderer.SYMBOL_GLYPHS[sym]
      else t.text = Renderer.SYMBOL_GLYPHS[Object.keys(Renderer.SYMBOL_GLYPHS)[this.reelRevealFrame % 4] as never] ?? '▫️'
    })
  }
```

(If the spinning-placeholder line fights the type checker, simplify the pre-reveal text to cycling through `['🍀','🍒','7️⃣','▫️'][this.reelRevealFrame % 4]` via a plain array — the intent is a cheap spin flicker, not art.)

Also update the status line's hunted text to `'HUNTED — find a machine (E to play)'` if Task 1 didn't already.

- [ ] **Step 2:** `npx tsc --noEmit`, `npm run build`, suite unchanged and green.

- [ ] **Step 3: Commit**

```bash
git add src/render/renderer.ts
git commit -m "feat: slot machine ui - reels, stakes, ride-or-cash, spin flicker"
```

---

### Task 7: Keys + restart + heat number

**Files:**
- Modify: `src/main.ts`, `src/render/renderer.ts` (one line)

- [ ] **Step 1: main.ts.** Add `applySlotCommand` + `SlotCommand` imports (from './sim/slot' and './sim/types'). Add a slot queue beside the draft queue and extend the keydown listener (REPLACE the existing listener with one combined handler):

```ts
  const slotQueue: SlotCommand[] = []
  window.addEventListener('keydown', (e) => {
    if (state.phase === 'draft') {
      const cmd = DRAFT_KEYS[e.code]
      if (cmd) draftQueue.push({ ...cmd })
      return
    }
    if (state.phase === 'slot') {
      if (e.code === 'KeyE' || e.code === 'Escape') slotQueue.push({ type: 'exit' })
      else if (e.code === 'ArrowLeft') slotQueue.push({ type: 'stake', dir: -1 })
      else if (e.code === 'ArrowRight') slotQueue.push({ type: 'stake', dir: 1 })
      else if (e.code === 'Space')
        slotQueue.push({ type: state.slot?.pendingWin ? 'ride' : 'pull' })
      else if (e.code === 'Enter') slotQueue.push({ type: 'cash' })
      e.preventDefault()
      return
    }
    // combat
    if (e.code === 'KeyE') slotQueue.push({ type: 'enter' })
    if (e.code === 'KeyR' && (state.gameOver || state.victory)) location.reload()
  })
```

Drain it in the ticker before the draft queue: `while (slotQueue.length > 0) applySlotCommand(state, slotQueue.shift()!, rng)`.

Note: arrow keys also drive movement input — harmless during slot phase (sim frozen; keyup clears held state).

- [ ] **Step 2: renderer.ts** — numeric heat: in `draw()`, after drawing the heat bar, set a small label. Add a field `private heatLabel!: Text`, create it in `init()` (monospace 12px, positioned at `(CONFIG.screen.w - 276 + 6, 13)`, added to stage after heatG), and in draw: `this.heatLabel.text = \`HEAT ${Math.round(state.heat)}\``. Also update the BUSTED status line to `'— BUSTED. press R to re-buy —'` and victory line to append `' · R restarts'`.

- [ ] **Step 3:** Suite green, tsc, build, dev-server smoke test (background dev server, curl the base path, kill).

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/render/renderer.ts
git commit -m "feat: slot controls, R to restart, numeric heat"
```

---

### Task 8: Ship Milestone 3

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README.** Status section becomes:

```markdown
## Status

Milestone 3 — **The Playable Slot**: walk up to a machine and press E — the
world pauses while you bet stakes, pull the lever, and ride or cash your wins.
Pulls drain HEAT (the house loves a customer); busts spike it. Machines still
run cold, jackpots still deal upgrade drafts, luck 100 still trips the alarm.
Next: charms, hot streak, guard variety, audio/juice.
Design spec: [docs/superpowers/specs/2026-06-10-house-edge-design.md](docs/superpowers/specs/2026-06-10-house-edge-design.md)
```

Controls section becomes:

```markdown
## Controls

WASD / arrows to move. **E** at a gold machine sits you down (world pauses):
**◄/►** stake, **SPACE** pull (or ride a win), **ENTER** cash out, **E/ESC** stand up.
Draft: **1/2/3** takes an upgrade, **4/5/6** rerolls. **R** restarts after a bust.
```

- [ ] **Step 2: Ship**

```bash
git add README.md
git commit -m "docs: milestone 3 readme - the playable slot"
git push
gh run watch --exit-status
```

Verify live: HTML 200, fresh bundle hash (≠ index-D40WT2AM.js), bundle 200.

- [ ] **Step 3: Tag**

```bash
git tag milestone-3
git push --tags
```

---

## Self-review notes (already applied)

- **Spec v3 coverage:** E-to-sit + world pause ✓ (phase freeze), stakes 3/10/25 with ←/→ ✓, SPACE pull with sequential reveal ✓ (renderer flicker + staggered reveal), mixed outcomes incl. chips-back and bust-heat ✓, triple-7 jackpot → draft ✓, ride-or-cash with house-favored repeatable rides ✓, auto-cash on stand-up ✓, heat-per-pull by stake ✓, heat-threshold guard retreat ✓, guard cap ✓, numeric heat ✓, R-restart ✓.
- **Type consistency:** `applySlotCommand(state, cmd, rng)` / `SlotCommand` union / `SlotState {machineId, stakeIndex, reels, outcome, pendingWin, version}` / `closeSlot` used identically across Tasks 3–7; `Phase` `'slot'` introduced Task 2, frozen in Task 3 (`phase !== 'combat'`), keyed in Task 7.
- **Removed surface:** auto-gambling (updateGambling/spinTimer/gamblingMachineId/spin+jackpot events and their renderer branches/tests) is stripped in Task 1 BEFORE the new system lands, so nothing half-dead survives the milestone.
- **Economy starting points (tunable in config):** stake-0 pull EV ≈ +1.4 luck and −2.3 chips at luck 0; high stakes snowball once luck grows (winBonus + bigger payouts). Bust 8% of losses. Ride odds house-favored by +10 edge. Playtest tunes the table, tests pin the mechanisms.
