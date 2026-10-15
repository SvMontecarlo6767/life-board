/* Life Board – Training: Diagramme (SVG, von JS gebaut, neu gezeichnet bei Größenänderung). Nur Darstellung. */
(function () {
'use strict';
const C = window.TrainingCore, F = C.fmt;
const AC = '#ff5460', AC2 = '#ff9a5c', NEU = 'rgba(160,205,255,.34)', GR = 'rgba(150,200,255,.12)', LIME = '#d8ff4f', TXT = '#8fa6bd', INK = '#e6f1fb', BG = '#04080f';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = () => (window.LBUI && LBUI.settings) || {};
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches || S().perf || document.hidden || navigator.webdriver;
const wdOf = di => (((di + 3) % 7) + 7) % 7;
const f0 = v => F.num(v, 0), f1 = v => F.num(v, 1);
const W = el => Math.max(260, Math.floor(el.clientWidth || el.parentNode.clientWidth || 600));

/* ---------- Tooltip ---------- */
const tipEl = () => document.getElementById('tip');
function showTip(x, y, o) {
  const t = tipEl(); t.replaceChildren();
  if (o.t) { const d = document.createElement('div'); d.className = 't'; d.textContent = o.t; t.append(d) }
  (o.rows || []).forEach(r => { const d = document.createElement('div'); d.className = 'r'; if (r[0]) { const k = document.createElement('i'); k.style.background = r[0]; d.append(k) } const n = document.createElement('span'); n.textContent = r[1]; const b = document.createElement('b'); b.textContent = r[2]; d.append(n, b); t.append(d) });
  t.style.display = 'block';
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = Math.max(6, Math.min(innerWidth - w - 6, x + 14)) + 'px';
  t.style.top = Math.max(6, Math.min(innerHeight - h - 6, y - h - 10 < 6 ? y + 18 : y - h - 10)) + 'px';
}
const hideTip = () => { tipEl().style.display = 'none' };
document.addEventListener('pointerdown', e => { if (!e.target.closest || !e.target.closest('[data-tt],[data-xh]')) hideTip() });
document.addEventListener('scroll', hideTip, { passive: true });
// Elemente mit data-tt="i": el._tt[i] = {t,rows}
function bindTT(el, arr) {
  el._tt = arr;
  if (el._ttb) return; el._ttb = true;
  const h = e => { const n = e.target.closest && e.target.closest('[data-tt]'); if (!n) { if (e.type === 'pointermove' && e.pointerType === 'mouse') hideTip(); return } const o = el._tt[+n.getAttribute('data-tt')]; if (o) showTip(e.clientX, e.clientY, o) };
  el.addEventListener('pointermove', h); el.addEventListener('pointerdown', h); el.addEventListener('pointerleave', hideTip);
}
const fmtDay = k => F.dateShort(k);
function sr(title, rows) { return '<div class="sr"><table><caption>' + esc(title) + '</caption>' + rows.map(r => '<tr>' + r.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</table></div>' }
const monthName = k => C.MON[+k.slice(5, 7) - 1];
const nice = (mx, n) => { const raw = mx / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p };
function grid(w, h, pl, pr, pt, pb, max, unit, n) {
  const step = nice(max, n || 4); let s = '';
  for (let v = 0; v <= max + 1e-9; v += step) { const y = pt + (h - pt - pb) * (1 - v / max); s += '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + y + '" y2="' + y + '" stroke="' + GR + '"/><text x="' + (pl - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + f0(v) + '</text>' }
  return s;
}
const anim = (cls, d) => still() ? '' : ' class="' + cls + '" style="animation-delay:' + d + 'ms"';

/* ---------- Skyline (3D-Jahr) ---------- */
function skyline(el, R, mode) {
  const days = R.days, first = days[0].di, w0 = first - wdOf(first);
  const vals = days.map(d => mode === 'load' ? d.load : d.km), mx = Math.max.apply(null, vals.concat([1]));
  let best = -1; vals.forEach((v, i) => { if (v > 0 && (best < 0 || v > vals[best])) best = i });
  const P = (u, v, h) => [8.2 * u + 5.0 * v, -1.8 * u + 3.1 * v - h];
  const items = days.map((d, i) => ({ u: Math.floor((d.di - w0) / 7), v: 6 - wdOf(d.di), h: vals[i] > 0 ? Math.max(2.5, vals[i] / mx * 132) : 0, i, d }));
  items.sort((a, b) => (a.v - .61 * a.u) - (b.v - .61 * b.u));
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const grow = (p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]) };
  items.forEach(it => { [[0.17, 0.17], [0.83, 0.17], [0.83, 0.83], [0.17, 0.83]].forEach(c => { grow(P(it.u + c[0], it.v + c[1], it.h)); grow(P(it.u + c[0], it.v + c[1], 0)) }) });
  const pts = a => a.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const tt = []; let out = '';
  const maxU = Math.max.apply(null, items.map(i => i.u));
  items.forEach(it => {
    const { u, v, h, d, i } = it, a = u + .17, b = u + .83, c = v + .17, e = v + .83;
    const isBest = i === best, run = h > 0;
    const top = isBest ? LIME : run ? '#ffe9eb' : (d.act ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.085)');
    const left = isBest ? '#bde23c' : '#b83a48', front = isBest ? '#9bc226' : '#ff5460';
    tt.push({ t: F.dateLong(d.k), rows: [[AC, 'Laufkilometer', f1(d.km) + ' km'], [AC2, 'Belastung', f0(d.load) + ' Punkte']] });
    out += '<g' + anim('rise', Math.round(u / Math.max(1, maxU) * 700)) + ' data-tt="' + (tt.length - 1) + '">';
    if (run) {
      out += '<polygon points="' + pts([P(a, c, 0), P(a, e, 0), P(a, e, h), P(a, c, h)]) + '" fill="' + left + '"/>';
      out += '<polygon points="' + pts([P(a, e, 0), P(b, e, 0), P(b, e, h), P(a, e, h)]) + '" fill="' + front + '"/>';
    }
    out += '<polygon points="' + pts([P(a, c, h), P(b, c, h), P(b, e, h), P(a, e, h)]) + '" fill="' + top + '"/></g>';
  });
  // Monatsnamen an der Vorderkante
  let lab = ''; let lastM = '';
  days.forEach(d => { const m = d.k.slice(0, 7); if (m !== lastM && +d.k.slice(8) <= 7) { lastM = m; const u = Math.floor((d.di - w0) / 7); const p = P(u + .5, 7.1, 0); lab += '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 8).toFixed(1) + '" font-size="5.2" text-anchor="middle">' + monthName(d.k) + '</text>'; grow([p[0], p[1] + 10]) } });
  let bl = '';
  if (best >= 0) { const it = items.find(x => x.i === best), p = P(it.u + .5, it.v + .5, it.h); bl = '<line x1="' + p[0].toFixed(1) + '" y1="' + p[1].toFixed(1) + '" x2="' + (p[0] - 8).toFixed(1) + '" y2="' + (p[1] - 18).toFixed(1) + '" stroke="' + LIME + '" stroke-width=".5"/><text x="' + (p[0] - 9).toFixed(1) + '" y="' + (p[1] - 20).toFixed(1) + '" font-size="5.6" text-anchor="end" style="fill:' + LIME + ';font-weight:700">' + f1(vals[best]) + (mode === 'load' ? ' Pkt' : ' km') + ' · ' + F.dateShort(days[best].k) + '</text>'; grow([p[0] - 60, p[1] - 28]) }
  const pad = 6;
  el.innerHTML = '<svg viewBox="' + (x0 - pad).toFixed(1) + ' ' + (y0 - pad).toFixed(1) + ' ' + (x1 - x0 + 2 * pad).toFixed(1) + ' ' + (y1 - y0 + 2 * pad).toFixed(1) + '" width="100%" role="img" aria-label="Dein Jahr als 3D-Stadt: jeder Tag eine Säule">' + out + lab + bl + '</svg>' + sr('Dein Jahr', days.filter(d => d.km > 0).map(d => [d.k, f1(d.km) + ' km']));
  bindTT(el, tt);
}

/* ---------- Fitness, Ermüdung, Form ---------- */
function formChart(el, R, ndays) {
  const s = R.series.slice(-ndays), w = W(el), h = 320, pl = 36, pr = 64, pt = 26, hiB = 200, fy0 = 236, fy1 = 304;
  const n = s.length, X = i => pl + (w - pl - pr) * (n === 1 ? 0 : i / (n - 1));
  const mx = Math.max.apply(null, s.map(d => Math.max(d.fit, d.fat)).concat([10])) * 1.1;
  const Y = v => pt + (hiB - pt) * (1 - v / mx);
  let g = grid(w, hiB + 10, pl, pr, pt, 10, mx, '', 4);
  const line = k => s.map((d, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(d[k]).toFixed(1)).join('');
  const area = line('fit') + 'L' + X(n - 1) + ' ' + Y(0) + 'L' + X(0) + ' ' + Y(0) + 'Z';
  const mAbs = Math.max(8, Math.max.apply(null, s.map(d => Math.abs(d.form)))), FY = v => (fy0 + fy1) / 2 - v / mAbs * (fy1 - fy0) / 2;
  let bars = '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + FY(0) + '" y2="' + FY(0) + '" stroke="' + GR + '"/>';
  const bw = Math.max(1, Math.min(6, (w - pl - pr) / n * .8));
  s.forEach((d, i) => { const y = FY(d.form); bars += '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + Math.min(y, FY(0)).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(.6, Math.abs(y - FY(0))).toFixed(1) + '" fill="' + (d.form >= 0 ? AC2 : NEU) + '"/>' });
  let races = '';
  const rs = (R.races || []).filter(r => s.some(d => d.k === C.keyOfIdx(r.di)));
  rs.forEach(r => { const i = s.findIndex(d => d.k === C.keyOfIdx(r.di)); races += '<line x1="' + X(i) + '" x2="' + X(i) + '" y1="' + (pt - 6) + '" y2="' + fy1 + '" stroke="rgba(255,255,255,.35)" stroke-dasharray="1 3"/><circle cx="' + X(i) + '" cy="' + Y(s[i].fit) + '" r="4" fill="' + AC + '" stroke="' + BG + '" stroke-width="2"/><text x="' + X(i) + '" y="' + (pt - 10) + '" text-anchor="middle" font-size="10">' + esc((r.name || 'Rennen').slice(0, 18)) + '</text>' });
  let mo = ''; let lm = '';
  s.forEach((d, i) => { const m = d.k.slice(0, 7); if (m !== lm && ((i === 0 && +d.k.slice(8) <= 12) || (i > 0 && +d.k.slice(8) <= 3))) { lm = m; mo += '<text x="' + X(i) + '" y="' + (h - 4) + '" text-anchor="' + (i === 0 ? 'start' : 'middle') + '">' + monthName(d.k) + '</text>' } });
  const last = s[n - 1];
  const ends = '<text x="' + (w - pr + 6) + '" y="' + (Y(last.fit) + 4) + '" class="acc">' + f0(last.fit) + '</text><text x="' + (w - pr + 6) + '" y="' + (Y(last.fat) + (Math.abs(Y(last.fat) - Y(last.fit)) < 12 ? 14 : 4)) + '">' + f0(last.fat) + '</text><text x="' + (w - pr + 6) + '" y="' + (FY(last.form) + 4) + '" style="fill:' + AC2 + '">' + F.signed(last.form, 0) + '</text>';
  el.innerHTML = '<svg id="fsvg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="touch-action:pan-y" role="img" aria-label="Fitness, Ermüdung und Form"><defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + AC + '" stop-opacity=".32"/><stop offset="1" stop-color="' + AC + '" stop-opacity="0"/></linearGradient></defs>' + g + '<path d="' + area + '" fill="url(#fg)"/><path d="' + line('fat') + '" fill="none" stroke="' + TXT + '" stroke-opacity=".6" stroke-width="1.5" stroke-linejoin="round"/><path id="fline" d="' + line('fit') + '" fill="none" stroke="' + AC + '" stroke-width="2.2" stroke-linejoin="round"/>' + bars + races + mo + ends + '<line id="xh" x1="0" x2="0" y1="' + pt + '" y2="' + fy1 + '" stroke="rgba(255,255,255,.5)" stroke-width="1" style="display:none"/></svg>' + sr('Fitness, Ermüdung, Form', s.filter((d, i) => i % 7 === 0).map(d => [d.k, 'Fitness ' + f0(d.fit), 'Ermüdung ' + f0(d.fat), 'Form ' + F.signed(d.form, 0)]));
  const svg = el.querySelector('svg'), xh = el.querySelector('#xh');
  if (!still()) { const p = el.querySelector('#fline'), L = p.getTotalLength ? p.getTotalLength() : 0; if (L) { p.style.strokeDasharray = L; p.style.strokeDashoffset = L; requestAnimationFrame(() => { p.style.transition = 'stroke-dashoffset 1.3s ease'; p.style.strokeDashoffset = 0 }) } }
  const mv = e => { const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * (w / r.width); const i = Math.max(0, Math.min(n - 1, Math.round((x - pl) / ((w - pl - pr) / (n - 1 || 1))))); const d = s[i]; xh.style.display = ''; xh.setAttribute('x1', X(i)); xh.setAttribute('x2', X(i)); showTip(e.clientX, e.clientY, { t: F.dateLong(d.k), rows: [[AC, 'Fitness', f0(d.fit)], [TXT, 'Ermüdung', f0(d.fat)], [AC2, 'Form', F.signed(d.form, 0)], [null, 'Tageslast', f0(d.load)]] }) };
  svg.setAttribute('data-xh', '1'); svg.addEventListener('pointermove', mv); svg.addEventListener('pointerdown', mv); svg.addEventListener('pointerleave', () => { xh.style.display = 'none'; hideTip() });
}

/* ---------- Tacho ---------- */
function gauge(el, v) {
  const w = 300, cx = 150, cy = 150, r = 112, lo = .4, hi = 2.0;
  const ang = x => Math.PI * (1 - (Math.max(lo, Math.min(hi, x)) - lo) / (hi - lo));
  const pt = (x, rr) => [cx + Math.cos(ang(x)) * rr, cy - Math.sin(ang(x)) * rr];
  const arc = (a, b, col) => { const p = pt(a, r), q = pt(b, r); return '<path d="M' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + q[0].toFixed(1) + ' ' + q[1].toFixed(1) + '" fill="none" stroke="' + col + '" stroke-width="16"/>' };
  let s = arc(.4, .8, 'rgba(160,205,255,.22)') + arc(.8, 1.3, 'rgba(255,84,96,.4)') + arc(1.3, 1.5, 'rgba(255,170,100,.6)') + arc(1.5, 2.0, 'rgba(255,120,80,.85)');
  let txt = '', dot = '';
  if (v != null) { const p0 = pt(v, r - 14), p1 = pt(v, r + 14), pd = pt(v, r); dot = '<line x1="' + p0[0] + '" y1="' + p0[1] + '" x2="' + p1[0] + '" y2="' + p1[1] + '" stroke="' + AC + '" stroke-width="3"/><circle cx="' + pd[0] + '" cy="' + pd[1] + '" r="9" fill="' + AC + '" stroke="#fff" stroke-width="3"/>'; txt = '<text x="150" y="132" text-anchor="middle" style="font:700 40px Orbitron,system-ui;fill:' + INK + '">' + F.num(v, 2) + '</text><text x="150" y="154" text-anchor="middle" font-size="13" style="fill:' + INK + '">' + esc(window.TrainingText.acwrWord(v)) + '</text>' }
  else txt = '<text x="150" y="140" text-anchor="middle" font-size="13">zu wenig Daten</text>';
  el.innerHTML = '<svg viewBox="0 0 300 175" width="100%" role="img" aria-label="Belastung akut zu chronisch">' + s + dot + txt + '<text x="30" y="170" text-anchor="middle">0,4</text><text x="270" y="170" text-anchor="middle">2,0</text></svg>';
}

/* ---------- Wochenumfang ---------- */
function weeksChart(el, R, n) {
  const ws = R.weeks.slice(-n), w = W(el), h = 280, pl = 36, pr = 12, pt = 28, pb = 26;
  const mx = Math.max.apply(null, ws.map(x => x.km).concat([R.weekTarget || 0, 10])) * 1.12;
  const bw = Math.min(24, (w - pl - pr) / ws.length * .7), X = i => pl + (w - pl - pr) * (i + .5) / ws.length, Y = v => pt + (h - pt - pb) * (1 - v / mx);
  let s = grid(w, h, pl, pr, pt, pb, mx, '', 4); const tt = [];
  const jumpStart = R.jump ? R.jump.start : null;
  ws.forEach((x, i) => {
    const y = Y(x.km), hh = Math.max(1, h - pb - y), isJ = x.start === jumpStart;
    tt.push({ t: 'Woche ab ' + F.dateShort(x.start) + (x.cur ? ' (läuft)' : ''), rows: [[isJ ? AC : NEU, 'Kilometer', f1(x.km) + ' km'], [null, 'Läufe', String(x.runs)], [null, 'Stunden', f1(x.hours)], [null, 'Belastung', f0(x.load)]] });
    if (x.cur) s += '<rect data-tt="' + i + '" x="' + (X(i) - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' + hh + '" rx="5" fill="rgba(255,84,96,.12)" stroke="' + AC + '" stroke-dasharray="4 3" stroke-width="1.5"/>';
    else s += '<path data-tt="' + i + '"' + anim('rise', i * 12) + ' d="M' + (X(i) - bw / 2) + ' ' + (h - pb) + 'V' + (y + 5) + 'Q' + (X(i) - bw / 2) + ' ' + y + ' ' + (X(i) - bw / 2 + 5) + ' ' + y + 'H' + (X(i) + bw / 2 - 5) + 'Q' + (X(i) + bw / 2) + ' ' + y + ' ' + (X(i) + bw / 2) + ' ' + (y + 5) + 'V' + (h - pb) + 'Z" fill="' + (isJ ? AC : NEU) + '"/>';
    if (isJ) s += '<text x="' + X(i) + '" y="' + (y - 6) + '" text-anchor="middle" class="acc">+' + R.jump.pct + ' %</text>';
    if (+x.start.slice(8) <= 7) s += '<text x="' + X(i) + '" y="' + (h - 8) + '" text-anchor="middle">' + monthName(x.start) + '</text>';
  });
  let a4 = ''; ws.forEach((x, i) => { if (x.avg4 != null) a4 += (a4 ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x.avg4).toFixed(1) });
  s += '<path d="' + a4 + '" fill="none" stroke="' + INK + '" stroke-width="1.5" stroke-linejoin="round" opacity=".85"/>';
  if (R.weekTarget) s += '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + Y(R.weekTarget) + '" y2="' + Y(R.weekTarget) + '" stroke="' + AC + '" stroke-width="1" stroke-dasharray="2 3"/><text x="' + (w - pr) + '" y="' + (Y(R.weekTarget) - 5) + '" text-anchor="end" class="acc">Wochenziel ' + f0(R.weekTarget) + ' km' + (R.weekTargetDerived ? ' (abgeleitet)' : '') + '</text>';
  el.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Wochenumfang">' + s + '</svg>' + sr('Wochenumfang', ws.map(x => [x.start, f1(x.km) + ' km']));
  bindTT(el, tt);
}

/* ---------- Ringe ---------- */
function rings(el, vals) {
  const r0 = 78, w = 16, gap = 5; let s = '';
  const cols = [AC, '#ff7a85', '#ffb0b6'];
  vals.forEach((v, i) => {
    const r = r0 - i * (w + gap), len = 2 * Math.PI * r, k = Math.max(0, Math.min(1, v || 0));
    s += '<circle cx="100" cy="100" r="' + r + '" fill="none" stroke="rgba(150,200,255,.12)" stroke-width="' + w + '"/><circle cx="100" cy="100" r="' + r + '" fill="none" stroke="' + cols[i] + '" stroke-width="' + w + '" stroke-linecap="round" stroke-dasharray="' + len + '" stroke-dashoffset="' + (still() ? len * (1 - k) : len) + '" transform="rotate(-90 100 100)" data-k="' + k + '" data-len="' + len + '" style="transition:stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1) ' + (i * .2) + 's"/>';
  });
  el.innerHTML = '<svg viewBox="0 0 200 200" width="100%" style="max-width:240px;margin:0 auto" role="img" aria-label="Drei Ringe">' + s + '</svg>';
  if (!still()) requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll('circle[data-k]').forEach(c => c.setAttribute('stroke-dashoffset', c.dataset.len * (1 - c.dataset.k)))));
}

/* ---------- Kalender ---------- */
function calendar(el, R) {
  const days = R.days, first = days[0].di, pad = wdOf(first);
  const ramp = ['rgba(255,84,96,.28)', 'rgba(255,84,96,.48)', 'rgba(255,84,96,.68)', 'rgba(255,84,96,.88)', '#ffb3b9'];
  const col = d => d.km > 0 ? ramp[d.km <= 6 ? 0 : d.km <= 10 ? 1 : d.km <= 15 ? 2 : d.km <= 22 ? 3 : 4] : d.act ? 'rgba(150,200,255,.24)' : '';
  let h = ''; for (let i = 0; i < pad; i++) h += '<i style="visibility:hidden"></i>';
  const tt = [];
  days.forEach((d, i) => { tt.push({ t: F.dateLong(d.k), rows: [[AC, 'Laufkilometer', f1(d.km) + ' km'], [null, 'Einheiten', String(d.act)]] }); h += '<i data-tt="' + i + '" style="' + (col(d) ? 'background:' + col(d) : '') + '"' + (i === days.length - 1 ? ' class="t"' : '') + '></i>' });
  el.innerHTML = '<div class="cal">' + h + '</div>' + sr('Kalender', days.filter(d => d.km > 0).map(d => [d.k, f1(d.km) + ' km']));
  bindTT(el, tt);
}

/* ---------- Streudiagramm (lockere Läufe) ---------- */
function scatter(el, pts, limit, label) {
  const w = W(el), h = 280, pl = 36, pr = 12, pt = 14, pb = 26;
  if (!pts.length) { el.innerHTML = '<div class="mu">Keine Läufe mit Puls im Zeitraum.</div>'; return }
  const xs = pts.map(p => p.di), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs) + 1;
  const ys = pts.map(p => p.hr).concat([limit]); const y0 = Math.floor(Math.min.apply(null, ys) / 5) * 5 - 5, y1 = Math.ceil(Math.max.apply(null, ys) / 5) * 5 + 5;
  const X = v => pl + (w - pl - pr) * (v - x0) / (x1 - x0 || 1), Y = v => pt + (h - pt - pb) * (1 - (v - y0) / (y1 - y0));
  let s = ''; for (let v = y0; v <= y1; v += 10) s += '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="' + GR + '"/><text x="' + (pl - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v + '</text>';
  s += '<rect x="' + pl + '" y="' + pt + '" width="' + (w - pl - pr) + '" height="' + (Y(limit) - pt) + '" fill="rgba(255,84,96,.1)"/><line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + Y(limit) + '" y2="' + Y(limit) + '" stroke="' + AC + '" stroke-width="2"/><text x="' + (pl + 6) + '" y="' + (pt + 14) + '" class="acc">' + esc(label) + '</text>';
  const tt = [];
  pts.forEach((p, i) => { tt.push({ t: F.dateLong(C.keyOfIdx(p.di)), rows: [[null, 'Puls', f0(p.hr)], [null, 'Tempo', F.pace(p.pace) + ' /km'], [null, 'Strecke', f1(p.km) + ' km']] }); s += '<circle data-tt="' + i + '" cx="' + X(p.di) + '" cy="' + Y(p.hr) + '" r="6.5" fill="' + (p.hr >= limit ? AC : NEU) + '" stroke="#fff" stroke-width="2"/>' });
  let lm = ''; for (let di = x0; di <= x1; di++) { const k = C.keyOfIdx(di); if (k.slice(8) === '01') { s += '<text x="' + X(di) + '" y="' + (h - 8) + '" text-anchor="middle">' + monthName(k) + '</text>' } }
  el.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Läufe nach Puls">' + s + '</svg>' + sr('Läufe', pts.map(p => [C.keyOfIdx(p.di), 'Puls ' + f0(p.hr)]));
  bindTT(el, tt);
}

/* ---------- Tempo bei gleichem Puls ---------- */
function paceChart(el, months) {
  const w = W(el), h = 250, pl = 44, pr = 36, pt = 18, pb = 26;
  if (months.length < 2) { el.innerHTML = '<div class="mu">Zu wenige Monate mit je drei sauberen Läufen im Pulsband – kein Verlauf.</div>'; return }
  const ps = months.map(m => m.pace), lo = Math.floor(Math.min.apply(null, ps) / 10) * 10 - 10, hi = Math.ceil(Math.max.apply(null, ps) / 10) * 10 + 10;
  const X = i => pl + (w - pl - pr) * i / (months.length - 1), Y = v => pt + (h - pt - pb) * ((v - lo) / (hi - lo)); // schneller = oben
  let s = ''; for (let v = Math.ceil(lo / 20) * 20; v <= hi; v += 20) s += '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="' + GR + '"/><text x="' + (pl - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + F.pace(v) + '</text>';
  s += '<text x="' + pl + '" y="10">min/km · schneller ↑</text>';
  const pth = months.map((m, i) => (i ? 'L' : 'M') + X(i) + ' ' + Y(m.pace)).join('');
  s += '<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + AC + '" stop-opacity=".3"/><stop offset="1" stop-color="' + AC + '" stop-opacity="0"/></linearGradient></defs><path d="' + pth + 'L' + X(months.length - 1) + ' ' + (h - pb) + 'L' + X(0) + ' ' + (h - pb) + 'Z" fill="url(#pg)"/><path d="' + pth + '" fill="none" stroke="' + AC + '" stroke-width="2" stroke-linejoin="round"/>';
  const n = months.length, mx = (n - 1) / 2, my = C.mean(ps); let sxy = 0, sxx = 0; months.forEach((m, i) => { sxy += (i - mx) * (m.pace - my); sxx += (i - mx) ** 2 });
  const b = sxx ? sxy / sxx : 0; s += '<line x1="' + X(0) + '" y1="' + Y(my - b * mx) + '" x2="' + X(n - 1) + '" y2="' + Y(my + b * (n - 1 - mx)) + '" stroke="' + INK + '" stroke-dasharray="5 4" opacity=".7"/>';
  const tt = [];
  months.forEach((m, i) => { tt.push({ t: monthName(m.m + '-01') + ' ' + m.m.slice(0, 4), rows: [[AC, 'Tempo (Median)', F.pace(m.pace) + ' /km'], [null, 'Läufe', String(m.n)]] }); const last = i === n - 1; s += '<circle data-tt="' + i + '" cx="' + X(i) + '" cy="' + Y(m.pace) + '" r="' + (last ? 6 : 5) + '" fill="' + (last ? AC : BG) + '" stroke="' + (last ? '#fff' : AC) + '" stroke-width="2"/><text x="' + X(i) + '" y="' + (h - 8) + '" text-anchor="middle">' + monthName(m.m + '-01') + '</text>'; if (last) s += '<text x="' + X(i) + '" y="' + (Y(m.pace) - 12) + '" text-anchor="middle" class="acc">' + F.pace(m.pace) + '</text>' });
  el.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Tempo bei gleichem Puls">' + s + '</svg>' + sr('Tempo je Monat', months.map(m => [m.m, F.pace(m.pace)]));
  bindTT(el, tt);
}

/* ---------- Glockenkurve (Race Day) ---------- */
function bell(el, rd, target) {
  const w = W(el), h = 250, pl = 12, pr = 12, pt = 40, pb = 54, sd = rd.sd, mu = rd.race;
  const lo = mu - 3.2 * sd, hi = mu + 3.2 * sd, X = t => pl + (w - pl - pr) * (t - lo) / (hi - lo);
  const pdf = t => Math.exp(-0.5 * ((t - mu) / sd) ** 2), Y = t => pt + (h - pt - pb) * (1 - pdf(t));
  const N = 90; let line = '', area = '';
  for (let i = 0; i <= N; i++) { const t = lo + (hi - lo) * i / N; line += (i ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(t).toFixed(1) }
  const tc = Math.max(lo, Math.min(hi, target)); let a = 'M' + X(lo) + ' ' + (h - pb);
  for (let i = 0; i <= N; i++) { const t = lo + (tc - lo) * i / N; a += 'L' + X(t).toFixed(1) + ' ' + Y(t).toFixed(1) }
  a += 'L' + X(tc) + ' ' + (h - pb) + 'Z';
  let s = '<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + AC + '" stop-opacity=".6"/><stop offset="1" stop-color="' + AC + '" stop-opacity=".08"/></linearGradient></defs><path d="' + line + 'L' + X(hi) + ' ' + (h - pb) + 'L' + X(lo) + ' ' + (h - pb) + 'Z" fill="rgba(160,205,255,.1)"/><path d="' + a + '" fill="url(#bg)"/><path d="' + line + '" fill="none" stroke="' + NEU + '" stroke-width="1.5"/>';
  const step = sd * 3.2 * 2 / 6 > 600 ? 600 : sd * 3.2 * 2 / 6 > 240 ? 300 : sd * 3.2 * 2 / 6 > 90 ? 120 : 60;
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) s += '<line x1="' + X(t) + '" x2="' + X(t) + '" y1="' + (h - pb) + '" y2="' + (h - pb + 4) + '" stroke="' + TXT + '"/><text x="' + X(t) + '" y="' + (h - pb + 16) + '" text-anchor="middle">' + F.time(t) + '</text>';
  s += '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + (h - pb) + '" y2="' + (h - pb) + '" stroke="' + GR + '"/>';
  s += '<line x1="' + X(mu) + '" x2="' + X(mu) + '" y1="' + pt + '" y2="' + (h - pb) + '" stroke="' + INK + '" stroke-dasharray="4 4" opacity=".8"/><text x="' + X(mu) + '" y="' + (h - 18) + '" text-anchor="middle" class="v">' + F.time(mu) + '</text><text x="' + X(mu) + '" y="' + (h - 5) + '" text-anchor="middle">am Renntag</text>';
  s += '<line x1="' + X(tc) + '" x2="' + X(tc) + '" y1="' + (pt - 6) + '" y2="' + (h - pb) + '" stroke="' + AC + '" stroke-width="2.5"/><circle cx="' + X(tc) + '" cy="' + Y(tc) + '" r="6" fill="' + AC + '" stroke="#fff" stroke-width="2"/><text x="' + X(tc) + '" y="' + (pt - 14) + '" text-anchor="' + (X(tc) < 70 ? 'start' : X(tc) > w - 70 ? 'end' : 'middle') + '" class="acc">Ziel ' + F.time(target) + '</text>';
  s += '<text x="' + pl + '" y="' + (pt + 10) + '">← schneller</text><text x="' + (w - pr) + '" y="' + (pt + 10) + '" text-anchor="end">langsamer →</text>';
  s += '<rect id="bhit" x="' + pl + '" y="0" width="' + (w - pl - pr) + '" height="' + h + '" fill="transparent"/>';
  el.innerHTML = '<svg id="bsvg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Verteilung möglicher Renntagszeiten" style="touch-action:pan-y">' + s + '</svg>';
  const svg = el.querySelector('svg'); const mv = e => { const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * (w / r.width), t = lo + (x - pl) / (w - pl - pr) * (hi - lo); showTip(e.clientX, e.clientY, { t: F.time(t), rows: [[AC, 'Chance auf diese Zeit oder schneller', f0(C.cdf((t - mu) / sd) * 100) + ' %']] }) };
  svg.setAttribute('data-xh', '1'); svg.addEventListener('pointermove', mv); svg.addEventListener('pointerdown', mv); svg.addEventListener('pointerleave', hideTip);
}

/* ---------- Pulszonen-Balken, Gewohnheit ---------- */
const ZC = ['rgba(255,84,96,.2)', 'rgba(255,84,96,.38)', 'rgba(255,84,96,.58)', 'rgba(255,84,96,.8)', '#ff5460'];
function zoneBar(el, pct, zones) {
  const names = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'], rng = [' < ' + zones[0], zones[0] + '–' + (zones[1] - 1), zones[1] + '–' + (zones[2] - 1), zones[2] + '–' + (zones[3] - 1), '≥ ' + zones[3]];
  el.innerHTML = '<div style="display:flex;gap:2px;height:44px;border-radius:12px;overflow:hidden">' + pct.map((p, i) => '<i style="flex:' + Math.max(p, .0001) + ';background:' + ZC[i] + '" title="' + names[i] + '"></i>').join('') + '</div><div style="display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:10px;font-size:12.5px;color:var(--ink2)">' + pct.map((p, i) => '<span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + ZC[i] + ';margin-right:6px"></i>' + names[i] + ' · ' + rng[i] + ' · <b>' + f0(p) + ' %</b></span>').join('') + '</div>';
}
function habitGrid(el, hb) {
  const w = W(el), cw = (w - 30) / 24, rh = 26, h = 7 * rh + 22, mx = Math.max.apply(null, hb.grid.map(r => Math.max.apply(null, r)).concat([1]));
  let s = ''; const tt = [];
  C.WD.forEach((d, wd) => { s += '<text x="0" y="' + (wd * rh + 17) + '">' + d + '</text>'; for (let hh = 0; hh < 24; hh++) { const n = hb.grid[wd][hh], isTop = hb.top.n && hb.top.wd === wd && hb.top.h === hh; tt.push({ t: C.WDL[wd] + ', ' + hh + ' Uhr', rows: [[AC, 'Läufe', String(n)]] }); const cx = 30 + hh * cw + cw / 2, cy = wd * rh + 13; if (n) s += '<circle data-tt="' + (tt.length - 1) + '" cx="' + cx + '" cy="' + cy + '" r="' + (Math.sqrt(n / mx) * Math.min(11, cw / 2 - 1)).toFixed(1) + '" fill="' + AC + '" fill-opacity="' + (.35 + .65 * n / mx).toFixed(2) + '"' + (isTop ? ' stroke="#fff" stroke-width="2"' : '') + '/>'; else s += '<circle data-tt="' + (tt.length - 1) + '" cx="' + cx + '" cy="' + cy + '" r="1.6" fill="rgba(150,200,255,.2)"/>' } });
  for (let hh = 0; hh < 24; hh += 3) s += '<text x="' + (30 + hh * cw + cw / 2) + '" y="' + (h - 4) + '" text-anchor="middle">' + hh + '</text>';
  el.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Läufe nach Wochentag und Uhrzeit">' + s + '</svg>';
  bindTT(el, tt);
}

window.TrainingViz = { skyline, formChart, gauge, weeksChart, rings, calendar, scatter, paceChart, bell, zoneBar, habitGrid, showTip, hideTip, esc, sr };
})();
