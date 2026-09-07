const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl'] });
  const page = await browser.newPage();
  page.on('console', m => console.log('[console]', m.text()));
  await page.goto('file://' + __dirname + '/glprobe.html');
  console.log(JSON.stringify(await page.evaluate(() => window.result), null, 1));
  await browser.close();
})();
