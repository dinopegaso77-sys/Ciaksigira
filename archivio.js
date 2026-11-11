/* Ciak si gira — ARCHIVIO R2 completo
   1) Tutto finisce in R2: ogni immagine creata da RunPod viene copiata dal worker (server → R2, gratis),
      le foto del Cast vengono caricate dal telefono. Video e audio erano già salvati.
   2) Galleria → Archivio: tutte le cartelle, con filtri per tipo e provenienza, anteprime e finestra di dettaglio. */
'use strict';

/* ---------------- salvataggio delle immagini create ---------------- */
const IMG_KINDS = { fotogramma: 'Fotogramma', master: 'Master', ritratto: 'Ritratto AI', vista: 'Vista AI', ritocco: 'Ritocco', foto: 'Foto Cast' };
const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/^(\d{8})(\d{6}).*/, '$1-$2');
/* copia un'immagine di RunPod in R2 (immagini/…) e la restituisce come jpeg; senza archivio la scarica e basta */
async function storeImage(url, kind, name, max = 1280) {
  if (r2On() && montId()) {
    try {
      const key = (await workerCall({ action: 'save_url', url, key: `immagini/${stamp()}-${uid().slice(0, 6)}-${kind}-${safeFile(name || kind)}.jpg`, type: 'image/jpeg' })).key;
      ARCH.dirty = true;
      const r = await fetch(await libUrl(key));
      if (r.ok) return { img: await fileToJpeg(await r.blob(), max), key };
      return { img: url, key };
    } catch (e) { /* se il worker non risponde, prova almeno a scaricarla */ }
  }
  return { img: await urlToJpeg(url, max), key: null };
}
/* foto del Cast caricate dal telefono: in R2 in sottofondo, una volta sola */
let castSyncing = false;
async function syncCastToR2() {
  if (castSyncing || !r2On() || !montId()) return;
  castSyncing = true;
  try {
    for (const c of S.chars) {
      let changed = false;
      for (const p of charPhotos(c)) {
        if (p.key || !String(p.img).startsWith('data:')) continue;
        try { p.key = (await uploadToR2(await dataUrlToBlob(p.img), `foto-${safeFile(c.name)}-${p.kind}.jpg`, 'immagini')).key; changed = true; } catch (e) { }
      }
      if (c.master && !c.master.key && String(c.master.img).startsWith('data:')) {
        try { c.master.key = (await uploadToR2(await dataUrlToBlob(c.master.img), `master-${safeFile(c.name)}.jpg`, 'immagini')).key; changed = true; } catch (e) { }
      }
      if (changed) { await dbPut('chars', c); ARCH.dirty = true; }
    }
  } finally { castSyncing = false; }
}

