// Keyboard and mouse state for the game.
// The simulation polls this tracker each frame instead of reacting to events directly,
// which keeps controls responsive (held keys are read every tick) and lets the staged
// screenshot runs in shots.js drive the same interface with a scripted pilot.

export class InputTracker {
  constructor(target) {
    this.target = target;
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mousePressed = false;
    this.rightPressed = false;
    this.enabled = true;
    this.boundHandlers = null;
  }

  attach() {
    const onKeyDown = (event) => {
      if (!this.enabled) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
      if (!event.repeat) this.keysPressed.add(event.code);
      this.keysDown.add(event.code);
    };
    const onKeyUp = (event) => {
      this.keysDown.delete(event.code);
    };
    const onMouseMove = (event) => {
      const rect = this.target.getBoundingClientRect();
      this.mouseX = event.clientX - rect.left;
      this.mouseY = event.clientY - rect.top;
    };
    const onMouseDown = (event) => {
      if (!this.enabled) return;
      if (event.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
      }
      if (event.button === 2) this.rightPressed = true;
    };
    const onMouseUp = (event) => {
      if (event.button === 0) this.mouseDown = false;
    };
    const onContextMenu = (event) => event.preventDefault();
    const onBlur = () => {
      this.keysDown.clear();
      this.mouseDown = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    this.target.addEventListener('mousemove', onMouseMove);
    this.target.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    this.target.addEventListener('contextmenu', onContextMenu);
    this.boundHandlers = {
      onKeyDown, onKeyUp, onMouseMove, onMouseDown, onMouseUp, onContextMenu, onBlur,
    };
  }

  detach() {
    if (!this.boundHandlers) return;
    const h = this.boundHandlers;
    window.removeEventListener('keydown', h.onKeyDown);
    window.removeEventListener('keyup', h.onKeyUp);
    window.removeEventListener('blur', h.onBlur);
    this.target.removeEventListener('mousemove', h.onMouseMove);
    this.target.removeEventListener('mousedown', h.onMouseDown);
    window.removeEventListener('mouseup', h.onMouseUp);
    this.target.removeEventListener('contextmenu', h.onContextMenu);
    this.boundHandlers = null;
  }

  isDown(code) {
    return this.keysDown.has(code);
  }

  // Edge-triggered read: true once per physical press, then consumed.
  pressed(code) {
    if (!this.keysPressed.has(code)) return false;
    this.keysPressed.delete(code);
    return true;
  }

  takeMousePressed() {
    const was = this.mousePressed;
    this.mousePressed = false;
    return was;
  }

  takeRightPressed() {
    const was = this.rightPressed;
    this.rightPressed = false;
    return was;
  }

  endFrame() {
    this.keysPressed.clear();
    this.mousePressed = false;
    this.rightPressed = false;
  }

  // Movement axes from either WASD or the arrow keys, each in -1..1.
  moveAxes() {
    let x = 0;
    let y = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y += 1;
    return { x, y };
  }
}

// A scripted stand-in with the same polling surface, used by shots.js so staged
// screenshots play the real simulation instead of posing a fake scene.
export class ScriptedInput {
  constructor() {
    this.keysDown = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
  }

  isDown(code) {
    return this.keysDown.has(code);
  }

  pressed() {
    return false;
  }

  takeMousePressed() {
    return false;
  }

  takeRightPressed() {
    return false;
  }

  endFrame() {}

  moveAxes() {
    let x = 0;
    let y = 0;
    if (this.keysDown.has('KeyA')) x -= 1;
    if (this.keysDown.has('KeyD')) x += 1;
    if (this.keysDown.has('KeyW')) y -= 1;
    if (this.keysDown.has('KeyS')) y += 1;
    return { x, y };
  }
}
