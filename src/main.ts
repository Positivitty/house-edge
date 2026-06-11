import { createRng } from './sim/rng'
import { createInitialState } from './sim/state'
import { tick } from './sim/tick'
import { CONFIG } from './sim/config'
import { applyDraftCommand } from './sim/draft'
import { applySlotCommand } from './sim/slot'
import { createInput } from './input'
import { Renderer } from './render/renderer'
import type { DraftCommand, SlotCommand } from './sim/types'

async function main() {
  const params = new URLSearchParams(location.search)
  const seed = Number(params.get('seed')) || (Date.now() >>> 0)
  const rng = createRng(seed)
  const state = createInitialState(rng)
  const input = createInput()

  // draft one-shots: 1/2/3 pick a reel, 4/5/6 reroll it
  const draftQueue: DraftCommand[] = []
  const slotQueue: SlotCommand[] = []
  const DRAFT_KEYS: Record<string, DraftCommand> = {
    Digit1: { type: 'pick', reel: 0 }, Digit2: { type: 'pick', reel: 1 }, Digit3: { type: 'pick', reel: 2 },
    Digit4: { type: 'reroll', reel: 0 }, Digit5: { type: 'reroll', reel: 1 }, Digit6: { type: 'reroll', reel: 2 },
  }
  window.addEventListener('keydown', (e) => {
    if (state.phase === 'draft') {
      const cmd = DRAFT_KEYS[e.code]
      if (cmd) draftQueue.push({ ...cmd })
      return
    }
    if (state.phase === 'slot') {
      if (e.code === 'KeyE' || e.code === 'Escape') slotQueue.push({ type: 'exit' })
      else if (e.code === 'ArrowLeft') slotQueue.push({ type: 'stake', dir: -1 })
      else if (e.code === 'ArrowRight') slotQueue.push({ type: 'stake', dir: 1 })
      else if (e.code === 'Space')
        slotQueue.push({ type: state.slot?.pendingWin ? 'ride' : 'pull' })
      else if (e.code === 'Enter') slotQueue.push({ type: 'cash' })
      e.preventDefault()
      return
    }
    // combat
    if (e.code === 'KeyE') slotQueue.push({ type: 'enter' })
    if (e.code === 'KeyR' && (state.gameOver || state.victory)) location.reload()
  })

  const renderer = new Renderer()
  await renderer.init()
  console.log(`HOUSE EDGE — seed ${seed} (share with ?seed=${seed})`)

  const TICK_MS = 1000 / CONFIG.tickRate
  let acc = 0
  let last = performance.now()

  renderer.app.ticker.add(() => {
    while (slotQueue.length > 0) applySlotCommand(state, slotQueue.shift()!, rng)
    while (draftQueue.length > 0) applyDraftCommand(state, draftQueue.shift()!, rng)
    const now = performance.now()
    acc += Math.min(now - last, 250) // clamp huge tab-switch deltas
    last = now
    while (acc >= TICK_MS) {
      tick(state, input, rng)
      acc -= TICK_MS
    }
    renderer.draw(state)
  })
}

void main()
