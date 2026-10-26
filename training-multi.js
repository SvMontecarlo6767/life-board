/* Life Board – Training, Allround-Ansicht: alle Sportarten, Einheiten per Hand eintragen, Wochenziel in Einheiten.
   Rechnen steckt in training-core.js (Belastung, Form, Wochen); hier nur Texte und Aufbau. Alles regelbasiert, keine KI. */
(function () {
'use strict';
const C = window.TrainingCore, V = window.TrainingViz, F = C.fmt, esc = V.esc;
const f0 = v => F.num(v, 0), f1 = v => F.num(v, 1);
const $ = id => document.getElementById(id);
const SC = { Lauf: '#ff5460', Trail: '#ff7a85', Rad: '#6fd3ff', Kraft: '#ff9a5c', Wandern: '#5ee6a8', Schwimmen: '#4fa8ff', 'Fußball': '#d8ff4f', Basketball: '#ffd24f', Tennis: '#b8e04f', Klettern: '#b58cff', HIIT: '#ff6fb5', Yoga: '#9be7d8', Isometrie: '#7fe3ff', Plyometrie: '#ffe066', Sonstiges: '#8fa6bd' };
const EMO = { Lauf: '🏃', Trail: '⛰️', Rad: '🚴', Kraft: '🏋️', Wandern: '🥾', Schwimmen: '🏊', 'Fußball': '⚽', Basketball: '🏀', Tennis: '🎾', Klettern: '🧗', HIIT: '🔥', Yoga: '🧘', Isometrie: '🧱', Plyometrie: '⚡', Sonstiges: '✨' };
const KM_SPORTS = ['Lauf', 'Trail', 'Rad', 'Wandern', 'Schwimmen'];
const RPE_W = ['', 'kaum', 'sehr leicht', 'leicht', 'locker', 'mittel', 'fordernd', 'hart', 'sehr hart', 'am Limit', 'alles'];
const S = { R: null, ctx: null, sport: 'Kraft', rpe: 6, wmode: 'h', skymode: 'h', logSport: 'Alle', logAll: false, draft: null, todo: {} };

const sc = s => SC[s] || '#8fa6bd';
const hrs = sec => sec / 3600;
const dur = sec => { const m = Math.round(sec / 60); return m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min' : m + ' min' };
const wdOf = di => (((di + 3) % 7) + 7) % 7;
const pl = (n, a, b) => n === 1 ? a : b;

/* ---------- Texte ---------- */
/* Ohne eigenes Wochenziel: dein Schnitt der letzten 8 vollen Wochen (mindestens 3) */
function autoGoal(R) { const d = R && R.weeks ? R.weeks.filter(w => !w.cur).slice(-8) : []; return d.length ? Math.max(3, Math.round(d.reduce((s, w) => s + w.sessions, 0) / d.length)) : 3 }
function stats(R, st) {
  const goal = st.goal || autoGoal(R), wk = R.weeks[R.weeks.length - 1], done = R.weeks.filter(w => !w.cur);
  const last = R.log[0], since = last ? R.todayDi - C.dayIdxOfKey(last.date) : null;
  const l8 = done.slice(-8), hit = l8.filter(w => w.sessions >= goal).length;
  let streak = 0; for (let i = done.length - 1; i >= 0 && done[i].sessions >= goal; i--) streak++;
  const d28 = R.log.filter(a => R.todayDi - C.dayIdxOfKey(a.date) < 28), kinds = new Set(d28.map(a => a.sport));
  return { goal, wk, last, since, hit, n8: l8.length, streak, kinds: kinds.size, d28: d28.length };
}
function narrate(R, st, hour) {
  const name = st.name || '';
  const hello = hour < 5 ? 'Noch wach' : hour < 11 ? 'Guten Morgen' : hour < 17 ? 'Hallo' : hour < 22 ? 'Guten Abend' : 'Späte Stunde';
  if (!R || !R.ok) return { hello, name, head: ['Los', 'geht’s'], text: 'Trag deine erste Einheit ein – Sportart, Dauer, wie anstrengend es war. Nach ein paar Einheiten siehst du Form, Wochenziel und deine Sportarten.', chips: [], greeting: 'Noch keine Einheiten gespeichert.' };
  const q = stats(R, st), acwr = R.acwr, form = R.form;
  let head, text;
  if (q.since != null && q.since >= 7) { head = ['Zeit für', 'den Neustart']; text = 'Deine letzte Einheit ist ' + q.since + ' Tage her. Eine leichte, kurze reicht, um wieder reinzukommen – danach fühlt sich die Woche anders an.' }
  else if (acwr != null && acwr > 1.5) { head = ['Etwas', 'zu viel auf einmal']; text = 'Deine Belastung der letzten sieben Tage liegt beim ' + F.num(acwr, 1) + '-Fachen deines Schnitts. Plane ein, zwei lockere oder freie Tage ein, bevor es weitergeht.' }
  else if (form < -25) { head = ['Du bist', 'ziemlich platt']; text = 'Die Ermüdung liegt deutlich über deiner Fitness (Form ' + F.signed(form, 0) + '). Schlaf und ein lockerer Tag bringen mehr als die nächste harte Einheit.' }
  else if (q.wk.sessions >= q.goal) { head = ['Wochenziel', 'erreicht']; text = q.wk.sessions + ' von ' + q.goal + ' Einheiten, ' + f1(q.wk.hours) + ' Stunden. ' + (q.streak >= 2 ? 'Das ist die ' + (q.streak + 1) + '. Woche in Folge, in der du dein Ziel schaffst.' : 'Alles darüber ist Bonus – und Erholung zählt auch.') }
  else if (q.n8 >= 6 && q.hit >= 6) { head = ['Richtig', 'konstant']; text = 'In ' + q.hit + ' der letzten ' + q.n8 + ' Wochen hast du dein Ziel von ' + q.goal + ' Einheiten geschafft. Diese Woche: ' + q.wk.sessions + ' von ' + q.goal + '.' }
  else if (form > 8 && q.since != null && q.since <= 2) { head = ['Frisch', 'und bereit']; text = 'Die Form steht bei ' + F.signed(form, 0) + ' – du bist erholt und im Rhythmus. Ein guter Moment für eine fordernde Einheit.' }
  else { head = ['Weiter', 'so']; text = 'Diese Woche ' + q.wk.sessions + ' von ' + q.goal + ' Einheiten, ' + f1(q.wk.hours) + ' Stunden. ' + (q.hit && q.n8 ? 'In ' + q.hit + ' der letzten ' + q.n8 + ' Wochen hast du dein Ziel geschafft.' : 'Bleib dran, die Fitness baut sich über Wochen auf.') }
  const chips = ['Form ' + F.signed(form, 0), q.wk.sessions + '/' + q.goal + ' diese Woche']; if (q.kinds > 1) chips.push(q.kinds + ' Sportarten in 4 Wochen');
  return { hello, name, head, text, chips, q, greeting: text };
}

/* ---------- Diagramme ---------- */
function weekSport(R, n) {
  const ws = R.weeks.slice(-n), idx = new Map(ws.map((w, i) => [w.di, i])), rows = ws.map(() => ({}));
  R._L.forEach(a => { const i = idx.get(a.loc.di - a.loc.wd); if (i == null) return; const r = rows[i]; r[a.sport] = r[a.sport] || { h: 0, n: 0 }; r[a.sport].h += hrs(a.sec); r[a.sport].n++ });
  return { ws, rows };
}
function weeksStack(el, R, goal, mode) {
  const n = 26, d = weekSport(R, n), w = V.W(el), h = 260, pl_ = 34, pr = 8, pt = 14, pb = 24, key = mode === 'n' ? 'n' : 'h';
  const tot = d.rows.map(r => Object.values(r).reduce((s, x) => s + x[key], 0));
  const mx = Math.max.apply(null, tot.concat([mode === 'n' ? goal : 2, mode === 'n' ? 3 : 2])) * 1.15;
  const bw = Math.min(22, (w - pl_ - pr) / n * .7), X = i => pl_ + (w - pl_ - pr) * (i + .5) / n, Y = v => pt + (h - pt - pb) * (1 - v / mx);
  let s = V.grid(w, h, pl_, pr, pt, pb, mx, '', 4); const tt = [];
  d.ws.forEach((x, i) => {
    let acc = 0; const rows = [];
    Object.keys(d.rows[i]).sort((a, b) => d.rows[i][b][key] - d.rows[i][a][key]).forEach(sp => {
      const v = d.rows[i][sp][key], y0 = Y(acc), y1 = Y(acc + v); acc += v;
      s += '<rect data-tt="' + i + '" x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1, y0 - y1).toFixed(1) + '" fill="' + sc(sp) + '"' + (x.cur ? ' fill-opacity=".6" stroke="' + sc(sp) + '"' : '') + '/>';
      rows.push([sc(sp), sp, mode === 'n' ? v + ' ×' : f1(v) + ' h']);
    });
    tt.push({ t: 'Woche ab ' + F.dateShort(x.start) + (x.cur ? ' (läuft)' : ''), rows: rows.length ? rows.concat([[null, 'Belastung', f0(x.load)]]) : [[null, 'Keine Einheit', '']] });
    if (!rows.length) s += '<rect data-tt="' + i + '" x="' + (X(i) - bw / 2) + '" y="' + (h - pb - 3) + '" width="' + bw + '" height="3" rx="1.5" fill="rgba(150,200,255,.2)"/>';
    if (+x.start.slice(8) <= 7) s += '<text x="' + X(i) + '" y="' + (h - 8) + '" text-anchor="middle">' + V.monthName(x.start) + '</text>';
  });
  if (mode === 'n') s += '<line x1="' + pl_ + '" x2="' + (w - pr) + '" y1="' + Y(goal) + '" y2="' + Y(goal) + '" stroke="#d8ff4f" stroke-dasharray="5 4"/><text x="' + (w - pr) + '" y="' + (Y(goal) - 5) + '" text-anchor="end" fill="#d8ff4f">Ziel ' + goal + '</text>';
  el.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Wochen nach Sportart">' + s + '</svg>' + V.sr('Wochen', d.ws.map((x, i) => [x.start, f1(tot[i]) + (mode === 'n' ? ' Einheiten' : ' h')]));
  V.bindTT(el, tt);
}
function calendar(el, R) {
  const days = R.days, pad = wdOf(days[0].di), tt = [];
  const ramp = ['rgba(255,84,96,.3)', 'rgba(255,84,96,.5)', 'rgba(255,84,96,.7)', 'rgba(255,84,96,.9)', '#ffb3b9'];
  let h = ''; for (let i = 0; i < pad; i++) h += '<i style="visibility:hidden"></i>';
  days.forEach((d, i) => { const c = d.h > 0 ? ramp[d.h <= .5 ? 0 : d.h <= 1 ? 1 : d.h <= 1.75 ? 2 : d.h <= 2.75 ? 3 : 4] : d.act ? 'rgba(150,200,255,.24)' : ''; tt.push({ t: F.dateLong(d.k), rows: [['#ff5460', 'Training', f1(d.h) + ' h'], [null, 'Einheiten', String(d.act)]] }); h += '<i data-tt="' + i + '" style="' + (c ? 'background:' + c : '') + '"' + (i === days.length - 1 ? ' class="t"' : '') + '></i>' });
  el.innerHTML = '<div class="cal">' + h + '</div>' + V.sr('Kalender', days.filter(d => d.h > 0).map(d => [d.k, f1(d.h) + ' h']));
  V.bindTT(el, tt);
}
function habit(R) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0)); let top = { n: 0, wd: 0, h: 0 };
  R.log.forEach(a => { const wd = wdOf(C.dayIdxOfKey(a.date)); grid[wd][a.h]++ });
  grid.forEach((r, wd) => r.forEach((n, h) => { if (n > top.n) top = { n, wd, h } }));
  return { grid, top, n: R.log.length };
}

