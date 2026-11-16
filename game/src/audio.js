// Sound: every effect is synthesised with WebAudio at runtime — a noise
// burst for a shot, a low drop for an explosion, two notes for a round.
// No audio files, no network, nothing to load.
export function createAudio() {
  let ctx = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return ctx;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    ctx = new AudioContext();
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function noise(when, duration, volume, filterFreq) {
    const c = ensure();
    if (!c) return;
    const source = c.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    source.start(when);
    source.stop(when + duration);
  }

  function tone(when, freq, duration, volume, type = 'sine') {
    const c = ensure();
    if (!c) return;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(when);
    osc.stop(when + duration);
  }

  function drop(when, from, to, duration, volume) {
    const c = ensure();
    if (!c) return;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, when);
    osc.frequency.exponentialRampToValueAtTime(to, when + duration);
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(when);
    osc.stop(when + duration);
  }

  return {
    unlock() { ensure(); },
    shot(kind) {
      const c = ensure();
      if (!c) return;
      const now = c.currentTime;
      if (kind === 'sniper') {
        noise(now, 0.28, 0.5, 900);
        drop(now, 180, 50, 0.22, 0.4);
      } else if (kind === 'smg') {
        noise(now, 0.09, 0.28, 2400);
      } else if (kind === 'pistol') {
        noise(now, 0.12, 0.32, 1600);
      } else {
        noise(now, 0.14, 0.4, 1400);
        drop(now, 150, 60, 0.12, 0.25);
      }
    },
    dryFire() {
      const c = ensure();
      if (!c) return;
      tone(c.currentTime, 1400, 0.03, 0.12, 'square');
    },
    reload() {
      const c = ensure();
      if (!c) return;
      const now = c.currentTime;
      tone(now, 900, 0.04, 0.14, 'square');
      tone(now + 0.18, 600, 0.04, 0.14, 'square');
    },
    hit() {
      const c = ensure();
      if (!c) return;
      tone(c.currentTime, 2100, 0.05, 0.14, 'sine');
    },
    kill() {
      const c = ensure();
      if (!c) return;
      const now = c.currentTime;
      tone(now, 1560, 0.07, 0.16, 'sine');
      tone(now + 0.08, 2100, 0.09, 0.16, 'sine');
    },
    hurt() {
      const c = ensure();
      if (!c) return;
      drop(c.currentTime, 220, 90, 0.18, 0.3);
    },
    explode() {
      const c = ensure();
      if (!c) return;
      const now = c.currentTime;
      noise(now, 0.7, 0.7, 500);
      drop(now, 120, 28, 0.65, 0.6);
    },
    beep() {
      const c = ensure();
      if (!c) return;
      tone(c.currentTime, 1200, 0.09, 0.16, 'square');
    },
    plant() {
      const c = ensure();
      if (!c) return;
      const now = c.currentTime;
      tone(now, 980, 0.08, 0.15, 'square');
      tone(now + 0.12, 980, 0.08, 0.15, 'square');
    },
    roundWin() {
      const c = ensure();
      if (!c) return;
      const now = c.currentTime;
      tone(now, 523, 0.14, 0.18, 'triangle');
      tone(now + 0.14, 784, 0.22, 0.18, 'triangle');
    },
    roundLose() {
      const c = ensure();
      if (!c) return;
      const now = c.currentTime;
      tone(now, 392, 0.16, 0.18, 'triangle');
      tone(now + 0.16, 262, 0.26, 0.18, 'triangle');
    },
    buy() {
      const c = ensure();
      if (!c) return;
      tone(c.currentTime, 880, 0.06, 0.14, 'sine');
    },
  };
}
