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
