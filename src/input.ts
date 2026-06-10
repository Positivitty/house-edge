import type { InputState } from './sim/types'

const KEYMAP: Record<string, keyof InputState> = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
}

export function createInput(): InputState {
  const input: InputState = { up: false, down: false, left: false, right: false }
  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code]
    if (k) { input[k] = true; e.preventDefault() }
  })
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code]
    if (k) input[k] = false
  })
  return input
}
