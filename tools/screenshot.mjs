// Headless Chromium (SwiftShader WebGPU) screenshots of the running app.
// usage: node tools/screenshot.mjs <url> <out.png> [script-name]
import { chromium } from 'playwright-core';
const [url = 'http://127.0.0.1:5173/', out = 'docs/screenshots/app.png', scenario = 'main'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-vulkan=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
const wait = (cond, t = 120000) => page.waitForFunction(cond, null, { timeout: t, polling: 500 });
try {
  await wait('window.__moth && window.__moth.ready && window.__moth.evalDone');
  const scen = {
    async main() { await page.waitForTimeout(+(process.env.WAIT || 9000)); },
    async cfd() { await page.waitForTimeout(12000); },
    async sim() { await page.evaluate(() => window.__moth.tab('sim')); await page.click('#simSweep'); await page.evaluate(() => window.__moth.runSim()); await page.waitForTimeout(9000); },
    async sweep() { await page.evaluate(() => { window.__moth.tab('sweep'); window.__moth.runSweep(); }); await wait('window.__moth.sweepDone', 300000); await page.click('#swCpu'); await page.waitForTimeout(1500); },
    async opt() { await page.evaluate(() => { window.__moth.tab('opt'); document.getElementById('optGens').value = process_gens; document.getElementById('optRun').click(); }).catch(() => {}); },
    async sens() { await page.evaluate(() => { window.__moth.tab('sens'); window.__moth.runSens(); }); await wait('window.__moth.sensDone', 900000); await page.waitForTimeout(800); },
    async preset() { const k = process.env.PRESET; await page.evaluate((k) => { window.__moth.evalDone = false; window.__moth.loadPreset(k); }, k); await page.waitForTimeout(2500); await wait('window.__moth.ready && window.__moth.evalDone'); await page.waitForTimeout(6000); },
    async decisions() { await page.evaluate(() => window.__moth.tab('decisions')); await page.waitForTimeout(800); },
    async riblets() { await page.evaluate(() => window.__moth.tab('riblets')); await page.waitForTimeout(1500); },
    async strong() { await page.evaluate(() => window.__moth.loadPreset('strong')); await page.waitForTimeout(1500); await wait('window.__moth.ready'); await page.waitForTimeout(8000); },
    async margins() { await page.evaluate(() => { document.querySelector('[data-tab="margins"]').click(); document.getElementById('colorMode').value = 'cav'; document.getElementById('colorMode').dispatchEvent(new Event('change')); }); await page.waitForTimeout(5000); },
  };
  if (scenario === 'opt') {
    await page.evaluate(() => { window.__moth.tab('opt'); const g = document.getElementById('optGens'); g.value = 6; g.dispatchEvent(new Event('input')); document.getElementById('optRun').click(); });
    await wait('window.__moth.optDone', 900000);
    await page.waitForTimeout(1000);
  } else await scen[scenario]();
} catch (e) { logs.push(`[timeout] ${e.message}`); }
await page.screenshot({ path: out });
console.log(logs.slice(-40).join('\n'));
await browser.close();
