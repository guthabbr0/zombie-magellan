/* ============================================================
   Player: movement, body-simulated camera, weapons, viewmodel
   ============================================================ */
const P = {
  pos: [0, 0, 62], vel: [0, 0, 0], yaw: 0, pitch: 0, onGround: true, crouch: 0, crouchHeld: false, sprinting: false, stamina: 1, hp: 100, alive: true,
  weapons: { pistol: { ammo: 15, reserve: 90 }, rifle: null, shotgun: null }, order: ['pistol', 'rifle', 'shotgun'], cur: 'pistol', next: null, switchT: 0, switchPhase: 0,
  reload: null, fireT: 0, pumpT: 0, ads: 0, flashlight: true, phase: 0, bobAmp: 0, speedXZ: 0, yawRate: 0, pitchRate: 0, prevYaw: 0, prevPitch: 0,
  cam: { dip: 0, dipVel: 0, roll: 0, pitchOff: 0, shake: 0, shakeT: 0, kickP: 0, kickY: 0, kickVP: 0, kickVY: 0, yawLag: 0, height: 1.52 },
  recoil: { z: 0, zv: 0, rot: 0, rotv: 0 }, lastDamageT: -99, damageFx: 0, bloodLens: 0, glitch: 0, staminaT: 0, fwdSpeed: 0, prevFwdSpeed: 0, breathT: 0, heartT: 0,
  stats: { shots: 0, hits: 0, kills: 0, headshots: 0, damage: 0 }, muzzleT: 0, control: true, vmMeshes: {}, bones: new Float32Array(5 * 16), vmModel: M4.create(), muzzleWorld: [0, 0, 0], eyePos: [0, 1.5, 0],
  camYaw: 0, camPitch: 0, camRoll: 0, fov: 96, fireHeld: false, firePressedEdge: false, interactT: 0,
};
P.reset = function (pos, yaw) {
  V3.copy(P.pos, pos); V3.set(P.vel, 0, 0, 0); P.yaw = yaw; P.pitch = 0; P.hp = 100; P.alive = true; P.stamina = 1; P.ads = 0; P.reload = null; P.fireT = 0; P.switchT = 0; P.next = null; P.damageFx = 0; P.bloodLens = 0; P.glitch = 0; P.crouch = 0; P.control = true; P.lastDamageT = -99;
  P.cam.dip = 0; P.cam.dipVel = 0; P.cam.shake = 0; P.cam.kickP = 0; P.cam.kickY = 0; P.recoil.z = 0; P.recoil.rot = 0; P.flashlight = true;
};
P.weapon = () => WEAPONS[P.cur];
P.give = function (type, ammo) { const w = WEAPONS[type]; if (!P.weapons[type]) { P.weapons[type] = { ammo: w.mag, reserve: ammo !== undefined ? ammo : w.reserve }; P.switchTo(type); } else P.weapons[type].reserve = Math.min(w.maxReserve, P.weapons[type].reserve + (ammo || w.reserve)); };
P.switchTo = function (type) { if (!P.weapons[type] || type === P.cur || P.next) return; P.next = type; P.switchT = 0; P.switchPhase = 0; P.reload = null; A.click(1200, 0.2, null, 0.03); };
P.cycle = function (dir) { const owned = P.order.filter(k => P.weapons[k]); let i = owned.indexOf(P.cur); i = (i + dir + owned.length) % owned.length; P.switchTo(owned[i]); };
P.canAct = () => P.alive && P.control && !P.next;
P.startReload = function () { const w = P.weapon(), st = P.weapons[P.cur]; if (P.reload || st.ammo >= w.mag || st.reserve <= 0 || !P.canAct()) return; P.reload = { t: 0, dur: w.reload, step: 0 }; if (!w.shellByShell) A.reloadSound(0, P.cur); };
P.ammoPickup = function () { let any = false; for (const k of P.order) { const st = P.weapons[k]; if (!st) continue; const w = WEAPONS[k]; if (st.reserve < w.maxReserve) { st.reserve = Math.min(w.maxReserve, st.reserve + Math.round(w.mag * 1.5)); any = true; } } return any; };
P.takeDamage = function (amount, from) {
  if (!P.alive || G.godmode) return; P.hp -= amount; P.lastDamageT = G.time; P.damageFx = 1; P.bloodLens = Math.min(1, P.bloodLens + 0.28); P.cam.shake = Math.min(1, P.cam.shake + 0.6); P.glitch = 0.8;
  P.cam.kickP += rand(-0.06, 0.06); P.cam.kickY += rand(-0.08, 0.08); P.cam.dipVel -= 0.4; A.playerHurt(); P.stats.damage += amount;
  if (P.hp <= 0) { P.hp = 0; P.alive = false; G.onPlayerDeath(from); }
};
P.update = function (dt, inp) {
  const c = P.cam; const w = P.weapon(); const st = P.weapons[P.cur];
  // ---- look
  if (P.control && P.alive) { const sens = 0.0022 * S.sens; P.yaw -= inp.lookX * sens; P.pitch = clamp(P.pitch - inp.lookY * sens * (S.invertY ? -1 : 1), -1.45, 1.45); }
  P.yawRate = damp(P.yawRate, (P.yaw - P.prevYaw) / Math.max(dt, 1e-4), 20, dt); P.pitchRate = damp(P.pitchRate, (P.pitch - P.prevPitch) / Math.max(dt, 1e-4), 20, dt); P.prevYaw = P.yaw; P.prevPitch = P.pitch;
  // ---- movement
  const mv = P.control && P.alive ? inp.move : [0, 0];
  const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw); const fwd = [-sy, 0, -cy], right = [cy, 0, -sy];
  let ml = Math.hypot(mv[0], mv[1]); if (ml > 1) { mv[0] /= ml; mv[1] /= ml; ml = 1; }
  const wantSprint = inp.sprint && mv[1] > 0.3 && P.stamina > 0.05 && !P.reload && P.ads < 0.3 && P.crouch < 0.5;
  P.sprinting = wantSprint; if (P.sprinting) { P.stamina = Math.max(0, P.stamina - dt * 0.14); P.staminaT = 0; } else { P.staminaT += dt; if (P.staminaT > 1.2) P.stamina = Math.min(1, P.stamina + dt * 0.11); }
  P.crouch = damp(P.crouch, (inp.crouch && P.control) ? 1 : 0, 10, dt);
  const speed = (P.sprinting ? 6.3 : 3.8) * (1 - P.crouch * 0.55) * (1 - P.ads * 0.35) * (mv[1] < 0 ? 0.72 : 1) * (P.reload ? 0.85 : 1);
  const wx = (fwd[0] * mv[1] + right[0] * mv[0]) * speed, wz = (fwd[2] * mv[1] + right[2] * mv[0]) * speed;
  const accel = P.onGround ? 9 : 2.5; P.vel[0] = damp(P.vel[0], wx, accel, dt); P.vel[2] = damp(P.vel[2], wz, accel, dt);
  if (inp.jump && P.onGround && P.control && P.alive && P.crouch < 0.5) { P.vel[1] = 4.3; P.onGround = false; A.footstep(null, R.wet, 0.4); }
  P.vel[1] -= 13.5 * dt;
  const wasGround = P.onGround; P.pos[0] += P.vel[0] * dt; P.pos[2] += P.vel[2] * dt; P.pos[1] += P.vel[1] * dt;
  const r = resolveCircle(P.pos[0], P.pos[2], 0.38, P.pos[1]); P.pos[0] = r[0]; P.pos[2] = r[1];
  const gy = groundY(P.pos[0], P.pos[2]);
  if (P.pos[1] <= gy) { if (!wasGround && P.vel[1] < -2.5) { c.dipVel -= Math.min(1.2, -P.vel[1] * 0.16); A.footstep(null, R.wet, 0.7); } P.pos[1] = gy; P.vel[1] = 0; P.onGround = true; } else P.onGround = P.pos[1] - gy < 0.02;
  P.speedXZ = Math.hypot(P.vel[0], P.vel[2]);
  P.prevFwdSpeed = P.fwdSpeed; P.fwdSpeed = P.vel[0] * fwd[0] + P.vel[2] * fwd[2]; const accelFwd = (P.fwdSpeed - P.prevFwdSpeed) / Math.max(dt, 1e-4);
  const strafe = P.vel[0] * right[0] + P.vel[2] * right[2];
  // ---- bob & steps
  if (P.onGround && P.speedXZ > 0.3) { const prev = P.phase; P.phase += dt * P.speedXZ * 3.3; if (Math.floor(P.phase / PI) !== Math.floor(prev / PI)) { A.footstep(null, R.wet, P.sprinting ? 0.7 : 0.45, P.sprinting); c.dipVel -= P.sprinting ? 0.22 : 0.09; G.onPlayerStep(); } }
  const targetAmp = P.onGround ? clamp(P.speedXZ / 3.8, 0, 1.7) * (P.sprinting ? 0.05 : 0.026) : 0; P.bobAmp = damp(P.bobAmp, targetAmp, 8, dt);
  // ---- camera body simulation (springs)
  const k = 90, cdamp = 11; c.dipVel += (-c.dip * k - c.dipVel * cdamp) * dt; c.dip += c.dipVel * dt; c.dip = clamp(c.dip, -0.25, 0.1);
  c.roll = damp(c.roll, -strafe * 0.010 - P.yawRate * 0.006, 8, dt); c.pitchOff = damp(c.pitchOff, -clamp(accelFwd, -20, 20) * 0.0025, 6, dt);
  c.kickVP += (-c.kickP * 140 - c.kickVP * 14) * dt; c.kickP += c.kickVP * dt; c.kickVY += (-c.kickY * 140 - c.kickVY * 14) * dt; c.kickY += c.kickVY * dt;
  c.shake = Math.max(0, c.shake - dt * 1.6); c.shakeT += dt * 30;
  P.breathT += dt * (1.1 + (1 - P.stamina) * 1.6); const breath = Math.sin(P.breathT) * 0.0035 * (1 + (1 - P.stamina) * 2.5);
  const t = G.time; const hand = [Math.sin(t * 1.7) * Math.sin(t * 0.9 + 1.3) * 0.003 + Math.sin(t * 5.1) * 0.0006, Math.sin(t * 1.3 + 2) * Math.sin(t * 0.7) * 0.003 + Math.cos(t * 4.3) * 0.0006];
  const sh = c.shake * c.shake * 0.05; const shk = [Math.sin(c.shakeT * 1.9) * sh, Math.sin(c.shakeT * 2.7 + 1) * sh, Math.sin(c.shakeT * 2.3 + 2) * sh * 0.6];
  c.height = damp(c.height, lerp(1.52, 0.98, P.crouch), 9, dt);
  const bobY = -Math.abs(Math.sin(P.phase)) * P.bobAmp, bobX = Math.sin(P.phase) * P.bobAmp * 0.45;
  P.camYaw = P.yaw + c.kickY + hand[0] + shk[1]; P.camPitch = P.pitch + c.kickP + c.pitchOff + breath + hand[1] + shk[0]; P.camRoll = c.roll + Math.sin(P.phase) * P.bobAmp * 0.9 + shk[2];
  P.eyePos[0] = P.pos[0] + right[0] * bobX + fwd[0] * 0.06; P.eyePos[1] = P.pos[1] + c.height + bobY + c.dip; P.eyePos[2] = P.pos[2] + right[2] * bobX + fwd[2] * 0.06;
  // ---- weapons
  const canAct = P.canAct();
  P.ads = damp(P.ads, (inp.aim && canAct && !P.sprinting && !P.reload) ? 1 : 0, 12, dt);
  P.fov = S.fov * lerp(1, w.adsFov, P.ads);
  if (P.next) { P.switchT += dt / (P.switchPhase === 0 ? 0.22 : 0.3); if (P.switchT >= 1) { if (P.switchPhase === 0) { P.cur = P.next; P.switchPhase = 1; P.switchT = 0; A.click(900, 0.2, null, 0.04); } else { P.next = null; P.switchT = 0; } } }
  P.fireT -= dt; P.muzzleT -= dt;
  if (P.reload) {
    const rl = P.reload, ww = P.weapon(), ss = P.weapons[P.cur]; rl.t += dt;
    if (ww.shellByShell) { if (rl.t >= rl.dur) { rl.t -= rl.dur; ss.ammo++; ss.reserve--; A.reloadSound(0, 'shotgun'); if (ss.ammo >= ww.mag || ss.reserve <= 0) { P.reload = null; P.pumpT = 0.5; A.pump(); } } if (inp.fire && ss.ammo > 0 && P.reload) { P.reload = null; P.pumpT = 0.5; A.pump(); } }
    else { const f = rl.t / rl.dur; if (rl.step === 0 && f > 0.42) { rl.step = 1; A.reloadSound(1, P.cur); } if (rl.step === 1 && f > 0.78) { rl.step = 2; A.reloadSound(2, P.cur); } if (rl.t >= rl.dur) { const need = ww.mag - ss.ammo; const take = Math.min(need, ss.reserve); ss.ammo += take; ss.reserve -= take; P.reload = null; } }
  }
  P.pumpT = Math.max(0, P.pumpT - dt);
  const firePressed = inp.fire && !P.fireHeld; P.fireHeld = !!inp.fire;
  if (canAct && !P.reload && P.pumpT <= 0 && (w.auto ? inp.fire : firePressed) && P.fireT <= 0) {
    if (st.ammo > 0) P.fire(); else { if (firePressed) { A.dryFire(); if (st.reserve > 0) P.startReload(); } }
  }
  if (inp.reload && canAct) P.startReload();
  // recoil springs
  P.recoil.zv += (-P.recoil.z * 260 - P.recoil.zv * 18) * dt; P.recoil.z += P.recoil.zv * dt; P.recoil.rotv += (-P.recoil.rot * 260 - P.recoil.rotv * 18) * dt; P.recoil.rot += P.recoil.rotv * dt;
  // regen & fx
  if (P.alive && G.time - P.lastDamageT > 6) P.hp = Math.min(100, P.hp + dt * 7);
  P.damageFx = Math.max(0, P.damageFx - dt * 1.4); P.bloodLens = Math.max(0, P.bloodLens - dt * 0.035 * (R.wet ? 2 : 1)); P.glitch = Math.max(0, P.glitch - dt * 2.5);
  if (P.alive && P.hp < 35) { P.heartT += dt * (1 + (35 - P.hp) / 35); if (P.heartT > 1) { P.heartT = 0; A.heartbeat(0.5 * (1 - P.hp / 35)); } }
  P.updateViewmodel(dt, inp);
};
P.fire = function () {
  const w = P.weapon(), st = P.weapons[P.cur]; st.ammo--; P.fireT = 60 / w.rpm; P.stats.shots++;
  if (w.pump) { P.pumpT = 0.55; setTimeout(() => { if (P.cur === 'shotgun') A.pump(); }, 260); }
  const rc = w.recoil; P.recoil.zv += rc[0] * 22 * (1 - P.ads * 0.25); P.recoil.rotv += rc[1] * 0.9 * (1 - P.ads * 0.3);
  P.cam.kickVP += deg(rc[1]) * 4.2 * (1 - P.ads * 0.35); P.cam.kickVY += deg(rand(-rc[2], rc[2])) * 4.0; P.cam.shake = Math.min(1, P.cam.shake + w.kick * 0.25);
  P.muzzleT = 0.05; A.gunshot(w.sound); A.shell();
  // hitscan
  const spread = lerp(w.spread, w.adsSpread, P.ads) * (1 + P.speedXZ * 0.25 + (P.onGround ? 0 : 0.8));
  const cf = R.camFwd, cr = [Math.cos(P.camYaw), 0, -Math.sin(P.camYaw)], cu = V3.cross([], cr, cf);
  const ro = P.eyePos.slice();
  let hitAny = false, head = false;
  for (let i = 0; i < w.pellets; i++) {
    const a = rand(0, TAU), rr = Math.sqrt(Math.random()) * spread; const dx = Math.cos(a) * rr, dy = Math.sin(a) * rr;
    const rd = V3.norm([], [cf[0] + cr[0] * dx + cu[0] * dy, cf[1] + cr[1] * dx + cu[1] * dy, cf[2] + cr[2] * dx + cu[2] * dy]);
    const wh = raycastWorld(ro, rd, w.range); let maxT = wh ? wh.t : w.range;
    const zh = Zombies.raycast(ro, rd, maxT);
    if (zh) { hitAny = true; if (zh.bone === B.head) head = true; zh.z.hit(w.dmg, zh.bone, rd, ro, w); FX.blood(zh.p, rd, zh.bone === B.head ? 2 : 1); }
    else if (wh) { FX.impact(wh.p, wh.n, wh.tag); }
    if (i === 0) { P.tracerEnd = zh ? zh.p : (wh ? wh.p : V3.addScaled([], ro, rd, w.range)); }
  }
  if (hitAny) { P.stats.hits++; G.hitMarker(head); }
  FX.muzzle(P.muzzleWorld, cf); Zombies.noise(P.pos, 45);
};
// viewmodel transform (camera space) + bones
P.updateViewmodel = function (dt, inp) {
  const w = P.weapon(); const c = P.cam;
  const base = [lerp(w.hip[0], w.ads[0], P.ads), lerp(w.hip[1], w.ads[1], P.ads), lerp(w.hip[2], w.ads[2], P.ads)];
  const sw = w.swayScale * (1 - P.ads * 0.75);
  let x = base[0] + clamp(-P.yawRate * 0.012, -0.05, 0.05) * sw + Math.sin(P.phase) * P.bobAmp * 0.8 * (1 - P.ads * 0.7);
  let y = base[1] + clamp(-P.pitchRate * 0.010, -0.05, 0.05) * sw - Math.abs(Math.sin(P.phase)) * P.bobAmp * 0.5 * (1 - P.ads * 0.7) + c.dip * 0.6;
  let z = base[2] + P.recoil.z;
  let ry = clamp(-P.yawRate * 0.045, -0.12, 0.12) * sw, rx = clamp(-P.pitchRate * 0.03, -0.1, 0.1) * sw - P.recoil.rot * 0.9, rz = Math.sin(P.phase) * P.bobAmp * 1.5 * (1 - P.ads);
  // sprint pose
  const spr = damp(P._spr || 0, P.sprinting ? 1 : 0, 9, dt); P._spr = spr;
  x += -0.06 * spr; y += -0.07 * spr; z += 0.06 * spr; ry += 0.55 * spr; rx += -0.35 * spr; rz += -0.2 * spr;
  // reload pose
  let magOff = [0, 0, 0], handOff = [0, 0, 0], slideOff = 0;
  if (P.reload) { const f = P.reload.t / P.reload.dur; const bell = Math.sin(Math.min(f, 1) * PI);
    if (w.shellByShell) { rx += -0.25 * bell; rz += 0.35 * bell; y += -0.02 * bell; const hf = f < 0.5 ? f * 2 : 2 - f * 2; handOff = [0.12 * hf, -0.05 * hf, 0.35 * hf]; }
    else { rx += -0.35 * bell; rz += -0.55 * bell; x += 0.03 * bell; y += -0.04 * bell; const m = smoothstep(0.15, 0.4, f) * (1 - smoothstep(0.6, 0.85, f)); magOff = [0, -0.22 * m, 0.03 * m]; const h = smoothstep(0.05, 0.2, f) * (1 - smoothstep(0.85, 1.0, f)); const hb = w === WEAPONS.pistol ? [0.0, -0.1, 0.06] : [0.02, -0.06, 0.18]; handOff = [hb[0] * h + magOff[0], hb[1] * h + magOff[1] - 0.22 * m, hb[2] * h + magOff[2]]; if (f > 0.85) { const b = (f - 0.85) / 0.15; slideOff = Math.sin(b * PI) * 0.03; } }
  }
  if (P.pumpT > 0 && w.pump) { const f = 1 - P.pumpT / 0.55; const pc = f < 0.5 ? smoothstep(0, 0.5, f) : 1 - smoothstep(0.5, 1, f); slideOff = 0.09 * pc; handOff = [0, 0, 0.09 * pc]; rx += -0.06 * pc; }
  if (w === WEAPONS.pistol) slideOff += Math.min(0.045, P.recoil.z * 1.5);
  if (P.next) { const f = P.switchPhase === 0 ? P.switchT : 1 - P.switchT; y -= 0.32 * f; rx -= 0.5 * f; }
  // low health tremor
  if (P.hp < 30) { const tr = (30 - P.hp) / 30 * 0.004; x += Math.sin(G.time * 23) * tr; y += Math.cos(G.time * 31) * tr; }
  const m = P.vmModel; M4.identity(m); M4.translate(m, m, [x, y, z]); M4.rotateY(m, m, ry); M4.rotateX(m, m, rx); M4.rotateZ(m, m, rz);
  const bn = P.bones; for (let i = 0; i < 5; i++) M4.identity(bn.subarray(i * 16, i * 16 + 16));
  bn[16 + 12] = magOff[0]; bn[16 + 13] = magOff[1]; bn[16 + 14] = magOff[2]; bn[32 + 12] = handOff[0]; bn[32 + 13] = handOff[1]; bn[32 + 14] = handOff[2]; bn[64 + 14] = slideOff;
  // world-space model
  P.vmWorld = P.vmWorld || M4.create(); M4.mul(P.vmWorld, R.camWorld, m);
  V3.transformMat4(P.muzzleWorld, P.vmWorld, w.muzzle);
  const lp = V3.transformMat4([], P.vmWorld, w.light); const ld = V3.norm([], V3.transformDir([], P.vmWorld, [0, 0, -1]));
  R.flash.on = (P.flashlight && P.alive) ? 1 : 0; V3.copy(R.flash.pos, lp); V3.copy(R.flash.dir, ld);
};
// drawables for the viewmodel
P.viewmodelDrawables = function () {
  if (!P.alive || !P.control && G.state === 'cutscene' && !G.cutsceneShowWeapon) return [];
  const w = P.weapon(); const vm = P.vmMeshes[P.cur]; if (!vm) return [];
  const list = [{ mesh: vm.metal, mat: P.metalMat, model: P.vmWorld, bones: P.bones, castShadow: false }, { mesh: vm.arms, mat: P.armsMat, model: P.vmWorld, bones: P.bones, castShadow: false }];
  if (vm.wood) list.push({ mesh: vm.wood, mat: MATS.wood, model: P.vmWorld, bones: P.bones, castShadow: false });
  if (vm.dot) list.push({ mesh: vm.dot, mat: P.dotMat, model: P.vmWorld, bones: P.bones, castShadow: false });
  P.lensMat.emissive = P.flashlight ? [3, 2.8, 2.5] : [0, 0, 0]; list.push({ mesh: vm.lens, mat: P.lensMat, model: P.vmWorld, bones: P.bones, castShadow: false });
  return list;
};
P.initMeshes = function () {
  for (const k of ['pistol', 'rifle', 'shotgun']) P.vmMeshes[k] = buildWeaponMesh(k);
  P.metalMat = mat({ tex: 'metal', tint: [0.09, 0.09, 0.095, 1], rough: 1.4, metal: 0.9, tiling: [1, 1] }); P.armsMat = mat({ tex: 'soldier', wrap: 0.1 }); P.dotMat = mat({ tex: 'blank', tint: [1, 0.1, 0.05, 1], emissive: [4, 0.2, 0.05], unlit: 1 }); P.lensMat = mat({ tex: 'blank', tint: [1, 1, 1, 1], emissive: [3, 2.8, 2.5], unlit: 1 });
};
