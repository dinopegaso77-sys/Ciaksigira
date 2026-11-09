/* Ciak si gira — Montaggio: editor a tracce.
   Tracce: Video (ciak, miei video, foto, cartelli) · Testi · Voce · Musica.
   L'anteprima dal vivo riproduce gli elementi sincronizzati nel browser;
   l'anteprima esatta e il film finale li monta il worker RunPod (azione render_timeline). */
'use strict';

const MAX_PAYLOAD = 9 * 1024 * 1024;
const LANES = [['video', '🎬', 'Video'], ['text', '🔤', 'Testi'], ['voice', '🎤', 'Voce'], ['music', '🎵', 'Musica']];
const TRANS = [
  ['cut', 'Taglio', '✂'], ['fade', 'Dissolvenza', '◐'], ['black', 'Nero', '■'], ['white', 'Bianco', '□'],
  ['wipeleft', 'Tendina ←', '⇠'], ['wiperight', 'Tendina →', '⇢'], ['slideleft', 'Scorri ←', '⟵'], ['slideright', 'Scorri →', '⟶'],
  ['circle', 'Cerchio', '◯'], ['zoom', 'Zoom', '⊕'], ['pixel', 'Pixel', '▦']
];
const FORMATS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350], '21:9': [1920, 822], '4:3': [1440, 1080] };
const MT = { proj: null, pick: [], inited: false, job: null };
const ED = { sel: null, pps: innerWidth < 640 ? 34 : 56, t: 0, playing: false, raf: 0, els: {}, aud: {}, armed: null, renderUrl: null, drag: null };

const montId = () => (ls('montEndpoint') || '').trim();
const fmtTime = s => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const fmtT1 = s => { s = Math.max(0, s || 0); const m = Math.floor(s / 60), r = (s - m * 60).toFixed(1).padStart(4, '0'); return `${m}:${r}`.replace('.', ','); };
const urlValid = c => c.url && Date.now() - c.created < 6.5 * 864e5;
const nid = () => Math.random().toString(36).slice(2, 9);
const b64Of = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------------- progetto ---------------- */
function edDefault() { return { v: 2, items: [], texts: [], audio: [], format: 'auto', duck: true, clipAudio: true, title: '' }; }
function mtLoad() {
  let p = null;
  try { p = JSON.parse(ls('film') || 'null'); } catch (e) { }
  if (!p) p = edDefault();
  if (p.v !== 2) { // conversione dal montaggio a sequenza
    const old = p, trans = { dissolve: 'fade', black: 'black', cut: 'cut' }[old.trans] || 'fade';
    p = edDefault(); p.clipAudio = old.keep !== false; p.title = old.title || '';
    if (old.title) p.items.push({ id: nid(), kind: 'card', text: old.title, dur: 3, trans: { type: 'cut', dur: 0.6 } });
    (old.items || []).forEach(ref => p.items.push({ id: nid(), kind: String(ref).startsWith('lib:') ? 'lib' : 'clip', ref, in: 0, dur: 0, vol: 1, trans: { type: trans, dur: 0.6 } }));
    if (old.end) p.items.push({ id: nid(), kind: 'card', text: 'Fine', small: true, dur: 2.5, trans: { type: 'black', dur: 0.8 } });
  }
  MT.proj = p;
}
function mtSave() { ls('film', JSON.stringify(MT.proj)); }
function proj() { if (!MT.proj) mtLoad(); return MT.proj; }

function srcOf(it) {
  if (it.kind === 'card') return null;
  return it.kind === 'lib' ? (window.libClip ? libClip(it.ref) : null) : S.clips.find(c => c.id === it.ref);
}
function srcDur(it) {
  if (it.kind === 'card') return 600;
  const c = srcOf(it); if (!c) return 5;
  if (c.kind === 'image') return 600;
  return c.settings.duration || 5;
}
function itemDur(it) {
  if (!it.dur) it.dur = it.kind === 'card' ? 3 : (srcOf(it)?.kind === 'image' ? 4 : srcDur(it));
  return it.dur;
}
function transDur(prev, it) {
  if (!it.trans || it.trans.type === 'cut') return 0;
  return clamp(it.trans.dur || 0.6, 0.2, Math.max(0.2, Math.min(itemDur(prev), itemDur(it)) - 0.1));
}
function layout() {
  const p = proj(), L = []; let end = 0;
  p.items.forEach((it, i) => {
    const ov = i ? transDur(p.items[i - 1], it) : 0;
    const start = Math.max(0, end - ov), d = itemDur(it);
    L.push({ it, i, start, end: start + d, ov }); end = start + d;
  });
  return { L, total: end };
}
function filmLen() { return layout().total; }
function labelOf(it) {
  if (it.kind === 'card') return '🪧 ' + (it.text || 'Cartello');
  const c = srcOf(it); if (!c) return '⚠ file mancante';
  return (c.lib ? (c.kind === 'image' ? '📷 ' : '📁 ') : `Ciak ${c.take || ''} · `) + (c.settings.prompt || '');
}
function sizeOf() {
  const p = proj();
  if (p.format !== 'auto' && FORMATS[p.format]) return FORMATS[p.format];
  const first = p.items.map(srcOf).find(Boolean);
  return FORMATS[first?.settings?.ratio] || FORMATS['16:9'];
}

/* ---------------- aggiunta elementi (usata anche da Galleria e I miei file) ---------------- */
function edAddVideo(ref) {
  const p = proj();
  p.items.push({ id: nid(), kind: String(ref).startsWith('lib:') ? 'lib' : 'clip', ref, in: 0, dur: 0, vol: 1, trans: { type: p.items.length ? 'fade' : 'cut', dur: 0.6 } });
  mtSave(); return p.items.length;
}
function edAddAudio(lane, src, name, dur) {
  const p = proj();
  const it = { id: nid(), lane, src, name: name || (lane === 'voice' ? 'Voce' : 'Musica'), start: lane === 'music' ? 0 : +ED.t.toFixed(1), in: 0, dur: dur || 5, srcDur: dur || 0, vol: lane === 'music' ? 0.6 : 1, fin: lane === 'music' ? 1 : 0, fout: lane === 'music' ? 2 : 0, loop: false };
  if (lane === 'music' && !dur) it.dur = Math.max(5, filmLen());
  p.audio.push(it); mtSave(); measureAudio(it);
  return it;
}
async function audioUrl(src) {
  if (src.url) return src.url;
  if (src.b64) return src.b64;
  if (src.key) return await libUrl(src.key);
  return '';
}
async function measureAudio(it) { // durata reale del file audio
  try {
    const a = new Audio(await audioUrl(it.src));
    a.onloadedmetadata = () => {
      const d = a.duration; if (!isFinite(d) || !d) return;
      it.srcDur = d; if (!it.userDur) it.dur = it.lane === 'music' ? Math.max(Math.min(d, filmLen() || d), 1) : d;
      mtSave(); if (isMontageView()) renderTL();
    };
  } catch (e) { }
}
const isMontageView = () => $('#view-montaggio').classList.contains('active');

