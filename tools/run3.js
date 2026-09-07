// mobile emulation runner: node run3.js steps.json
const { chromium, devices } = require('playwright'); const fs = require('fs');
(async () => {
  const steps = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const page = await ctx.newPage(); const errors = [];
  page.on('console', m => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !t.includes('GPU stall')) console.log('[console.' + m.type() + ']', t.slice(0, 800)); });
  page.on('pageerror', e => { errors.push(e.message); console.log('[pageerror]', e.message, (e.stack || '').split('\n').slice(1, 3).join(' | ')); });
  if (process.env.LOWCFG) await page.addInitScript(cfg => localStorage.setItem('magellan.settings', cfg), process.env.LOWCFG);
  await page.goto('file:///home/user/zombie-magellan/index.html');
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('watchdog')), ms))]);
  for (const s of steps) { try {
    if (s.wait) await page.waitForTimeout(s.wait);
    if (s.eval) { const r = await withTimeout(page.evaluate(s.eval), 15000); if (r !== undefined) console.log('[eval]', typeof r === 'string' ? r : JSON.stringify(r)); }
    if (s.tap) { await page.touchscreen.tap(s.tap[0], s.tap[1]); console.log('[tap]', s.tap); }
    if (s.shot) { await withTimeout(page.screenshot({ path: 'shots/' + s.shot + '.png', timeout: 14000 }), 15000); console.log('[shot]', s.shot); }
  } catch (e) { console.log('[step failed]', JSON.stringify(s).slice(0, 60), e.message.split('\n')[0]); } }
  await browser.close(); console.log('errors:', errors.length);
})();
