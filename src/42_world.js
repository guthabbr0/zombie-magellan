/* ============================================================
   World construction (procedural city block)
   Coordinates: X east, Z south (north = -Z), Y up. Metres.
   ============================================================ */
const W = { opaque: [], transparent: [], colliders: [], points: [], spots: [], dyn: [], spawns: [], zones: [], groups: {}, props: {}, lampHeads: [], windowsLit: [] };
const wrng = mulberry(1337);
const wr = (a, b) => a + wrng() * (b - a);
function grp(key, material) { if (!W.groups[key]) W.groups[key] = { mb: new MB(), mat: material }; return W.groups[key].mb; }
function addCollider(mn, mx, tag) { W.colliders.push({ mn, mx, tag }); }
function boxCollider(c, s, yaw = 0, tag) { // AABB of a yawed box footprint
  const hx = s[0] / 2, hz = s[2] / 2, cy = Math.abs(Math.cos(yaw)), sy = Math.abs(Math.sin(yaw));
  const ex = hx * cy + hz * sy, ez = hx * sy + hz * cy;
  addCollider([c[0] - ex, c[1] - s[1] / 2, c[2] - ez], [c[0] + ex, c[1] + s[1] / 2, c[2] + ez], tag);
}
function groundY(x, z) { for (const r of W.zones) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r.y; return 0; }
const MATS = {
  road: mat({ tex: 'road', tiling: [1, 1], ground: 1, normalStr: 0.8 }), asphalt: mat({ tex: 'asphalt', ground: 1, normalStr: 0.8 }), concrete: mat({ tex: 'concrete', ground: 1, normalStr: 0.9 }), tiles: mat({ tex: 'tiles', ground: 1 }),
  brickF: mat({ tex: 'brickFacade' }), plasterF: mat({ tex: 'plasterFacade' }), brick: mat({ tex: 'brick' }), plaster: mat({ tex: 'plaster' }), roof: mat({ tex: 'roof' }),
  metalDark: mat({ tex: 'metal', tint: [0.10, 0.10, 0.11, 1], rough: 1.3 }), metalOlive: mat({ tex: 'metal', tint: [0.22, 0.24, 0.16, 1] }), metalTan: mat({ tex: 'metal', tint: [0.42, 0.36, 0.24, 1] }),
  metalGreen: mat({ tex: 'metal', tint: [0.08, 0.22, 0.10, 1] }), metalWhite: mat({ tex: 'metal', tint: [0.75, 0.76, 0.75, 1] }), metalRed: mat({ tex: 'metal', tint: [0.45, 0.06, 0.05, 1] }), metalBlue: mat({ tex: 'metal', tint: [0.08, 0.12, 0.30, 1] }), metalGray: mat({ tex: 'metal', tint: [0.35, 0.36, 0.38, 1] }), metalYellow: mat({ tex: 'metal', tint: [0.55, 0.42, 0.06, 1] }),
  rubber: mat({ tex: 'metal', tint: [0.035, 0.035, 0.035, 1], rough: 2.5, metal: 0 }), glass: mat({ tex: 'blank', tint: [0.02, 0.025, 0.03, 1], rough: 0.08, metal: 0.4 }),
  rust: mat({ tex: 'rust' }), wood: mat({ tex: 'wood' }), fabric: mat({ tex: 'fabric' }), chain: mat({ tex: 'chain', cutout: true, alpha: true, twoSided: true }), concreteBarrier: mat({ tex: 'concrete', tint: [0.8, 0.8, 0.78, 1] }),
  winWarm: mat({ tex: 'blank', tint: [1, 0.8, 0.5, 1], emissive: [2.2, 1.5, 0.8], unlit: 1 }), winCool: mat({ tex: 'blank', tint: [0.6, 0.75, 1, 1], emissive: [0.9, 1.3, 2.0], unlit: 1 }),
  lampGlass: mat({ tex: 'blank', tint: [1, 0.85, 0.6, 1], emissive: [0, 0, 0], unlit: 1 }), pharmacy: mat({ tex: 'blank', tint: [0.2, 1, 0.3, 1], emissive: [0.3, 2.6, 0.5], unlit: 1 }), storeGlass: mat({ tex: 'blank', tint: [0.55, 0.65, 0.7, 0.28], rough: 0.06, metal: 0.6, alpha: true, twoSided: true }),
  headlight: mat({ tex: 'blank', tint: [1, 1, 0.9, 1], emissive: [12, 11, 9], unlit: 1 }), tailLight: mat({ tex: 'blank', tint: [1, 0.1, 0.05, 1], emissive: [3, 0.2, 0.05], unlit: 1 }),
  redStrobe: mat({ tex: 'blank', tint: [1, 0.2, 0.1, 1], emissive: [0, 0, 0], unlit: 1 }), blueStrobe: mat({ tex: 'blank', tint: [0.2, 0.3, 1, 1], emissive: [0, 0, 0], unlit: 1 }),
  trafficRed: mat({ tex: 'blank', tint: [1, 0.15, 0.05, 1], emissive: [0, 0, 0], unlit: 1 }), genLamp: mat({ tex: 'blank', tint: [1, 0.2, 0.1, 1], emissive: [0, 0, 0], unlit: 1 }),
  interior: mat({ tex: 'plaster', tint: [0.9, 0.9, 0.85, 1] }), shelves: mat({ tex: 'wood', tint: [0.7, 0.7, 0.7, 1] }), counter: mat({ tex: 'metal', tint: [0.6, 0.6, 0.62, 1] }), ceilLight: mat({ tex: 'blank', tint: [1, 1, 1, 1], emissive: [1.6, 1.6, 1.4], unlit: 1 }),
  medkit: mat({ tex: 'metal', tint: [0.85, 0.85, 0.85, 1] }), medCross: mat({ tex: 'blank', tint: [1, 0.1, 0.1, 1], emissive: [1.5, 0.1, 0.1], unlit: 1 }), ammoBox: mat({ tex: 'metal', tint: [0.25, 0.28, 0.18, 1] }), ammoTape: mat({ tex: 'blank', tint: [1, 0.8, 0.3, 1], emissive: [0.9, 0.7, 0.2], unlit: 1 }),
  strobeLZ: mat({ tex: 'blank', tint: [1, 0.2, 0.1, 1], emissive: [0, 0, 0], unlit: 1 }),
};
/* ---- primitives ---- */
function groundPlane(key, x0, x1, z0, z1, y, uvFn) {
  const mb = grp(key, MATS[key]);
  const p0 = [x0, y, z1], p1 = [x1, y, z1], p2 = [x1, y, z0], p3 = [x0, y, z0];
  if (uvFn) mb.plane(p0, p1, p2, p3, { uvs: [uvFn(p0), uvFn(p1), uvFn(p2), uvFn(p3)] });
  else mb.plane(p0, p1, p2, p3, { uvs: [[x0 / 6, z1 / 6], [x1 / 6, z1 / 6], [x1 / 6, z0 / 6], [x0 / 6, z0 / 6]] });
}
function roadZ(x0, x1, z0, z1) { groundPlane('road', x0, x1, z0, z1, 0.0, p => [(p[0] - x0) / (x1 - x0), p[2] / 9]); }
function roadX(x0, x1, z0, z1) { groundPlane('road', x0, x1, z0, z1, 0.0, p => [(p[2] - z0) / (z1 - z0), p[0] / 9]); }
function sidewalk(x0, x1, z0, z1) {
  const mb = grp('concrete', MATS.concrete); mb.box([(x0 + x1) / 2, 0.06, (z0 + z1) / 2], [x1 - x0, 0.12, z1 - z0], { worldUV: true, uvScale: [3, 3], skip: [[0, -1, 0]] });
  W.zones.push({ x0, x1, z0, z1, y: 0.12 });
}
function plaza(x0, x1, z0, z1) { const mb = grp('tiles', MATS.tiles); mb.box([(x0 + x1) / 2, 0.06, (z0 + z1) / 2], [x1 - x0, 0.12, z1 - z0], { worldUV: true, uvScale: [4, 4], skip: [[0, -1, 0]] }); W.zones.push({ x0, x1, z0, z1, y: 0.12 }); }
function alleyFloor(x0, x1, z0, z1) { const mb = grp('asphalt', MATS.asphalt); mb.box([(x0 + x1) / 2, 0.06, (z0 + z1) / 2], [x1 - x0, 0.12, z1 - z0], { worldUV: true, uvScale: [6, 6], skip: [[0, -1, 0]] }); W.zones.push({ x0, x1, z0, z1, y: 0.12 }); }
function building(x0, x1, z0, z1, h, type, opts = {}) {
  const key = type === 'brick' ? 'brickF' : 'plasterF'; const mb = grp(key, MATS[key]); const y0 = opts.y0 || 0;
  const c = [(x0 + x1) / 2, (h + y0) / 2, (z0 + z1) / 2], s = [x1 - x0, h - y0, z1 - z0];
  mb.box(c, s, { worldUV: true, uvScale: [4, 3.6], skip: [[0, 1, 0], [0, -1, 0]] });
  const rb = grp('roof', MATS.roof); rb.box([c[0], h + 0.15, c[2]], [s[0] + 0.3, 0.3, s[2] + 0.3], { worldUV: true, uvScale: [4, 4], skip: [[0, -1, 0]] });
  // roof clutter
  if (s[0] > 10 && !opts.noClutter) { const nb = 1 + Math.floor(wr(0, 3)); for (let i = 0; i < nb; i++) { const bs = [wr(1, 3), wr(0.8, 2.5), wr(1, 3)]; rb.box([wr(x0 + 2, x1 - 2), h + 0.3 + bs[1] / 2, wr(z0 + 2, z1 - 2)], bs, { worldUV: true, uvScale: [2, 2] }); } }
  if (!opts.noCollide) addCollider([x0, 0, z0], [x1, h, z1], 'building');
  // lit windows on faces that face streets
  const faces = opts.faces || [];
  for (const f of faces) {
    const floors = Math.floor(h / 3.6); const cols = Math.floor((f === 'w' || f === 'e' ? (z1 - z0) : (x1 - x0)) / 4);
    for (let fl = Math.round(y0 / 3.6); fl < floors; fl++) for (let cI = 0; cI < cols; cI++) {
      if (wrng() > (opts.litProb || 0.09)) continue;
      const warm = wrng() < 0.65; const wm = grp(warm ? 'winWarm' : 'winCool', warm ? MATS.winWarm : MATS.winCool);
      const y0 = fl * 3.6 + 0.79, y1 = fl * 3.6 + 2.59;
      if (f === 'w' || f === 'e') { const zz0 = z0 + cI * 4 + 1.2, zz1 = z0 + cI * 4 + 2.8; const x = f === 'w' ? x0 - 0.03 : x1 + 0.03; if (f === 'w') wm.plane([x, y0, zz1], [x, y0, zz0], [x, y1, zz0], [x, y1, zz1]); else wm.plane([x, y0, zz0], [x, y0, zz1], [x, y1, zz1], [x, y1, zz0]); }
      else { const xx0 = x0 + cI * 4 + 1.2, xx1 = x0 + cI * 4 + 2.8; const z = f === 'n' ? z0 - 0.03 : z1 + 0.03; if (f === 'n') wm.plane([xx0, y0, z], [xx1, y0, z], [xx1, y1, z], [xx0, y1, z]); else wm.plane([xx1, y0, z], [xx0, y0, z], [xx0, y1, z], [xx1, y1, z]); }
    }
  }
}
function wheel(mb, c, yaw) { mb.tube([c[0] - Math.sin(yaw + PI / 2) * 0.11, c[1], c[2] - Math.cos(yaw + PI / 2) * 0.11], [c[0] + Math.sin(yaw + PI / 2) * 0.11, c[1], c[2] + Math.cos(yaw + PI / 2) * 0.11], [0.34, 0.34], [0.34, 0.34], { segs: 14, rings: 2, caps: true, uvScale: 0.5 }); }
function car(x, z, yaw, colorKey, opts = {}) {
  const body = grp(colorKey, MATS[colorKey]); const rot = MB.rotMat(0, yaw, 0); const P = p => MB.xf(rot, p, [x, 0, z]);
  const bh = opts.smashed ? 0.62 : 0.72;
  body.box(P([0, 0.36 + bh / 2, 0]), [1.85, bh, 4.4], { ry: yaw, uvScale: [1.2, 1.2] });
  body.box(P([0, 0.36 + bh + 0.02, -0.4]), [1.7, 0.06, 2.1], { ry: yaw, uvScale: [1.2, 1.2] });
  const gm = grp('glass', MATS.glass); gm.box(P([0, 0.36 + bh + 0.3, -0.3]), [1.6, 0.56, 1.9], { ry: yaw, rx: 0, uvScale: [1, 1] });
  const rub = grp('rubber', MATS.rubber);
  for (const [lx, lz] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) wheel(rub, P([lx, 0.34, lz]), yaw);
  if (opts.lights) { const hl = grp('headlight', MATS.headlight); const d = [-Math.sin(yaw), 0, -Math.cos(yaw)]; for (const lx of [-0.6, 0.6]) { const p = P([lx, 0.8, -2.21]); hl.box(p, [0.3, 0.14, 0.02], { ry: yaw }); }
    W.spots.push({ pos: V3.add([], P([0, 0.8, -2.2]), [0, 0, 0]), dir: V3.norm([], [d[0], -0.12, d[2]]), range: 40, cosOuter: Math.cos(deg(28)), cosInner: Math.cos(deg(12)), color: [1, 0.95, 0.8], intensity: 18 }); }
  const tl = grp('tailLight', MATS.tailLight); for (const lx of [-0.65, 0.65]) tl.box(P([lx, 0.85, 2.21]), [0.25, 0.12, 0.02], { ry: yaw });
  boxCollider([x, 0.6, z], [1.9, 1.2, 4.4], yaw, 'car');
}
function humvee(x, z, yaw) {
  const body = grp('metalTan', MATS.metalTan); const rot = MB.rotMat(0, yaw, 0); const P = p => MB.xf(rot, p, [x, 0, z]);
  body.box(P([0, 0.55 + 0.4, 0]), [2.2, 0.8, 4.8], { ry: yaw, uvScale: [1.5, 1.5] }); body.box(P([0, 0.95 + 0.45, 0.3]), [2.0, 0.9, 2.6], { ry: yaw, uvScale: [1.5, 1.5] });
  body.box(P([0, 0.95 + 0.2, -1.7]), [2.1, 0.4, 1.3], { ry: yaw, uvScale: [1.5, 1.5] });
  const gm = grp('glass', MATS.glass); gm.box(P([0, 1.45, -0.6]), [1.8, 0.5, 0.06], { ry: yaw }); gm.box(P([0, 1.45, 0.3]), [2.04, 0.5, 2.4], { ry: yaw });
  const rub = grp('rubber', MATS.rubber); for (const [lx, lz] of [[-1.0, 1.6], [1.0, 1.6], [-1.0, -1.6], [1.0, -1.6]]) { const c = P([lx, 0.45, lz]); rub.tube([c[0] - Math.sin(yaw + PI / 2) * 0.15, c[1], c[2] - Math.cos(yaw + PI / 2) * 0.15], [c[0] + Math.sin(yaw + PI / 2) * 0.15, c[1], c[2] + Math.cos(yaw + PI / 2) * 0.15], [0.45, 0.45], [0.45, 0.45], { segs: 14, rings: 2, caps: true }); }
  const hl = grp('headlight', MATS.headlight); const d = [-Math.sin(yaw), 0, -Math.cos(yaw)]; for (const lx of [-0.75, 0.75]) hl.box(P([lx, 0.95, -2.41]), [0.28, 0.2, 0.02], { ry: yaw });
  W.spots.push({ pos: P([0, 1.0, -2.4]), dir: V3.norm([], [d[0], -0.1, d[2]]), range: 45, cosOuter: Math.cos(deg(30)), cosInner: Math.cos(deg(14)), color: [1, 0.95, 0.82], intensity: 32, tag: 'humvee' });
  const ant = grp('metalDark', MATS.metalDark); ant.tube(P([-0.9, 1.8, 1.5]), P([-0.9, 3.6, 1.5]), [0.01, 0.01], [0.006, 0.006], { segs: 6, rings: 2 });
  boxCollider([x, 0.9, z], [2.3, 1.8, 4.9], yaw, 'humvee');
}
function policeCar(x, z, yaw) {
  car(x, z, yaw, 'metalWhite', { smashed: true }); const rot = MB.rotMat(0, yaw, 0); const P = p => MB.xf(rot, p, [x, 0, z]);
  const dk = grp('metalDark', MATS.metalDark); dk.box(P([0, 0.36 + 0.62 + 0.62, -0.3]), [1.2, 0.12, 0.35], { ry: yaw });
  const red = { mesh: null, mat: Object.assign({}, MATS.redStrobe), model: M4.create(), emissiveFn: t => { const s = (Math.floor(t * 6) % 2) === 0 ? 1 : 0; return [6 * s, 0.6 * s, 0.2 * s]; } };
  const blue = { mesh: null, mat: Object.assign({}, MATS.blueStrobe), model: M4.create(), emissiveFn: t => { const s = (Math.floor(t * 6) % 2) === 1 ? 1 : 0; return [0.6 * s, 1.5 * s, 7 * s]; } };
  const rm = new MB(); rm.box(P([-0.35, 0.36 + 0.62 + 0.7, -0.3]), [0.5, 0.14, 0.3], { ry: yaw }); red.mesh = rm.build();
  const bm = new MB(); bm.box(P([0.35, 0.36 + 0.62 + 0.7, -0.3]), [0.5, 0.14, 0.3], { ry: yaw }); blue.mesh = bm.build();
  W.dyn.push(red, blue);
  const lp = P([0, 2.2, -0.3]);
  W.points.push({ pos: lp, radius: 22, color: [1, 0.15, 0.05], intensity: 0, fn: t => (Math.floor(t * 6) % 2) === 0 ? 14 : 0 });
  W.points.push({ pos: [lp[0] + 0.5, lp[1], lp[2]], radius: 22, color: [0.15, 0.3, 1], intensity: 0, fn: t => (Math.floor(t * 6) % 2) === 1 ? 14 : 0 });
}
function lamp(x, z, side, lit, flicker) {
  const mb = grp('metalGray', MATS.metalGray); mb.tube([x, 0, z], [x, 7.2, z], [0.09, 0.09], [0.07, 0.07], { segs: 8, rings: 2, uvScale: 1 });
  mb.box([x + side * 1.0, 7.1, z], [2.0, 0.1, 0.1]); mb.box([x + side * 1.9, 6.95, z], [0.7, 0.22, 0.3]);
  addCollider([x - 0.12, 0, z - 0.12], [x + 0.12, 7, z + 0.12], 'pole');
  if (lit) {
    const d = { mesh: null, mat: Object.assign({}, MATS.lampGlass), model: M4.create() }; const gm = new MB(); gm.box([x + side * 1.9, 6.83, z], [0.6, 0.03, 0.24]); d.mesh = gm.build();
    const base = [2.6, 1.9, 1.0]; const f = flicker ? (t => { const n = Math.sin(t * 37.1) * Math.sin(t * 13.7 + 1.0) + Math.sin(t * 91.3); return (n > -0.4 ? 1 : 0.15) * (0.7 + 0.3 * Math.sin(t * 120)); }) : (t => 1);
    d.emissiveFn = t => { const s = f(t); return [base[0] * s, base[1] * s, base[2] * s]; }; W.dyn.push(d);
    W.points.push({ pos: [x + side * 1.9, 6.7, z], radius: 16, color: [1, 0.72, 0.38], intensity: 5, fn: t => 5 * f(t) });
  }
}
function dumpster(x, z, yaw) { const mb = grp('metalGreen', MATS.metalGreen); mb.box([x, 0.12 + 0.65, z], [1.8, 1.3, 1.0], { ry: yaw, uvScale: [1, 1] }); mb.box([x - Math.sin(yaw) * 0.1, 0.12 + 1.38, z - Math.cos(yaw) * 0.1], [1.85, 0.08, 1.05], { ry: yaw, rx: -0.25, uvScale: [1, 1] }); boxCollider([x, 0.8, z], [1.9, 1.5, 1.1], yaw, 'dumpster'); }
function barrier(x, z, yaw) { const mb = grp('concreteBarrier', MATS.concreteBarrier); mb.box([x, 0.35, z], [3.0, 0.7, 0.55], { ry: yaw, uvScale: [1.5, 1.5] }); mb.box([x, 0.75, z], [3.0, 0.15, 0.3], { ry: yaw, uvScale: [1.5, 1.5] }); boxCollider([x, 0.45, z], [3.0, 0.9, 0.6], yaw, 'barrier'); }
function sandbags(x0, x1, z, rows) { const mb = grp('fabric', MATS.fabric); for (let r = 0; r < rows; r++) { const y = 0.14 + r * 0.24; const off = (r % 2) * 0.32; for (let x = x0 + off; x < x1 - 0.2; x += 0.64) mb.ellipsoid([x + 0.3, y, z + (r % 2 ? 0.06 : -0.06)], [0.34, 0.15, 0.22], { segs: 8, rings: 5, rx: wr(-0.1, 0.1), ry: wr(-0.2, 0.2) }); } addCollider([x0, 0, z - 0.3], [x1, rows * 0.24 + 0.1, z + 0.3], 'sandbags'); }
function fence(x0, z0, x1, z1, h = 2.4) {
  const mb = grp('chain', MATS.chain); const len = Math.hypot(x1 - x0, z1 - z0);
  mb.plane([x0, 0.12, z0], [x1, 0.12, z1], [x1, 0.12 + h, z1], [x0, 0.12 + h, z0], { uvs: [[0, 0], [len / 2.4, 0], [len / 2.4, h / 2.4], [0, h / 2.4]] });
  const pm = grp('metalGray', MATS.metalGray); const n = Math.max(1, Math.round(len / 3));
  for (let i = 0; i <= n; i++) { const t = i / n; const x = lerp(x0, x1, t), z = lerp(z0, z1, t); pm.tube([x, 0.1, z], [x, 0.12 + h, z], [0.03, 0.03], [0.03, 0.03], { segs: 6, rings: 2 }); }
  pm.tube([x0, 0.1 + h, z0], [x1, 0.1 + h, z1], [0.02, 0.02], [0.02, 0.02], { segs: 6, rings: 2 });
  addCollider([Math.min(x0, x1) - 0.1, 0, Math.min(z0, z1) - 0.1], [Math.max(x0, x1) + 0.1, h, Math.max(z0, z1) + 0.1], 'fence');
}
function crate(x, z, s, yaw = 0, y = 0) { const mb = grp('wood', MATS.wood); mb.box([x, y + s / 2, z], [s, s, s], { ry: yaw, uvScale: [s, s] }); if (s > 0.5) boxCollider([x, y + s / 2, z], [s, s, s], yaw, 'crate'); }
function rubble(x, z, r, n, y = 0) { const mb = grp('concreteBarrier', MATS.concreteBarrier); const mb2 = grp('brick', MATS.brick); for (let i = 0; i < n; i++) { const a = wr(0, TAU), d = wr(0, r); const s = [wr(0.2, 0.9), wr(0.15, 0.5), wr(0.2, 0.9)]; (wrng() < 0.5 ? mb : mb2).box([x + Math.cos(a) * d, y + s[1] / 2 - 0.05, z + Math.sin(a) * d], s, { rx: wr(-0.3, 0.3), ry: wr(0, TAU), rz: wr(-0.3, 0.3), uvScale: [1, 1] }); } if (r > 1.2) addCollider([x - r * 0.7, 0, z - r * 0.7], [x + r * 0.7, 0.6, z + r * 0.7], 'rubble'); }
function trashbags(x, z, n) { const mb = grp('rubber', MATS.rubber); for (let i = 0; i < n; i++) mb.ellipsoid([x + wr(-0.6, 0.6), 0.12 + 0.22, z + wr(-0.6, 0.6)], [wr(0.3, 0.45), 0.24, wr(0.3, 0.45)], { segs: 8, rings: 5, ry: wr(0, TAU) }); }
function tree(x, z) { const mb = grp('wood', MATS.wood); const h = wr(4.5, 6.5); mb.tube([x, 0, z], [x + wr(-0.3, 0.3), h, z + wr(-0.3, 0.3)], [0.2, 0.2], [0.08, 0.08], { segs: 8, rings: 3, uvScale: 1 }); for (let i = 0; i < 5; i++) { const a = wr(0, TAU), y0 = wr(h * 0.45, h * 0.9); const b0 = [x, y0, z], b1 = [x + Math.cos(a) * wr(1, 2.2), y0 + wr(0.8, 2), z + Math.sin(a) * wr(1, 2.2)]; mb.tube(b0, b1, [0.07, 0.07], [0.02, 0.02], { segs: 6, rings: 2, uvScale: 1 }); for (let j = 0; j < 2; j++) { const a2 = a + wr(-1, 1); mb.tube(b1, [b1[0] + Math.cos(a2) * wr(0.5, 1.2), b1[1] + wr(0.4, 1.2), b1[2] + Math.sin(a2) * wr(0.5, 1.2)], [0.02, 0.02], [0.008, 0.008], { segs: 5, rings: 2, uvScale: 1 }); } } addCollider([x - 0.25, 0, z - 0.25], [x + 0.25, 4, z + 0.25], 'tree'); }
function trafficLight(x, z, yaw, blink) {
  const mb = grp('metalDark', MATS.metalDark); mb.tube([x, 0, z], [x, 6, z], [0.1, 0.1], [0.08, 0.08], { segs: 8, rings: 2 }); const rot = MB.rotMat(0, yaw, 0); const P = p => MB.xf(rot, p, [x, 0, z]);
  mb.tube([x, 5.9, z], P([0, 5.9, -4.5]), [0.06, 0.06], [0.05, 0.05], { segs: 6, rings: 2 }); mb.box(P([0, 5.3, -4.0]), [0.35, 1.1, 0.35], { ry: yaw });
  addCollider([x - 0.15, 0, z - 0.15], [x + 0.15, 6, z + 0.15], 'pole');
  if (blink) { const d = { mesh: null, mat: Object.assign({}, MATS.trafficRed), model: M4.create(), emissiveFn: t => { const s = (Math.floor(t * 1.2) % 2) === 0 ? 1 : 0; return [5 * s, 0.4 * s, 0.1 * s]; } }; const lm = new MB(); lm.box(P([0, 5.65, -4.0]), [0.24, 0.24, 0.37], { ry: yaw }); d.mesh = lm.build(); W.dyn.push(d);
    W.points.push({ pos: P([0, 5.6, -4.3]), radius: 12, color: [1, 0.12, 0.03], intensity: 0, fn: t => (Math.floor(t * 1.2) % 2) === 0 ? 5 : 0 }); }
}
function floodlight(x, z, yaw, pitch = -0.25) {
  const mb = grp('metalDark', MATS.metalDark); for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + 0.5; mb.tube([x + Math.cos(a) * 0.6, 0, z + Math.sin(a) * 0.6], [x, 2.6, z], [0.025, 0.025], [0.02, 0.02], { segs: 5, rings: 2 }); }
  const rot = MB.rotMat(pitch, yaw, 0); const P = p => MB.xf(rot, p, [x, 2.7, z]); mb.box(P([0, 0, 0]), [0.7, 0.5, 0.25], { rx: pitch, ry: yaw });
  const hl = grp('headlight', MATS.headlight); hl.box(P([0, 0, -0.14]), [0.6, 0.42, 0.02], { rx: pitch, ry: yaw });
  const d = MB.xfn(rot, [0, 0, -1]); W.spots.push({ pos: P([0, 0, -0.2]), dir: d, range: 42, cosOuter: Math.cos(deg(32)), cosInner: Math.cos(deg(16)), color: [1, 0.97, 0.9], intensity: 40, tag: 'flood' });
  addCollider([x - 0.5, 0, z - 0.5], [x + 0.5, 2.5, z + 0.5], 'flood');
}
function generator(x, z) {
  const mb = grp('metalOlive', MATS.metalOlive); mb.box([x, 0.12 + 0.5, z], [1.4, 1.0, 0.9], { uvScale: [1, 1] }); mb.box([x + 0.45, 0.12 + 1.05, z], [0.3, 0.12, 0.3], { uvScale: [1, 1] });
  const dk = grp('metalDark', MATS.metalDark); dk.box([x - 0.35, 0.12 + 0.7, z - 0.46], [0.4, 0.3, 0.03]); dk.tube([x + 0.45, 0.12 + 1.1, z], [x + 0.45, 0.12 + 1.6, z], [0.05, 0.05], [0.05, 0.05], { segs: 8, rings: 2 });
  const d = { mesh: null, mat: Object.assign({}, MATS.genLamp), model: M4.create(), emissiveFn: t => W.props.power ? [0.2, 4, 0.4] : ((Math.floor(t * 2) % 2) ? [4, 0.3, 0.1] : [0.3, 0.02, 0]) }; const lm = new MB(); lm.box([x - 0.35, 0.12 + 0.82, z - 0.47], [0.06, 0.06, 0.02]); d.mesh = lm.build(); W.dyn.push(d);
  W.points.push({ pos: [x - 0.35, 0.12 + 0.9, z - 0.6], radius: 6, color: [1, 0.2, 0.05], intensity: 0, fn: t => W.props.power ? 0 : ((Math.floor(t * 2) % 2) ? 1.5 : 0.1) });
  W.points.push({ pos: [x - 0.35, 0.12 + 0.9, z - 0.6], radius: 8, color: [0.2, 1, 0.3], intensity: 0, fn: t => W.props.power ? 2.0 : 0 });
  addCollider([x - 0.75, 0, z - 0.5], [x + 0.75, 1.3, z + 0.5], 'generator'); W.props.generator = [x, 0.12, z];
}
function pharmacy(x0, x1, z0, z1, h) {
  // upper floors as a normal building, hollow ground floor with storefront on the west (x0) side
  building(x0, x1, z0, z1, h, 'plaster', { faces: ['w', 's'], noCollide: true, y0: 3.6 });
  addCollider([x0, 3.6, z0], [x1, h, z1], 'building');
  // ground floor: south, east and north outer walls (plaster), west side is the storefront
  const ow = grp('plaster', MATS.plaster); ow.box([(x0 + x1) / 2, 1.8, z1 - 0.15], [x1 - x0, 3.6, 0.3], { worldUV: true, uvScale: [3, 3] }); ow.box([(x0 + x1) / 2, 1.8, z0 + 0.15], [x1 - x0, 3.6, 0.3], { worldUV: true, uvScale: [3, 3] }); ow.box([x1 - 0.15, 1.8, (z0 + z1) / 2], [0.3, 3.6, z1 - z0], { worldUV: true, uvScale: [3, 3] });
  addCollider([x0 + 6, 0, z0], [x1, 3.6, z1], 'building');
  // ground-floor walls
  const wm = grp('plaster', MATS.plaster); const t = 0.3;
  // west wall segments (storefront gap between z=-44 and z=-36, door at z -34..-32)
  const segs = [[z0, z0 + 6], [z0 + 6 + 8, z1 - 4], [z1 - 2, z1]];
  for (const [a, b] of segs) { wm.box([x0 + t / 2, 1.8, (a + b) / 2], [t, 3.6, b - a], { worldUV: true, uvScale: [3, 3] }); addCollider([x0, 0, a], [x0 + t, 3.6, b], 'wall'); }
  // interior
  const inner = grp('interior', MATS.interior); inner.box([x0 + 6, 1.8, (z0 + z1) / 2], [t, 3.6, z1 - z0], { worldUV: true, uvScale: [3, 3] }); // back wall
  inner.box([(x0 + x0 + 6) / 2, 3.6, (z0 + z1) / 2], [6, t, z1 - z0], { worldUV: true, uvScale: [3, 3] }); // ceiling
  inner.box([(x0 + x0 + 6) / 2, 1.8, z0 + t / 2], [6, 3.6, t], { worldUV: true, uvScale: [3, 3] }); inner.box([(x0 + x0 + 6) / 2, 1.8, z1 - t / 2], [6, 3.6, t], { worldUV: true, uvScale: [3, 3] });
  const fl = grp('tiles', MATS.tiles); fl.box([x0 + 3, 0.06, (z0 + z1) / 2], [6, 0.12, z1 - z0], { worldUV: true, uvScale: [2, 2], skip: [[0, -1, 0]] });
  const sh = grp('shelves', MATS.shelves); for (let i = 0; i < 4; i++) sh.box([x0 + 5.6, 0.12 + 0.5 + i * 0.6, (z0 + z1) / 2], [0.5, 0.05, z1 - z0 - 2], { uvScale: [1, 1] });
  const ct = grp('counter', MATS.counter); ct.box([x0 + 3.2, 0.12 + 0.5, z0 + 10], [3.5, 1.0, 0.8], { uvScale: [1, 1] });
  const cl = grp('ceilLight', MATS.ceilLight); cl.box([x0 + 3, 3.42, z0 + 10], [1.2, 0.05, 0.3]);
  W.points.push({ pos: [x0 + 3, 3.2, z0 + 10], radius: 12, color: [1, 0.95, 0.85], intensity: 0, fn: t => (Math.sin(t * 27) * Math.sin(t * 5.3) > -0.7 ? 2.5 : 0.8) });
  // storefront glass + frame + boards
  const gm = new MB(); gm.plane([x0 + 0.05, 0.12, z0 + 14], [x0 + 0.05, 0.12, z0 + 6], [x0 + 0.05, 3.5, z0 + 6], [x0 + 0.05, 3.5, z0 + 14], { uvScale: [1, 1] }); W.transparent.push({ mesh: gm.build(), mat: MATS.storeGlass, model: M4.create(), twoSided: true });
  addCollider([x0 - 0.05, 0, z0 + 6], [x0 + 0.15, 3.6, z0 + 14], 'glass');
  const fr = grp('metalDark', MATS.metalDark); fr.box([x0 + 0.1, 1.8, z0 + 10], [0.08, 0.08, 8.1]); fr.box([x0 + 0.1, 3.55, z0 + 10], [0.12, 0.12, 8.2]); fr.box([x0 + 0.1, 0.16, z0 + 10], [0.12, 0.1, 8.2]);
  const wd = grp('wood', MATS.wood); wd.box([x0 + 0.06, 1.0, z1 - 3], [0.08, 0.25, 2.0], { rz: 0.15, uvScale: [1, 1] }); wd.box([x0 + 0.06, 2.0, z1 - 3], [0.08, 0.25, 2.0], { rz: -0.1, uvScale: [1, 1] });
  const dk = grp('metalDark', MATS.metalDark); dk.box([x0 + 0.02, 1.2, z1 - 3], [0.04, 2.3, 1.8]); addCollider([x0 - 0.05, 0, z1 - 4], [x0 + t, 3.6, z1 - 2], 'door');
  // sign: green cross above the storefront
  const sg = grp('pharmacy', MATS.pharmacy); sg.box([x0 - 0.15, 4.4, z0 + 10], [0.12, 0.35, 1.4]); sg.box([x0 - 0.15, 4.4, z0 + 10], [0.12, 1.4, 0.35]);
  W.points.push({ pos: [x0 - 0.8, 4.4, z0 + 10], radius: 12, color: [0.3, 1, 0.4], intensity: 0, fn: t => (Math.sin(t * 19) + Math.sin(t * 3.7) > -1.2 ? 2.5 : 0.3) });
  W.props.pharmacyDoor = [x0 - 1.5, 0, z1 - 3]; W.props.pharmacyWindow = [x0 - 1.5, 0, z0 + 10]; W.props.survivor = [x0 + 3.2, 0.12, z0 + 8.6];
}
function medkit(x, z) { const mb = new MB(); const y = groundY(x, z); mb.box([x, y + 0.12, z], [0.4, 0.24, 0.3], { uvScale: [0.5, 0.5] }); const d = { mesh: mb.build(), mat: MATS.medkit, model: M4.create(), kind: 'med', pos: [x, y, z] }; const cm = new MB(); cm.box([x, y + 0.245, z], [0.18, 0.01, 0.06]); cm.box([x, y + 0.245, z], [0.06, 0.01, 0.18]); d.extra = { mesh: cm.build(), mat: MATS.medCross, model: M4.create() }; return d; }
function ammobox(x, z) { const mb = new MB(); const y = groundY(x, z); mb.box([x, y + 0.14, z], [0.5, 0.28, 0.3], { uvScale: [0.5, 0.5] }); const d = { mesh: mb.build(), mat: MATS.ammoBox, model: M4.create(), kind: 'ammo', pos: [x, y, z] }; const cm = new MB(); cm.box([x, y + 0.2, z - 0.151], [0.4, 0.04, 0.01]); cm.box([x, y + 0.2, z + 0.151], [0.4, 0.04, 0.01]); d.extra = { mesh: cm.build(), mat: MATS.ammoTape, model: M4.create() }; return d; }

