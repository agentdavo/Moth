// Export panel: shows the exported text with Copy and Download. Downloads are blocked inside
// published artifact pages, so Copy (clipboard or manual select) is the path that always works.
let dlg;

function build() {
  dlg = document.createElement('dialog');
  dlg.className = 'export-dialog';
  dlg.innerHTML = `
    <form method="dialog" class="xd-inner">
      <div class="xd-head"><b id="xdTitle"></b><button value="close" aria-label="Close">✕</button></div>
      <textarea id="xdText" readonly spellcheck="false" rows="14"></textarea>
      <div class="xd-actions">
        <button type="button" id="xdCopy" class="primary">Copy</button>
        <button type="button" id="xdSave">Download</button>
        <span id="xdMsg" role="status"></span>
      </div>
    </form>`;
  const css = document.createElement('style');
  css.textContent = `
    .export-dialog { border: 1px solid var(--line, #888); border-radius: 10px; padding: 0; width: min(720px, calc(100vw - 32px));
      background: var(--panel, #fff); color: var(--ink, #111); }
    .export-dialog::backdrop { background: rgb(0 0 0 / 0.45); }
    .export-dialog .xd-inner { display: grid; gap: 10px; padding: 14px 16px; margin: 0; }
    .export-dialog .xd-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .export-dialog textarea { width: 100%; box-sizing: border-box; font: 12px/1.4 ui-monospace, "JetBrains Mono", Menlo, monospace;
      background: var(--panel-2, var(--bg, #f5f5f5)); color: var(--ink, #111); border: 1px solid var(--line, #888); border-radius: 6px; padding: 8px; resize: vertical; }
    .export-dialog .xd-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .export-dialog #xdMsg { color: var(--ink-2, #555); font-size: 12px; }`;
  document.head.appendChild(css);
  document.body.appendChild(dlg);
  dlg.querySelector('#xdCopy').addEventListener('click', async () => {
    const ta = dlg.querySelector('#xdText');
    try { await navigator.clipboard.writeText(ta.value); say('Copied to the clipboard.'); } catch {
      ta.focus(); ta.select(); say('Selected: press Ctrl/⌘+C to copy.');
    }
  });
}

function say(t) { dlg.querySelector('#xdMsg').textContent = t; }

/** Show `text` for copying, with a best-effort download named `name`. */
export function showExport(title, name, text, type = 'text/plain') {
  if (!dlg) build();
  dlg.querySelector('#xdTitle').textContent = title;
  dlg.querySelector('#xdText').value = text;
  say(`${(text.length / 1024).toFixed(1)} kB`);
  dlg.querySelector('#xdSave').onclick = () => {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type }));
      a.download = name; document.body.appendChild(a); a.click(); a.remove();
      say(`Download started (${name}). If nothing happens, this viewer blocks downloads: use Copy.`);
    } catch { say('This viewer blocks downloads: use Copy.'); }
  };
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}
