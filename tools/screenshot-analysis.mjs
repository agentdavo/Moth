// Screenshots of analysis.html for each bundled sample (overview, maneuvers and A/B views).
// usage: npx vite --port 5180 --strictPort &   then   node tools/screenshot-analysis.mjs [baseUrl] [outDir]
//        env: THEME=dark|light (default light), ONLY=moth-overview (one shot), W/H viewport
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const [base = 'http://127.0.0.1:5180', outDir = 'docs/screenshots'] = process.argv.slice(2);
const exe = [process.env.CHROME, '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const W = +(process.env.W || 1600), H = +(process.env.H || 1000);
const theme = process.env.THEME || 'light';
const shots = [
  { name: 'moth-overview', sample: 'moth', tab: 'overview', model: 'moth' },
  { name: 'moth-maneuvers', sample: 'moth', tab: 'maneuvers' },
  { name: 'moth-ab', sample: 'moth', tab: 'ab' },
  { name: 'iom-overview', sample: 'iom', tab: 'overview' },
  { name: 'iom-maneuvers', sample: 'iom', tab: 'maneuvers' },
  { name: 'iom-ab', sample: 'iom', tab: 'ab' },
  { name: 'moth-legs', sample: 'moth', tab: 'legs', optional: true },
  { name: 'moth-polar', sample: 'moth', tab: 'polar', model: 'moth', optional: true },
].filter((s) => (process.env.ONLY ? process.env.ONLY.split(',').includes(s.name) : !s.optional || process.env.ALL));
const logs = [];
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${s.name}] [${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[${s.name}] [pageerror] ${e.message}`));
  const q = new URLSearchParams({ sample: s.sample, tab: s.tab, theme, ...(s.model ? { model: s.model } : {}) });
  await page.goto(`${base}/analysis.html?${q}`);
  await page.waitForFunction(() => window.__sla && window.__sla.res, null, { timeout: 60000 });
  if (s.model) await page.waitForFunction(() => window.__sla.res.model, null, { timeout: 60000 }).catch(() => logs.push(`[${s.name}] model overlay not ready`));
  await page.waitForTimeout(600);
  const out = `${outDir}/20-analysis-${s.name}${theme === 'dark' ? '-dark' : ''}.png`;
  await page.screenshot({ path: out });
  console.log('wrote', out);
  await page.close();
}
if (logs.length) console.log(logs.join('\n'));
await browser.close();
