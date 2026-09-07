/* ============================================================
   Renderer: passes, targets, lights, post chain
   ============================================================ */
const R = {
  progs: {}, w: 0, h: 0, cw: 0, ch: 0, scale: 1, dyn: 1, dynTimer: 0, frameEMA: 16,
  fbo: {}, shadow: {}, lum: [null, null], lumIdx: 0,
  view: M4.create(), proj: M4.create(), vp: M4.create(), invVP: M4.create(), prevVP: M4.create(), camWorld: M4.create(), projVM: M4.create(), vpVM: M4.create(),
  camPos: [0, 1.6, 0], camFwd: [0, 0, -1], fov: 96, near: 0.05, far: 600, aspect: 1.77,
  moonVP: M4.create(), flashVP: M4.create(), moonDir: [0.35, 0.55, -0.45], moonColor: [0.22, 0.27, 0.36], skyColor: [0.055, 0.07, 0.10], groundColor: [0.02, 0.019, 0.017],
  fog: [0.022, 0.026, 0.034, 0.02], wet: 1.0, lightning: 0, time: 0,
  flash: { on: 0, pos: [0, 0, 0], dir: [0, 0, -1], cosOuter: Math.cos(deg(24)), cosInner: Math.cos(deg(9)), intensity: 42, range: 40, color: [1.0, 0.95, 0.85], shadow: 1 },
  pointLights: [], spotLights: [], // per-frame lists {pos, radius, color, intensity} / {pos, dir, range, cosOuter, cosInner, color}
  pointArr: new Float32Array(40), pointColArr: new Float32Array(40), spotPosArr: new Float32Array(16), spotDirArr: new Float32Array(16), spotColArr: new Float32Array(16), nPoint: 0, nSpot: 0,
  exposure: 1.0, fx: { damage: 0, glitch: 0, static: 0, fade: 1, droplets: 0, flash: 0, blood: 0 }, flashGlow: 0,
  ssaoKernel: null, drawCalls: 0,
};
R.init = function () {
  const P = R.progs;
  P.mesh = makeProgram('mesh', VS_MESH, FS_MESH); P.meshSkin = makeProgram('meshSkin', VS_MESH, FS_MESH, '#define SKINNED');
  P.meshAlpha = makeProgram('meshAlpha', VS_MESH, FS_MESH, '#define ALPHA'); P.meshCut = makeProgram('meshCut', VS_MESH, FS_MESH, '#define ALPHA\n#define CUTOUT');
  P.shadow = makeProgram('shadow', VS_SHADOW, FS_SHADOW); P.shadowSkin = makeProgram('shadowSkin', VS_SHADOW, FS_SHADOW, '#define SKINNED');
  P.sky = makeProgram('sky', VS_FS, FS_SKY); P.part = makeProgram('part', VS_PART, FS_PART); P.rain = makeProgram('rain', VS_RAIN, FS_RAIN);
  P.ssao = makeProgram('ssao', VS_FS, FS_SSAO); P.blur = makeProgram('blur', VS_FS, FS_BLUR4); P.pre = makeProgram('pre', VS_FS, FS_BLOOM_PRE); P.down = makeProgram('down', VS_FS, FS_DOWN); P.up = makeProgram('up', VS_FS, FS_UP);
  P.vol = makeProgram('vol', VS_FS, FS_VOL); P.lum = makeProgram('lum', VS_FS, FS_LUM); P.resolve = makeProgram('resolve', VS_FS, FS_RESOLVE); P.fxaa = makeProgram('fxaa', VS_FS, FS_FXAA); P.lens = makeProgram('lens', VS_FS, FS_LENS);
  // fixed texture units for mesh programs
  for (const pr of [P.mesh, P.meshSkin, P.meshAlpha, P.meshCut]) { useProg(pr); gl.uniform1i(pr.u.uAlbedo, 0); gl.uniform1i(pr.u.uNormalRM, 1); gl.uniform1i(pr.u.uMoonShadow, 2); gl.uniform1i(pr.u.uFlashShadow, 3); }
  useProg(P.part); gl.uniform1i(P.part.u.uSprite, 0); gl.uniform1i(P.part.u.uND, 1);
  useProg(P.ssao); gl.uniform1i(P.ssao.u.uND, 0);
  const kern = new Float32Array(48); const rng = mulberry(7);
  for (let i = 0; i < 16; i++) { let v = [rng() * 2 - 1, rng() * 2 - 1, rng()]; V3.norm(v, v); let s = (i + 1) / 16; s = lerp(0.1, 1.0, s * s); V3.scale(v, v, s * rng()); kern.set(v, i * 3); }
  gl.uniform3fv(P.ssao.u.uSamples, kern);
  useProg(P.vol); gl.uniform1i(P.vol.u.uND, 0); gl.uniform1i(P.vol.u.uFlashShadow, 1);
  useProg(P.resolve); ['uScene', 'uBloom', 'uAO', 'uVol', 'uND', 'uLum'].forEach((n, i) => gl.uniform1i(P.resolve.u[n], i));
  useProg(P.lens); gl.uniform1i(P.lens.u.uTex, 0); gl.uniform1i(P.lens.u.uDirt, 1); gl.uniform1i(P.lens.u.uLum, 2);
  useProg(P.up); gl.uniform1i(P.up.u.uTex, 0); gl.uniform1i(P.up.u.uPrev, 1);
  useProg(P.lum); gl.uniform1i(P.lum.u.uTex, 0); gl.uniform1i(P.lum.u.uPrev, 1);
  for (let i = 0; i < 2; i++) { const t = createTex(1, 1, { ifmt: HDR_FORMAT, type: HDR_TYPE, filter: gl.NEAREST }); R.lum[i] = createFBO(1, 1, [t], null); }
  R.partVAO = R.makeQuadInstVAO();
  R.rainVAO = R.makeQuadVAO();
  R.resize(true);
  R.createShadowMaps();
};
R.makeQuadVAO = function () {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.bindVertexArray(null); return vao;
};
R.makeQuadInstVAO = function () {
  const vao = R.makeQuadVAO(); gl.bindVertexArray(vao);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, PARTICLE_MAX * 16 * 4, gl.DYNAMIC_DRAW);
  for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(1 + i); gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, 64, i * 16); gl.vertexAttribDivisor(1 + i, 1); }
  gl.bindVertexArray(null); R.partIB = ib; return vao;
};
R.createShadowMaps = function () {
  for (const k of ['moon', 'flash']) if (R.shadow[k]) { gl.deleteTexture(R.shadow[k].tex); gl.deleteFramebuffer(R.shadow[k].fbo.fb); R.shadow[k] = null; }
  const lvl = S.shadows; if (lvl <= 0) return;
  const moonSize = SHADOW_SIZES[Math.min(lvl, 4)], flashSize = SHADOW_SIZES[Math.min(Math.max(lvl, 1), 3)];
  for (const [k, size] of [['moon', moonSize], ['flash', flashSize]]) {
    const tex = createTex(size, size, { ifmt: gl.DEPTH_COMPONENT24, fmt: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT, filter: gl.LINEAR, compare: true });
    const fbo = createFBO(size, size, [], { tex }); R.shadow[k] = { tex, fbo, size };
  }
};
R.resize = function (force) {
  const dpr = Math.min(window.devicePixelRatio || 1, S.dprCap || 2);
  const cw = Math.max(320, Math.floor(window.innerWidth * dpr)), ch = Math.max(200, Math.floor(window.innerHeight * dpr));
  const scale = clamp(S.scale * R.dyn, 0.35, 1.0);
  const w = Math.max(160, Math.floor(cw * scale)), h = Math.max(100, Math.floor(ch * scale));
  if (!force && cw === R.cw && ch === R.ch && w === R.w && h === R.h) return;
  canvas.width = cw; canvas.height = ch; R.cw = cw; R.ch = ch; R.w = w; R.h = h; R.aspect = cw / ch;
  const F = R.fbo; for (const k in F) { if (Array.isArray(F[k])) F[k].forEach(deleteFBO); else deleteFBO(F[k]); }
  const depth = createDepthRB(w, h); depth.own = true;
  const colorTex = createTex(w, h, { ifmt: HDR_FORMAT, type: HDR_TYPE });
  const ndTex = createTex(w, h, { ifmt: HAS_HDR ? gl.RGBA16F : gl.RGBA8, type: HAS_HDR ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, filter: gl.NEAREST });
  F.main = createFBO(w, h, [colorTex, ndTex], depth);
  F.trans = createFBO(w, h, [colorTex], { rb: depth.rb }); F.trans.colors = []; // shares color/depth; don't double-delete
  const hw = Math.max(80, w >> 1), hh = Math.max(50, h >> 1);
  F.ssao = createFBO(hw, hh, [createTex(hw, hh, { ifmt: gl.R8, fmt: gl.RED })], null);
  F.ssaoBlur = createFBO(hw, hh, [createTex(hw, hh, { ifmt: gl.R8, fmt: gl.RED })], null);
  F.bloom = []; let bw = hw, bh = hh;
  for (let i = 0; i < 5; i++) { F.bloom.push(createFBO(bw, bh, [createTex(bw, bh, { ifmt: HDR_FORMAT, type: HDR_TYPE })], null)); bw = Math.max(8, bw >> 1); bh = Math.max(8, bh >> 1); }
  F.bloomUp = []; bw = hw; bh = hh; for (let i = 0; i < 4; i++) { F.bloomUp.push(createFBO(bw, bh, [createTex(bw, bh, { ifmt: HDR_FORMAT, type: HDR_TYPE })], null)); bw = Math.max(8, bw >> 1); bh = Math.max(8, bh >> 1); }
  F.vol = createFBO(hw, hh, [createTex(hw, hh, { ifmt: HDR_FORMAT, type: HDR_TYPE })], null);
  F.volBlur = createFBO(hw, hh, [createTex(hw, hh, { ifmt: HDR_FORMAT, type: HDR_TYPE })], null);
  F.ldr1 = createFBO(w, h, [createTex(w, h, { ifmt: gl.RGBA8 })], null);
  F.ldr2 = createFBO(w, h, [createTex(w, h, { ifmt: gl.RGBA8 })], null);
  R.black = R.black || createTex(1, 1, { data: new Uint8Array([0, 0, 0, 255]) });
  R.white = R.white || createTex(1, 1, { data: new Uint8Array([255, 255, 255, 255]) });
};
R.applySettings = function () { R.createShadowMaps(); R.resize(true); };
// dynamic resolution: adapt scale to keep ~60 fps (or 30 on weak devices)
R.dynamicRes = function (dt) {
  if (!S.dynres) { if (R.dyn !== 1) { R.dyn = 1; R.resize(); } return; }
  R.frameEMA = lerp(R.frameEMA, dt * 1000, 0.05); R.dynTimer += dt;
  if (R.dynTimer < 1.5) return; R.dynTimer = 0;
  const target = IS_MOBILE ? 30 : 18; let nd = R.dyn;
  if (R.frameEMA > target * 1.25) nd = Math.max(0.5, R.dyn - 0.1); else if (R.frameEMA < target * 0.7) nd = Math.min(1, R.dyn + 0.1);
  if (Math.abs(nd - R.dyn) > 0.01) { R.dyn = nd; R.resize(); }
};