/* ---------------- interfaccia ---------------- */
async function renderMontage() {
  proj();
  if (!MT.inited) {
    MT.inited = true;
    const saved = ls('mtJob'); if (saved && !MT.job) { try { MT.job = JSON.parse(saved); pollMontage(); } catch (e) { } }
  }
  if (proj().items.some(it => it.kind === 'lib') && r2On() && !LIB.loaded && !LIB.loading) libRefresh(true).then(() => isMontageView() && renderMontage());
  const keys = [...proj().items.filter(i => i.kind === 'lib').map(i => i.ref.slice(4)), ...proj().audio.filter(a => a.src.key).map(a => a.src.key)];
  if (keys.length && r2On()) { try { await libUrls(keys); } catch (e) { } }
  const [W, H] = sizeOf(); $('#stage').style.aspectRatio = W + '/' + H;
  renderTL(); renderInspector(); edFrame(ED.t); renderFilms();
  $('#edExport').disabled = $('#edExact').disabled = !proj().items.length || !!MT.job;
  $('#edProgWrap').classList.toggle('hidden', !MT.job);
}

/* ---------- timeline ---------- */
function renderTL() {
  const p = proj(), { L, total } = layout(), pps = ED.pps;
  const len = Math.max(total, ...p.audio.map(a => a.start + a.dur), ...p.texts.map(t => t.start + t.dur), 10) + 4;
  const W = Math.ceil(len * pps);
  const sel = ED.sel || {};
  let h = `<div class="ruler" style="width:${W}px">`;
  const step = pps < 30 ? 5 : pps < 60 ? 2 : 1;
  for (let s = 0; s <= len; s += step) h += `<span style="left:${s * pps}px">${fmtTime(s)}</span>`;
  h += `</div>`;
  // video
  h += `<div class="lane lane-video" style="width:${W}px">`;
  L.forEach(({ it, i, start, end, ov }) => {
    const c = srcOf(it), on = sel.type === 'video' && sel.id === it.id;
    const thumb = it.kind === 'card' ? `<span class="th card">🪧</span>` : c ? (c.kind === 'image' ? `<img class="th" src="${clipSrc(c)}" alt="">` : `<video class="th" src="${clipSrc(c)}#t=0.1" preload="metadata" muted playsinline></video>`) : '';
    h += `<div class="blk vb ${on ? 'sel' : ''}" data-type="video" data-id="${it.id}" style="left:${start * pps}px;width:${Math.max(18, (end - start) * pps)}px">
      ${thumb}<span class="bl">${esc(labelOf(it))}</span><span class="bd">${fmtT1(end - start)}</span>
      ${on ? '<i class="h h-l" data-h="l"></i><i class="h h-r" data-h="r"></i>' : ''}</div>`;
    if (i > 0) {
      const tr = it.trans || { type: 'cut' }, ic = (TRANS.find(t => t[0] === tr.type) || TRANS[0])[2];
      const jon = sel.type === 'junc' && sel.id === it.id;
      h += `<button class="junc ${tr.type !== 'cut' ? 'has' : ''} ${jon ? 'sel' : ''}" data-junc="${it.id}" style="left:${(start + ov / 2) * pps}px" title="Transizione">${ic}</button>`;
    }
  });
  h += `</div>`;
  // testi
  h += `<div class="lane lane-text" style="width:${W}px">` + p.texts.map(t => blk('text', t, t.start, t.dur, '🔤 ' + t.text)).join('') + `</div>`;
  h += `<div class="lane lane-voice" style="width:${W}px">` + p.audio.filter(a => a.lane === 'voice').map(a => blk('audio', a, a.start, a.dur, '🎤 ' + a.name)).join('') + `</div>`;
  h += `<div class="lane lane-music" style="width:${W}px">` + p.audio.filter(a => a.lane === 'music').map(a => blk('audio', a, a.start, a.dur, '🎵 ' + a.name)).join('') + `</div>`;
  h += `<div class="playhead" id="playhead" style="left:${ED.t * pps}px"></div>`;
  h += `<div class="filmend" style="left:${total * pps}px"></div>`;
  $('#tl2in').innerHTML = h; $('#tl2in').style.width = W + 'px';
  $('#edTime').textContent = `${fmtT1(ED.t)} / ${fmtT1(total)}`;
  $('#stageEmpty').classList.toggle('hidden', !!p.items.length);
}
function blk(type, o, start, dur, label) {
  const on = ED.sel && ED.sel.type === type && ED.sel.id === o.id;
  return `<div class="blk ab ${type} ${on ? 'sel' : ''}" data-type="${type}" data-id="${o.id}" style="left:${start * ED.pps}px;width:${Math.max(18, dur * ED.pps)}px">
    <span class="bl">${esc(label)}</span>${on ? '<i class="h h-l" data-h="l"></i><i class="h h-r" data-h="r"></i>' : ''}</div>`;
}
function findObj(type, id) {
  const p = proj();
  return type === 'video' || type === 'junc' ? p.items.find(x => x.id === id) : type === 'text' ? p.texts.find(x => x.id === id) : p.audio.find(x => x.id === id);
}
function select(type, id) {
  ED.sel = type ? { type, id } : null;
  renderTL(); renderInspector(true);
}

