// Dezente Klänge über WebAudio – keine Audiodateien nötig.
let ctx = null;

function tone(freq, start, duration, type = 'sine', gain = 0.08) {
  try {
    ctx = ctx || new AudioContext();
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t = ctx.currentTime + start;
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  } catch {
    // Audio nicht verfügbar – stumm weiter
  }
}

export const sounds = {
  move: () => tone(220, 0, 0.06, 'triangle', 0.12),
  correct: () => {
    tone(660, 0, 0.12);
    tone(880, 0.08, 0.16);
  },
  wrong: () => tone(160, 0, 0.25, 'sawtooth', 0.05),
  done: () => {
    tone(523, 0, 0.12);
    tone(659, 0.1, 0.12);
    tone(784, 0.2, 0.25);
  },
};
