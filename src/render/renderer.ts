import { Application, Container, Graphics, Text } from 'pixi.js'
import { CONFIG } from '../sim/config'
import { upgradeById } from '../content/upgrades'
import type { Rarity, SimState, SlotOutcome, SlotSymbol, Vec2 } from '../sim/types'
import { play } from './audio'

const SYMBOL_GLYPHS: Record<SlotSymbol, string> = {
  clover: '🍀', cherry: '🍒', seven: '7️⃣', bust: '💀', blank: '▫️',
}
const SPIN_FLICKER = ['🍀', '🍒', '7️⃣', '▫️']
const SCREEN_COLORS = [0xff9900, 0xffcc00, 0xff6600, 0xffaa33]

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
  private fxLayer = new Container()
  private reelTexts: Text[] = []
  private reelRevealFrame = 0
  private nearMissApplied = false
  private lastSlotReels: SlotSymbol[] | null = null
  private lastSlotOutcome: SlotOutcome | null = null
  // Lever animation: leverFrame counts up on fresh pull, resets after spring-back
  private leverFrame = 0
  private leverGraphics: Graphics | null = null
  // Result text pulse: pulseFrame counts when a win result is shown
  private resultText: Text | null = null
  private resultPulseFrame = 0
  private popups: { text: Text; ttl: number }[] = []
  // Events are emitted once per sim tick; draws happen once per frame (potentially
  // multiple frames per tick at 144 Hz, and zero new ticks once gameOver). Track
  // which tick we last consumed so each batch of events is processed exactly once.
  private lastConsumedTick = -1
  private playedBusted = false
  private lastPlayerPos: { x: number; y: number } = { x: -1, y: -1 }
  // Impact effects
  private shake = 0
  private flash = 0
  private flashOverlayWhite!: Graphics
  private flashOverlayGold!: Graphics
  private flashIsGold = false
  private hitStopFrames = 0
  // Particle system
  private particles: { g: Graphics; vx: number; vy: number; ttl: number; maxTtl: number; kind: 'chip' | 'spark'; homing?: boolean }[] = []

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

    // fxLayer sits above slotUI; re-parented to top of stage whenever syncSlot recreates slotUI
    this.app.stage.addChild(this.fxLayer)

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
    // Detect movement for chip-player tilt wobble
    const playerMoving =
      p.pos.x !== this.lastPlayerPos.x || p.pos.y !== this.lastPlayerPos.y
    this.lastPlayerPos.x = p.pos.x
    this.lastPlayerPos.y = p.pos.y

    // Position playerG at player world coords so local draws are centred at (0,0)
    // This lets us rotate playerG around the player centre cleanly.
    this.playerG.position.set(p.pos.x, p.pos.y)
    this.playerG.rotation = playerMoving
      ? Math.sin(state.tick * 0.2) * 0.06
      : 0
    const pr = p.radius
    // Casino chip: gold outer circle, inner ring, 4 edge notches
    this.playerG
      .clear()
      .circle(0, 0, pr)
      .fill(COLORS.player)
      .circle(0, 0, pr * 0.65)
      .stroke({ width: 2, color: 0xb8860b })
    // 4 edge notches (small dark circles at N/E/S/W)
    for (let n = 0; n < 4; n++) {
      const angle = (n * Math.PI) / 2
      const nx = Math.cos(angle) * (pr - 3)
      const ny = Math.sin(angle) * (pr - 3)
      this.playerG.circle(nx, ny, 3).fill(0x8b6914)
    }
    this.playerG.alpha = p.iframes > 0 ? 0.5 : 1

    // Guards: casino muscle — dark suit, white shirt triangle, red tie, pale head
    this.enemiesG.clear()
    for (const e of state.enemies) {
      const ex = e.pos.x
      const ey = e.pos.y
      const bob = Math.sin((state.tick + e.id * 7) * 0.3) * 1.5
      const bey = ey + bob
      // Dark suit body (rounded rect 18×22)
      this.enemiesG.roundRect(ex - 9, bey - 4, 18, 22, 3).fill(0x1a1a22)
      // White shirt triangle (small triangle in chest area)
      this.enemiesG
        .poly([ex, bey, ex - 4, bey + 8, ex + 4, bey + 8])
        .fill(0xeeeeee)
      // Red tie (thin rect)
      this.enemiesG.rect(ex - 1.5, bey + 1, 3, 10).fill(0xcc2233)
      // Pale head circle on top
      this.enemiesG.circle(ex, bey - 8, 7).fill(0xd4b896)
    }

    this.projectilesG.clear()
    for (const pr of state.projectiles) {
      // Fake motion trail: draw at 60% and 30% alpha offset backward along velocity
      const DT = 1 / CONFIG.tickRate
      const tx1 = pr.pos.x - pr.vel.x * DT * 1.5
      const ty1 = pr.pos.y - pr.vel.y * DT * 1.5
      const tx2 = pr.pos.x - pr.vel.x * DT * 3
      const ty2 = pr.pos.y - pr.vel.y * DT * 3
      this.projectilesG.circle(tx2, ty2, pr.radius).fill({ color: COLORS.projectile, alpha: 0.3 })
      this.projectilesG.circle(tx1, ty1, pr.radius).fill({ color: COLORS.projectile, alpha: 0.6 })
      this.projectilesG.circle(pr.pos.x, pr.pos.y, pr.radius).fill(COLORS.projectile)
    }

    // Machines
    this.machinesG.clear()
    for (let mi = 0; mi < state.machines.length; mi++) {
      const m = state.machines[mi]!
      const warm = m.spinsLeft > 0
      if (warm) {
        // Pulsing outer glow
        const glowAlpha = 0.25 + 0.15 * Math.sin(state.tick * 0.05 + m.id)
        this.machinesG
          .roundRect(m.pos.x - 22, m.pos.y - 26, 44, 52, 9)
          .fill({ color: COLORS.machineWarm, alpha: glowAlpha })
        // Main body
        this.machinesG
          .roundRect(m.pos.x - 18, m.pos.y - 22, 36, 44, 6)
          .fill(COLORS.machineWarm)
        // Tiny screen rect that flickers color
        const screenColorIdx = Math.floor(state.tick / 8 + m.id) % SCREEN_COLORS.length
        this.machinesG
          .rect(m.pos.x - 9, m.pos.y - 14, 18, 12)
          .fill(SCREEN_COLORS[screenColorIdx]!)
      } else {
        // Cold machine: flat gray body
        this.machinesG
          .roundRect(m.pos.x - 18, m.pos.y - 22, 36, 44, 6)
          .fill(COLORS.machineCold)
        // "OUT OF ORDER" indicator: dark contrasting horizontal strip
        this.machinesG
          .rect(m.pos.x - 18, m.pos.y - 4, 36, 6)
          .fill({ color: 0x111111, alpha: 0.8 })
      }
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
    this.updateParticles(state.player.pos)
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
          // Muzzle flash: bright spark at shot position, ttl 2
          this.spawnParticles(ev.pos.x, ev.pos.y, 1, 'spark', 0xffffff, 6, 1, 2, 2)
        } else if (ev.kind === 'roll') {
          const r = ev.result
          const label =
            r.event === 'deathSave'
              ? r.success ? 'LUCKY!' : 'BUST'
              : `${r.roll}/${r.chance}${r.success ? '' : ' miss'}`
          this.addPopup(label, ev.pos.x, ev.pos.y, r.success ? 0x9fff8a : 0xff6b6b,
            r.event === 'deathSave' ? 32 : 14)
          if (r.event === 'hit' && r.success) {
            play('hit')
            // 3 cyan sparks on hit-success
            this.spawnParticles(ev.pos.x, ev.pos.y, 3, 'spark', 0x7df9ff, 3, 3, 6, 12)
          } else if (r.event === 'crit' && r.success) {
            play('crit')
            this.addShake(6)
            // 3 cyan sparks on crit
            this.spawnParticles(ev.pos.x, ev.pos.y, 3, 'spark', 0x7df9ff, 3, 3, 6, 12)
          }
        } else if (ev.kind === 'kill') {
          this.addPopup(`+${ev.chips}`, ev.pos.x, ev.pos.y - 16, 0xffd700, 16)
          play('kill')
          play('chip')
          this.addShake(3)
          this.hitStopFrames = Math.max(this.hitStopFrames, 3)
          // Chip scatter: 4 + min(chips, 8) gold chips
          const count = 4 + Math.min(ev.chips, 8)
          this.spawnChips(ev.pos.x, ev.pos.y, count)
        } else if (ev.kind === 'playerHit') {
          play('playerHit')
          this.addShake(8)
          this.flash = 0.35
          this.flashIsGold = false
          // 6 red sparks on player hit
          this.spawnParticles(ev.pos.x, ev.pos.y, 6, 'spark', 0xff4040, 3, 5, 6, 16)
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
      // BIG jackpot celebration: gold flash + heavy shake
      this.flash = 0.5
      this.flashIsGold = true
      this.addShake(12)
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
      this.leverGraphics = null
      this.resultText = null
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
    // Reset near-miss flag on every slot open; kick lever only on fresh pull with reels
    const freshPull = this.reelRevealFrame === 0 && slot.reels !== null
    this.nearMissApplied = false
    if (freshPull) {
      this.leverFrame = 1 // kick off lever pull animation
    }
    this.leverGraphics = null // will be redrawn each animateReels call

    // Slot sounds keyed to what changed in this rebuild
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
    // Store result text reference for pulse animation; start pulse only when a win outcome
    // is FRESH (new outcome this rebuild). Stake/ride rebuilds on an already-seen outcome do
    // not restart the pulse, and a non-win/stale rebuild leaves any in-flight pulse alone.
    this.resultText = result
    const isWinOutcome = o && (o.kind === 'luck' || o.kind === 'chips' || o.kind === 'rideWin')
    if (isWinOutcome && freshOutcome) {
      this.resultPulseFrame = 1
    } else if (!isWinOutcome) {
      this.resultPulseFrame = 0
    }
    // else: stale win rebuild — leave resultPulseFrame as-is (in-flight pulse continues)

    const help = slot.pendingWin
      ? this.uiText('SPACE ride it (double or nothing)  ·  ENTER cash out', 16, COLORS.hud)
      : this.uiText('SPACE pull  ·  ◄/► stake  ·  E/ESC stand up', 16, COLORS.hud)
    help.position.set(cx, 470)
    ui.addChild(help)

    const heat = this.uiText(`HEAT ${Math.round(state.heat)} — each pull cools the floor`, 14, COLORS.heatLow)
    heat.position.set(cx, 510)
    ui.addChild(heat)

    // Lever placeholder graphic (redrawn each frame by animateReels)
    const leverG = new Graphics()
    ui.addChild(leverG)
    this.leverGraphics = leverG

    this.app.stage.addChild(ui)
    // Re-order fxLayer above slotUI so slot sparks render over the scrim
    this.app.stage.addChild(this.fxLayer)
    this.slotUI = ui
  }

  private animateReels(): void {
    if (!this.slotUI) return
    this.reelRevealFrame++
    const f = this.reelRevealFrame

    // --- Lever animation ---
    // leverFrame: 0 = idle, 1..8 = yanking down, 9..16 = springing back, then reset to 0
    if (this.leverFrame > 0 && this.leverFrame <= 16) {
      this.leverFrame++
    }
    if (this.leverFrame > 16) {
      this.leverFrame = 0
    }
    this.drawLever()

    if (!this.lastSlotReels) return // no pull yet: keep placeholders

    // Step 1: Escalating reveal frames — 25 / 55 / 95
    // Step 2: Suspense/buildup extension — if the first two revealed symbols match
    //         (including on genuine wins; this is intentional anticipation on any two-match),
    //         delay the third reveal by +40 frames (applied once per spin)
    const BASE_REVEALS = [25, 55, 95] as const

    // Detect near-miss: first two must be revealed AND matching, third still spinning
    const reel0RevealAt = BASE_REVEALS[0]
    const reel1RevealAt = BASE_REVEALS[1]
    let reel2RevealAt = BASE_REVEALS[2]

    const reel0Revealed = f >= reel0RevealAt
    const reel1Revealed = f >= reel1RevealAt

    if (
      !this.nearMissApplied &&
      reel0Revealed &&
      reel1Revealed &&
      this.lastSlotReels[0] === this.lastSlotReels[1] &&
      f < BASE_REVEALS[2]
    ) {
      this.nearMissApplied = true
    }

    if (this.nearMissApplied) {
      reel2RevealAt = BASE_REVEALS[2] + 40
    }

    // Buildup shake: every ~10 frames after reel1 revealed while reel2 still spinning
    if (this.nearMissApplied && f < reel2RevealAt && f % 10 === 0) {
      this.addShake(2)
    }

    // Escalating reelTick cadence: play when reelRevealFrame % max(2, 8 - floor(f/12)) === 0
    const isFlickering =
      !reel0Revealed ||
      !reel1Revealed ||
      f < reel2RevealAt
    if (isFlickering) {
      const cadence = Math.max(2, 8 - Math.floor(f / 12))
      if (f % cadence === 0) play('reelTick', 60)
    }

    const revealAts = [reel0RevealAt, reel1RevealAt, reel2RevealAt]

    this.lastSlotReels.forEach((sym, i) => {
      const t = this.reelTexts[i]
      if (!t) return
      const revealAt = revealAts[i]!
      const wasFlickering = (f - 1) < revealAt
      const nowRevealed = f >= revealAt
      if (wasFlickering && nowRevealed) {
        play('reelLand')
        // Step 4: Win celebration sparks on reel landing if this is a win
        // Only trigger on last reel reveal (reel 2)
        if (i === 2) {
          const outcome = this.lastSlotOutcome
          if (outcome && (outcome.kind === 'luck' || outcome.kind === 'chips')) {
            this.spawnSlotSparks()
          }
        }
      }
      t.text = nowRevealed
        ? SYMBOL_GLYPHS[sym]
        : SPIN_FLICKER[(f + i) % SPIN_FLICKER.length]
    })

    // Step 4: Pulse result text scale on win (12-frame arc: 1 → 1.3 → 1)
    if (this.resultPulseFrame > 0 && this.resultText) {
      const pf = this.resultPulseFrame
      this.resultPulseFrame++
      if (pf <= 6) {
        const s = 1 + (pf / 6) * 0.3
        this.resultText.scale.set(s)
      } else if (pf <= 12) {
        const s = 1.3 - ((pf - 6) / 6) * 0.3
        this.resultText.scale.set(s)
      } else {
        this.resultText.scale.set(1)
        this.resultPulseFrame = 0
      }
    }
  }

  // Draw the lever (rod + ball) on the right side of the machine frame.
  // leverFrame: 0 = idle, 1-8 = yanking down, 9-16 = springing back
  private drawLever(): void {
    const g = this.leverGraphics
    if (!g) return
    g.clear()

    const cx = CONFIG.screen.w / 2
    // Lever anchor: right side of machine frame, vertically centered in the frame
    // Machine frame: cx-260 to cx+260, y 120 to 540 (height 420)
    const lx = cx + 260 + 12 // just outside right edge
    const ly = 280 // anchor point (vertical center area)

    // Compute yank offset: yank down during frames 1-8, spring back during 9-16
    let yankOffset = 0
    if (this.leverFrame >= 1 && this.leverFrame <= 8) {
      // Ease in: 0 → 40px over 8 frames
      yankOffset = (this.leverFrame / 8) * 40
    } else if (this.leverFrame >= 9 && this.leverFrame <= 16) {
      // Spring back: 40 → 0 over 8 frames
      yankOffset = ((16 - this.leverFrame) / 8) * 40
    }

    // Rod: vertical line from anchor down to ball
    const rodLength = 60
    const ballY = ly + rodLength + yankOffset
    g.moveTo(lx, ly).lineTo(lx, ballY)
    g.stroke({ width: 5, color: COLORS.machineCold })

    // Ball at bottom of rod
    g.circle(lx, ballY, 9).fill(COLORS.machineWarm)

    // Pivot mount at top of rod
    g.circle(lx, ly, 5).fill(COLORS.machineCold)
  }

  // Spawn 10 gold sparks at screen-space reel positions into fxLayer (above the slot scrim).
  // Reels are at screen coords: cx-120, cx, cx+120, y=260 — no world-coord conversion needed.
  private spawnSlotSparks(): void {
    const cx = CONFIG.screen.w / 2
    for (let i = 0; i < 3; i++) {
      const sx = cx - 120 + i * 120
      const sy = 260
      this.spawnParticlesInto(this.fxLayer, sx, sy, 3, 'spark', 0xffd700, 4, 3, 7, 18)
    }
    // One extra spark at center for total ~10
    this.spawnParticlesInto(this.fxLayer, cx, 260, 1, 'spark', 0xffd700, 4, 3, 7, 18)
  }

  // Spawn spark particles into a specific container. Chips must go through spawnChips().
  private spawnParticlesInto(
    container: Container,
    x: number, y: number, count: number, kind: 'spark',
    color: number, radius: number, speedMin: number, speedMax: number, ttl: number,
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= 400) break
      const angle = Math.random() * Math.PI * 2
      const speed = speedMin + Math.random() * (speedMax - speedMin)
      const g = new Graphics().circle(0, 0, radius).fill(color)
      g.position.set(x, y)
      container.addChild(g)
      this.particles.push({ g, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ttl, maxTtl: ttl, kind })
    }
  }

  // Spawn spark particles into the world container (combat effects).
  private spawnParticles(
    x: number, y: number, count: number, kind: 'spark',
    color: number, radius: number, speedMin: number, speedMax: number, ttl: number,
  ): void {
    this.spawnParticlesInto(this.world, x, y, count, kind, color, radius, speedMin, speedMax, ttl)
  }

  // Spawn chip scatter particles with homing behaviour (Step 2)
  private spawnChips(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= 400) break
      const angle = Math.random() * Math.PI * 2
      const speed = 2 + Math.random() * 3
      const g = new Graphics().circle(0, 0, 3).fill(0xffd700)
      g.position.set(x, y)
      this.world.addChild(g)
      // homing=false for first 12 frames of scatter; flipped in updateParticles
      this.particles.push({ g, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ttl: 40, maxTtl: 40, kind: 'chip', homing: false })
    }
  }

  // Update all particles each draw frame
  private updateParticles(playerPos: Vec2): void {
    if (this.particles.length === 0) return
    const toRemove: number[] = []
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!
      p.ttl--

      if (p.ttl <= 0) {
        toRemove.push(i)
        continue
      }

      // Chip homing: after 12 frames of scatter, switch to homing toward player
      if (p.kind === 'chip' && !p.homing && p.maxTtl - p.ttl >= 12) {
        p.homing = true
      }

      if (p.kind === 'chip' && p.homing) {
        // Lerp velocity toward player position with increasing strength
        const dx = playerPos.x - p.g.x
        const dy = playerPos.y - p.g.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 20) {
          // Arrived — play chip sound (throttled) and remove
          play('chip', 80)
          toRemove.push(i)
          continue
        }
        // Increasing homing strength: stronger the longer it's been homing
        const framesHoming = p.maxTtl - p.ttl - 12
        const homingStrength = Math.min(0.12 + framesHoming * 0.006, 0.35)
        const nx = dx / dist
        const ny = dy / dist
        const spd0 = Math.abs(p.vx) + Math.abs(p.vy) + 1
        p.vx += nx * homingStrength * spd0
        p.vy += ny * homingStrength * spd0
        // Cap speed so it doesn't overshoot wildly
        const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        if (spd > 17) { p.vx = (p.vx / spd) * 17; p.vy = (p.vy / spd) * 17 }
      }

      // Decelerate chips during scatter phase only; sparks fly free
      if (p.kind === 'chip' && !p.homing) {
        p.vx *= 0.92
        p.vy *= 0.92
      }

      p.g.x += p.vx
      p.g.y += p.vy
      p.g.alpha = p.homing ? Math.max(p.ttl / p.maxTtl, 0.85) : p.ttl / p.maxTtl
    }

    // Remove dead particles in reverse order to preserve indices
    for (let j = toRemove.length - 1; j >= 0; j--) {
      const idx = toRemove[j]!
      this.particles[idx]!.g.destroy()
      this.particles.splice(idx, 1)
    }
  }
}
