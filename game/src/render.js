// Every pixel of VOIDPULSE is drawn here from the state in world.js: the starfield
// backdrop, the player's ship, the four enemy shapes, bullets, orbs, particles, the
// HUD and the title / pause / game-over screens. Nothing here mutates the simulation;
// it reads the world and paints it, so a screenshot is always the real game.

import { PALETTE } from './config.js';
import { SeededRandom } from './rng.js';

// Fixed decorative nebula blobs, seeded once so the backdrop never eats the
// simulation's random stream (a replayed run must stay identical).
const backdropRandom = new SeededRandom(20261118);
const NEBULAE = [];
for (let i = 0; i < 7; i += 1) {
  NEBULAE.push({
    x: backdropRandom.next(),
    y: backdropRandom.next(),
    radius: backdropRandom.range(140, 340),
    hue: backdropRandom.pick(['rgba(64, 60, 220, 0.10)', 'rgba(190, 40, 140, 0.07)', 'rgba(20, 140, 200, 0.08)']),
  });
}

function polygonPath(ctx, x, y, radius, sides, rotation, innerScale = 0) {
  ctx.beginPath();
  const steps = innerScale > 0 ? sides * 2 : sides;
  for (let i = 0; i < steps; i += 1) {
    const isInner = innerScale > 0 && i % 2 === 1;
    const r = isInner ? radius * innerScale : radius;
    const angle = rotation + (i / steps) * Math.PI * 2;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function drawWorld(ctx, world) {
  const { width, height } = world;
  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, 60, width / 2, height / 2, Math.max(width, height) * 0.75,
  );
  gradient.addColorStop(0, PALETTE.voidGlow);
  gradient.addColorStop(1, PALETTE.voidDeep);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (const nebula of NEBULAE) {
    const nx = nebula.x * width;
    const ny = nebula.y * height;
    const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, nebula.radius);
    glow.addColorStop(0, nebula.hue);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(nx - nebula.radius, ny - nebula.radius, nebula.radius * 2, nebula.radius * 2);
  }

  // Perspective-feel grid that drifts a touch against the player's position.
  const driftX = (world.player.x - width / 2) * -0.02;
  const driftY = (world.player.y - height / 2) * -0.02;
  ctx.strokeStyle = PALETTE.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const cell = 64;
  for (let x = (driftX % cell + cell) % cell; x < width; x += cell) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = (driftY % cell + cell) % cell; y < height; y += cell) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  for (const star of world.stars) {
    const twinkle = 0.55 + 0.45 * Math.sin(world.time * (1 + star.depth) + star.twinkle);
    ctx.globalAlpha = 0.25 + star.depth * 0.55 * twinkle;
    ctx.fillStyle = '#cfe8ff';
    const sx = star.x * width + driftX * star.depth * 3;
    const sy = star.y * height + driftY * star.depth * 3;
    ctx.fillRect(sx, sy, star.size, star.size);
  }
  ctx.globalAlpha = 1;

  drawShockRings(ctx, world);
  drawOrbs(ctx, world);
  drawEnemies(ctx, world);
  if (world.player.hp > 0) drawPlayer(ctx, world);
  drawBullets(ctx, world);
  drawParticles(ctx, world);
  drawFloaters(ctx, world);
}

function drawPlayer(ctx, world) {
  const p = world.player;
  if (p.invulnTimer > 0 && Math.floor(world.time * 18) % 2 === 0) ctx.globalAlpha = 0.35;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.heading);
  if (p.thrust > 0.12) {
    const flame = 12 + p.thrust * 14 + Math.sin(world.time * 42) * 3;
    ctx.beginPath();
    ctx.moveTo(-11, 5);
    ctx.lineTo(-11 - flame, 0);
    ctx.lineTo(-11, -5);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 170, 60, 0.85)';
    ctx.fill();
  }
  ctx.shadowColor = PALETTE.player;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(19, 0);
  ctx.lineTo(-8, 6);
  ctx.lineTo(-13, 12);
  ctx.lineTo(-10, 0);
  ctx.lineTo(-13, -12);
  ctx.lineTo(-8, -6);
  ctx.closePath();
  ctx.fillStyle = '#0b2b38';
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = PALETTE.player;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(2, 0, 4.2, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.playerCore;
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawEnemies(ctx, world) {
  for (const enemy of world.enemies) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    const flashing = enemy.flashTimer > 0
      || (enemy.state === 'telegraph' && Math.floor(world.time * 16) % 2 === 0);
    ctx.shadowColor = enemy.color;
    ctx.shadowBlur = 15;
    const inner = enemy.type === 'stinger' ? 0.45 : 0.62;
    polygonPath(ctx, 0, 0, enemy.radius, enemy.sides, enemy.spin, inner);
    ctx.fillStyle = flashing ? '#ffffff' : 'rgba(10, 8, 26, 0.92)';
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = flashing ? '#ffffff' : enemy.color;
    ctx.stroke();
    ctx.shadowBlur = 0;
    polygonPath(ctx, 0, 0, enemy.radius * 0.45, enemy.sides, -enemy.spin * 1.4, 0);
    ctx.fillStyle = enemy.color;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    if (enemy.hp < enemy.maxHp) {
      const w = enemy.radius * 1.7;
      const fraction = Math.max(0, enemy.hp / enemy.maxHp);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fillRect(enemy.x - w / 2, enemy.y - enemy.radius - 12, w, 3.5);
      ctx.fillStyle = enemy.color;
      ctx.fillRect(enemy.x - w / 2, enemy.y - enemy.radius - 12, w * fraction, 3.5);
    }
  }
}

