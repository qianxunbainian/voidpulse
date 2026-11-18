// Deterministic randomness and small math helpers.
// The game normally seeds from the clock, but a seeded run can be replayed exactly,
// which is what the screenshot staging in shots.js relies on: same seed, same frame.

export class SeededRandom {
  constructor(seed) {
    this.state = (seed >>> 0) || 1;
  }

  // mulberry32: a tiny, fast, well-distributed 32-bit generator.
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  angle() {
    return this.next() * Math.PI * 2;
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  chance(probability) {
    return this.next() < probability;
  }
}

export function clampValue(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function lerpValue(from, to, amount) {
  return from + (to - from) * amount;
}

export function distanceSquared(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

// Shortest signed turn from one heading to another, in radians.
export function angleDifference(from, to) {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}
