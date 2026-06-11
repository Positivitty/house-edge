import { describe, it, expect } from 'vitest'
import { tick } from './tick'
import { createInitialState } from './state'
import { createRng } from './rng'
import { applyDraftCommand } from './draft'
import { applySlotCommand } from './slot'
import type { InputState } from './types'

describe('determinism', () => {
  it('same seed + same inputs + same draft picks = identical state after 5000 ticks', () => {
    const run = () => {
      const layoutRng = createRng(555)
      const s = createInitialState(layoutRng)
      const rng = createRng(777)
      const inputRng = createRng(888) // scripted pseudo-random inputs
      for (let i = 0; i < 5000; i++) {
        if (s.phase === 'draft') {
          applyDraftCommand(s, { type: 'reroll', reel: 0 }, rng)
          applyDraftCommand(s, { type: 'pick', reel: i % 3 }, rng)
        } else if (s.phase === 'slot') {
          const step = i % 5
          if (step === 0) applySlotCommand(s, { type: 'stake', dir: 1 }, rng)
          else if (step < 3) applySlotCommand(s, { type: 'pull' }, rng)
          else if (s.slot?.pendingWin) applySlotCommand(s, { type: i % 2 ? 'ride' : 'cash' }, rng)
          else applySlotCommand(s, { type: 'exit' }, rng)
        } else if (i % 97 === 0) {
          applySlotCommand(s, { type: 'enter' }, rng) // no-op unless near a warm machine
        }
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
