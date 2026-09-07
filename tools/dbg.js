const { chromium } = require('playwright');
(async () => { const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const page = await browser.newPage({viewport:{width:512,height:512}}); page.on('console', m => console.log('[c]', m.text()));
  await page.goto('file://' + __dirname + '/dbg.html'); await page.waitForTimeout(500);
  console.log(JSON.stringify(await page.evaluate(() => window.result))); await page.screenshot({path:'shots/dbg.png'}); await browser.close(); })();