/* trascinamento: tocca per selezionare, poi trascina; i bordi allungano/accorciano */
const tl = $('#tl2in');
tl.addEventListener('pointerdown', e => {
  const j = e.target.closest('.junc');
  if (j) {
    if (ED.armed) { applyTrans(j.dataset.junc, ED.armed); ED.armed = null; $$('.tchip').forEach(c => c.classList.remove('armed')); return; }
    return select('junc', j.dataset.junc);
  }
  const b = e.target.closest('.blk');
  if (!b) { // tocco sul righello o su uno spazio vuoto: sposta la testina
    if (e.target.closest('.ruler')) { seek((e.clientX - tl.getBoundingClientRect().left) / ED.pps); }
    return;
  }
  const { type, id } = b.dataset;
  if (!ED.sel || ED.sel.type !== type || ED.sel.id !== id) { select(type, id); return; }
  const o = findObj(type, id); if (!o) return;
  e.preventDefault(); try { tl.setPointerCapture(e.pointerId); } catch (er) { }
  const p = proj(), lay = layout().L.find(x => x.it.id === id);
  ED.drag = { b, type, o, h: e.target.dataset.h || null, x0: e.clientX, moved: false,
    start0: type === 'video' ? lay.start : o.start, dur0: type === 'video' ? itemDur(o) : o.dur, in0: o.in || 0, idx: p.items.indexOf(o) };
});
tl.addEventListener('pointermove', e => {
  const d = ED.drag; if (!d) return;
  const dx = e.clientX - d.x0, ds = dx / ED.pps;
  if (Math.abs(dx) > 4) d.moved = true; if (!d.moved) return;
  const snap = v => Math.round(v * 10) / 10;
  if (d.type === 'video') {
    if (!d.h) { d.b.style.transform = `translateX(${dx}px)`; d.b.classList.add('dragging'); return; }
    const it = d.o, max = srcDur(it), c = srcOf(it);
    if (d.h === 'r') it.dur = clamp(snap(d.dur0 + ds), 0.5, (c && c.kind !== 'image' ? max - (it.in || 0) : 600));
    else if (it.kind !== 'card' && c && c.kind !== 'image') { const ni = clamp(snap(d.in0 + ds), 0, d.in0 + d.dur0 - 0.5); it.in = ni; it.dur = d.dur0 - (ni - d.in0); }
  } else {
    const o = d.o;
    if (!d.h) o.start = Math.max(0, snap(d.start0 + ds));
    else if (d.h === 'r') { o.dur = Math.max(0.5, snap(d.dur0 + ds)); if (d.type === 'audio' && o.srcDur && !o.loop) o.dur = Math.min(o.dur, o.srcDur - (o.in || 0)); o.userDur = true; }
    else { const ns = clamp(snap(d.start0 + ds), 0, d.start0 + d.dur0 - 0.5); const dd = ns - d.start0; o.start = ns; o.dur = d.dur0 - dd; if (d.type === 'audio') o.in = Math.max(0, d.in0 + dd); o.userDur = true; }
  }
  renderTL(); ED.drag.b = $(`#tl2in .blk[data-id="${d.o.id}"]`) || d.b;
});
const endDrag = e => {
  const d = ED.drag; if (!d) return; ED.drag = null;
  if (d.type === 'video' && !d.h && d.moved) { // nuovo ordine in base al centro
    const p = proj(), lay = layout().L, cx = d.start0 + (e.clientX - d.x0) / ED.pps + d.dur0 / 2;
    const others = lay.filter(x => x.it.id !== d.o.id);
    let idx = others.filter(x => (x.start + x.end) / 2 < cx).length;
    p.items.splice(d.idx, 1); p.items.splice(idx, 0, d.o);
    if (p.items[0].trans) p.items[0].trans.type = p.items[0].trans.type || 'cut';
  }
  if (d.moved) { mtSave(); renderTL(); renderInspector(); edFrame(ED.t); }
};
tl.addEventListener('pointerup', endDrag); tl.addEventListener('pointercancel', endDrag);

/* tavolozza transizioni: trascina su una giunzione, oppure tocca e poi tocca la giunzione */
function renderPalette() {
  $('#transPal').innerHTML = TRANS.map(([k, l, ic]) => `<button class="tchip" data-tr="${k}"><b>${ic}</b>${l}</button>`).join('');
}
$('#transPal').addEventListener('pointerdown', e => {
  const c = e.target.closest('.tchip'); if (!c) return;
  e.preventDefault();
  const ghost = document.createElement('div'); ghost.className = 'tghost'; ghost.textContent = c.textContent; document.body.appendChild(ghost);
  const mv = ev => {
    ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
    $$('.junc').forEach(j => j.classList.remove('hot'));
    const el = document.elementFromPoint(ev.clientX, ev.clientY); const j = el && (el.closest('.junc') || el.closest('.vb'));
    if (j) (j.classList.contains('junc') ? j : null)?.classList.add('hot');
  };
  let moved = false; const x0 = e.clientX, y0 = e.clientY;
  const move = ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) moved = true; mv(ev); };
  const up = ev => {
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); ghost.remove();
    $$('.junc').forEach(j => j.classList.remove('hot'));
    if (!moved) { // tocco: "arma" la transizione
      ED.armed = c.dataset.tr; $$('.tchip').forEach(x => x.classList.toggle('armed', x === c));
      if (!proj().items.length || proj().items.length < 2) toast('Servono almeno due elementi nella traccia video'); else toast('Ora tocca una giunzione ◇ tra due clip'); return;
    }
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const j = el && el.closest('.junc'); const vb = el && el.closest('.vb');
    if (j) applyTrans(j.dataset.junc, c.dataset.tr);
    else if (vb) { const p = proj(), i = p.items.findIndex(x => x.id === vb.dataset.id); if (i > 0) applyTrans(vb.dataset.id, c.dataset.tr); else toast('Trascinala tra due clip'); }
  };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  mv(e);
});
function applyTrans(itemId, type) {
  const it = proj().items.find(x => x.id === itemId); if (!it) return;
  it.trans = { type, dur: type === 'cut' ? 0 : (it.trans && it.trans.dur > 0 ? it.trans.dur : 0.6) };
  mtSave(); select('junc', itemId);
  toast('Transizione: ' + TRANS.find(t => t[0] === type)[1]);
}

