// Crew looks, round 2 (#41): six ways to show a helper's model and role, every pet × role × model.
// Usage: node plugins/glitch-pets/scripts/crew-looks-mockup.mjs [out.html]
// Writes the HTML page (animated, self-contained) and, beside it, one flat SVG per option
// (crew-looks-<id>.svg: dark and light grids at 2 px per pixel plus a 3× close-up) for rasterising.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { LOOK_ROLES, MODELS, OPTIONS } from '../hooks/behavior/crew-looks.ts'

const IDS = ['screenhead', 'blob', 'pixel', 'dot', 'fork', 'bud']
const pets = []
for (const id of IDS) {
  const p = (await import(`../hooks/personas/${id}.ts`)).default
  pets.push({ id, name: p.name, palette: p.palette, idle: p.moods.idle.frames[0], hatAnchor: p.hatAnchor })
}
const THEMES = { dark: { bg: '#17181d', fg: '#e8ebff', dim: '#8a90a8', line: '#2a2c36' }, light: { bg: '#f6f5f1', fg: '#1d1f27', dim: '#6a6f80', line: '#dcdad3' } }
const MODEL_NAME = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus' }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

function pixels(frame, palette, s, ox, oy) {
  let out = ''
  frame.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x]
      let end = x + 1
      while (end < row.length && row[end] === ch) end++
      const c = palette[ch]
      if (ch !== '.' && c) out += `<rect x="${ox + x * s}" y="${oy + y * s}" width="${(end - x) * s}" height="${s}" fill="${c}" stroke="none"/>`
      x = end
    }
  })
  return out
}
const text = (x, y, str, { size = 11, fill, weight = 400, anchor = 'start' } = {}) =>
  `<text x="${x}" y="${y}" font-family="DejaVu Sans" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" stroke="none">${esc(str)}</text>`

// Every look, computed once.
const looks = {}
for (const opt of OPTIONS) {
  looks[opt.id] = pets.map(p => LOOK_ROLES.map(r => MODELS.map(m => opt.make(p, r, m))))
}

/** Pets down, roles across, the three models inside each role column. */
function gridSvg(opt, s, th, petIdx = pets.map((_, i) => i)) {
  const L = looks[opt.id]
  const { width: w, height: h } = L[0][0][0]
  const gap = 6, pad = 8, labelW = 96, headH = 34
  const cellW = 3 * w * s + 2 * gap + pad * 2, cellH = h * s + pad * 2
  const W = labelW + LOOK_ROLES.length * cellW, H = headH + petIdx.length * cellH
  let b = `<rect x="0" y="0" width="${W}" height="${H}" fill="${th.bg}" stroke="none"/>`
  LOOK_ROLES.forEach((r, ri) => {
    const x = labelW + ri * cellW
    b += text(x + cellW / 2, 14, r, { fill: th.fg, anchor: 'middle', weight: 700 })
    MODELS.forEach((m, mi) => (b += text(x + pad + mi * (w * s + gap) + (w * s) / 2, 28, MODEL_NAME[m], { size: 9, fill: th.dim, anchor: 'middle' })))
    if (ri) b += `<rect x="${x}" y="${headH}" width="1" height="${H - headH}" fill="${th.line}" stroke="none"/>`
  })
  petIdx.forEach((pi, row) => {
    const y0 = headH + row * cellH
    b += `<rect x="0" y="${y0}" width="${W}" height="1" fill="${th.line}" stroke="none"/>`
    b += text(8, y0 + cellH / 2 + 4, pets[pi].name, { fill: th.fg, weight: 700 })
    LOOK_ROLES.forEach((_, ri) =>
      MODELS.forEach((_, mi) => {
        const lk = L[pi][ri][mi]
        b += pixels(lk.frames[lk.still], lk.palette, s, labelW + ri * cellW + pad + mi * (w * s + gap), y0 + pad)
      }),
    )
  })
  return { W, H, body: b }
}

