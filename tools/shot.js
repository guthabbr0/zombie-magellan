// usage: node shot.js <file.html> <out.png> <waitMs> [js-to-eval-after-load] [w] [h]
const { chromium } = require('playwright');
(async () => {
  const [,, file, out, waitMs, evalJs, W, H] = process.argv;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl','--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: +(W||1280), height: +(H||720) } });
  const errors = [];
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning' || t.startsWith('[')) console.log('[console.' + m.type() + ']', t.slice(0, 2000)); });
  page.on('pageerror', e => { errors.push(e.message); console.log('[pageerror]', e.message, e.stack ? e.stack.split('\n').slice(0,4).join(' | ') : ''); });
  await page.goto('file://' + require('path').resolve(file));
  if (evalJs) { try { const r = await page.evaluate(evalJs); if (r !== undefined) console.log('[eval]', JSON.stringify(r)); } catch (e) { console.log('[evalerr]', e.message); } }
  await page.waitForTimeout(+(waitMs || 2000));
  await page.screenshot({ path: out });
  const post = await page.evaluate(() => (window.__debug ? window.__debug() : null)).catch(()=>null);
  if (post) console.log('[debug]', JSON.stringify(post));
  await browser.close();
  console.log('errors:', errors.length);
})();