/* ---------- Noch ergänzen: Whoop-Einheiten kurz nachtragen ---------- */
const FOCUS = { Kraft: ['Ganzkörper', 'Oberkörper', 'Unterkörper', 'Push', 'Pull', 'Beine', 'Rumpf'], Isometrie: ['Beine', 'Oberkörper', 'Rumpf', 'Ganzkörper'], Plyometrie: ['Sprungkraft', 'Sprint', 'Reaktivkraft', 'Beine'],
  'Fußball': ['Training', 'Spiel', 'Technik', 'Athletik'], Lauf: ['Locker', 'Intervalle', 'Tempo', 'Lang'], Trail: ['Locker', 'Lang', 'Berg'], Rad: ['Locker', 'Intervalle', 'Lang'], HIIT: ['Intervalle', 'Zirkel'] };
const PICK = ['Kraft', 'Isometrie', 'Plyometrie', 'Fußball', 'Lauf', 'Rad', 'HIIT', 'Sonstiges'];
function pendingActs(R) { return R && R._L ? R._L.filter(a => a.src === 'whoop' && !a.ok && R.todayDi - a.loc.di <= 14).sort((a, b) => b.t - a.t).slice(0, 6) : [] }
function pendingCard(R) {
  const P = pendingActs(R); if (!P.length) return '';
  return '<div class="g" id="m-todo"><div class="card s12"><h2>Noch ergänzen <span class="mu" style="font-size:14px;font-weight:400">' + P.length + ' ' + pl(P.length, 'Einheit', 'Einheiten') + ' von Whoop</span></h2><div class="sub">Was war das genau? Ein paar Tipps – dann stimmen Sportart, Balance und Belastung.</div>' +
    P.map(a => { const d = S.todo[a.id] || (S.todo[a.id] = { sport: PICK.includes(a.sport) ? a.sport : (/functional|weight|strength/i.test(a.raw) ? 'Kraft' : 'Sonstiges'), focus: a.focus || '', rpe: a.rpe || 0, note: a.note || '' });
      const fo = FOCUS[d.sport] || ['Locker', 'Intensiv', 'Technik'];
      return '<div class="todo" data-id="' + esc(a.id) + '"><div class="th"><b>' + esc(a.raw || 'Workout') + '</b><span class="mu">' + F.date(a.loc.key) + ' · ' + String(a.loc.h).padStart(2, '0') + ':' + String(a.loc.mi).padStart(2, '0') + ' · ' + dur(a.sec) + (a.strain ? ' · Strain ' + F.num(a.strain, 1) : '') + (a.hr ? ' · Ø ' + a.hr + ' bpm' : '') + '</span></div>' +
        '<div class="chips" role="group" aria-label="Sportart">' + PICK.map(sp => '<button type="button" class="chip' + (sp === d.sport ? ' on' : '') + '" data-tsp="' + sp + '">' + (EMO[sp] || '') + ' ' + sp + '</button>').join('') + '</div>' +
        '<div class="chips" role="group" aria-label="Fokus" style="margin-top:6px">' + fo.map(f => '<button type="button" class="chip' + (f === d.focus ? ' on' : '') + '" data-tfo="' + esc(f) + '">' + esc(f) + '</button>').join('') + '</div>' +
        '<div class="rpe" role="group" aria-label="Anstrengung"><span class="mu">Anstrengung</span>' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => '<button type="button" data-trp="' + n + '" aria-pressed="' + (n === d.rpe) + '">' + n + '</button>').join('') + '</div>' +
        '<input type="text" class="tnote" maxlength="200" placeholder="Notiz: Gefühl, Schmerzen, was gut lief …" value="' + esc(d.note) + '">' +
        '<div class="btns"><button type="button" class="primary" data-tsave>Speichern</button>' + (['Kraft', 'Isometrie', 'Plyometrie'].includes(d.sport) && window.TrainingGym && TrainingGym.start ? '<button type="button" data-tgym>Speichern + Übungen eintragen</button>' : '') + '<button type="button" data-tskip title="So lassen">Passt so</button></div></div>' }).join('') + '</div></div>';
}
function bindTodo(host) {
  host.querySelectorAll('.todo').forEach(el => {
    const id = el.dataset.id, d = S.todo[id], a = S.R._L.find(x => x.id === id); if (!d || !a) return;
    const rerender = () => { render(S.host, S.R, S.ctx); const n = host.querySelector('.todo[data-id="' + CSS.escape(id) + '"]'); if (n) n.scrollIntoView({ block: 'nearest' }) };
    el.querySelectorAll('[data-tsp]').forEach(b => b.addEventListener('click', () => { d.sport = b.dataset.tsp; d.focus = ''; rerender() }));
    el.querySelectorAll('[data-tfo]').forEach(b => b.addEventListener('click', () => { d.focus = d.focus === b.dataset.tfo ? '' : b.dataset.tfo; rerender() }));
    el.querySelectorAll('[data-trp]').forEach(b => b.addEventListener('click', () => { d.rpe = +b.dataset.trp; rerender() }));
    el.querySelector('.tnote').addEventListener('input', e => { d.note = e.target.value });
    const save = async () => { await S.ctx.complete(id, { sport: d.sport, focus: d.focus, rpe: d.rpe || null, note: d.note }); delete S.todo[id] };
    el.querySelector('[data-tsave]').addEventListener('click', async () => { try { await save(); S.ctx.say('Ergänzt.') } catch (e) { S.ctx.say(e.message, true) } });
    el.querySelector('[data-tskip]').addEventListener('click', async () => { try { await S.ctx.complete(id, { sport: a.sport, focus: a.focus, rpe: a.rpe, note: a.note }); delete S.todo[id] } catch (e) { S.ctx.say(e.message, true) } });
    const g = el.querySelector('[data-tgym]'); if (g) g.addEventListener('click', async () => {
      const plan = d.focus || d.sport;   // passt der Fokus zu einem deiner Workouts, wird es geladen
      try { await save(); TrainingGym.start({ plan, date: a.loc.key, min: Math.round(a.sec / 60), link: id, rpe: d.rpe || null }); const gb = $('m-gym'); if (gb) gb.scrollIntoView({ block: 'start' }) } catch (e) { S.ctx.say(e.message, true) } });
  });
}