/* ---------- ispettore (pannello a destra su PC, finestra su telefono) ---------- */
function renderInspector(open) {
  const sel = ED.sel, p = proj();
  let h = '';
  if (!sel) {
    h = `<h3 class="ins-t">Il film</h3>
      <label>Formato<select data-f="format">${['auto', ...Object.keys(FORMATS)].map(k => `<option value="${k}" ${p.format === k ? 'selected' : ''}>${k === 'auto' ? 'Automatico (dal primo video)' : k}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" data-f="clipAudio" ${p.clipAudio ? 'checked' : ''}> Tieni l'audio delle clip</label>
      <label class="check"><input type="checkbox" data-f="duck" ${p.duck ? 'checked' : ''}> Abbassa la musica quando parla la voce</label>
      <p class="muted small">Durata: ${fmtT1(filmLen())} · ${p.items.length} elementi video · ${p.texts.length} testi · ${p.audio.length} audio</p>
      <p class="muted small">Tocca un elemento nella timeline per modificarlo.</p>`;
  } else {
    const o = findObj(sel.type, sel.id);
    if (!o) { ED.sel = null; return renderInspector(); }
    if (sel.type === 'video') {
      const c = srcOf(o), isImg = c && c.kind === 'image';
      h = `<h3 class="ins-t">${esc(labelOf(o))}</h3>
        ${o.kind === 'card' ? `<label>Testo del cartello<input data-o="text" type="text" value="${esc(o.text || '')}"></label>
          <label class="check"><input type="checkbox" data-o="small" ${o.small ? 'checked' : ''}> Scritta grande (stile "Fine")</label>` : ''}
        <div class="row3">
          ${o.kind !== 'card' && !isImg ? `<label>Inizia da (s)<input data-o="in" type="number" step="0.1" min="0" value="${(o.in || 0).toFixed(1)}"></label>` : ''}
          <label>Durata (s)<input data-o="dur" type="number" step="0.1" min="0.5" value="${itemDur(o).toFixed(1)}"></label>
          ${o.kind !== 'card' && !isImg ? `<label>Volume <span class="muted">${Math.round((o.vol ?? 1) * 100)}%</span><input data-o="vol" type="range" min="0" max="2" step="0.05" value="${o.vol ?? 1}"></label>` : ''}
        </div>
        ${o.kind !== 'card' && !isImg ? `<p class="muted small">Video originale: ${fmtT1(srcDur(o))}. Puoi anche trascinare i bordi del blocco.</p>` : ''}
        <div class="actions"><button class="btn small" data-act="left">◀ Sposta</button><button class="btn small" data-act="right">Sposta ▶</button>
        <button class="btn small" data-act="dup">⧉ Duplica</button><button class="btn small danger" data-act="del">Togli</button></div>`;
    } else if (sel.type === 'junc') {
      const tr = o.trans || { type: 'cut', dur: 0.6 };
      h = `<h3 class="ins-t">Transizione</h3>
        <div class="tgrid">${TRANS.map(([k, l, ic]) => `<button class="tchip ${tr.type === k ? 'on' : ''}" data-settr="${k}"><b>${ic}</b>${l}</button>`).join('')}</div>
        ${tr.type !== 'cut' ? `<label>Durata <span class="muted">${(tr.dur || 0.6).toFixed(1)} s</span><input data-tr="dur" type="range" min="0.2" max="2.5" step="0.1" value="${tr.dur || 0.6}"></label>` : ''}`;
    } else if (sel.type === 'text') {
      h = `<h3 class="ins-t">Testo</h3>
        <label>Scritta<textarea data-o="text" rows="2">${esc(o.text)}</textarea></label>
        <div class="row3">
          <label>Inizio (s)<input data-o="start" type="number" step="0.1" min="0" value="${o.start.toFixed(1)}"></label>
          <label>Durata (s)<input data-o="dur" type="number" step="0.1" min="0.5" value="${o.dur.toFixed(1)}"></label>
          <label>Posizione<select data-o="pos">${[['top', 'In alto'], ['center', 'Al centro'], ['bottom', 'In basso']].map(([k, l]) => `<option value="${k}" ${o.pos === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <label>Stile<select data-o="style"><option value="sub" ${o.style !== 'title' ? 'selected' : ''}>Sottotitolo</option><option value="title" ${o.style === 'title' ? 'selected' : ''}>Titolo (gesso)</option></select></label>
        <div class="actions"><button class="btn small" data-act="dup">⧉ Duplica</button><button class="btn small danger" data-act="del">Togli</button></div>`;
    } else {
      h = `<h3 class="ins-t">${o.lane === 'voice' ? '🎤' : '🎵'} ${esc(o.name)}</h3>
        <div class="row3">
          <label>Inizio (s)<input data-o="start" type="number" step="0.1" min="0" value="${o.start.toFixed(1)}"></label>
          <label>Durata (s)<input data-o="dur" type="number" step="0.1" min="0.5" value="${o.dur.toFixed(1)}"></label>
          <label>Parte dal (s)<input data-o="in" type="number" step="0.1" min="0" value="${(o.in || 0).toFixed(1)}"></label>
        </div>
        <label>Volume <span class="muted">${Math.round(o.vol * 100)}%</span><input data-o="vol" type="range" min="0" max="2" step="0.05" value="${o.vol}"></label>
        <div class="row3">
          <label>Entrata dolce <span class="muted">${o.fin.toFixed(1)} s</span><input data-o="fin" type="range" min="0" max="5" step="0.1" value="${o.fin}"></label>
          <label>Uscita dolce <span class="muted">${o.fout.toFixed(1)} s</span><input data-o="fout" type="range" min="0" max="5" step="0.1" value="${o.fout}"></label>
        </div>
        <label class="check"><input type="checkbox" data-o="loop" ${o.loop ? 'checked' : ''}> Ripeti se è più corta</label>
        ${o.srcDur ? `<p class="muted small">Audio originale: ${fmtT1(o.srcDur)}.</p>` : ''}
        <div class="actions"><button class="btn small" data-act="fit">↔ Lunga quanto il film</button><button class="btn small" data-act="dup">⧉ Duplica</button><button class="btn small danger" data-act="del">Togli</button></div>`;
    }
  }
  const desk = innerWidth > 900;
  const body = desk ? $('#inspSideBody') : $('#inspSheet');
  body.innerHTML = h;
  if (desk) $('#inspSheet').innerHTML = ''; else $('#inspSideBody').innerHTML = '';
  // telefono: barra della selezione (la finestra si apre con "Modifica", così puoi trascinare)
  const o = sel && findObj(sel.type, sel.id);
  $('#selBar').classList.toggle('hidden', desk || !sel);
  if (sel && o) $('#selName').textContent = sel.type === 'junc' ? 'Transizione: ' + (TRANS.find(t => t[0] === (o.trans || {}).type) || TRANS[0])[1]
    : sel.type === 'video' ? labelOf(o) : sel.type === 'text' ? '🔤 ' + o.text : (o.lane === 'voice' ? '🎤 ' : '🎵 ') + o.name;
  if (!desk && sel && sel.type === 'junc' && open) openM('mInsp');
  if (!desk && !sel) closeM($('#mInsp'));
  wireInspector(body);
}
function wireInspector(body) {
  const p = proj(), sel = ED.sel;
  body.querySelectorAll('[data-f]').forEach(el => el.onchange = () => { p[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; mtSave(); renderMontage(); });
  body.querySelectorAll('[data-o]').forEach(el => {
    const ev = el.type === 'range' ? 'oninput' : 'onchange';
    el[ev] = () => {
      const o = findObj(sel.type, sel.id), k = el.dataset.o;
      let v = el.type === 'checkbox' ? el.checked : (el.type === 'number' || el.type === 'range') ? parseFloat(el.value) || 0 : el.value;
      if (k === 'dur') { v = Math.max(0.5, v); if (sel.type === 'audio') o.userDur = true; }
      o[k] = v; mtSave();
      if (el.type === 'range') { const s = el.parentElement.querySelector('.muted'); if (s) s.textContent = k === 'vol' ? Math.round(v * 100) + '%' : v.toFixed(1) + ' s'; renderTL(); edFrame(ED.t); }
      else { renderTL(); renderInspector(); edFrame(ED.t); }
    };
  });
  body.querySelectorAll('[data-settr]').forEach(b => b.onclick = () => applyTrans(sel.id, b.dataset.settr));
  body.querySelectorAll('[data-tr]').forEach(el => el.oninput = () => {
    const o = findObj('junc', sel.id); o.trans.dur = parseFloat(el.value); mtSave();
    el.parentElement.querySelector('.muted').textContent = o.trans.dur.toFixed(1) + ' s'; renderTL();
  });
  body.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
    const a = b.dataset.act, o = findObj(sel.type, sel.id);
    const arr = sel.type === 'video' ? p.items : sel.type === 'text' ? p.texts : p.audio, i = arr.indexOf(o);
    if (a === 'del') { arr.splice(i, 1); ED.sel = null; closeM($('#mInsp')); toast('Tolto dalla timeline'); }
    if (a === 'dup') { const c = JSON.parse(JSON.stringify(o)); c.id = nid(); if (sel.type !== 'video') c.start = o.start + o.dur; arr.splice(i + 1, 0, c); ED.sel = { type: sel.type, id: c.id }; }
    if (a === 'left' && i > 0) { arr.splice(i, 1); arr.splice(i - 1, 0, o); }
    if (a === 'right' && i < arr.length - 1) { arr.splice(i, 1); arr.splice(i + 1, 0, o); }
    if (a === 'fit') { o.start = 0; o.dur = Math.max(1, filmLen()); o.loop = true; o.userDur = true; }
    mtSave(); renderTL(); renderInspector(); edFrame(ED.t);
  });
}