function optionSvg(opt) {
  const parts = [
    ['2 px per pixel · dark', gridSvg(opt, 2, THEMES.dark)],
    ['2 px per pixel · light', gridSvg(opt, 2, THEMES.light)],
    ['3× close-up · Fork and Bud · dark', gridSvg(opt, 3, THEMES.dark, [4, 5])],
    ['3× close-up · Fork and Bud · light', gridSvg(opt, 3, THEMES.light, [4, 5])],
  ]
  const titleH = 58, capH = 20
  const W = Math.max(...parts.map(([, g]) => g.W))
  let y = titleH, body = ''
  for (const [cap, g] of parts) {
    body += text(8, y + 14, cap, { size: 12, fill: '#55596a' })
    body += `<g transform="translate(0 ${y + capH})">${g.body}</g>`
    y += capH + g.H + 10
  }
  const head = text(8, 22, opt.name, { size: 18, weight: 700, fill: '#1d1f27' }) + text(8, 42, `Model: ${opt.model}   Role: ${opt.role}`, { size: 11, fill: '#55596a' })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}" shape-rendering="crispEdges"><rect width="${W}" height="${y}" fill="#ffffff" stroke="none"/>${head}${body}</svg>`
}

const out = resolve(process.argv[2] ?? '.superpowers/gallery/crew-looks.html')
const dir = dirname(out)
mkdirSync(dir, { recursive: true })
for (const opt of OPTIONS) writeFileSync(join(dir, `crew-looks-${opt.id}.svg`), optionSvg(opt))