/* ---------- Balance: Kraft, Ausdauer, Explosiv, Fußball pro Woche ---------- */
const CAT = { Kraft: 'kraft', Isometrie: 'kraft', Plyometrie: 'explosiv', HIIT: 'explosiv', Lauf: 'ausdauer', Trail: 'ausdauer', Rad: 'ausdauer', Schwimmen: 'ausdauer', Wandern: 'ausdauer', 'Fußball': 'fussball' };
const CATS = [['kraft', 'Kraft', '🏋️'], ['ausdauer', 'Ausdauer', '🏃'], ['explosiv', 'Explosiv', '⚡'], ['fussball', 'Fußball', '⚽']];
function balance(R, st) {
  const tgt = Object.assign({ kraft: 2, ausdauer: 2, explosiv: 1, fussball: 2 }, st.balance || {});
  const wk = R.weeks.slice(-5).map(w => { const c = { kraft: 0, ausdauer: 0, explosiv: 0, fussball: 0 }; R._L.forEach(a => { if (a.loc.di - a.loc.wd !== w.di) return; const k = CAT[a.sport]; if (k) c[k]++ }); return { w, c } });
  return { tgt, wk };
}
function balanceCard(R, st) {
  const B = balance(R, st), cur = B.wk[B.wk.length - 1], left = 6 - (R.todayDi - cur.w.di);
  const lamp = (n, t, running) => n >= t ? 'lg' : (running || n >= 1) && n >= t - 1 ? 'ly' : 'lr';   // Ampel: lg grün, ly gelb, lr rot
  return '<div class="card s12" id="m-bal"><h2>Balance diese Woche</h2><div class="sub">Allround heißt: von allem genug. Ziel pro Woche in Klammern' + (left > 0 ? ' · noch ' + left + ' ' + pl(left, 'Tag', 'Tage') : '') + '.</div><div class="bal">' +
    CATS.map(([k, n, e]) => { const v = cur.c[k], t = B.tgt[k], l = lamp(v, t, left > 0); return '<div class="bc ' + l + '"><i></i><span>' + e + ' ' + n + '</span><b>' + v + '<small> (' + t + ')</small></b><em>' + (v >= t ? 'erreicht' : left > 0 ? 'noch ' + (t - v) : 'fehlt ' + (t - v)) + '</em></div>' }).join('') +
    '</div><table class="baltb"><tr><th>Woche</th>' + CATS.map(c => '<th>' + c[2] + '</th>').join('') + '</tr>' + B.wk.slice(0, -1).reverse().map(x => '<tr><td>ab ' + F.dateShort(x.w.start) + '</td>' + CATS.map(([k]) => '<td class="' + lamp(x.c[k], B.tgt[k], false) + '">' + x.c[k] + '</td>').join('') + '</tr>').join('') + '</table>' +
    '<details style="margin-top:8px"><summary>Ziele pro Woche ändern</summary><div class="balset">' + CATS.map(([k, n, e]) => '<label>' + e + ' ' + n + ' <input type="number" min="0" max="14" inputmode="numeric" data-bt="' + k + '" value="' + B.tgt[k] + '"></label>').join('') + '<button type="button" id="balSave">Speichern</button></div></details></div>';
}
function bindBalance(host) {
  const b = $('balSave'); if (!b) return;
  b.addEventListener('click', async () => { const o = {}; host.querySelectorAll('[data-bt]').forEach(i => { o[i.dataset.bt] = Math.max(0, Math.min(14, parseInt(i.value, 10) || 0)) }); try { await S.ctx.saveProfile({ balance: o }) } catch (e) { S.ctx.say(e.message, true) } });
}