$('#edFilm').onclick = () => { ED.sel = null; renderTL(); renderInspector(); if (innerWidth <= 900) openM('mInsp'); };
$('#selEdit').onclick = () => openM('mInsp');
$('#selOff').onclick = () => select(null);

/* ---------- pulsanti di aggiunta ---------- */
$('#addVideo').onclick = () => openPick();
$('#addCard').onclick = () => {
  const p = proj(); const it = { id: nid(), kind: 'card', text: p.items.length ? 'Fine' : (p.title || 'Il mio film'), small: !!p.items.length, dur: p.items.length ? 2.5 : 3, trans: { type: p.items.length ? 'black' : 'cut', dur: 0.8 } };
  p.items.push(it); mtSave(); select('video', it.id);
};
$('#addText').onclick = () => {
  const p = proj(); const t = { id: nid(), text: 'Scrivi qui', start: +ED.t.toFixed(1), dur: 3, pos: 'bottom', style: 'sub' };
  p.texts.push(t); mtSave(); select('text', t.id);
};
$('#addVoice').onclick = () => openAddAudio('voice');
$('#addMusic').onclick = () => openAddAudio('music');
$('#zoomIn').onclick = () => { ED.pps = Math.min(200, ED.pps * 1.4); renderTL(); };
$('#zoomOut').onclick = () => { ED.pps = Math.max(8, ED.pps / 1.4); renderTL(); };
$('#edNew').onclick = () => {
  const p = proj(); if ((p.items.length || p.audio.length || p.texts.length) && !confirm('Iniziare un nuovo film? La timeline verrà svuotata (i film già montati restano).')) return;
  edStop(); MT.proj = edDefault(); mtSave(); ED.sel = null; ED.t = 0; ED.renderUrl = null; showRender(false); renderMontage();
};

