// Packages dist/ (vite build) as a claude.ai Artifact page: the publish skeleton supplies
// doctype/head/body, so emit title + fonts + inlined CSS + body markup + module script.
import fs from 'node:fs';
import path from 'node:path';
const outDir = process.argv[2] || 'artifact';
const html = fs.readFileSync('dist/index.html', 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const fonts = [...html.matchAll(/<link[^>]+fonts\.googleapis[^>]*>/g)].map((m) => m[0]).join('\n');
const cssHref = html.match(/href="\.\/(assets\/[^"]+\.css)"/)[1];
const jsSrc = html.match(/src="\.\/(assets\/[^"]+\.js)"/)[1];
const css = fs.readFileSync(path.join('dist', cssHref), 'utf8');
const body = html.split(/<body>/)[1].split(/<\/body>/)[0];
fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
for (const f of fs.readdirSync('dist/assets')) if (f.endsWith('.js')) fs.copyFileSync(path.join('dist/assets', f), path.join(outDir, 'assets', f));
const page = `${title}
${fonts}
<style>
${css}
:root { color-scheme: dark; }
html, body { background: #0b1219; }
</style>
${body.trim()}
<script type="module" src="${jsSrc}"></script>
`;
fs.writeFileSync(path.join(outDir, 'moth-foil-lab.html'), page);
console.log(JSON.stringify({ page: path.join(outDir, 'moth-foil-lab.html'), files: fs.readdirSync(path.join(outDir, 'assets')).map((f) => `assets/${f}`) }));
