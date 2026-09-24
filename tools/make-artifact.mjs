// Packages one page of the multi-page Vite build (dist/) as a claude.ai Artifact page: the publish
// skeleton supplies doctype/head/body, so emit title + fonts + inlined CSS + body markup + module script.
// usage: node tools/make-artifact.mjs <outDir> [page=index] [outName=moth-foil-lab.html] [--dark] [--links=index=URL,analysis=URL,iom=URL]
// --links rewrites the cross-page nav (<a data-page=...>) to the published artifact URLs (opened in a new tab).
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const [outDir = 'artifact', pageName = 'index', outName = 'moth-foil-lab.html'] = args.filter((a) => !a.startsWith('--'));
const dark = args.includes('--dark') || pageName === 'index'; // the Moth app is dark-only
const html = fs.readFileSync(`dist/${pageName}.html`, 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const fonts = [...html.matchAll(/<link[^>]+fonts\.googleapis[^>]*>/g)].map((m) => m[0]).join('\n');
const cssFiles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\.\/(assets\/[^"]+\.css)"/g), ...html.matchAll(/<link[^>]+href="\.\/(assets\/[^"]+\.css)"[^>]+rel="stylesheet"/g)].map((m) => m[1]);
const css = [...new Set(cssFiles)].map((f) => fs.readFileSync(path.join('dist', f), 'utf8')).join('\n');
const scripts = [...html.matchAll(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
let body = html.split(/<body[^>]*>/)[1].split(/<\/body>/)[0];
const linkArg = args.find((a) => a.startsWith('--links='));
const links = Object.fromEntries((linkArg ? linkArg.slice(8).split(',') : []).map((kv) => kv.split(/=(.*)/s).slice(0, 2)));
if (linkArg) {
  body = body.replace(/<a data-page="(\w+)" href="[^"]*"/g, (m, k) => (k === pageName ? `<a data-page="${k}" href="#"`
    : links[k] ? `<a data-page="${k}" href="${links[k]}" target="_blank" rel="noopener"` : `<a data-page="${k}" href="#" hidden`));
}
// copy only the JS reachable from this page's entry scripts (chunks, dynamic imports, workers)
const all = fs.readdirSync('dist/assets').filter((f) => f.endsWith('.js'));
const need = new Set(scripts.map((s) => path.basename(s)));
for (let changed = true; changed;) {
  changed = false;
  for (const f of [...need]) {
    const src = fs.readFileSync(path.join('dist/assets', f), 'utf8');
    for (const g of all) if (!need.has(g) && src.includes(g)) { need.add(g); changed = true; }
  }
}
fs.rmSync(path.join(outDir, 'assets'), { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
for (const f of need) fs.copyFileSync(path.join('dist/assets', f), path.join(outDir, 'assets', f));
const page = `${title}
${fonts}
<style>
${css}
${dark ? ':root { color-scheme: dark; }\nhtml, body { background: #0b1219; }' : ''}
</style>
${body.trim()}
${scripts.map((s) => `<script type="module" src="${s}"></script>`).join('\n')}
`;
fs.writeFileSync(path.join(outDir, outName), page);
console.log(JSON.stringify({ page: path.join(outDir, outName), files: fs.readdirSync(path.join(outDir, 'assets')).map((f) => `assets/${f}`) }));
