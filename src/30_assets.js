/* ============================================================
   Procedural textures
   ============================================================ */
const TEX = {};
const TEX_DEFS = [
  ['asphalt', 0, 1], ['road', 1, 1], ['concrete', 2, 1], ['brickFacade', 3, 1], ['plasterFacade', 4, 1], ['metal', 5, 1], ['rust', 6, 1], ['wood', 7, 1], ['fabric', 8, 1],
  ['zombie0', 9, 0, 1.0], ['zombie1', 9, 0, 2.0], ['zombie2', 9, 0, 3.0], ['soldier', 10, 0, 4.0],
  ['decals', 11, 0], ['sprites', 12, 0], ['lensdirt', 13, 0], ['chain', 14, 1], ['blank', 15, 1], ['roof', 16, 1], ['tiles', 17, 1], ['brick', 18, 1], ['plaster', 19, 1],
];
function texSizeFor(name, mat) {
  if (mat === 12) return 256; if (mat === 11) return 512; if (mat === 13) return 512; if (mat === 15) return 8; if (mat === 14) return 256;
  if (mat === 9 || mat === 10) return Math.max(S.tex, 1024);
  return S.tex;
}
function generateTexture(def) {
  const [name, mat, tile, seed] = def; const size = texSizeFor(name, mat);
  const prog = makeProgram('tex_' + name, VS_FS, FS_TEXGEN, '#define MAT ' + mat + '\n#define TEXSIZE ' + size);
  const wrap = tile ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  const alb = createTex(size, size, { ifmt: gl.SRGB8_ALPHA8, wrap });
  const nrm = createTex(size, size, { ifmt: gl.RGBA8, wrap });
  const fbo = createFBO(size, size, [alb, nrm], null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb); gl.viewport(0, 0, size, size); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  useProg(prog); gl.uniform1f(prog.u.uSeed, seed || 0);
  drawFullscreen();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  for (const t of [alb, nrm]) {
    gl.bindTexture(gl.TEXTURE_2D, t); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    if (EXT.aniso) gl.texParameterf(gl.TEXTURE_2D, EXT.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(EXT.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  }
  gl.deleteFramebuffer(fbo.fb); gl.deleteProgram(prog.p);
  if (TEX[name]) { gl.deleteTexture(TEX[name].alb); gl.deleteTexture(TEX[name].nrm); }
  TEX[name] = { alb, nrm };
}

/* ============================================================
   Mesh builder (pos3 nrm3 uv2 tan4 bone4)
   ============================================================ */
class MB {
  constructor() { this.v = []; this.i = []; this.n = 0; }
  vert(p, n, uv, b0 = 0, b1 = 0, w0 = 1, w1 = 0) { this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1], 0, 0, 0, 1, b0, b1, w0, w1); return this.n++; }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  // rotation helpers (Euler XYZ applied as Rz*Ry*Rx? we use yaw(Y) then pitch(X) then roll(Z))
  static rotMat(rx = 0, ry = 0, rz = 0) {
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    // R = Ry * Rx * Rz
    return [cy * cz + sy * sx * sz, cx * sz, -sy * cz + cy * sx * sz, -cy * sz + sy * sx * cz, cx * cz, sy * sz + cy * sx * cz, sy * cx, -sx, cy * cx];
  }
  static xf(m, p, c) { return [m[0] * p[0] + m[3] * p[1] + m[6] * p[2] + c[0], m[1] * p[0] + m[4] * p[1] + m[7] * p[2] + c[1], m[2] * p[0] + m[5] * p[1] + m[8] * p[2] + c[2]]; }
  static xfn(m, p) { return [m[0] * p[0] + m[3] * p[1] + m[6] * p[2], m[1] * p[0] + m[4] * p[1] + m[7] * p[2], m[2] * p[0] + m[5] * p[1] + m[8] * p[2]]; }
  // axis-aligned box in local space, rotated by (rx,ry,rz) then translated to c. uv: metres-per-tile scale (u,v), offsets
  box(c, s, o = {}) {
    const hx = s[0] / 2, hy = s[1] / 2, hz = s[2] / 2; const m = MB.rotMat(o.rx || 0, o.ry || 0, o.rz || 0);
    const us = o.uvScale || [1, 1]; const uo = o.uvOff || [0, 0]; const bone = o.bone || 0; const region = o.region;
    const faces = [
      { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
      { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
      { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] }];
    const worldUV = o.worldUV; // if set, uv computed from final world position on the face plane
    for (const f of faces) {
      if (o.skip && o.skip.some(k => k[0] === f.n[0] && k[1] === f.n[1] && k[2] === f.n[2])) continue;
      const cn = [f.n[0] * hx, f.n[1] * hy, f.n[2] * hz]; const ext = [Math.abs(f.u[0]) * hx + Math.abs(f.u[1]) * hy + Math.abs(f.u[2]) * hz, Math.abs(f.v[0]) * hx + Math.abs(f.v[1]) * hy + Math.abs(f.v[2]) * hz];
      const ids = [];
      for (let k = 0; k < 4; k++) {
        const su = (k === 1 || k === 2) ? 1 : -1, sv = (k >= 2) ? 1 : -1;
        const lp = [cn[0] + f.u[0] * ext[0] * su + f.v[0] * ext[1] * sv, cn[1] + f.u[1] * ext[0] * su + f.v[1] * ext[1] * sv, cn[2] + f.u[2] * ext[0] * su + f.v[2] * ext[1] * sv];
        const wp = MB.xf(m, lp, c); const wn = MB.xfn(m, f.n);
        let uv;
        if (worldUV) uv = [(wp[0] * f.u[0] + wp[1] * f.u[1] + wp[2] * f.u[2] + uo[0]) / us[0], (wp[0] * f.v[0] + wp[1] * f.v[1] + wp[2] * f.v[2] + uo[1]) / us[1]];
        else uv = [(lp[0] * f.u[0] + lp[1] * f.u[1] + lp[2] * f.u[2] + uo[0]) / us[0], (lp[0] * f.v[0] + lp[1] * f.v[1] + lp[2] * f.v[2] + uo[1]) / us[1]];
        if (region !== undefined) uv = MB.regionUV(region, (su + 1) / 2, (sv + 1) / 2);
        ids.push(this.vert(wp, wn, uv, bone));
      }
      this.quad(ids[0], ids[1], ids[2], ids[3]);
    }
  }
  static regionUV(region, u, v) { const col = region % 4, row = 3 - Math.floor(region / 4); return [(col + u) / 4, (row + v) / 4]; }
  // tube between a and b; radii arrays per ring [[ru,rv],...] interpolated; o: {segs, rings, bone, parentBone, region, uvScale, caps, blend}
  tube(a, b, ra, rb, o = {}) {
    const segs = o.segs || 12, rings = o.rings || 2; const d = V3.norm([], V3.sub([], b, a)); const len = V3.dist(a, b);
    const ref = Math.abs(d[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
    const u = V3.norm([], V3.cross([], ref, d)); const v = V3.cross([], d, u);
    const bone = o.bone || 0, pb = o.parentBone === undefined ? bone : o.parentBone; const blend = o.blend === undefined ? 0 : o.blend;
    const ringIds = [];
    for (let r = 0; r < rings; r++) {
      const t = r / (rings - 1); const rad = o.radiusFn ? o.radiusFn(t) : [lerp(ra[0], rb[0], t), lerp(ra[1], rb[1], t)];
      const c = V3.lerp([], a, b, t); const ids = [];
      let w = 1, wb = 0; if (blend > 0 && t < blend) { w = 0.5 + 0.5 * smoothstep(0, blend, t); wb = 1 - w; }
      for (let s = 0; s <= segs; s++) {
        const th = s / segs * TAU; const cs = Math.cos(th), sn = Math.sin(th);
        const p = [c[0] + u[0] * cs * rad[0] + v[0] * sn * rad[1], c[1] + u[1] * cs * rad[0] + v[1] * sn * rad[1], c[2] + u[2] * cs * rad[0] + v[2] * sn * rad[1]];
        const n = V3.norm([], [u[0] * cs / rad[0] + v[0] * sn / rad[1], u[1] * cs / rad[0] + v[1] * sn / rad[1], u[2] * cs / rad[0] + v[2] * sn / rad[1]]);
        let uv = o.region !== undefined ? MB.regionUV(o.region, (s / segs + 0.25) % 1.0000001, t) : [s / segs * (o.uvRepeat || 1), len * t / (o.uvScale || 1)];
        if (o.region !== undefined) uv = MB.regionUV(o.region, s / segs, t);
        ids.push(this.vert(p, n, uv, bone, pb, w, wb));
      }
      ringIds.push(ids);
    }
    for (let r = 0; r < rings - 1; r++) for (let s = 0; s < segs; s++) this.quad(ringIds[r][s], ringIds[r + 1][s], ringIds[r + 1][s + 1], ringIds[r][s + 1]);
    if (o.caps) { for (const [c, dir, rad] of [[a, V3.scale([], d, -1), ra], [b, d, rb]]) { const ci = this.vert(c, dir, [0.5, 0.5], bone); const ids = []; for (let s = 0; s <= segs; s++) { const th = s / segs * TAU, cs = Math.cos(th), sn = Math.sin(th); ids.push(this.vert([c[0] + u[0] * cs * rad[0] + v[0] * sn * rad[1], c[1] + u[1] * cs * rad[0] + v[1] * sn * rad[1], c[2] + u[2] * cs * rad[0] + v[2] * sn * rad[1]], dir, [0.5 + cs * 0.5, 0.5 + sn * 0.5], bone)); } for (let s = 0; s < segs; s++) { if (dir === d) this.tri(ci, ids[s], ids[s + 1]); else this.tri(ci, ids[s + 1], ids[s]); } } }
    return ringIds;
  }
  // ellipsoid: c center, r radii, o: {segs, rings, bone, region, rot(rx,ry,rz)}
  ellipsoid(c, r, o = {}) {
    const segs = o.segs || 12, rings = o.rings || 8; const m = MB.rotMat(o.rx || 0, o.ry || 0, o.rz || 0); const bone = o.bone || 0; const grid = [];
    for (let j = 0; j <= rings; j++) {
      const phi = (j / rings) * PI - PI / 2; const cp = Math.cos(phi), sp = Math.sin(phi); const row = [];
      for (let i = 0; i <= segs; i++) {
        const th = (i / segs) * TAU; const lp = [r[0] * cp * Math.sin(th), r[1] * sp, r[2] * cp * Math.cos(th)];
        const ln = V3.norm([], [lp[0] / (r[0] * r[0]), lp[1] / (r[1] * r[1]), lp[2] / (r[2] * r[2])]);
        const uv = o.region !== undefined ? MB.regionUV(o.region, i / segs, j / rings) : [i / segs, j / rings];
        row.push(this.vert(MB.xf(m, lp, c), MB.xfn(m, ln), uv, bone));
      }
      grid.push(row);
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) this.quad(grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]);
  }
  // flat quad given 4 corners (ccw), normal computed; uv from scale
  plane(p0, p1, p2, p3, o = {}) {
    const n = V3.norm([], V3.cross([], V3.sub([], p1, p0), V3.sub([], p3, p0))); const us = o.uvScale || [1, 1]; const bone = o.bone || 0;
    const uvs = o.uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    const w = V3.dist(p0, p1), h = V3.dist(p0, p3);
    const a = this.vert(p0, n, o.uvs ? uvs[0] : [0, 0], bone), b = this.vert(p1, n, o.uvs ? uvs[1] : [w / us[0], 0], bone), c = this.vert(p2, n, o.uvs ? uvs[2] : [w / us[0], h / us[1]], bone), d = this.vert(p3, n, o.uvs ? uvs[3] : [0, h / us[1]], bone);
    this.quad(a, b, c, d);
  }
  // compute tangents, return GPU mesh
  build(dynamic) {
    const V = this.v, nv = this.n; const tan = new Float32Array(nv * 3), bit = new Float32Array(nv * 3);
    for (let t = 0; t < this.i.length; t += 3) {
      const i0 = this.i[t], i1 = this.i[t + 1], i2 = this.i[t + 2]; const o0 = i0 * 16, o1 = i1 * 16, o2 = i2 * 16;
      const e1x = V[o1] - V[o0], e1y = V[o1 + 1] - V[o0 + 1], e1z = V[o1 + 2] - V[o0 + 2], e2x = V[o2] - V[o0], e2y = V[o2 + 1] - V[o0 + 1], e2z = V[o2 + 2] - V[o0 + 2];
      const du1 = V[o1 + 6] - V[o0 + 6], dv1 = V[o1 + 7] - V[o0 + 7], du2 = V[o2 + 6] - V[o0 + 6], dv2 = V[o2 + 7] - V[o0 + 7];
      let r = du1 * dv2 - du2 * dv1; r = Math.abs(r) < 1e-12 ? 0 : 1 / r;
      const tx = (e1x * dv2 - e2x * dv1) * r, ty = (e1y * dv2 - e2y * dv1) * r, tz = (e1z * dv2 - e2z * dv1) * r;
      const bx = (e2x * du1 - e1x * du2) * r, by = (e2y * du1 - e1y * du2) * r, bz = (e2z * du1 - e1z * du2) * r;
      for (const i of [i0, i1, i2]) { tan[i * 3] += tx; tan[i * 3 + 1] += ty; tan[i * 3 + 2] += tz; bit[i * 3] += bx; bit[i * 3 + 1] += by; bit[i * 3 + 2] += bz; }
    }
    for (let i = 0; i < nv; i++) {
      const o = i * 16; const nx = V[o + 3], ny = V[o + 4], nz = V[o + 5]; let tx = tan[i * 3], ty = tan[i * 3 + 1], tz = tan[i * 3 + 2];
      const d = nx * tx + ny * ty + nz * tz; tx -= nx * d; ty -= ny * d; tz -= nz * d; let l = Math.hypot(tx, ty, tz);
      if (l < 1e-8) { // fallback: any perpendicular
        if (Math.abs(nx) < 0.9) { tx = 0; ty = -nz; tz = ny; } else { tx = nz; ty = 0; tz = -nx; } l = Math.hypot(tx, ty, tz) || 1;
      }
      tx /= l; ty /= l; tz /= l;
      const cx = ny * tz - nz * ty, cy = nz * tx - nx * tz, cz = nx * ty - ny * tx; const w = (cx * bit[i * 3] + cy * bit[i * 3 + 1] + cz * bit[i * 3 + 2]) < 0 ? -1 : 1;
      V[o + 8] = tx; V[o + 9] = ty; V[o + 10] = tz; V[o + 11] = w;
    }
    const idx = nv > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i);
    return createMesh(new Float32Array(V), idx, dynamic);
  }
}

/* ============================================================
   Humanoid skeleton + skinned mesh
   ============================================================ */
// bones: [name, parent, head, tail, ragdoll head point index, tail point index]
const BONES = [
  ['pelvis', -1, [0, 0.98, 0], [0, 1.08, 0], 0, 1], ['spine', 0, [0, 1.08, 0], [0, 1.30, 0], 1, 2], ['chest', 1, [0, 1.30, 0], [0, 1.50, 0], 2, 3], ['neck', 2, [0, 1.50, 0], [0, 1.56, 0], 3, 21], ['head', 3, [0, 1.56, 0], [0, 1.78, 0], 21, 4],
  ['LupArm', 2, [0.20, 1.47, 0], [0.24, 1.19, 0], 5, 6], ['LfArm', 5, [0.24, 1.19, 0], [0.26, 0.93, 0], 6, 7], ['Lhand', 6, [0.26, 0.93, 0], [0.27, 0.76, 0], 7, 8],
  ['RupArm', 2, [-0.20, 1.47, 0], [-0.24, 1.19, 0], 9, 10], ['RfArm', 8, [-0.24, 1.19, 0], [-0.26, 0.93, 0], 10, 11], ['Rhand', 9, [-0.26, 0.93, 0], [-0.27, 0.76, 0], 11, 12],
  ['Lthigh', 0, [0.10, 0.96, 0], [0.11, 0.52, 0], 13, 14], ['Lshin', 11, [0.11, 0.52, 0], [0.11, 0.09, 0], 14, 15], ['Lfoot', 12, [0.11, 0.09, 0], [0.11, 0.02, 0.18], 15, 16],
  ['Rthigh', 0, [-0.10, 0.96, 0], [-0.11, 0.52, 0], 17, 18], ['Rshin', 14, [-0.11, 0.52, 0], [-0.11, 0.09, 0], 18, 19], ['Rfoot', 15, [-0.11, 0.09, 0], [-0.11, 0.02, 0.18], 19, 20],
];
const NBONES = BONES.length;
const B = {}; BONES.forEach((b, i) => B[b[0]] = i);
// ragdoll rest points (22)
const RAG_REST = []; BONES.forEach(b => { RAG_REST[b[4]] = b[2]; RAG_REST[b[5]] = b[3]; });
const RAG_N = 22;
function buildHumanoid(soldier) {
  const mb = new MB(); const seg = 12;
  const T = (bone, ra, rb, region, o = {}) => { const b = BONES[bone]; const a = b[2].slice(), t = b[3].slice(); if (o.ext) { V3.addScaled(t, t, V3.norm([], V3.sub([], t, a)), o.ext); } if (o.pre) { V3.addScaled(a, a, V3.norm([], V3.sub([], a, t)), o.pre); } mb.tube(a, t, ra, rb, { segs: seg, rings: o.rings || 3, bone, parentBone: b[1] < 0 ? bone : b[1], region, blend: o.blend === undefined ? 0.35 : o.blend, radiusFn: o.radiusFn }); };
  const vest = soldier ? 0.02 : 0;
  // torso
  T(B.pelvis, [0.17, 0.12], [0.165, 0.115], 3, { blend: 0, pre: 0.02 });
  T(B.spine, [0.165, 0.115 + vest], [0.19, 0.125 + vest], 2, { blend: 0.4 });
  T(B.chest, [0.19, 0.125 + vest], [0.13, 0.10], 1, { blend: 0.3, ext: 0.02 });
  T(B.neck, [0.055, 0.055], [0.06, 0.06], 10, { blend: 0.5, pre: 0.04, ext: 0.04 });
  mb.ellipsoid([0, 0.98 - 0.005, 0.0], [0.17, 0.07, 0.12], { segs: seg, rings: 6, bone: B.pelvis, region: 3 });
  mb.ellipsoid([0, 1.56 + 0.105, 0.01], [0.085, 0.115, 0.095], { segs: 16, rings: 10, bone: B.head, region: 0 });
  if (soldier) mb.ellipsoid([0, 1.56 + 0.135, 0.0], [0.105, 0.105, 0.115], { segs: 14, rings: 6, bone: B.head, region: 11 });
  // shoulders
  mb.ellipsoid([0.2, 1.47, 0], [0.075, 0.07, 0.07], { segs: 10, rings: 6, bone: B.chest, region: 10 });
  mb.ellipsoid([-0.2, 1.47, 0], [0.075, 0.07, 0.07], { segs: 10, rings: 6, bone: B.chest, region: 10 });
  for (const side of ['L', 'R']) {
    T(B[side + 'upArm'], [0.055, 0.055], [0.045, 0.045], 4, { pre: 0.02, ext: 0.02, blend: 0.3 });
    T(B[side + 'fArm'], [0.047, 0.045], [0.036, 0.03], 5, { ext: 0.015, radiusFn: t => [lerp(0.05, 0.035, t) * (1 + 0.15 * Math.sin(t * PI)), lerp(0.046, 0.03, t) * (1 + 0.1 * Math.sin(t * PI))] });
    T(B[side + 'hand'], [0.04, 0.02], [0.035, 0.012], 6, { rings: 3, ext: 0.0 });
    T(B[side + 'thigh'], [0.085, 0.085], [0.065, 0.065], 7, { pre: 0.03, ext: 0.03, blend: 0.3, radiusFn: t => [lerp(0.09, 0.062, t), lerp(0.095, 0.066, t)] });
    T(B[side + 'shin'], [0.06, 0.06], [0.045, 0.05], 8, { ext: 0.02, radiusFn: t => [lerp(0.06, 0.045, t) * (1 + 0.12 * Math.sin(t * PI)), lerp(0.065, 0.05, t) * (1 + 0.25 * Math.sin(Math.min(1, t * 1.6) * PI))] });
    T(B[side + 'foot'], [0.05, 0.035], [0.045, 0.02], 9, { rings: 3, pre: 0.05, ext: 0.02, blend: 0.2 });
  }
  return mb.build();
}
// rest-pose inverse for each bone is just -head translation
const BONE_HEAD = BONES.map(b => b[2]);
const BONE_OFF = BONES.map((b, i) => b[1] < 0 ? b[2].slice() : V3.sub([], b[2], BONES[b[1]][2]));

/* ============================================================
   Weapons (viewmodel geometry). Bones: 0 body, 1 magazine, 2 left hand, 3 right hand, 4 slide/pump/charging handle
   ============================================================ */
const WEAPONS = {
  pistol: { name: 'P9 SIDEARM', mag: 15, reserve: 90, maxReserve: 150, dmg: 34, rpm: 380, auto: false, pellets: 1, spread: 0.012, adsSpread: 0.004, recoil: [0.035, 2.2, 0.6], reload: 1.7, ads: [0, -0.052, -0.30], hip: [0.10, -0.085, -0.33], muzzle: [0, 0.02, -0.17], light: [0, -0.02, -0.11], sound: 'pistol', kick: 0.6, range: 90, adsFov: 0.8, swayScale: 1.0 },
  rifle: { name: 'M4A1 CARBINE', mag: 30, reserve: 120, maxReserve: 240, dmg: 30, rpm: 720, auto: true, pellets: 1, spread: 0.02, adsSpread: 0.005, recoil: [0.03, 1.4, 0.5], reload: 2.4, ads: [0, -0.087, -0.34], hip: [0.13, -0.13, -0.40], muzzle: [0, 0.012, -0.66], light: [0, -0.037, -0.40], sound: 'rifle', kick: 0.8, range: 140, adsFov: 0.72, swayScale: 1.2 },
  shotgun: { name: 'S12 PUMP', mag: 8, reserve: 24, maxReverse: 48, maxReserve: 48, dmg: 16, rpm: 70, auto: false, pellets: 9, spread: 0.055, adsSpread: 0.045, recoil: [0.09, 5.0, 1.5], reload: 0.75, shellByShell: true, ads: [0, -0.070, -0.36], hip: [0.12, -0.105, -0.40], muzzle: [0, 0.02, -0.73], light: [0, -0.042, -0.50], sound: 'shotgun', kick: 1.6, range: 45, adsFov: 0.8, swayScale: 1.4, pump: true },
};
function buildWeaponMesh(type) {
  const metal = new MB(), arms = new MB(), wood = new MB(), dot = new MB(), lens = new MB();
  const M = (c, s, o) => metal.box(c, s, Object.assign({ uvScale: [0.3, 0.3] }, o));
  const cyl = (mb, a, b, r, o) => mb.tube(a, b, [r, r], [r, r], Object.assign({ segs: 10, rings: 2, caps: true, uvScale: 0.3 }, o));
  const hand = (c, bone, sc = 1) => arms.ellipsoid(c, [0.038 * sc, 0.028 * sc, 0.05 * sc], { segs: 10, rings: 6, bone, region: 6 });
  const forearm = (a, b, bone) => arms.tube(a, b, [0.035, 0.035], [0.05, 0.05], { segs: 10, rings: 3, bone, region: 5 });
  const uparm = (a, b, bone) => arms.tube(a, b, [0.05, 0.05], [0.06, 0.06], { segs: 10, rings: 2, bone, region: 4 });
  if (type === 'rifle') {
    M([0, 0, -0.10], [0.045, 0.085, 0.24]); M([0, 0.012, -0.33], [0.042, 0.055, 0.22]); M([0, 0.052, -0.36], [0.02, 0.012, 0.16]);
    cyl(metal, [0, 0.012, -0.44], [0, 0.012, -0.60], 0.010); cyl(metal, [0, 0.012, -0.60], [0, 0.012, -0.66], 0.014);
    M([0, 0.045, -0.47], [0.015, 0.035, 0.02]); M([0, 0.07, -0.47], [0.006, 0.02, 0.006]);
    M([0, -0.005, 0.13], [0.035, 0.06, 0.20]); cyl(metal, [0, 0.01, 0.02], [0, 0.01, 0.2], 0.016);
    M([0, -0.075, -0.02], [0.028, 0.10, 0.04], { rx: -0.3 }); M([0, -0.045, -0.06], [0.02, 0.004, 0.06]); M([0, -0.04, -0.065], [0.004, 0.02, 0.008]);
    M([0, -0.10, -0.15], [0.024, 0.16, 0.07], { rx: 0.18, bone: 1 });
    M([0, 0.045, 0.01], [0.03, 0.012, 0.04], { bone: 4 });
    M([0, 0.052, -0.08], [0.03, 0.02, 0.06]); // rail riser
    M([0.017, 0.088, -0.08], [0.004, 0.036, 0.05]); M([-0.017, 0.088, -0.08], [0.004, 0.036, 0.05]); M([0, 0.108, -0.08], [0.038, 0.004, 0.05]); M([0, 0.068, -0.08], [0.038, 0.004, 0.05]);
    dot.box([0, 0.087, -0.078], [0.004, 0.004, 0.002]);
    cyl(metal, [0, -0.037, -0.30], [0, -0.037, -0.41], 0.014); lens.box([0, -0.037, -0.412], [0.02, 0.02, 0.002]);
    hand([0.006, -0.055, -0.005], 3, 1.1); forearm([0.02, -0.07, 0.0], [0.16, -0.30, 0.20], 3); uparm([0.16, -0.30, 0.20], [0.22, -0.30, 0.48], 3);
    hand([-0.005, -0.03, -0.33], 2, 1.05); forearm([-0.01, -0.05, -0.32], [-0.13, -0.32, -0.10], 2); uparm([-0.13, -0.32, -0.10], [-0.21, -0.30, 0.42], 2);
  } else if (type === 'pistol') {
    M([0, 0.022, -0.06], [0.028, 0.03, 0.19], { bone: 4 }); M([0, 0.042, 0.02], [0.02, 0.008, 0.01], { bone: 4 }); M([0, 0.042, -0.145], [0.004, 0.008, 0.006], { bone: 4 });
    M([0, 0.0, -0.05], [0.026, 0.022, 0.16]); M([0, -0.05, 0.02], [0.03, 0.09, 0.04], { rx: -0.2 }); M([0, -0.02, -0.03], [0.02, 0.004, 0.05]); M([0, -0.018, -0.04], [0.004, 0.015, 0.006]);
    cyl(metal, [0, 0.02, -0.15], [0, 0.02, -0.165], 0.007);
    M([0, -0.07, 0.025], [0.02, 0.08, 0.03], { rx: -0.2, bone: 1 });
    M([0, -0.01, -0.10], [0.02, 0.012, 0.03]); lens.box([0, -0.02, -0.115], [0.014, 0.014, 0.002]);
    hand([0.008, -0.05, 0.02], 3, 1.0); forearm([0.02, -0.07, 0.03], [0.14, -0.30, 0.22], 3); uparm([0.14, -0.30, 0.22], [0.22, -0.30, 0.5], 3);
    hand([-0.025, -0.06, 0.005], 2, 0.95); forearm([-0.03, -0.08, 0.02], [-0.13, -0.32, 0.2], 2); uparm([-0.13, -0.32, 0.2], [-0.22, -0.3, 0.48], 2);
  } else {
    M([0, 0, -0.08], [0.045, 0.07, 0.22]); cyl(metal, [0, 0.02, -0.19], [0, 0.02, -0.72], 0.011); cyl(metal, [0, -0.012, -0.19], [0, -0.012, -0.62], 0.012);
    M([0, 0.065, -0.70], [0.006, 0.01, 0.006]); M([0, 0.045, -0.20], [0.02, 0.01, 0.04]);
    wood.box([0, 0.005, -0.42], [0.05, 0.062, 0.15], { uvScale: [0.2, 0.2], bone: 4 });
    wood.box([0, -0.01, 0.14], [0.04, 0.07, 0.24], { uvScale: [0.3, 0.3] }); wood.box([0, -0.06, -0.0], [0.035, 0.08, 0.06], { rx: -0.5, uvScale: [0.3, 0.3] });
    M([0, -0.045, -0.06], [0.02, 0.004, 0.06]); M([0, -0.04, -0.065], [0.004, 0.02, 0.008]);
    cyl(metal, [0, -0.042, -0.42], [0, -0.042, -0.51], 0.014); lens.box([0, -0.042, -0.512], [0.02, 0.02, 0.002]);
    hand([0.006, -0.05, -0.0], 3, 1.1); forearm([0.02, -0.07, 0.0], [0.16, -0.30, 0.20], 3); uparm([0.16, -0.30, 0.20], [0.22, -0.30, 0.48], 3);
    hand([-0.005, -0.03, -0.42], 2, 1.05); forearm([-0.01, -0.05, -0.41], [-0.13, -0.32, -0.15], 2); uparm([-0.13, -0.32, -0.15], [-0.21, -0.30, 0.40], 2);
  }
  return { metal: metal.build(), arms: arms.build(), wood: wood.n ? wood.build() : null, dot: dot.n ? dot.build() : null, lens: lens.build() };
}
