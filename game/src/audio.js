// All sound is synthesized with the Web Audio API: no audio files, nothing to load.
// Short oscillator blips with fast envelopes give the game its arcade voice, and a
// slow two-oscillator pulse underneath acts as music. Everything is guarded so the
// game stays silent instead of breaking where audio is unavailable or not yet
// unlocked by a user gesture.

export class SynthAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.lastShootAt = 0;
  }

  unlock() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume();
      return;
    }
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      this.context = new AudioCtor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.context.destination);
    } catch {
      this.context = null;
    }
  }

  tone({ frequency, endFrequency = null, type = 'square', duration = 0.12, volume = 0.5, delay = 0 }) {
    if (!this.context || !this.master) return;
    const start = this.context.currentTime + delay;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (endFrequency !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    }
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  noise({ duration = 0.25, volume = 0.5, delay = 0, low = 400, high = 3000 }) {
    if (!this.context || !this.master) return;
    const start = this.context.currentTime + delay;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(high, start);
    filter.frequency.exponentialRampToValueAtTime(low, start + duration);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(start);
  }

  shoot() {
    const now = performance.now();
    if (now - this.lastShootAt < 45) return;
    this.lastShootAt = now;
    this.tone({ frequency: 880, endFrequency: 320, type: 'square', duration: 0.07, volume: 0.16 });
  }

  hit() {
    this.tone({ frequency: 220, endFrequency: 140, type: 'sawtooth', duration: 0.05, volume: 0.12 });
  }

  explode(big = false) {
    this.noise({ duration: big ? 0.5 : 0.28, volume: big ? 0.6 : 0.38, low: 120, high: 2600 });
    this.tone({
      frequency: big ? 160 : 200, endFrequency: 40, type: 'triangle',
      duration: big ? 0.45 : 0.25, volume: 0.4,
    });
  }

  pickup(step = 0) {
    const base = 620 + (step % 8) * 60;
    this.tone({ frequency: base, endFrequency: base * 1.5, type: 'sine', duration: 0.09, volume: 0.22 });
  }

  hurt() {
    this.tone({ frequency: 140, endFrequency: 60, type: 'sawtooth', duration: 0.3, volume: 0.5 });
    this.noise({ duration: 0.2, volume: 0.3, low: 200, high: 1200 });
  }

  dash() {
    this.noise({ duration: 0.16, volume: 0.2, low: 900, high: 3600 });
  }

  shockwave() {
    this.tone({ frequency: 90, endFrequency: 34, type: 'sine', duration: 0.55, volume: 0.7 });
    this.noise({ duration: 0.5, volume: 0.4, low: 100, high: 2000 });
  }

  waveStart() {
    this.tone({ frequency: 392, type: 'square', duration: 0.1, volume: 0.2 });
    this.tone({ frequency: 587, type: 'square', duration: 0.12, volume: 0.2, delay: 0.09 });
  }

  gameOver() {
    const notes = [392, 330, 262, 196];
    notes.forEach((frequency, i) => {
      this.tone({ frequency, type: 'triangle', duration: 0.24, volume: 0.3, delay: i * 0.16 });
    });
  }

  uiStart() {
    this.tone({ frequency: 523, type: 'square', duration: 0.08, volume: 0.2 });
    this.tone({ frequency: 784, type: 'square', duration: 0.12, volume: 0.2, delay: 0.07 });
  }

  // A slow minor-key pulse: two bars of bass notes with a soft fifth shimmer.
  startMusic() {
    if (!this.context || this.musicTimer !== null) return;
    const bassLine = [55, 55, 82.4, 55, 65.4, 55, 98, 73.4];
    const tick = () => {
      if (!this.context) return;
      const note = bassLine[this.musicStep % bassLine.length];
      this.tone({ frequency: note, type: 'triangle', duration: 0.42, volume: 0.32 });
      if (this.musicStep % 2 === 0) {
        this.tone({ frequency: note * 3, type: 'sine', duration: 0.3, volume: 0.05 });
      }
      this.musicStep += 1;
    };
    tick();
    this.musicTimer = window.setInterval(tick, 340);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