/* ---------- Bestwerte: Klimmzüge, 5 km, 10 km ---------- */
function bestCard(R, ctx) {
  const gym = (ctx.gym && ctx.gym.sessions) || [], pull = [];
  gym.forEach(s => s.ex.forEach(e => { if (!/klimmz|pull-?up|chin/i.test(e.n)) return; let bw = 0, wt = null; e.s.forEach(x => { if (!x.w && x.r > bw) bw = x.r; if (x.w > 0 && (!wt || x.w > wt.w || (x.w === wt.w && x.r > wt.r))) wt = { w: x.w, r: x.r } }); pull.push({ date: s.date, bw, wt }) }));
  pull.sort((a, b) => a.date < b.date ? -1 : 1);
  const bwBest = pull.reduce((b, x) => !b || x.bw > b.bw ? x : b, null), wtBest = pull.filter(x => x.wt).reduce((b, x) => !b || x.wt.w > b.wt.w || (x.wt.w === b.wt.w && x.wt.r > b.wt.r) ? x : b, null);
  const last = pull[pull.length - 1];
  const tm = sec => { sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s2 = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s2).padStart(2, '0') };
  const pb = R.pb || {}, pred = id => { const dm = id === '5k' ? 5000 : 10000, x = (R.pred || []).find(p => Math.abs(p.dm - dm) < 60); return x ? x.sec : null };
  const longer = km => R._L.filter(a => (a.sport === 'Lauf' || a.sport === 'Trail') && a.km >= km && a.sec > 0).map(a => ({ sec: a.sec / a.km * km, date: a.loc.key, km: a.km })).sort((x, y) => x.sec - y.sec)[0];
  const run = (id, n) => { const km = id === '5k' ? 5 : 10, b = pb[id], p = pred(id), l = !b && longer(km);   // ohne passenden Lauf: aus dem schnellsten längeren Lauf hochgerechnet
    return '<div class="rec"><span>' + n + '</span><b>' + (b ? tm(b.sec) : l ? '≈ ' + tm(l.sec) : '–') + '</b><small>' + (b ? F.date(b.date) + (b.km > km * 1.01 ? ' · aus ' + F.num(b.km, 1) + ' km' : '') : l ? 'Ø-Tempo deines schnellsten Laufs über ' + F.num(l.km, 1) + ' km (' + F.date(l.date) + ')' : 'noch kein Lauf über ' + n) + (p ? '<br>Prognose aus deiner Form: ' + tm(p) : '') + '</small></div>' };
  return '<div class="card s12" id="m-best"><h2>Bestwerte</h2><div class="sub">Was du über die Zeit verbessern willst. Klimmzüge aus dem Gym-Logbuch, Laufzeiten aus deinen Läufen.</div><div class="tiles4">' +
    '<div class="rec"><span>Klimmzüge am Stück</span><b>' + (bwBest && bwBest.bw ? bwBest.bw : '–') + '</b><small>' + (bwBest && bwBest.bw ? F.date(bwBest.date) : 'im Gym-Logbuch „Klimmzüge“ eintragen') + (last && bwBest && last !== bwBest && last.bw ? '<br>zuletzt ' + last.bw + ' (' + F.date(last.date) + ')' : '') + '</small></div>' +
    '<div class="rec"><span>Klimmzüge mit Gewicht</span><b>' + (wtBest ? '+' + F.num(wtBest.wt.w, wtBest.wt.w % 1 ? 1 : 0) + ' kg' : '–') + '</b><small>' + (wtBest ? '× ' + wtBest.wt.r + ' · ' + F.date(wtBest.date) : 'Zusatzgewicht als kg eintragen') + '</small></div>' +
    run('5k', '5 km') + run('10k', '10 km') + '</div>' +
    (pull.length >= 2 ? '<div class="mu" style="margin-top:8px">Klimmzüge-Verlauf (beste Serie ohne Gewicht): ' + pull.slice(-8).map(x => x.bw || '·').join(' → ') + '</div>' : '') + '</div>';
}

