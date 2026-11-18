# VOIDPULSE — Neon Arena Survival

An original twin-stick arena survival game in dependency-free JavaScript.
The void is spawning shapes again; you are the last bright thing in it.
Fly, shoot, dash through danger, gather the energy your kills spill, and
spend a full charge on a shockwave that clears the screen around you.
Survive escalating waves of four enemy archetypes and chase the combo
multiplier — every kill in quick succession pays more than the last.

## Play it

Serve the `game/` folder with any static file server and open `index.html`
in a desktop browser. No build step, no network requests: every script is
a file in the folder and all sound is synthesized live with Web Audio.

```
python3 -m http.server 8080 --directory game
# then open localhost:8080 in Chrome
```

## Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Fly |
| Mouse | Aim |
| Hold left mouse button (or J) | Fire the pulse cannon |
| Shift / Space | Dash — a short burst, untouchable while it lasts |
| E / right click | Shockwave, once energy is full |
| P / Esc | Pause |
| Enter / click | Start, restart |

## The game loop

Title screen → wave 1 → clear the wave for a bonus → the next wave is
bigger, faster and tougher → lose your hull and the run ends on a results
screen with your score, wave and kill count → restart in one keypress.
Chasers hunt you, Weavers strafe in sine paths, Stingers telegraph and
lunge, and Bulwarks shrug off fire before splitting into Chasers. Kills
drop energy orbs: collect them to charge the shockwave and to keep your
combo — and your score multiplier — alive.

## Files

- `game/index.html` — the page and the canvas.
- `game/src/main.js` — bootstrap, screen state machine, frame loop.
- `game/src/world.js` — the simulation: player, enemies, waves, collisions.
- `game/src/render.js` — all drawing: backdrop, entities, HUD, screens.
- `game/src/config.js` — palette and every balance number.
- `game/src/input.js` — keyboard/mouse polling, plus a scripted pilot input.
- `game/src/audio.js` — the Web Audio synthesizer (effects and music pulse).
- `game/src/rng.js` — seeded randomness and math helpers.
- `game/src/shots.js` — deterministic screenshot staging: the bundled
  screenshots are real frames of this simulation, replayed from a seed.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to
  the output directory and writes `dossier.json` (see `vendor/`).
- `screenshots/` — four captures of the game itself: action cover, title,
  a later wave, and the results screen.

MIT licensed — see `LICENSE`.
