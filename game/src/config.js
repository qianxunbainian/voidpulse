// VOIDPULSE configuration: the palette and every tuning number that shapes how a run feels.
// Keeping all balance data in one place means the simulation in world.js reads as rules,
// not as a pile of magic numbers, and a future tuning pass touches only this file.

export const PALETTE = {
  voidDeep: '#04050e',
  voidGlow: '#0b1030',
  gridLine: 'rgba(64, 110, 255, 0.13)',
  player: '#3df3ff',
  playerCore: '#e8fdff',
  bullet: '#a9f6ff',
  orb: '#ffd76a',
  heart: '#ff5470',
  textMain: '#eaf6ff',
  textDim: '#8fa8c8',
  combo: '#ffe95e',
  energy: '#57ffd9',
};

// Enemy archetypes. radius is the collision circle; hp is hit points at wave 1;
// score is the base points a kill pays before the combo multiplier; speed is px/second.
export const ENEMY_TYPES = {
  chaser: {
    color: '#ff3d7e',
    radius: 16,
    hp: 3,
    speed: 118,
    score: 50,
    damage: 12,
    sides: 3,
  },
  weaver: {
    color: '#ffb02e',
    radius: 14,
    hp: 2,
    speed: 168,
    score: 80,
    damage: 10,
    sides: 4,
  },
  bulwark: {
    color: '#9d6bff',
    radius: 30,
    hp: 14,
    speed: 52,
    score: 200,
    damage: 20,
    sides: 6,
  },
  stinger: {
    color: '#b6ff3d',
    radius: 11,
    hp: 1,
    speed: 215,
    score: 120,
    damage: 8,
    sides: 3,
  },
};

export const PLAYER = {
  radius: 13,
  speed: 305,
  maxHp: 100,
  fireInterval: 0.115,
  bulletSpeed: 780,
  bulletDamage: 1,
  dashSpeed: 990,
  dashTime: 0.16,
  dashCooldown: 1.5,
  hurtInvulnTime: 0.9,
  magnetRadius: 120,
  collectRadius: 26,
};

export const SHOCKWAVE = {
  cost: 100,
  radius: 275,
  damage: 6,
  knockback: 420,
};

export const COMBO = {
  windowSeconds: 2.6,
  perKillStep: 0.1,
  maxBonus: 4,
};

export const WAVE = {
  introSeconds: 1.6,
  clearSeconds: 2.2,
  baseCount: 7,
  countPerWave: 3,
  hpScalePerWave: 0.13,
  speedScalePerWave: 0.02,
  spawnInterval: 0.55,
};

// Which archetypes may appear from which wave on, and their share of each wave's roster.
export function waveRoster(wave, random) {
  const total = WAVE.baseCount + (wave - 1) * WAVE.countPerWave;
  const roster = [];
  for (let i = 0; i < total; i += 1) {
    const roll = random.next();
    let type = 'chaser';
    if (wave >= 3 && roll < 0.1 + wave * 0.008) type = 'bulwark';
    else if (wave >= 4 && roll < 0.3) type = 'stinger';
    else if (wave >= 2 && roll < 0.52) type = 'weaver';
    roster.push(type);
  }
  return roster;
}
