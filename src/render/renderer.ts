import { Application, Container, Graphics, Text } from 'pixi.js'
import { CONFIG } from '../sim/config'
import { upgradeById } from '../content/upgrades'
import type { Rarity, SimState } from '../sim/types'

// Neon-on-felt palette (spec: procedural casino look)
const COLORS = {
  felt: 0x0d2818,
  feltLine: 0x1a4a2e,
  player: 0xffd700, // gold chip
  enemy: 0xe43d5a, // hostile red
  projectile: 0x7df9ff, // electric blue card glint
  hud: 0xf4e9c9,
  machineWarm: 0xffd700,
  machineCold: 0x4a4a4a,
  heatLow: 0x6fdc6f,
  heatHigh: 0xff4040,
  rarityCommon: 0xf4e9c9,
  rarityRare: 0x7df9ff,
  rarityJackpot: 0xffd700,
}

export class Renderer {
  readonly app: Application
  private world = new Container()
  private playerG = new Graphics()
  private enemiesG = new Graphics()
  private projectilesG = new Graphics()
  private machinesG = new Graphics()
  private floorG = new Graphics()
  private heatG = new Graphics()
  private hud!: Text
  private statusText!: Text
  private draftUI: Container | null = null
  private shownDraftVersion = -1
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
      width: CONFIG.screen.w,
      height: CONFIG.screen.h,
      background: COLORS.felt,
      antialias: true,
    })
    document.body.appendChild(this.app.canvas)

    // Draw a subtle floor grid into floorG so camera motion is visible
    for (let x = 320; x < CONFIG.world.w; x += 320)
      this.floorG.moveTo(x, 0).lineTo(x, CONFIG.world.h)
    for (let y = 320; y < CONFIG.world.h; y += 320)
      this.floorG.moveTo(0, y).lineTo(CONFIG.world.w, y)
    this.floorG.stroke({ width: 1, color: COLORS.feltLine, alpha: 0.5 })

    // felt table border — world border
    const border = new Graphics()
      .rect(4, 4, CONFIG.world.w - 8, CONFIG.world.h - 8)
      .stroke({ width: 3, color: COLORS.feltLine })

    // World layering: floor grid, border, machines, enemies, projectiles, player
    this.world.addChild(this.floorG, border, this.machinesG, this.enemiesG, this.projectilesG, this.playerG)
    this.app.stage.addChild(this.world)

    this.hud = new Text({
      text: '',
      style: { fill: COLORS.hud, fontFamily: 'monospace', fontSize: 18 },
    })
    this.hud.position.set(12, 8)

    // Status line + heat bar on the STAGE (screen space)
    this.statusText = new Text({
      text: '',
      style: { fill: COLORS.hud, fontFamily: 'monospace', fontSize: 16, fontWeight: 'bold' },
    })
    this.statusText.position.set(12, 34)
    this.app.stage.addChild(this.hud, this.statusText, this.heatG)
  }

  draw(state: SimState): void {
    // Camera follows the player, clamped to world bounds
    const camX = Math.min(Math.max(state.player.pos.x - CONFIG.screen.w / 2, 0), CONFIG.world.w - CONFIG.screen.w)
    const camY = Math.min(Math.max(state.player.pos.y - CONFIG.screen.h / 2, 0), CONFIG.world.h - CONFIG.screen.h)
    this.world.position.set(-camX, -camY)

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

    // Machines
    this.machinesG.clear()
    for (const m of state.machines) {
      const warm = m.spinsLeft > 0
      this.machinesG
        .roundRect(m.pos.x - 18, m.pos.y - 22, 36, 44, 6)
        .fill(warm ? COLORS.machineWarm : COLORS.machineCold)
    }

    this.hud.text =
      `HP ${p.hp}/${p.maxHp}   LUCK ${p.luck}/${CONFIG.win.luckTarget}   ` +
      `CHIPS ${state.chips}   SAVES ${p.deathSavesLeft}`

    // Status line
    const alarmSecs = Math.ceil(state.alarmTicksLeft / CONFIG.tickRate)
    this.statusText.text = state.gameOver
      ? '— BUSTED. refresh to re-buy —'
      : state.victory
        ? '🏆 YOU BEAT THE HOUSE (endless mode)'
        : state.alarm
          ? `🚨 ALARM — SURVIVE ${alarmSecs}s`
          : 'HUNTED — find a machine (E to play)'

    // Heat bar (screen space)
    this.heatG.clear()
    const hw = 260
    this.heatG.rect(CONFIG.screen.w - hw - 16, 14, hw, 14).fill({ color: 0x000000, alpha: 0.5 })
    this.heatG
      .rect(CONFIG.screen.w - hw - 16, 14, (hw * state.heat) / 100, 14)
      .fill(state.heat > 60 ? COLORS.heatHigh : COLORS.heatLow)

    this.drawPopups(state)
    this.syncDraft(state)
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
        } else if (ev.kind === 'alarm') {
          this.addPopup('🚨 ALARM 🚨', state.player.pos.x, state.player.pos.y - 60, COLORS.heatHigh, 36)
        } else if (ev.kind === 'victory') {
          this.addPopup('🏆 BANK BROKEN', state.player.pos.x, state.player.pos.y - 60, COLORS.rarityJackpot, 36)
        }
        // 'playerHit' and 'luckySave' events are intentionally not rendered here —
        // deferred to the juice pass in a later milestone; the deathSave 'roll' event
        // already produces the LUCKY!/BUST popup above.
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
    this.world.addChild(text)
    this.popups.push({ text, ttl: 60 })
  }

  // Draft overlay rebuilds only when the draft opens/changes, never per frame.
  private syncDraft(state: SimState): void {
    const want = state.phase === 'draft' && state.draft ? state.draft.version : -1
    if (want === this.shownDraftVersion && (want >= 0) === !!this.draftUI) return
    this.shownDraftVersion = want
    if (this.draftUI) {
      this.draftUI.destroy({ children: true })
      this.draftUI = null
    }
    if (state.phase !== 'draft' || !state.draft) return

    const ui = new Container()
    ui.addChild(
      new Graphics().rect(0, 0, CONFIG.screen.w, CONFIG.screen.h).fill({ color: 0x000000, alpha: 0.72 }),
    )
    const cx = CONFIG.screen.w / 2
    const title = this.uiText('🎰 THE MACHINE PAYS OUT', 28, COLORS.rarityJackpot)
    title.position.set(cx, 150)
    ui.addChild(title)

    state.draft.reels.forEach((reel, i) => {
      const up = upgradeById(reel.upgradeId)
      const line = this.uiText(
        `[${i + 1}]  ${up.name} — ${up.desc}  (${reel.rarity.toUpperCase()})`,
        20,
        this.rarityColor(reel.rarity),
      )
      line.position.set(cx, 250 + i * 60)
      ui.addChild(line)
    })

    const help = this.uiText(
      `1/2/3 take an upgrade  ·  4/5/6 reroll that reel (${state.draft.rerollCost} chips — you have ${state.chips})`,
      16,
      COLORS.hud,
    )
    help.position.set(cx, 470)
    ui.addChild(help)

    this.app.stage.addChild(ui)
    this.draftUI = ui
  }

  private rarityColor(r: Rarity): number {
    return r === 'jackpot' ? COLORS.rarityJackpot : r === 'rare' ? COLORS.rarityRare : COLORS.rarityCommon
  }

  private uiText(label: string, size: number, color: number): Text {
    const t = new Text({
      text: label,
      style: { fill: color, fontFamily: 'monospace', fontSize: size, fontWeight: 'bold' },
    })
    t.anchor.set(0.5)
    return t
  }
}
