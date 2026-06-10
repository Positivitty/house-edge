import type { RollResult } from './resolve'

export interface Vec2 {
  x: number
  y: number
}

export interface Player {
  pos: Vec2
  hp: number
  maxHp: number
  luck: number
  speed: number
  radius: number
  deathSavesLeft: number
  iframes: number // ticks of invulnerability remaining
  fireCooldown: number // ticks until next shot
}

export interface Enemy {
  id: number
  pos: Vec2
  hp: number
  speed: number
  radius: number
  touchDamage: number
  alive: boolean
}

export interface Projectile {
  id: number
  pos: Vec2
  vel: Vec2
  damage: number
  radius: number
  ttl: number // ticks to live
  alive: boolean
}

// Per-tick events for the render layer (popups, shake). Cleared each tick.
export type SimEvent =
  | { kind: 'roll'; result: RollResult; pos: Vec2 }
  | { kind: 'kill'; pos: Vec2; chips: number }
  | { kind: 'playerHit'; pos: Vec2 }
  | { kind: 'luckySave'; pos: Vec2 }

export interface InputState {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}

export interface SimState {
  tick: number
  player: Player
  enemies: Enemy[]
  projectiles: Projectile[]
  nextId: number
  wave: number
  houseEdge: number
  chips: number
  spawnTimer: number // ticks until next enemy spawn
  events: SimEvent[]
  gameOver: boolean
}
