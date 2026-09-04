/* ============================================================
   Effects: particles, decals, temporary lights, pickups
   ============================================================ */
class ParticleSystem {
  constructor(max, additive) { this.max = max; this.additive = additive; this.n = 0; this.count = 0; this.data = new Float32Array(max * 16);
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.size = new Float32Array(max); this.grow = new Float32Array(max); this.col = new Float32Array(max * 4); this.rot = new Float32Array(max); this.rotV = new Float32Array(max); this.type = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.stretch = new Float32Array(max); this.lit = new Float32Array(max); this.flags = new Uint8Array(max); this.soft = 0.6; }
  emit(o) {
    let i; if (this.n < this.max) i = this.n++; else i = Math.floor(Math.random() * this.max);
    this.pos.set(o.pos, i * 3); this.vel.set(o.vel || [0, 0, 0], i * 3); this.life[i] = this.maxLife[i] = o.life; this.size[i] = o.size; this.grow[i] = o.grow || 0; this.col.set(o.col, i * 4); this.rot[i] = o.rot || rand(0, TAU); this.rotV[i] = o.rotV || 0; this.type[i] = o.type || 0; this.grav[i] = o.grav || 0; this.drag[i] = o.drag || 0; this.stretch[i] = o.stretch || 0; this.lit[i] = o.unlit ? 1 : 0; this.flags[i] = o.blood ? 1 : 0;
  }
  update(dt) {
    let w = 0; const D = this.data;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt; if (this.life[i] <= 0) continue;
      const i3 = i * 3; this.vel[i3 + 1] -= this.grav[i] * dt; const dr = Math.max(0, 1 - this.drag[i] * dt); this.vel[i3] *= dr; this.vel[i3 + 1] *= dr; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt; this.size[i] += this.grow[i] * dt; this.rot[i] += this.rotV[i] * dt;
      if (this.flags[i] && this.pos[i3 + 1] < groundY(this.pos[i3], this.pos[i3 + 2]) + 0.02) { this.life[i] = 0; if (Math.random() < 0.55) FX.decal([this.pos[i3], groundY(this.pos[i3], this.pos[i3 + 2]) + 0.005, this.pos[i3 + 2]], [0, 1, 0], rand(0.2, 0.55), 0); continue; }
      // compact
      if (w !== i) { this.pos.copyWithin(w * 3, i3, i3 + 3); this.vel.copyWithin(w * 3, i3, i3 + 3); this.life[w] = this.life[i]; this.maxLife[w] = this.maxLife[i]; this.size[w] = this.size[i]; this.grow[w] = this.grow[i]; this.col.copyWithin(w * 4, i * 4, i * 4 + 4); this.rot[w] = this.rot[i]; this.rotV[w] = this.rotV[i]; this.type[w] = this.type[i]; this.grav[w] = this.grav[i]; this.drag[w] = this.drag[i]; this.stretch[w] = this.stretch[i]; this.lit[w] = this.lit[i]; this.flags[w] = this.flags[i]; }
      const age = 1 - this.life[w] / this.maxLife[w]; const a = this.col[w * 4 + 3] * smoothstep(0, 0.08, age) * (1 - smoothstep(0.55, 1, age)); const o = w * 16;
      D[o] = this.pos[w * 3]; D[o + 1] = this.pos[w * 3 + 1]; D[o + 2] = this.pos[w * 3 + 2]; D[o + 3] = Math.max(0.001, this.size[w]); D[o + 4] = this.col[w * 4]; D[o + 5] = this.col[w * 4 + 1]; D[o + 6] = this.col[w * 4 + 2]; D[o + 7] = a;
      D[o + 8] = this.vel[w * 3]; D[o + 9] = this.vel[w * 3 + 1]; D[o + 10] = this.vel[w * 3 + 2]; D[o + 11] = this.rot[w]; D[o + 12] = this.type[w]; D[o + 13] = age; D[o + 14] = this.stretch[w]; D[o + 15] = this.lit[w];
      w++;
    }
    this.n = w; this.count = w;
  }
  clear() { this.n = 0; this.count = 0; }
}
const FX = {
  alpha: null, add: null, lights: [], decals: [], decalMesh: null, decalDirty: false, decalMat: null, emitters: [], time: 0,
  init() { this.alpha = new ParticleSystem(1400, false); this.add = new ParticleSystem(600, true); this.add.soft = 0.25; this.decalMat = mat({ tex: 'decals', alpha: true, tint: [1, 1, 1, 1], rough: 1, metal: 0, normalStr: 0.5 }); },
  clear() { this.alpha.clear(); this.add.clear(); this.lights.length = 0; this.decals.length = 0; this.decalDirty = true; },
  update(dt) {
    this.time += dt; this.alpha.update(dt); this.add.update(dt);
    for (let i = this.lights.length - 1; i >= 0; i--) { const l = this.lights[i]; l.t += dt; if (l.t >= l.dur) this.lights.splice(i, 1); else l.intensity = l.base * (1 - l.t / l.dur); }
    for (const e of this.emitters) e(dt);
    if (this.decalDirty) this.rebuildDecals();
  },
  light(pos, color, intensity, dur, radius) { this.lights.push({ pos: pos.slice(), color, intensity, base: intensity, radius: radius || 10, t: 0, dur }); },
  muzzle(pos, dir) {
    const A_ = this.add; A_.emit({ pos, vel: [0, 0, 0], life: 0.06, size: rand(0.28, 0.4), col: [1, 0.85, 0.55, 1], type: 0, unlit: 1 }); A_.emit({ pos, vel: [0, 0, 0], life: 0.05, size: 0.16, col: [1, 1, 0.9, 1], type: 0, unlit: 1 });
    for (let i = 0; i < 4; i++) { const v = [dir[0] * rand(6, 14) + rand(-3, 3), dir[1] * rand(6, 14) + rand(-3, 3), dir[2] * rand(6, 14) + rand(-3, 3)]; A_.emit({ pos, vel: v, life: rand(0.05, 0.12), size: rand(0.01, 0.02), col: [1, 0.7, 0.3, 1], type: 3, stretch: 4, unlit: 1, grav: 5 }); }
    this.alpha.emit({ pos: V3.addScaled([], pos, dir, 0.1), vel: [dir[0] * 1.5 + rand(-0.3, 0.3), 0.5 + rand(0, 0.3), dir[2] * 1.5 + rand(-0.3, 0.3)], life: rand(0.6, 1.0), size: 0.12, grow: 0.7, col: [0.45, 0.45, 0.45, 0.35], type: 1, rotV: rand(-2, 2), drag: 2 });
    this.light(pos, [1, 0.75, 0.45], 30, 0.07, 12);
  },
  shell(pos, right, up) { const v = [right[0] * rand(1.5, 2.5) + up[0] * 1.5 + rand(-0.3, 0.3), right[1] * 2 + up[1] * 1.5, right[2] * rand(1.5, 2.5) + up[2] * 1.5 + rand(-0.3, 0.3)]; this.alpha.emit({ pos, vel: v, life: 1.2, size: 0.014, col: [0.9, 0.7, 0.3, 1], type: 0, grav: 9.8, rotV: rand(-20, 20) }); },
  blood(pos, dir, big) {
    const n = big === 2 ? 26 : 14; const A_ = this.alpha;
    for (let i = 0; i < n; i++) { const sp = rand(1, big === 2 ? 5 : 3.5); const v = [dir[0] * sp + rand(-1.5, 1.5), rand(0.5, 2.5) + dir[1] * sp, dir[2] * sp + rand(-1.5, 1.5)]; A_.emit({ pos: [pos[0] + rand(-0.05, 0.05), pos[1] + rand(-0.05, 0.05), pos[2] + rand(-0.05, 0.05)], vel: v, life: rand(0.5, 1.3), size: rand(0.02, 0.06), col: [0.18, 0.01, 0.005, 0.95], type: 2, grav: 9.8, drag: 0.5, blood: 1, rotV: rand(-5, 5) }); }
    A_.emit({ pos, vel: [dir[0] * 0.8, 0.3, dir[2] * 0.8], life: 0.4, size: big === 2 ? 0.35 : 0.22, grow: 0.9, col: [0.25, 0.02, 0.01, 0.55], type: 1, drag: 3 });
    if (big === 2) for (let i = 0; i < 6; i++) A_.emit({ pos, vel: [rand(-2, 2), rand(1, 3), rand(-2, 2)], life: rand(0.6, 1.2), size: rand(0.04, 0.09), col: [0.2, 0.02, 0.01, 1], type: 2, grav: 9.8, blood: 1 });
  },
  impact(p, n, tag) {
    const metal = tag === 'car' || tag === 'humvee' || tag === 'dumpster' || tag === 'pole' || tag === 'generator' || tag === 'bus' || tag === 'fence' || tag === 'flood';
    const A_ = this.alpha; const col = metal ? [0.5, 0.5, 0.5, 0.3] : tag === 'ground' ? [0.45, 0.42, 0.38, 0.5] : [0.55, 0.5, 0.45, 0.5];
    for (let i = 0; i < 3; i++) A_.emit({ pos: p, vel: [n[0] * rand(0.5, 1.5) + rand(-0.6, 0.6), n[1] * rand(0.5, 1.5) + rand(0.2, 0.8), n[2] * rand(0.5, 1.5) + rand(-0.6, 0.6)], life: rand(0.5, 0.9), size: rand(0.08, 0.16), grow: 0.6, col, type: 1, drag: 2.5, rotV: rand(-2, 2) });
    for (let i = 0; i < (metal ? 8 : 3); i++) { const v = [n[0] * rand(2, 5) + rand(-2.5, 2.5), n[1] * rand(2, 5) + rand(-1, 3), n[2] * rand(2, 5) + rand(-2.5, 2.5)]; this.add.emit({ pos: p, vel: v, life: rand(0.15, 0.4), size: rand(0.006, 0.014), col: [1, 0.75, 0.4, 1], type: 3, stretch: 3, unlit: 1, grav: 9.8 }); }
    if (metal) this.light(p, [1, 0.8, 0.5], 4, 0.05, 3);
    A.impact(metal ? 'metal' : 'concrete', p);
    if (tag !== 'tree' && tag !== 'glass' && tag !== 'fence') this.decal(V3.addScaled([], p, n, 0.004), n, rand(0.1, 0.16), 2);
  },
  decal(pos, n, size, type) {
    if (this.decals.length >= 160) this.decals.shift(); this.decals.push({ pos, n, size, type, rot: rand(0, TAU) }); this.decalDirty = true;
  },
  rebuildDecals() {
    this.decalDirty = false; if (this.decalMesh) { gl.deleteVertexArray(this.decalMesh.vao); gl.deleteBuffer(this.decalMesh.vb); gl.deleteBuffer(this.decalMesh.ib); this.decalMesh = null; }
    if (!this.decals.length) return; const mb = new MB();
    for (const d of this.decals) { const n = d.n; const ref = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]; let u = V3.norm([], V3.cross([], ref, n)), v = V3.cross([], n, u); const c = Math.cos(d.rot), s = Math.sin(d.rot); const uu = [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s], vv = [-u[0] * s + v[0] * c, -u[1] * s + v[1] * c, -u[2] * s + v[2] * c]; const h = d.size / 2;
      const cx = d.type % 2, cy = 1 - Math.floor(d.type / 2); const uv = [[cx / 2, cy / 2], [(cx + 1) / 2, cy / 2], [(cx + 1) / 2, (cy + 1) / 2], [cx / 2, (cy + 1) / 2]];
      const p0 = [d.pos[0] - uu[0] * h - vv[0] * h, d.pos[1] - uu[1] * h - vv[1] * h, d.pos[2] - uu[2] * h - vv[2] * h], p1 = [d.pos[0] + uu[0] * h - vv[0] * h, d.pos[1] + uu[1] * h - vv[1] * h, d.pos[2] + uu[2] * h - vv[2] * h], p2 = [d.pos[0] + uu[0] * h + vv[0] * h, d.pos[1] + uu[1] * h + vv[1] * h, d.pos[2] + uu[2] * h + vv[2] * h], p3 = [d.pos[0] - uu[0] * h + vv[0] * h, d.pos[1] - uu[1] * h + vv[1] * h, d.pos[2] - uu[2] * h + vv[2] * h];
      const a = mb.vert(p0, n, uv[0]), b = mb.vert(p1, n, uv[1]), cc = mb.vert(p2, n, uv[2]), dd = mb.vert(p3, n, uv[3]); if (V3.dot(V3.cross([], V3.sub([], p1, p0), V3.sub([], p3, p0)), n) > 0) mb.quad(a, b, cc, dd); else mb.quad(a, dd, cc, b); }
    this.decalMesh = mb.build(); this.decalDrawable = { mesh: this.decalMesh, mat: this.decalMat, model: M4.create(), twoSided: true };
  },
  decalDrawables() { return this.decalMesh ? [this.decalDrawable] : []; },
  // persistent fire at a position
  addFire(pos, scale = 1) { let acc = 0; this.emitters.push(dt => { if (V3.dist(pos, R.camPos) > 70) return; acc += dt * 28 * scale; while (acc > 1) { acc--; const p = [pos[0] + rand(-0.7, 0.7) * scale, pos[1] + rand(0, 0.3), pos[2] + rand(-0.9, 0.9) * scale]; this.add.emit({ pos: p, vel: [rand(-0.3, 0.3), rand(1.2, 2.4), rand(-0.3, 0.3)], life: rand(0.4, 0.9), size: rand(0.25, 0.5) * scale, grow: -0.25, col: [1, rand(0.3, 0.55), 0.08, 0.85], type: 1, unlit: 1, rotV: rand(-3, 3), drag: 1 }); if (Math.random() < 0.35) this.alpha.emit({ pos: [p[0], p[1] + 0.6, p[2]], vel: [rand(-0.3, 0.3) + 0.8, rand(1, 1.8), rand(-0.3, 0.3) + 0.3], life: rand(2.5, 4.5), size: rand(0.4, 0.7) * scale, grow: 0.9, col: [0.06, 0.06, 0.06, 0.55], type: 1, rotV: rand(-1, 1), drag: 0.6 }); if (Math.random() < 0.15) this.add.emit({ pos: p, vel: [rand(-1, 1), rand(2, 4), rand(-1, 1)], life: rand(0.8, 1.6), size: 0.012, col: [1, 0.6, 0.2, 1], type: 0, unlit: 1, grav: 1, drag: 0.5 }); } }); },
  dustBurst(center, radius, n) { for (let i = 0; i < n; i++) { const a = rand(0, TAU), d = rand(0, radius); const p = [center[0] + Math.cos(a) * d, center[1] + 0.2, center[2] + Math.sin(a) * d]; this.alpha.emit({ pos: p, vel: [Math.cos(a) * rand(2, 5), rand(0.5, 1.5), Math.sin(a) * rand(2, 5)], life: rand(1.5, 3), size: rand(0.6, 1.2), grow: 1.2, col: [0.4, 0.38, 0.35, 0.35], type: 1, drag: 1.2, rotV: rand(-1, 1) }); } },
  systems() { return [this.alpha, this.add]; },
};
/* ---------- pickups ---------- */
const Pickups = {
  update(dt) { for (const p of W.pickups) { if (p.taken) { p.respawn -= dt; if (p.respawn <= 0) p.taken = false; continue; } if (!P.alive) continue; if (V3.distXZ(p.pos, P.pos) < 1.15 && Math.abs(P.pos[1] - p.pos[1]) < 1.5) { let ok = false; if (p.kind === 'ammo') ok = P.ammoPickup(); else if (P.hp < 100) { P.hp = Math.min(100, P.hp + 50); ok = true; } if (ok) { p.taken = true; p.respawn = 150; A.pickup(); G.msg(p.kind === 'ammo' ? 'AMMUNITION' : 'MEDKIT +50', p.kind === 'ammo' ? 'reserve replenished' : 'wounds dressed', 1.6); } } } },
  drawables(out) { for (const p of W.pickups) { if (p.taken) continue; out.push(p); out.push(p.extra); } },
};
