// Headless Chromium screenshots of the IOM page.
// usage: node tools/iom-screenshot.mjs [baseUrl=http://127.0.0.1:5181] [scenario=all|main|bulb|opt|keel|light|mobile]
// Needs the dev server: npx vite --port 5181 --strictPort
import { chromium } from 'playwright-core';

const [base = 'http://127.0.0.1:5181', which = 'all'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const logs = [];
async function open(viewport = { width: 1600, height: 1000 }, theme = 'dark') {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, colorScheme: theme });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${base}/iom.html`);
  await page.waitForFunction('window.__iom && window.__iom.ready && window.__iom.evalDone', null, { timeout: 180000, polling: 500 });
  await page.waitForTimeout(2500); // let WebGL render a few frames
  return page;
}
// The dev server may full-reload the page when unrelated files change; re-run the scenario if that happened.
async function stable(page, fn) {
  for (let k = 0; k < 4; k++) {
    await page.evaluate(() => { window.__iomMark = 1; });
    await fn(page);
    const ok = await page.evaluate(() => window.__iomMark === 1 && window.__iom.ready && window.__iom.evalDone);
    if (ok) return;
    await page.waitForFunction('window.__iom && window.__iom.ready && window.__iom.evalDone', null, { timeout: 180000, polling: 500 });
    await page.waitForTimeout(2000);
  }
}
const shots = {
  async main() { const p = await open(); await stable(p, async (p) => { await p.evaluate(() => { window.__iom.selectBand(1); window.__iom.tab('perf'); }); await p.waitForTimeout(1500); await p.screenshot({ path: 'docs/screenshots/30-iom-main.png' }); }); await p.close(); },
  async keel() { const p = await open(); await stable(p, async (p) => { await p.evaluate(() => { window.__iom.setView('keel'); window.__iom.tab('res'); }); await p.waitForTimeout(1500); await p.screenshot({ path: 'docs/screenshots/30-iom-keel-resistance.png' }); }); await p.close(); },
  async bulb() { const p = await open(); await stable(p, async (p) => { await p.evaluate(() => { window.__iom.setView('bulb'); window.__iom.tab('bulb'); }); await p.waitForTimeout(1500); await p.screenshot({ path: 'docs/screenshots/30-iom-bulb-study.png' }); }); await p.close(); },
  async opt() {
    const p = await open();
    await p.evaluate(() => { window.__iom.tab('opt'); document.getElementById('optGens').value = 6; document.getElementById('optLambda').value = 8; document.getElementById('optRun').click(); });
    await p.waitForFunction('window.__iom.optDone', null, { timeout: 600000, polling: 1000 });
    await p.click('#optApply'); await p.waitForTimeout(500);
    await p.waitForFunction('document.getElementById("busy").textContent === "idle"', null, { timeout: 120000, polling: 500 });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: 'docs/screenshots/30-iom-optimiser-live.png' }); await p.close();
  },
  async optcli() { const p = await open(); await stable(p, async (p) => { await p.evaluate(() => { window.__iom.tab('opt'); [...document.querySelectorAll('#presets button')].find((b) => b.textContent.includes('all-round')).click(); }); await p.waitForTimeout(800); await p.waitForFunction('document.getElementById("busy").textContent === "idle"', null, { timeout: 120000, polling: 500 }); await p.waitForTimeout(1500); await p.screenshot({ path: 'docs/screenshots/30-iom-optimiser.png' }); }); await p.close(); },
  async light() { const p = await open({ width: 1600, height: 1000 }, 'light'); await stable(p, async (p) => { await p.evaluate(() => { window.__iom.tab('stab'); window.__iom.selectBand(2); }); await p.waitForTimeout(1500); await p.screenshot({ path: 'docs/screenshots/30-iom-light-stability.png' }); }); await p.close(); },
  async mobile() { const p = await open({ width: 390, height: 844 }, 'light'); await p.waitForTimeout(1000); await stable(p, async (p) => { await p.screenshot({ path: 'docs/screenshots/30-iom-mobile.png', fullPage: false }); }); await p.close(); },
};
for (const k of which === 'all' ? Object.keys(shots) : which.split(',')) {
  const t0 = Date.now();
  try { await shots[k](); console.log(`${k}: ok (${((Date.now() - t0) / 1000).toFixed(0)} s)`); } catch (e) { console.log(`${k}: FAILED ${e.message}`); }
}
console.log(logs.slice(-30).join('\n'));
await browser.close();