/* ---- layout ---- */
function buildWorld() {
  // ground base (asphalt everywhere under everything)
  groundPlane('asphalt', -120, 120, -160, 120, -0.02);
  roadZ(-8, 8, -104, 84); roadX(-80, -8, -26, -10); roadX(8, 80, -26, -10);
  // intersection patch uses roadZ segment already (main road covers it)
  sidewalk(-12, -8, -10, 84); sidewalk(8, 12, -10, 84); sidewalk(-12, -8, -70, -26); sidewalk(8, 12, -70, -26);
  sidewalk(-80, -12, -30, -26); sidewalk(12, 80, -30, -26); sidewalk(-80, -12, -10, -6); sidewalk(12, 80, -10, -6);
  plaza(-34, 34, -104, -70);
  // ----- buildings: east strip south block (x 12..36, z -6..84)
  const strips = [
    { side: 1, x0: 12, x1: 36, from: -6, to: 84, faces: ['w'] }, { side: -1, x0: -36, x1: -12, from: -6, to: 84, faces: ['e'] },
    { side: -1, x0: -36, x1: -12, from: -70, to: -30, faces: ['e'] },
  ];
  for (const st of strips) {
    let z = st.from; let first = true;
    while (z < st.to - 8) {
      const w = Math.min([12, 16, 20, 24][Math.floor(wr(0, 4))], st.to - z); const h = [10.8, 14.4, 18, 21.6, 25.2][Math.floor(wr(0, 5))];
      const type = wrng() < 0.5 ? 'brick' : 'plaster';
      building(st.x0, st.x1, z, z + w, h, type, { faces: st.faces });
      z += w;
      if (!first || true) { if (wrng() < 0.55 && z < st.to - 12) { // alley
          alleyFloor(st.x0, st.x1, z, z + 4); const ax = st.side > 0 ? st.x1 : st.x0; fence(st.side > 0 ? st.x1 : st.x0, z, st.side > 0 ? st.x1 : st.x0, z + 4);
          dumpster(st.side > 0 ? st.x1 - 3 : st.x0 + 3, z + 2, st.side > 0 ? 0 : PI); trashbags(st.side > 0 ? st.x0 + 3 : st.x1 - 3, z + 2, 3);
          W.spawns.push({ pos: [st.side > 0 ? st.x1 - 6 : st.x0 + 6, 0.12, z + 2], tag: 'alley' });
          z += 4; } }
      first = false;
    }
  }
  // ----- pharmacy block (NE corner): x 12..36, z -30..-70
  pharmacy(12, 36, -50, -30, 14.4);
  alleyFloor(12, 36, -54, -50); fence(36, -54, 36, -50); generator(30, -52); trashbags(16, -52, 2); W.spawns.push({ pos: [33, 0.12, -52], tag: 'alley' });
  building(12, 36, -70, -54, 18, 'brick', { faces: ['w'] });
  // ----- cross street strips (north side z -30..-54 and south z -6..18) for |x| in 36..80
  for (const side of [1, -1]) {
    let x = 36;
    while (x < 76) { const w = Math.min([12, 16, 20][Math.floor(wr(0, 3))], 80 - x); const h = [10.8, 14.4, 18, 21.6][Math.floor(wr(0, 4))]; const t = wrng() < 0.5 ? 'brick' : 'plaster';
      const x0 = side > 0 ? x : -x - w, x1 = side > 0 ? x + w : -x;
      building(x0, x1, -54, -30, h, t, { faces: ['s'] }); building(x0, x1, -6, 18, [10.8, 14.4, 18][Math.floor(wr(0, 3))], wrng() < 0.5 ? 'brick' : 'plaster', { faces: ['n'] }); x += w;
      if (wrng() < 0.5 && x < 72) { const ax0 = side > 0 ? x : -x - 4, ax1 = side > 0 ? x + 4 : -x; alleyFloor(ax0, ax1, -54, -30); fence(ax0, -54, ax1, -54); alleyFloor(ax0, ax1, -6, 18); fence(ax0, 18, ax1, 18); W.spawns.push({ pos: [(ax0 + ax1) / 2, 0.12, -40], tag: 'cross' }); x += 4; } }
  }
  // backdrop rows (no colliders): behind first rows and around the plaza
  for (let z = -6; z < 84; z += 24) { building(40, 64, z, z + 20, [21.6, 25.2, 28.8, 32.4][Math.floor(wr(0, 4))], wrng() < 0.5 ? 'brick' : 'plaster', { noCollide: true, faces: ['w'], litProb: 0.05 }); building(-64, -40, z, z + 20, [21.6, 25.2, 28.8][Math.floor(wr(0, 3))], wrng() < 0.5 ? 'brick' : 'plaster', { noCollide: true, faces: ['e'], litProb: 0.05 }); }
  for (let z = -100; z < -30; z += 24) { building(40, 64, z, z + 20, [21.6, 25.2, 28.8][Math.floor(wr(0, 3))], 'plaster', { noCollide: true, faces: ['w'], litProb: 0.05 }); building(-64, -40, z, z + 20, [21.6, 28.8][Math.floor(wr(0, 2))], 'brick', { noCollide: true, faces: ['e'], litProb: 0.05 }); }
  // plaza surroundings
  building(-36, -12, -104, -74, 21.6, 'brick', { faces: ['e', 'n'] }); building(36, 60, -104, -74, 25.2, 'plaster', { faces: ['w'] });
  building(-40, 40, -130, -106, 36, 'plaster', { faces: ['s'], litProb: 0.12 }); building(-80, -42, -130, -100, 28.8, 'brick', { noCollide: true, faces: ['s'] }); building(42, 80, -130, -100, 32.4, 'brick', { noCollide: true, faces: ['s'] });
  fence(-34, -104, 34, -104); fence(-34, -104, -34, -74); fence(34, -104, 34, -74);
  // far south blockade: overturned bus + rubble
  const bus = grp('metalYellow', MATS.metalYellow); bus.box([2, 1.4, 90], [12, 2.8, 2.6], { ry: 0.35, rz: 0.4, uvScale: [2, 2] }); boxCollider([2, 1.5, 90], [12.5, 3, 4], 0.35, 'bus');
  rubble(-6, 88, 3, 14); rubble(9, 86, 2.5, 10); barrier(-4, 84, 0.2); barrier(6, 83, -0.3); fence(-12, 86, -8, 84); fence(8, 84, 12, 86);
  building(-36, 36, 96, 120, 25.2, 'brick', { noCollide: true, faces: ['n'] });
  // boundary colliders
  addCollider([-42, 0, -110], [-36, 30, 96], 'bound'); addCollider([36, 0, -110], [42, 30, 96], 'bound'); addCollider([-42, 0, 92], [42, 30, 100], 'bound'); addCollider([-42, 0, -112], [42, 30, -104], 'bound');
  addCollider([-90, 0, -32], [-80, 30, -4], 'bound'); addCollider([80, 0, -32], [90, 30, -4], 'bound');
  // ----- checkpoint (south)
  humvee(3.5, 66, 0); floodlight(-5.5, 60, 0.15, -0.3); sandbags(-7.5, -1.0, 56, 3); sandbags(1.0, 7.5, 56, 3); barrier(-9.5, 55, 0); barrier(9.5, 55, 0);
  crate(-3, 62, 0.8, 0.3); crate(-3.7, 61.2, 0.5, 0.9, 0.0); crate(-3.2, 62, 0.5, 0.2, 0.8); crate(-6.5, 66, 0.9, -0.2);
  W.props.checkpoint = [0, 0, 60];
  // ----- street furniture
  let ls = 1; for (let z = 76; z > -100; z -= 22) { const side = ls; ls = -ls; const x = side * 10.6; if (z > -26 && z < -10) continue; if (z < -70 && Math.abs(x) < 34) continue; const lit = wrng() < 0.45; lamp(x, z, -side, lit, lit && wrng() < 0.4); }
  for (let z = -72; z > -100; z -= 14) { lamp(-33, z, 1, true, wrng() < 0.3); lamp(33, z, -1, wrng() < 0.6, true); }
  trafficLight(13, -8, PI * 0.5, true); trafficLight(-13, -28, -PI * 0.5, false);
  // cars
  car(-6.3, 40, 0.05, 'metalBlue'); car(6.4, 24, -0.08, 'metalGray'); car(-6.2, 6, 0.02, 'metalRed'); car(10.5, 30, 0.6, 'metalWhite', { smashed: true }); car(6.3, -58, -0.05, 'metalDark'); car(-6.5, -62, 0.1, 'metalBlue');
  car(-5.5, -80, 0.9, 'metalGray'); car(6.3, -46, 0.0, 'metalRed');
  policeCar(-4, -16, 0.55);
  car(7, -34, 2.6, 'metalDark', { smashed: true }); W.props.burningCar = [7, 1.0, -34];
  // rubble & trash along curbs
  for (let i = 0; i < 14; i++) { const side = wrng() < 0.5 ? 1 : -1; const z = wr(-96, 76); if (z > -30 && z < -6) continue; rubble(side * wr(8.6, 11.4), z, wr(0.5, 1.4), Math.floor(wr(3, 8)), groundY(side * 10, z)); }
  for (let i = 0; i < 10; i++) { const side = wrng() < 0.5 ? 1 : -1; trashbags(side * wr(9, 11.5), wr(-96, 76), 3); }
  barrier(-3, 30, 0.1); barrier(3.5, 12, -0.15); barrier(0, -46, 0.3); barrier(-4, -50, 0.0);
  tree(-20, -88); tree(20, -90); tree(-24, -78); tree(26, -80); tree(0, -98);
  // pickups
  W.pickups = [ammobox(-2, 59), ammobox(2.5, 62.5), medkit(-6, 63), ammobox(9.5, 28), ammobox(-9.5, 0), medkit(9.5, -4), ammobox(-9, -40), ammobox(15, -33), medkit(9.6, -58), ammobox(-9.3, -66), ammobox(-6, -76), medkit(6, -86), ammobox(0, -90), ammobox(-14, -84)];
  // spawns
  for (const p of [[0, 0, 80], [-6, 0, 82], [6, 0, 81]]) W.spawns.push({ pos: p, tag: 'south' });
  for (const p of [[-3, 0, -66], [3, 0, -70], [0, 0, -74]]) W.spawns.push({ pos: p, tag: 'north' });
  for (const p of [[-60, 0, -18], [-70, 0, -20], [-66, 0, -14]]) W.spawns.push({ pos: p, tag: 'crossW' });
  for (const p of [[60, 0, -18], [70, 0, -16], [66, 0, -22]]) W.spawns.push({ pos: p, tag: 'crossE' });
  for (const p of [[-30, 0.12, -100], [30, 0.12, -100], [0, 0.12, -102], [-32, 0.12, -76], [32, 0.12, -76]]) W.spawns.push({ pos: p, tag: 'plaza' });
  // LZ floodlights (powered later) on the plaza
  W.props.lz = [0, 0.12, -86]; W.props.lzLights = [];
  for (const [x, z] of [[-10, -78], [10, -78], [-10, -94], [10, -94]]) { const l = { pos: [x, 3.2, z], radius: 22, color: [1, 0.95, 0.85], intensity: 0, fn: t => W.props.power ? 5 : 0 }; W.points.push(l); const mb = grp('metalDark', MATS.metalDark); mb.tube([x, 0.12, z], [x, 3.2, z], [0.05, 0.05], [0.04, 0.04], { segs: 6, rings: 2 }); mb.box([x, 3.3, z], [0.5, 0.35, 0.3]);
    const d = { mesh: null, mat: Object.assign({}, MATS.headlight), model: M4.create(), emissiveFn: t => W.props.power ? [8, 7.5, 6.5] : [0, 0, 0] }; const lm = new MB(); lm.box([x, 3.1, z], [0.45, 0.02, 0.25]); d.mesh = lm.build(); W.dyn.push(d); }
  // strobe at LZ (activated when arriving)
  const sd = { mesh: null, mat: Object.assign({}, MATS.strobeLZ), model: M4.create(), emissiveFn: t => W.props.strobe ? ((t * 2) % 1 < 0.1 ? [12, 1.5, 0.5] : [0.2, 0.02, 0]) : [0, 0, 0] }; const sm = new MB(); sm.box([0, 0.2, -86], [0.14, 0.16, 0.14]); sd.mesh = sm.build(); W.dyn.push(sd);
  W.points.push({ pos: [0, 0.5, -86], radius: 18, color: [1, 0.15, 0.05], intensity: 0, fn: t => W.props.strobe ? ((t * 2) % 1 < 0.1 ? 9 : 0) : 0 });
  // burning car light + police
  W.points.push({ pos: [7, 1.4, -34], radius: 16, color: [1, 0.45, 0.12], intensity: 0, fn: t => 7 + 3 * Math.sin(t * 23.1) * Math.sin(t * 7.3) + 2 * Math.sin(t * 51) });
  // checkpoint lantern light on the crates
  W.points.push({ pos: [-3, 1.5, 62], radius: 10, color: [1, 0.8, 0.5], intensity: 3 });
  // finalize groups into drawables
  for (const k in W.groups) { const g = W.groups[k]; if (!g.mb.n) continue; W.opaque.push({ mesh: g.mb.build(), mat: g.mat, model: M4.create(), twoSided: g.mat.twoSided }); }
  for (const d of W.dyn) W.opaque.push(d);
  buildNav();
}
/* ---- navigation grid (flow field) ---- */
const NAV = { x0: -40, z0: -106, w: 80, h: 194, cell: 1, blocked: null, dist: null, queue: null, dirty: true, lastSrc: [1e9, 1e9] };
function buildNav() {
  const n = NAV.w * NAV.h; NAV.blocked = new Uint8Array(n); NAV.dist = new Int32Array(n); NAV.queue = new Int32Array(n);
  for (const c of W.colliders) {
    if (c.tag === 'bound') { } // include
    const pad = 0.4; const i0 = Math.max(0, Math.floor((c.mn[0] - pad - NAV.x0) / NAV.cell)), i1 = Math.min(NAV.w - 1, Math.floor((c.mx[0] + pad - NAV.x0) / NAV.cell));
    const j0 = Math.max(0, Math.floor((c.mn[2] - pad - NAV.z0) / NAV.cell)), j1 = Math.min(NAV.h - 1, Math.floor((c.mx[2] + pad - NAV.z0) / NAV.cell));
    if (c.mn[1] > 1.6) continue; // overhead
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) NAV.blocked[j * NAV.w + i] = 1;
  }
}
function navIndex(x, z) { const i = Math.floor((x - NAV.x0) / NAV.cell), j = Math.floor((z - NAV.z0) / NAV.cell); if (i < 0 || j < 0 || i >= NAV.w || j >= NAV.h) return -1; return j * NAV.w + i; }
function navUpdate(px, pz) {
  const src = navIndex(px, pz); if (src < 0) return;
  const D = NAV.dist, Q = NAV.queue, Bk = NAV.blocked, w = NAV.w, h = NAV.h; D.fill(-1);
  let qh = 0, qt = 0; Q[qt++] = src; D[src] = 0;
  while (qh < qt) { const c = Q[qh++]; const d = D[c] + 1; const ci = c % w, cj = (c - ci) / w;
    if (ci > 0) { const n = c - 1; if (D[n] < 0 && !Bk[n]) { D[n] = d; Q[qt++] = n; } }
    if (ci < w - 1) { const n = c + 1; if (D[n] < 0 && !Bk[n]) { D[n] = d; Q[qt++] = n; } }
    if (cj > 0) { const n = c - w; if (D[n] < 0 && !Bk[n]) { D[n] = d; Q[qt++] = n; } }
    if (cj < h - 1) { const n = c + w; if (D[n] < 0 && !Bk[n]) { D[n] = d; Q[qt++] = n; } } }
}
// best direction from (x,z) toward the source; returns [dx,dz] normalized or null
function navDir(x, z, out) {
  const c = navIndex(x, z); if (c < 0) return null; const w = NAV.w, D = NAV.dist, Bk = NAV.blocked; const ci = c % w, cj = (c - ci) / w;
  let best = D[c] < 0 ? 1e9 : D[c], bi = -1, bj = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= w || nj >= NAV.h) continue; const n = nj * w + ni; if (Bk[n] || D[n] < 0) continue;
    if (di && dj && (Bk[cj * w + ni] || Bk[nj * w + ci])) continue; // no corner cutting
    const cost = D[n] + (di && dj ? 0.41 : 0); if (cost < best) { best = cost; bi = di; bj = dj; } }
  if (bi === -1 && bj === 0) return null;
  const cx = NAV.x0 + (ci + bi + 0.5) * NAV.cell, cz = NAV.z0 + (cj + bj + 0.5) * NAV.cell; const dx = cx - x, dz = cz - z, l = Math.hypot(dx, dz) || 1; out[0] = dx / l; out[1] = dz / l; return out;
}
/* ---- collision helpers ---- */
// push a circle (x,z,r) out of colliders; returns [x,z]; y is the entity foot height (colliders above head ignored)
function resolveCircle(x, z, r, y = 0) {
  for (const c of W.colliders) {
    if (c.mn[1] > y + 1.5 || c.mx[1] < y + 0.05) continue;
    const cx = clamp(x, c.mn[0], c.mx[0]), cz = clamp(z, c.mn[2], c.mx[2]); let dx = x - cx, dz = z - cz; const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 < 1e-8) { // inside: push out along the smallest axis
        const px = Math.min(x - c.mn[0], c.mx[0] - x), pz = Math.min(z - c.mn[2], c.mx[2] - z);
        if (px < pz) x += (x - c.mn[0] < c.mx[0] - x ? -(px + r) : (px + r)); else z += (z - c.mn[2] < c.mx[2] - z ? -(pz + r) : (pz + r));
      } else { const d = Math.sqrt(d2); x = cx + dx / d * r; z = cz + dz / d * r; }
    }
  }
  return [x, z];
}
function raycastWorld(ro, rd, maxT) { let best = maxT, hit = null; for (const c of W.colliders) { if (c.tag === 'bound') continue; const t = rayAABB(ro, rd, c.mn, c.mx); if (t >= 0 && t < best) { best = t; hit = c; } }
  // ground
  if (rd[1] < -1e-6) { const t = (0.0 - ro[1]) / rd[1]; if (t > 0 && t < best) { best = t; hit = { tag: 'ground' }; } }
  if (!hit) return null; const p = V3.addScaled([], ro, rd, best); let n = [0, 1, 0];
  if (hit.tag !== 'ground') { // face normal from the closest face
    const e = 0.02; if (Math.abs(p[0] - hit.mn[0]) < e) n = [-1, 0, 0]; else if (Math.abs(p[0] - hit.mx[0]) < e) n = [1, 0, 0]; else if (Math.abs(p[2] - hit.mn[2]) < e) n = [0, 0, -1]; else if (Math.abs(p[2] - hit.mx[2]) < e) n = [0, 0, 1]; else if (Math.abs(p[1] - hit.mx[1]) < e) n = [0, 1, 0]; else n = [0, -1, 0]; }
  return { t: best, p, n, tag: hit.tag };
}
function lineOfSightXZ(x0, z0, x1, z1) { for (const c of W.colliders) { if (c.mn[1] > 1.5 || c.tag === 'bound') continue; if (segHitsBoxXZ(x0, z0, x1, z1, c.mn, c.mx)) return false; } return true; }
