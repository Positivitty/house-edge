import { CONFIG } from './config'
import { createRng } from './rng'
import type { Rng } from './rng'
import type { Machine, SimState } from './types'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Deterministic seeded layout: machine 1 guaranteed near spawn, the rest
// jittered across a grid so every run reads differently but reproducibly.
function layoutMachines(rng: Rng): Machine[] {
  const spins = CONFIG.machines.spinsPerMachine
  const ms: Machine[] = [
    { id: 1, pos: { x: CONFIG.world.w / 2 + 260, y: CONFIG.world.h / 2 }, spinsLeft: spins },
  ]
  const cols = 4
  const rows = 3
  let id = 2
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      if (ms.length >= CONFIG.machines.count) break
      let pos = { x: 0, y: 0 }
      for (let attempt = 0; attempt < 10; attempt++) {
        const x = ((cx + 0.5) / cols) * CONFIG.world.w + rng.int(-220, 220)
        const y = ((cy + 0.5) / rows) * CONFIG.world.h + rng.int(-220, 220)
        pos = { x: clamp(x, 100, CONFIG.world.w - 100), y: clamp(y, 100, CONFIG.world.h - 100) }
        const tooClose = ms.some((m) => Math.hypot(m.pos.x - pos.x, m.pos.y - pos.y) < 160)
        if (!tooClose) break
      }
      ms.push({
        id: id++,
        pos,
        spinsLeft: spins,
      })
    }
  }
  return ms
}

export function createInitialState(rng: Rng = createRng(1)): SimState {
  return {
    tick: 0,
    player: {
      pos: { x: CONFIG.world.w / 2, y: CONFIG.world.h / 2 },
      hp: CONFIG.player.hp,
      maxHp: CONFIG.player.hp,
      luck: CONFIG.player.luck,
      speed: CONFIG.player.speed,
      radius: CONFIG.player.radius,
      deathSavesLeft: CONFIG.player.deathSaves,
      iframes: 0,
      fireCooldown: 0,
      weapon: {
        damage: CONFIG.weapon.damage,
        cooldownTicks: CONFIG.weapon.cooldownTicks,
        critMultiplier: CONFIG.weapon.critMultiplier,
      },
    },
    enemies: [],
    projectiles: [],
    nextId: 1,
    houseEdge: CONFIG.houseEdge.start,
    chips: 30, // seed money — enough for ten spins at the first machine
    spawnTimer: CONFIG.heat.maxSpawnIntervalTicks,
    events: [],
    gameOver: false,
    phase: 'combat',
    draft: null,
    machines: layoutMachines(rng),
    heat: 0,
    alarm: false,
    alarmTicksLeft: 0,
    victory: false,
  }
}