/* ---------------- Galleria → Archivio ---------------- */
const ARCH_SRC = [
  ['libreria/', '📁 I miei file'], ['ciak/', '🎬 Ciak'], ['film/', '🎞 Film'], ['immagini/', '🖼 Immagini AI e Cast'], ['voci/', '🎙 Voci clonate']
];
const TEMP_SRC = ['temp/', 'anteprima/'];
const ARCH = { items: [], loaded: false, loading: null, src: 'all', kind: 'all', show: 60, dirty: false, sel: null };
function archKindOf(key) {
  const k = libKind(key);
  if (key.startsWith('voci/') && k !== 'image') return 'audio';
  return k;
}
function archLabel(key) {
  const n = libName(key);
  const m = n.match(/^(fotogramma|master|ritratto|vista|ritocco|foto)-/);
  return m ? `${IMG_KINDS[m[1]]} · ${n.slice(m[0].length).replace(/\.[a-z0-9]+$/i, '')}` : n;
}
async function archLoad() {
  if (ARCH.loading) return ARCH.loading;
  ARCH.loading = (async () => {
    $('#arStatus').textContent = 'Leggo l\'archivio…';
    try {
      const all = [];
      for (const pre of [...ARCH_SRC.map(s => s[0]), ...TEMP_SRC]) {
        const out = await workerCall({ action: 'list', prefix: pre });
        (out.items || []).forEach(i => all.push({ ...i, src: pre, kind: archKindOf(i.key), name: archLabel(i.key) }));
      }
      ARCH.items = all.sort((a, b) => b.modified.localeCompare(a.modified));
      ARCH.loaded = true; ARCH.dirty = false; $('#arStatus').textContent = '';
    } catch (e) { $('#arStatus').textContent = 'Archivio non raggiungibile: ' + e.message; }
    ARCH.loading = null;
  })();
  return ARCH.loading;
}
async function renderArch(load) {
  $('#arOff').classList.toggle('hidden', r2On()); $('#arOn').classList.toggle('hidden', !r2On());
  if (!r2On()) return;
  if (load && (!ARCH.loaded || ARCH.dirty)) { await archLoad(); syncCastToR2(); }
  const mine = ARCH.items.filter(i => !TEMP_SRC.includes(i.src));
  const tmp = ARCH.items.filter(i => TEMP_SRC.includes(i.src));
  const tot = ARCH.items.reduce((k, i) => k + i.size, 0);
  $('#arUsage').innerHTML = `<b>${fmtSize(tot)}</b> usati · ${mine.length} file${tmp.length ? ` · ${tmp.length} temporanei (${fmtSize(tmp.reduce((k, i) => k + i.size, 0))})` : ''}<small>Cloudflare R2: gratis fino a 10 GB, poi circa 0,015 $ al GB al mese</small>`;
  $('#arSrc').innerHTML = `<button class="chip ${ARCH.src === 'all' ? 'active' : ''}" data-s="all">Tutte</button>` +
    ARCH_SRC.map(([p, t]) => { const n = mine.filter(i => i.src === p).length; return n ? `<button class="chip ${ARCH.src === p ? 'active' : ''}" data-s="${p}">${t} <i>${n}</i></button>` : ''; }).join('');
  $$('#arSrc [data-s]').forEach(b => b.onclick = () => { ARCH.src = b.dataset.s; ARCH.show = 60; renderArch(); });
  $$('#arKind [data-k]').forEach(b => { b.classList.toggle('active', b.dataset.k === ARCH.kind); b.onclick = () => { ARCH.kind = b.dataset.k; ARCH.show = 60; renderArch(); }; });
  const list = mine.filter(i => (ARCH.src === 'all' || i.src === ARCH.src) && (ARCH.kind === 'all' || i.kind === ARCH.kind));
  const vis = list.slice(0, ARCH.show);
  await libUrls(vis.map(i => i.key));
  const box = $('#arGrid');
  box.innerHTML = vis.length ? vis.map(i => {
    const u = LIB.urls[i.key] || '';
    const prev = i.kind === 'video' ? `<video src="${u}#t=0.1" preload="metadata" muted playsinline></video>`
      : i.kind === 'image' ? `<img src="${u}" alt="" loading="lazy">` : `<div class="aud">${i.kind === 'audio' ? '♪' : '📄'}</div>`;
    const src = (ARCH_SRC.find(s => s[0] === i.src) || [0, ''])[1].replace(/^\S+\s/, '');
    return `<div class="clip lf" data-ak="${esc(i.key)}">${prev}<span class="tag">${({ video: 'VIDEO', image: 'IMMAGINE', audio: 'AUDIO' })[i.kind] || 'FILE'}</span>
      <div class="meta"><div>${esc(i.name)}</div>${esc(src)} · ${fmtSize(i.size)} · ${i.modified.slice(8, 10)}/${i.modified.slice(5, 7)}</div></div>`;
  }).join('') : `<div class="empty">${ARCH.loaded ? 'Nessun file con questi filtri.' : 'Caricamento…'}</div>`;
  $$('#arGrid [data-ak]').forEach(el => el.onclick = () => openArchItem(el.dataset.ak));
  $('#arMore').classList.toggle('hidden', list.length <= ARCH.show);
  $('#arMore').textContent = `Mostra altri (${list.length - ARCH.show})`;
}
$('#arMore').onclick = () => { ARCH.show += 60; renderArch(); };
$('#arReload').onclick = () => { ARCH.dirty = true; renderArch(true); };
$('#arClean').onclick = async () => {
  const old = ARCH.items.filter(i => TEMP_SRC.includes(i.src) && Date.now() - Date.parse(i.modified) > 2 * 864e5);
  if (!old.length) return toast('Nessun file temporaneo più vecchio di 2 giorni');
  if (!confirm(`Eliminare ${old.length} file temporanei (${fmtSize(old.reduce((k, i) => k + i.size, 0))})? Sono copie di servizio: ciak, film, immagini e voci non vengono toccati.`)) return;
  const b = $('#arClean'); b.disabled = true; let n = 0;
  for (const i of old) { try { await workerCall({ action: 'delete', key: i.key }); n++; b.textContent = `🧹 ${n}/${old.length}`; } catch (e) { } }
  b.disabled = false; b.textContent = '🧹 Svuota temporanei';
  toast(`${n} temporanei eliminati`); ARCH.dirty = true; renderArch(true);
};
async function openArchItem(key) {
  const i = ARCH.items.find(x => x.key === key); if (!i) return; ARCH.sel = i;
  const u = await libUrl(key);
  $('#aiTitle').textContent = i.name;
  $('#aiPrev').innerHTML = i.kind === 'video' ? `<video src="${u}" controls playsinline></video>` : i.kind === 'image' ? `<img src="${u}" alt="">`
    : i.kind === 'audio' ? `<audio src="${u}" controls></audio>` : '<p class="muted">Anteprima non disponibile</p>';
  $('#aiInfo').textContent = `${(ARCH_SRC.find(s => s[0] === i.src) || [0, ''])[1]} · ${fmtSize(i.size)} · ${new Date(i.modified).toLocaleString('it-IT')} · ${key}`;
  $('#aiDl').href = u; $('#aiDl').setAttribute('download', libName(key));
  $('#aiUse').classList.toggle('hidden', i.src !== 'libreria/');
  openM('mArch');
}
$('#aiUse').onclick = () => { const i = ARCH.sel; if (!i) return; closeM($('#mArch')); if (!LIB.items.some(x => x.key === i.key)) LIB.items.unshift({ ...i, name: libName(i.key) }); openUse(i.key); };
$('#aiDel').onclick = async () => {
  const i = ARCH.sel; if (!i) return;
  const warn = i.src === 'ciak/' ? ' È la copia di sicurezza di un ciak: se il link di RunPod è scaduto, il ciak non si potrà più rivedere.' : i.src === 'immagini/' ? ' Se è un master o una foto del Cast, la copia sul telefono resta.' : '';
  if (!confirm(`Eliminare "${i.name}" dall'archivio?${warn}`)) return;
  try { await workerCall({ action: 'delete', key: i.key }); ARCH.items = ARCH.items.filter(x => x.key !== i.key); LIB.items = LIB.items.filter(x => x.key !== i.key); closeM($('#mArch')); renderArch(); toast('Eliminato'); }
  catch (e) { toast('Non eliminato: ' + e.message, 6000); }
};
setTimeout(() => { if (r2On() && montId()) syncCastToR2(); }, 4000);
