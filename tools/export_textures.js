// Bake the GPU-generated textures to PNG files (albedo+AO and normal+roughness+metal per material).
// usage: NODE_PATH=/path/to/global/node_modules node tools/export_textures.js [texSize]
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const size = +(process.argv[2] || 1024); const outDir = path.resolve(__dirname, '..', 'assets', 'textures'); fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.addInitScript(cfg => localStorage.setItem('magellan.settings', cfg), JSON.stringify({ preset: 'low', scale: 0.5, shadows: 0, ssao: 0, bloom: 0, mblur: 0, vol: 0, fxaa: 0, tex: size, rain: 0, zombies: 8, dynres: 0 }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Camera ready'), null, { timeout: 120000 });
  const names = await page.evaluate(() => Object.keys(TEX));
  // read back a texture level 0 as RGBA bytes (Y flipped to image order)
  const readTex = `(function(name, kind){ const def = TEX_DEFS.find(d => d[0] === name); const sz = texSizeFor(name, def[1]);
      const tex = TEX[name][kind]; const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const px = new Uint8Array(sz * sz * 4); gl.readPixels(0, 0, sz, sz, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb);
      const out = new Uint8ClampedArray(sz * sz * 4); for (let y = 0; y < sz; y++) out.set(px.subarray((sz - 1 - y) * sz * 4, (sz - y) * sz * 4), y * sz * 4); return { sz, out }; })`;
  const toPng = `(function(sz, data){ const c = document.createElement('canvas'); c.width = sz; c.height = sz; const ctx = c.getContext('2d'); const img = ctx.createImageData(sz, sz); img.data.set(data); ctx.putImageData(img, 0, 0); return c.toDataURL('image/png'); })`;
  const save = (file, dataUrl) => { fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64')); console.log('wrote', path.basename(file), (fs.statSync(file).size / 1024).toFixed(0) + ' KB'); };
  for (const name of names) {
    const urls = await page.evaluate(([name, readTex, toPng]) => {
      const read = eval(readTex), png = eval(toPng); const a = read(name, 'alb'), n = read(name, 'nrm'); const sz = a.sz; const N = sz * sz;
      const rgb = (src, fn) => { const d = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const o = i * 4; const v = fn(src, o); d[o] = v[0]; d[o + 1] = v[1]; d[o + 2] = v[2]; d[o + 3] = 255; } return d; };
      return {
        albedo: png(sz, rgb(a.out, (s, o) => [s[o], s[o + 1], s[o + 2]])),
        ao_alpha: png(sz, rgb(a.out, (s, o) => [s[o + 3], s[o + 3], s[o + 3]])),
        normal: png(sz, rgb(n.out, (s, o) => [s[o], s[o + 1], 255])),            // tangent-space XY (OpenGL convention), Z reconstructed
        roughness: png(sz, rgb(n.out, (s, o) => [s[o + 2], s[o + 2], s[o + 2]])),
        metallic: png(sz, rgb(n.out, (s, o) => [s[o + 3], s[o + 3], s[o + 3]])),
      };
    }, [name, readTex, toPng]);
    for (const k of Object.keys(urls)) save(path.join(outDir, name + '_' + k + '.png'), urls[k]);
  }
  await browser.close(); console.log('done:', names.length, 'materials');
})();
