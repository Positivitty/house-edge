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

describe('tick: enemies', () => {
  it('spawns an enemy at the arena edge when the spawn timer elapses', () => {
    const s = createInitialState()
    const rng = createRng(2)
    for (let i = 0; i < CONFIG.enemy.spawnIntervalTicks; i++) tick(s, noInput, rng)
    expect(s.enemies.length).toBe(1)
    const e = s.enemies[0]
    const onEdge =
      e.pos.x === 0 || e.pos.x === CONFIG.arena.w || e.pos.y === 0 || e.pos.y === CONFIG.arena.h
    expect(onEdge).toBe(true)
  })

  it('enemies move toward the player', () => {
    const s = createInitialState()
    s.enemies.push({
      id: 99, pos: { x: 0, y: 0 }, hp: 20, speed: CONFIG.enemy.speed,
      radius: CONFIG.enemy.radius, touchDamage: CONFIG.enemy.touchDamage, alive: true,
    })
    const before = Math.hypot(s.player.pos.x - 0, s.player.pos.y - 0)
    tick(s, noInput, createRng(3))
    const e = s.enemies[0]
    const after = Math.hypot(s.player.pos.x - e.pos.x, s.player.pos.y - e.pos.y)
    expect(after).toBeLessThan(before)
  })
})

describe('tick: weapon', () => {
  function withEnemy(dx: number, dy: number) {
    const s = createInitialState()
    s.enemies.push({
      id: 50,
      pos: { x: s.player.pos.x + dx, y: s.player.pos.y + dy },
      hp: 1000, speed: 0, radius: CONFIG.enemy.radius, touchDamage: 0, alive: true,
    })
    return s
  }

  it('fires a projectile toward the nearest enemy when cooldown is ready', () => {
    const s = withEnemy(200, 0)
    tick(s, noInput, createRng(4))
    expect(s.projectiles.length).toBe(1)
    expect(s.projectiles[0].vel.x).toBeGreaterThan(0)
    expect(Math.abs(s.projectiles[0].vel.y)).toBeLessThan(1)
  })

  it('respects the fire cooldown', () => {
    const s = withEnemy(200, 0)
    const rng = createRng(4)
    tick(s, noInput, rng) // fires
    tick(s, noInput, rng) // cooling down
    expect(s.projectiles.length).toBe(1)
    for (let i = 0; i < CONFIG.weapon.cooldownTicks; i++) tick(s, noInput, rng)
    expect(s.projectiles.length).toBe(2)
  })

  it('does not fire with no enemies alive', () => {
    const s = createInitialState()
    tick(s, noInput, createRng(4))
    expect(s.projectiles.length).toBe(0)
  })

  it('projectiles move and expire after ttl', () => {
    const s = withEnemy(10_000, 0) // far away: projectile will never reach it
    s.spawnTimer = 100_000 // suppress ambient spawns
    const rng = createRng(4)
    tick(s, noInput, rng)
    const px0 = s.projectiles[0].pos.x
    s.player.fireCooldown = 10_000 // suppress refiring after first shot
    tick(s, noInput, rng)
    expect(s.projectiles[0].pos.x).toBeGreaterThan(px0)
    for (let i = 0; i < CONFIG.weapon.projectileTtl + 1; i++) tick(s, noInput, rng)
    expect(s.projectiles.length).toBe(0)
  })
})
