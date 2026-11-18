// The VOIDPULSE simulation: player, bullets, four enemy archetypes, energy orbs,
// particles and the wave director. This file owns every rule of the game; render.js
// only draws what is here, and main.js only feeds it input and time. All randomness
// flows through one SeededRandom so a run can be replayed exactly from its seed.

import {
  ENEMY_TYPES, PLAYER, SHOCKWAVE, COMBO, WAVE, waveRoster,
} from './config.js';
import { clampValue, distanceSquared } from './rng.js';

const SILENT_AUDIO = {
  shoot() {}, hit() {}, explode() {}, pickup() {}, hurt() {},
  dash() {}, shockwave() {}, waveStart() {}, gameOver() {}, uiStart() {},
};

export class GameWorld {
  constructor(random, width, height) {
    this.random = random;
    this.width = width;
    this.height = height;
    this.stars = [];
    for (let i = 0; i < 110; i += 1) {
      this.stars.push({
        x: random.next(), y: random.next(),
        depth: random.range(0.25, 1), size: random.range(0.6, 2.1),
        twinkle: random.range(0, Math.PI * 2),
      });
    }
    this.resetToAttract();
  }

  resetToAttract() {
    this.time = 0;
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.wave = 0;
    this.phase = 'idle';
    this.phaseTimer = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.enemies = [];
    this.bullets = [];
    this.orbs = [];
    this.particles = [];
    this.floaters = [];
    this.shockRings = [];
    this.shakeTime = 0;
    this.shakePower = 0;
    this.runOver = false;
    this.overTimer = 0;
    this.pickupChain = 0;
    this.player = this.freshPlayer();
  }

  freshPlayer() {
    return {
      x: this.width / 2,
      y: this.height / 2,
      vx: 0,
      vy: 0,
      heading: -Math.PI / 2,
      hp: PLAYER.maxHp,
      energy: 0,
      fireTimer: 0,
      dashTimer: 0,
      dashCooldownTimer: 0,
      invulnTimer: 0,
      thrust: 0,
    };
  }

  startRun() {
    const stars = this.stars;
    this.resetToAttract();
    this.stars = stars;
    this.player = this.freshPlayer();
    this.beginNextWave();
  }

  beginNextWave() {
    this.wave += 1;
    this.spawnQueue = waveRoster(this.wave, this.random);
    this.spawnTimer = 0;
    this.phase = 'intro';
    this.phaseTimer = WAVE.introSeconds;
  }

  multiplier() {
    return 1 + Math.min(this.combo * COMBO.perKillStep, COMBO.maxBonus);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.player.x = clampValue(this.player.x, 20, width - 20);
    this.player.y = clampValue(this.player.y, 20, height - 20);
  }

  spawnEnemy(type, atX = null, atY = null) {
    const spec = ENEMY_TYPES[type];
    let x = atX;
    let y = atY;
    if (x === null || y === null) {
      const margin = 40;
      const edge = this.random.int(0, 3);
      if (edge === 0) { x = this.random.range(0, this.width); y = -margin; }
      if (edge === 1) { x = this.width + margin; y = this.random.range(0, this.height); }
      if (edge === 2) { x = this.random.range(0, this.width); y = this.height + margin; }
      if (edge === 3) { x = -margin; y = this.random.range(0, this.height); }
      if (distanceSquared(x, y, this.player.x, this.player.y) < 300 * 300) {
        x = this.width - x;
        y = this.height - y;
      }
    }
    const hpScale = 1 + (this.wave - 1) * WAVE.hpScalePerWave;
    const speedScale = 1 + (this.wave - 1) * WAVE.speedScalePerWave;
    this.enemies.push({
      type,
      x, y, vx: 0, vy: 0,
      hp: Math.max(1, Math.round(spec.hp * hpScale)),
      maxHp: Math.max(1, Math.round(spec.hp * hpScale)),
      radius: spec.radius,
      speed: spec.speed * speedScale * this.random.range(0.9, 1.1),
      score: spec.score,
      damage: spec.damage,
      color: spec.color,
      sides: spec.sides,
      spin: this.random.angle(),
      spinSpeed: this.random.range(-1.4, 1.4),
      weavePhase: this.random.angle(),
      state: 'hunt',
      stateTimer: 0,
      flashTimer: 0,
    });
  }

  tryDash() {
    const p = this.player;
    if (p.dashCooldownTimer > 0 || p.hp <= 0) return false;
    const len = Math.hypot(p.vx, p.vy);
    const dx = len > 1 ? p.vx / len : Math.cos(p.heading);
    const dy = len > 1 ? p.vy / len : Math.sin(p.heading);
    p.dashTimer = PLAYER.dashTime;
    p.dashCooldownTimer = PLAYER.dashCooldown;
    p.dashDirX = dx;
    p.dashDirY = dy;
    this.burst(p.x, p.y, PALETTE_TRAIL, 10, 130, 0.3, 2.4);
    return true;
  }

