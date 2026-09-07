/* ============================================================
   Humanoid: skeleton FK, ragdoll, zombies & NPC soldiers
   ============================================================ */
const _scratch = { m: M4.create(), m2: M4.create(), world: Array.from({ length: NBONES }, () => M4.create()) };
// ragdoll constraint set (from bone segments + structure)
const RAG_CONS = []; const _cons = new Set();
function addCon(a, b, min) { const k = a < b ? a + '_' + b : b + '_' + a; if (_cons.has(k)) return; _cons.add(k); RAG_CONS.push({ a, b, d: V3.dist(RAG_REST[a], RAG_REST[b]), min: min || 0 }); }
BONES.forEach(b => addCon(b[4], b[5]));
[[5, 9], [13, 17], [0, 5], [0, 9], [2, 13], [2, 17], [3, 5], [3, 9], [1, 5], [1, 9], [21, 2], [4, 3], [4, 5], [4, 9], [1, 13], [1, 17]].forEach(([a, b]) => addCon(a, b));
const RAG_LIMITS = [[5, 7, 0.26], [9, 11, 0.26], [13, 15, 0.42], [17, 19, 0.42], [0, 4, 0.58], [2, 15, 0.5], [2, 19, 0.5]]; // min distances
// rest basis for bone frames (used by ragdoll -> bone matrices)
function basis(out, d, r) { const z = V3.norm([], d); let x = V3.cross([], r, z); if (V3.len(x) < 1e-4) x = V3.cross([], [1, 0, 0], z); V3.norm(x, x); const y = V3.cross([], z, x); return M4.fromAxes(out, x, y, z, [0, 0, 0]); }
const RAG_B0T = BONES.map((b, i) => { const d0 = V3.sub([], b[3], b[2]); const ref = i === B.Lfoot || i === B.Rfoot ? [0, 1, 0] : [0, 0, 1]; const m = basis(M4.create(), d0, ref); return M4.transposeRot(M4.create(), m); });
class Humanoid {
  constructor(pos, yaw, opts = {}) {
    this.pos = pos.slice(); this.yaw = yaw; this.scale = opts.scale || 1; this.rot = new Float32Array(NBONES * 3); this.rootOff = [0, 0, 0];
    this.bones = new Float32Array(NBONES * 16); this.model = M4.create(); this.rag = null; this.tex = opts.tex || 'zombie0'; this.tint = opts.tint || [1, 1, 1, 1];
    this.mat = mat({ tex: this.tex, tint: this.tint, wrap: opts.wrap === undefined ? 0.25 : opts.wrap, normalStr: 0.8 }); this.mesh = opts.mesh; this.dead = false; this.vel = [0, 0, 0];
    this.drawable = { mesh: this.mesh, mat: this.mat, model: this.model, bones: this.bones, castShadow: true };
  }
  computeModel() { const m = this.model; M4.identity(m); M4.translate(m, m, this.pos); M4.rotateY(m, m, this.yaw); if (this.scale !== 1) M4.scale(m, m, [this.scale, this.scale, this.scale]); }
  // FK from local Euler rotations -> skin matrices (model space)
  computeBones() {
    const W_ = _scratch.world, m = _scratch.m, rot = this.rot;
    for (let i = 0; i < NBONES; i++) {
      const b = BONES[i]; const off = BONE_OFF[i]; M4.identity(m);
      if (b[1] < 0) M4.translate(m, m, [off[0] + this.rootOff[0], off[1] + this.rootOff[1], off[2] + this.rootOff[2]]); else M4.translate(m, m, off);
      const rx = rot[i * 3], ry = rot[i * 3 + 1], rz = rot[i * 3 + 2];
      if (ry) M4.rotateY(m, m, ry); if (rx) M4.rotateX(m, m, rx); if (rz) M4.rotateZ(m, m, rz);
      if (b[1] < 0) M4.copy(W_[i], m); else M4.mul(W_[i], W_[b[1]], m);
      const s = this.bones.subarray(i * 16, i * 16 + 16); M4.translate(s, W_[i], [-BONE_HEAD[i][0], -BONE_HEAD[i][1], -BONE_HEAD[i][2]]);
    }
  }
  // world-space joint position for bone i (head) or tail
  jointWorld(i, tail, out) { const W_ = _scratch.world; const b = BONES[i]; const p = tail ? V3.sub([], b[3], b[2]) : [0, 0, 0]; V3.transformMat4(out, W_[i], p); return V3.transformMat4(out, this.model, out); }
  // capsules for raycasts: [a, b, r, bone]
  capsules() {
    const out = []; const radii = { 0: 0.17, 1: 0.18, 2: 0.18, 3: 0.07, 4: 0.13, 5: 0.07, 6: 0.06, 7: 0.05, 8: 0.07, 9: 0.06, 10: 0.05, 11: 0.1, 12: 0.08, 13: 0.06, 14: 0.1, 15: 0.08, 16: 0.06 };
    if (this.rag) { const p = this.rag.p; for (let i = 0; i < NBONES; i++) { const b = BONES[i]; const a = b[4] * 3, t = b[5] * 3; out.push([[p[a], p[a + 1], p[a + 2]], [p[t], p[t + 1], p[t + 2]], radii[i] * this.scale, i]); } return out; }
    this.computeBones(); // ensure scratch world is this humanoid's
    for (let i = 0; i < NBONES; i++) { const a = this.jointWorld(i, false, [0, 0, 0]), b = this.jointWorld(i, true, [0, 0, 0]); if (i === B.head) V3.addScaled(b, b, V3.norm([], V3.sub([], b, a)), 0.06); out.push([a, b, radii[i] * this.scale, i]); }
    return out;
  }
  startRagdoll(impulseDir, impulseBone, strength) {
    this.computeBones(); const p = new Float32Array(RAG_N * 3), pp = new Float32Array(RAG_N * 3);
    for (let i = 0; i < NBONES; i++) { const b = BONES[i]; const h = this.jointWorld(i, false, [0, 0, 0]), t = this.jointWorld(i, true, [0, 0, 0]); p.set(h, b[4] * 3); p.set(t, b[5] * 3); }
    const v = this.vel; for (let k = 0; k < RAG_N; k++) { pp[k * 3] = p[k * 3] - v[0] * 0.016; pp[k * 3 + 1] = p[k * 3 + 1] - v[1] * 0.016; pp[k * 3 + 2] = p[k * 3 + 2] - v[2] * 0.016; }
    if (impulseDir) { const bi = impulseBone >= 0 ? impulseBone : B.chest; const pts = [BONES[bi][4], BONES[bi][5]]; const s = (strength || 1) * 0.016;
      for (const k of pts) { pp[k * 3] -= impulseDir[0] * s * 6; pp[k * 3 + 1] -= impulseDir[1] * s * 3; pp[k * 3 + 2] -= impulseDir[2] * s * 6; }
      for (const k of [0, 1, 2]) { pp[k * 3] -= impulseDir[0] * s * 2.5; pp[k * 3 + 2] -= impulseDir[2] * s * 2.5; } }
    this.rag = { p, pp, t: 0, settled: false }; this.dead = true; M4.identity(this.model); this.ragdollBones();
  }
  ragdollStep(dt) {
    const r = this.rag; r.t += dt; if (r.settled) return; const p = r.p, pp = r.pp; const sub = 2; const h = dt / sub; const sc = this.scale;
    for (let s = 0; s < sub; s++) {
      for (let k = 0; k < RAG_N; k++) { const i = k * 3; const vx = (p[i] - pp[i]) * 0.985, vy = (p[i + 1] - pp[i + 1]) * 0.985, vz = (p[i + 2] - pp[i + 2]) * 0.985; pp[i] = p[i]; pp[i + 1] = p[i + 1]; pp[i + 2] = p[i + 2]; p[i] += vx; p[i + 1] += vy - 9.8 * h * h; p[i + 2] += vz; }
      for (let it = 0; it < 4; it++) {
        for (const c of RAG_CONS) { const a = c.a * 3, b = c.b * 3; const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2]; const d = Math.hypot(dx, dy, dz) || 1e-6; const diff = (d - c.d * sc) / d * 0.5; p[a] += dx * diff; p[a + 1] += dy * diff; p[a + 2] += dz * diff; p[b] -= dx * diff; p[b + 1] -= dy * diff; p[b + 2] -= dz * diff; }
        for (const [ia, ib, mn] of RAG_LIMITS) { const a = ia * 3, b = ib * 3; const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2]; const d = Math.hypot(dx, dy, dz) || 1e-6; if (d < mn * sc) { const diff = (d - mn * sc) / d * 0.5; p[a] += dx * diff; p[a + 1] += dy * diff; p[a + 2] += dz * diff; p[b] -= dx * diff; p[b + 1] -= dy * diff; p[b + 2] -= dz * diff; } }
        for (let k = 0; k < RAG_N; k++) { const i = k * 3; const rad = (k === 4 || k === 21) ? 0.11 : 0.07; const gy = groundY(p[i], p[i + 2]) + rad; if (p[i + 1] < gy) { p[i + 1] = gy; pp[i] = p[i] - (p[i] - pp[i]) * 0.55; pp[i + 2] = p[i + 2] - (p[i + 2] - pp[i + 2]) * 0.55; }
          for (const c of W.colliders) { if (c.tag === 'bound' || c.mn[1] > p[i + 1] || c.mx[1] < p[i + 1]) continue; if (p[i] > c.mn[0] - rad && p[i] < c.mx[0] + rad && p[i + 2] > c.mn[2] - rad && p[i + 2] < c.mx[2] + rad) { const px = p[i] < (c.mn[0] + c.mx[0]) / 2 ? c.mn[0] - rad - p[i] : c.mx[0] + rad - p[i], pz = p[i + 2] < (c.mn[2] + c.mx[2]) / 2 ? c.mn[2] - rad - p[i + 2] : c.mx[2] + rad - p[i + 2]; if (Math.abs(px) < Math.abs(pz)) p[i] += px; else p[i + 2] += pz; } } }
      }
    }
    if (r.t > 4) { let e = 0; for (let k = 0; k < RAG_N; k++) { const i = k * 3; e += Math.abs(p[i] - pp[i]) + Math.abs(p[i + 1] - pp[i + 1]) + Math.abs(p[i + 2] - pp[i + 2]); } if (e < 0.002 || r.t > 9) r.settled = true; }
    this.ragdollBones();
  }
  ragdollBones() {
    const p = this.rag.p; const P3 = k => [p[k * 3], p[k * 3 + 1], p[k * 3 + 2]];
    const up = V3.norm([], V3.sub([], P3(2), P3(0))); let side = V3.norm([], V3.sub([], P3(5), P3(9))); const fwd = V3.norm([], V3.cross([], side, up)); side = V3.cross([], up, fwd);
    const m = _scratch.m, m2 = _scratch.m2;
    for (let i = 0; i < NBONES; i++) { const b = BONES[i]; const h = P3(b[4]), t = P3(b[5]); const d = V3.sub([], t, h); const ref = (i === B.Lfoot || i === B.Rfoot) ? up : fwd; basis(m, d, ref); M4.mul(m2, m, RAG_B0T[i]); m2[12] = h[0]; m2[13] = h[1]; m2[14] = h[2];
      if (this.scale !== 1) M4.scale(m2, m2, [this.scale, this.scale, this.scale]); const s = this.bones.subarray(i * 16, i * 16 + 16); M4.translate(s, m2, [-BONE_HEAD[i][0], -BONE_HEAD[i][1], -BONE_HEAD[i][2]]); }
    const c = P3(0); this.pos[0] = c[0]; this.pos[1] = c[1]; this.pos[2] = c[2];
  }
}
/* ---------- Zombie ---------- */
const ZTYPES = [{ speed: 0.85, hp: 100, dmg: 12, scale: 1.0 }, { speed: 1.6, hp: 120, dmg: 14, scale: 1.0 }, { speed: 3.9, hp: 80, dmg: 18, scale: 0.95 }];
class Zombie extends Humanoid {
  constructor(pos, type) {
    const tv = 'zombie' + randi(0, 2); const tint = [rand(0.8, 1.1), rand(0.85, 1.05), rand(0.8, 1.05), 1];
    super(pos, rand(0, TAU), { tex: tv, tint, mesh: Zombies.mesh, scale: ZTYPES[type].scale * rand(0.93, 1.07) });
    this.type = type; const T = ZTYPES[type]; this.hp = T.hp * (1 + G.difficulty * 0.15); this.speed = T.speed * rand(0.85, 1.15); this.dmg = T.dmg; this.state = 'chase'; this.phase = rand(0, TAU); this.attackT = 0; this.cool = 0; this.staggerT = 0;
    this.style = { sway: rand(0.5, 1.5), armRaise: type === 2 ? 0.2 : rand(0, 1), limp: type === 2 ? 0 : rand(0, 1) * (Math.random() < 0.4 ? 1 : 0), headTilt: rand(-0.35, 0.35), stride: rand(0.8, 1.2), hunch: type === 2 ? 0.7 : rand(0.15, 0.6), armAsym: rand(-0.4, 0.4) };
    this.hitV = new Float32Array(6); this.hitX = new Float32Array(6); this.groanT = rand(2, 9); this.navDir = [0, 0]; this.navT = rand(0, 0.3); this.los = false; this.alert = 1; this.deathT = 0; this.decalDone = false; this.corpseT = 0; this.awareness = 0;
  }
  hit(dmg, bone, dir, from, w) {
    if (this.dead) { if (this.rag && !this.rag.settled) { const k = BONES[bone][4]; this.rag.pp[k * 3] -= dir[0] * 0.05; this.rag.pp[k * 3 + 2] -= dir[2] * 0.05; } return; }
    const mult = bone === B.head ? 3.0 : (bone <= 3 ? 1.0 : 0.6); const d = dmg * mult; this.hp -= d; this.awareness = 1;
    const j = bone === B.head ? 3 : bone <= 3 ? 0 : bone <= 10 ? 1 : 2; this.hitV[0] += dir[2] * 6 * (bone === B.head ? 1.5 : 1); this.hitV[1] += -dir[0] * 6; this.hitV[2] += rand(-4, 4); this.hitV[3] += (bone === B.head ? 10 : 2) * sign(rand(-1, 1));
    A.hurtZombie(this.pos);
    if (this.hp <= 0) { this.die(dir, bone, w ? w.kick : 1); }
    else if (d >= 35 && this.type !== 2 || d >= 60) { this.state = 'stagger'; this.staggerT = 0.45; }
  }
  die(dir, bone, strength) {
    P.stats.kills++; if (bone === B.head) P.stats.headshots++; G.onZombieKilled(this);
    this.vel = [Math.sin(this.yaw) * this.speed * 0.5, 0, Math.cos(this.yaw) * this.speed * 0.5];
    this.startRagdoll(dir, bone, strength || 1); A.deathGurgle(this.pos); this.state = 'dead';
  }
  update(dt) {
    if (this.dead) { this.ragdollStep(dt); this.corpseT += dt; if (this.corpseT > 0.4 && !this.decalDone) { this.decalDone = true; FX.decal([this.pos[0], groundY(this.pos[0], this.pos[2]) + 0.01, this.pos[2]], [0, 1, 0], rand(1.2, 2.0), 1); } if (this.corpseT > 14) { const s = Math.min(1, (this.corpseT - 14) / 4); for (let i = 0; i < NBONES; i++) this.bones[i * 16 + 13] -= s * 0.6 * dt * 4; if (this.corpseT > 18) this.remove = true; } return; }
    const pp = P.pos; const dx = pp[0] - this.pos[0], dz = pp[2] - this.pos[2]; const dist = Math.hypot(dx, dz);
    this.groanT -= dt; if (this.groanT <= 0) { this.groanT = rand(3, 10) / (this.type === 2 ? 2 : 1); A.groan(this.pos, this.type === 2 ? 2 : this.type === 0 && Math.random() < 0.3 ? 1 : 0, 0.7); }
    this.navT -= dt; if (this.navT <= 0) { this.navT = 0.25 + Math.random() * 0.1; this.los = dist < 14 && lineOfSightXZ(this.pos[0], this.pos[2], pp[0], pp[2]); const nd = navDir(this.pos[0], this.pos[2], this.navDir); if (!nd) { this.navDir[0] = dx / (dist || 1); this.navDir[1] = dz / (dist || 1); } }
    for (let i = 0; i < 6; i++) { this.hitV[i] += (-this.hitX[i] * 120 - this.hitV[i] * 12) * dt; this.hitX[i] += this.hitV[i] * dt; }
    let move = 0;
    if (this.state === 'stagger') { this.staggerT -= dt; if (this.staggerT <= 0) this.state = 'chase'; }
    else if (this.state === 'attack') { this.attackT += dt; const facing = Math.atan2(dx, dz); this.yaw = damp(this.yaw, this.yaw + Math.atan2(Math.sin(facing - this.yaw), Math.cos(facing - this.yaw)), 10, dt);
      if (this.attackT > 0.42 && !this.attackHit) { this.attackHit = true; if (dist < 1.9 && P.alive) { const dy = P.pos[1] - this.pos[1]; if (Math.abs(dy) < 1.2) P.takeDamage(this.dmg * (1 + G.difficulty * 0.1), this.pos); A.whoosh(0.5); } }
      if (this.attackT > 0.95) { this.state = 'chase'; this.cool = 0.5; } }
    else { this.cool -= dt;
      if (dist < 1.45 && this.cool <= 0 && P.alive) { this.state = 'attack'; this.attackT = 0; this.attackHit = false; A.groan(this.pos, this.type === 2 ? 2 : 0, 0.9); }
      else { let mx, mz; if (this.los || dist < 3) { mx = dx / (dist || 1); mz = dz / (dist || 1); } else { mx = this.navDir[0]; mz = this.navDir[1]; }
        // separation
        for (const o of Zombies.list) { if (o === this || o.dead) continue; const ox = this.pos[0] - o.pos[0], oz = this.pos[2] - o.pos[2]; const d2 = ox * ox + oz * oz; if (d2 < 1.0 && d2 > 1e-4) { const d = Math.sqrt(d2); const f = (1.0 - d) / d * 1.4; mx += ox * f; mz += oz * f; } }
        const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml; const sp = this.speed * (dist < 2.2 ? 0.6 : 1);
        this.vel[0] = damp(this.vel[0], mx * sp, 6, dt); this.vel[2] = damp(this.vel[2], mz * sp, 6, dt);
        const targetYaw = Math.atan2(this.vel[0], this.vel[2]); const dy = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw)); this.yaw += dy * Math.min(1, dt * 6);
        this.pos[0] += this.vel[0] * dt; this.pos[2] += this.vel[2] * dt; const rr = resolveCircle(this.pos[0], this.pos[2], 0.35, this.pos[1]); this.pos[0] = rr[0]; this.pos[2] = rr[1]; move = Math.hypot(this.vel[0], this.vel[2]); } }
    this.pos[1] = groundY(this.pos[0], this.pos[2]);
    this.phase += dt * move * (this.type === 2 ? 3.2 : 3.6) / this.style.stride;
    this.animate(dt, move, dist);
    this.computeModel(); this.computeBones();
  }
  animate(dt, move, dist) {
    const r = this.rot; r.fill(0); const s = this.style; const ph = this.phase; const w = Math.sin(ph), cw = Math.cos(ph); const mv = clamp(move / Math.max(this.speed, 0.05), 0, 1); const run = this.type === 2;
    const t = G.time + this.phase * 0.1; const X = this.hitX;
    const stride = (run ? 0.75 : 0.45) * s.stride * mv; const limp = s.limp;
    r[B.Lthigh * 3] = -w * stride; r[B.Rthigh * 3] = w * stride * (1 - limp * 0.5);
    r[B.Lshin * 3] = (0.15 + Math.max(0, w) * (run ? 1.3 : 0.7)) * mv + 0.1; r[B.Rshin * 3] = (0.15 + Math.max(0, -w) * (run ? 1.3 : 0.7)) * mv * (1 - limp * 0.4) + 0.1 + limp * 0.4;
    r[B.Lfoot * 3] = -0.1 * mv; r[B.Rfoot * 3] = -0.1 * mv;
    const hunch = s.hunch; r[B.spine * 3] = hunch * 0.45 + X[0] * 0.08 + (run ? 0.25 : 0); r[B.spine * 3 + 2] = w * 0.1 * s.sway * mv + X[1] * 0.06 + limp * cw * 0.08 * mv; r[B.spine * 3 + 1] = w * 0.12 * mv + X[2] * 0.03;
    r[B.chest * 3] = hunch * 0.3 + X[0] * 0.06; r[B.chest * 3 + 2] = -w * 0.05 * mv + X[1] * 0.04;
    r[B.neck * 3] = -hunch * 0.5; r[B.head * 3] = -hunch * 0.35 + Math.sin(t * 0.9) * 0.08 + X[3] * 0.05; r[B.head * 3 + 2] = s.headTilt + Math.sin(ph * 0.5) * 0.06 * mv + X[1] * 0.1; r[B.head * 3 + 1] = Math.sin(t * 0.6 + 1) * 0.35 * (1 - mv * 0.5);
    const raise = s.armRaise * (dist < 6 ? 1 : 0.5);
    if (run) { r[B.LupArm * 3] = w * 0.9 - 0.4; r[B.RupArm * 3] = -w * 0.9 - 0.4; r[B.LfArm * 3] = -1.4; r[B.RfArm * 3] = -1.4; r[B.LupArm * 3 + 2] = 0.15; r[B.RupArm * 3 + 2] = -0.15; }
    else { r[B.LupArm * 3] = -0.95 * raise + w * 0.2 * mv * (1 - raise) + Math.sin(t * 1.7) * 0.08; r[B.RupArm * 3] = -0.95 * raise * (1 + s.armAsym) - w * 0.2 * mv * (1 - raise) + Math.sin(t * 1.3) * 0.08;
      r[B.LfArm * 3] = -0.9 * raise - 0.3; r[B.RfArm * 3] = -0.9 * raise * (1 - s.armAsym) - 0.35; r[B.LfArm * 3 + 1] = 0.35 * raise; r[B.RfArm * 3 + 1] = -0.35 * raise; r[B.LupArm * 3 + 2] = 0.12 + Math.sin(t * 0.8) * 0.05; r[B.RupArm * 3 + 2] = -0.12 - Math.sin(t * 0.7) * 0.05; r[B.LupArm * 3 + 1] = 0.2 * raise; r[B.RupArm * 3 + 1] = -0.2 * raise; }
    r[B.Lhand * 3] = -0.3; r[B.Rhand * 3] = -0.3;
    if (this.state === 'attack') { const a = clamp(this.attackT / 0.95, 0, 1); const wind = smoothstep(0, 0.4, a), strike = smoothstep(0.4, 0.55, a) * (1 - smoothstep(0.7, 1, a));
      r[B.LupArm * 3] = -0.6 - wind * 1.4 + strike * 0.8; r[B.RupArm * 3] = -0.6 - wind * 1.4 + strike * 0.8; r[B.LfArm * 3] = -1.0 + strike * 0.9; r[B.RfArm * 3] = -1.0 + strike * 0.9; r[B.LupArm * 3 + 1] = 0.5 * wind; r[B.RupArm * 3 + 1] = -0.5 * wind;
      r[B.chest * 3] += -0.25 * wind + 0.5 * strike; r[B.spine * 3] += 0.35 * strike; r[B.head * 3] += -0.3 * strike; this.rootOff[2] = 0.15 * strike; }
    else this.rootOff[2] = 0;
    if (this.state === 'stagger') { const f = this.staggerT / 0.45; r[B.spine * 3] += -0.5 * f; r[B.chest * 3] += -0.3 * f; r[B.head * 3] += -0.4 * f; r[B.LupArm * 3] += -0.4 * f; r[B.RupArm * 3] += -0.4 * f; }
    this.rootOff[1] = Math.abs(w) * 0.025 * mv - limp * Math.max(0, -cw) * 0.04 * mv - hunch * 0.02; this.rootOff[0] = 0;
  }
}
const Zombies = {
  list: [], mesh: null, corpses: 0,
  init() { this.mesh = buildHumanoid(false); },
  clear() { this.list.length = 0; },
  spawn(pos, type) { const z = new Zombie(pos, type); this.list.push(z); return z; },
  alive() { let n = 0; for (const z of this.list) if (!z.dead) n++; return n; },
  update(dt) {
    for (const z of this.list) z.update(dt);
    let corpses = 0; for (let i = this.list.length - 1; i >= 0; i--) { const z = this.list[i]; if (z.remove) { this.list.splice(i, 1); continue; } if (z.dead) corpses++; }
    if (corpses > 14) { for (const z of this.list) { if (z.dead && z.corpseT < 14) { z.corpseT = 14; corpses--; if (corpses <= 14) break; } } }
  },
  raycast(ro, rd, maxT) { let best = maxT, hit = null; for (const z of this.list) { if (z.dead && z.rag && z.rag.settled) continue; const d = V3.dist(ro, z.pos); if (d - 1.5 > best) continue; for (const [a, b, r, bone] of z.capsules()) { const t = rayCapsule(ro, rd, a, b, r); if (t > 0 && t < best) { best = t; hit = { z, bone, t }; } } } if (hit) hit.p = V3.addScaled([], ro, rd, hit.t); return hit; },
  noise(pos, radius) { for (const z of this.list) if (!z.dead && V3.distXZ(z.pos, pos) < radius) z.awareness = 1; },
  drawables(out) { for (const z of this.list) { if (z.dead && z.corpseT > 18) continue; out.push(z.drawable); } },
};
/* ---------- NPC soldiers ---------- */
class NPC extends Humanoid {
  constructor(pos, yaw, name) { super(pos, yaw, { tex: 'soldier', mesh: NPCs.mesh, wrap: 0.1 }); this.name = name; this.anim = 'idle'; this.animT = 0; this.fireT = 0; this.burst = 0; this.target = null; this.light = true; this.rifleModel = M4.create(); this.talkT = 0; this.gesture = 0; this.lookAt = null; this.aimYaw = yaw; this.walkPhase = 0; this.moveTarget = null; this.hp = 100; this.rifle = { mesh: P.vmMeshes.rifle, mat: P.metalMat }; this.muzzle = [0, 0, 0]; this.fwd = [0, 0, 1];
    this.drawRifle = { mesh: this.rifle.mesh.metal, mat: this.rifle.mat, model: this.rifleModel, bones: NPCs.rifleBones, castShadow: true }; }
  update(dt) {
    this.animT += dt;
    if (this.dead) { this.ragdollStep(dt); this.updateRifle(); return; }
    const r = this.rot; r.fill(0); const t = this.animT;
    // face target / lookAt
    if (this.lookAt) { const dx = this.lookAt[0] - this.pos[0], dz = this.lookAt[2] - this.pos[2]; const ty = Math.atan2(dx, dz); this.yaw += Math.atan2(Math.sin(ty - this.yaw), Math.cos(ty - this.yaw)) * Math.min(1, dt * 5); }
    let move = 0;
    if (this.moveTarget) { const dx = this.moveTarget[0] - this.pos[0], dz = this.moveTarget[2] - this.pos[2]; const d = Math.hypot(dx, dz); if (d > 0.4) { const sp = this.anim === 'run' ? 4.5 : 1.6; const ty = Math.atan2(dx, dz); this.yaw += Math.atan2(Math.sin(ty - this.yaw), Math.cos(ty - this.yaw)) * Math.min(1, dt * 8); this.pos[0] += dx / d * sp * dt; this.pos[2] += dz / d * sp * dt; move = sp; } else { this.moveTarget = null; if (this.anim === 'run' || this.anim === 'walk') this.anim = 'idle'; } }
    this.pos[1] = groundY(this.pos[0], this.pos[2]); this.walkPhase += dt * move * 3.4;
    const w = Math.sin(this.walkPhase); const mv = clamp(move / 4.5, 0, 1); const breath = Math.sin(t * 1.4) * 0.02;
    r[B.spine * 3] = 0.08 + breath + (move > 3 ? 0.3 : 0); r[B.chest * 3] = 0.05 + breath;
    r[B.Lthigh * 3] = -w * 0.7 * mv; r[B.Rthigh * 3] = w * 0.7 * mv; r[B.Lshin * 3] = 0.1 + Math.max(0, w) * 1.1 * mv; r[B.Rshin * 3] = 0.1 + Math.max(0, -w) * 1.1 * mv;
    const aiming = this.anim === 'aim' || this.anim === 'fire' || (this.anim === 'run');
    if (aiming) { r[B.LupArm * 3] = -1.35; r[B.LupArm * 3 + 1] = 0.9; r[B.LfArm * 3] = -0.9; r[B.LfArm * 3 + 1] = 0.6; r[B.RupArm * 3] = -1.25; r[B.RupArm * 3 + 1] = -0.4; r[B.RfArm * 3] = -1.6; r[B.RfArm * 3 + 1] = -0.2; r[B.head * 3] = 0.05; r[B.chest * 3 + 1] = -0.25; }
    else { // rifle low ready
      r[B.LupArm * 3] = -0.55; r[B.LupArm * 3 + 1] = 0.6; r[B.LfArm * 3] = -1.2; r[B.LfArm * 3 + 1] = 0.3; r[B.RupArm * 3] = -0.35; r[B.RupArm * 3 + 1] = -0.2; r[B.RfArm * 3] = -1.3; r[B.RfArm * 3 + 1] = -0.4;
      if (this.anim === 'talk') { this.talkT += dt; const g = Math.sin(this.talkT * 3.1) * Math.sin(this.talkT * 1.3); r[B.RupArm * 3] += -0.5 - g * 0.3; r[B.RfArm * 3] += -0.4 + g * 0.4; r[B.RupArm * 3 + 1] += -0.3; r[B.head * 3] = Math.sin(this.talkT * 2.2) * 0.06 - 0.05; r[B.head * 3 + 1] = Math.sin(this.talkT * 0.9) * 0.15; }
      else { r[B.head * 3 + 1] = Math.sin(t * 0.5) * 0.25; r[B.head * 3] = -0.05; }
    }
    if (this.anim === 'fire' && this.fireT < 0.08) { r[B.chest * 3] -= 0.06; r[B.RupArm * 3] += 0.08; r[B.LupArm * 3] += 0.06; }
    this.rootOff[1] = Math.abs(w) * 0.03 * mv; this.computeModel(); this.computeBones(); this.updateRifle();
    // combat: engage nearest zombie
    if (this.combat) { this.fireT -= dt; let best = null, bd = 30; for (const z of Zombies.list) { if (z.dead) continue; const d = V3.distXZ(z.pos, this.pos); if (d < bd && lineOfSightXZ(this.pos[0], this.pos[2], z.pos[0], z.pos[2])) { bd = d; best = z; } }
      this.target = best; if (best) { this.lookAt = best.pos; this.anim = 'fire'; if (this.fireT <= 0) { this.shoot(best); this.burst++; this.fireT = this.burst % 3 === 0 ? 0.9 + Math.random() * 0.6 : 0.11; } } else if (this.anim === 'fire') { this.anim = 'aim'; this.lookAt = this.watch || null; } }
  }
  updateRifle() {
    // rifle attached to the chest bone: barrel forward (+Z model), lowered when not aiming
    const W_ = _scratch.world; if (this.dead) { this.computeRifleFromRag(); return; }
    const m = this.rifleModel; M4.mul(m, this.model, W_[B.chest]); const aiming = this.anim === 'aim' || this.anim === 'fire' || this.anim === 'run';
    M4.translate(m, m, aiming ? [-0.06, 0.05, 0.28] : [-0.1, -0.12, 0.22]); M4.rotateY(m, m, PI + (aiming ? 0.05 : 0.35)); M4.rotateX(m, m, aiming ? 0.0 : -0.55);
    V3.transformMat4(this.muzzle, m, WEAPONS.rifle.muzzle); V3.norm(this.fwd, V3.transformDir([], m, [0, 0, -1]));
    const lp = V3.transformMat4([], m, WEAPONS.rifle.light); this.lightPos = lp;
  }
  computeRifleFromRag() { const p = this.rag.p; const h = [p[11 * 3], p[11 * 3 + 1], p[11 * 3 + 2]]; const m = this.rifleModel; M4.identity(m); M4.translate(m, m, [h[0], Math.max(0.05, h[1] - 0.05), h[2]]); M4.rotateY(m, m, this.yaw + 1.2); M4.rotateZ(m, m, 1.5); }
  shoot(z) {
    A.gunshot('rifle', this.muzzle); FX.muzzle(this.muzzle, this.fwd); FX.light(this.muzzle, [1, 0.8, 0.5], 12, 0.06);
    if (Math.random() < 0.65) { const tp = z.dead ? z.pos : z.jointWorld(B.chest, false, [0, 0, 0]); const dir = V3.norm([], V3.sub([], tp, this.muzzle)); z.hit(45, Math.random() < 0.15 ? B.head : B.chest, dir, this.muzzle, WEAPONS.rifle); FX.blood(tp, dir, 1); }
    else { const dir = V3.norm([], V3.sub([], [z.pos[0] + rand(-1, 1), 1 + rand(-0.5, 0.5), z.pos[2] + rand(-1, 1)], this.muzzle)); const wh = raycastWorld(this.muzzle, dir, 60); if (wh) FX.impact(wh.p, wh.n, wh.tag); }
  }
  die(dir) { this.dead = true; this.vel = [0, 0, 0]; this.startRagdoll(dir || [0, 0, 1], B.chest, 1.2); this.combat = false; this.light = false; A.groan(this.pos, 1, 0.8); }
  spotLight() { if (!this.light || this.dead) return null; return { pos: this.lightPos || this.muzzle, dir: this.fwd, range: 30, cosOuter: Math.cos(deg(20)), cosInner: Math.cos(deg(8)), color: [1, 0.95, 0.85], intensity: 30 }; }
}
const NPCs = { list: [], mesh: null, rifleBones: null, init() { this.mesh = buildHumanoid(true); this.rifleBones = new Float32Array(5 * 16); for (let i = 0; i < 5; i++) M4.identity(this.rifleBones.subarray(i * 16, i * 16 + 16)); },
  clear() { this.list.length = 0; }, add(pos, yaw, name) { const n = new NPC(pos, yaw, name); this.list.push(n); return n; },
  update(dt) { for (const n of this.list) n.update(dt); }, drawables(out) { for (const n of this.list) { out.push(n.drawable); out.push(n.drawRifle); } },
  spots(out) { for (const n of this.list) { const s = n.spotLight(); if (s) out.push(s); } } };
