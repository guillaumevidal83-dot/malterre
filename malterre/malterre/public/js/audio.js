/* Malterre — sons, ambiance et musique générés par le navigateur (aucun fichier audio), plus vibrations. */
'use strict';
const Sound = (function () {
  let ctx = null, master, sfxG, musG, ambG, noiseBuf, ambFilter, ambDrone, ambDroneG, musicTimer = null, step = 0, tier = 1, birdT = 0;
  const set = { sfx: 0.8, music: 0.5, vib: true };
  try { Object.assign(set, JSON.parse(localStorage.getItem('malterre_audio') || '{}')); } catch (e) { /* réglages par défaut */ }
  const save = () => { try { localStorage.setItem('malterre_audio', JSON.stringify(set)); } catch (e) { /* stockage indisponible */ } };

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createDynamicsCompressor(); master.connect(ctx.destination);
    sfxG = ctx.createGain(); sfxG.gain.value = set.sfx; sfxG.connect(master);
    musG = ctx.createGain(); musG.gain.value = set.music * 0.5; musG.connect(master);
    ambG = ctx.createGain(); ambG.gain.value = set.music * 0.6; ambG.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Ambiance : vent filtré + bourdon grave selon la zone.
    const wind = ctx.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
    ambFilter = ctx.createBiquadFilter(); ambFilter.type = 'bandpass'; ambFilter.frequency.value = 500; ambFilter.Q.value = 0.6;
    const windG = ctx.createGain(); windG.gain.value = 0.12;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13; const lfoG = ctx.createGain(); lfoG.gain.value = 0.07; lfo.connect(lfoG); lfoG.connect(windG.gain); lfo.start();
    wind.connect(ambFilter); ambFilter.connect(windG); windG.connect(ambG); wind.start();
    ambDrone = ctx.createOscillator(); ambDrone.type = 'sawtooth'; ambDrone.frequency.value = 55;
    const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 160;
    ambDroneG = ctx.createGain(); ambDroneG.gain.value = 0; ambDrone.connect(df); df.connect(ambDroneG); ambDroneG.connect(ambG); ambDrone.start();
    musicTimer = setInterval(music, 500);
  }

  function tone(f0, f1, dur, type, vol, delay, dest) {
    if (!ctx) return;
    const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxG); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, freq, type, f1, delay) {
    if (!ctx) return;
    const t = ctx.currentTime + (delay || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loopStart = Math.random(); f.type = type || 'lowpass'; f.frequency.setValueAtTime(freq, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxG); s.start(t, Math.random() * 1.5, dur + 0.05);
  }

  const SFX = {
    swing: v => noise(0.14, 0.25 * v, 900, 'bandpass', 2600),
    hit: v => { noise(0.1, 0.5 * v, 1400, 'lowpass', 300); tone(160, 70, 0.1, 'square', 0.18 * v); },
    crit: v => { noise(0.16, 0.6 * v, 2600, 'lowpass', 300); tone(240, 60, 0.16, 'square', 0.25 * v); tone(900, 1400, 0.1, 'triangle', 0.15 * v); },
    bolt: v => { tone(700, 180, 0.22, 'sawtooth', 0.14 * v); noise(0.2, 0.2 * v, 3000, 'bandpass', 600); },
    bigbolt: v => { tone(900, 90, 0.4, 'sawtooth', 0.22 * v); noise(0.35, 0.3 * v, 4000, 'bandpass', 300); tone(110, 55, 0.4, 'sine', 0.3 * v, 0.1); },
    nova: v => { noise(0.7, 0.4 * v, 6000, 'highpass', 1500); tone(1400, 300, 0.6, 'triangle', 0.16 * v); tone(2100, 500, 0.5, 'sine', 0.1 * v, 0.05); },
    raise: v => { tone(70, 160, 0.8, 'sawtooth', 0.2 * v); noise(0.8, 0.2 * v, 300, 'lowpass', 1200); tone(330, 440, 0.5, 'triangle', 0.1 * v, 0.3); },
    smash: v => { noise(0.35, 0.8 * v, 500, 'lowpass', 80); tone(110, 35, 0.35, 'sine', 0.6 * v); },
    bomb: v => { noise(0.6, 0.9 * v, 1800, 'lowpass', 60); tone(90, 30, 0.5, 'sine', 0.6 * v); },
    warcry: v => { tone(196, 262, 0.35, 'sawtooth', 0.2 * v); tone(262, 392, 0.6, 'sawtooth', 0.2 * v, 0.3); noise(0.8, 0.1 * v, 900, 'bandpass'); },
    slam: v => { noise(0.8, 1.0 * v, 300, 'lowpass', 40); tone(60, 25, 0.8, 'sine', 0.8 * v); },
    hurt: v => { tone(300, 120, 0.18, 'sawtooth', 0.2 * v); noise(0.1, 0.3 * v, 800); },
    mobdie: v => { tone(260, 60, 0.3, 'sawtooth', 0.16 * v); noise(0.25, 0.25 * v, 1200, 'lowpass', 150); },
    miniondie: v => { tone(500, 140, 0.25, 'triangle', 0.16 * v); noise(0.12, 0.15 * v, 2500, 'highpass'); },
    death: v => { tone(220, 55, 1.0, 'sawtooth', 0.25 * v); tone(165, 41, 1.2, 'sine', 0.3 * v, 0.1); },
    loot: v => { tone(1320, 1320, 0.07, 'square', 0.07 * v); tone(1760, 1760, 0.12, 'square', 0.07 * v, 0.07); },
    levelup: v => { [392, 494, 587, 784].forEach((f, i) => tone(f, f, 0.3, 'triangle', 0.2 * v, i * 0.11)); tone(784, 784, 0.7, 'sine', 0.15 * v, 0.44); },
    build: v => { for (let i = 0; i < 3; i++) { noise(0.07, 0.4 * v, 1800, 'bandpass', null, i * 0.16); tone(200, 120, 0.07, 'square', 0.12 * v, i * 0.16); } tone(523, 784, 0.4, 'triangle', 0.15 * v, 0.5); },
    summon: v => { tone(120, 480, 0.45, 'sine', 0.2 * v); noise(0.4, 0.12 * v, 2000, 'bandpass', 5000); },
    click: v => tone(660, 520, 0.05, 'square', 0.06 * v),
    error: v => { tone(180, 150, 0.12, 'square', 0.12 * v); tone(140, 120, 0.16, 'square', 0.12 * v, 0.1); },
    recall: v => { tone(300, 1200, 0.5, 'sine', 0.15 * v); noise(0.5, 0.1 * v, 500, 'bandpass', 5000); },
    alert: v => { tone(880, 880, 0.12, 'square', 0.12 * v); tone(880, 880, 0.12, 'square', 0.12 * v, 0.2); },
    step: v => noise(0.05, 0.07 * v, 500, 'lowpass'),
  };

  // Musique : nappe lente en mineur, quelques notes de harpe par-dessus.
  const CHORDS = [[110, 130.8, 164.8], [87.3, 110, 130.8], [98, 123.5, 146.8], [82.4, 98, 123.5]];
  const SCALE = [220, 246.9, 261.6, 293.7, 329.6, 349.2, 392, 440];
  function music() {
    if (!ctx || ctx.state !== 'running') return;
    if (step % 16 === 0) { const ch = CHORDS[(step / 16) % 4 | 0]; for (const f of ch) { tone(f, f, 7.8, 'triangle', 0.06, 0, musG); tone(f * 2.005, f * 2.005, 7.8, 'sine', 0.025, 0, musG); } }
    if (step % 2 === 0 && Math.random() < (tier >= 3 ? 0.2 : 0.45)) { const f = SCALE[Math.random() * SCALE.length | 0] * (tier >= 3 ? 0.5 : 1); tone(f, f, 1.6, 'sine', 0.05, Math.random() * 0.2, musG); }
    step++;
    // Oiseaux en zone calme.
    if (tier === 1 && --birdT <= 0) { birdT = 6 + Math.random() * 14; const f = 2200 + Math.random() * 1400; for (let i = 0; i < 3; i++) tone(f, f * 1.25, 0.09, 'sine', 0.03, i * 0.13, ambG); }
  }

  return {
    set, init,
    play(name, dist) { if (!ctx || set.sfx <= 0) return; const v = dist ? 1 / (1 + dist * dist / 400) : 1; if (v < 0.05) return; const f = SFX[name]; if (f) f(v); },
    vibrate(p) { if (set.vib && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) { /* non géré */ } } },
    canVibrate: () => !!navigator.vibrate,
    setTier(t) {
      if (t === tier) return; tier = t; if (!ctx) return;
      const n = ctx.currentTime;
      ambFilter.frequency.linearRampToValueAtTime(t === 1 ? 500 : t === 2 ? 320 : 180, n + 3);
      ambDroneG.gain.linearRampToValueAtTime(t === 1 ? 0 : t === 2 ? 0.05 : 0.12, n + 3);
      ambDrone.frequency.linearRampToValueAtTime(t >= 3 ? 46 : 55, n + 3);
    },
    volume(kind, v) { set[kind] = v; save(); if (!ctx) return; if (kind === 'sfx') sfxG.gain.value = v; else { musG.gain.value = v * 0.5; ambG.gain.value = v * 0.6; } },
    setVib(on) { set.vib = on; save(); },
  };
})();