/* ---------- Aufbau ---------- */
function addCard(R, st) {
  const last = R && R.ok ? R.log[0] : null, today = S.ctx.todayKey;
  const d = S.draft || { date: today, min: '', km: '', hr: '', name: '' };
  const showKm = KM_SPORTS.includes(S.sport);
  return '<div class="card s7 fm" id="m-add"><h2>Einheit eintragen</h2><div class="sub">Dauert zehn Sekunden: Sportart, Dauer, wie anstrengend.</div>' +
    (last ? '<div style="margin:8px 0"><button class="chip" id="mAgain" type="button">' + (EMO[last.sport] || '') + ' Wie zuletzt: ' + esc(last.sport) + ' · ' + Math.round(last.sec / 60) + ' min' + (last.rpe ? ' · ' + last.rpe + '/10' : '') + '</button></div>' : '') +
    '<label>Sportart</label><div class="chips" id="mSports" role="group" aria-label="Sportart">' + C.SPORTS.map(s => '<button type="button" class="chip' + (s === S.sport ? ' on' : '') + '" data-s="' + esc(s) + '" aria-pressed="' + (s === S.sport) + '">' + (EMO[s] || '') + ' ' + esc(s) + '</button>').join('') + '</div>' +
    '<div class="row"><div><label for="mDate">Datum</label><input id="mDate" type="date" max="' + today + '" value="' + esc(d.date) + '"></div><div><label for="mMin">Dauer (Minuten)</label><input id="mMin" type="number" inputmode="numeric" min="5" max="600" placeholder="z. B. 60" value="' + esc(d.min) + '"></div></div>' +
    '<label>Wie anstrengend? <b id="mRpeT">' + S.rpe + '/10 · ' + RPE_W[S.rpe] + '</b></label><div class="seg rpe" id="mRpe" role="group" aria-label="Anstrengung von 1 bis 10">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => '<button type="button" data-r="' + n + '" aria-pressed="' + (n === S.rpe) + '">' + n + '</button>').join('') + '</div>' +
    '<div class="row"><div' + (showKm ? '' : ' hidden') + ' id="mKmW"><label for="mKm">Strecke in km (optional)</label><input id="mKm" type="number" inputmode="decimal" step="0.1" min="0" value="' + esc(d.km) + '"></div><div><label for="mHr">Ø-Puls (optional)</label><input id="mHr" type="number" inputmode="numeric" min="40" max="220" value="' + esc(d.hr) + '"></div></div>' +
    '<label for="mName">Notiz (optional)</label><input id="mName" type="text" maxlength="80" placeholder="z. B. Beine, Spiel gegen …" value="' + esc(d.name) + '">' +
    '<div class="btns"><button class="primary" id="mSave" type="button">Eintragen</button><span class="mu" id="mEst" style="font-size:12.5px;align-self:center"></span></div><div class="msg" id="mMsg" aria-live="polite"></div></div>';
}
function estLoad() {
  const min = +($('mMin') || {}).value, hr = +($('mHr') || {}).value, el = $('mEst'); if (!el) return;
  if (!(min >= 5)) { el.textContent = ''; return }
  const h = min / 60, rest = S.ctx.st.rest || 50, thr = S.R && S.R.ok ? S.R.thr : 170;
  let fr; if (hr >= 60) fr = (hr - rest) / (thr - rest); else fr = .35 + .055 * S.rpe;
  el.textContent = 'ca. ' + f0(h * fr * fr * 100) + ' Belastungspunkte';
}
function bindAdd(host) {
  const ctx = S.ctx;
  const keep = () => { S.draft = { date: $('mDate').value, min: $('mMin').value, km: $('mKm').value, hr: $('mHr').value, name: $('mName').value } };
  host.querySelectorAll('#mSports [data-s]').forEach(b => b.addEventListener('click', () => { keep(); S.sport = b.dataset.s; host.querySelectorAll('#mSports [data-s]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)) }); $('mKmW').hidden = !KM_SPORTS.includes(S.sport) }));
  host.querySelectorAll('#mRpe [data-r]').forEach(b => b.addEventListener('click', () => { S.rpe = +b.dataset.r; host.querySelectorAll('#mRpe [data-r]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('mRpeT').textContent = S.rpe + '/10 · ' + RPE_W[S.rpe]; estLoad() }));
  ['mMin', 'mHr'].forEach(i => $(i).addEventListener('input', estLoad));
  const ag = $('mAgain'); if (ag) ag.addEventListener('click', () => { const a = S.R.log[0]; S.sport = a.sport; if (a.rpe) S.rpe = a.rpe; S.draft = { date: ctx.todayKey, min: String(Math.round(a.sec / 60)), km: '', hr: '', name: '' }; render(S.host, S.R, ctx); const m = $('m-add'); if (m) m.scrollIntoView({ block: 'center' }) });
  $('mSave').addEventListener('click', async () => {
    const msg = $('mMsg'), min = +$('mMin').value, date = $('mDate').value, km = $('mKm').value === '' || $('mKmW').hidden ? null : +$('mKm').value, hr = $('mHr').value === '' ? null : +$('mHr').value;
    const bad = t => { msg.textContent = t; msg.className = 'msg err' };
    if (!date) return bad('Bitte ein Datum wählen.');
    if (date > ctx.todayKey) return bad('Das Datum liegt in der Zukunft.');
    if (!(min >= 5 && min <= 600)) return bad('Dauer bitte zwischen 5 und 600 Minuten.');
    if (km != null && !(km > 0 && km < 400)) return bad('Strecke bitte zwischen 0 und 400 km.');
    if (hr != null && !(hr >= 40 && hr <= 220)) return bad('Puls bitte zwischen 40 und 220.');
    $('mSave').disabled = true;
    try { await ctx.add({ date, min, sport: S.sport, rpe: S.rpe, km, hr, name: $('mName').value.trim() }); S.draft = { date: ctx.todayKey, min: '', km: '', hr: '', name: '' }; ctx.say('Eingetragen: ' + S.sport + ', ' + min + ' min.') }
    catch (e) { bad('Konnte nicht speichern: ' + e.message); $('mSave').disabled = false }
  });
  estLoad();
}
function profileCard(st, R) {
  const ag = autoGoal(R);
  return '<div class="card s5 fm" id="m-profile"><h2>Dein Profil</h2><label for="pName">Name</label><input id="pName" type="text" maxlength="30" value="' + esc(st.name || '') + '">' +
    '<label>Wochenziel · Einheiten pro Woche' + (st.goal ? '' : ' <small style="opacity:.7">(noch nicht gesetzt – automatisch ' + ag + ' aus deinem Schnitt der letzten 8 Wochen)</small>') + '</label><div class="seg" id="pGoal" role="group" aria-label="Wochenziel" style="flex-wrap:wrap;border-radius:16px">' + [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14].map(n => '<button type="button" data-g="' + n + '" aria-pressed="' + (n === (st.goal || ag)) + '">' + n + '</button>').join('') + '</div>' +
    '<label for="pRest">Ruhepuls (optional, für die Belastung bei eingetragenem Puls)</label><input id="pRest" type="number" inputmode="numeric" min="30" max="90" value="' + (st.rest || '') + '" placeholder="z. B. 55">' +
    '<div class="btns"><button class="primary" id="pSave" type="button">Speichern</button></div><div class="msg" id="pMsg" aria-live="polite"></div></div>';
}
function bindProfile(host) {
  let goal = S.ctx.st.goal || autoGoal(S.R);
  host.querySelectorAll('#pGoal [data-g]').forEach(b => b.addEventListener('click', () => { goal = +b.dataset.g; host.querySelectorAll('#pGoal [data-g]').forEach(x => x.setAttribute('aria-pressed', String(x === b))) }));
  $('pSave').addEventListener('click', async () => {
    const rest = $('pRest').value === '' ? null : +$('pRest').value;
    if (rest != null && !(rest >= 30 && rest <= 90)) { $('pMsg').textContent = 'Ruhepuls bitte zwischen 30 und 90.'; $('pMsg').className = 'msg err'; return }
    try { await S.ctx.saveProfile({ name: $('pName').value.trim(), goal, rest }); S.ctx.say('Gespeichert.') } catch (e) { $('pMsg').textContent = e.message; $('pMsg').className = 'msg err' }
  });
}

function render(host, R, ctx) {
  S.host = host; S.R = R; S.ctx = ctx;
  const st = ctx.st, ok = R && R.ok, N = narrate(R, st, new Date().getHours()), q = N.q;
  let h = '<div class="g" id="m-ueber"><div class="card s12"><div class="o1"><div class="avatar" aria-hidden="true">💪<b></b></div><div class="hello">' + esc(N.hello) + (N.name ? '<br>' + esc(N.name) + '<i>.</i>' : '') + '</div><h3 class="bh" style="margin:10px 0 4px">' + esc(N.head[0]) + ' <em>' + esc(N.head[1]) + '</em></h3><p class="sentence">' + esc(N.text) + '</p>' + (N.chips.length ? '<div class="chips">' + N.chips.map(c => '<span class="chip a">' + esc(c) + '</span>').join('') + '</div>' : '') + '</div></div></div>';
  if (ok) h += pendingCard(R);
  h += '<div class="g">' + addCard(R, st) + profileCard(st, R) + '</div>';
  h += '<h2 class="sec" id="m-gym">Gym</h2><div class="secsub">Übungen, Sätze und Gewichte – zählt automatisch fürs Wochenziel.</div><div class="g"><div class="card s12 gymcard" id="gymBox"></div></div>';
  if (ok) {
    const wk = q.wk, pct = Math.min(1, wk.sessions / q.goal);
    const days = []; for (let i = 0; i < 7; i++) days.push(R._L.filter(a => a.loc.di === wk.di + i));
    h += '<h2 class="sec" id="m-woche">Diese Woche</h2><div class="secsub">Montag bis Sonntag · Ziel: ' + q.goal + ' ' + pl(q.goal, 'Einheit', 'Einheiten') + '</div><div class="g"><div class="card s5"><h2>' + wk.sessions + ' von ' + q.goal + '</h2><div class="bar" style="margin:8px 0"><i style="width:' + (pct * 100).toFixed(0) + '%"></i></div><div class="mini"><div><span>Stunden</span><b>' + f1(wk.hours) + '</b></div><div><span>Belastung</span><b>' + f0(wk.load) + '</b></div><div><span>Serie</span><b>' + q.streak + ' Wo.</b><small>Ziel geschafft</small></div></div>' +
      '<div class="wkdots">' + days.map((A, i) => '<div class="' + (wk.di + i === R.todayDi ? 'today' : '') + '"><span>' + C.WD[i] + '</span><b>' + (A.length ? A.map(a => EMO[a.sport] || '✨').join('') : '·') + '</b></div>').join('') + '</div></div>' +
      '<div class="card s7"><div class="top" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h2 style="margin:0">Wochen nach Sportart</h2><span class="seg" role="group" aria-label="Maß"><button data-w="h" aria-pressed="' + (S.wmode === 'h') + '">Stunden</button><button data-w="n" aria-pressed="' + (S.wmode === 'n') + '">Einheiten</button></span></div><div class="legend" style="margin-top:8px">' + Object.keys(R.totals.hoursBy).filter(s => R.totals.hoursBy[s] > 0).map(s => '<span><i style="background:' + sc(s) + '"></i>' + esc(s) + '</span>').join('') + '</div><div id="m-weeks"></div></div></div>';
    h += '<div class="g">' + balanceCard(R, st) + '</div>';
    h += '<h2 class="sec" id="m-form">Form und Belastung</h2><div class="secsub">Fitness (42 Tage), Ermüdung (7 Tage) und ihre Differenz – für jede Sportart.</div><div class="g"><div class="card s8"><h2>Fitness, Ermüdung, Form</h2><div class="legend"><span><i style="background:#ff5460"></i>Fitness</span><span><i style="background:#8fa6bd"></i>Ermüdung</span><span><i style="background:#ff9a5c"></i>Form</span></div><div id="c-form"></div></div><div class="card s4"><h2>Belastung</h2><div class="sub">Akut zu chronisch</div><div id="c-gauge"></div><div class="mini" id="gaugeMini"></div><div class="note">Ohne Puls schätzt das Board die Belastung aus Dauer und Anstrengung (1–10). Akut zu chronisch ist in der Forschung umstritten – ein Hinweis, kein Urteil.</div></div></div>';
    const tot = Math.max.apply(null, Object.values(R.totals.hoursBy).concat([.01])), sports = C.SPORTS.filter(s => R.totals.hoursBy[s] > 0).sort((a, b) => R.totals.hoursBy[b] - R.totals.hoursBy[a]);
    const allH = Object.values(R.totals.hoursBy).reduce((a, b) => a + b, 0) || 1;
    h += '<h2 class="sec" id="m-sport">Sportarten</h2><div class="secsub">Letzte zwölf Monate</div><div class="g"><div class="card s7"><h2>Verteilung</h2>' + sports.map(s => '<div class="hb"><span style="width:96px">' + (EMO[s] || '') + ' ' + esc(s) + '</span><div class="bar"><i style="width:' + (R.totals.hoursBy[s] / tot * 100).toFixed(1) + '%;background:' + sc(s) + '"></i></div><b style="width:auto;min-width:110px">' + f0(R.totals.hoursBy[s]) + ' h · ' + R.counts[s] + '×</b></div>').join('') + '</div>' +
      '<div class="card s5"><h2>In Zahlen</h2><div class="tiles4" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="rec"><span>Einheiten</span><b>' + R.totals.acts + '</b><small>12 Monate</small></div><div class="rec"><span>Stunden</span><b>' + f0(R.totals.hours) + '</b><small>' + f0(R.totals.hours / allH * 100 / 100 * 0 + R.totals.hours / 52 * 10 / 10) + ' h pro Woche</small></div><div class="rec"><span>Lieblingssport</span><b>' + esc(sports[0] || '–') + '</b><small>' + F.num(R.totals.hoursBy[sports[0]] / allH * 100, 0) + ' % der Zeit</small></div><div class="rec"><span>Vielfalt</span><b>' + q.kinds + '</b><small>Sportarten in 4 Wochen</small></div></div></div></div>';
    h += '<h2 class="sec" id="m-bestw">Bestwerte</h2><div class="g">' + bestCard(R, ctx) + '</div>';
    h += '<h2 class="sec" id="m-jahr">Dein Jahr</h2><div class="secsub">Jeder Tag eine Säule, höher = mehr Trainingszeit.</div><div class="g"><div class="card s12"><div class="top" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h2 style="margin:0">Jahr als Stadt</h2><span class="seg" role="group" aria-label="Maß"><button data-m="h" aria-pressed="' + (S.skymode === 'h') + '">Stunden</button><button data-m="load" aria-pressed="' + (S.skymode === 'load') + '">Belastung</button></span></div><div id="sky"></div></div>' +
      '<div class="card s7"><h2>Tag für Tag</h2><div class="sub">Farbe nach Trainingszeit</div><div id="c-cal"></div></div><div class="card s5"><h2>Wann du trainierst</h2><div id="habit"></div></div></div>';
    // Rekorde
    const rec = []; const longest = R.log.reduce((b, a) => !b || a.sec > b.sec ? a : b, null);
    const bigWk = R.weeks.reduce((b, w) => !b || w.hours > b.hours ? w : b, null), mostN = R.weeks.reduce((b, w) => !b || w.sessions > b.sessions ? w : b, null);
    const mm = {}; R.log.forEach(a => { const k = a.date.slice(0, 7); mm[k] = (mm[k] || 0) + hrs(a.sec) }); const bm = Object.entries(mm).sort((a, b) => b[1] - a[1])[0];
    const far = (sp, nm) => { const a = R.log.filter(x => sp.includes(x.sport) && x.km).reduce((b, x) => !b || x.km > b.km ? x : b, null); if (a) rec.push([nm, f1(a.km) + ' km', F.date(a.date)]) };
    rec.push(['Längste Einheit', dur(longest.sec), esc(longest.sport) + ' · ' + F.date(longest.date)]);
    rec.push(['Stärkste Woche', f1(bigWk.hours) + ' h', 'ab ' + F.date(bigWk.start)]);
    rec.push(['Meiste Einheiten', mostN.sessions + '×', 'Woche ab ' + F.date(mostN.start)]);
    if (bm) rec.push(['Bester Monat', f0(bm[1]) + ' h', bm[0].slice(5) + '/' + bm[0].slice(0, 4)]);
    rec.push(['Längste Serie', R.records.streak.n + ' ' + pl(R.records.streak.n, 'Tag', 'Tage'), 'in Folge aktiv']);
    far(['Lauf', 'Trail'], 'Weitester Lauf'); far(['Rad'], 'Weiteste Radtour'); far(['Wandern'], 'Längste Wanderung');
    h += '<h2 class="sec" id="m-rek">Rekorde</h2><div class="secsub">Letzte zwölf Monate</div><div class="g"><div class="card s12"><div class="tiles4">' + rec.map(r => '<div class="rec"><span>' + r[0] + '</span><b>' + r[1] + '</b><small>' + r[2] + '</small></div>').join('') + '</div></div></div>';
    // Logbuch
    const sp = ['Alle'].concat(C.SPORTS.filter(s => R.counts[s] > 0));
    let rows = R.log.filter(a => S.logSport === 'Alle' || a.sport === S.logSport); const total = rows.length; if (!S.logAll) rows = rows.slice(0, 15);
    h += '<h2 class="sec" id="m-log">Logbuch</h2><div class="secsub">Eigene und Whoop-Einträge kannst du hier löschen.</div><div class="g"><div class="card s12"><div class="chips" id="mLogChips" style="margin:0 0 10px">' + sp.map(s => '<button type="button" class="chip' + (s === S.logSport ? ' on' : '') + '" data-ls="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div><div class="scroll"><table class="log"><thead><tr><th>Datum</th><th>Sport</th><th>Notiz</th><th>Dauer</th><th>Anstrengung / Whoop</th><th>Belastung</th><th></th></tr></thead><tbody>' +
      rows.map(a => '<tr><td>' + F.date(a.date) + '</td><td>' + esc(a.sport) + '</td><td>' + esc(a.name || '') + '</td><td>' + dur(a.sec) + (a.km ? ' · ' + f1(a.km) + ' km' : '') + '</td><td>' + (a.strain ? 'Strain ' + f1(a.strain) + (a.hr ? ' · Ø ' + f0(a.hr) : '') : a.rpe ? a.rpe + '/10' : a.hr ? 'Ø ' + f0(a.hr) + ' bpm' : '–') + '</td><td>' + f0(a.load) + (a.est ? '*' : '') + '</td><td>' + (/^[mwg]/.test(a.id) ? '<button type="button" class="txt" data-del="' + esc(a.id) + '" aria-label="Einheit vom ' + F.date(a.date) + ' löschen">✕</button>' : '') + '</td></tr>').join('') +
      '</tbody></table></div>' + (total > 15 ? '<div class="btns"><button type="button" id="mLogMore">' + (S.logAll ? 'Weniger zeigen' : 'Alle ' + total + ' zeigen') + '</button></div>' : '') + '<div class="note">* geschätzt aus Dauer und Sportart (kein Puls, keine Anstrengung).</div></div></div>';
  }
  h += '<h2 class="sec" id="m-daten">Daten und Quellen</h2><div class="secsub">Whoop, Strava oder CSV – doppelte Einheiten werden erkannt.</div><div class="g"><div class="card s12" id="mImp"></div></div>';
  host.innerHTML = h;
  // Navigation
  const nav = $('trNav'); const L = [['m-ueber', 'Übersicht']].concat(ok && pendingActs(R).length ? [['m-todo', 'Ergänzen']] : []).concat([['m-add', 'Eintragen'], ['m-gym', 'Gym']]).concat(ok ? [['m-woche', 'Woche'], ['m-bal', 'Balance'], ['m-form', 'Form'], ['m-bestw', 'Bestwerte'], ['m-sport', 'Sportarten'], ['m-jahr', 'Jahr'], ['m-rek', 'Rekorde'], ['m-log', 'Logbuch']] : []).concat([['m-daten', 'Daten']]);
  nav.innerHTML = L.map(x => '<a href="#' + x[0] + '">' + x[1] + '</a>').join('');
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); const t = $(a.getAttribute('href').slice(1)); if (t) t.scrollIntoView({ behavior: ctx.noAnim() ? 'auto' : 'smooth', block: 'start' }) }));
  const imp = $('mImp'); const ob = ctx.importNode; if (ob) imp.appendChild(ob);
  bindAdd(host); bindProfile(host); bindTodo(host); bindBalance(host);
  if (window.TrainingGym && ctx.gym) window.TrainingGym.render($('gymBox'), ctx.gym);
  if (ok) {
    host.querySelectorAll('[data-w]').forEach(b => b.addEventListener('click', () => { S.wmode = b.dataset.w; host.querySelectorAll('[data-w]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); weeksStack($('m-weeks'), R, q.goal, S.wmode) }));
    host.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { S.skymode = b.dataset.m; host.querySelectorAll('[data-m]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); V.skyline($('sky'), R, S.skymode) }));
    host.querySelectorAll('[data-ls]').forEach(b => b.addEventListener('click', () => { S.logSport = b.dataset.ls; S.logAll = false; render(host, R, ctx); const l = $('m-log'); if (l) l.scrollIntoView({ block: 'start' }) }));
    const mo = $('mLogMore'); if (mo) mo.addEventListener('click', () => { S.logAll = !S.logAll; render(host, R, ctx); const l = $('m-log'); if (l) l.scrollIntoView({ block: 'start' }) });
    host.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => { const a = R.log.find(x => x.id === b.dataset.del); if (!a || !confirm('Einheit löschen? ' + a.sport + ' am ' + F.date(a.date) + ', ' + dur(a.sec))) return; try { await ctx.remove(a.id); ctx.say('Gelöscht.') } catch (e) { ctx.say('Konnte nicht löschen: ' + e.message, true) } }));
    draw();
  }
}
function draw() {
  const R = S.R; if (!R || !R.ok || !$('m-weeks')) return;
  const q = stats(R, S.ctx.st);
  weeksStack($('m-weeks'), R, q.goal, S.wmode); V.formChart($('c-form'), R, 180); V.gauge($('c-gauge'), R.acwr);
  $('gaugeMini').innerHTML = '<div><span>Rampe</span><b>' + F.signed(R.ramp, 1) + '</b><small>Fitness in 7 Tagen</small></div><div><span>Monotonie</span><b>' + (R.monotony != null ? F.num(R.monotony, 2) : '–') + '</b><small>7 Tage</small></div><div><span>Punkte</span><b>' + f0(R.load7) + '</b><small>letzte 7 Tage</small></div>';
  attachFull(R);
  V.skyline($('sky'), R, S.skymode); calendar($('c-cal'), R); V.habitGrid($('habit'), habit(R), 'Einheiten'); if (window.TrainingGym) window.TrainingGym.draw();
}
/* Graph-Vollbild: Zeitreihen dieser Ansicht (Phase 7) */
function attachFull(R) {
  const GF = window.GraphFull; if (!GF || !R || !R.ok) return;
  const first = R.days.findIndex(d => d.act > 0), days = first < 0 ? [] : R.days.slice(first);
  const fw = R.weeks.findIndex(w => w.sessions > 0 || w.hours > 0), weeks = fw < 0 ? [] : R.weeks.slice(fw);
  const ser = R.series.slice(Math.max(0, R.series.findIndex(d => d.fit > 0 || d.load > 0)));
  const inR = (arr, ctx, key) => arr.filter(x => x[key || 'k'] >= ctx.from && x[key || 'k'] <= ctx.to);
  const LOAD_NOTE = 'Trainingslast pro Einheit = Stunden × (Intensität)² × 100. Intensität = (Ø-Puls − Ruhepuls) ÷ (Schwellenpuls − Ruhepuls). Eine Stunde genau an der Schwelle ergibt 100. ' +
    'Dein Schwellenpuls ist ' + R.thr + ' bpm' + (R.thrSrc ? ' (aus deinem schnellsten Lauf über 10–21 km am ' + F.date(R.thrSrc.date) + ')' : ' (angenommen: 89 % vom Maximalpuls, weil kein passender Lauf da ist)') + '. ' +
    'Der Puls kommt aus den Whoop-Workouts bzw. deinem Eintrag – nicht der Whoop-Strain. Ohne Puls: aus Anstrengung (1–10) oder geschätzt nach Sportart. Mehrere Einheiten am Tag werden addiert.';
  // Form, Fitness, Ermüdung: umschaltbar und vergleichbar
  GF.attach('#c-form', { id: 't-form', title: 'Fitness, Ermüdung, Form', mainName: 'Form', color: '#ff9a5c', alias: ['form', 'trainingsform'], unit: '', dir: 1, digits: 0,
    series: () => ser.map(d => ({ date: d.k, value: d.form })),
    layers: [{ id: 'fit', name: 'Fitness', color: '#ff5460', series: () => ser.map(d => ({ date: d.k, value: d.fit })) }, { id: 'fat', name: 'Ermüdung', color: '#8fa6bd', series: () => ser.map(d => ({ date: d.k, value: d.fat })) }],
    layersOn: ['main', 'fit', 'fat'],
    facts: ctx => {
      const S2 = inR(ser, ctx); if (!S2.length) return [];
      const last = S2[S2.length - 1], peak = S2.reduce((b, d) => !b || d.fit > b.fit ? d : b, null);
      const zone = f => f < -30 ? 'Überlastet' : f < -10 ? 'Produktiv' : f < 5 ? 'Neutral' : f <= 25 ? 'Frisch' : 'Formverlust';
      const cnt = {}; S2.forEach(d => { const z = zone(d.form); cnt[z] = (cnt[z] || 0) + 1 });
      return [{ l: 'Fitness am ' + F.date(last.k), v: f0(last.fit), s: 'Ø-Last der letzten 42 Tage' },
        { l: 'Ermüdung', v: f0(last.fat), s: 'Ø-Last der letzten 7 Tage' },
        { l: 'Form', v: F.signed(last.form, 0), s: zone(last.form), cls: last.form < -30 ? 'bad' : last.form >= -10 && last.form <= 25 ? 'good' : '' },
        { l: 'Höchste Fitness', v: f0(peak.fit), s: F.date(peak.k) },
        { l: 'Rampe', v: F.signed(R.ramp, 1), s: 'Fitness-Änderung in 7 Tagen (gesund: bis etwa +5)' },
        { l: 'Tage pro Formbereich', v: '', wide: true, s: '<div class="gf-rows">' + ['Überlastet', 'Produktiv', 'Neutral', 'Frisch', 'Formverlust'].map(z => '<div><span>' + z + '</span><b>' + (cnt[z] || 0) + ' Tage</b></div>').join('') + '</div>' }];
    },
    note: 'Fitness = gleitender Schnitt deiner täglichen Trainingslast über 42 Tage, Ermüdung = über 7 Tage, Form = Fitness − Ermüdung. Bereiche: unter −30 überlastet, −30 bis −10 produktives Training, −10 bis +5 neutral, +5 bis +25 frisch (Wettkampfform), darüber verlierst du Fitness.\n' + LOAD_NOTE });
  // Trainingslast pro Tag
  GF.attach('#sky', { id: 't-load', title: 'Trainingslast pro Tag', alias: ['trainingslast', 'skyline', 'load'], unit: 'Last', dir: 0, digits: 0, kind: 'bar', sum: true, series: () => days.map(d => ({ date: d.k, value: d.load })),
    extra: d => { const x = R._L.filter(a => a.loc.key === d); return x.map(a => (EMO[a.sport] || '') + ' ' + a.sport + ' ' + dur(a.sec) + ' → ' + f0(a.load) + (a.hr ? ' (Ø ' + a.hr + ' bpm)' : a.est ? ' (geschätzt)' : '')) },
    facts: ctx => { const D = inR(days, ctx).filter(d => d.load > 0); if (!D.length) return [];
      const A = R._L.filter(a => a.loc.key >= ctx.from && a.loc.key <= ctx.to), est = A.filter(a => a.est).length;
      return [{ l: 'Ø pro Trainingstag', v: f0(D.reduce((s, d) => s + d.load, 0) / D.length) }, { l: 'Trainingstage', v: D.length },
        { l: 'Mit Puls berechnet', v: (A.length - est) + ' von ' + A.length, s: est ? est + ' Einheiten ohne Puls und Anstrengung sind geschätzt' : 'alle Einheiten mit Puls oder Anstrengung' }] },
    note: LOAD_NOTE });
  // Wochen nach Sportart: gestapelt
  const ws = weekSport(R, weeks.length || 1), wIdx = new Map(ws.ws.map((w, i) => [w.start, i]));
  const sportsUsed = C.SPORTS.filter(sp => R.totals.hoursBy[sp] > 0);
  GF.attach('#m-weeks', { id: 't-weeks', title: 'Wochen nach Sportart', alias: ['trainingsstunden', 'wochenumfang'], unit: 'h', dir: 1, digits: 1, kind: 'bar', gap: 7, sum: true, range: '365',
    series: () => weeks.map(w => ({ date: w.start, value: w.hours })),
    stack: { keys: sportsUsed.map(sp => ({ id: sp, name: (EMO[sp] || '') + ' ' + sp, color: sc(sp) })), get: d => { const i = wIdx.get(d); if (i == null) return {}; const r = ws.rows[i], o = {}; Object.keys(r).forEach(sp => o[sp] = r[sp].h); return o } },
    extra: d => { const w = weeks.find(q => q.start === d); return w ? [w.sessions + ' Einheiten · Last ' + f0(w.load)] : [] },
    facts: ctx => { const W = inR(weeks, ctx, 'start').filter(w => !w.cur); if (!W.length) return []; const goal = S.ctx && S.ctx.st && S.ctx.st.goal || autoGoal(R);
      const best = W.reduce((b, w) => !b || w.hours > b.hours ? w : b, null);
      return [{ l: 'Ø Stunden pro Woche', v: f1(W.reduce((s, w) => s + w.hours, 0) / W.length) + ' h' }, { l: 'Ø Einheiten pro Woche', v: f1(W.reduce((s, w) => s + w.sessions, 0) / W.length) },
        { l: 'Wochenziel (' + goal + ') geschafft', v: W.filter(w => w.sessions >= goal).length + ' von ' + W.length, cls: 'good' }, { l: 'Stärkste Woche', v: f1(best.hours) + ' h', s: 'ab ' + F.date(best.start) + ' · ' + best.sessions + ' Einheiten' }] } });
  // Akut zu chronisch: Verlauf statt nur Tacho
  const acwr = []; for (let i = 34; i < R.series.length; i++) { const a7 = R.series.slice(i - 6, i + 1).reduce((s, d) => s + d.load, 0), c28 = R.series.slice(i - 34, i - 6).reduce((s, d) => s + d.load, 0) / 4; if (c28 > 0) acwr.push({ date: R.series[i].k, value: Math.round(a7 / c28 * 100) / 100, a7, c28 }) }
  GF.attach('#c-gauge', { id: 't-acwr', title: 'Belastung: akut zu chronisch', alias: ['belastung', 'acwr'], unit: '', dir: 0, digits: 2, range: '90', good: { min: 0.8, max: 1.3, label: 'Tage im guten Bereich (0,8–1,3)' },
    series: () => acwr.map(x => ({ date: x.date, value: x.value })),
    extra: d => { const x = acwr.find(q => q.date === d); return x ? ['Letzte 7 Tage: ' + f0(x.a7) + ' · Ø-Woche davor: ' + f0(x.c28)] : [] },
    facts: ctx => { const X = inR(acwr, ctx, 'date'); const zone = v => v == null ? '–' : v < 0.8 ? 'zu wenig – Fitness sinkt' : v <= 1.3 ? 'optimal' : v <= 1.5 ? 'erhöht – vorsichtig steigern' : 'hoch – Verletzungsrisiko';
      return [{ l: 'Aktuell', v: R.acwr != null ? F.num(R.acwr, 2) : '–', s: zone(R.acwr), cls: R.acwr != null && R.acwr >= 0.8 && R.acwr <= 1.3 ? 'good' : R.acwr > 1.5 ? 'bad' : '' },
        { l: 'Akut (7 Tage)', v: f0(R.load7), s: 'Summe Trainingslast' }, { l: 'Chronisch', v: R.acwr ? f0(R.load7 / R.acwr) : '–', s: 'Ø-Woche der 4 Wochen davor' },
        { l: 'Monotonie', v: R.monotony != null ? F.num(R.monotony, 2) : '–', s: 'Ø ÷ Streuung der letzten 7 Tage; über 2 = sehr gleichförmig' },
        { l: 'Tage über 1,5', v: X.filter(x => x.value > 1.5).length, s: 'im Zeitraum', cls: 'bad' }] },
    note: 'Akut zu chronisch (ACWR) = Trainingslast der letzten 7 Tage ÷ durchschnittliche Wochenlast der 28 Tage davor. 0,8–1,3 gilt als guter Bereich: genug Reiz, ohne den Körper zu überfordern. Über 1,5 steigt das Verletzungsrisiko, unter 0,8 baust du ab. Sprünge entstehen, wenn eine Woche viel mehr trainiert wird als gewohnt.\n' + LOAD_NOTE });
  // Tag für Tag: Kalender vergrößert mit Zahlen
  GF.attach('#c-cal', { id: 't-cal', title: 'Tag für Tag', clone: true, cloneEl: () => document.querySelector('#c-cal .cal'), sub: 'Farbe nach Trainingszeit · letzte 12 Monate',
    facts: () => { const D = R.days, tr = D.filter(d => d.act > 0); if (!tr.length) return [];
      let run = 0, best = 0, rest = 0, bestRest = 0; D.forEach(d => { if (d.act) { run++; best = Math.max(best, run); rest = 0 } else { rest++; bestRest = Math.max(bestRest, rest); run = 0 } });
      const wd = [0, 0, 0, 0, 0, 0, 0]; tr.forEach(d => wd[wdOf(d.di)] += d.h); const wi = wd.indexOf(Math.max.apply(null, wd));
      const mon = {}; D.forEach(d => { const k = d.k.slice(0, 7); mon[k] = mon[k] || { h: 0, n: 0 }; mon[k].h += d.h; mon[k].n += d.act });
      const mk = Object.keys(mon).sort().reverse();
      return [{ l: 'Trainingstage', v: tr.length, s: F.num(tr.length / D.length * 100, 0) + ' % aller Tage' }, { l: 'Ø pro Trainingstag', v: f1(tr.reduce((s, d) => s + d.h, 0) / tr.length) + ' h' },
        { l: 'Längste Serie', v: best + ' ' + pl(best, 'Tag', 'Tage'), s: 'am Stück trainiert', cls: 'good' }, { l: 'Längste Pause', v: bestRest + ' ' + pl(bestRest, 'Tag', 'Tage'), s: run ? 'aktuell ' + run + ' ' + pl(run, 'Tag', 'Tage') + ' in Folge' : 'aktuell ' + rest + ' ' + pl(rest, 'Tag', 'Tage') + ' Pause' },
        { l: 'Fleißigster Wochentag', v: C.WD[wi], s: f0(wd[wi]) + ' h in 12 Monaten' },
        { l: 'Monate', v: '', wide: true, s: '<div class="gf-rows">' + mk.map(k => '<div><span>' + C.MON[+k.slice(5) - 1] + ' ' + k.slice(0, 4) + '</span><b>' + f1(mon[k].h) + ' h · ' + mon[k].n + ' Einheiten</b></div>').join('') + '</div>' }] } });
}
function summary(R, st) {
  if (!R || !R.ok) return null; const q = stats(R, st), by = C.SPORTS.filter(s => R.totals.hoursBy[s] > 0).sort((a, b) => R.totals.hoursBy[b] - R.totals.hoursBy[a]).slice(0, 5).map(s => s + ' ' + f0(R.totals.hoursBy[s]) + ' h').join(', ');
  return 'TRAINING (Allround, Stand ' + R.today + '): ' + R.totals.acts + ' Einheiten in 12 Monaten, ' + f0(R.totals.hours) + ' h (' + by + ').\n  Woche: ' + q.wk.sessions + ' von ' + q.goal + ' Einheiten, ' + f1(q.wk.hours) + ' h. Form ' + F.signed(R.form, 0) + ' (Fitness ' + f0(R.fitness) + ', Ermüdung ' + f0(R.fatigue) + '), akut zu chronisch ' + (R.acwr != null ? F.num(R.acwr, 2) : '–') + '. Letzte Einheit: ' + (q.last ? q.last.sport + ' am ' + q.last.date : '–') + '.';
}
window.TrainingMulti = { render, draw, narrate, stats, summary, SC };
})();