function drawBullets(ctx, world) {
  ctx.save();
  ctx.strokeStyle = PALETTE.bullet;
  ctx.shadowColor = PALETTE.player;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const bullet of world.bullets) {
    const tail = 0.016;
    ctx.moveTo(bullet.x - bullet.vx * tail, bullet.y - bullet.vy * tail);
    ctx.lineTo(bullet.x, bullet.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawOrbs(ctx, world) {
  for (const orb of world.orbs) {
    const pulse = 1 + Math.sin(world.time * 5 + orb.x * 0.05) * 0.18;
    ctx.save();
    ctx.shadowColor = PALETTE.orb;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, 5.2 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.orb;
    ctx.fill();
    ctx.restore();
  }
}

function drawParticles(ctx, world) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const particle of world.particles) {
    const fraction = particle.life / particle.maxLife;
    ctx.globalAlpha = fraction;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * fraction + 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawShockRings(ctx, world) {
  for (const ring of world.shockRings) {
    const fraction = ring.life / ring.maxLife;
    ctx.save();
    ctx.globalAlpha = fraction * 0.9;
    ctx.strokeStyle = PALETTE.energy;
    ctx.lineWidth = 3 + fraction * 5;
    ctx.shadowColor = PALETTE.energy;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFloaters(ctx, world) {
  ctx.save();
  ctx.textAlign = 'center';
  for (const floater of world.floaters) {
    const fraction = floater.life / floater.maxLife;
    ctx.globalAlpha = Math.min(1, fraction * 1.6);
    ctx.font = `700 ${floater.size}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = floater.color;
    ctx.fillText(floater.text, floater.x, floater.y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function bar(ctx, x, y, w, h, fraction, color, label) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, fraction)), h);
  ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.textDim;
  ctx.fillText(label, x, y - 6);
}

export function drawHUD(ctx, world) {
  const { width, height } = world;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = PALETTE.textDim;
  ctx.fillText('SCORE', 22, 30);
  ctx.font = '800 30px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = PALETTE.textMain;
  ctx.fillText(String(world.score), 22, 62);

  if (world.combo > 1) {
    ctx.font = '800 19px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.combo;
    ctx.fillText(`COMBO x${world.multiplier().toFixed(1)}  ·  ${world.combo} KILLS`, 22, 90);
    ctx.fillStyle = 'rgba(255, 233, 94, 0.35)';
    ctx.fillRect(22, 97, 150 * Math.max(0, world.comboTimer / 2.6), 3);
  }

  ctx.textAlign = 'center';
  ctx.font = '700 17px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = PALETTE.textMain;
  ctx.fillText(`WAVE ${Math.max(1, world.wave)}`, width / 2, 34);
  ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = PALETTE.textDim;
  const remaining = world.enemies.length + world.spawnQueue.length;
  ctx.fillText(world.phase === 'active' ? `${remaining} HOSTILES LEFT` : ' ', width / 2, 54);

  ctx.textAlign = 'right';
  ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = PALETTE.textDim;
  ctx.fillText('KILLS', width - 22, 30);
  ctx.font = '800 30px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = PALETTE.textMain;
  ctx.fillText(String(world.kills), width - 22, 62);

  const hpFraction = world.player.hp / 100;
  const hpColor = hpFraction > 0.45 ? '#4dff88' : hpFraction > 0.22 ? '#ffd76a' : '#ff5470';
  bar(ctx, 22, height - 34, 210, 11, hpFraction, hpColor, 'HULL');
  const energyFraction = world.player.energy / 100;
  bar(ctx, width - 232, height - 34, 210, 11, energyFraction, PALETTE.energy, 'SHOCKWAVE ENERGY');
  if (energyFraction >= 1) {
    ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.energy;
    const pulse = 0.6 + 0.4 * Math.sin(world.time * 6);
    ctx.globalAlpha = pulse;
    ctx.fillText('SHOCKWAVE READY — PRESS E', width - 22, height - 46);
    ctx.globalAlpha = 1;
  }
  const dashFraction = 1 - Math.max(0, world.player.dashCooldownTimer) / 1.5;
  bar(ctx, 22, height - 62, 120, 6, dashFraction, PALETTE.player, 'DASH');
  ctx.restore();

  if (world.phase === 'intro') {
    ctx.save();
    ctx.textAlign = 'center';
    const scaleIn = 1 - Math.max(0, world.phaseTimer - 1.3) / 0.3;
    ctx.globalAlpha = Math.min(1, scaleIn + 0.2);
    ctx.font = '900 64px "Segoe UI", system-ui, sans-serif';
    ctx.shadowColor = PALETTE.player;
    ctx.shadowBlur = 30;
    ctx.fillStyle = PALETTE.textMain;
    ctx.fillText(`WAVE ${world.wave}`, width / 2, height / 2 - 60);
    ctx.shadowBlur = 0;
    ctx.font = '600 17px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('hostiles inbound — hold the line', width / 2, height / 2 - 28);
    ctx.restore();
  }
}

function glowTitle(ctx, text, x, y, size, color) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `900 ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.shadowColor = color;
  ctx.shadowBlur = 34;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function drawTitleScreen(ctx, world, bestScore) {
  const { width, height } = world;
  drawWorld(ctx, world);
  ctx.save();
  ctx.fillStyle = 'rgba(3, 4, 12, 0.45)';
  ctx.fillRect(0, 0, width, height);
  glowTitle(ctx, 'VOIDPULSE', width / 2, height * 0.3, 92, PALETTE.player);
  ctx.textAlign = 'center';
  ctx.font = '600 19px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = PALETTE.textMain;
  ctx.fillText('NEON ARENA SURVIVAL', width / 2, height * 0.3 + 40);
  ctx.font = '400 16px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = PALETTE.textDim;
  ctx.fillText('The void is spawning shapes again. You are the last bright thing in it.', width / 2, height * 0.3 + 72);

  const controls = [
    'WASD / ARROWS — fly',
    'MOUSE — aim · HOLD LEFT BUTTON — fire',
    'SHIFT / SPACE — dash (briefly untouchable)',
    'E / RIGHT CLICK — shockwave when energy is full',
    'P — pause',
  ];
  ctx.font = '500 15px "Segoe UI", system-ui, sans-serif';
  controls.forEach((line, i) => {
    ctx.fillStyle = i % 2 ? PALETTE.textDim : PALETTE.textMain;
    ctx.fillText(line, width / 2, height * 0.52 + i * 24);
  });

  const pulse = 0.65 + 0.35 * Math.sin(world.time * 3.2);
  ctx.globalAlpha = pulse;
  ctx.font = '800 21px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = PALETTE.combo;
  ctx.fillText('CLICK OR PRESS ENTER TO LAUNCH', width / 2, height * 0.74);
  ctx.globalAlpha = 1;
  if (bestScore > 0) {
    ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(`BEST SCORE  ${bestScore}`, width / 2, height * 0.74 + 34);
  }
  ctx.restore();
}

export function drawGameOverScreen(ctx, world, bestScore, isNewBest) {
  const { width, height } = world;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 2, 8, 0.55)';
  ctx.fillRect(0, 0, width, height);
  glowTitle(ctx, 'SIGNAL LOST', width / 2, height * 0.3, 72, PALETTE.heart);
  ctx.textAlign = 'center';
  ctx.font = '800 44px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = PALETTE.textMain;
  ctx.fillText(String(world.score), width / 2, height * 0.3 + 78);
  ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = PALETTE.textDim;
  ctx.fillText('FINAL SCORE', width / 2, height * 0.3 + 102);
  ctx.font = '500 17px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = PALETTE.textMain;
  ctx.fillText(`Reached wave ${world.wave}  ·  ${world.kills} kills`, width / 2, height * 0.3 + 142);
  if (isNewBest) {
    ctx.font = '800 17px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.combo;
    ctx.fillText('★ NEW BEST ★', width / 2, height * 0.3 + 172);
  } else if (bestScore > 0) {
    ctx.font = '500 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(`Best score  ${bestScore}`, width / 2, height * 0.3 + 172);
  }
  const pulse = 0.65 + 0.35 * Math.sin(world.time * 3.2);
  ctx.globalAlpha = pulse;
  ctx.font = '800 20px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = PALETTE.combo;
  ctx.fillText('PRESS R OR CLICK TO FLY AGAIN', width / 2, height * 0.78);
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawPauseOverlay(ctx, world) {
  const { width, height } = world;
  ctx.save();
  ctx.fillStyle = 'rgba(3, 4, 12, 0.6)';
  ctx.fillRect(0, 0, width, height);
  glowTitle(ctx, 'PAUSED', width / 2, height / 2, 54, PALETTE.player);
  ctx.textAlign = 'center';
  ctx.font = '500 16px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = PALETTE.textDim;
  ctx.fillText('press P to resume', width / 2, height / 2 + 36);
  ctx.restore();
}
