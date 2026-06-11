// All sound in the game. Renderer-side only — the sim never knows audio exists.
// Param arrays are STARTING POINTS — tune by ear in the dev server.
import { zzfx } from 'zzfx'

const SFX = {
  shot: [0.3, , 90, , 0.01, 0.03, 4, 1.2, , , , , , , , , , 0.6, 0.01],
  hit: [0.4, , 224, 0.01, 0.02, 0.08, 1, 1.7, -13.9, , , , , , , 0.1, , 0.7, 0.05],
  crit: [0.6, , 471, , 0.09, 0.29, 1, 1.8, , 0.3, , , , 1.2, , 0.3, 0.13, 0.9, 0.06],
  kill: [0.5, , 129, 0.01, 0.06, 0.26, 4, 1.9, , , , , , 0.6, , 0.3, , 0.7, 0.07],
  chip: [0.25, , 1306, , 0.01, 0.06, 1, 2.5, , , 566, 0.04, , , , , , 0.5, 0.01],
  playerHit: [0.6, , 130, 0.01, 0.08, 0.2, 3, 2.3, -0.5, , , , , 1.4, , 0.4, , 0.6, 0.09],
  luckySave: [0.7, , 392, 0.05, 0.25, 0.4, 1, 1.5, , , 200, 0.08, 0.1, , , , , 0.8, 0.2],
  reelTick: [0.2, , 900, , 0.01, 0.02, 1, 3, , , , , , , , , , 0.4, 0.01],
  reelLand: [0.35, , 300, , 0.02, 0.08, 1, 1.6, , , , , , , , , , 0.6, 0.03],
  lever: [0.4, , 150, 0.02, 0.05, 0.12, 4, 0.8, , , , , , , , , , 0.6, 0.05],
  win: [0.5, , 523, 0.04, 0.18, 0.3, 1, 1.3, , , 130, 0.06, 0.08, , , , , 0.8, 0.15],
  jackpot: [0.7, , 392, 0.05, 0.3, 0.5, 1, 1.2, , , 196, 0.1, 0.15, , , 0.2, , 0.9, 0.3],
  bust: [0.6, , 80, 0.02, 0.15, 0.35, 3, 2.8, -2, , , , , 1.8, , 0.5, , 0.7, 0.15],
  rideDrum: [0.4, , 200, 0.02, 0.1, 0.15, 2, 1.5, , , , , 0.1, , , 0.2, , 0.6, 0.08],
  cash: [0.45, , 1046, , 0.04, 0.18, 1, 1.8, , , 262, 0.05, , , , , , 0.7, 0.06],
  alarm: [0.8, , 400, 0.1, 0.4, 0.6, 2, 0.5, , , 100, 0.2, 0.3, , , 0.3, , 0.9, 0.4],
  victory: [0.7, , 523, 0.08, 0.4, 0.7, 1, 1.1, , , 261, 0.15, 0.2, , , , , 0.9, 0.5],
  draftOpen: [0.4, , 660, 0.03, 0.12, 0.25, 1, 1.4, , , 220, 0.07, , , , , , 0.7, 0.1],
  busted: [0.7, , 110, 0.05, 0.3, 0.8, 3, 1.2, -1, , , , , 2, , 0.5, 0.2, 0.6, 0.4],
} as const

export type SfxName = keyof typeof SFX

let unlocked = false
let muted = false
const lastPlayed = new Map<SfxName, number>()

// browsers require a user gesture before audio — call this from any input handler
export function unlockAudio(): void {
  unlocked = true
}

export function toggleMute(): boolean {
  muted = !muted
  return muted
}

export function play(name: SfxName, throttleMs = 30): void {
  if (!unlocked || muted) return
  const now = performance.now()
  const last = lastPlayed.get(name) ?? 0
  if (now - last < throttleMs) return // density protection: 60 kills/sec ≠ 60 overlapping sfx
  lastPlayed.set(name, now)
  zzfx(...(SFX[name] as readonly (number | undefined)[]))
}
