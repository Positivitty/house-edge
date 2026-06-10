import { Application, Container, Graphics, Text } from 'pixi.js'
import { CONFIG } from '../sim/config'
import type { SimState } from '../sim/types'

// Neon-on-felt palette (spec: procedural casino look)
const COLORS = {
  felt: 0x0d2818,
  feltLine: 0x1a4a2e,
  player: 0xffd700, // gold chip
  enemy: 0xe43d5a, // hostile red
  projectile: 0x7df9ff, // electric blue card glint
  hud: 0xf4e9c9,
}

export class Renderer {
  readonly app: Application
  private world = new Container()
  private playerG = new Graphics()
  private enemiesG = new Graphics()
  private projectilesG = new Graphics()
  private hud!: Text
  private popups: { text: Text; ttl: number }[] = []
  // Events are emitted once per sim tick; draws happen once per frame (potentially
  // multiple frames per tick at 144 Hz, and zero new ticks once gameOver). Track
  // which tick we last consumed so each batch of events is processed exactly once.
  private lastConsumedTick = -1

  constructor() {
    this.app = new Application()
  }

  async init(): Promise<void> {
    await this.app.init({
      width: CONFIG.arena.w,
      height: CONFIG.arena.h,
      background: COLORS.felt,
      antialias: true,
    })
    document.body.appendChild(this.app.canvas)

    // felt table border
    const border = new Graphics()
      .rect(4, 4, CONFIG.arena.w - 8, CONFIG.arena.h - 8)
      .stroke({ width: 3, color: COLORS.feltLine })
    this.world.addChild(border, this.enemiesG, this.projectilesG, this.playerG)
    this.app.stage.addChild(this.world)

    this.hud = new Text({
      text: '',
      style: { fill: COLORS.hud, fontFamily: 'monospace', fontSize: 18 },
    })
    this.hud.position.set(12, 8)
    this.app.stage.addChild(this.hud)
  }

  draw(state: SimState): void {
    const p = state.player
    this.playerG
      .clear()
      .circle(p.pos.x, p.pos.y, p.radius)
      .fill(COLORS.player)
    this.playerG.alpha = p.iframes > 0 ? 0.5 : 1

    this.enemiesG.clear()
    for (const e of state.enemies) {
      this.enemiesG.circle(e.pos.x, e.pos.y, e.radius).fill(COLORS.enemy)
    }

    this.projectilesG.clear()
    for (const pr of state.projectiles) {
      this.projectilesG.circle(pr.pos.x, pr.pos.y, pr.radius).fill(COLORS.projectile)
    }

    this.hud.text =
      `HP ${p.hp}/${p.maxHp}   LUCK ${p.luck}   CHIPS ${state.chips}   ` +
      `SAVES ${p.deathSavesLeft}   WAVE ${state.wave}` +
      (state.gameOver ? '   — BUSTED. refresh to re-buy —' : '')

    this.drawPopups(state)
  }

  private drawPopups(state: SimState): void {
    // Events are per-tick; only consume them once per tick to avoid duplicate
    // popups on high-refresh displays or when the sim is frozen (gameOver).
    if (state.tick !== this.lastConsumedTick) {
      for (const ev of state.events) {
        if (ev.kind === 'roll') {
          const r = ev.result
          const label =
            r.event === 'deathSave'
              ? r.success ? 'LUCKY!' : 'BUST'
              : `${r.roll}/${r.chance}${r.success ? '' : ' miss'}`
          this.addPopup(label, ev.pos.x, ev.pos.y, r.success ? 0x9fff8a : 0xff6b6b,
            r.event === 'deathSave' ? 32 : 14)
        } else if (ev.kind === 'kill') {
          this.addPopup(`+${ev.chips}`, ev.pos.x, ev.pos.y - 16, 0xffd700, 16)
        }
      }
      this.lastConsumedTick = state.tick
    }
    // Popup ttl/fade runs every draw call so animations are frame-rate smooth.
    for (const pop of this.popups) {
      pop.ttl--
      pop.text.y -= 0.6
      pop.text.alpha = pop.ttl / 60
      if (pop.ttl <= 0) pop.text.destroy()
    }
    this.popups = this.popups.filter((p) => p.ttl > 0)
  }

  private addPopup(label: string, x: number, y: number, color: number, size: number): void {
    const text = new Text({
      text: label,
      style: { fill: color, fontFamily: 'monospace', fontSize: size, fontWeight: 'bold' },
    })
    text.position.set(x, y)
    text.anchor.set(0.5)
    this.app.stage.addChild(text)
    this.popups.push({ text, ttl: 60 })
  }
}
