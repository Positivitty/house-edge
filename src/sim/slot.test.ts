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

  it('cannot enter when far, broke, at a cold machine, or during alarm', () => {
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

  it('cannot pull while a win is pending', () => {
    const s = enter(1000, 0)
    s.slot!.pendingWin = { kind: 'chips', amount: 30 }
    const chipsBefore = s.chips
    const spinsBefore = s.machines[0].spinsLeft
    applySlotCommand(s, { type: 'pull' }, createRng(99))
    expect(s.chips).toBe(chipsBefore)
    expect(s.machines[0].spinsLeft).toBe(spinsBefore)
  })

  it('cannot pull when the stake exceeds remaining chips', () => {
    const s = enter(CONFIG.slot.stakes[2] - 1) // can afford low stake, not high
    applySlotCommand(s, { type: 'stake', dir: 1 }, createRng(1))
    applySlotCommand(s, { type: 'stake', dir: 1 }, createRng(1)) // stake 25
    const before = s.chips
    applySlotCommand(s, { type: 'pull' }, createRng(63))
    expect(s.chips).toBe(before) // refused
    expect(s.machines[0].spinsLeft).toBe(CONFIG.machines.spinsPerMachine)
  })

  it('jackpot pays luck immediately and opens the draft', () => {
    const s = enter(100_000, 1000) // both rolls clamp to 95%
    let guard = 0
    while (s.phase === 'slot' && guard++ < 200) {
      if (s.slot!.pendingWin) applySlotCommand(s, { type: 'cash' }, createRng(500 + guard))
      else applySlotCommand(s, { type: 'pull' }, createRng(70 + guard))
    }
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
      if (s.phase === 'draft') continue // jackpot closed the slot; [7,7,7] by construction
      const o = s.slot!.outcome!
      const r = s.slot!.reels!
      if (o.kind === 'luck') expect(r).toEqual(['clover', 'clover', 'clover'])
      if (o.kind === 'chips') expect(r).toEqual(['cherry', 'cherry', 'cherry'])
      if (o.kind === 'bust') expect(r[0]).toBe('bust')
      if (o.kind === 'nothing') expect(r).not.toEqual(['clover', 'clover', 'clover'])
    }
  })
})