// The page draws every look on canvases from this data and animates the ones with frames.
const data = {
  pets: pets.map(p => p.name),
  roles: LOOK_ROLES,
  models: MODELS.map(m => MODEL_NAME[m]),
  options: OPTIONS.map(o => ({ id: o.id, name: o.name, idea: o.idea, model: o.model, role: o.role, animated: o.animated, looks: looks[o.id] })),
}
const PICK = 'Option 1, Growing up at the workbench. Size is the one cue everyone ranks without a legend (hatchling < junior < grown-up), the pet stays itself in its own colors, and a workstation names the role at a glance in the terminal and on the desktop alike. It costs 9 columns of width and no height. Busy hands is the natural next step: animate the same stations while the helper runs and freeze them when it is done.'
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Crew Looks Round 2</title>
<style>
:root{--bg:#fbfaf7;--fg:#1d1f27;--dim:#5d6272;--line:#e2e0d8;--card:#ffffff;--accent:#4f5bd5}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#101116;--fg:#e8ebff;--dim:#9aa0b8;--line:#2a2c36;--card:#17181d;--accent:#8f9bff}}
:root[data-theme="dark"]{--bg:#101116;--fg:#e8ebff;--dim:#9aa0b8;--line:#2a2c36;--card:#17181d;--accent:#8f9bff}
*{box-sizing:border-box}
body{margin:0;padding:24px 16px 64px;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1500px;margin:0 auto}
h1{font-size:24px;margin:0 0 6px}h2{font-size:19px;margin:0}
.lede{color:var(--dim);max-width:860px;margin:0 0 18px}
nav{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 24px}
nav a{color:var(--fg);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:3px 12px;font-size:13px;background:var(--card)}
nav a:hover{border-color:var(--accent)}
.controls{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin:0 0 20px;font-size:13px;color:var(--dim)}
select,button{font:inherit;color:var(--fg);background:var(--card);border:1px solid var(--line);border-radius:6px;padding:3px 8px}
section{border-top:1px solid var(--line);padding:26px 0 8px}
.num{color:var(--accent);font-weight:700;margin-right:6px}
.idea{margin:4px 0 8px;max-width:900px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;margin:0 0 14px;max-width:900px;font-size:13px}
dt{color:var(--dim)}dd{margin:0}
.row{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}
figure{margin:0 0 16px}figcaption{font-size:12px;color:var(--dim);margin-bottom:4px}
.scroll{overflow-x:auto;max-width:100%;-webkit-overflow-scrolling:touch}
canvas{display:block;image-rendering:pixelated;border-radius:6px}
.pane{border-radius:8px;padding:10px 12px;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;width:340px;max-width:100%}
.pane .r{display:flex;align-items:center;gap:8px;margin:4px 0}
.pane .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pane .s{opacity:.65}
.pane.dark{background:#17181d;color:#e8ebff}.pane.light{background:#f6f5f1;color:#1d1f27;border:1px solid #dcdad3}
.pick{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:14px 16px;max-width:900px}
</style></head><body><main>
<h1>Crew looks, round 2 (#41)</h1>
<p class="lede">Six new ways to show each helper's <b>model</b> (Haiku, Sonnet, Opus) and <b>role</b> on its crew-pane mini, none of them a hat. Each option shows every pet × role × model at the pane's 2 px per pixel on dark and light, a 3× close-up, frame strips for the animated ones, and a sample pane.</p>
<nav id="nav"></nav>
<div class="controls">
<label>Close-up pet <select id="pet"></select></label>
<label><input type="checkbox" id="anim" checked> Animate</label>
</div>
<div id="opts"></div>
<div class="pick" id="pick"><h2>My pick</h2><p></p></div>
</main>
<script>
const DATA = ${JSON.stringify(data)};
const THEME = { dark: '#17181d', light: '#f6f5f1' };
const live = [];
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.style.width = w + 'px'; c.style.height = h + 'px'; return c; }
function drawFrame(ctx, frame, pal, s, ox, oy) {
  frame.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const ch = row[x]; if (ch === '.' || !pal[ch]) continue; ctx.fillStyle = pal[ch]; ctx.fillRect(ox + x * s, oy + y * s, s, s); } });
}
// A cell is one look at one spot on a canvas; it redraws when its frame changes.
function cell(ctx, look, s, ox, oy, bg, fixed) {
  const c = { ctx, look, s, ox, oy, bg, fixed, shown: -1 };
  c.draw = i => { if (i === c.shown) return; c.shown = i; ctx.fillStyle = bg; ctx.fillRect(ox, oy, look.width * s, look.height * s); drawFrame(ctx, look.frames[i], look.palette, s, ox, oy); };
  c.draw(fixed ?? look.still);
  if (fixed == null && look.frames.length > 1) live.push(c);
  return c;
}
function grid(opt, s, theme, petIdx) {
  const lk0 = opt.looks[0][0][0], w = lk0.width * s, h = lk0.height * s, gap = 6, pad = 8, labelW = 92, headH = 34;
  const cellW = 3 * w + 2 * gap + pad * 2, cellH = h + pad * 2;
  const W = labelW + 6 * cellW, H = headH + petIdx.length * cellH;
  const cv = makeCanvas(W, H), ctx = cv.getContext('2d'), fg = theme === 'dark' ? '#e8ebff' : '#1d1f27', dim = theme === 'dark' ? '#8a90a8' : '#6a6f80', line = theme === 'dark' ? '#2a2c36' : '#dcdad3';
  ctx.fillStyle = THEME[theme]; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  DATA.roles.forEach((r, ri) => {
    const x = labelW + ri * cellW;
    ctx.fillStyle = fg; ctx.font = '700 12px system-ui,sans-serif'; ctx.fillText(r, x + cellW / 2, 14);
    ctx.fillStyle = dim; ctx.font = '10px system-ui,sans-serif';
    DATA.models.forEach((m, mi) => ctx.fillText(m, x + pad + mi * (w + gap) + w / 2, 28));
    if (ri) { ctx.fillStyle = line; ctx.fillRect(x, headH, 1, H - headH); }
  });
  ctx.textAlign = 'left';
  petIdx.forEach((pi, row) => {
    const y0 = headH + row * cellH;
    ctx.fillStyle = line; ctx.fillRect(0, y0, W, 1);
    ctx.fillStyle = fg; ctx.font = '700 12px system-ui,sans-serif'; ctx.fillText(DATA.pets[pi], 8, y0 + cellH / 2 + 4);
    DATA.roles.forEach((_, ri) => DATA.models.forEach((_, mi) => cell(ctx, opt.looks[pi][ri][mi], s, labelW + ri * cellW + pad + mi * (w + gap), y0 + pad, THEME[theme])));
  });
  return cv;
}
function strips(opt, pi) {
  const s = 3, lk0 = opt.looks[pi][0][0], w = lk0.width * s, h = lk0.height * s, gap = 4, labelW = 150;
  const n = Math.max(...opt.looks[pi].flat().map(l => l.frames.length));
  const W = labelW + n * (w + gap) + w + 20, H = 18 * (h + gap);
  const cv = makeCanvas(W, H), ctx = cv.getContext('2d');
  ctx.fillStyle = THEME.dark; ctx.fillRect(0, 0, W, H);
  let row = 0;
  DATA.roles.forEach((r, ri) => DATA.models.forEach((m, mi) => {
    const lk = opt.looks[pi][ri][mi], y = row++ * (h + gap);
    ctx.fillStyle = '#e8ebff'; ctx.font = '12px system-ui,sans-serif'; ctx.fillText(r + ' · ' + m + ' · ' + lk.fps + ' fps', 8, y + h / 2 + 4);
    lk.frames.forEach((_, i) => cell(ctx, lk, s, labelW + i * (w + gap), y, THEME.dark, i));
    cell(ctx, lk, s, labelW + n * (w + gap) + 16, y, THEME.dark);
  }));
  return cv;
}
const SAMPLE = [['builder', 1, 'parse-dates', 'builder · Sonnet 4.5 · medium'], ['researcher', 0, 'find-locales', 'researcher · Haiku 4.5 · low'], ['reviewer', 2, 'check-fixes', 'reviewer · Opus 5.5 · high']];
function pane(opt, pi, theme) {
  const el = document.createElement('div'); el.className = 'pane ' + theme;
  const lead = document.createElement('div'); lead.className = 'r'; lead.innerHTML = '<b>' + DATA.pets[pi] + ' · lead · leading</b>'; el.appendChild(lead);
  SAMPLE.forEach(([role, mi, title, sub]) => {
    const lk = opt.looks[pi][DATA.roles.indexOf(role)][mi], s = 2;
    const r = document.createElement('div'); r.className = 'r';
    const cv = makeCanvas(lk.width * s, lk.height * s); cell(cv.getContext('2d'), lk, s, 0, 0, THEME[theme]);
    const t = document.createElement('div'); t.className = 't'; t.innerHTML = title + '<br><span class="s">' + sub + '</span>';
    r.append(cv, t); el.appendChild(r);
  });
  return el;
}
function fig(cap, node) { const f = document.createElement('figure'); f.innerHTML = '<figcaption>' + cap + '</figcaption>'; const d = document.createElement('div'); d.className = 'scroll'; d.appendChild(node); f.appendChild(d); return f; }
function render() {
  live.length = 0;
  const pi = +document.getElementById('pet').value, root = document.getElementById('opts'); root.innerHTML = '';
  DATA.options.forEach((opt, oi) => {
    const sec = document.createElement('section'); sec.id = opt.id;
    sec.innerHTML = '<h2><span class="num">' + (oi + 1) + '</span>' + opt.name + (opt.animated ? ' <small style="color:var(--dim);font-weight:400">· animated</small>' : '') + '</h2><p class="idea">' + opt.idea + '</p><dl><dt>Model</dt><dd>' + opt.model + '</dd><dt>Role</dt><dd>' + opt.role + '</dd></dl>';
    const panes = document.createElement('div'); panes.className = 'row'; panes.append(pane(opt, pi, 'dark'), pane(opt, pi, 'light'));
    sec.appendChild(fig('In the pane (2 px per pixel)', panes));
    sec.appendChild(fig('All pets · 2 px per pixel · dark', grid(opt, 2, 'dark', [0, 1, 2, 3, 4, 5])));
    sec.appendChild(fig('All pets · 2 px per pixel · light', grid(opt, 2, 'light', [0, 1, 2, 3, 4, 5])));
    sec.appendChild(fig('3× close-up · ' + DATA.pets[pi] + ' · dark and light', (() => { const d = document.createElement('div'); d.className = 'row'; d.append(grid(opt, 3, 'dark', [pi]), grid(opt, 3, 'light', [pi])); return d; })()));
    if (opt.animated) sec.appendChild(fig('Frame strips · ' + DATA.pets[pi] + ' (last column plays the loop)', strips(opt, pi)));
    root.appendChild(sec);
  });
}
const sel = document.getElementById('pet');
DATA.pets.forEach((p, i) => { const o = document.createElement('option'); o.value = i; o.textContent = p; if (p === 'Fork') o.selected = true; sel.appendChild(o); });
sel.onchange = render;
document.getElementById('nav').innerHTML = DATA.options.map((o, i) => '<a href="#' + o.id + '">' + (i + 1) + ' · ' + o.name + '</a>').join('');
document.querySelector('#pick p').textContent = ${JSON.stringify(PICK)};
render();
const t0 = performance.now();
(function tick(now) {
  if (document.getElementById('anim').checked) for (const c of live) c.draw(Math.floor(((now - t0) / 1000) * c.look.fps) % c.look.frames.length);
  else for (const c of live) c.draw(c.look.still);
  requestAnimationFrame(tick);
})(t0);
</script></body></html>`
writeFileSync(out, html)
console.log(`crew looks mockup: ${OPTIONS.length} options → ${out}`)
