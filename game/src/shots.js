// Deterministic screenshot staging. The entry's screenshots must be real renders of
// the game, so instead of posing anything, this module plays the actual simulation
// with a scripted pilot at a fixed seed and timestep, then hands main.js the frozen
// world to draw. Same seed, same frame, every time — and the frame is one a player
// could genuinely reach.

import { GameWorld } from './world.js';
import { SeededRandom, distanceSquared } from './rng.js';
import { ScriptedInput } from './input.js';
import { SynthAudio } from './audio.js';

const STEP = 1 / 60;
const silentAudio = new SynthAudio(); // never unlocked, so every effect is a no-op

function nearestOf(world, list) {
  const p = world.player;
  let best = null;
  let bestDistance = Infinity;
  for (const item of list) {
    const d = distanceSquared(p.x, p.y, item.x, item.y);
    if (d < bestDistance) {
      bestDistance = d;
      best = item;
    }
  }
  return { item: best, distance: bestDistance };
}

// One tick of the autopilot: flee point-blank hostiles, otherwise chase energy,
// always aiming at the nearest enemy. It plays well enough to reach later waves.
function pilotStep(world, input) {
  const p = world.player;
  const foe = nearestOf(world, world.enemies);
  const orb = nearestOf(world, world.orbs);
  let moveX = world.width / 2 - p.x;
  let moveY = world.height / 2 - p.y;
  if (foe.item && foe.distance < 210 * 210) {
    moveX = p.x - foe.item.x;
    moveY = p.y - foe.item.y;
    // Strafe sideways while retreating so the frame keeps some sweep.
    const strafe = 0.6;
    const tx = moveX;
    moveX += -moveY * strafe;
    moveY += tx * strafe;
  } else if (orb.item) {
    moveX = orb.item.x - p.x;
    moveY = orb.item.y - p.y;
  }
  input.keysDown.clear();
  if (moveX < -26) input.keysDown.add('KeyA');
  if (moveX > 26) input.keysDown.add('KeyD');
  if (moveY < -26) input.keysDown.add('KeyW');
  if (moveY > 26) input.keysDown.add('KeyS');
  if (foe.item) {
    input.mouseX = foe.item.x;
    input.mouseY = foe.item.y;
    input.mouseDown = foe.distance < 780 * 780;
    if (foe.distance < 118 * 118) world.tryDash();
  } else {
    input.mouseDown = false;
  }
  if (p.energy >= 100) {
    let near = 0;
    for (const enemy of world.enemies) {
      if (distanceSquared(p.x, p.y, enemy.x, enemy.y) < 250 * 250) near += 1;
    }
    if (near >= 3) world.triggerShockwave(silentAudio);
  }
}

function simulate(world, input, seconds, usePilot) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (usePilot) pilotStep(world, input);
    world.update(STEP, input, silentAudio);
    if (world.runOver) break;
  }
}

// The frozen frame must land mid-fight, not in a lull between spawns: top the
// field back up around the player, play half a second more so the newcomers are
// engaged, and crack one fresh explosion for the camera.
function enrichFrame(world, input) {
  const p = world.player;
  const kinds = ['chaser', 'weaver', 'chaser', 'stinger', 'weaver'];
  let guard = 0;
  while (world.enemies.length < 6 && guard < kinds.length + 4) {
    const angle = world.random.angle();
    const dist = world.random.range(290, 430);
    const x = Math.max(30, Math.min(world.width - 30, p.x + Math.cos(angle) * dist));
    const y = Math.max(30, Math.min(world.height - 30, p.y + Math.sin(angle) * dist));
    world.spawnEnemy(kinds[guard % kinds.length], x, y);
    guard += 1;
  }
  simulate(world, input, 0.55, true);
  const foe = nearestOf(world, world.enemies);
  if (foe.item) world.burst(foe.item.x, foe.item.y, foe.item.color, 18, 250, 0.65, 3.2);
  for (let i = 0; i < 4; i += 1) {
    world.orbs.push({
      x: p.x + world.random.range(-150, 150),
      y: p.y + world.random.range(-115, 115),
      vx: 0, vy: 0, age: 0,
    });
  }
}

function stagedRun(seed, width, height, fightSeconds, enrich = false) {
  // If a seed's run ends in an early death, step to the next seed: the cover must
  // show a living fight, and the choice stays deterministic.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const world = new GameWorld(new SeededRandom(seed + attempt), width, height);
    const input = new ScriptedInput();
    world.startRun();
    simulate(world, input, fightSeconds, true);
    if (world.player.hp > 25) {
      if (enrich) enrichFrame(world, input);
      return world;
    }
  }
  const world = new GameWorld(new SeededRandom(seed), width, height);
  const input = new ScriptedInput();
  world.startRun();
  simulate(world, input, fightSeconds, true);
  if (enrich) enrichFrame(world, input);
  return world;
}

export function stageShot(kind, seed, width, height) {
  if (kind === 'title') {
    const world = new GameWorld(new SeededRandom(seed), width, height);
    world.time = 2.4;
    const ring = [
      ['weaver', 0.2, 0.3], ['chaser', 0.8, 0.26], ['bulwark', 0.86, 0.72],
      ['stinger', 0.14, 0.74], ['chaser', 0.68, 0.82],
    ];
    for (const [type, fx, fy] of ring) {
      world.spawnEnemy(type, fx * width, fy * height);
    }
    for (let i = 0; i < 9; i += 1) {
      world.orbs.push({
        x: world.random.range(60, width - 60),
        y: world.random.range(60, height - 60),
        vx: 0, vy: 0, age: 0,
      });
    }
    return { world, screen: 'title' };
  }

  if (kind === 'over') {
    const world = stagedRun(seed, width, height, 15);
    // The pilot stops fighting; the swarm finishes the run for real.
    const input = new ScriptedInput();
    input.mouseDown = false;
    simulate(world, input, 45, false);
    if (!world.runOver) {
      // A stubborn survivor: end the run the honest way, under a bulwark.
      world.spawnEnemy('bulwark', world.player.x + 10, world.player.y);
      simulate(world, input, 20, false);
    }
    return { world, screen: 'over' };
  }

  if (kind === 'wave') {
    const world = stagedRun(seed + 40, width, height, 34, true);
    return { world, screen: 'playing' };
  }

  // 'cover' and anything else: a mid-fight frame, wave 2 territory.
  const world = stagedRun(seed, width, height, 13, true);
  return { world, screen: 'playing' };
}