/* scelta video e foto */
function openPick() {
  MT.pick = [];
  const libs = r2On() ? LIB.items.filter(i => i.kind === 'video' || i.kind === 'image').map(i => libClip('lib:' + i.key)) : [];
  const card = c => `<div class="clip" data-pk="${esc(c.id)}">${c.kind === 'image' ? `<img src="${clipSrc(c)}" alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block">` : `<video src="${clipSrc(c)}#t=0.1" preload="metadata" muted playsinline></video>`}
      <span class="tag">${c.lib ? (c.kind === 'image' ? 'FOTO' : 'MIO VIDEO') : 'CIAK ' + (c.take || '–')}</span>
      <div class="meta"><div>${esc(c.settings.prompt)}</div>${MODELS[c.settings.engine].name} · ${c.kind === 'image' ? 'foto' : c.settings.duration + 's'}</div></div>`;
  const box = $('#pickGrid');
  box.innerHTML = (S.clips.length || libs.length)
    ? (S.clips.length ? '<h3 class="mgroup">Ciak generati</h3><div class="gallery pick">' + S.clips.map(card).join('') + '</div>' : '')
      + (libs.length ? '<h3 class="mgroup">I miei file</h3><div class="gallery pick">' + libs.map(card).join('') + '</div>' : '')
    : '<div class="empty">Nessuna clip: gira un ciak o carica i tuoi file in Galleria → I miei file.</div>';
  box.querySelectorAll('[data-pk]').forEach(el => el.onclick = () => {
    const id = el.dataset.pk, i = MT.pick.indexOf(id);
    i >= 0 ? MT.pick.splice(i, 1) : MT.pick.push(id); el.classList.toggle('sel', i < 0);
    $('#pickOk').textContent = MT.pick.length ? `Aggiungi ${MT.pick.length} alla traccia video` : 'Aggiungi alla traccia video';
  });
  $('#pickOk').textContent = 'Aggiungi alla traccia video'; openM('mPick');
}
$('#pickOk').onclick = () => {
  if (!MT.pick.length) return toast('Tocca le clip da aggiungere');
  MT.pick.forEach(edAddVideo); closeM($('#mPick')); renderMontage();
};

/* scelta audio per voce e musica */
let ADD_LANE = 'voice';
async function openAddAudio(lane) {
  ADD_LANE = lane;
  $('#aaTitle').textContent = lane === 'voice' ? 'Aggiungi una voce' : 'Aggiungi musica';
  if (r2On() && !LIB.loaded) await libRefresh(true);
  const auds = r2On() ? LIB.items.filter(i => i.kind === 'audio') : [];
  $('#aaList').innerHTML = auds.length ? auds.map(i => `<button class="aa" data-key="${esc(i.key)}"><b>♪</b><span>${esc(i.name)}</span><em>${LIB.meta[i.key]?.dur ? fmtTime(LIB.meta[i.key].dur) : ''}</em></button>`).join('')
    : '<p class="muted">Nessun audio in "I miei file". Crealo, registralo o caricalo con i pulsanti qui sotto.</p>';
  $$('#aaList [data-key]').forEach(b => b.onclick = () => {
    const i = LIB.items.find(x => x.key === b.dataset.key);
    const it = edAddAudio(ADD_LANE, { key: i.key }, i.name, LIB.meta[i.key]?.dur);
    closeM($('#mAddAudio')); renderMontage(); select('audio', it.id);
  });
  $('#aaVoice').classList.toggle('hidden', lane !== 'voice');
  openM('mAddAudio');
}
$('#aaVoice').onclick = () => { closeM($('#mAddAudio')); openVoice(v => { const it = edAddAudio('voice', v.key ? { key: v.key } : String(v.url).startsWith('data:') ? { b64: v.url } : { url: v.url }, v.name, v.dur); go('montaggio'); select('audio', it.id); }); };
$('#aaRec').onclick = () => { closeM($('#mAddAudio')); recReset(); openM('mRec'); toast('Dopo il salvataggio la trovi in "Aggiungi voce"'); };
$('#aaFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let src;
  if (r2On()) { toast('Carico nell\'archivio…'); try { src = { key: (await uploadToR2(f, f.name, 'libreria')).key }; libRefresh(true); } catch (err) { return toast(err.message); } }
  else { if (f.size > 6 * 1024 * 1024) return toast('Senza archivio collegato l\'audio può pesare al massimo 6 MB'); src = { b64: await b64Of(f) }; }
  const it = edAddAudio(ADD_LANE, src, f.name); closeM($('#mAddAudio')); renderMontage(); select('audio', it.id);
};

/* ---------------- anteprima dal vivo ---------------- */
function stageEl(it) {
  let el = ED.els[it.id];
  const c = srcOf(it);
  const kind = it.kind === 'card' ? 'card' : c ? (c.kind === 'image' ? 'img' : 'video') : 'card';
  const src = c ? clipSrc(c) : '';
  if (el && (el.dataset.kind !== kind || (kind !== 'card' && el.dataset.src !== src))) { el.remove(); el = null; }
  if (!el) {
    if (kind === 'video') { el = document.createElement('video'); el.playsInline = true; el.preload = 'auto'; el.src = src; }
    else if (kind === 'img') { el = document.createElement('img'); el.src = src; }
    else { el = document.createElement('div'); el.className = 'pv-card'; }
    el.dataset.kind = kind; el.dataset.src = src; el.classList.add('pv-el');
    $('#stageLayers').appendChild(el); ED.els[it.id] = el;
  }
  if (kind === 'card') { el.innerHTML = `<i></i><span class="${it.small ? 'big' : ''}">${esc(it.text || '')}</span><i></i>`; }
  return el;
}
function audioEl(a) {
  let el = ED.aud[a.id];
  if (!el) { el = new Audio(); el.preload = 'auto'; ED.aud[a.id] = el; audioUrl(a.src).then(u => { el.src = u; }); }
  return el;
}
function cleanupEls() {
  const p = proj(), ids = new Set(p.items.map(i => i.id)), aids = new Set(p.audio.map(a => a.id));
  Object.keys(ED.els).forEach(k => { if (!ids.has(k)) { ED.els[k].remove(); delete ED.els[k]; } });
  Object.keys(ED.aud).forEach(k => { if (!aids.has(k)) { ED.aud[k].pause(); delete ED.aud[k]; } });
}
function edFrame(t) {
  const p = proj(), { L, total } = layout();
  cleanupEls();
  const act = L.filter(x => t >= x.start && t < x.end);
  const stg = $('#stage'); stg.style.background = '#000';
  L.forEach(x => {
    const el = stageEl(x.it), on = act.includes(x);
    el.style.display = on ? '' : 'none'; el.style.opacity = 1; el.style.transform = ''; el.style.clipPath = ''; el.style.zIndex = x.i;
    if (el.tagName === 'VIDEO') {
      if (!on) { if (!el.paused) el.pause(); return; }
      const want = (x.it.in || 0) + (t - x.start);
      el.volume = clamp(p.clipAudio ? (x.it.vol ?? 1) : 0, 0, 1); el.muted = !p.clipAudio;
      if (ED.playing) { if (el.paused) { try { el.currentTime = want; } catch (e) { } el.play().catch(() => { }); } else if (Math.abs(el.currentTime - want) > 0.35) el.currentTime = want; }
      else { if (!el.paused) el.pause(); if (Math.abs(el.currentTime - want) > 0.04) { try { el.currentTime = want; } catch (e) { } } }
    }
  });
  if (act.length === 2) { // transizione in corso
    const [a, b] = act, pr = clamp((t - b.start) / Math.max(0.01, a.end - b.start), 0, 1), ea = ED.els[a.it.id], eb = ED.els[b.it.id];
    switch ((b.it.trans || {}).type) {
      case 'black': case 'white': stg.style.background = b.it.trans.type === 'white' ? '#fff' : '#000';
        ea.style.opacity = clamp(1 - pr * 2, 0, 1); eb.style.opacity = clamp(pr * 2 - 1, 0, 1); break;
      case 'wipeleft': eb.style.clipPath = `inset(0 0 0 ${(1 - pr) * 100}%)`; break;
      case 'wiperight': eb.style.clipPath = `inset(0 ${(1 - pr) * 100}% 0 0)`; break;
      case 'slideleft': eb.style.transform = `translateX(${(1 - pr) * 100}%)`; ea.style.transform = `translateX(${-pr * 100}%)`; break;
      case 'slideright': eb.style.transform = `translateX(${-(1 - pr) * 100}%)`; ea.style.transform = `translateX(${pr * 100}%)`; break;
      case 'circle': eb.style.clipPath = `circle(${pr * 75}% at 50% 50%)`; break;
      case 'zoom': ea.style.transform = `scale(${1 + pr})`; ea.style.opacity = 1 - pr; eb.style.opacity = pr; break;
      default: eb.style.opacity = pr;
    }
  }
  // testi
  $('#pvText').innerHTML = p.texts.filter(x => t >= x.start && t < x.start + x.dur)
    .map(x => `<div class="pvt ${x.pos || 'bottom'} ${x.style === 'title' ? 'title' : ''}">${esc(x.text).replace(/\n/g, '<br>')}</div>`).join('');
  // voci e musica
  const voiceOn = p.audio.some(a => a.lane === 'voice' && t >= a.start && t < a.start + a.dur);
  p.audio.forEach(a => {
    const el = audioEl(a), on = t >= a.start && t < a.start + a.dur;
    if (!on || !ED.playing) { if (!el.paused) el.pause(); if (!on) return; }
    let pos = (a.in || 0) + (t - a.start);
    if (a.loop && a.srcDur) pos = pos % a.srcDur;
    const rel = t - a.start; let v = a.vol;
    if (a.fin > 0 && rel < a.fin) v *= rel / a.fin;
    if (a.fout > 0 && a.start + a.dur - t < a.fout) v *= (a.start + a.dur - t) / a.fout;
    if (a.lane === 'music' && voiceOn && p.duck) v *= 0.3;
    el.volume = clamp(v, 0, 1); el.loop = !!a.loop;
    if (ED.playing) { if (el.paused) { try { el.currentTime = pos; } catch (e) { } el.play().catch(() => { }); } else if (Math.abs(el.currentTime - pos) > 0.35) el.currentTime = pos; }
    else if (Math.abs(el.currentTime - pos) > 0.05) { try { el.currentTime = pos; } catch (e) { } }
  });
  const ph = $('#playhead'); if (ph) ph.style.left = (t * ED.pps) + 'px';
  $('#edTime').textContent = `${fmtT1(t)} / ${fmtT1(total)}`;
}
function seek(t) { ED.t = clamp(t, 0, filmLen()); if (ED.playing) { ED.t0 = performance.now(); ED.tStart = ED.t; } showRender(false); edFrame(ED.t); }
function edPlay() {
  if (!proj().items.length) return;
  if (ED.t >= filmLen() - 0.05) ED.t = 0;
  showRender(false); ED.playing = true; ED.t0 = performance.now(); ED.tStart = ED.t; $('#edPlay').textContent = '❚❚';
  const loop = () => {
    if (!ED.playing) return;
    ED.t = ED.tStart + (performance.now() - ED.t0) / 1000;
    if (ED.t >= filmLen()) { ED.t = filmLen(); edStop(); edFrame(ED.t); return; }
    edFrame(ED.t);
    const wrap = $('#tl2'), x = ED.t * ED.pps; if (x < wrap.scrollLeft || x > wrap.scrollLeft + wrap.clientWidth - 40) wrap.scrollLeft = x - 40;
    ED.raf = requestAnimationFrame(loop);
  };
  edFrame(ED.t); ED.raf = requestAnimationFrame(loop);
}
function edStop() { ED.playing = false; cancelAnimationFrame(ED.raf); $('#edPlay').textContent = '▶'; Object.values(ED.els).forEach(e => e.pause && e.pause()); Object.values(ED.aud).forEach(a => a.pause()); }
$('#edPlay').onclick = () => ED.playing ? edStop() : edPlay();
$('#edBack').onclick = () => { edStop(); seek(0); };
function showRender(on) {
  $('#pvRender').classList.toggle('hidden', !on); $('#stageLayers').classList.toggle('hidden', on); $('#pvText').classList.toggle('hidden', on);
  $('#edBackToEdit').classList.toggle('hidden', !on);
  if (!on) $('#pvRender').pause();
}
$('#edBackToEdit').onclick = () => showRender(false);

/* ---------------- invio a RunPod: anteprima esatta e film ---------------- */
async function clipSource(c, budget) {
  if (c.lib) return c.kind === 'image' ? { key: c.key, image: true } : { key: c.key };
  const src = {};
  if (c.r2key && r2On()) src.key = c.r2key;
  else if (urlValid(c)) src.url = c.url;
  else if (c.blob && c.blob.size * 1.37 < budget.left) { budget.left -= c.blob.size * 1.37; src.b64 = await b64Of(c.blob); }
  else throw new Error(`Il ciak ${c.take || ''} è più vecchio di 7 giorni ed è troppo pesante: collega l'archivio`);
  const ref = c.audioFrom && S.clips.find(x => x.id === c.audioFrom); // Kling con audio del ciak di riferimento
  if (ref && !c.r2key) { if (ref.r2key && r2On()) src.audio = { key: ref.r2key }; else if (urlValid(ref)) src.audio = { url: ref.url }; }
  return src;
}
async function buildInput(preview) {
  const p = proj(), [W, H] = sizeOf(), budget = { left: MAX_PAYLOAD }, { L } = layout();
  const video = [];
  for (const { it } of L) {
    const base = { dur: itemDur(it), trans: it.trans || { type: 'cut', dur: 0 } };
    if (it.kind === 'card') { video.push({ ...base, type: 'card', text: it.text || ' ', small: !!it.small }); continue; }
    const c = srcOf(it); if (!c) throw new Error('Un elemento della traccia video non esiste più: toglilo');
    const s = await clipSource(c, budget);
    const { image, audio, ...src } = s;
    video.push({ ...base, src, ...(image ? { image: true } : {}), ...(audio ? { audio } : {}), in: it.in || 0, vol: it.vol ?? 1 });
  }
  const audio = [];
  for (const a of p.audio) {
    let src = a.src;
    if (src.b64) { if (src.b64.length > budget.left) throw new Error(`"${a.name}" è troppo pesante: collega l'archivio`); budget.left -= src.b64.length; }
    audio.push({ lane: a.lane, src, start: a.start, in: a.in || 0, dur: a.dur, vol: a.vol, fin: a.fin, fout: a.fout, loop: !!a.loop });
  }
  return { action: 'render_timeline', preview, width: W, height: H, clip_audio: p.clipAudio, duck: p.duck,
    video, texts: p.texts.map(t => ({ text: t.text, start: t.start, dur: t.dur, pos: t.pos, style: t.style })), audio };
}
async function sendRender(preview) {
  if (!key()) { toast('Collega prima RunPod'); return openSettings(); }
  if (!montId()) { toast('Collega il worker di montaggio in ⚙︎'); openSettings(); $('#secMont').open = true; return; }
  if (!proj().items.length) return toast('La traccia video è vuota');
  edStop();
  const btn = preview ? $('#edExact') : $('#edExport'); const lbl = btn.textContent; btn.disabled = true; btn.textContent = 'Preparo…';
  try {
    const input = await buildInput(preview);
    const r = await rp(`/${montId()}/run`, { method: 'POST', body: JSON.stringify({ input }) });
    if (!r.id) throw new Error('Risposta inattesa da RunPod');
    const firstCard = proj().items.find(i => i.kind === 'card');
    MT.job = { jobId: r.id, preview, title: proj().title || (firstCard && firstCard.text) || 'Film', started: Date.now() };
    ls('mtJob', JSON.stringify(MT.job)); renderMontage(); pollMontage();
    toast(preview ? 'Anteprima esatta in preparazione su RunPod…' : 'Film inviato a RunPod: puoi chiudere l\'app, riprende da sola');
  } catch (e) { toast(e.message === 'Failed to fetch' ? 'Connessione a RunPod non riuscita' : e.message, 6000); MT.job = null; renderMontage(); }
  btn.textContent = lbl;
}
$('#edExact').onclick = () => sendRender(true);
$('#edExport').onclick = () => sendRender(false);

