// Render the procedural WebAudio sounds to WAV files with an OfflineAudioContext.
// usage: NODE_PATH=/path/to/global/node_modules node tools/export_sounds.js
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const SOUNDS = [
  ['gunshot_pistol', "A.gunshot('pistol')", 1.2], ['gunshot_rifle', "A.gunshot('rifle')", 1.2], ['gunshot_shotgun', "A.gunshot('shotgun')", 1.6],
  ['reload_mag_out', 'A.click(1400, 0.3, null, 0.03)', 0.4], ['reload_mag_in', 'A.click(2200, 0.3, null, 0.02)', 0.4], ['reload_bolt', 'A.click(2600, 0.35, null, 0.02)', 0.4], ['pump', 'A.click(1200, 0.35, null, 0.04)', 0.5], ['dry_fire', 'A.dryFire()', 0.3],
  ['footstep_wet', 'A.footstep(null, 1, 0.6, false)', 0.5], ['footstep_run', 'A.footstep(null, 1, 0.8, true)', 0.5],
  ['zombie_groan', 'A.groan(null, 0, 1)', 2.5], ['zombie_groan_deep', 'A.groan(null, 1, 1)', 2.5], ['zombie_screech', 'A.groan(null, 2, 1)', 1.5], ['zombie_death', 'A.deathGurgle(null)', 1.3],
  ['impact_concrete', "A.impact('concrete', null)", 0.4], ['impact_metal', "A.impact('metal', null)", 0.6], ['impact_flesh', "A.impact('flesh', null)", 0.4],
  ['player_hurt', 'A.playerHurt()', 2.0], ['hitmarker', 'A.hitmarker(false)', 0.2], ['hitmarker_head', 'A.hitmarker(true)', 0.2], ['pickup', 'A.tone(700, 0.2, 0.08); A.tone(1050, 0.2, 0.1)', 0.4], ['ui_click', 'A.ui()', 0.2],
  ['radio_open', 'A.radio(true)', 0.5], ['thunder', 'A.thunder(0, 0.9)', 4.5], ['heartbeat', 'A.heartbeat(0.6)', 0.6], ['whoosh', 'A.whoosh(0.6)', 0.9], ['stinger', 'A.stinger(0.6)', 5.0],
  ['generator_start', 'A.generatorStart(null)', 3.5], ['helicopter_loop', 'const h = A.heli(); h.gain.gain.value = 1.0', 6.0],
  ['ambience_rain_wind', 'A.setAmbience({ rain: 1, wind: 1 })', 6.0], ['ambience_fire', 'A.setAmbience({ fire: 0.35 })', 4.0], ['music_drone', 'A.setMusic(0.7, true)', 8.0],
];
(async () => {
  const outDir = path.resolve(__dirname, '..', 'assets', 'sounds'); fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } }); page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.addInitScript(cfg => localStorage.setItem('magellan.settings', cfg), JSON.stringify({ preset: 'low', scale: 0.4, shadows: 0, ssao: 0, bloom: 0, mblur: 0, vol: 0, fxaa: 0, tex: 512, rain: 0, zombies: 8, dynres: 0 }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Camera ready'), null, { timeout: 120000 });
  for (const [name, code, dur] of SOUNDS) {
    const b64 = await page.evaluate(async ([code, dur]) => {
      const sr = 44100; const off = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
      A.ctx = null; A.ok = false; A.voices = { groan: 0, shot: 0 }; window.AudioContext = function () { return off; }; A.init();
      A.listener.pos = [0, 1.6, 0]; A.listener.right = [1, 0, 0];
      new Function('A', code)(A);
      const buf = await off.startRendering();
      const n = buf.length, ch = buf.numberOfChannels; const wav = new DataView(new ArrayBuffer(44 + n * ch * 2)); let p = 0;
      const str = s => { for (let i = 0; i < s.length; i++) wav.setUint8(p++, s.charCodeAt(i)); }; const u32 = v => { wav.setUint32(p, v, true); p += 4; }; const u16 = v => { wav.setUint16(p, v, true); p += 2; };
      str('RIFF'); u32(36 + n * ch * 2); str('WAVE'); str('fmt '); u32(16); u16(1); u16(ch); u32(sr); u32(sr * ch * 2); u16(ch * 2); u16(16); str('data'); u32(n * ch * 2);
      const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c)); let peak = 0; for (let c = 0; c < ch; c++) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(chans[c][i]));
      const g = peak > 0 ? 0.9 / peak : 1; // normalize peak to -0.9 dBFS
      for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, chans[c][i] * g)); wav.setInt16(p, v < 0 ? v * 32768 : v * 32767, true); p += 2; }
      let s = ''; const bytes = new Uint8Array(wav.buffer); for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s);
    }, [code, dur]);
    const file = path.join(outDir, name + '.wav'); fs.writeFileSync(file, Buffer.from(b64, 'base64')); console.log('wrote', path.basename(file), (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
  }
  await browser.close(); console.log('done:', SOUNDS.length, 'sounds');
})();
