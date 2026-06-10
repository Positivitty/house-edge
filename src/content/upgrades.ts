import type { Rarity, SimState } from '../sim/types'

export interface Upgrade {
  id: string
  name: string
  rarity: Rarity
  desc: string
  apply(state: SimState): void
}

export const UPGRADES: Upgrade[] = [
  // common
  { id: 'lucky-penny', name: 'Lucky Penny', rarity: 'common', desc: '+5 LUCK',
    apply: (s) => { s.player.luck += 5 } },
  { id: 'swift-loafers', name: 'Swift Loafers', rarity: 'common', desc: '+10% speed',
    apply: (s) => { s.player.speed = Math.round(s.player.speed * 1.1) } },
  { id: 'house-snack', name: 'House Snack', rarity: 'common', desc: '+15 max HP, heal 15',
    apply: (s) => { s.player.maxHp += 15; s.player.hp = Math.min(s.player.hp + 15, s.player.maxHp) } },
  { id: 'sharper-cards', name: 'Sharper Cards', rarity: 'common', desc: '+3 damage',
    apply: (s) => { s.player.weapon.damage += 3 } },
  // rare
  { id: 'rabbits-foot', name: "Rabbit's Foot", rarity: 'rare', desc: '+12 LUCK',
    apply: (s) => { s.player.luck += 12 } },
  { id: 'hair-trigger', name: 'Hair Trigger', rarity: 'rare', desc: 'fire 8 ticks faster',
    apply: (s) => { s.player.weapon.cooldownTicks = Math.max(s.player.weapon.cooldownTicks - 8, 6) } },
  { id: 'heavy-chips', name: 'Heavy Chips', rarity: 'rare', desc: '+8 damage',
    apply: (s) => { s.player.weapon.damage += 8 } },
  // jackpot
  { id: 'horseshoe', name: 'Horseshoe', rarity: 'jackpot', desc: '+25 LUCK',
    apply: (s) => { s.player.luck += 25 } },
  { id: 'extra-life', name: 'Extra Life', rarity: 'jackpot', desc: '+1 death save, full heal',
    apply: (s) => { s.player.deathSavesLeft += 1; s.player.hp = s.player.maxHp } },
  { id: 'golden-gun', name: 'Golden Gun', rarity: 'jackpot', desc: '+2x crit, +5 damage',
    apply: (s) => { s.player.weapon.critMultiplier += 2; s.player.weapon.damage += 5 } },
]

export function upgradeById(id: string): Upgrade {
  const u = UPGRADES.find((u) => u.id === id)
  if (!u) throw new Error(`unknown upgrade: ${id}`)
  return u
}