const MST = { IN_QUEUE: 'In coda su RunPod (avvio del worker)…', IN_PROGRESS: 'RunPod sta montando…' };
async function pollMontage() {
  const job = MT.job; if (!job) return;
  while (MT.job === job) {
    const mins = Math.round((Date.now() - job.started) / 60000);
    try {
      const r = await rp(`/${montId()}/status/${job.jobId}`);
      if (r.status === 'COMPLETED') {
        const out = r.output || {};
        if (out.error) throw Object.assign(new Error('Montaggio non riuscito: ' + out.error.slice(0, 300)), { fatal: true });
        let blob = null, url = out.url || null;
        if (out.video_b64) blob = await (await fetch('data:video/mp4;base64,' + out.video_b64)).blob();
        if (job.preview) {
          const u = blob ? URL.createObjectURL(blob) : url;
          endJob(); $('#pvRender').src = u; showRender(true); $('#pvRender').play().catch(() => { });
          if (isMontageView()) window.scrollTo({ top: 0, behavior: 'smooth' });
          toast('Anteprima esatta pronta ✓'); return;
        }
        $('#edStatus').textContent = 'Scarico il film…';
        if (!blob && url) { try { const f = await fetch(url); if (f.ok) blob = await f.blob(); } catch (e) { } }
        if (!blob && !url) throw Object.assign(new Error('RunPod non ha restituito il film'), { fatal: true });
        await dbPut('films', { id: uid(), title: job.title, blob, url, key: out.key || null, created: Date.now(), dur: out.duration || 0 });
        endJob(); toast('Film montato ✓ — lo trovi in "Film montati"');
        return;
      }
      if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(r.status)) throw Object.assign(new Error('Montaggio non riuscito: ' + (r.error || r.status)), { fatal: true });
      $('#edStatus').textContent = (job.preview ? 'Anteprima esatta · ' : 'Film · ') + (MST[r.status] || r.status) + ` · ${mins} min`;
    } catch (e) {
      if (e.fatal || e.message.includes('Chiave')) { endJob(); toast(e.message, 8000); return; }
      $('#edStatus').textContent = 'Connessione in pausa, riprovo…';
    }
    await new Promise(r => setTimeout(r, 4000));
  }
}
function endJob() { MT.job = null; localStorage.removeItem('regista_mtJob'); $('#edStatus').textContent = ''; if (isMontageView()) renderMontage(); else { $('#edExport').disabled = $('#edExact').disabled = false; $('#edProgWrap').classList.add('hidden'); } }