/* ---------- camera & lights ---------- */
R.setCamera = function (pos, yaw, pitch, roll, fov) {
  R.camPos[0] = pos[0]; R.camPos[1] = pos[1]; R.camPos[2] = pos[2]; R.fov = fov;
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const fwd = [-sy * cp, sp, -cy * cp]; V3.copy(R.camFwd, fwd);
  const target = V3.add([], pos, fwd);
  const up = [Math.sin(roll) * cy, Math.cos(roll), -Math.sin(roll) * sy];
  M4.lookAt(R.view, pos, target, up);
  // S.fov is the horizontal field of view; convert to vertical for the projection
  const fovy = 2 * Math.atan(Math.tan(deg(fov) / 2) / Math.max(R.aspect, 1.0));
  R.fovy = fovy; M4.perspective(R.proj, fovy, R.aspect, R.near, R.far);
  M4.mul(R.vp, R.proj, R.view); M4.invert(R.invVP, R.vp); M4.invert(R.camWorld, R.view);
  M4.perspective(R.projVM, 2 * Math.atan(Math.tan(deg(IS_MOBILE ? 80 : 74) / 2) / Math.max(R.aspect, 1.0)), R.aspect, 0.02, 20); M4.mul(R.vpVM, R.projVM, R.view);
};
R.setLights = function (points, spots) {
  // choose up to 10 most relevant point lights by intensity/dist^2
  const cp = R.camPos;
  points.forEach(l => { const d2 = Math.max(1, V3.dist(l.pos, cp) ** 2 - l.radius * l.radius * 0.5); l._score = l.intensity * l.radius / d2; });
  points.sort((a, b) => b._score - a._score);
  R.nPoint = Math.min(10, points.length);
  for (let i = 0; i < R.nPoint; i++) { const l = points[i]; R.pointArr.set([l.pos[0], l.pos[1], l.pos[2], l.radius], i * 4); R.pointColArr.set([l.color[0], l.color[1], l.color[2], l.intensity], i * 4); }
  R.nSpot = Math.min(4, spots.length);
  for (let i = 0; i < R.nSpot; i++) { const l = spots[i]; R.spotPosArr.set([l.pos[0], l.pos[1], l.pos[2], l.range], i * 4); R.spotDirArr.set([l.dir[0], l.dir[1], l.dir[2], l.cosOuter], i * 4); R.spotColArr.set([l.color[0] * l.intensity, l.color[1] * l.intensity, l.color[2] * l.intensity, l.cosInner], i * 4); }
};
R.computeShadowMatrices = function () {
  // moon: ortho box following the camera, snapped to texels
  const size = 70, ms = R.shadow.moon ? R.shadow.moon.size : 1024;
  const center = [R.camPos[0] + R.camFwd[0] * 18, 0, R.camPos[2] + R.camFwd[2] * 18];
  const eye = V3.addScaled([], center, R.moonDir, 120);
  const lv = M4.lookAt(M4.create(), eye, center, [0, 1, 0]);
  // snap
  const c = V3.transformMat4([], lv, [0, 0, 0]); const texel = size * 2 / ms; const sx = Math.round(c[0] / texel) * texel - c[0], sy = Math.round(c[1] / texel) * texel - c[1];
  lv[12] += sx; lv[13] += sy;
  const lp = M4.ortho(M4.create(), -size, size, -size, size, 1, 260);
  M4.mul(R.moonVP, lp, lv);
  // flashlight
  const f = R.flash; const tgt = V3.add([], f.pos, f.dir);
  const up = Math.abs(f.dir[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const fv = M4.lookAt(M4.create(), f.pos, tgt, up); const fp = M4.perspective(M4.create(), Math.acos(f.cosOuter) * 2 + 0.08, 1, 0.12, f.range);
  M4.mul(R.flashVP, fp, fv);
};
/* ---------- per-program shared uniforms ---------- */
R.bindSceneUniforms = function (pr) {
  const u = pr.u;
  gl.uniformMatrix4fv(u.uVP, false, R.vp); gl.uniformMatrix4fv(u.uView, false, R.view);
  if (u.uMoonVP) gl.uniformMatrix4fv(u.uMoonVP, false, R.moonVP); if (u.uFlashVP) gl.uniformMatrix4fv(u.uFlashVP, false, R.flashVP);
  gl.uniform3fv(u.uCamPos, R.camPos);
  if (u.uMoonDir) { gl.uniform3fv(u.uMoonDir, R.moonDir); gl.uniform3fv(u.uMoonColor, R.moonColor); }
  gl.uniform3fv(u.uSkyColor, R.skyColor); if (u.uGroundColor) gl.uniform3fv(u.uGroundColor, R.groundColor);
  const f = R.flash;
  gl.uniform4f(u.uFlashPos, f.pos[0], f.pos[1], f.pos[2], f.on); gl.uniform4f(u.uFlashDir, f.dir[0], f.dir[1], f.dir[2], f.cosOuter);
  gl.uniform4f(u.uFlashParams, f.cosInner, f.intensity * f.on, f.range, R.shadow.flash ? f.shadow : 0); gl.uniform3fv(u.uFlashColor, f.color);
  gl.uniform1i(u.uNumPoint, R.nPoint); gl.uniform4fv(u.uPointPos, R.pointArr); gl.uniform4fv(u.uPointColor, R.pointColArr);
  if (u.uNumSpot) { gl.uniform1i(u.uNumSpot, R.nSpot); gl.uniform4fv(u.uSpotPos, R.spotPosArr); gl.uniform4fv(u.uSpotDir, R.spotDirArr); gl.uniform4fv(u.uSpotColor, R.spotColArr); }
  if (u.uFog) gl.uniform4fv(u.uFog, R.fog); if (u.uWet) gl.uniform1f(u.uWet, R.wet); if (u.uTime) gl.uniform1f(u.uTime, R.time); if (u.uLightning) gl.uniform1f(u.uLightning, R.lightning);
  if (u.uShadowTexel) gl.uniform2f(u.uShadowTexel, R.shadow.moon ? 1 / R.shadow.moon.size : 0, R.shadow.flash ? 1 / R.shadow.flash.size : 0);
  if (u.uMoonShadow) { bindTex(2, R.shadow.moon ? R.shadow.moon.tex : null); bindTex(3, R.shadow.flash ? R.shadow.flash.tex : null); }
};
// material: {tex, tiling, tint, emissive, rough, metal, normalStr, ground, wrap, unlit, alpha, cutout, twoSided, noShadow}
const DEFAULT_MAT = { tex: 'blank', tiling: [1, 1], tint: [1, 1, 1, 1], emissive: [0, 0, 0], rough: 1, metal: 1, normalStr: 1, ground: 0, wrap: 0, unlit: 0 };
function mat(o) { return Object.assign({}, DEFAULT_MAT, o); }
R.bindMaterial = function (pr, m) {
  const u = pr.u, t = TEX[m.tex] || TEX.blank;
  bindTex(0, t.alb); bindTex(1, t.nrm);
  gl.uniform2fv(u.uTiling, m.tiling); gl.uniform4fv(u.uTint, m.tint); gl.uniform3fv(u.uEmissive, m.emissive);
  gl.uniform2f(u.uRoughMetal, m.rough, m.metal); gl.uniform1f(u.uNormalStr, m.normalStr);
  gl.uniform4f(u.uFlags, m.ground, m.wrap, m.unlit, R.shadow.moon ? 1 : 0);
};
// drawables: {mesh, mat, model (Float32Array16), bones (Float32Array|null), castShadow, twoSided, emissiveFn}
R.drawList = function (list, pass) {
  const P = R.progs; let cur = null; let curTwo = false;
  for (const d of list) {
    if (!d.mesh || d.hidden) continue;
    if (pass === 'shadow') { if (d.castShadow === false || d.mat.alpha) continue; const pr = d.bones ? P.shadowSkin : P.shadow; if (cur !== pr) { cur = pr; useProg(pr); gl.uniformMatrix4fv(pr.u.uVP, false, R._shadowVP); }
      gl.uniformMatrix4fv(pr.u.uModel, false, d.model); if (d.bones) gl.uniformMatrix4fv(pr.u.uBones, false, d.bones); drawMesh(d.mesh); R.drawCalls++; continue; }
    const pr = d.mat.cutout ? P.meshCut : d.mat.alpha ? P.meshAlpha : d.bones ? P.meshSkin : P.mesh;
    if (cur !== pr) { cur = pr; useProg(pr); R.bindSceneUniforms(pr); }
    if (d.emissiveFn) d.mat.emissive = d.emissiveFn(R.time);
    R.bindMaterial(pr, d.mat);
    const two = !!(d.twoSided || d.mat.twoSided); if (two !== curTwo) { curTwo = two; if (two) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE); }
    gl.uniformMatrix4fv(pr.u.uModel, false, d.model); if (d.bones) gl.uniformMatrix4fv(pr.u.uBones, false, d.bones);
    drawMesh(d.mesh); R.drawCalls++;
  }
  if (curTwo) gl.enable(gl.CULL_FACE);
};
/* ---------- frame ---------- */
// scene: {opaque: [], viewmodel: [], decals: [], particles: ParticleSystem list, rainCount, drawSky}
R.renderFrame = function (scene, dt) {
  const P = R.progs, F = R.fbo; R.drawCalls = 0;
  gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.depthMask(true);
  R.computeShadowMatrices();
  // shadow passes
  if (R.shadow.moon) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.shadow.moon.fbo.fb); gl.viewport(0, 0, R.shadow.moon.size, R.shadow.moon.size); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 2.0);
    R._shadowVP = R.moonVP; R.drawList(scene.opaque, 'shadow');
    if (R.flash.on && R.shadow.flash) { gl.bindFramebuffer(gl.FRAMEBUFFER, R.shadow.flash.fbo.fb); gl.viewport(0, 0, R.shadow.flash.size, R.shadow.flash.size); gl.clear(gl.DEPTH_BUFFER_BIT); R._shadowVP = R.flashVP; gl.polygonOffset(2.0, 4.0); R.drawList(scene.opaque, 'shadow'); }
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }
  // main opaque pass
  gl.bindFramebuffer(gl.FRAMEBUFFER, F.main.fb); gl.viewport(0, 0, R.w, R.h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  R.drawList(scene.opaque, 'main');
  // sky (after opaque, depth test keeps it behind geometry)
  useProg(P.sky); gl.uniformMatrix4fv(P.sky.u.uInvVP, false, R.invVP); gl.uniform3fv(P.sky.u.uCamPos, R.camPos); gl.uniform3fv(P.sky.u.uMoonDir, R.moonDir); gl.uniform3fv(P.sky.u.uMoonColor, R.moonColor); gl.uniform3fv(P.sky.u.uSkyColor, R.skyColor); gl.uniform4fv(P.sky.u.uFog, R.fog); gl.uniform1f(P.sky.u.uTime, R.time); gl.uniform1f(P.sky.u.uLightning, R.lightning);
  gl.depthMask(false); drawFullscreen(); gl.depthMask(true);
  // viewmodel: clear depth, own projection
  if (scene.viewmodel && scene.viewmodel.length) {
    gl.clear(gl.DEPTH_BUFFER_BIT); const savedVP = R.vp; R.vp = R.vpVM; R.drawList(scene.viewmodel, 'main'); R.vp = savedVP;
  }
  // transparent pass
  gl.bindFramebuffer(gl.FRAMEBUFFER, F.trans.fb); gl.depthMask(false); gl.enable(gl.BLEND);
  if (scene.decals && scene.decals.length) { gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -4); R.drawList(scene.decals, 'main'); gl.disable(gl.POLYGON_OFFSET_FILL); }
  if (scene.particles) for (const ps of scene.particles) R.drawParticles(ps);
  if (scene.rainCount > 0) R.drawRain(scene.rainCount);
  gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.DEPTH_TEST);
  // ---- post ----
  const nd = F.main.colors[1], sceneTex = F.main.colors[0];
  const tanHalfY = Math.tan(R.fovy / 2), tanHalfX = tanHalfY * R.aspect;
  if (S.ssao) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, F.ssao.fb); gl.viewport(0, 0, F.ssao.w, F.ssao.h); useProg(P.ssao); bindTex(0, nd);
    gl.uniform2f(P.ssao.u.uTanHalf, tanHalfX, tanHalfY); gl.uniform1f(P.ssao.u.uRadius, 0.6); gl.uniform1f(P.ssao.u.uStrength, 1.1); drawFullscreen();
    gl.bindFramebuffer(gl.FRAMEBUFFER, F.ssaoBlur.fb); useProg(P.blur); bindTex(0, F.ssao.colors[0]); gl.uniform1i(P.blur.u.uTex, 0); gl.uniform2f(P.blur.u.uTexel, 1 / F.ssao.w, 1 / F.ssao.h); drawFullscreen();
  }
  // bloom
  if (S.bloom) {
    const b = F.bloom; gl.bindFramebuffer(gl.FRAMEBUFFER, b[0].fb); gl.viewport(0, 0, b[0].w, b[0].h); useProg(P.pre); bindTex(0, sceneTex); gl.uniform1i(P.pre.u.uTex, 0); gl.uniform2f(P.pre.u.uTexel, 1 / R.w, 1 / R.h); gl.uniform1f(P.pre.u.uThreshold, 1.4); gl.uniform1f(P.pre.u.uKnee, 0.5); drawFullscreen();
    useProg(P.down); gl.uniform1i(P.down.u.uTex, 0);
    for (let i = 1; i < b.length; i++) { gl.bindFramebuffer(gl.FRAMEBUFFER, b[i].fb); gl.viewport(0, 0, b[i].w, b[i].h); bindTex(0, b[i - 1].colors[0]); gl.uniform2f(P.down.u.uTexel, 1 / b[i - 1].w, 1 / b[i - 1].h); drawFullscreen(); }
    useProg(P.up); let prev = b[b.length - 1];
    for (let i = F.bloomUp.length - 1; i >= 0; i--) { const t = F.bloomUp[i]; gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, t.w, t.h); bindTex(0, prev.colors[0]); bindTex(1, b[i].colors[0]); gl.uniform2f(P.up.u.uTexel, 1 / prev.w, 1 / prev.h); gl.uniform1f(P.up.u.uMix, 1.0); drawFullscreen(); prev = t; }
  }
  // volumetric flashlight
  if (S.vol && R.flash.on && R.shadow.flash) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, F.vol.fb); gl.viewport(0, 0, F.vol.w, F.vol.h); useProg(P.vol); bindTex(0, nd); bindTex(1, R.shadow.flash.tex);
    gl.uniformMatrix4fv(P.vol.u.uFlashVP, false, R.flashVP); gl.uniformMatrix4fv(P.vol.u.uInvVP, false, R.invVP); gl.uniform3fv(P.vol.u.uCamPos, R.camPos); gl.uniform3fv(P.vol.u.uCamFwd, R.camFwd);
    const f = R.flash; gl.uniform4f(P.vol.u.uFlashPos, f.pos[0], f.pos[1], f.pos[2], 1); gl.uniform4f(P.vol.u.uFlashDir, f.dir[0], f.dir[1], f.dir[2], f.cosOuter); gl.uniform4f(P.vol.u.uFlashParams, f.cosInner, f.intensity, f.range, 1); gl.uniform3fv(P.vol.u.uFlashColor, f.color);
    gl.uniform1f(P.vol.u.uTime, R.time); gl.uniform1f(P.vol.u.uDensity, 0.012 + 0.02 * R.wet); drawFullscreen();
    gl.bindFramebuffer(gl.FRAMEBUFFER, F.volBlur.fb); useProg(P.blur); bindTex(0, F.vol.colors[0]); gl.uniform1i(P.blur.u.uTex, 0); gl.uniform2f(P.blur.u.uTexel, 1 / F.vol.w, 1 / F.vol.h); drawFullscreen();
  }
  // auto exposure
  const li = R.lumIdx, lo = 1 - li; gl.bindFramebuffer(gl.FRAMEBUFFER, R.lum[li].fb); gl.viewport(0, 0, 1, 1); useProg(P.lum); bindTex(0, sceneTex); bindTex(1, R.lum[lo].colors[0]);
  gl.uniform1f(P.lum.u.uDt, dt); gl.uniform1f(P.lum.u.uKey, 0.05); gl.uniform1f(P.lum.u.uMin, 0.5); gl.uniform1f(P.lum.u.uMax, 2.0); drawFullscreen(); R.lumIdx = lo;
  // resolve
  gl.bindFramebuffer(gl.FRAMEBUFFER, F.ldr1.fb); gl.viewport(0, 0, R.w, R.h); useProg(P.resolve);
  bindTex(0, sceneTex); bindTex(1, S.bloom ? F.bloomUp[0].colors[0] : R.black); bindTex(2, S.ssao ? F.ssaoBlur.colors[0] : R.white); bindTex(3, (S.vol && R.flash.on && R.shadow.flash) ? F.volBlur.colors[0] : R.black); bindTex(4, nd); bindTex(5, R.lum[li].colors[0]);
  gl.uniformMatrix4fv(P.resolve.u.uPrevVP, false, R.prevVP); gl.uniformMatrix4fv(P.resolve.u.uInvVP, false, R.invVP); gl.uniform3fv(P.resolve.u.uCamPos, R.camPos); gl.uniform3fv(P.resolve.u.uCamFwd, R.camFwd);
  const mb = S.mblur ? clamp(0.9 * (1 / 60) / Math.max(dt, 1 / 240), 0.2, 1.5) : 0;
  gl.uniform4f(P.resolve.u.uParams, S.bloom ? 0.2 : 0, mb, S.ssao ? 1 : 0, (S.vol && R.flash.on && R.shadow.flash) ? 1 : 0);
  gl.uniform1f(P.resolve.u.uExposure, R.exposure); gl.uniform1f(P.resolve.u.uFlashGlow, R.flash.on ? R.flashGlow * (0.5 + R.wet) : 0);
  gl.uniform4f(P.resolve.u.uGrade, 0.82, 1.06, 0.012, 1.0); drawFullscreen();
  let ldr = F.ldr1;
  if (S.fxaa) { gl.bindFramebuffer(gl.FRAMEBUFFER, F.ldr2.fb); useProg(P.fxaa); bindTex(0, ldr.colors[0]); gl.uniform1i(P.fxaa.u.uTex, 0); gl.uniform2f(P.fxaa.u.uTexel, 1 / R.w, 1 / R.h); drawFullscreen(); ldr = F.ldr2; }
  // lens pass to screen
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, R.cw, R.ch); useProg(P.lens); bindTex(0, ldr.colors[0]); bindTex(1, TEX.lensdirt.alb);
  gl.uniform2f(P.lens.u.uRes, R.cw, R.ch); gl.uniform2f(P.lens.u.uTexel, 1 / R.w, 1 / R.h); gl.uniform1f(P.lens.u.uTime, R.time);
  const lf = S.lensfx ? 1 : 0; gl.uniform4f(P.lens.u.uLens, S.fisheye * lf, S.ca * lf, S.grain, S.vignette);
  const fx = R.fx; gl.uniform4f(P.lens.u.uFx, fx.damage, fx.glitch, fx.static, fx.fade);
  gl.uniform4f(P.lens.u.uFx2, fx.droplets * lf, fx.flash, S.sharpen, fx.blood); gl.uniform1f(P.lens.u.uDirtAmt, 0.35 * lf);
  bindTex(2, R.lum[li].colors[0]); drawFullscreen();
  M4.copy(R.prevVP, R.vp);
  gl.enable(gl.DEPTH_TEST);
};
R.drawParticles = function (ps) {
  if (!ps.count) return; const P = R.progs.part; useProg(P);
  gl.uniformMatrix4fv(P.u.uVP, false, R.vp); gl.uniformMatrix4fv(P.u.uView, false, R.view); gl.uniform3fv(P.u.uCamPos, R.camPos);
  gl.uniform3fv(P.u.uSkyColor, R.skyColor); gl.uniform3fv(P.u.uGroundColor, R.groundColor);
  const f = R.flash; gl.uniform4f(P.u.uFlashPos, f.pos[0], f.pos[1], f.pos[2], f.on); gl.uniform4f(P.u.uFlashDir, f.dir[0], f.dir[1], f.dir[2], f.cosOuter); gl.uniform4f(P.u.uFlashParams, f.cosInner, f.intensity * f.on, f.range, 0); gl.uniform3fv(P.u.uFlashColor, f.color);
  gl.uniform1i(P.u.uNumPoint, R.nPoint); gl.uniform4fv(P.u.uPointPos, R.pointArr); gl.uniform4fv(P.u.uPointColor, R.pointColArr);
  bindTex(0, TEX.sprites.alb); bindTex(1, R.fbo.main.colors[1]); gl.uniform2f(P.u.uRes, R.w, R.h); gl.uniform1f(P.u.uSoft, ps.soft || 0.6); gl.uniform4fv(P.u.uFog, R.fog);
  if (ps.additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE); else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindVertexArray(R.partVAO); gl.bindBuffer(gl.ARRAY_BUFFER, R.partIB); gl.bufferSubData(gl.ARRAY_BUFFER, 0, ps.data, 0, ps.count * 16);
  gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, ps.count); R.drawCalls++;
};
R.drawRain = function (count) {
  const P = R.progs.rain; useProg(P); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniformMatrix4fv(P.u.uVP, false, R.vp); gl.uniformMatrix4fv(P.u.uView, false, R.view); gl.uniform3fv(P.u.uCamPos, R.camPos); gl.uniform1f(P.u.uTime, R.time); gl.uniform3f(P.u.uWind, 1.2, 0, 0.4);
  gl.uniform3fv(P.u.uSkyColor, R.skyColor); const f = R.flash; gl.uniform4f(P.u.uFlashPos, f.pos[0], f.pos[1], f.pos[2], f.on); gl.uniform4f(P.u.uFlashDir, f.dir[0], f.dir[1], f.dir[2], f.cosOuter); gl.uniform4f(P.u.uFlashParams, f.cosInner, f.intensity * f.on, f.range, 0); gl.uniform3fv(P.u.uFlashColor, f.color);
  gl.uniform1i(P.u.uNumPoint, R.nPoint); gl.uniform4fv(P.u.uPointPos, R.pointArr); gl.uniform4fv(P.u.uPointColor, R.pointColArr);
  gl.bindVertexArray(R.rainVAO); gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, count); R.drawCalls++;
};
const PARTICLE_MAX = 2048;
