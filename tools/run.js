// usage: node run.js '<steps json>' [w] [h]   steps: [{wait:ms}|{eval:"js"}|{shot:"name"}|{key:"KeyW"}|{mouse:[x,y]}]
const { chromium } = require('playwright');
(async () => {
  const steps = JSON.parse(process.argv[2]); const W = +(process.argv[3] || 1280), H = +(process.argv[4] || 720);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning') { if (t.includes('GPU stall')) return; console.log('[console.' + m.type() + ']', t.slice(0, 1500)); } });
  page.on('pageerror', e => { errors.push(e.message); console.log('[pageerror]', e.message, (e.stack || '').split('\n').slice(1, 4).join(' | ')); });
  await page.goto('file:///home/user/zombie-magellan/index.html');
  for (const s of steps) {
    if (s.wait) await page.waitForTimeout(s.wait);
    if (s.eval) { try { const r = await page.evaluate(s.eval); if (r !== undefined) console.log('[eval]', typeof r === 'string' ? r : JSON.stringify(r)); } catch (e) { console.log('[evalerr]', e.message.split('\n')[0]); } }
    if (s.shot) { await page.screenshot({ path: 'shots/' + s.shot + '.png' }); console.log('[shot]', s.shot); }
    if (s.key) { await page.keyboard.down(s.key); if (s.hold) { await page.waitForTimeout(s.hold); await page.keyboard.up(s.key); } }
    if (s.keyup) await page.keyboard.up(s.keyup);
    if (s.click) await page.mouse.click(s.click[0], s.click[1]);
  }
  await browser.close(); console.log('errors:', errors.length);
})();
