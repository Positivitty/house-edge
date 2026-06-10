import { describe, it, expect } from 'vitest'
import { createInitialState } from './state'
import { CONFIG } from './config'

describe('createInitialState', () => {
  it('starts the player centered with config stats and no entities', () => {
    const s = createInitialState()
    expect(s.player.pos).toEqual({ x: CONFIG.arena.w / 2, y: CONFIG.arena.h / 2 })
    expect(s.player.hp).toBe(CONFIG.player.hp)
    expect(s.player.deathSavesLeft).toBe(CONFIG.player.deathSaves)
    expect(s.enemies).toEqual([])
    expect(s.projectiles).toEqual([])
    expect(s.chips).toBe(0)
    expect(s.gameOver).toBe(false)
    expect(s.tick).toBe(0)
  })
})
