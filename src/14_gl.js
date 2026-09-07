/* ============================================================
   WebGL2 helper layer
   ============================================================ */
const canvas = $('gl');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false, desynchronized: true });
const GL_OK = !!gl;
const EXT = GL_OK ? {
  cbf: gl.getExtension('EXT_color_buffer_float'),
  cbhf: gl.getExtension('EXT_color_buffer_half_float'),
  aniso: gl.getExtension('EXT_texture_filter_anisotropic'),
  floatLinear: gl.getExtension('OES_texture_float_linear'),
} : {};
const HDR_FORMAT = GL_OK ? ((EXT.cbf || EXT.cbhf) ? gl.RGBA16F : gl.RGBA8) : 0;
const HDR_TYPE = GL_OK ? ((EXT.cbf || EXT.cbhf) ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE) : 0;
const HAS_HDR = GL_OK && HDR_FORMAT === gl.RGBA16F;

function compileShader(type, src, name) {
  const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    const lines = src.split('\n');
    const m = /ERROR: \d+:(\d+)/.exec(log); const ln = m ? +m[1] : 0;
    console.error('Shader compile error in ' + name + ':\n' + log + '\n' + lines.slice(Math.max(0, ln - 4), ln + 3).map((l, i) => (Math.max(0, ln - 4) + i + 1) + ': ' + l).join('\n'));
    throw new Error('shader ' + name);
  }
  return sh;
}
function makeProgram(name, vsSrc, fsSrc, defines = '') {
  const head = '#version 300 es\n' + defines + '\n';
  const fhead = head + 'precision highp float;\nprecision highp int;\nprecision highp sampler2D;\nprecision highp sampler2DShadow;\n';
  const vs = compileShader(gl.VERTEX_SHADER, head + vsSrc, name + '.vs'), fs = compileShader(gl.FRAGMENT_SHADER, fhead + fsSrc, name + '.fs');
  const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error('Link error ' + name + ': ' + gl.getProgramInfoLog(p)); throw new Error('link ' + name); }
  gl.deleteShader(vs); gl.deleteShader(fs);
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const nm = info.name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(p, info.name); }
  return { p, u, name };
}
let curProg = null;
function useProg(pr) { if (curProg !== pr) { gl.useProgram(pr.p); curProg = pr; } return pr; }
function bindTex(unit, tex, target = gl.TEXTURE_2D) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target, tex); }

function createTex(w, h, opts = {}) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  const ifmt = opts.ifmt || gl.RGBA8, fmt = opts.fmt || gl.RGBA, type = opts.type || gl.UNSIGNED_BYTE;
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, opts.data || null);
  const filt = opts.filter === undefined ? gl.LINEAR : opts.filter;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.mipmap ? gl.LINEAR_MIPMAP_LINEAR : filt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
  const wrap = opts.wrap || gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  if (opts.compare) { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL); }
  if (opts.mipmap) gl.generateMipmap(gl.TEXTURE_2D);
  if (opts.aniso && EXT.aniso) gl.texParameterf(gl.TEXTURE_2D, EXT.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(EXT.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  return t;
}
// framebuffer with N color textures (+ optional depth texture / renderbuffer)
function createFBO(w, h, colors, depth) {
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const bufs = [];
  colors.forEach((t, i) => { gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0); bufs.push(gl.COLOR_ATTACHMENT0 + i); });
  if (depth) {
    if (depth.rb) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth.rb);
    else gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth.tex, 0);
  }
  gl.drawBuffers(bufs.length ? bufs : [gl.NONE]);
  if (!bufs.length) gl.readBuffer(gl.NONE);
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (st !== gl.FRAMEBUFFER_COMPLETE) console.error('FBO incomplete', st.toString(16), w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, w, h, colors, depth };
}
function createDepthRB(w, h) { const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h); return { rb }; }
function deleteFBO(f) { if (!f) return; gl.deleteFramebuffer(f.fb); f.colors.forEach(t => gl.deleteTexture(t)); if (f.depth) { if (f.depth.rb && f.depth.own) gl.deleteRenderbuffer(f.depth.rb); if (f.depth.tex) gl.deleteTexture(f.depth.tex); } }

// vertex layout: pos3 nrm3 uv2 tan4 bone4 = 16 floats
const VSTRIDE = 16 * 4;
function createMesh(verts, indices, dynamic) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, verts, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  const attrs = [[0, 3, 0], [1, 3, 12], [2, 2, 24], [3, 4, 32], [4, 4, 48]];
  for (const [loc, size, off] of attrs) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, VSTRIDE, off); }
  gl.bindVertexArray(null);
  return { vao, vb, ib, count: indices.length, itype: indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
}
function drawMesh(m) { gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, m.itype, 0); }

// full-screen triangle
let fsVao = null;
function drawFullscreen() {
  if (!fsVao) { fsVao = gl.createVertexArray(); gl.bindVertexArray(fsVao); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); }
  gl.bindVertexArray(fsVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
}
