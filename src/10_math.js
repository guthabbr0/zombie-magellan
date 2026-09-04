/* ============================================================
   MAGELLAN — single-file bodycam zombie shooter
   Engine: custom WebGL2 forward renderer, procedural assets,
   procedural audio. No external dependencies.
   Units: metres, seconds, radians (unless stated otherwise).
   ============================================================ */
const PI = Math.PI, TAU = Math.PI * 2;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const sign = x => x < 0 ? -1 : 1;
const deg = d => d * PI / 180;
// exponential smoothing that is frame-rate independent
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
// deterministic seeded random (mulberry32)
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- vec3 (plain arrays / Float32Array) ---------- */
const V3 = {
  create: (x = 0, y = 0, z = 0) => [x, y, z],
  set: (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; },
  copy: (o, a) => { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; },
  add: (o, a, b) => { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; },
  sub: (o, a, b) => { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; },
  scale: (o, a, s) => { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; },
  addScaled: (o, a, b, s) => { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; },
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (o, a, b) => { const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0]; o[0] = x; o[1] = y; o[2] = z; return o; },
  len: a => Math.hypot(a[0], a[1], a[2]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  distXZ: (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]),
  norm: (o, a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; return o; },
  lerp: (o, a, b, t) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; },
  transformMat4: (o, m, p) => { const x = p[0], y = p[1], z = p[2]; const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1; o[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w; o[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w; o[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w; return o; },
  transformDir: (o, m, d) => { const x = d[0], y = d[1], z = d[2]; o[0] = m[0] * x + m[4] * y + m[8] * z; o[1] = m[1] * x + m[5] * y + m[9] * z; o[2] = m[2] * x + m[6] * y + m[10] * z; return o; },
};

/* ---------- mat4 (column-major Float32Array, gl-matrix conventions) ---------- */
const M4 = {
  create: () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  identity: m => { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  copy: (o, a) => { o.set(a); return o; },
  mul(o, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    o[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30; o[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31; o[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32; o[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    o[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30; o[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31; o[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32; o[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    o[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30; o[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31; o[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32; o[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    o[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30; o[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31; o[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32; o[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return o;
  },
  perspective(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o.fill(0); o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf; return o;
  },
  ortho(o, l, r, b, t, n, f) {
    const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f);
    o.fill(0); o[0] = -2 * lr; o[5] = -2 * bt; o[10] = 2 * nf; o[12] = (l + r) * lr; o[13] = (t + b) * bt; o[14] = (f + n) * nf; o[15] = 1; return o;
  },
  lookAt(o, eye, center, up) {
    let z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
    let len = Math.hypot(z0, z1, z2); if (len < 1e-9) { z2 = 1; len = 1; } z0 /= len; z1 /= len; z2 /= len;
    let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
    len = Math.hypot(x0, x1, x2); if (len < 1e-9) { x0 = 1; x1 = 0; x2 = 0; } else { x0 /= len; x1 /= len; x2 /= len; }
    const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
    o[0] = x0; o[1] = y0; o[2] = z0; o[3] = 0; o[4] = x1; o[5] = y1; o[6] = z1; o[7] = 0; o[8] = x2; o[9] = y2; o[10] = z2; o[11] = 0;
    o[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]); o[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]); o[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]); o[15] = 1; return o;
  },
  invert(o, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!det) return M4.identity(o); det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  },
  translate(o, a, v) {
    const x = v[0], y = v[1], z = v[2];
    if (a !== o) { for (let i = 0; i < 12; i++) o[i] = a[i]; }
    o[12] = a[0] * x + a[4] * y + a[8] * z + a[12]; o[13] = a[1] * x + a[5] * y + a[9] * z + a[13]; o[14] = a[2] * x + a[6] * y + a[10] * z + a[14]; o[15] = a[3] * x + a[7] * y + a[11] * z + a[15]; return o;
  },
  scale(o, a, v) { const x = v[0], y = v[1], z = v[2]; o[0] = a[0] * x; o[1] = a[1] * x; o[2] = a[2] * x; o[3] = a[3] * x; o[4] = a[4] * y; o[5] = a[5] * y; o[6] = a[6] * y; o[7] = a[7] * y; o[8] = a[8] * z; o[9] = a[9] * z; o[10] = a[10] * z; o[11] = a[11] * z; o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15]; return o; },
  rotateX(o, a, r) { const s = Math.sin(r), c = Math.cos(r), a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11]; if (a !== o) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3]; o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15]; } o[4] = a10 * c + a20 * s; o[5] = a11 * c + a21 * s; o[6] = a12 * c + a22 * s; o[7] = a13 * c + a23 * s; o[8] = a20 * c - a10 * s; o[9] = a21 * c - a11 * s; o[10] = a22 * c - a12 * s; o[11] = a23 * c - a13 * s; return o; },
  rotateY(o, a, r) { const s = Math.sin(r), c = Math.cos(r), a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11]; if (a !== o) { o[4] = a[4]; o[5] = a[5]; o[6] = a[6]; o[7] = a[7]; o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15]; } o[0] = a00 * c - a20 * s; o[1] = a01 * c - a21 * s; o[2] = a02 * c - a22 * s; o[3] = a03 * c - a23 * s; o[8] = a00 * s + a20 * c; o[9] = a01 * s + a21 * c; o[10] = a02 * s + a22 * c; o[11] = a03 * s + a23 * c; return o; },
  rotateZ(o, a, r) { const s = Math.sin(r), c = Math.cos(r), a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7]; if (a !== o) { o[8] = a[8]; o[9] = a[9]; o[10] = a[10]; o[11] = a[11]; o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15]; } o[0] = a00 * c + a10 * s; o[1] = a01 * c + a11 * s; o[2] = a02 * c + a12 * s; o[3] = a03 * c + a13 * s; o[4] = a10 * c - a00 * s; o[5] = a11 * c - a01 * s; o[6] = a12 * c - a02 * s; o[7] = a13 * c - a03 * s; return o; },
  fromTranslation(o, v) { M4.identity(o); o[12] = v[0]; o[13] = v[1]; o[14] = v[2]; return o; },
  // build matrix from 3 axes + origin (columns)
  fromAxes(o, x, y, z, p) { o[0] = x[0]; o[1] = x[1]; o[2] = x[2]; o[3] = 0; o[4] = y[0]; o[5] = y[1]; o[6] = y[2]; o[7] = 0; o[8] = z[0]; o[9] = z[1]; o[10] = z[2]; o[11] = 0; o[12] = p[0]; o[13] = p[1]; o[14] = p[2]; o[15] = 1; return o; },
  transposeRot(o, a) { // transpose of upper 3x3, zero translation
    o[0] = a[0]; o[1] = a[4]; o[2] = a[8]; o[3] = 0; o[4] = a[1]; o[5] = a[5]; o[6] = a[9]; o[7] = 0; o[8] = a[2]; o[9] = a[6]; o[10] = a[10]; o[11] = 0; o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1; return o;
  },
  getTranslation: (o, m) => { o[0] = m[12]; o[1] = m[13]; o[2] = m[14]; return o; },
};

/* ---------- geometry helpers ---------- */
// ray vs axis-aligned box (min, max) -> t or -1
function rayAABB(ro, rd, mn, mx) {
  let tmin = -1e30, tmax = 1e30;
  for (let i = 0; i < 3; i++) {
    const d = rd[i];
    if (Math.abs(d) < 1e-9) { if (ro[i] < mn[i] || ro[i] > mx[i]) return -1; continue; }
    const inv = 1 / d; let t1 = (mn[i] - ro[i]) * inv, t2 = (mx[i] - ro[i]) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : tmax;
}
// ray vs capsule segment (a,b,radius) -> t or -1
function rayCapsule(ro, rd, a, b, r) {
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], oa = [ro[0] - a[0], ro[1] - a[1], ro[2] - a[2]];
  const baba = V3.dot(ba, ba), bard = V3.dot(ba, rd), baoa = V3.dot(ba, oa), rdoa = V3.dot(rd, oa), oaoa = V3.dot(oa, oa);
  const A = baba - bard * bard, B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - r * r * baba;
  let h = B * B - A * C;
  if (h >= 0) {
    const t = (-B - Math.sqrt(h)) / A;
    const y = baoa + t * bard;
    if (y > 0 && y < baba && t > 0) return t;
    const oc = y <= 0 ? oa : [ro[0] - b[0], ro[1] - b[1], ro[2] - b[2]];
    const bb = V3.dot(rd, oc), cc = V3.dot(oc, oc) - r * r;
    h = bb * bb - cc;
    if (h > 0) { const t2 = -bb - Math.sqrt(h); if (t2 > 0) return t2; }
  }
  return -1;
}
// 2D segment vs AABB (xz) intersection test for line-of-sight
function segHitsBoxXZ(x0, z0, x1, z1, mn, mx) {
  let tmin = 0, tmax = 1; const dx = x1 - x0, dz = z1 - z0;
  for (let i = 0; i < 2; i++) {
    const o = i ? z0 : x0, d = i ? dz : dx, lo = i ? mn[2] : mn[0], hi = i ? mx[2] : mx[0];
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return false;
  }
  return true;
}
