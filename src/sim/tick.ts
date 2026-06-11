import { CONFIG } from './config'
import { resolve } from './resolve'
import type { Rng } from './rng'
import type { InputState, SimState } from './types'

const DT = 1 / CONFIG.tickRate
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function tick(state: SimState, input: InputState, rng: Rng): SimState {
  if (state.gameOver || state.phase !== 'combat') return state
  state.events.length = 0
  state.tick++

  movePlayer(state, input)
  updateHeatAndEdge(state)
  moveEnemies(state)
  spawnGuards(state, rng)
  fireWeapon(state)
  moveProjectiles(state)
  resolveProjectileHits(state, rng)
  resolveContactDamage(state, rng)
  checkAlarm(state)
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
    p.pos.x = clamp(p.pos.x + dx * p.speed * DT, p.radius, CONFIG.world.w - p.radius)
    p.pos.y = clamp(p.pos.y + dy * p.speed * DT, p.radius, CONFIG.world.h - p.radius)
  }
}

function updateHeatAndEdge(state: SimState): void {
  if (state.alarm) state.heat = 100
  else state.heat = Math.min(100, state.heat + CONFIG.heat.risePerTick)

  const minutes = state.tick / (CONFIG.tickRate * 60)
  state.houseEdge = CONFIG.houseEdge.start + minutes * CONFIG.houseEdge.perMinute
}

// Guards spawn on a ring just outside the view, only when the floor is hot.
function spawnGuards(state: SimState, rng: Rng): void {
  if (state.heat < CONFIG.heat.spawnThreshold) return
  if (state.enemies.length >= CONFIG.guards.maxOnScreen) return
  state.spawnTimer--
  if (state.spawnTimer > 0) return
  const t = state.heat / 100
  state.spawnTimer = Math.round(
    CONFIG.heat.maxSpawnIntervalTicks -
      t * (CONFIG.heat.maxSpawnIntervalTicks - CONFIG.heat.minSpawnIntervalTicks),
  )

  const minutes = state.tick / (CONFIG.tickRate * 60)
  const angle = rng.next() * Math.PI * 2
  const x = clamp(state.player.pos.x + Math.cos(angle) * CONFIG.guards.ringRadius, 0, CONFIG.world.w)
  const y = clamp(state.player.pos.y + Math.sin(angle) * CONFIG.guards.ringRadius, 0, CONFIG.world.h)

  state.enemies.push({
    id: state.nextId++,
    pos: { x, y },
    hp: Math.round(CONFIG.enemy.hp * (1 + CONFIG.guards.hpPerMinute * minutes)),
    speed: CONFIG.enemy.speed * Math.min(1 + CONFIG.guards.speedPerMinute * minutes, CONFIG.guards.speedCap),
    radius: CONFIG.enemy.radius,
    touchDamage: CONFIG.enemy.touchDamage + Math.floor(CONFIG.guards.touchPerMinute * minutes),
    alive: true,
  })
}

function moveEnemies(state: SimState): void {
  const retreating = !state.alarm && state.heat < CONFIG.heat.spawnThreshold
  for (const e of state.enemies) {
    if (!e.alive) continue
    const dx = state.player.pos.x - e.pos.x
    const dy = state.player.pos.y - e.pos.y
    const len = Math.hypot(dx, dy) || 1
    const dir = retreating ? -1 : 1
    e.pos.x = clamp(e.pos.x + dir * (dx / len) * e.speed * DT, 0, CONFIG.world.w)
    e.pos.y = clamp(e.pos.y + dir * (dy / len) * e.speed * DT, 0, CONFIG.world.h)
    // a retreating guard that reaches the wall slips into the back rooms
    if (
      retreating &&
      (e.pos.x === 0 || e.pos.x === CONFIG.world.w || e.pos.y === 0 || e.pos.y === CONFIG.world.h)
    )
      e.alive = false
  }
  state.enemies = state.enemies.filter((e) => e.alive)
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

function checkAlarm(state: SimState): void {
  // dying during the alarm is dying — you don't get the win posthumously
  if (state.gameOver) return
  if (!state.alarm) {
    if (state.player.luck < CONFIG.win.luckTarget) return
    state.alarm = true
    state.alarmTicksLeft = CONFIG.win.alarmTicks
    for (const m of state.machines) m.spinsLeft = 0 // the house cuts you off
    state.events.push({ kind: 'alarm' })
  }
  if (state.victory) return
  state.alarmTicksLeft--
  if (state.alarmTicksLeft <= 0) {
    state.victory = true
    state.events.push({ kind: 'victory' })
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