  triggerShockwave(audio) {
    const p = this.player;
    if (p.energy < SHOCKWAVE.cost || p.hp <= 0) return false;
    p.energy = 0;
    this.shockRings.push({ x: p.x, y: p.y, radius: 10, life: 0.45, maxLife: 0.45 });
    this.addShake(0.35, 9);
    audio.shockwave();
    for (const enemy of this.enemies) {
      const d2 = distanceSquared(p.x, p.y, enemy.x, enemy.y);
      if (d2 <= SHOCKWAVE.radius * SHOCKWAVE.radius) {
        const d = Math.max(1, Math.sqrt(d2));
        enemy.hp -= SHOCKWAVE.damage;
        enemy.flashTimer = 0.12;
        enemy.vx += ((enemy.x - p.x) / d) * SHOCKWAVE.knockback;
        enemy.vy += ((enemy.y - p.y) / d) * SHOCKWAVE.knockback;
      }
    }
    return true;
  }

  burst(x, y, color, count, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const angle = this.random.angle();
      const velocity = this.random.range(speed * 0.25, speed);
      const particleLife = this.random.range(life * 0.5, life);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: particleLife, maxLife: particleLife,
        size: this.random.range(size * 0.5, size),
        color, drag: 3.2,
      });
    }
    if (this.particles.length > 620) {
      this.particles.splice(0, this.particles.length - 620);
    }
  }

  addFloatingText(x, y, text, color, size = 16) {
    this.floaters.push({ x, y, vy: -46, life: 0.9, maxLife: 0.9, text, color, size });
  }

  addShake(time, power) {
    this.shakeTime = Math.max(this.shakeTime, time);
    this.shakePower = Math.max(this.shakePower, power);
  }

  killEnemy(enemy, audio) {
    this.kills += 1;
    this.combo += 1;
    this.comboTimer = COMBO.windowSeconds;
    const gained = Math.round(enemy.score * this.multiplier());
    this.score += gained;
    this.addFloatingText(enemy.x, enemy.y - enemy.radius, `+${gained}`, enemy.color, enemy.type === 'bulwark' ? 22 : 15);
    this.burst(enemy.x, enemy.y, enemy.color, enemy.type === 'bulwark' ? 34 : 16, 260, 0.55, 3);
    this.addShake(0.12, enemy.type === 'bulwark' ? 6 : 2.5);
    audio.explode(enemy.type === 'bulwark');
    const orbCount = enemy.type === 'bulwark' ? 4 : this.random.int(1, 2);
    for (let i = 0; i < orbCount; i += 1) {
      const angle = this.random.angle();
      this.orbs.push({
        x: enemy.x, y: enemy.y,
        vx: Math.cos(angle) * this.random.range(30, 120),
        vy: Math.sin(angle) * this.random.range(30, 120),
        age: 0,
      });
    }
    if (enemy.type === 'bulwark') {
      this.spawnEnemy('chaser', enemy.x - 18, enemy.y);
      this.spawnEnemy('chaser', enemy.x + 18, enemy.y);
    }
  }

  hurtPlayer(damage, audio) {
    const p = this.player;
    if (p.invulnTimer > 0 || p.dashTimer > 0 || p.hp <= 0) return;
    p.hp -= damage;
    p.invulnTimer = PLAYER.hurtInvulnTime;
    this.combo = 0;
    this.comboTimer = 0;
    this.burst(p.x, p.y, '#ff5470', 18, 240, 0.5, 3);
    this.addShake(0.3, 8);
    audio.hurt();
    if (p.hp <= 0) {
      p.hp = 0;
      this.burst(p.x, p.y, '#3df3ff', 60, 380, 0.9, 3.6);
      this.burst(p.x, p.y, '#ffffff', 26, 240, 0.7, 2.4);
      this.addShake(0.6, 14);
      audio.explode(true);
      audio.gameOver();
      this.overTimer = 1.1;
    }
  }

  update(dt, input, audio) {
    const sfx = audio || SILENT_AUDIO;
    this.time += dt;
    const p = this.player;

    if (this.shakeTime > 0) this.shakeTime -= dt;
    else this.shakePower = 0;

    if (p.hp <= 0) {
      if (this.overTimer > 0) {
        this.overTimer -= dt;
        if (this.overTimer <= 0) this.runOver = true;
      }
      this.updateEffects(dt);
      return;
    }

    // Wave director.
    if (this.phase === 'intro') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phase = 'active';
        sfx.waveStart();
      }
    } else if (this.phase === 'active') {
      if (this.spawnQueue.length > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          this.spawnTimer = WAVE.spawnInterval;
          this.spawnEnemy(this.spawnQueue.shift());
        }
      } else if (this.enemies.length === 0) {
        this.phase = 'clear';
        this.phaseTimer = WAVE.clearSeconds;
        this.score += 100 * this.wave;
        this.addFloatingText(p.x, p.y - 44, `WAVE ${this.wave} CLEAR  +${100 * this.wave}`, '#57ffd9', 20);
      }
    } else if (this.phase === 'clear') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.beginNextWave();
    }

    this.updatePlayer(dt, input, sfx);
    this.updateBullets(dt, sfx);
    this.updateEnemies(dt, sfx);
    this.updateOrbs(dt, sfx);
    this.updateEffects(dt);
  }

  updatePlayer(dt, input, sfx) {
    const p = this.player;
    const axes = input.moveAxes();
    const len = Math.hypot(axes.x, axes.y) || 1;
    const targetVx = (axes.x / len) * PLAYER.speed * (axes.x !== 0 || axes.y !== 0 ? 1 : 0);
    const targetVy = (axes.y / len) * PLAYER.speed * (axes.x !== 0 || axes.y !== 0 ? 1 : 0);
    const blend = 1 - Math.pow(0.0001, dt);
    p.vx += (targetVx - p.vx) * blend;
    p.vy += (targetVy - p.vy) * blend;
    p.thrust = Math.hypot(p.vx, p.vy) / PLAYER.speed;

    if (p.dashCooldownTimer > 0) p.dashCooldownTimer -= dt;
    if (p.invulnTimer > 0) p.invulnTimer -= dt;
    if (input.pressed('ShiftLeft') || input.pressed('ShiftRight') || input.pressed('Space')) {
      if (this.tryDash()) sfx.dash();
    }
    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      p.vx = p.dashDirX * PLAYER.dashSpeed;
      p.vy = p.dashDirY * PLAYER.dashSpeed;
      this.burst(p.x, p.y, '#3df3ff', 2, 40, 0.3, 2.6);
    }

    p.x = clampValue(p.x + p.vx * dt, PLAYER.radius, this.width - PLAYER.radius);
    p.y = clampValue(p.y + p.vy * dt, PLAYER.radius, this.height - PLAYER.radius);
    p.heading = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);

    // Firing: hold the mouse button (or J) and the cannon answers at a fixed cadence.
    p.fireTimer -= dt;
    const wantsFire = input.mouseDown || input.isDown('KeyJ');
    if (wantsFire && p.fireTimer <= 0) {
      p.fireTimer = PLAYER.fireInterval;
      const spread = this.random.range(-0.022, 0.022);
      const angle = p.heading + spread;
      this.bullets.push({
        x: p.x + Math.cos(p.heading) * (PLAYER.radius + 6),
        y: p.y + Math.sin(p.heading) * (PLAYER.radius + 6),
        vx: Math.cos(angle) * PLAYER.bulletSpeed,
        vy: Math.sin(angle) * PLAYER.bulletSpeed,
        life: 0.85,
      });
      sfx.shoot();
    }

    if (input.pressed('KeyE') || input.takeRightPressed()) {
      this.triggerShockwave(sfx);
    }
  }

  updateBullets(dt, sfx) {
    for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = this.bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.life <= 0 || bullet.x < -20 || bullet.y < -20
        || bullet.x > this.width + 20 || bullet.y > this.height + 20) {
        this.bullets.splice(i, 1);
        continue;
      }
      for (let j = this.enemies.length - 1; j >= 0; j -= 1) {
        const enemy = this.enemies[j];
        const rr = enemy.radius + 5;
        if (distanceSquared(bullet.x, bullet.y, enemy.x, enemy.y) <= rr * rr) {
          this.bullets.splice(i, 1);
          enemy.hp -= PLAYER.bulletDamage;
          enemy.flashTimer = 0.07;
          this.burst(bullet.x, bullet.y, enemy.color, 3, 150, 0.25, 2);
          sfx.hit();
          if (enemy.hp <= 0) {
            this.enemies.splice(j, 1);
            this.killEnemy(enemy, sfx);
          }
          break;
        }
      }
    }
  }

  updateEnemies(dt, sfx) {
    const p = this.player;
    for (const enemy of this.enemies) {
      if (enemy.flashTimer > 0) enemy.flashTimer -= dt;
      enemy.spin += enemy.spinSpeed * dt;
      const dx = p.x - enemy.x;
      const dy = p.y - enemy.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / dist;
      const uy = dy / dist;
      let steerX = ux;
      let steerY = uy;
      let speed = enemy.speed;

      if (enemy.type === 'weaver') {
        const sway = Math.sin(this.time * 3.4 + enemy.weavePhase) * 0.85;
        steerX = ux + -uy * sway;
        steerY = uy + ux * sway;
      } else if (enemy.type === 'stinger') {
        enemy.stateTimer -= dt;
        if (enemy.state === 'hunt' && dist < 250 && enemy.stateTimer <= 0) {
          enemy.state = 'telegraph';
          enemy.stateTimer = 0.38;
        } else if (enemy.state === 'telegraph') {
          speed = enemy.speed * 0.25;
          if (enemy.stateTimer <= 0) {
            enemy.state = 'lunge';
            enemy.stateTimer = 0.42;
            enemy.vx = ux * 540;
            enemy.vy = uy * 540;
          }
        } else if (enemy.state === 'lunge') {
          steerX = 0;
          steerY = 0;
          if (enemy.stateTimer <= 0) {
            enemy.state = 'hunt';
            enemy.stateTimer = 0.7;
          }
        }
      }

      if (enemy.state !== 'lunge') {
        const accel = 1 - Math.pow(0.001, dt);
        enemy.vx += (steerX * speed - enemy.vx) * accel;
        enemy.vy += (steerY * speed - enemy.vy) * accel;
      }
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;

      const touchDist = enemy.radius + PLAYER.radius;
      if (distanceSquared(enemy.x, enemy.y, p.x, p.y) <= touchDist * touchDist) {
        this.hurtPlayer(enemy.damage, sfx);
        enemy.vx = -ux * 160;
        enemy.vy = -uy * 160;
      }
    }
    // Gentle separation so packs read as individuals instead of one blob.
    for (let i = 0; i < this.enemies.length; i += 1) {
      for (let j = i + 1; j < this.enemies.length; j += 1) {
        const a = this.enemies[i];
        const b = this.enemies[j];
        const rr = a.radius + b.radius;
        const d2 = distanceSquared(a.x, a.y, b.x, b.y);
        if (d2 > 0.01 && d2 < rr * rr) {
          const d = Math.sqrt(d2);
          const push = ((rr - d) / d) * 0.5 * 60 * dt;
          const px = (b.x - a.x) * push;
          const py = (b.y - a.y) * push;
          a.x -= px; a.y -= py;
          b.x += px; b.y += py;
        }
      }
    }
    // Shockwave damage can kill outside the bullet loop; sweep the dead here.
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      if (this.enemies[i].hp <= 0) {
        const [dead] = this.enemies.splice(i, 1);
        this.killEnemy(dead, sfx);
      }
    }
  }

  updateOrbs(dt, sfx) {
    const p = this.player;
    for (let i = this.orbs.length - 1; i >= 0; i -= 1) {
      const orb = this.orbs[i];
      orb.age += dt;
      orb.vx *= Math.pow(0.02, dt);
      orb.vy *= Math.pow(0.02, dt);
      const d2 = distanceSquared(orb.x, orb.y, p.x, p.y);
      if (d2 < PLAYER.magnetRadius * PLAYER.magnetRadius) {
        const d = Math.max(1, Math.sqrt(d2));
        const pull = 640 * (1 - d / PLAYER.magnetRadius) + 120;
        orb.vx += ((p.x - orb.x) / d) * pull * dt * 4;
        orb.vy += ((p.y - orb.y) / d) * pull * dt * 4;
      }
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      if (d2 < PLAYER.collectRadius * PLAYER.collectRadius) {
        this.orbs.splice(i, 1);
        p.energy = clampValue(p.energy + 7, 0, 100);
        this.score += 5;
        this.pickupChain += 1;
        sfx.pickup(this.pickupChain);
        this.burst(orb.x, orb.y, '#ffd76a', 4, 110, 0.3, 2);
      }
    }
    if (this.orbs.length > 140) this.orbs.splice(0, this.orbs.length - 140);
  }

  updateEffects(dt) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const dragFactor = Math.pow(0.1, dt * particle.drag * 0.3);
      particle.vx *= dragFactor;
      particle.vy *= dragFactor;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
    for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
      const floater = this.floaters[i];
      floater.life -= dt;
      floater.y += floater.vy * dt;
      if (floater.life <= 0) this.floaters.splice(i, 1);
    }
    for (let i = this.shockRings.length - 1; i >= 0; i -= 1) {
      const ring = this.shockRings[i];
      ring.life -= dt;
      ring.radius += (SHOCKWAVE.radius - ring.radius) * (1 - Math.pow(0.0001, dt));
      if (ring.life <= 0) this.shockRings.splice(i, 1);
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
  }
}

const PALETTE_TRAIL = '#3df3ff';
