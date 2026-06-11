import { CONFIG } from './config'
import { resolve } from './resolve'
import { openDraft } from './draft'
import type { Rng } from './rng'
import type { SimState, SlotCommand, SlotOutcome, SlotSymbol } from './types'

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
