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
