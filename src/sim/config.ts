export const CONFIG = {
  screen: { w: 1280, h: 720 }, // viewport; the camera follows the player
  world: { w: 3200, h: 2400 }, // the casino floor
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
  },
  guards: {
    ringRadius: 760, // spawn just outside the 1280x720 view
    hpPerMinute: 0.25, // hp multiplier grows +25%/min
    speedPerMinute: 0.04,
    speedCap: 1.9,
    touchPerMinute: 1.2, // +1.2 touch damage per minute (floored)
  },
  heat: {
    risePerTick: 0.04, // ~42s from 0 to 100 while not gambling
    drainPerTick: 0.2, // 5x faster drain while gambling
    spawnThreshold: 10, // below this: no spawns (grace period)
    minSpawnIntervalTicks: 25, // at heat 100
    maxSpawnIntervalTicks: 170, // at the threshold
  },
  machines: {
    count: 12,
    radius: 26, // visual size
    interactRadius: 70, // stand this close to sit down (E)
    spinsPerMachine: 10, // pulls before it runs cold, permanently
  },
  draft: { rerollCost: 5 },
  win: { luckTarget: 100, alarmTicks: 2700 }, // survive 45s of alarm to beat the house
  loot: { chipsOnWin: 5, chipsOnLoss: 1 },
  houseEdge: { start: 0, perMinute: 3 },
} as const
