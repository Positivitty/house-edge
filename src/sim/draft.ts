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
