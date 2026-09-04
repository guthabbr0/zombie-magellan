/* ============================================================
   Game: state machine, objectives, waves, HUD, input, settings
   ============================================================ */
const OBJECTIVES = [
  { id: 'hold', text: 'Hold the checkpoint · backup ETA', timer: 70 },
  { id: 'pharmacy', text: 'Advance north to the pharmacy on Harbor & 7th', targetKey: 'pharmacyWindow', radius: 4.5 },
  { id: 'generator', text: 'Restore power: start the block generator in the alley behind the pharmacy', targetKey: 'generator', interact: { radius: 2.4, hold: 3.2 } },
  { id: 'lz', text: 'Reach the extraction point · north plaza', targetKey: 'lz', radius: 5 },
  { id: 'holdlz', text: 'Hold the landing zone · Nightbird 2 inbound', timer: 105 },
];
const G = {
  state: 'menu', time: 0, difficulty: 0, obj: null, objIndex: -1, objT: 0, spawnT: 0, godmode: false, cutsceneShowWeapon: true, msgT: 0, hitT: 0, fpsAcc: 0, fpsN: 0, fps: 60, hudT: 0, lightningT: 12, lightningA: 0, thunderQueued: 0,
  input: { move: [0, 0], lookX: 0, lookY: 0, fire: false, aim: false, reload: false, jump: false, sprint: false, crouch: false, interact: false, flashlight: false, weapon: 0, cycle: 0 },
  keys: {}, locked: false, checkpoint: null, perf: { update: 0, render: 0 }, heli: null, searchlight: null, holdProg: 0, elapsed: 0, killsAtObj: 0, menuYaw: 0, interactAvailable: false, pointsBuf: [], spotsBuf: [], stepSound: 0,
};
G.init = function () {
  G.buildSettingsUI(); G.bindUI(); G.bindInput();
  // menu scene setup
  G.setupMenuScene();
};
G.setupMenuScene = function () {
  Zombies.clear(); NPCs.clear(); FX.clear(); W.props.power = false; W.props.strobe = false;
  NPCs.add([0.2, 0, 57.6], PI, 'COLE'); NPCs.add([-2.8, 0, 60.5], 2.6, 'REYES'); NPCs.add([4.2, 0, 58.2], 0.1, 'PARK');
  const v = NPCs.add(W.props.survivor, -PI / 2, 'VARGA'); v.light = false;
  NPCs.list[2].anim = 'aim'; NPCs.list[2].lookAt = [3, 0, 20]; NPCs.list[0].anim = 'idle'; NPCs.list[1].anim = 'idle';
  P.reset([8.6, 0.12, 44], 2.75); P.pitch = 0.02; P.flashlight = false; P.control = false;
  for (const p of W.pickups) { p.taken = false; }
};
G.startMission = function () {
  A.init(); A.resume(); G.setupMenuScene(); P.reset([0.4, 0, 60.2], 0.15); P.weapons = { pistol: { ammo: 15, reserve: 90 }, rifle: null, shotgun: null }; P.cur = 'pistol'; P.stats = { shots: 0, hits: 0, kills: 0, headshots: 0, damage: 0 };
  P.flashlight = true; G.time = 0; G.elapsed = 0; G.difficulty = 0; G.objIndex = -1; G.obj = null; W.props.power = false; W.props.strobe = false; G.heli = null; G.searchlight = null;
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); if (IS_TOUCH) $('touch').classList.remove('hidden');
  G.enterFullscreen(); A.setMusic(0.2, true); A.setAmbience({ rain: 1, wind: 0.8, alarm: 0.0, fire: 0.0 });
  FX.emitters.length = 0; FX.addFire(W.props.burningCar, 1.2);
  CS.start('intro', SCRIPTS.intro, SCRIPTS.introFinish, { lowered: true });
  G.requestLock();
};
G.enterFullscreen = function () { if (!IS_TOUCH) return; const el = document.documentElement; try { (el.requestFullscreen || el.webkitRequestFullscreen || function () { }).call(el); } catch (e) { } try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => { }); } catch (e) { } };
G.setObjective = function (i) {
  G.objIndex = i; G.obj = OBJECTIVES[i]; G.objT = 0; G.holdProg = 0; G.interactAvailable = false; G.state = 'playing'; G.difficulty = i * 0.6; G.killsAtObj = P.stats.kills;
  G.checkpoint = { objIndex: i, pos: P.pos.slice(), yaw: P.yaw, weapons: JSON.parse(JSON.stringify(P.weapons)), cur: P.cur, power: !!W.props.power, strobe: !!W.props.strobe };
  const o = G.obj; if (o.targetKey) o.target = W.props[o.targetKey];
  $('objt').innerHTML = o.text + (o.timer ? ' <span class="timer" id="objtimer"></span>' : '');
  G.msg(['HOLD THE LINE', 'PUSH NORTH', 'RESTORE POWER', 'REACH THE LZ', 'HOLD THE LZ'][i], o.text, 3.5);
  A.setMusic(0.35 + i * 0.12, true);
  if (o.id === 'holdlz') { W.props.strobe = true; A.setMusic(0.9, true); }
};
G.nextObjective = function () {
  const i = G.objIndex + 1;
  if (G.obj.id === 'hold') { G.msg('BACKUP IS NOT COMING', 'radio: "TR-4, all units are committed. You are on your own. Push north."', 4.5); A.radio(true); NPCs.list.forEach(n => { if (n.name === 'COLE' || n.name === 'REYES') { n.watch = [0, 0, 20]; } }); }
  if (G.obj.id === 'pharmacy') { CS.start('pharmacy', SCRIPTS.pharmacy, SCRIPTS.pharmacyFinish, { showWeapon: true }); return; }
  if (G.obj.id === 'generator') { W.props.power = true; A.generatorStart(W.props.generator); G.msg('POWER RESTORED', 'landing lights online at the north plaza', 4); }
  if (G.obj.id === 'lz') { G.msg('STROBE DEPLOYED', 'radio: "Nightbird 2 copies your strobe. ETA five mikes. Hold."', 4.5); A.radio(true); }
  if (G.obj.id === 'holdlz') { CS.start('extraction', SCRIPTS.extraction, SCRIPTS.extractionFinish, { showWeapon: true, noSkip: true }); return; }
  G.setObjective(i);
};
G.msg = function (a, b, dur) { const m = $('msg'); m.innerHTML = a + (b ? '<span class="s">' + b + '</span>' : ''); m.style.opacity = 1; G.msgT = dur || 3; };
G.hitMarker = function (head) { const h = $('hit'); h.style.opacity = 1; h.classList.toggle('head', !!head); G.hitT = 0.12; A.hitmarker(head); };
G.onZombieKilled = function (z) { if (Math.random() < 0.08 && G.state === 'playing') { const pk = Math.random() < 0.5 ? ammobox(z.pos[0], z.pos[2]) : medkit(z.pos[0], z.pos[2]); pk.respawn = 0; W.pickups.push(pk); } if (!P.weapons.shotgun && P.stats.kills >= 18 && G.objIndex >= 1 && !G.shotgunDropped) { G.shotgunDropped = true; P.give('shotgun', 24); G.msg('S12 PUMP SHOTGUN ACQUIRED', 'dropped by a fallen officer · press 3', 3.5); } };
G.onPlayerStep = function () { };
G.onPlayerDeath = function (from) { if (G.state === 'dead') return; G.state = 'dead'; A.setMusic(0.1, true); CS.start('death', SCRIPTS.death, SCRIPTS.deathFinish, { noSkip: true, showWeapon: false }); };
G.showGameOver = function (won) {
  G.state = won ? 'win' : 'dead'; G.unlock(); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  $('overTitle').textContent = won ? 'FOOTAGE RECOVERED' : 'SIGNAL LOST'; $('overTitle').classList.toggle('dead', !won); $('overSub').textContent = won ? 'Sgt. Magellan was extracted at 03:26. The recording ends here.' : 'Body camera stopped transmitting at ' + G.timestamp() + '.';
  const s = P.stats; const acc = s.shots ? Math.round(100 * s.hits / s.shots) : 0;
  $('overStats').innerHTML = ['<span>Objective reached</span>' + (G.objIndex + 1) + ' / 5', '<span>Zombies neutralized</span>' + s.kills, '<span>Headshots</span>' + s.headshots, '<span>Shots fired · accuracy</span>' + s.shots + ' · ' + acc + ' %', '<span>Time recorded</span>' + G.fmtTime(G.elapsed), '<span>Damage taken</span>' + Math.round(s.damage) + ' HP'].join('<br>');
  $('btnRetry').style.display = won ? 'none' : ''; $('over').classList.remove('hidden');
};
G.win = function () { R.fx.fade = 1; CS.black = false; G.showGameOver(true); A.setMusic(0.2, true); };
G.retry = function () {
  const c = G.checkpoint; if (!c) return G.toMenu(); $('over').classList.add('hidden'); $('hud').classList.remove('hidden'); if (IS_TOUCH) $('touch').classList.remove('hidden');
  Zombies.clear(); FX.clear(); FX.emitters.length = 0; FX.addFire(W.props.burningCar, 1.2); P.reset(c.pos, c.yaw); P.weapons = JSON.parse(JSON.stringify(c.weapons)); P.cur = c.cur; W.props.power = c.power; W.props.strobe = c.strobe; P.flashlight = true; P.cam.height = 1.52;
  R.fx.fade = 1; CS.black = false; CS.staticT = 0; R.fx.static = 0; P.cam.roll = 0;
  for (const n of NPCs.list) { if (n.name === 'PARK') continue; if (n.dead) { n.dead = false; n.rag = null; n.computeModel(); } }
  if (c.objIndex === 0) SCRIPTS.introFinish(); else { const cole = NPCs.list.find(n => n.name === 'COLE'), reyes = NPCs.list.find(n => n.name === 'REYES'); cole.combat = reyes.combat = false; G.setObjective(c.objIndex); }
  A.setMusic(0.4, true); G.requestLock();
};
G.toMenu = function () { G.unlock(); CS.active = null; G.state = 'menu'; $('over').classList.add('hidden'); $('pause').classList.add('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('cine').classList.add('hidden'); $('menu').classList.remove('hidden'); R.fx.fade = 1; R.fx.static = 0; R.fx.flash = 0; CS.black = false; G.setupMenuScene(); A.setMusic(0.15, true); A.setAmbience({ rain: 1, wind: 0.6 }); if (G.heli) { G.heli.set(0, 14); G.heli = null; } G.searchlight = null; };
G.pause = function () { if (G.state !== 'playing' && G.state !== 'cutscene') return; G.prevState = G.state; G.state = 'paused'; $('pause').classList.remove('hidden'); G.unlock(); if (A.ctx) A.master.gain.setTargetAtTime(S.master * 0.3, A.ctx.currentTime, 0.1); };
G.unpause = function () { if (G.state !== 'paused') return; G.state = G.prevState || 'playing'; $('pause').classList.add('hidden'); $('settings').classList.add('hidden'); G.requestLock(); if (A.ctx) A.master.gain.setTargetAtTime(S.master, A.ctx.currentTime, 0.1); };
G.timestamp = function () { const base = 2 * 3600 + 13 * 60 + 45 + Math.floor(G.elapsed); const h = Math.floor(base / 3600) % 24, m = Math.floor(base / 60) % 60, s = base % 60; return '2026-09-04 ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); };
G.fmtTime = function (t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ' min ' + String(s).padStart(2, '0') + ' s'; };
/* ---- waves ---- */
G.waveTarget = function () { const o = G.obj; if (!o) return 0; const t = G.objT; const cap = S.zombies;
  switch (o.id) { case 'hold': return Math.min(cap, 3 + Math.floor(t / 12)); case 'pharmacy': return Math.min(cap, 5 + Math.floor(t / 30)); case 'generator': return Math.min(cap, 7 + Math.floor(t / 25)); case 'lz': return Math.min(cap, 6); case 'holdlz': return Math.min(cap, 7 + Math.floor(t / 9)); } return 0; };
G.spawnZombie = function () {
  const o = G.obj; const tags = o.id === 'hold' ? ['north', 'alley', 'south'] : o.id === 'pharmacy' ? ['north', 'alley', 'crossW', 'crossE'] : o.id === 'generator' ? ['crossW', 'crossE', 'north', 'alley'] : ['plaza', 'north', 'alley'];
  const cands = W.spawns.filter(s => tags.includes(s.tag)).map(s => ({ s, d: V3.distXZ(s.pos, P.pos) })).filter(c => c.d > 20 && c.d < 75 && !(c.d < 30 && lineOfSightXZ(c.s.pos[0], c.s.pos[2], P.pos[0], P.pos[2]))); if (!cands.length) return;
  const c = cands[Math.floor(Math.random() * cands.length)]; const runnerP = Math.min(0.45, 0.04 + G.objIndex * 0.1 + G.objT / 400); const type = Math.random() < runnerP ? 2 : (Math.random() < 0.45 ? 1 : 0);
  const z = Zombies.spawn([c.s.pos[0] + rand(-1.5, 1.5), c.s.pos[1], c.s.pos[2] + rand(-1.5, 1.5)], type); z.awareness = 1;
};
/* ---- main update ---- */
G.update = function (dt) {
  const inp = G.input; G.time += dt; R.time = G.time; A.time = G.time;
  if (G.state === 'menu') { G.menuYaw += dt * 0.03; P.yaw = 2.75 + Math.sin(G.time * 0.11) * 0.22; P.pitch = 0.02 + Math.sin(G.time * 0.17) * 0.02; P.update(dt, { move: [0, 0], lookX: 0, lookY: 0 }); NPCs.update(dt); FX.update(dt); G.weather(dt); return; }
  if (G.state === 'paused') return;
  G.elapsed += dt;
  if (G.state === 'cutscene' || G.state === 'dead') CS.update(dt);
  // input mapping
  inp.move[0] = (G.keys.KeyD ? 1 : 0) - (G.keys.KeyA ? 1 : 0) + G.touchMove[0]; inp.move[1] = (G.keys.KeyW ? 1 : 0) - (G.keys.KeyS ? 1 : 0) + G.touchMove[1];
  inp.sprint = !!G.keys.ShiftLeft || !!G.keys.ShiftRight || G.touchSprint; inp.crouch = !!G.keys.KeyC || G.touchCrouch; inp.jump = !!G.keys.Space || G.touchJump; G.touchJump = false;
  inp.fire = G.mouseFire || G.touchFire; inp.aim = G.mouseAim || G.touchAim;
  if (inp.weapon) { P.switchTo(['pistol', 'rifle', 'shotgun'][inp.weapon - 1]); inp.weapon = 0; } if (inp.cycle) { P.cycle(inp.cycle); inp.cycle = 0; }
  if (inp.flashlight) { inp.flashlight = false; if (P.control) { P.flashlight = !P.flashlight; A.click(1800, 0.3, null, 0.02); } }
  // aim assist (touch)
  if (S.autoAim && IS_TOUCH && P.control && P.alive && Math.abs(inp.lookX) < 0.5) { let best = null, bd = 0.09; for (const z of Zombies.list) { if (z.dead) continue; const hp = z.jointWorld(B.chest, false, [0, 0, 0]); const d = V3.sub([], hp, P.eyePos); const dist = V3.len(d); if (dist > 35) continue; V3.scale(d, d, 1 / dist); const ang = Math.acos(clamp(V3.dot(d, R.camFwd), -1, 1)); if (ang < bd) { bd = ang; best = { d, dist }; } } if (best) { const ty = Math.atan2(-best.d[0], -best.d[2]); const tp = Math.asin(clamp(best.d[1], -1, 1)); P.yaw += Math.atan2(Math.sin(ty - P.yaw), Math.cos(ty - P.yaw)) * Math.min(1, dt * 2.5); P.pitch += (tp - P.pitch) * Math.min(1, dt * 2.5); } }
  P.update(dt, inp); inp.lookX = 0; inp.lookY = 0; inp.reload = false;
  Zombies.update(dt); NPCs.update(dt); FX.update(dt); Pickups.update(dt); G.weather(dt); A.musicTick(dt);
  // nav
  G.navT = (G.navT || 0) - dt; if (G.navT <= 0) { G.navT = 0.3; navUpdate(P.pos[0], P.pos[2]); }
  // NPC deaths at checkpoint after objective 1 (they get overrun off-screen when far away)
  if (G.objIndex >= 1 && V3.distXZ(P.pos, W.props.checkpoint) > 45) { for (const n of NPCs.list) if (n.combat && !n.dead && (n.name === 'COLE' || n.name === 'REYES')) { n.combat = false; n.anim = 'idle'; } }
  if (G.state !== 'playing') { G.hud(dt); return; }
  // objectives
  const o = G.obj; G.objT += dt; G.interactAvailable = false;
  if (o.timer) { if (G.objT >= o.timer) G.nextObjective(); }
  else if (o.interact) { const d = V3.distXZ(P.pos, o.target); if (d < o.interact.radius) { G.interactAvailable = true; if (G.keys.KeyE || G.touchInteract) { G.holdProg += dt; if (G.holdProg >= o.interact.hold) { G.holdProg = 0; G.nextObjective(); } } else G.holdProg = Math.max(0, G.holdProg - dt * 2); } else G.holdProg = 0; }
  else if (o.target && V3.distXZ(P.pos, o.target) < o.radius) G.nextObjective();
  // waves
  G.spawnT -= dt; if (G.spawnT <= 0 && Zombies.alive() < G.waveTarget()) { G.spawnZombie(); G.spawnT = rand(1.2, 2.8) / (1 + G.objIndex * 0.2); }
  // music intensity from nearby threats
  let near = 0; for (const z of Zombies.list) if (!z.dead && V3.distXZ(z.pos, P.pos) < 18) near++;
  const inten = clamp(0.3 + G.objIndex * 0.1 + near * 0.08, 0.2, 1); if (Math.abs(inten - A.intensity) > 0.05) A.setMusic(inten, true);
  G.hud(dt);
};
G.weather = function (dt) {
  G.lightningT -= dt; if (G.lightningT <= 0) { G.lightningT = rand(18, 45); G.lightningA = 1; G.lightningN = 2; const dist = rand(0.6, 2.5); A.thunder(dist, 0.9 - dist * 0.2); }
  if (G.lightningA > 0) { G.lightningA -= dt * 5; if (G.lightningA <= 0 && G.lightningN > 1) { G.lightningN--; G.lightningA = 0.6; } }
  R.lightning = Math.max(0, G.lightningA) * 0.6; R.wet = 1;
  // ambience by position
  const fireD = V3.distXZ(P.pos, W.props.burningCar), alarmD = V3.distXZ(P.pos, [-40, 0, -60]);
  A.setAmbience({ rain: 1, wind: 0.7 + 0.3 * Math.sin(G.time * 0.1), fire: clamp(0.5 - fireD / 40, 0, 0.35), alarm: G.objIndex >= 1 ? clamp(0.02 - alarmD / 3000, 0, 0.02) : 0 });
  if (A.genHum && A.ok) { const d = V3.dist(A.genHum.pos, P.eyePos); A.genHum.sp.gain.gain.setTargetAtTime(0.35 / (1 + Math.pow(d / 5, 1.7)), A.ctx.currentTime, 0.2); }
  A.listener.pos = P.eyePos; A.listener.fwd = R.camFwd; A.listener.right = [Math.cos(P.camYaw), 0, -Math.sin(P.camYaw)];
  // searchlight during extraction
  if (G.searchlight) { G.searchlight.t += dt; const t = G.searchlight.t; G.searchlight.pos = [Math.sin(t * 0.7) * 6, 26, -86 + Math.cos(t * 0.5) * 6]; G.searchlight.dir = V3.norm([], [Math.sin(t * 1.1) * 0.25, -1, Math.cos(t * 0.9) * 0.25]); if (Math.random() < dt * 40) { const a = rand(0, TAU), d = rand(3, 9); FX.alpha.emit({ pos: [Math.cos(a) * d, 0.3, -86 + Math.sin(a) * d], vel: [Math.cos(a) * rand(2, 5), rand(0.3, 1.2), Math.sin(a) * rand(2, 5)], life: rand(1, 2), size: rand(0.5, 1), grow: 1.0, col: [0.4, 0.38, 0.35, 0.3], type: 1, drag: 1.5 }); } }
};
/* ---- scene assembly ---- */
G.buildScene = function () {
  const opaque = W.opaque.slice(); Zombies.drawables(opaque); NPCs.drawables(opaque); Pickups.drawables(opaque);
  // lights
  const pts = G.pointsBuf; pts.length = 0; for (const l of W.points) { if (l.fn) l.intensity = l.fn(G.time); if (l.intensity > 0.01) pts.push(l); } for (const l of FX.lights) pts.push(l);
  if (P.muzzleT > 0) pts.push({ pos: P.muzzleWorld, radius: 14, color: [1, 0.75, 0.45], intensity: 30 });
  const spots = G.spotsBuf; spots.length = 0; for (const s of W.spots) spots.push(s); NPCs.spots(spots);
  if (G.searchlight) spots.unshift({ pos: G.searchlight.pos, dir: G.searchlight.dir, range: 60, cosOuter: Math.cos(deg(14)), cosInner: Math.cos(deg(6)), color: [1, 0.97, 0.9], intensity: 220 });
  // rank spots by relevance too
  spots.forEach(s => { const d2 = Math.max(4, V3.dist(s.pos, R.camPos) ** 2); s._score = s.intensity * s.range / d2; }); spots.sort((a, b) => b._score - a._score);
  R.setLights(pts, spots);
  R.flashGlow = P.flashlight && P.alive && G.state !== 'menu' ? 1 : 0;
  const viewmodel = (G.state === 'menu') ? [] : P.viewmodelDrawables();
  return { opaque, viewmodel, decals: FX.decalDrawables().concat(W.transparent), particles: FX.systems(), rainCount: Math.floor(S.rain) };
};
G.render = function (dt) {
  const fov = G.state === 'menu' ? 78 : P.fov;
  R.setCamera(P.eyePos, P.camYaw, P.camPitch, P.camRoll, fov);
  const fx = R.fx; fx.damage = clamp(P.damageFx * 0.8 + (P.alive ? (1 - P.hp / 100) * 0.35 * (P.hp < 40 ? 1 : 0) : 0), 0, 1); fx.glitch = Math.max(P.glitch, CS.active && CS.staticT > 0 ? CS.staticA * 0.5 : 0); fx.droplets = 0.8; fx.blood = P.bloodLens;
  R.exposure = 1.0;
  const scene = G.buildScene(); R.renderFrame(scene, dt);
};
/* ---- HUD ---- */
G.hud = function (dt) {
  if (G.msgT > 0) { G.msgT -= dt; if (G.msgT <= 0) $('msg').style.opacity = 0; }
  if (G.hitT > 0) { G.hitT -= dt; if (G.hitT <= 0) $('hit').style.opacity = 0; }
  G.hudT -= dt; if (G.hudT > 0) return; G.hudT = 0.1; $('hud').classList.toggle('cine', G.state === 'cutscene' || G.state === 'dead');
  const st = P.weapons[P.cur], w = P.weapon(); $('wname').textContent = w.name; const am = $('ammo'); am.innerHTML = st.ammo + ' <small>/ ' + st.reserve + '</small>'; am.classList.toggle('low', st.ammo <= Math.ceil(w.mag * 0.2));
  $('hpfill').style.width = Math.max(0, P.hp) + '%'; $('hpbar').classList.toggle('low', P.hp < 35); $('lowhp').style.opacity = P.hp < 40 ? (1 - P.hp / 40) * (0.6 + 0.4 * Math.sin(G.time * 6)) : 0;
  $('tstamp').textContent = G.timestamp(); const batt = Math.max(5, 74 - Math.floor(G.elapsed / 40)); $('battp').textContent = batt + '%'; $('battb').style.width = batt + '%'; $('storage').textContent = 'STORAGE ' + (61 + Math.floor(G.elapsed / 90)) + '%';
  $('wave').textContent = G.obj ? ('KILLS ' + P.stats.kills + ' · THREATS ' + Zombies.alive()) : '';
  const o = G.obj; if (o && o.timer) { const t = $('objtimer'); if (t) t.textContent = Math.max(0, Math.ceil(o.timer - G.objT)) + ' s'; }
  // marker
  const mk = $('marker'); if (o && o.target && G.state === 'playing') { const p = [o.target[0], o.target[1] + 1.2, o.target[2]]; const c = V3.transformMat4([], R.vp, p); const behind = (R.vp[3] * p[0] + R.vp[7] * p[1] + R.vp[11] * p[2] + R.vp[15]) < 0; let sx = (c[0] * 0.5 + 0.5) * window.innerWidth, sy = (1 - (c[1] * 0.5 + 0.5)) * window.innerHeight; if (behind) { sx = window.innerWidth - sx; sy = window.innerHeight * 0.5; } sx = clamp(sx, 40, window.innerWidth - 40); sy = clamp(sy, 60, window.innerHeight - 80); mk.style.left = sx + 'px'; mk.style.top = sy + 'px'; $('markert').textContent = Math.round(V3.distXZ(P.pos, o.target)) + ' m'; mk.classList.remove('hidden'); } else mk.classList.add('hidden');
  const pr = $('prompt'); if (G.interactAvailable && o && o.interact) { pr.classList.remove('hidden'); pr.innerHTML = '<span class="kbd">' + (IS_TOUCH ? 'USE' : 'E') + '</span> HOLD TO START GENERATOR<div class="hold"><i style="width:' + Math.round(100 * G.holdProg / (o.interact.hold)) + '%"></i></div>'; if (IS_TOUCH) $('bInteract').style.display = 'flex'; } else { pr.classList.add('hidden'); if (IS_TOUCH) $('bInteract').style.display = 'none'; }
  $('dot').style.display = (S.crosshair && P.ads < 0.5 && G.state === 'playing') ? '' : 'none';
  const f = $('fps'); if (S.showFps) { f.classList.remove('hidden'); f.textContent = Math.round(G.fps) + ' FPS · ' + R.w + '×' + R.h + ' · ' + R.drawCalls + ' draws · ' + Zombies.list.length + ' Z'; } else f.classList.add('hidden');
};
/* ---- input ---- */
G.touchMove = [0, 0]; G.touchFire = false; G.touchAim = false; G.touchSprint = false; G.touchJump = false; G.touchCrouch = false; G.touchInteract = false; G.mouseFire = false; G.mouseAim = false;
G.requestLock = function () { if (IS_TOUCH || G.noLock) return; try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => G.lockFailed()); } catch (e) { G.lockFailed(); } clearTimeout(G.lockTimer); G.lockTimer = setTimeout(() => { if (document.pointerLockElement !== canvas) G.lockFailed(); }, 1500); };
G.lockFailed = function () { if (G.noLock) return; G.noLock = true; canvas.style.cursor = 'none'; G.msg('MOUSE LOOK: MOVE THE MOUSE', 'pointer capture is unavailable here · keep the cursor over the game', 4); };
G.unlock = function () { if (document.pointerLockElement) document.exitPointerLock(); };
G.bindInput = function () {
  window.addEventListener('keydown', e => {
    if (e.repeat) return; G.keys[e.code] = true;
    if (G.state === 'cutscene') { CS.skip(); return; }
    if (G.state === 'playing') { if (e.code === 'KeyR') G.input.reload = true; if (e.code === 'KeyF') G.input.flashlight = true; if (e.code === 'Digit1') G.input.weapon = 1; if (e.code === 'Digit2') G.input.weapon = 2; if (e.code === 'Digit3') G.input.weapon = 3; if (e.code === 'KeyQ') G.input.cycle = 1; if (e.code === 'KeyG' && G.debug) G.godmode = !G.godmode; }
    if (e.code === 'Escape' || e.code === 'KeyP') { if (G.state === 'playing') G.pause(); else if (G.state === 'paused') G.unpause(); }
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', e => { G.keys[e.code] = false; });
  window.addEventListener('blur', () => { G.keys = {}; G.mouseFire = false; G.mouseAim = false; });
  canvas.addEventListener('mousedown', e => { if (IS_TOUCH && e.pointerType === 'touch') return; if (G.state === 'cutscene') { CS.skip(); return; } if (G.state === 'playing' && !document.pointerLockElement && !G.noLock) { G.requestLock(); return; } if (e.button === 0) G.mouseFire = true; if (e.button === 2) G.mouseAim = true; });
  window.addEventListener('mouseup', e => { if (e.button === 0) G.mouseFire = false; if (e.button === 2) G.mouseAim = false; });
  window.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('mousemove', e => { if ((document.pointerLockElement === canvas || G.noLock) && (G.state === 'playing' || G.state === 'cutscene')) { const mx = clamp(e.movementX, -200, 200), my = clamp(e.movementY, -200, 200); G.input.lookX += mx; G.input.lookY += my; } });
  document.addEventListener('pointerlockerror', () => G.lockFailed());
  window.addEventListener('wheel', e => { if (G.state === 'playing') G.input.cycle = e.deltaY > 0 ? 1 : -1; }, { passive: true });
  document.addEventListener('pointerlockchange', () => { G.locked = document.pointerLockElement === canvas; if (G.locked) clearTimeout(G.lockTimer); if (!G.locked && G.state === 'playing' && !IS_TOUCH && !G.noLock) G.pause(); });
  // touch controls
  if (IS_TOUCH) {
    const touch = $('touch'); touch.style.pointerEvents = 'auto'; const stick = $('stick'), knob = stick.querySelector('i'); let stickId = null, stickBase = [0, 0], lookId = null, lookLast = [0, 0];
    const btn = (id, down, up) => { const el = $(id); el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); el.classList.add('on'); down(e); }); const u = e => { el.classList.remove('on'); if (up) up(e); }; el.addEventListener('pointerup', u); el.addEventListener('pointercancel', u); el.addEventListener('pointerleave', u); };
    btn('bFire', () => { G.touchFire = true; if (G.state === 'cutscene') CS.skip(); }, () => { G.touchFire = false; });
    btn('bAim', () => { G.touchAim = !G.touchAim; $('bAim').classList.toggle('on', G.touchAim); }, () => { $('bAim').classList.toggle('on', G.touchAim); });
    btn('bReload', () => { G.input.reload = true; }); btn('bSwap', () => { G.input.cycle = 1; }); btn('bJump', () => { G.touchJump = true; });
    btn('bSprint', () => { G.touchSprint = !G.touchSprint; $('bSprint').classList.toggle('on', G.touchSprint); }, () => { $('bSprint').classList.toggle('on', G.touchSprint); });
    btn('bLight', () => { G.input.flashlight = true; }); btn('bInteract', () => { G.touchInteract = true; }, () => { G.touchInteract = false; }); btn('bPause', () => { if (G.state === 'playing') G.pause(); });
    touch.addEventListener('pointerdown', e => { if (e.target.closest('.tb')) return; e.preventDefault(); if (G.state === 'cutscene') { CS.skip(); return; }
      const x = e.clientX, y = e.clientY; if (x < window.innerWidth * 0.45 && stickId === null) { stickId = e.pointerId; stickBase = [x, y]; stick.style.left = (x - stick.offsetWidth / 2) + 'px'; stick.style.top = (y - stick.offsetHeight / 2) + 'px'; stick.style.bottom = 'auto'; stick.style.opacity = 1; }
      else if (lookId === null) { lookId = e.pointerId; lookLast = [x, y]; } });
    touch.addEventListener('pointermove', e => { if (e.pointerId === stickId) { const dx = e.clientX - stickBase[0], dy = e.clientY - stickBase[1]; const r = Math.min(window.innerHeight, window.innerWidth) * 0.11; const l = Math.hypot(dx, dy); const k = l > r ? r / l : 1; G.touchMove[0] = dx * k / r; G.touchMove[1] = -dy * k / r; knob.style.transform = 'translate(' + (dx * k) + 'px,' + (dy * k) + 'px)'; if (l > r * 0.95 && G.touchMove[1] > 0.7) { } }
      else if (e.pointerId === lookId) { const dx = e.clientX - lookLast[0], dy = e.clientY - lookLast[1]; lookLast = [e.clientX, e.clientY]; G.input.lookX += dx * 2.4 * S.touchSens; G.input.lookY += dy * 2.4 * S.touchSens; } });
    const end = e => { if (e.pointerId === stickId) { stickId = null; G.touchMove[0] = 0; G.touchMove[1] = 0; knob.style.transform = ''; stick.style.opacity = 0.6; } if (e.pointerId === lookId) lookId = null; };
    touch.addEventListener('pointerup', end); touch.addEventListener('pointercancel', end);
    stick.style.opacity = 0.6;
  }
  window.addEventListener('resize', () => R.resize()); window.addEventListener('orientationchange', () => setTimeout(() => R.resize(), 300));
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); $('ctxlost').classList.remove('hidden'); });
};
/* ---- UI ---- */
G.bindUI = function () {
  $('btnStart').onclick = () => { A.ui(); G.startMission(); };
  $('btnSettings').onclick = () => { A.init(); A.ui(); $('settings').classList.remove('hidden'); };
  $('btnHelp').onclick = () => { A.init(); A.ui(); $('help').classList.remove('hidden'); };
  $('btnCloseHelp').onclick = () => { A.ui(); $('help').classList.add('hidden'); };
  $('btnCloseSettings').onclick = () => { A.ui(); $('settings').classList.add('hidden'); saveSettings(); };
  $('btnDefaults').onclick = () => { for (const k in S) delete S[k]; Object.assign(S, DEFAULTS, PRESETS[DEFAULTS.preset]); saveSettings(); G.buildSettingsUI(); G.applyGraphics(true); A.applyVolumes(); };
  $('btnUnpause').onclick = () => { A.ui(); G.unpause(); }; $('btnPauseSettings').onclick = () => { A.ui(); $('settings').classList.remove('hidden'); };
  $('btnRestart').onclick = () => { A.ui(); $('pause').classList.add('hidden'); G.state = 'playing'; G.retry(); }; $('btnQuit').onclick = () => { A.ui(); G.toMenu(); };
  $('btnRetry').onclick = () => { A.ui(); G.retry(); }; $('btnToMenu').onclick = () => { A.ui(); G.toMenu(); };
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { document.querySelectorAll('.tabs button').forEach(x => x.classList.remove('on')); b.classList.add('on'); document.querySelectorAll('.tab').forEach(x => x.classList.remove('on')); $('tab-' + b.dataset.tab).classList.add('on'); });
  $('skip').onclick = () => CS.skip();
  if (!HAS_HDR) $('warn').textContent = 'Warning: float render targets unavailable — HDR lighting and bloom are reduced on this device.';
};
const SETTING_ROWS = {
  gfx: [
    ['preset', 'Quality preset', 'select', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']], 'Applies a full set of options below'],
    ['scale', 'Render scale', 'range', [0.4, 1.0, 0.05], 'Internal resolution relative to the screen'],
    ['dynres', 'Dynamic resolution', 'toggle', null, 'Lowers render scale automatically to hold frame rate'],
    ['shadows', 'Shadows', 'select', [[0, 'Off'], [1, 'Low'], [2, 'Medium'], [3, 'High'], [4, 'Ultra']], 'Moon and flashlight shadow maps'],
    ['ssao', 'Ambient occlusion', 'toggle', null, 'Screen-space contact shadows'],
    ['bloom', 'Bloom', 'toggle', null, 'Glow on bright lights'], ['mblur', 'Motion blur', 'toggle', null, 'Camera motion blur (bodycam smear)'],
    ['vol', 'Volumetric flashlight', 'toggle', null, 'Light shafts in rain and fog (expensive)'], ['fxaa', 'Anti-aliasing (FXAA)', 'toggle', null, ''],
    ['tex', 'Texture resolution', 'select', [[512, '512'], [1024, '1024'], [2048, '2048']], 'Procedural texture size'],
    ['rain', 'Rain density', 'range', [0, 4000, 200], 'Number of rain streaks'], ['zombies', 'Max simultaneous zombies', 'range', [8, 40, 2], 'Also raises difficulty'],
    ['fov', 'Field of view', 'range', [70, 115, 1], 'Degrees, horizontal-ish'], ['lensfx', 'Bodycam lens effects', 'toggle', null, 'Fisheye, chromatic aberration, rain on lens, dirt'],
    ['fisheye', 'Fisheye distortion', 'range', [0, 1, 0.05], ''], ['ca', 'Chromatic aberration', 'range', [0, 1, 0.05], ''], ['grain', 'Sensor noise / grain', 'range', [0, 1.5, 0.05], ''], ['vignette', 'Vignette', 'range', [0, 1, 0.05], ''], ['sharpen', 'Sharpening', 'range', [0, 0.8, 0.05], ''],
    ['crosshair', 'Aiming dot', 'toggle', null, ''], ['showFps', 'Show performance stats', 'toggle', null, ''],
  ],
  ctl: [['sens', 'Mouse sensitivity', 'range', [0.2, 3, 0.1], ''], ['touchSens', 'Touch look sensitivity', 'range', [0.3, 3, 0.1], ''], ['invertY', 'Invert vertical look', 'toggle', null, ''], ['autoAim', 'Aim assist (touch)', 'toggle', null, 'Gentle pull toward targets near the centre']],
  aud: [['master', 'Master volume', 'range', [0, 1, 0.05], ''], ['sfx', 'Effects', 'range', [0, 1, 0.05], ''], ['music', 'Music', 'range', [0, 1, 0.05], ''], ['ambience', 'Ambience', 'range', [0, 1, 0.05], '']],
};
G.buildSettingsUI = function () {
  for (const tab in SETTING_ROWS) {
    const el = $('tab-' + tab); el.innerHTML = '';
    for (const [key, label, type, opts, hint] of SETTING_ROWS[tab]) {
      const row = document.createElement('div'); row.className = 'row'; row.innerHTML = '<label>' + label + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</label>';
      let ctl;
      if (type === 'select') { ctl = document.createElement('select'); for (const [v, t] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; ctl.appendChild(o); } ctl.value = S[key]; ctl.onchange = () => { const v = isNaN(+ctl.value) ? ctl.value : +ctl.value; G.setSetting(key, v); }; }
      else if (type === 'range') { ctl = document.createElement('input'); ctl.type = 'range'; ctl.min = opts[0]; ctl.max = opts[1]; ctl.step = opts[2]; ctl.value = S[key]; const val = document.createElement('span'); val.className = 'val'; val.textContent = G.fmtSetting(key, S[key]); ctl.oninput = () => { val.textContent = G.fmtSetting(key, +ctl.value); }; ctl.onchange = () => G.setSetting(key, +ctl.value); row.appendChild(ctl); row.appendChild(val); ctl = null; }
      else { ctl = document.createElement('button'); ctl.className = 'toggle' + (S[key] ? ' on' : ''); ctl.textContent = S[key] ? 'ON' : 'OFF'; ctl.onclick = () => { G.setSetting(key, S[key] ? 0 : 1); ctl.classList.toggle('on', !!S[key]); ctl.textContent = S[key] ? 'ON' : 'OFF'; }; }
      if (ctl) row.appendChild(ctl); el.appendChild(row);
    }
  }
};
G.fmtSetting = function (key, v) { if (key === 'fov') return v + '°'; if (key === 'scale') return Math.round(v * 100) + ' %'; if (['rain', 'zombies'].includes(key)) return String(v); return (Math.round(v * 100) / 100).toFixed(2); };
G.setSetting = function (key, v) {
  A.ui(); if (key === 'preset') { applyPreset(v); G.buildSettingsUI(); G.applyGraphics(true); saveSettings(); return; }
  S[key] = v; saveSettings();
  if (['master', 'sfx', 'music', 'ambience'].includes(key)) A.applyVolumes();
  else if (key === 'tex') G.applyGraphics(true); else if (['scale', 'shadows', 'dynres'].includes(key)) R.applySettings();
};
G.applyGraphics = function (regenTex) { R.applySettings(); if (regenTex) { $('status').textContent = 'Regenerating textures…'; setTimeout(() => { for (const d of TEX_DEFS) generateTexture(d); $('status').textContent = 'Camera ready'; }, 30); } };
