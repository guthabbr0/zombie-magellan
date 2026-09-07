/* ============================================================
   Procedural audio (WebAudio, no samples)
   ============================================================ */
const A = { ctx: null, ok: false, listener: { pos: [0, 1.6, 0], fwd: [0, 0, -1], right: [1, 0, 0] }, voices: { groan: 0, shot: 0 }, loops: {}, intensity: 0, musicOn: true, time: 0 };
A.init = function () {
  if (A.ctx) return;
  try { A.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); } catch (e) { return; }
  const c = A.ctx; A.ok = true;
  A.master = c.createGain(); A.comp = c.createDynamicsCompressor(); A.comp.threshold.value = -14; A.comp.ratio.value = 4; A.comp.attack.value = 0.003; A.comp.release.value = 0.2;
  A.master.connect(A.comp); A.comp.connect(c.destination);
  A.sfx = c.createGain(); A.music = c.createGain(); A.amb = c.createGain(); A.sfx.connect(A.master); A.music.connect(A.master); A.amb.connect(A.master);
  // reverb (outdoor: short, dense)
  A.reverb = c.createConvolver(); const len = Math.floor(c.sampleRate * 1.6); const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2) * (i < 800 ? i / 800 : 1) * 0.5; } }
  A.reverb.buffer = ir; A.revGain = c.createGain(); A.revGain.gain.value = 0.35; A.reverb.connect(A.revGain); A.revGain.connect(A.master);
  A.revSend = c.createGain(); A.revSend.gain.value = 1; A.revSend.connect(A.reverb);
  // noise buffers
  const nl = c.sampleRate * 2; A.noise = c.createBuffer(1, nl, c.sampleRate); const nd = A.noise.getChannelData(0); for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
  A.pink = c.createBuffer(1, nl, c.sampleRate); const pd = A.pink.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < nl; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; pd[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
  A.applyVolumes();
  A.startAmbience();
};
A.applyVolumes = function () { if (!A.ok) return; A.master.gain.value = S.master; A.sfx.gain.value = S.sfx; A.music.gain.value = S.music; A.amb.gain.value = S.ambience; };
A.resume = function () { if (A.ctx && A.ctx.state !== 'running') A.ctx.resume(); };
A.now = () => A.ctx ? A.ctx.currentTime : 0;
// spatial chain: source -> lowpass(distance) -> gain(distance) -> panner -> bus (+ reverb send)
A.spatial = function (pos, bus, opts = {}) {
  const c = A.ctx; const g = c.createGain(); const lp = c.createBiquadFilter(); lp.type = 'lowpass';
  let vol = 1, pan = 0, cut = 18000;
  if (pos) { const L = A.listener; const dx = pos[0] - L.pos[0], dy = pos[1] - L.pos[1], dz = pos[2] - L.pos[2]; const d = Math.hypot(dx, dy, dz);
    const ref = opts.ref || 6; vol = 1 / (1 + Math.pow(d / ref, 1.7)); if (d > (opts.maxDist || 80)) vol = 0;
    const l = d || 1; pan = clamp((dx / l) * L.right[0] + (dz / l) * L.right[2], -1, 1) * 0.8; cut = lerp(18000, 900, clamp(d / 50, 0, 1)); }
  lp.frequency.value = cut; g.gain.value = vol * (opts.vol || 1);
  let out = g; if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
  lp.connect(g); out.connect(bus || A.sfx); if (opts.reverb) { const rs = c.createGain(); rs.gain.value = opts.reverb * vol; out.connect(rs); rs.connect(A.revSend); }
  return { input: lp, gain: g, vol };
};
A.noiseSrc = function (pink) { const s = A.ctx.createBufferSource(); s.buffer = pink ? A.pink : A.noise; s.loop = true; s.playbackRate.value = 0.8 + Math.random() * 0.4; return s; };
A.env = function (param, t0, a, peak, d, sustainLevel, s, r) { param.setValueAtTime(0.0001, t0); param.linearRampToValueAtTime(peak, t0 + a); param.exponentialRampToValueAtTime(Math.max(sustainLevel || peak * 0.3, 0.0001), t0 + a + d); if (s) param.setValueAtTime(Math.max(sustainLevel, 0.0001), t0 + a + d + s); param.exponentialRampToValueAtTime(0.0001, t0 + a + d + (s || 0) + (r || 0.05)); };
// ---- one-shots ----
A.gunshot = function (type, pos) {
  if (!A.ok || A.voices.shot > 10) return; A.voices.shot++; setTimeout(() => A.voices.shot--, 400);
  const c = A.ctx, t = c.currentTime; const sp = A.spatial(pos, A.sfx, { vol: 1, reverb: 0.7, ref: 10 }); if (sp.vol <= 0) return;
  const cfg = type === 'shotgun' ? { f: 900, q: 0.5, d: 0.28, thump: 52, td: 0.32, vol: 1.3 } : type === 'pistol' ? { f: 2400, q: 0.8, d: 0.10, thump: 130, td: 0.12, vol: 0.9 } : { f: 1500, q: 0.7, d: 0.14, thump: 85, td: 0.16, vol: 1.0 };
  const n = A.noiseSrc(false); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(cfg.f * 2, t); bp.frequency.exponentialRampToValueAtTime(cfg.f * 0.5, t + cfg.d); bp.Q.value = cfg.q;
  const g = c.createGain(); A.env(g.gain, t, 0.002, cfg.vol, cfg.d, 0.05, 0, 0.12); n.connect(bp); bp.connect(g); g.connect(sp.input); n.start(t); n.stop(t + cfg.d + 0.3);
  const crack = A.noiseSrc(false); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500; const cg = c.createGain(); A.env(cg.gain, t, 0.001, cfg.vol * 0.8, 0.012, 0.01, 0, 0.02); crack.connect(hp); hp.connect(cg); cg.connect(sp.input); crack.start(t); crack.stop(t + 0.06);
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(cfg.thump * 1.6, t); o.frequency.exponentialRampToValueAtTime(cfg.thump * 0.6, t + cfg.td); const og = c.createGain(); A.env(og.gain, t, 0.003, cfg.vol * 0.9, cfg.td, 0.02, 0, 0.05); o.connect(og); og.connect(sp.input); o.start(t); o.stop(t + cfg.td + 0.1);
  if (type === 'shotgun') { const n2 = A.noiseSrc(true); const lp2 = c.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 500; const g2 = c.createGain(); A.env(g2.gain, t, 0.004, 0.9, 0.35, 0.05, 0, 0.15); n2.connect(lp2); lp2.connect(g2); g2.connect(sp.input); n2.start(t); n2.stop(t + 0.7); }
};
A.click = function (freq = 3000, vol = 0.25, pos, dur = 0.02) { if (!A.ok) return; const c = A.ctx, t = c.currentTime; const sp = A.spatial(pos, A.sfx, { vol, ref: 4 }); const n = A.noiseSrc(false); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 6; const g = c.createGain(); A.env(g.gain, t, 0.001, 1, dur, 0.05, 0, 0.02); n.connect(bp); bp.connect(g); g.connect(sp.input); n.start(t); n.stop(t + dur + 0.05); };
A.tone = function (freq, vol, dur, type = 'sine', bus, pos, slide) { if (!A.ok) return; const c = A.ctx, t = c.currentTime; const sp = A.spatial(pos, bus || A.sfx, { vol, ref: 5 }); const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur); const g = c.createGain(); A.env(g.gain, t, 0.005, 1, dur * 0.6, 0.2, 0, dur * 0.4); o.connect(g); g.connect(sp.input); o.start(t); o.stop(t + dur + 0.05); };
A.reloadSound = function (step, type) { if (type === 'shotgun') { A.click(1800, 0.3, null, 0.03); setTimeout(() => A.click(900, 0.25, null, 0.04), 60); return; } if (step === 0) { A.click(1400, 0.3, null, 0.03); setTimeout(() => A.click(600, 0.2, null, 0.05), 80); } else if (step === 1) { A.click(2200, 0.3, null, 0.02); setTimeout(() => A.click(1000, 0.35, null, 0.05), 50); } else { A.click(2600, 0.35, null, 0.02); setTimeout(() => A.click(1500, 0.3, null, 0.03), 90); } };
A.pump = function () { A.click(1200, 0.35, null, 0.04); setTimeout(() => A.click(800, 0.35, null, 0.05), 140); };
A.dryFire = function () { A.click(2500, 0.25, null, 0.02); };
A.footstep = function (pos, wet, vol = 0.5, run) {
  if (!A.ok) return; const c = A.ctx, t = c.currentTime; const sp = A.spatial(pos, A.sfx, { vol, ref: 3, maxDist: 30 });
  const n = A.noiseSrc(false); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500 + Math.random() * 300; const g = c.createGain(); A.env(g.gain, t, 0.004, run ? 1.2 : 0.8, 0.05, 0.05, 0, 0.05); n.connect(lp); lp.connect(g); g.connect(sp.input); n.start(t); n.stop(t + 0.2);
  if (wet > 0.3) { const n2 = A.noiseSrc(false); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500; const g2 = c.createGain(); A.env(g2.gain, t + 0.01, 0.01, 0.25 * wet, 0.08, 0.05, 0, 0.06); n2.connect(hp); hp.connect(g2); g2.connect(sp.input); n2.start(t); n2.stop(t + 0.25); }
};
A.groan = function (pos, kind = 0, vol = 0.8) {
  if (!A.ok || A.voices.groan > 6) return; A.voices.groan++;
  const c = A.ctx, t = c.currentTime; const sp = A.spatial(pos, A.sfx, { vol, ref: 7, reverb: 0.4, maxDist: 60 }); if (sp.vol <= 0.001) { A.voices.groan--; return; }
  const dur = kind === 2 ? 0.6 + Math.random() * 0.4 : 0.9 + Math.random() * 1.2; const base = kind === 2 ? 220 + Math.random() * 120 : kind === 1 ? 60 + Math.random() * 30 : 85 + Math.random() * 55;
  const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(base * 0.8, t); o.frequency.linearRampToValueAtTime(base * (1 + Math.random() * 0.3), t + dur * 0.5); o.frequency.linearRampToValueAtTime(base * 0.6, t + dur);
  const lfo = c.createOscillator(); lfo.frequency.value = 4 + Math.random() * 4; const lg = c.createGain(); lg.gain.value = base * 0.06; lfo.connect(lg); lg.connect(o.frequency);
  const ws = c.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * (kind === 2 ? 6 : 3)); } ws.curve = curve;
  const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = kind === 2 ? 1400 : 550 + Math.random() * 200; f1.Q.value = 3; const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = kind === 2 ? 2600 : 1000 + Math.random() * 400; f2.Q.value = 4;
  const g = c.createGain(); A.env(g.gain, t, 0.15, 0.6, dur * 0.4, 0.35, dur * 0.3, dur * 0.3);
  o.connect(ws); ws.connect(f1); ws.connect(f2); f1.connect(g); f2.connect(g); g.connect(sp.input);
  const n = A.noiseSrc(true); const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1200; nf.Q.value = 1; const ng = c.createGain(); A.env(ng.gain, t, 0.2, 0.25, dur * 0.5, 0.1, 0, dur * 0.4); n.connect(nf); nf.connect(ng); ng.connect(sp.input);
  o.start(t); lfo.start(t); n.start(t); o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1); n.stop(t + dur + 0.1);
  setTimeout(() => A.voices.groan--, (dur + 0.1) * 1000);
};
A.hurtZombie = function (pos) { A.groan(pos, 0, 0.5); A.impact('flesh', pos); };
A.deathGurgle = function (pos) { if (!A.ok) return; const c = A.ctx, t = c.currentTime; const sp = A.spatial(pos, A.sfx, { vol: 0.7, ref: 6 }); const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.7); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; const g = c.createGain(); A.env(g.gain, t, 0.02, 0.5, 0.5, 0.1, 0, 0.3); const n = A.noiseSrc(true); const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; const ng = c.createGain(); ng.gain.setValueAtTime(0.0001, t); for (let i = 0; i < 8; i++) { ng.gain.exponentialRampToValueAtTime(0.3, t + i * 0.09 + 0.02); ng.gain.exponentialRampToValueAtTime(0.02, t + i * 0.09 + 0.08); } ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.9); o.connect(f); f.connect(g); g.connect(sp.input); n.connect(nf); nf.connect(ng); ng.connect(sp.input); o.start(t); n.start(t); o.stop(t + 1); n.stop(t + 1); };
A.impact = function (kind, pos) {
  if (!A.ok) return; const c = A.ctx, t = c.currentTime; const sp = A.spatial(pos, A.sfx, { vol: 0.6, ref: 5, maxDist: 60 }); if (sp.vol <= 0) return;
  if (kind === 'metal') { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 1800 + Math.random() * 1500; const g = c.createGain(); A.env(g.gain, t, 0.001, 0.5, 0.25, 0.01, 0, 0.1); o.connect(g); g.connect(sp.input); o.start(t); o.stop(t + 0.4); A.click(4000, 0.4, pos, 0.015); }
  else if (kind === 'flesh') { const n = A.noiseSrc(true); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 450; const g = c.createGain(); A.env(g.gain, t, 0.003, 0.9, 0.07, 0.05, 0, 0.05); n.connect(lp); lp.connect(g); g.connect(sp.input); n.start(t); n.stop(t + 0.2); }
  else { const n = A.noiseSrc(false); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500; const g = c.createGain(); A.env(g.gain, t, 0.001, 0.7, 0.04, 0.05, 0, 0.03); n.connect(hp); hp.connect(g); g.connect(sp.input); n.start(t); n.stop(t + 0.12); const o = c.createOscillator(); o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(300, t + 0.05); const og = c.createGain(); A.env(og.gain, t, 0.001, 0.3, 0.04, 0.02, 0, 0.02); o.connect(og); og.connect(sp.input); o.start(t); o.stop(t + 0.1); }
};
A.playerHurt = function () { if (!A.ok) return; const c = A.ctx, t = c.currentTime; const sp = A.spatial(null, A.sfx, { vol: 1 }); const n = A.noiseSrc(true); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; const g = c.createGain(); A.env(g.gain, t, 0.005, 1.0, 0.15, 0.1, 0, 0.1); n.connect(lp); lp.connect(g); g.connect(sp.input); n.start(t); n.stop(t + 0.4); const o = c.createOscillator(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.3); const og = c.createGain(); A.env(og.gain, t, 0.005, 0.8, 0.25, 0.05, 0, 0.1); o.connect(og); og.connect(sp.input); o.start(t); o.stop(t + 0.5); A.groan(null, 0, 0.4); };
A.hitmarker = function (head) { A.tone(head ? 1800 : 1200, 0.12, 0.05, 'square'); };
A.pickup = function () { A.tone(700, 0.2, 0.08, 'sine'); setTimeout(() => A.tone(1050, 0.2, 0.1, 'sine'), 80); };
A.ui = function () { A.tone(1500, 0.08, 0.03, 'square'); };
A.radio = function (open) { if (!A.ok) return; const c = A.ctx, t = c.currentTime; const n = A.noiseSrc(false); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.2; const g = c.createGain(); A.env(g.gain, t, 0.01, 0.12, 0.12, 0.05, 0, 0.05); n.connect(bp); bp.connect(g); g.connect(A.sfx); n.start(t); n.stop(t + 0.3); A.tone(open ? 1100 : 800, 0.08, 0.06, 'square'); };
A.thunder = function (delay = 0, vol = 0.8) { if (!A.ok) return; const c = A.ctx, t = c.currentTime + delay; const n = A.noiseSrc(true); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(60, t + 3); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.15); g.gain.exponentialRampToValueAtTime(vol * 0.5, t + 0.9); g.gain.exponentialRampToValueAtTime(vol * 0.7, t + 1.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.8); n.connect(lp); lp.connect(g); g.connect(A.amb); n.start(t); n.stop(t + 4); };
A.heartbeat = function (vol) { if (!A.ok) return; const c = A.ctx, t = c.currentTime; for (const [dt, v] of [[0, 1], [0.18, 0.7]]) { const o = c.createOscillator(); o.frequency.setValueAtTime(52, t + dt); o.frequency.exponentialRampToValueAtTime(35, t + dt + 0.12); const g = c.createGain(); A.env(g.gain, t + dt, 0.01, vol * v, 0.1, 0.05, 0, 0.06); o.connect(g); g.connect(A.sfx); o.start(t + dt); o.stop(t + dt + 0.25); } };
A.shell = function () { setTimeout(() => A.tone(3800 + Math.random() * 1500, 0.06, 0.03, 'triangle'), 350 + Math.random() * 200); };
A.whoosh = function (vol = 0.4) { if (!A.ok) return; const c = A.ctx, t = c.currentTime; const n = A.noiseSrc(true); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(1200, t + 0.2); bp.frequency.exponentialRampToValueAtTime(200, t + 0.5); const g = c.createGain(); A.env(g.gain, t, 0.08, vol, 0.25, 0.1, 0, 0.2); n.connect(bp); bp.connect(g); g.connect(A.sfx); n.start(t); n.stop(t + 0.7); };
A.stinger = function (vol = 0.5) { if (!A.ok) return; const c = A.ctx, t = c.currentTime; for (const f of [55, 58.3, 82.4, 116.5]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1200, t); lp.frequency.exponentialRampToValueAtTime(120, t + 3); const g = c.createGain(); A.env(g.gain, t, 0.05, vol * 0.25, 1.5, vol * 0.1, 0, 2.5); o.connect(lp); lp.connect(g); g.connect(A.music); o.start(t); o.stop(t + 4.5); } };
// ---- loops ----
A.loopNoise = function (pink, freq, type, gain, bus, q) { const c = A.ctx; const n = A.noiseSrc(pink); const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q; const g = c.createGain(); g.gain.value = gain; n.connect(f); f.connect(g); g.connect(bus); n.start(); return { src: n, filter: f, gain: g }; };
A.startAmbience = function () {
  const c = A.ctx;
  A.loops.rain = A.loopNoise(true, 2800, 'bandpass', 0.0, A.amb, 0.4); A.loops.rainLow = A.loopNoise(true, 500, 'lowpass', 0.0, A.amb);
  A.loops.wind = A.loopNoise(true, 250, 'lowpass', 0.0, A.amb); const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 150; lfo.connect(lg); lg.connect(A.loops.wind.filter.frequency); lfo.start();
  // music drone
  A.drone = { oscs: [], gain: c.createGain(), filter: c.createBiquadFilter() }; A.drone.filter.type = 'lowpass'; A.drone.filter.frequency.value = 220; A.drone.filter.Q.value = 2; A.drone.gain.gain.value = 0; A.drone.filter.connect(A.drone.gain); A.drone.gain.connect(A.music);
  for (const [f, det] of [[55, -5], [55, 5], [82.4, 3], [110, -4]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; const g = c.createGain(); g.gain.value = 0.12; o.connect(g); g.connect(A.drone.filter); o.start(); A.drone.oscs.push(o); }
  const flfo = c.createOscillator(); flfo.frequency.value = 0.05; const fg = c.createGain(); fg.gain.value = 120; flfo.connect(fg); fg.connect(A.drone.filter.frequency); flfo.start();
  A.pulse = { gain: c.createGain(), t: 0 }; A.pulse.gain.gain.value = 0; A.pulse.gain.connect(A.music);
  // distant car alarm (very quiet, positional-ish)
  A.alarm = { osc: c.createOscillator(), gain: c.createGain(), filter: c.createBiquadFilter() }; A.alarm.osc.type = 'square'; A.alarm.osc.frequency.value = 900; A.alarm.filter.type = 'bandpass'; A.alarm.filter.frequency.value = 1500; A.alarm.gain.gain.value = 0; A.alarm.osc.connect(A.alarm.filter); A.alarm.filter.connect(A.alarm.gain); A.alarm.gain.connect(A.amb); A.alarm.osc.start();
  A.fire = A.loopNoise(true, 700, 'lowpass', 0.0, A.amb);
  A.genHum = null;
};
A.setAmbience = function (o) { if (!A.ok) return; const c = A.ctx, t = c.currentTime; const k = 0.5;
  A.loops.rain.gain.gain.setTargetAtTime(0.22 * (o.rain || 0) * (o.inside ? 0.3 : 1), t, k); A.loops.rainLow.gain.gain.setTargetAtTime(0.18 * (o.rain || 0), t, k); A.loops.wind.gain.gain.setTargetAtTime(0.16 * (o.wind || 0), t, k);
  A.alarm.gain.gain.setTargetAtTime(o.alarm || 0, t, k); A.fire.gain.gain.setTargetAtTime(o.fire || 0, t, k);
  if (o.alarm) A.alarm.osc.frequency.setValueAtTime(((Math.floor(A.time * 2) % 2) ? 1100 : 800), t);
};
A.setMusic = function (intensity, on) { if (!A.ok) return; const t = A.ctx.currentTime; A.intensity = intensity; A.drone.gain.gain.setTargetAtTime(on ? 0.18 + 0.12 * intensity : 0, t, 1.5); A.drone.filter.frequency.setTargetAtTime(180 + intensity * 700, t, 1.0); };
A.musicTick = function (dt) { if (!A.ok || A.intensity < 0.35) return; A.pulse.t += dt; const period = 60 / (90 + A.intensity * 40); if (A.pulse.t > period) { A.pulse.t -= period; const c = A.ctx, t = c.currentTime; const o = c.createOscillator(); o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25); const g = c.createGain(); A.env(g.gain, t, 0.005, 0.22 * A.intensity, 0.2, 0.02, 0, 0.1); o.connect(g); g.connect(A.music); o.start(t); o.stop(t + 0.4); } };
A.generatorStart = function (pos) { if (!A.ok) return; const c = A.ctx, t = c.currentTime; const sp = A.spatial(pos, A.sfx, { vol: 1, ref: 6 }); const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(12, t); o.frequency.linearRampToValueAtTime(45, t + 2.5); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.5); g.gain.setValueAtTime(0.5, t + 2.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2); o.connect(lp); lp.connect(g); g.connect(sp.input); o.start(t); o.stop(t + 3.3);
  setTimeout(() => { if (A.genHum) return; const h = c.createOscillator(); h.type = 'sawtooth'; h.frequency.value = 50; const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 220; const sp2 = A.spatial(pos, A.amb, { vol: 0.35, ref: 5, maxDist: 40 }); h.connect(hf); hf.connect(sp2.input); h.start(); A.genHum = { osc: h, sp: sp2, pos }; }, 2800); };
A.heli = function () { if (!A.ok) return; const c = A.ctx; const n = A.noiseSrc(true); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 350; const g = c.createGain(); g.gain.value = 0; const am = c.createOscillator(); am.frequency.value = 14; const ag = c.createGain(); ag.gain.value = 0.5; const base = c.createGain(); base.gain.value = 0.5; am.connect(ag); ag.connect(base.gain); n.connect(lp); lp.connect(base); base.connect(g); g.connect(A.amb); const sub = c.createOscillator(); sub.frequency.value = 28; const sg = c.createGain(); sg.gain.value = 0.4; sub.connect(sg); sg.connect(g); n.start(); am.start(); sub.start(); return { gain: g, am, set: (v, rot) => { const t = c.currentTime; g.gain.setTargetAtTime(v, t, 1.5); am.frequency.setTargetAtTime(rot || 14, t, 1); } }; };
