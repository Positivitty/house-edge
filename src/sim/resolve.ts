import type { Rng } from './rng'

export type RollEvent = 'hit' | 'crit' | 'deathSave' | 'loot' | 'reel'

export interface RollContext {
  event: RollEvent
  chance: number
}

export interface RollModifier {
  id: string
  apply(ctx: RollContext): RollContext
}

export interface RollResult {
  event: RollEvent
  roll: number
  chance: number
  success: boolean
}

// base: chance at luck 0 / edge 0. luckW & edgeW: percentage points per
// point of luck / house edge. Tuned via the statistical tests.
const TABLE: Record<RollEvent, { base: number; luckW: number; edgeW: number }> = {
  hit: { base: 70, luckW: 0.5, edgeW: 1.0 },
  crit: { base: 5, luckW: 0.4, edgeW: 0.2 },
  deathSave: { base: 40, luckW: 0.6, edgeW: 1.5 },
  loot: { base: 25, luckW: 0.6, edgeW: 0.5 },
  reel: { base: 30, luckW: 0.5, edgeW: 0.5 },
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function resolve(
  event: RollEvent,
  luck: number,
  houseEdge: number,
  rng: Rng,
  modifiers: RollModifier[] = [],
): RollResult {
  const spec = TABLE[event]
  let ctx: RollContext = {
    event,
    chance: spec.base + luck * spec.luckW - houseEdge * spec.edgeW,
  }
  for (const m of modifiers) ctx = m.apply(ctx)
  const chance = clamp(Math.round(ctx.chance), 5, 95)
  const roll = rng.int(1, 100)
  return { event, roll, chance, success: roll <= chance }
}
