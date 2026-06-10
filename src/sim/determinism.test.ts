import { describe, it, expect } from 'vitest'
import { tick } from './tick'
import { createInitialState } from './state'
import { createRng } from './rng'
import type { InputState } from './types'

describe('determinism', () => {
  it('same seed + same inputs = identical state after 1000 ticks', () => {
    const run = () => {
      const s = createInitialState()
      const rng = createRng(777)
      const inputRng = createRng(888) // scripted pseudo-random inputs
      for (let i = 0; i < 1000; i++) {
        const input: InputState = {
          up: inputRng.next() < 0.3,
          down: inputRng.next() < 0.3,
          left: inputRng.next() < 0.3,
          right: inputRng.next() < 0.3,
        }
        tick(s, input, rng)
      }
      return s
    }
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
  })
})
