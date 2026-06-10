export const CONFIG = {
  arena: { w: 1280, h: 720 },
  tickRate: 60,
  player: {
    hp: 100,
    luck: 10,
    speed: 220, // px/sec
    radius: 14,
    deathSaves: 3,
    iframeTicks: 45,
  },
  weapon: {
    damage: 10,
    cooldownTicks: 30,
    projectileSpeed: 500, // px/sec
    projectileRadius: 5,
    projectileTtl: 120,
    critMultiplier: 3,
  },
  enemy: {
    hp: 20,
    speed: 80, // px/sec
    radius: 12,
    touchDamage: 10,
    spawnIntervalTicks: 90,
  },
  loot: { chipsOnWin: 5, chipsOnLoss: 1 },
  houseEdge: { start: 0 },
} as const
