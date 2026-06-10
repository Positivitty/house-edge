import { CONFIG } from './config'
import type { SimState } from './types'

export function createInitialState(): SimState {
  return {
    tick: 0,
    player: {
      pos: { x: CONFIG.arena.w / 2, y: CONFIG.arena.h / 2 },
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
    wave: 1,
    houseEdge: CONFIG.houseEdge.start,
    chips: 0,
    spawnTimer: CONFIG.enemy.spawnIntervalTicks,
    events: [],
    gameOver: false,
  }
}
