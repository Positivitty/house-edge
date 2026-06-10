import { createRng } from './sim/rng'
import { createInitialState } from './sim/state'
import { tick } from './sim/tick'
import { CONFIG } from './sim/config'
import { createInput } from './input'
import { Renderer } from './render/renderer'

async function main() {
  const params = new URLSearchParams(location.search)
  const seed = Number(params.get('seed')) || (Date.now() >>> 0)
  const rng = createRng(seed)
  const state = createInitialState()
  const input = createInput()

  const renderer = new Renderer()
  await renderer.init()
  console.log(`HOUSE EDGE — seed ${seed} (share with ?seed=${seed})`)

  const TICK_MS = 1000 / CONFIG.tickRate
  let acc = 0
  let last = performance.now()

  renderer.app.ticker.add(() => {
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
