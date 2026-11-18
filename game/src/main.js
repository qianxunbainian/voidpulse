// VOIDPULSE entry point: owns the canvas, the screen state machine
// (title -> playing -> paused -> game over -> restart) and the frame loop.
// The rules live in world.js, the painting in render.js; this file only
// connects them to the player, the clock and the browser window.

import { GameWorld } from './world.js';
import { SeededRandom } from './rng.js';
import { InputTracker, ScriptedInput } from './input.js';
import { SynthAudio } from './audio.js';
import {
  drawWorld, drawHUD, drawTitleScreen, drawGameOverScreen, drawPauseOverlay,
} from './render.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusLine = document.getElementById('status');
const audio = new SynthAudio();

let viewWidth = 1280;
let viewHeight = 800;

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  viewWidth = window.innerWidth;
  viewHeight = window.innerHeight;
  canvas.width = Math.floor(viewWidth * dpr);
  canvas.height = Math.floor(viewHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function loadBestScore() {
  try {
    return Number(window.localStorage.getItem('voidpulse-best')) || 0;
  } catch {
    return 0;
  }
}

function saveBestScore(value) {
  try {
    window.localStorage.setItem('voidpulse-best', String(value));
  } catch {
    // Storage can be unavailable (private mode, sandboxed frame); the game plays on.
  }
}

let bestScore = loadBestScore();
let isNewBest = false;
let screen = 'title';
let world = new GameWorld(new SeededRandom(Date.now() % 2147483647), viewWidth, viewHeight);
const input = new InputTracker(canvas);
input.attach();

// The title backdrop is a living world: a few hostiles circle the ship while it
// waits, kept harmless by a permanent invulnerability flag on the attract player.
const attractWorld = new GameWorld(new SeededRandom(4242), viewWidth, viewHeight);
{
  const spots = [
    ['weaver', 0.18, 0.3], ['chaser', 0.82, 0.24], ['bulwark', 0.85, 0.74],
    ['stinger', 0.12, 0.72], ['chaser', 0.3, 0.85],
  ];
  for (const [type, fx, fy] of spots) {
    attractWorld.spawnEnemy(type, fx * viewWidth, fy * viewHeight);
  }
}
const idleInput = new ScriptedInput();

function announce(text) {
  if (statusLine) statusLine.textContent = text;
}

function startRun() {
  audio.unlock();
  audio.uiStart();
  audio.startMusic();
  world = new GameWorld(new SeededRandom(Date.now() % 2147483647), viewWidth, viewHeight);
  world.startRun();
  isNewBest = false;
  screen = 'playing';
  announce('Run started. Wave 1.');
}

function finishRun() {
  screen = 'over';
  audio.stopMusic();
  if (world.score > bestScore) {
    bestScore = world.score;
    isNewBest = true;
    saveBestScore(bestScore);
  }
  announce(`Game over. Final score ${world.score}, reached wave ${world.wave}.`);
}

function handleScreenInput() {
  const launchPressed = input.pressed('Enter') || input.pressed('NumpadEnter') || input.takeMousePressed();
  if (screen === 'title' && launchPressed) {
    startRun();
    return;
  }
  if (screen === 'over' && (launchPressed || input.pressed('KeyR'))) {
    startRun();
    return;
  }
  if (screen === 'playing' && (input.pressed('KeyP') || input.pressed('Escape'))) {
    screen = 'paused';
    announce('Paused.');
    return;
  }
  if (screen === 'paused' && (input.pressed('KeyP') || input.pressed('Escape') || input.takeMousePressed())) {
    screen = 'playing';
    announce('Resumed.');
  }
}

let lastTimestamp = 0;
let lastAnnouncedScore = -1;

function frame(timestamp) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 0.016);
  lastTimestamp = timestamp;

  if (screen === 'title') {
    attractWorld.time += dt;
    attractWorld.player.invulnTimer = 1;
    idleInput.mouseX = attractWorld.player.x + 160;
    idleInput.mouseY = attractWorld.player.y - 60;
    attractWorld.update(dt, idleInput, null);
    drawTitleScreen(ctx, attractWorld, bestScore);
  } else if (screen === 'playing') {
    world.update(dt, input, audio);
    ctx.save();
    if (world.shakePower > 0) {
      const power = world.shakePower;
      ctx.translate((Math.random() - 0.5) * 2 * power, (Math.random() - 0.5) * 2 * power);
    }
    drawWorld(ctx, world);
    ctx.restore();
    drawHUD(ctx, world);
    if (world.runOver) finishRun();
    if (world.score !== lastAnnouncedScore && world.score % 500 < 40) {
      lastAnnouncedScore = world.score;
      announce(`Score ${world.score}, wave ${world.wave}, hull ${Math.ceil(world.player.hp)}.`);
    }
  } else if (screen === 'paused') {
    drawWorld(ctx, world);
    drawHUD(ctx, world);
    drawPauseOverlay(ctx, world);
  } else if (screen === 'over') {
    world.time += dt;
    drawWorld(ctx, world);
    drawGameOverScreen(ctx, world, bestScore, isNewBest);
  }

  handleScreenInput();
  input.endFrame();
}

// Screenshot staging: ?shot=cover|title|wave|over&seed=N freezes a real simulated
// frame (see shots.js) so the maker's screenshots are the game itself, reproducibly.
const params = new URLSearchParams(window.location.search);
if (params.has('shot')) {
  resizeCanvas();
  const kind = params.get('shot') || 'cover';
  const seed = Number(params.get('seed')) || 1;
  const staged = stageShot(kind, seed, viewWidth, viewHeight);
  const stagedWorld = staged.world;
  const stagedScreen = staged.screen;
  const drawStaged = (timestamp) => {
    requestAnimationFrame(drawStaged);
    stagedWorld.time += 0.016;
    if (stagedScreen === 'title') {
      drawTitleScreen(ctx, stagedWorld, 0);
    } else if (stagedScreen === 'over') {
      drawWorld(ctx, stagedWorld);
      drawGameOverScreen(ctx, stagedWorld, stagedWorld.score, false);
    } else {
      drawWorld(ctx, stagedWorld);
      drawHUD(ctx, stagedWorld);
    }
    lastTimestamp = timestamp;
  };
  requestAnimationFrame(drawStaged);
} else {
  resizeCanvas();
  world.resize(viewWidth, viewHeight);
  attractWorld.resize(viewWidth, viewHeight);
  window.addEventListener('resize', () => {
    resizeCanvas();
    world.resize(viewWidth, viewHeight);
    attractWorld.resize(viewWidth, viewHeight);
  });
  window.addEventListener('blur', () => {
    if (screen === 'playing') screen = 'paused';
  });
  canvas.addEventListener('pointerdown', () => audio.unlock());
  window.addEventListener('keydown', () => audio.unlock());
  announce('VOIDPULSE. Press Enter or click to launch.');
  requestAnimationFrame(frame);
}
