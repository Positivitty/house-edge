import { Application, Container, Graphics, Text } from 'pixi.js'
import { CONFIG } from '../sim/config'
import { upgradeById } from '../content/upgrades'
import type { Rarity, SimState, SlotOutcome, SlotSymbol } from '../sim/types'
import { play } from './audio'

const SYMBOL_GLYPHS: Record<SlotSymbol, string> = {
  clover: '🍀', cherry: '🍒', seven: '7️⃣', bust: '💀', blank: '▫️',
}
const SPIN_FLICKER = ['🍀', '🍒', '7️⃣', '▫️']

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
  private heatLabel!: Text
  private hud!: Text
  private statusText!: Text
  private draftUI: Container | null = null
  private shownDraftVersion = -1
  private slotUI: Container | null = null
  private shownSlotVersion = -1
  private reelTexts: Text[] = []
  private reelRevealFrame = 0
  private lastSlotReels: SlotSymbol[] | null = null
  private lastSlotOutcome: SlotOutcome | null = null
  private popups: { text: Text; ttl: number }[] = []
  // Events are emitted once per sim tick; draws happen once per frame (potentially
  // multiple frames per tick at 144 Hz, and zero new ticks once gameOver). Track
  // which tick we last consumed so each batch of events is processed exactly once.
  private lastConsumedTick = -1
  private playedBusted = false
  // Impact effects
  private shake = 0
  private flash = 0
  private flashOverlayWhite!: Graphics
  private flashOverlayGold!: Graphics
  private flashIsGold = false
  private hitStopFrames = 0

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

    // Fullscreen damage flash overlays (stage-level, above world, behind HUD overlays)
    this.flashOverlayWhite = new Graphics()
      .rect(0, 0, CONFIG.screen.w, CONFIG.screen.h)
      .fill({ color: 0xffffff, alpha: 1 })
    this.flashOverlayWhite.alpha = 0
    this.flashOverlayWhite.eventMode = 'none'
    this.app.stage.addChild(this.flashOverlayWhite)

    this.flashOverlayGold = new Graphics()
      .rect(0, 0, CONFIG.screen.w, CONFIG.screen.h)
      .fill({ color: 0xffd700, alpha: 1 })
    this.flashOverlayGold.alpha = 0
    this.flashOverlayGold.eventMode = 'none'
    this.app.stage.addChild(this.flashOverlayGold)

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
    this.heatLabel = new Text({
      text: '',
      style: { fill: COLORS.hud, fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold' },
    })
    this.heatLabel.position.set(CONFIG.screen.w - 260 - 16 + 6, 13)
    this.app.stage.addChild(this.hud, this.statusText, this.heatG, this.heatLabel)
  }

  addShake(n: number): void {
    this.shake = Math.min(this.shake + n, 24)
  }

  consumeHitStop(): number {
    const frames = this.hitStopFrames
    this.hitStopFrames = 0
    return frames
  }

  draw(state: SimState): void {
    // Camera follows the player, clamped to world bounds
    let camX = Math.min(Math.max(state.player.pos.x - CONFIG.screen.w / 2, 0), CONFIG.world.w - CONFIG.screen.w)
    let camY = Math.min(Math.max(state.player.pos.y - CONFIG.screen.h / 2, 0), CONFIG.world.h - CONFIG.screen.h)
    if (this.shake > 0.1) {
      camX += (Math.random() - 0.5) * this.shake
      camY += (Math.random() - 0.5) * this.shake
      this.shake *= 0.88
    } else {
      this.shake = 0
    }
    this.world.position.set(-camX, -camY)

    // Flash overlay: apply to the active overlay and decay
    if (this.flashIsGold) {
      this.flashOverlayGold.alpha = this.flash
      this.flashOverlayWhite.alpha = 0
    } else {
      this.flashOverlayWhite.alpha = this.flash
      this.flashOverlayGold.alpha = 0
    }
    if (this.flash > 0.01) {
      this.flash *= 0.85
    } else {
      this.flash = 0
    }

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
      ? '— BUSTED. press R to re-buy —'
      : state.victory
        ? '🏆 YOU BEAT THE HOUSE (endless · R restarts)'
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
    this.heatLabel.text = `HEAT ${Math.round(state.heat)}`

    // Play busted sound once when gameOver first becomes true
    if (state.gameOver && !this.playedBusted) {
      play('busted')
      this.playedBusted = true
    } else if (!state.gameOver) {
      this.playedBusted = false
    }

    this.drawPopups(state)
    this.syncDraft(state)
    this.syncSlot(state)
  }

  private drawPopups(state: SimState): void {
    // Events are per-tick; only consume them once per tick to avoid duplicate
    // popups on high-refresh displays or when the sim is frozen (gameOver).
    if (state.tick !== this.lastConsumedTick) {
      for (const ev of state.events) {
        if (ev.kind === 'shot') {
          play('shot', 80)
        } else if (ev.kind === 'roll') {
          const r = ev.result
          const label =
            r.event === 'deathSave'
              ? r.success ? 'LUCKY!' : 'BUST'
              : `${r.roll}/${r.chance}${r.success ? '' : ' miss'}`
          this.addPopup(label, ev.pos.x, ev.pos.y, r.success ? 0x9fff8a : 0xff6b6b,
            r.event === 'deathSave' ? 32 : 14)
          if (r.event === 'hit' && r.success) play('hit')
          else if (r.event === 'crit' && r.success) { play('crit'); this.addShake(6) }
        } else if (ev.kind === 'kill') {
          this.addPopup(`+${ev.chips}`, ev.pos.x, ev.pos.y - 16, 0xffd700, 16)
          play('kill')
          play('chip')
          this.addShake(3)
          this.hitStopFrames = Math.max(this.hitStopFrames, 3)
        } else if (ev.kind === 'playerHit') {
          play('playerHit')
          this.addShake(8)
          this.flash = 0.35
          this.flashIsGold = false
        } else if (ev.kind === 'luckySave') {
          play('luckySave')
          this.addShake(14)
          this.flash = 0.6
          this.flashIsGold = true
        } else if (ev.kind === 'alarm') {
          this.addPopup('🚨 ALARM 🚨', state.player.pos.x, state.player.pos.y - 60, COLORS.heatHigh, 36)
          play('alarm')
          this.addShake(20)
        } else if (ev.kind === 'victory') {
          this.addPopup('🏆 BANK BROKEN', state.player.pos.x, state.player.pos.y - 60, COLORS.rarityJackpot, 36)
          play('victory')
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
    this.world.addChild(text)
    this.popups.push({ text, ttl: 60 })
  }

  // Draft overlay rebuilds only when the draft opens/changes, never per frame.
  private syncDraft(state: SimState): void {
    const want = state.phase === 'draft' && state.draft ? state.draft.version : -1
    if (want === this.shownDraftVersion && (want >= 0) === !!this.draftUI) return
    const prevShownVersion = this.shownDraftVersion
    this.shownDraftVersion = want
    if (this.draftUI) {
      this.draftUI.destroy({ children: true })
      this.draftUI = null
    }
    if (state.phase !== 'draft' || !state.draft) return

    // Play jackpot fanfare + open sound only on initial draft open (no-draft → draft).
    // On reroll rebuilds (version increments while already in draft), play reelTick instead.
    if (prevShownVersion === -1) {
      play('jackpot')
      play('draftOpen')
    } else {
      play('reelTick')
    }

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

  // Slot overlay rebuilds only when the session changes (version), never per frame.
  // Reel reveal is renderer-local presentation: the sim already resolved the outcome.
  private syncSlot(state: SimState): void {
    const want = state.phase === 'slot' && state.slot ? state.slot.version : -1
    if (want === this.shownSlotVersion && (want >= 0) === !!this.slotUI) {
      this.animateReels()
      return
    }
    this.shownSlotVersion = want
    const prevReels = this.lastSlotReels
    if (this.slotUI) {
      this.slotUI.destroy({ children: true })
      this.slotUI = null
      this.reelTexts = []
      this.lastSlotReels = null
    }
    if (state.phase !== 'slot' || !state.slot) {
      this.lastSlotOutcome = null
      return
    }

    const slot = state.slot
    const machine = state.machines.find((m) => m.id === slot.machineId)
    const ui = new Container()
    const cx = CONFIG.screen.w / 2

    ui.addChild(
      new Graphics().rect(0, 0, CONFIG.screen.w, CONFIG.screen.h).fill({ color: 0x000000, alpha: 0.78 }),
    )
    ui.addChild(
      new Graphics()
        .roundRect(cx - 260, 120, 520, 420, 18)
        .fill(0x12100a)
        .stroke({ width: 3, color: COLORS.machineWarm }),
    )

    const title = this.uiText('🎰 LUCKY DEVIL DELUXE', 24, COLORS.machineWarm)
    title.position.set(cx, 160)
    ui.addChild(title)

    this.reelTexts = [0, 1, 2].map((i) => {
      const t = this.uiText('▫️', 56, COLORS.hud)
      t.position.set(cx - 120 + i * 120, 260)
      ui.addChild(t)
      return t
    })
    this.lastSlotReels = slot.reels
    // only a fresh pull (new reels array) animates; stake/ride/cash rebuilds show instantly
    this.reelRevealFrame = slot.reels !== null && slot.reels === prevReels ? 999 : 0

    // Slot sounds keyed to what changed in this rebuild
    const freshPull = this.reelRevealFrame === 0 && slot.reels !== null
    if (freshPull) play('lever')
    const outcome = slot.outcome
    const freshOutcome = outcome !== this.lastSlotOutcome
    if (outcome && freshOutcome) {
      if (outcome.kind === 'luck' || outcome.kind === 'chips') play('win')
      else if (outcome.kind === 'bust') { play('bust'); this.addShake(10) }
      else if (outcome.kind === 'rideWin') play('rideDrum')
      else if (outcome.kind === 'rideLoss') play('bust', 60)
      // jackpot is unreachable here (slot closes, draft opens) — handled in syncDraft
    } else if (!outcome && this.lastSlotOutcome !== null && !freshPull) {
      // Invariant: slot outcome transitions non-null → null only on an explicit cash-out.
      // previous outcome was non-null and new outcome is null = genuine cash-out
      play('cash')
    }
    this.lastSlotOutcome = outcome

    const stake = CONFIG.slot.stakes[slot.stakeIndex]
    const stakeLine = this.uiText(
      `◄ STAKE ${stake} ►    pulls left ${machine?.spinsLeft ?? 0}    chips ${state.chips}`,
      16,
      COLORS.hud,
    )
    stakeLine.position.set(cx, 350)
    ui.addChild(stakeLine)

    const o = slot.outcome
    const resultText = !o
      ? 'SPACE to pull the lever'
      : o.kind === 'luck' ? `🍀 +${o.amount} LUCK on the line`
      : o.kind === 'chips' ? `🍒 +${o.amount} CHIPS on the line`
      : o.kind === 'rideWin' ? `🔥 RODE IT — ${o.amount} on the line`
      : o.kind === 'rideLoss' ? '💨 gone. the house thanks you'
      : o.kind === 'bust' ? `💀 BUST — the pit boss noticed (+${o.amount} HEAT)`
      : 'nothing. SPACE to go again'
    const result = this.uiText(
      resultText,
      18,
      o && (o.kind === 'bust' || o.kind === 'rideLoss') ? COLORS.heatHigh : COLORS.rarityJackpot,
    )
    result.position.set(cx, 410)
    ui.addChild(result)

    const help = slot.pendingWin
      ? this.uiText('SPACE ride it (double or nothing)  ·  ENTER cash out', 16, COLORS.hud)
      : this.uiText('SPACE pull  ·  ◄/► stake  ·  E/ESC stand up', 16, COLORS.hud)
    help.position.set(cx, 470)
    ui.addChild(help)

    const heat = this.uiText(`HEAT ${Math.round(state.heat)} — each pull cools the floor`, 14, COLORS.heatLow)
    heat.position.set(cx, 510)
    ui.addChild(heat)

    this.app.stage.addChild(ui)
    this.slotUI = ui
  }

  private animateReels(): void {
    if (!this.slotUI) return
    this.reelRevealFrame++
    if (!this.lastSlotReels) return // no pull yet: keep placeholders
    const isFlickering = this.lastSlotReels.some((_, i) => this.reelRevealFrame < (i + 1) * 18)
    if (isFlickering) play('reelTick', 60)
    this.lastSlotReels.forEach((sym, i) => {
      const t = this.reelTexts[i]
      if (!t) return
      const revealAt = (i + 1) * 18 // ~0.3s apart at 60fps
      const wasFlickering = (this.reelRevealFrame - 1) < revealAt
      const nowRevealed = this.reelRevealFrame >= revealAt
      if (wasFlickering && nowRevealed) play('reelLand')
      t.text = nowRevealed
        ? SYMBOL_GLYPHS[sym]
        : SPIN_FLICKER[(this.reelRevealFrame + i) % SPIN_FLICKER.length]
    })
  }
}
