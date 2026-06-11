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
  weapon: {
    damage: number
    cooldownTicks: number
    critMultiplier: number
  }
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

export type Phase = 'combat' | 'draft' | 'slot'

export type SlotSymbol = 'clover' | 'cherry' | 'seven' | 'bust' | 'blank'

export type SlotOutcomeKind =
  | 'luck' | 'chips' | 'jackpot' | 'bust' | 'nothing' | 'rideWin' | 'rideLoss'

export interface SlotOutcome {
  kind: SlotOutcomeKind
  amount: number
}

export interface SlotState {
  machineId: number
  stakeIndex: number // index into CONFIG.slot.stakes
  reels: SlotSymbol[] | null // last landed symbols (null before first pull)
  outcome: SlotOutcome | null
  pendingWin: { kind: 'luck' | 'chips'; amount: number } | null // ride-or-cash
  version: number // bumped on every change so the renderer rebuilds
}

export type SlotCommand =
  | { type: 'enter' }
  | { type: 'exit' }
  | { type: 'stake'; dir: -1 | 1 }
  | { type: 'pull' }
  | { type: 'ride' }
  | { type: 'cash' }

export type Rarity = 'common' | 'rare' | 'jackpot'

export interface ReelSlot {
  upgradeId: string
  rarity: Rarity
}

export interface DraftState {
  reels: ReelSlot[]
  rerollCost: number
  version: number // bumped on every reroll so the renderer knows to rebuild
}

export type DraftCommand = { type: 'pick' | 'reroll'; reel: number }

export interface Machine {
  id: number
  pos: Vec2
  spinsLeft: number // 0 = run cold, permanently
}

// Per-tick events for the render layer (popups, shake). Cleared each tick.
export type SimEvent =
  | { kind: 'roll'; result: RollResult; pos: Vec2 }
  | { kind: 'kill'; pos: Vec2; chips: number }
  | { kind: 'playerHit'; pos: Vec2 }
  | { kind: 'luckySave'; pos: Vec2 }
  | { kind: 'shot'; pos: Vec2 }
  | { kind: 'alarm' }
  | { kind: 'victory' }

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
  houseEdge: number
  chips: number
  spawnTimer: number // ticks until next enemy spawn
  events: SimEvent[]
  gameOver: boolean
  phase: Phase
  draft: DraftState | null
  slot: SlotState | null
  machines: Machine[]
  heat: number // 0..100
  alarm: boolean
  alarmTicksLeft: number
  victory: boolean
}
