/** Live Web Audio chiptune and effects. No sample files. */

const SCALE = [220, 246.94, 261.63, 293.66, 329.63, 349.23, 392, 440, 493.88, 523.25];
const LEAD = [0, 4, 7, 4, 9, 7, 4, 2, 0, 3, 7, 3, 5, 8, 5, 3];
const BASS = [0, 0, 5, 5, 3, 3, 4, 4];

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let noise = null;
  let nextNote = 0;
  let step = 0;
  const lastSfx = {};

  function ensure() {
    if (ctx) return true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      ctx = new AudioCtx();
    } catch {
      ctx = null;
      return false;
    }
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.14;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.8;
    sfxGain.connect(master);
    const length = Math.floor(ctx.sampleRate * 0.5);
    noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let state = 0x12345678;
    for (let i = 0; i < length; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) | 0;
      data[i] = ((state >>> 0) / 4294967296) * 2 - 1;
    }
    nextNote = ctx.currentTime + 0.05;
    return true;
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume();
  }

  function setMix(game) {
    if (!master) return;
    const level = game.muted ? 0 : game.volume;
    master.gain.setTargetAtTime(level, ctx.currentTime, 0.04);
  }

  function tone(time, freq, dur, type, gainValue, destination) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, gainValue), time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  function burst(time, dur, gainValue) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    src.start(time);
    src.stop(time + dur);
  }

  function allow(type, gap) {
    const now = ctx.currentTime;
    if (lastSfx[type] != null && now - lastSfx[type] < gap) return false;
    lastSfx[type] = now;
    return true;
  }

  function pumpMusic() {
    const horizon = ctx.currentTime + 0.28;
    while (nextNote < horizon) {
      const lead = SCALE[LEAD[step % LEAD.length]];
      tone(nextNote, lead, 0.16, "square", 0.18, musicGain);
      tone(nextNote, lead * 2, 0.08, "square", 0.05, musicGain);
      if (step % 2 === 0) {
        const bass = SCALE[BASS[(step / 2) % BASS.length]] / 2;
        tone(nextNote, bass, 0.28, "triangle", 0.22, musicGain);
      }
      nextNote += 0.17;
      step += 1;
    }
  }

  function consume(events, game) {
    if (!events || !events.length) {
      if (ctx) {
        setMix(game);
        pumpMusic();
      }
      return;
    }
    unlock();
    if (!ctx) return;
    setMix(game);
    pumpMusic();
    const now = ctx.currentTime;
    for (const event of events) {
      if (event.type === "bumper" && allow("bumper", 0.045)) {
        burst(now, 0.09, 0.28);
        tone(now, 180, 0.08, "square", 0.2, sfxGain);
      } else if (event.type === "flip" && allow("flip", 0.05)) {
        tone(now, 520, 0.07, "square", 0.12, sfxGain);
      } else if (event.type === "spin" && allow("spin", 0.06)) {
        tone(now, 740, 0.05, "sawtooth", 0.08, sfxGain);
      } else if (event.type === "target" && allow("target", 0.05)) {
        tone(now, 660, 0.09, "square", 0.14, sfxGain);
      } else if (event.type === "power") {
        const base = event.kind === "shield" ? 523 : event.kind === "wide" ? 659 : 392;
        tone(now, base, 0.12, "square", 0.18, sfxGain);
        tone(now + 0.09, base * 1.25, 0.12, "square", 0.16, sfxGain);
        tone(now + 0.18, base * 1.5, 0.18, "triangle", 0.18, sfxGain);
      } else if (event.type === "drain" || event.type === "ko") {
        burst(now, 0.18, 0.22);
        tone(now, 320, 0.16, "sawtooth", 0.18, sfxGain);
        tone(now + 0.1, 180, 0.22, "triangle", 0.2, sfxGain);
      } else if (event.type === "tilt") {
        burst(now, 0.25, 0.35);
        tone(now, 90, 0.3, "sawtooth", 0.22, sfxGain);
      } else if (event.type === "countdown") {
        const high = event.n === 1;
        tone(now, high ? 880 : 660, 0.12, "square", 0.2, sfxGain);
      } else if (event.type === "go") {
        tone(now, 523, 0.1, "square", 0.18, sfxGain);
        tone(now + 0.08, 784, 0.14, "square", 0.18, sfxGain);
      } else if (event.type === "round") {
        [523, 659, 784, 1046].forEach((freq, index) => {
          tone(now + index * 0.09, freq, 0.18, "square", 0.16, sfxGain);
        });
      } else if (event.type === "match") {
        [392, 523, 659, 784, 1046].forEach((freq, index) => {
          tone(now + index * 0.11, freq, 0.22, "triangle", 0.2, sfxGain);
        });
      }
    }
  }

  return { unlock, consume };
}
