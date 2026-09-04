// usage: node run2.js steps.json [w] [h]; each eval has a 15 s watchdog
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const steps = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const W = +(process.argv[3] || 1280), H = +(process.argv[4] || 720);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning') { if (t.includes('GPU stall')) return; console.log('[console.' + m.type() + ']', t.slice(0, 1500)); } });
  page.on('pageerror', e => { errors.push(e.message); console.log('[pageerror]', e.message, (e.stack || '').split('\n').slice(1, 4).join(' | ')); });
  if (process.env.LOWCFG) await page.addInitScript(cfg => localStorage.setItem('magellan.settings', cfg), process.env.LOWCFG);
  await page.goto('file:///home/user/zombie-magellan/index.html');
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('watchdog timeout')), ms))]);
  for (const s of steps) {
    try {
      if (s.wait) await page.waitForTimeout(s.wait);
      if (s.eval) { const r = await withTimeout(page.evaluate(s.eval), 15000); if (r !== undefined) console.log('[eval]', typeof r === 'string' ? r : JSON.stringify(r)); }
      if (s.shot) { await withTimeout(page.screenshot({ path: 'shots/' + s.shot + '.png', timeout: 14000 }), 15000); console.log('[shot]', s.shot); }
    } catch (e) { console.log('[step failed]', JSON.stringify(s).slice(0, 80), '->', e.message.split('\n')[0]); }
  }
  await browser.close(); console.log('errors:', errors.length);
})();
