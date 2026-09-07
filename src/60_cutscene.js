/* ============================================================
   Cutscene engine (generator-based scripts) + scripts
   ============================================================ */
const CS = {
  active: null, wait: 0, look: null, move: null, subT: 0, cardT: 0, staticT: 0, staticA: 0, fadeTarget: 1, fadeSpeed: 1, black: false, lastSpeaker: '',
  start(name, gen, finish, opts = {}) {
    this.active = { name, gen: gen(this), finish, opts }; this.wait = 0.0001; this.look = null; this.move = null; this.staticA = 0;
    G.state = 'cutscene'; P.control = false; P.lowered = !!opts.lowered; G.cutsceneShowWeapon = opts.showWeapon !== false; $('cine').classList.remove('hidden'); $('skip').style.display = opts.noSkip ? 'none' : '';
    this.step(0);
  },
  step(dt) {
    const a = this.active; if (!a) return; this.wait -= dt;
    let guard = 0;
    while (this.wait <= 0 && this.active && guard++ < 60) { const r = a.gen.next(); if (r.done) { this.end(false); return; } this.wait += typeof r.value === 'number' ? r.value : 0; }
  },
  end(skipped) {
    const a = this.active; if (!a) return; this.active = null;
    $('subs').innerHTML = ''; $('card').classList.remove('on'); $('cine').classList.remove('on'); setTimeout(() => { if (!this.active) $('cine').classList.add('hidden'); }, 700);
    this.staticA = 0; R.fx.static = 0; R.fx.flash = 0; R.fx.fade = 1; this.black = false; this.look = null; this.move = null; P.control = true; P.lowered = false; G.cutsceneShowWeapon = true;
    if (a.finish) a.finish(skipped);
  },
  skip() { if (!this.active || this.active.opts.noSkip) return; this.end(true); },
  update(dt) {
    if (!this.active) return; this.step(dt);
    // camera look control
    if (this.look) { const L = this.look; let ty, tp; if (L.pos) { const dx = L.pos[0] - P.eyePos[0], dy = L.pos[1] - P.eyePos[1], dz = L.pos[2] - P.eyePos[2]; ty = Math.atan2(-dx, -dz); tp = Math.atan2(dy, Math.hypot(dx, dz)); } else { ty = L.yaw; tp = L.pitch; }
      const k = Math.min(1, dt * (L.speed || 3)); P.yaw += Math.atan2(Math.sin(ty - P.yaw), Math.cos(ty - P.yaw)) * k; P.pitch += (tp - P.pitch) * k; }
    if (this.move) { const M_ = this.move; M_.t += dt; const f = smoothstep(0, 1, Math.min(1, M_.t / M_.dur)); P.pos[0] = lerp(M_.from[0], M_.to[0], f); P.pos[2] = lerp(M_.from[2], M_.to[2], f); P.phase += dt * (M_.dur > 0 ? V3.distXZ(M_.from, M_.to) / M_.dur : 0) * 3.3; if (M_.t >= M_.dur) this.move = null; }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) $('subs').innerHTML = ''; }
    if (this.staticT > 0) { this.staticT -= dt; R.fx.static = this.staticA * clamp(this.staticT / 0.3, 0, 1); } else R.fx.static = 0;
    R.fx.fade = damp(R.fx.fade, this.black ? 0 : 1, this.fadeSpeed, dt);
  },
  // ---- script helpers
  say(who, text, dur, radio) { const s = $('subs'); s.innerHTML = '<span class="who">' + who + '</span><span class="' + (radio ? 'radio' : '') + '">' + text + '</span>'; this.subT = dur; if (radio) A.radio(true); },
  card(a, b) { if (a === null) { $('card').classList.remove('on'); return; } $('carda').textContent = a; $('cardb').textContent = b || ''; $('card').classList.add('on'); },
  setBlack(on, speed) { this.black = on; this.fadeSpeed = speed || 3; if (on && speed === 0) R.fx.fade = 0; },
  letterbox(on) { $('cine').classList.toggle('on', on); },
  static(amount, dur) { this.staticA = amount; this.staticT = dur; R.fx.glitch = amount; },
  lookAt(pos, speed) { this.look = { pos, speed: speed || 3 }; },
  lookDir(yaw, pitch, speed) { this.look = { yaw, pitch, speed: speed || 3 }; },
  freeLook() { this.look = null; },
  moveTo(to, dur) { this.move = { from: P.pos.slice(), to, dur, t: 0 }; },
  setPos(pos, yaw, pitch) { V3.copy(P.pos, pos); P.yaw = yaw; if (pitch !== undefined) P.pitch = pitch; P.prevYaw = yaw; P.prevPitch = P.pitch; },
  shake(a) { P.cam.shake = Math.min(1, P.cam.shake + a); },
  flashWhite(v) { R.fx.flash = v; },
};
/* ---------- scripts ---------- */
const SCRIPTS = {};
SCRIPTS.intro = function* (cs) {
  const cole = NPCs.list.find(n => n.name === 'COLE'), reyes = NPCs.list.find(n => n.name === 'REYES'), park = NPCs.list.find(n => n.name === 'PARK');
  cs.setBlack(true, 0); cs.setPos([0.4, 0, 60.2], 0.15, 0.05); cs.card('BODYCAM EVIDENCE · CASE 26-0904-TR4', 'SGT. R. MAGELLAN · TACTICAL RESPONSE UNIT TR-4\nDISTRICT 7 QUARANTINE LINE · HARBOR STREET CHECKPOINT\nRECORDED 2026-09-04 · 02:13 LOCAL'); yield 5.5;
  cs.card(null); yield 0.9; cs.static(1, 1.4); cs.setBlack(false, 4); A.radio(true); cs.letterbox(true);
  cole.anim = 'talk'; cole.lookAt = [0.4, 0, 60.2]; reyes.anim = 'idle'; reyes.lookAt = cole.pos; park.anim = 'aim'; park.lookAt = [4, 0, 20];
  cs.lookAt([cole.pos[0], 1.62, cole.pos[2]], 2.5); yield 1.8;
  cs.say('LT. COLE', 'Listen up. Command lost contact with the pharmacy team forty minutes ago. Nothing on the net since.', 4.6); yield 4.8;
  cs.say('LT. COLE', 'We hold this line until the gate crew clears Harbor Street. Then we push north and we find them.', 4.6); yield 4.8;
  cs.say('LT. COLE', 'Magellan — camera stays on. Everything gets logged tonight. Everything.', 3.6); yield 3.8;
  cs.say('REYES', 'Cole... you hearing that?', 2.4); cs.lookAt([reyes.pos[0], 1.6, reyes.pos[2]], 3); A.groan([0, 1, 30], 0, 1.0); setTimeout(() => A.groan([-8, 1, 26], 1, 1.0), 900); setTimeout(() => A.groan([6, 1, 22], 0, 1.0), 1700); yield 2.8;
  cs.lookDir(0.0, 0.02, 2.2); yield 1.4;
  cs.say('PARK', 'Contact! North side, on the road!', 2.6); const z1 = Zombies.spawn([1.5, 0, 30], 1); z1.awareness = 1; park.combat = true; yield 2.8;
  cs.lookAt([park.pos[0], 1.6, park.pos[2]], 3.5); yield 1.2;
  cs.say('LT. COLE', 'Hold your fire until they are inside thirty. Ammunition is not coming down that street.', 4); cs.lookAt([cole.pos[0], 1.62, cole.pos[2]], 3); yield 4.2;
  cs.say('PARK', 'More of them. I count six— seven— they are coming out of the fog—', 3.2); cs.lookDir(0.05, 0.0, 2.5); for (const p of [[-3, 0, 36], [4, 0, 40], [0, 0, 44], [-6, 0, 42]]) Zombies.spawn(p, randi(0, 1)).awareness = 1; cole.combat = true; cole.anim = 'aim'; yield 3.4;
  // ambush on Park from the east sidewalk
  const r1 = Zombies.spawn([11, 0.12, 40], 2), r2 = Zombies.spawn([10, 0.12, 44], 2); r1.awareness = r2.awareness = 1; A.groan(r1.pos, 2, 1); cs.say('REYES', 'Park! Your right— PARK!', 1.6); cs.lookAt([park.pos[0], 1.5, park.pos[2]], 5); yield 1.6;
  park.die([-0.5, 0.2, 0.6]); FX.blood(park.jointWorld(B.chest, false, [0, 0, 0]), [-0.5, 0.5, 0.3], 2); A.groan(park.pos, 2, 1); cs.shake(0.5); cs.static(0.4, 0.3); yield 1.3;
  cs.say('LT. COLE', 'PARK! — Reyes, on me, fall back to the bags! FALL BACK!', 3.2); reyes.combat = true; reyes.anim = 'fire'; cs.shake(0.4); yield 3.4;
  cs.say('LT. COLE', 'Sergeant! Take his rifle. Nobody comes through this line. NOBODY.', 3.6); cs.lookAt([park.pos[0], 0.4, park.pos[2]], 4); yield 1.6; P.give('rifle', 90); A.click(900, 0.4, null, 0.05); G.msg('M4A1 CARBINE ACQUIRED', 'switch weapons with 1 · 2 · 3 or Q', 3); yield 2.2;
  cs.static(0.5, 0.5); cs.letterbox(false);
};
SCRIPTS.introFinish = function () {
  const cole = NPCs.list.find(n => n.name === 'COLE'), reyes = NPCs.list.find(n => n.name === 'REYES'), park = NPCs.list.find(n => n.name === 'PARK');
  if (!park.dead) park.die([-0.5, 0.2, 0.6]); cole.combat = true; cole.anim = 'aim'; cole.watch = [0, 0, 20]; reyes.combat = true; reyes.anim = 'aim'; reyes.watch = [0, 0, 20]; cole.lookAt = cole.watch; reyes.lookAt = reyes.watch;
  if (!P.weapons.rifle) P.give('rifle', 90); for (const z of Zombies.list) z.awareness = 1;
  G.setObjective(0);
};
SCRIPTS.pharmacy = function* (cs) {
  const v = NPCs.list.find(n => n.name === 'VARGA'); cs.letterbox(true); cs.lookAt([W.props.survivor[0], 1.55, W.props.survivor[2]], 3); v.anim = 'talk'; v.lookAt = P.pos; A.click(600, 0.3, null, 0.06); yield 1.4;
  cs.say('DR. VARGA', 'Hey! HEY! Over here— are you TR-4? Where is the rest of your team?', 4); yield 4.2;
  cs.say('SGT. MAGELLAN', 'Checkpoint is holding. Ma\'am, I need you to open this door.', 3.4); yield 3.6;
  cs.say('DR. VARGA', 'It is barricaded from the inside and it stays that way. Listen to me. The evac corridor at the north plaza runs on the block generator.', 5.4); yield 5.6;
  cs.say('DR. VARGA', 'The alley behind me. Get it running and the landing lights come up. That is the only way a bird finds anyone in this soup.', 5.2); cs.lookAt([20, 1.4, -52], 2); yield 5.4;
  A.stinger(0.6); cs.lookDir(0.0, 0.0, 2.5); for (let i = 0; i < 11; i++) { const z = Zombies.spawn([rand(-7, 7), 0, -66 - i * 2.5], i < 8 ? randi(0, 1) : 2); z.awareness = 1; } A.setAmbience({ rain: 1, wind: 1, alarm: 0.02, fire: 0.1 }); yield 1.8;
  cs.say('DR. VARGA', 'Oh no. No no no— they heard the shooting. Go. GO NOW!', 3); yield 3.2;
  cs.say('LT. COLE (RADIO)', 'Magellan, Cole. We\'re— *static* — lost the bags, Reyes is hit. We can\'t hold. It\'s on you now. Get that power on.', 5.4, true); cs.shake(0.3); yield 5.6;
  cs.letterbox(false);
};
SCRIPTS.pharmacyFinish = function () { const v = NPCs.list.find(n => n.name === 'VARGA'); v.anim = 'idle'; v.lookAt = null; if (Zombies.alive() < 6) for (let i = 0; i < 8; i++) Zombies.spawn([rand(-7, 7), 0, -66 - i * 2.5], randi(0, 1)).awareness = 1; G.setObjective(2); };
SCRIPTS.extraction = function* (cs) {
  cs.letterbox(true); G.heli = A.heli(); if (G.heli) G.heli.set(0.35, 12); cs.say('NIGHTBIRD 2 (RADIO)', 'TR-4, Nightbird 2. We have your strobe. Thirty seconds. Keep your head down, sergeant.', 4.6, true); yield 2.5;
  cs.lookDir(P.yaw, 0.35, 1.2); if (G.heli) G.heli.set(0.9, 16); G.searchlight = { t: 0 }; yield 3;
  FX.dustBurst(W.props.lz, 8, 40); cs.shake(0.35); yield 2.5; FX.dustBurst(W.props.lz, 10, 40); cs.shake(0.5);
  cs.say('LT. COLE (RADIO)', '...Magellan. If you are still recording — tell them we held. Tell them Harbor Street held.', 5, true); cs.lookDir(P.yaw + 0.3, 0.9, 0.8); yield 5.2;
  cs.say('NIGHTBIRD 2 (RADIO)', 'Hook is down. Grab on. GRAB ON!', 2.6, true); FX.dustBurst(W.props.lz, 10, 60); cs.shake(1); if (G.heli) G.heli.set(1.3, 19); yield 2.4;
  cs.flashWhite(0); let t = 0; while (t < 1.6) { t += 0.05; R.fx.flash = Math.min(1, t / 1.4); yield 0.05; }
  A.whoosh(0.8); cs.setBlack(true, 0); R.fx.flash = 0; if (G.heli) G.heli.set(0.0, 14); cs.card('FOOTAGE ENDS', '03:26 · SGT. R. MAGELLAN RECOVERED BY NIGHTBIRD 2\nDR. I. VARGA RECOVERED 03:41 · PHARMACY ROOF\nCASE 26-0904-TR4 · EVIDENCE SEALED'); yield 7;
};
SCRIPTS.extractionFinish = function () { G.searchlight = null; G.win(); };
SCRIPTS.death = function* (cs) {
  P.cam.shake = 1; cs.static(0.8, 0.6); A.stinger(0.4); let t = 0; while (t < 1.3) { t += 0.05; const f = smoothstep(0, 1, t / 1.3); P.cam.height = lerp(P.cam.height, 0.32, 0.12); P.pitch = lerp(P.pitch, 0.25, 0.1); P.cam.roll = lerp(P.cam.roll, 1.1, 0.08); yield 0.05; }
  yield 1.2; cs.static(1, 0.5); yield 0.5; cs.setBlack(true, 0); yield 0.4;
};
SCRIPTS.deathFinish = function () { G.showGameOver(false); };
