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
  it('enemies move toward the player', () => {
    const s = createInitialState()
    s.heat = CONFIG.heat.spawnThreshold // above threshold so enemies chase, not retreat
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
    s.heat = CONFIG.heat.spawnThreshold // above threshold so enemies chase, not retreat
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
    // Enemy placed far enough (10 000 px) that no projectile reaches it during
    // the cooldown window, so both projectiles remain in flight for the assertion.
    const s = withEnemy(10_000, 0)
    s.spawnTimer = 100_000 // suppress ambient spawns
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

  it('firing emits a shot event', () => {
    const s = withEnemy(200, 0)
    tick(s, noInput, createRng(4))
    expect(s.events.some((e) => e.kind === 'shot')).toBe(true)
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

describe('tick: combat resolution', () => {
  function combatState(luck = 1000) {
    // luck 1000 clamps hit chance to 95 — kills are near-deterministic across seeds;
    // luck -1000 clamps to 5 for the miss case.
    const s = createInitialState()
    s.spawnTimer = 100_000
    s.player.luck = luck
    s.enemies.push({
      id: 60, pos: { x: s.player.pos.x + 30, y: s.player.pos.y }, hp: 10,
      speed: 0, radius: CONFIG.enemy.radius, touchDamage: 0, alive: true,
    })
    s.projectiles.push({
      id: 61, pos: { x: s.player.pos.x + 30, y: s.player.pos.y },
      vel: { x: 0, y: 0 }, damage: 10, radius: CONFIG.weapon.projectileRadius,
      ttl: 100, alive: true,
    })
    return s
  }

  it('successful hit roll damages and can kill; kill emits chips', () => {
    const s = combatState(1000)
    let guard = 0
    // guard of 50 also rides out the 30-tick fire cooldown between shots
    while (s.enemies.length > 0 && guard++ < 50) tick(s, noInput, createRng(guard))
    expect(s.enemies.length).toBe(0)
    expect(s.chips).toBeGreaterThanOrEqual(CONFIG.loot.chipsOnLoss)
  })

  it('hit rolls emit roll events for the render layer', () => {
    const s = combatState(1000)
    tick(s, noInput, createRng(8))
    const rollEvents = s.events.filter((e) => e.kind === 'roll')
    expect(rollEvents.length).toBeGreaterThan(0)
  })

  it('a missed hit roll leaves the enemy undamaged', () => {
    const s = combatState(-1000) // hit chance clamps to 5%
    const rng = createRng(11) // chosen so the first hit roll with this seed is > 5; bump seed if not
    tick(s, noInput, rng)
    expect(s.enemies[0].hp).toBe(10)
  })

  it('failed crit rolls emit no crit event (only the hit roll event)', () => {
    // success path: any crit event emitted must be a successful crit
    const s = combatState(1000)
    tick(s, noInput, createRng(8))
    const critRolls = s.events.filter((e) => e.kind === 'roll' && e.result.event === 'crit')
    for (const c of critRolls) {
      if (c.kind === 'roll') expect(c.result.success).toBe(true)
    }
    expect(critRolls.length).toBeGreaterThan(0) // seed 8 + luck 1000 does crit — keeps this non-vacuous

    // regression path: luck -1000 (hit clamps to 5%, crit to 5%) — across 30
    // seeds at least one hit lands, and every crit roll that fails must emit
    // nothing. With unconditional crit-event emission this WOULD find events.
    for (let seed = 100; seed < 130; seed++) {
      const sf = combatState(-1000)
      tick(sf, noInput, createRng(seed))
      const failedCrits = sf.events.filter(
        (e) => e.kind === 'roll' && e.result.event === 'crit' && !e.result.success,
      )
      expect(failedCrits.length).toBe(0)
    }
  })
})

describe('tick: contact damage and death saves', () => {
  function touchingEnemyState(playerHp: number, luck = 0) {
    const s = createInitialState()
    s.spawnTimer = 100_000
    s.player.hp = playerHp
    s.player.luck = luck
    s.enemies.push({
      id: 70, pos: { x: s.player.pos.x, y: s.player.pos.y }, hp: 1000,
      speed: 0, radius: CONFIG.enemy.radius,
      touchDamage: CONFIG.enemy.touchDamage, alive: true,
    })
    return s
  }

  it('touching enemy damages the player and grants iframes', () => {
    const s = touchingEnemyState(100)
    tick(s, noInput, createRng(20))
    expect(s.player.hp).toBe(100 - CONFIG.enemy.touchDamage)
    expect(s.player.iframes).toBe(CONFIG.player.iframeTicks)
  })

  it('iframes prevent repeat damage', () => {
    const s = touchingEnemyState(100)
    const rng = createRng(20)
    tick(s, noInput, rng)
    tick(s, noInput, rng)
    expect(s.player.hp).toBe(100 - CONFIG.enemy.touchDamage)
  })

  it('fatal damage with luck 1000 (95% save) survives at 1 hp and spends a death save', () => {
    const s = touchingEnemyState(5, 1000)
    tick(s, noInput, createRng(21)) // 95% save chance — if this seed rolls 96+, bump it and comment
    expect(s.gameOver).toBe(false)
    expect(s.player.hp).toBe(1)
    expect(s.player.deathSavesLeft).toBe(CONFIG.player.deathSaves - 1)
    expect(s.events.some((e) => e.kind === 'luckySave')).toBe(true)
  })

  it('fatal damage with no death saves left is game over', () => {
    const s = touchingEnemyState(5, 1000)
    s.player.deathSavesLeft = 0
    tick(s, noInput, createRng(21))
    expect(s.gameOver).toBe(true)
  })

  it('gameOver freezes the sim', () => {
    const s = touchingEnemyState(5, 1000)
    s.player.deathSavesLeft = 0
    const rng = createRng(21)
    tick(s, noInput, rng)
    const t = s.tick
    tick(s, noInput, rng)
    expect(s.tick).toBe(t)
  })
})

describe('tick: heat and guards', () => {
  it('heat rises on the open floor', () => {
    const s = createInitialState()
    const rng = createRng(40)
    for (let i = 0; i < 100; i++) tick(s, noInput, rng)
    expect(s.heat).toBeCloseTo(100 * CONFIG.heat.risePerTick, 1)
  })

  it('no guards spawn below the heat threshold', () => {
    const s = createInitialState()
    const rng = createRng(41)
    for (let i = 0; i < 150; i++) tick(s, noInput, rng) // heat reaches ~8.25 — below threshold 10
    expect(s.enemies.length).toBe(0)
  })

  it('hot floor spawns guards on a ring around the player, scaled by elapsed time', () => {
    const s = createInitialState()
    s.heat = 100
    s.tick = 3600 * 2 // pretend 2 minutes elapsed (scaling input)
    s.spawnTimer = 0 // force the timer to fire on the first eligible tick
    const rng = createRng(42)
    for (let i = 0; i < CONFIG.heat.minSpawnIntervalTicks + 2; i++) tick(s, noInput, rng)
    expect(s.enemies.length).toBeGreaterThanOrEqual(1)
    const e = s.enemies[0]
    const d = Math.hypot(e.pos.x - s.player.pos.x, e.pos.y - s.player.pos.y)
    expect(d).toBeLessThanOrEqual(CONFIG.guards.ringRadius + 1)
    expect(d).toBeGreaterThan(600) // player at world center: ring is never clamped
    expect(e.hp).toBeGreaterThan(CONFIG.enemy.hp) // time-scaled
  })

  it('guards retreat while heat is below the spawn threshold', () => {
    const s = createInitialState()
    s.heat = 0
    s.enemies.push({
      id: 90, pos: { x: s.player.pos.x + 200, y: s.player.pos.y }, hp: 1000,
      speed: CONFIG.enemy.speed, radius: CONFIG.enemy.radius, touchDamage: 0, alive: true,
    })
    tick(s, noInput, createRng(43))
    const e = s.enemies[0]
    const after = Math.hypot(e.pos.x - s.player.pos.x, e.pos.y - s.player.pos.y)
    expect(after).toBeGreaterThan(200)
  })

  it('house edge rises with elapsed time', () => {
    const s = createInitialState()
    // Give the player huge hp so guards spawning from heat can't kill them before tick 3600
    s.player.hp = 1_000_000
    s.player.maxHp = 1_000_000
    const rng = createRng(44)
    for (let i = 0; i < 3600; i++) tick(s, noInput, rng) // one minute
    expect(s.houseEdge).toBeCloseTo(CONFIG.houseEdge.perMinute, 0)
  })

  it('on-screen guards are capped', () => {
    const s = createInitialState()
    s.heat = 100
    s.spawnTimer = 0
    s.player.hp = 1_000_000
    s.player.maxHp = 1_000_000
    const rng = createRng(45)
    for (let i = 0; i < 5000; i++) tick(s, noInput, rng)
    expect(s.enemies.length).toBeLessThanOrEqual(CONFIG.guards.maxOnScreen)
  })
})

describe('tick: break the bank', () => {
  it('reaching the luck target trips the alarm: machines die, heat pins at 100', () => {
    const s = createInitialState()
    s.player.luck = CONFIG.win.luckTarget
    tick(s, noInput, createRng(50))
    expect(s.alarm).toBe(true)
    expect(s.alarmTicksLeft).toBe(CONFIG.win.alarmTicks - 1)
    expect(s.machines.every((m) => m.spinsLeft === 0)).toBe(true)
    expect(s.events.some((e) => e.kind === 'alarm')).toBe(true)
    tick(s, noInput, createRng(50))
    expect(s.heat).toBe(100)
  })

  it('surviving the alarm wins the run (and the sim keeps running for endless)', () => {
    const s = createInitialState()
    s.alarm = true
    s.alarmTicksLeft = 2
    const rng = createRng(51)
    tick(s, noInput, rng)
    tick(s, noInput, rng)
    expect(s.victory).toBe(true)
    expect(s.events.some((e) => e.kind === 'victory')).toBe(true)
    const t = s.tick
    tick(s, noInput, rng)
    expect(s.tick).toBe(t + 1) // endless: not frozen
  })

  it('dying during the alarm is still game over', () => {
    const s = createInitialState()
    s.alarm = true
    s.alarmTicksLeft = 10_000
    s.player.hp = 5
    s.player.deathSavesLeft = 0
    s.enemies.push({
      id: 91, pos: { ...s.player.pos }, hp: 1000, speed: 0,
      radius: CONFIG.enemy.radius, touchDamage: 10, alive: true,
    })
    tick(s, noInput, createRng(52))
    expect(s.gameOver).toBe(true)
  })
})
