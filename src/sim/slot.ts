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
