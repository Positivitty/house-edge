import { describe, it, expect } from 'vitest'
import { tick } from './tick'
import { createInitialState } from './state'
import { createRng } from './rng'
import { CONFIG } from './config'
import type { InputState } from './types'

export const noInput: InputState = { up: false, down: false, left: false, right: false }

describe('tick: player movement', () => {
  it('moves the player right at config speed', () => {
    const s = createInitialState()
    const x0 = s.player.pos.x
    tick(s, { ...noInput, right: true }, createRng(1))
    expect(s.player.pos.x).toBeCloseTo(x0 + CONFIG.player.speed / CONFIG.tickRate)
    expect(s.tick).toBe(1)
  })

  it('normalizes diagonal movement (no speed boost)', () => {
    const s = createInitialState()
    const { x: x0, y: y0 } = s.player.pos
    tick(s, { ...noInput, right: true, down: true }, createRng(1))
    const dx = s.player.pos.x - x0
    const dy = s.player.pos.y - y0
    const dist = Math.hypot(dx, dy)
    expect(dist).toBeCloseTo(CONFIG.player.speed / CONFIG.tickRate)
  })

  it('clamps the player inside the arena', () => {
    const s = createInitialState()
    s.player.pos.x = CONFIG.player.radius + 1
    for (let i = 0; i < 60; i++) tick(s, { ...noInput, left: true }, createRng(1))
    expect(s.player.pos.x).toBe(CONFIG.player.radius)
  })

  it('clears events from the previous tick', () => {
    const s = createInitialState()
    s.events.push({ kind: 'playerHit', pos: { x: 0, y: 0 } })
    tick(s, noInput, createRng(1))
    expect(s.events).toEqual([])
  })
})