/* ---------------- film montati ---------------- */
async function renderFilms() {
  let films = [];
  try { films = (await dbAll('films')).sort((a, b) => b.created - a.created); } catch (e) { }
  const box = $('#mtFilms');
  box.innerHTML = films.length ? films.map(f => {
    const url = f.blob ? URL.createObjectURL(f.blob) : f.url;
    return `<div class="clip film">
      <video src="${url}" controls playsinline preload="metadata"></video>
      <div class="meta"><div>${esc(f.title || 'Senza titolo')}</div>${fmtTime(f.dur)} · ${new Date(f.created).toLocaleDateString('it-IT')}
        <div class="actions"><a class="btn small" href="${url}" download="${(f.title || 'film').replace(/[^\w\- ]+/g, '').trim() || 'film'}.mp4">⬇ Scarica</a>
        <button class="btn small" data-subs="${f.id}">💬 Sottotitoli${f.subs && f.subs.length ? ' ✓' : ''}</button>
        <button class="btn small" data-df="${f.id}">Elimina</button></div></div></div>`;
  }).join('') : '<div class="empty">Ancora nessun film.<br>Componi la timeline e premi "Monta il film".</div>';
  box.querySelectorAll('[data-subs]').forEach(b => b.onclick = () => openSubs(films.find(f => f.id === b.dataset.subs)));
  box.querySelectorAll('[data-df]').forEach(b => b.onclick = async () => { if (!confirm('Eliminare questo film?')) return; await dbDel('films', b.dataset.df); renderFilms(); });
}

/* ---------------- dalla Galleria ---------------- */
$('#vToMont').onclick = () => { const n = edAddVideo(viewing.id); toast(`Ciak ${viewing.take || ''} aggiunto al montaggio (${n} nella traccia video)`); };
$('#vContinue').onclick = async () => {
  if (!montId()) { toast('Per estrarre il fotogramma serve l\'endpoint di montaggio'); closeM($('#viewer')); openSettings(); $('#secMont').open = true; return; }
  const c = viewing, btn = $('#vContinue'); btn.disabled = true; btn.textContent = 'RunPod estrae…';
  try {
    const { audio, image, ...src } = await clipSource(c, { left: MAX_PAYLOAD });
    const out = await workerCall({ action: 'lastframe', ...src });
    if (!out || !out.image) throw new Error('Fotogramma non ricevuto');
    loadSettings(c.settings); S.startImg = out.image; showStart(); renderRefChars();
    $('#prompt').value = ''; closeM($('#viewer')); go('crea'); $('#prompt').focus();
    toast('Ultimo fotogramma pronto: descrivi cosa succede dopo');
  } catch (e) { toast('Estrazione non riuscita: ' + e.message, 6000); }
  btn.disabled = false; btn.textContent = '⤳ Continua da qui';
};

/* ---------------- impostazioni montaggio ---------------- */
function montSummary() { const e = $('#sumMont'); e.textContent = montId() ? 'collegato ✓' : 'da collegare'; e.className = montId() ? 'ok' : ''; $('#setMont').value = montId(); }
$('#openSet').addEventListener('click', montSummary);
$('#saveMont').onclick = () => { ls('montEndpoint', $('#setMont').value.trim()); montSummary(); const s = $('#montStatus'); s.textContent = 'Salvato ✓'; s.className = 'status ok'; };
$('#testMont').onclick = async () => {
  ls('montEndpoint', $('#setMont').value.trim()); montSummary();
  const s = $('#montStatus');
  if (!montId()) { s.textContent = 'Inserisci l\'ID'; s.className = 'status ko'; return; }
  s.textContent = 'Controllo (il primo avvio del worker può richiedere un minuto)…'; s.className = 'status';
  try {
    const r = await rp(`/${montId()}/runsync`, { method: 'POST', body: JSON.stringify({ input: { action: 'ping' } }) });
    if (r.output && r.output.ok) { s.textContent = 'Worker di montaggio pronto ✓'; s.className = 'status ok'; }
    else { s.textContent = 'Endpoint raggiunto: il worker si sta avviando, riprova tra poco'; s.className = 'status'; }
  } catch (e) { s.textContent = e.message.includes('404') ? 'ID endpoint non trovato' : e.message; s.className = 'status ko'; }
};
montSummary();
renderPalette();
addEventListener('resize', () => { if (isMontageView()) renderInspector(); });
