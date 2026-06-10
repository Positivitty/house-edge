import { CONFIG } from './config'
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
