import { describe, it, expect } from 'vitest'
import { resolve, type RollModifier } from './resolve'
import { createRng } from './rng'

function successRate(
  event: Parameters<typeof resolve>[0],
  luck: number,
  houseEdge: number,
  trials = 10_000,
): number {
  const rng = createRng(424242)
  let wins = 0
  for (let i = 0; i < trials; i++) {
    if (resolve(event, luck, houseEdge, rng).success) wins++
  }
  return wins / trials
}

describe('resolve', () => {
  it('returns roll, chance, and success consistent with each other', () => {
    const rng = createRng(1)
    const r = resolve('hit', 10, 0, rng)
    expect(r.event).toBe('hit')
    expect(r.roll).toBeGreaterThanOrEqual(1)
    expect(r.roll).toBeLessThanOrEqual(100)
    expect(r.success).toBe(r.roll <= r.chance)
  })

  it('statistical: base hit chance at luck 0, edge 0 is ~70%', () => {
    const rate = successRate('hit', 0, 0)
    expect(rate).toBeGreaterThan(0.66)
    expect(rate).toBeLessThan(0.74)
  })

  it('more luck means more success; more house edge means less', () => {
    expect(successRate('hit', 40, 0)).toBeGreaterThan(successRate('hit', 0, 0))
    expect(successRate('hit', 0, 20)).toBeLessThan(successRate('hit', 0, 0))
  })

  it('statistical: death save at luck 80, edge 12 lands in the 65-75% band', () => {
    const rate = successRate('deathSave', 80, 12)
    expect(rate).toBeGreaterThan(0.62)
    expect(rate).toBeLessThan(0.78)
  })

  it('chance is clamped to [5, 95] — never impossible, never guaranteed', () => {
    const rng = createRng(3)
    expect(resolve('hit', 1000, 0, rng).chance).toBe(95)
    expect(resolve('hit', 0, 1000, rng).chance).toBe(5)
  })

  it('modifiers transform the chance before the roll', () => {
    const plus20: RollModifier = {
      id: 'test-plus-20',
      apply: (ctx) => ({ ...ctx, chance: ctx.chance + 20 }),
    }
    const rng = createRng(5)
    const base = resolve('crit', 0, 0, createRng(5))
    const boosted = resolve('crit', 0, 0, rng, [plus20])
    expect(boosted.chance).toBe(base.chance + 20)
  })

  it('modifiers run before the clamp — pushing past 95 still clamps to 95', () => {
    const push: RollModifier = {
      id: 'test-push-past-ceiling',
      apply: (ctx) => ({ ...ctx, chance: ctx.chance + 30 }),
    }
    const r = resolve('hit', 0, 0, createRng(1), [push])
    expect(r.chance).toBe(95)
  })

  it('multiple modifiers compose in order', () => {
    const double: RollModifier = { id: 'double', apply: (ctx) => ({ ...ctx, chance: ctx.chance * 2 }) }
    const minusTen: RollModifier = { id: 'minus-ten', apply: (ctx) => ({ ...ctx, chance: ctx.chance - 10 }) }
    // crit base 5: (5*2)-10 = 0 → clamps to 5 ; reversed order would be (5-10)*2 = -10 → also clamps... so use loot base 25:
    // (25*2)-10 = 40 ; reversed (25-10)*2 = 30 — distinguishable
    const r = resolve('loot', 0, 0, createRng(1), [double, minusTen])
    expect(r.chance).toBe(40)
  })
})
