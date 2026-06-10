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
