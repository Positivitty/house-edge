import { CONFIG } from './config'
import { resolve } from './resolve'
import type { Rng } from './rng'
import type { InputState, SimState } from './types'

const DT = 1 / CONFIG.tickRate
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function tick(state: SimState, input: InputState, rng: Rng): SimState {
  if (state.gameOver) return state
  state.events.length = 0
  state.tick++

  movePlayer(state, input)
  moveEnemies(state)
  spawnEnemies(state, rng)
  fireWeapon(state)
  moveProjectiles(state)
  resolveProjectileHits(state, rng)
  resolveContactDamage(state, rng)
  return state
}

function movePlayer(state: SimState, input: InputState): void {
  const p = state.player
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0)
  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy)
    dx /= len
    dy /= len
    p.pos.x = clamp(p.pos.x + dx * p.speed * DT, p.radius, CONFIG.arena.w - p.radius)
    p.pos.y = clamp(p.pos.y + dy * p.speed * DT, p.radius, CONFIG.arena.h - p.radius)
  }
}

function spawnEnemies(state: SimState, rng: Rng): void {
  state.spawnTimer--
  if (state.spawnTimer > 0) return
  state.spawnTimer = CONFIG.enemy.spawnIntervalTicks

  // pick a random point on a random arena edge
  const side = rng.int(0, 3)
  const x = side === 0 ? 0 : side === 1 ? CONFIG.arena.w : rng.int(0, CONFIG.arena.w)
  const y = side === 2 ? 0 : side === 3 ? CONFIG.arena.h : rng.int(0, CONFIG.arena.h)

  state.enemies.push({
    id: state.nextId++,
    pos: { x, y },
    hp: CONFIG.enemy.hp,
    speed: CONFIG.enemy.speed,
    radius: CONFIG.enemy.radius,
    touchDamage: CONFIG.enemy.touchDamage,
    alive: true,
  })
}

function moveEnemies(state: SimState): void {
  for (const e of state.enemies) {
    if (!e.alive) continue
    const dx = state.player.pos.x - e.pos.x
    const dy = state.player.pos.y - e.pos.y
    const len = Math.hypot(dx, dy) || 1
    e.pos.x += (dx / len) * e.speed * DT
    e.pos.y += (dy / len) * e.speed * DT
  }
}

function fireWeapon(state: SimState): void {
  const p = state.player
  if (p.fireCooldown > 0) {
    p.fireCooldown--
    return
  }
  let nearest = null as SimState['enemies'][number] | null
  let nearestDist = Infinity
  for (const e of state.enemies) {
    if (!e.alive) continue
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y)
    if (d < nearestDist) {
      nearest = e
      nearestDist = d
    }
  }
  if (!nearest || nearestDist === 0) return

  const dx = (nearest.pos.x - p.pos.x) / nearestDist
  const dy = (nearest.pos.y - p.pos.y) / nearestDist
  state.projectiles.push({
    id: state.nextId++,
    pos: { x: p.pos.x, y: p.pos.y },
    vel: { x: dx * CONFIG.weapon.projectileSpeed, y: dy * CONFIG.weapon.projectileSpeed },
    damage: p.weapon.damage,
    radius: CONFIG.weapon.projectileRadius,
    ttl: CONFIG.weapon.projectileTtl,
    alive: true,
  })
  p.fireCooldown = p.weapon.cooldownTicks
}

function moveProjectiles(state: SimState): void {
  for (const pr of state.projectiles) {
    pr.pos.x += pr.vel.x * DT
    pr.pos.y += pr.vel.y * DT
    pr.ttl--
    if (pr.ttl <= 0) pr.alive = false
  }
  state.projectiles = state.projectiles.filter((pr) => pr.alive)
}

function resolveContactDamage(state: SimState, rng: Rng): void {
  const p = state.player
  if (p.iframes > 0) {
    p.iframes--
    return
  }
  for (const e of state.enemies) {
    if (!e.alive) continue
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y)
    if (d > e.radius + p.radius) continue

    state.events.push({ kind: 'playerHit', pos: { ...p.pos } })

    if (p.hp - e.touchDamage <= 0) {
      // death save: the most dramatic roll in the game
      if (p.deathSavesLeft > 0) {
        const save = resolve('deathSave', p.luck, state.houseEdge, rng)
        state.events.push({ kind: 'roll', result: save, pos: { ...p.pos } })
        if (save.success) {
          p.hp = 1
          p.deathSavesLeft--
          p.iframes = CONFIG.player.iframeTicks
          state.events.push({ kind: 'luckySave', pos: { ...p.pos } })
          return
        }
      }
      p.hp = 0
      state.gameOver = true
      return
    }

    p.hp -= e.touchDamage
    p.iframes = CONFIG.player.iframeTicks
    return // one contact hit per tick is plenty
  }
}

function resolveProjectileHits(state: SimState, rng: Rng): void {
  const luck = state.player.luck
  for (const pr of state.projectiles) {
    if (!pr.alive) continue
    for (const e of state.enemies) {
      if (!e.alive) continue
      const d = Math.hypot(e.pos.x - pr.pos.x, e.pos.y - pr.pos.y)
      if (d > e.radius + pr.radius) continue

      pr.alive = false
      const hit = resolve('hit', luck, state.houseEdge, rng)
      state.events.push({ kind: 'roll', result: hit, pos: { ...e.pos } })
      if (!hit.success) break // whiffed — projectile spent, enemy untouched

      let damage = pr.damage
      const crit = resolve('crit', luck, state.houseEdge, rng)
      if (crit.success) {
        damage *= state.player.weapon.critMultiplier
        state.events.push({ kind: 'roll', result: crit, pos: { ...e.pos } })
      }
      e.hp -= damage

      if (e.hp <= 0) {
        e.alive = false
        const loot = resolve('loot', luck, state.houseEdge, rng)
        const chips = loot.success ? CONFIG.loot.chipsOnWin : CONFIG.loot.chipsOnLoss
        state.chips += chips
        state.events.push({ kind: 'roll', result: loot, pos: { ...e.pos } })
        state.events.push({ kind: 'kill', pos: { ...e.pos }, chips })
      }
      break
    }
  }
  state.projectiles = state.projectiles.filter((pr) => pr.alive)
  state.enemies = state.enemies.filter((e) => e.alive)
}
