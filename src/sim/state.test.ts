import { describe, it, expect } from 'vitest'
import { createInitialState } from './state'
import { createRng } from './rng'
import { CONFIG } from './config'

describe('createInitialState', () => {
  it('starts the player centered with config stats and no entities', () => {
    const s = createInitialState()
    expect(s.player.pos).toEqual({ x: CONFIG.world.w / 2, y: CONFIG.world.h / 2 })
    expect(s.player.hp).toBe(CONFIG.player.hp)
    expect(s.player.deathSavesLeft).toBe(CONFIG.player.deathSaves)
    expect(s.enemies).toEqual([])
    expect(s.projectiles).toEqual([])
    expect(s.chips).toBe(30)
    expect(s.gameOver).toBe(false)
    expect(s.tick).toBe(0)
  })

  it('initializes player weapon stats from config', () => {
    const s = createInitialState()
    expect(s.player.weapon).toEqual({
      damage: CONFIG.weapon.damage,
      cooldownTicks: CONFIG.weapon.cooldownTicks,
      critMultiplier: CONFIG.weapon.critMultiplier,
    })
  })

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

  it('machines never overlap across many seeds', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = createInitialState(createRng(seed))
      for (let i = 0; i < s.machines.length; i++)
        for (let j = i + 1; j < s.machines.length; j++) {
          const a = s.machines[i].pos
          const b = s.machines[j].pos
          expect(Math.hypot(a.x - b.x, a.y - b.y), `seed ${seed} machines ${i},${j}`).toBeGreaterThanOrEqual(160)
        }
    }
  })
})
