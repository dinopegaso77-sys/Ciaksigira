/* Regista AI — "I miei file": archivio Cloudflare R2 gestito dal worker RunPod.
   L'app carica i file direttamente nell'archivio con link firmati e li usa ovunque
   (foto di partenza, ciak di riferimento, voce/canzone, montaggio, musica). */
'use strict';

const LIB = { items: [], urls: {}, urlTime: {}, meta: {}, filter: 'all', loaded: false, loading: null };
try { LIB.meta = JSON.parse(ls('libMeta') || '{}'); } catch (e) { }
MODELS.lib = { name: 'Mio file', group: null, needs: {}, ratios: null, durations: [], res: [], price: () => 0 };

const r2On = () => ls('r2') === '1';
const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'webm', '3gp', 'mkv'], IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'], AUD_EXT = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus'];
function libKind(key) {
  const n = key.split('/').pop().toLowerCase(), ext = n.split('.').pop();
  if (/-voce\.[a-z0-9]+$/.test(n) || AUD_EXT.includes(ext)) return 'audio';
  if (IMG_EXT.includes(ext)) return 'image';
  if (VIDEO_EXT.includes(ext)) return 'video';
  return 'other';
}
const libName = key => key.split('/').pop().replace(/^\d{8}-\d{6}-[0-9a-f]{6}-/, '');
const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
function saveMeta() { ls('libMeta', JSON.stringify(LIB.meta)); }

/* ---------- comunicazione con l'archivio (tramite il worker) ---------- */
async function libCheck() {
  const out = await workerCall({ action: 'ping' }, 120);
  ls('r2', out.r2 ? '1' : '0');
  return !!out.r2;
}
async function libRefresh(silent) {
  if (!r2On()) return;
  if (LIB.loading) return LIB.loading;
  LIB.loading = (async () => {
    try {
      if (!silent) $('#libStatus').textContent = 'Carico l\'elenco dall\'archivio…';
      const out = await workerCall({ action: 'list', prefix: 'libreria/' });
      LIB.items = (out.items || []).map(i => ({ ...i, kind: libKind(i.key), name: libName(i.key) }))
        .sort((a, b) => b.modified.localeCompare(a.modified));
      await libUrls(LIB.items.map(i => i.key));
      LIB.loaded = true;
      if (!silent) $('#libStatus').textContent = '';
      if (MODELS[S.engine].needs.video) fillRefVideos();
    } catch (e) { if (!silent) $('#libStatus').textContent = 'Archivio non raggiungibile: ' + e.message; }
    LIB.loading = null;
    renderLib();
  })();
  return LIB.loading;
}
async function libUrls(keys) {
  const need = keys.filter(k => !LIB.urls[k] || Date.now() - (LIB.urlTime[k] || 0) > 20 * 3600e3);
  for (let i = 0; i < need.length; i += 200) {
    const out = await workerCall({ action: 'urls', keys: need.slice(i, i + 200), expires: 86400 });
    Object.entries(out.urls || {}).forEach(([k, u]) => { LIB.urls[k] = u; LIB.urlTime[k] = Date.now(); });
  }
}
async function libUrl(key) { await libUrls([key]); return LIB.urls[key]; }

/* caricamento diretto telefono → archivio, con avanzamento */
async function uploadToR2(blob, name, folder = 'libreria', onProgress) {
  const type = blob.type || 'application/octet-stream';
  const p = await workerCall({ action: 'presign_put', name, type, folder });
  await new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('PUT', p.put); x.setRequestHeader('Content-Type', type);
    x.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    x.onload = () => x.status < 300 ? res() : rej(new Error('caricamento rifiutato (' + x.status + ')'));
    x.onerror = () => rej(new Error('caricamento non riuscito: controlla la regola CORS dell\'archivio'));
    x.send(blob);
  });
  LIB.urls[p.key] = p.get; LIB.urlTime[p.key] = Date.now();
  return p;
}
const dataUrlToBlob = async d => (await fetch(d)).blob();

/* i modelli vogliono link: con l'archivio attivo, foto e audio locali vengono caricati e passati come link */
const MODEL_CACHE = {};
async function toModelUrl(v, name) {
  if (!v || !r2On() || !String(v).startsWith('data:')) return v;
  const sig = v.length + ':' + v.slice(-64);
  if (MODEL_CACHE[sig] && Date.now() - MODEL_CACHE[sig].t < 20 * 3600e3) return MODEL_CACHE[sig].url;
  const blob = await dataUrlToBlob(v);
  const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg').replace('mpeg', 'mp3');
  const p = await uploadToR2(blob, `${name}.${ext}`, 'temp');
  MODEL_CACHE[sig] = { url: p.get, t: Date.now() };
  return p.get;
}
async function charModelUrl(c) {
  if (!r2On()) return c.img;
  if (c.r2key) return await libUrl(c.r2key);
  const p = await uploadToR2(await dataUrlToBlob(c.img), `${c.name}.jpg`, 'cast');
  c.r2key = p.key; await dbPut('chars', c);
  return p.get;
}
async function prepareModelInputs(o) {
  if (!r2On()) return;
  const chars = o.charIds.map(id => S.chars.find(c => c.id === id)).filter(Boolean);
  o.charImgs = await Promise.all(chars.map(charModelUrl));
  o.startImg = await toModelUrl(o.startImg, 'foto');
  o.img = o.startImg || o.charImgs[0] || null;
  o.audioIn = await toModelUrl(o.audioIn, 'audio');
}

/* backup automatico dei ciak generati nell'archivio */
async function backupClip(clip, muxedBlob) {
  if (!r2On()) return;
  try {
    const name = `ciak-${clip.take || ''}-${clip.id}.mp4`;
    let key;
    if (muxedBlob) key = (await uploadToR2(muxedBlob, name, 'ciak')).key;
    else key = (await workerCall({ action: 'save_url', url: clip.url, key: `ciak/${name}` }, 180)).key;
    clip.r2key = key; await dbPut('clips', clip);
  } catch (e) { /* il backup riproverà al prossimo uso */ }
}

/* ---------- interfaccia: schede della Galleria ---------- */
function galTab(t) {
  $$('#galTabs button').forEach(b => b.classList.toggle('active', b.dataset.g === t));
  $('#galCiak').classList.toggle('hidden', t !== 'ciak');
  $('#galFiles').classList.toggle('hidden', t !== 'file');
  $('#cmpBtn').classList.toggle('hidden', t !== 'ciak');
  if (t === 'file') { renderLib(); if (r2On() && !LIB.loaded) libRefresh(); }
}
$$('#galTabs button').forEach(b => b.onclick = () => galTab(b.dataset.g));
$$('#libFilter .chip').forEach(b => b.onclick = () => { LIB.filter = b.dataset.v; renderLib(); });
$('#libReload').onclick = () => libRefresh();
$('#libConnect').onclick = () => { openSettings(); $('#secR2').open = true; };

function renderLib() {
  $('#libOff').classList.toggle('hidden', r2On());
  $('#libOn').classList.toggle('hidden', !r2On());
  if (!r2On()) return;
  $$('#libFilter .chip').forEach(b => b.classList.toggle('active', b.dataset.v === LIB.filter));
  const list = LIB.items.filter(i => LIB.filter === 'all' || i.kind === LIB.filter);
  const box = $('#libGrid');
  if (!list.length) { box.innerHTML = `<div class="empty">${LIB.loaded ? (LIB.items.length ? 'Nessun file di questo tipo.' : 'L\'archivio è vuoto.<br>Carica un video, una foto o registra la tua voce.') : 'Caricamento…'}</div>`; return; }
  box.innerHTML = list.map(i => {
    const u = LIB.urls[i.key] || '';
    const prev = i.kind === 'video' ? `<video src="${u}#t=0.1" preload="metadata" muted playsinline data-meta="${esc(i.key)}"></video>`
      : i.kind === 'image' ? `<img src="${u}" alt="" loading="lazy">`
        : `<div class="aud">${i.kind === 'audio' ? '♪' : '📄'}</div>`;
    const d = LIB.meta[i.key]?.dur;
    return `<div class="clip lf" data-use="${esc(i.key)}">
      ${prev}<span class="tag">${({ video: 'VIDEO', image: 'FOTO', audio: 'AUDIO' })[i.kind] || 'FILE'}</span>
      <div class="meta"><div>${esc(i.name)}</div>${fmtSize(i.size)}${d ? ' · ' + fmtTime(d) : ''}</div></div>`;
  }).join('');
  box.querySelectorAll('[data-use]').forEach(el => el.onclick = () => openUse(el.dataset.use));
  box.querySelectorAll('video[data-meta]').forEach(v => v.onloadedmetadata = () => {
    const k = v.dataset.meta; if (LIB.meta[k]?.dur) return;
    LIB.meta[k] = { dur: Math.round(v.duration * 10) / 10, w: v.videoWidth, h: v.videoHeight }; saveMeta();
  });
}

/* ---------- caricamento file ---------- */
$('#libFile').onchange = async e => {
  const files = [...e.target.files]; e.target.value = '';
  for (const f of files) await uploadOne(f, f.name);
  libRefresh(true);
};
async function uploadOne(blob, name) {
  const row = document.createElement('div'); row.className = 'uprow';
  row.innerHTML = `<span>${esc(name)}</span><div class="prog big"><i style="width:0"></i></div><em>0%</em>`;
  $('#upList').prepend(row);
  try {
    await uploadToR2(blob, name, 'libreria', p => { row.querySelector('i').style.width = Math.round(p * 100) + '%'; row.querySelector('em').textContent = Math.round(p * 100) + '%'; });
    row.querySelector('em').textContent = '✓'; setTimeout(() => row.remove(), 2500);
  } catch (err) { row.classList.add('bad'); row.querySelector('em').textContent = '✕'; row.title = err.message; toast(name + ': ' + err.message, 6000); }
}

/* ---------- registra la voce ---------- */
const REC = { mr: null, chunks: [], t0: 0, timer: null, blob: null };
$('#recOpen').onclick = () => { recReset(); openM('mRec'); };
function recReset() {
  REC.blob = null; $('#recPlay').classList.add('hidden'); $('#recSave').disabled = true;
  $('#recTime').textContent = '0:00'; $('#recBtn').textContent = '● Registra'; $('#recBtn').classList.remove('on');
  $('#recName').value = 'registrazione-' + new Date().toLocaleDateString('it-IT').replace(/\//g, '-');
}
$('#recBtn').onclick = async () => {
  if (REC.mr && REC.mr.state === 'recording') { REC.mr.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
    REC.mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); REC.chunks = [];
    REC.mr.ondataavailable = e => e.data.size && REC.chunks.push(e.data);
    REC.mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop()); clearInterval(REC.timer);
      REC.blob = new Blob(REC.chunks, { type: (REC.mr.mimeType || 'audio/webm').split(';')[0] });
      const a = $('#recPlay'); a.src = URL.createObjectURL(REC.blob); a.classList.remove('hidden');
      $('#recBtn').textContent = '● Registra di nuovo'; $('#recBtn').classList.remove('on'); $('#recSave').disabled = false;
    };
    REC.mr.start(); REC.t0 = Date.now();
    $('#recBtn').textContent = '■ Ferma'; $('#recBtn').classList.add('on');
    REC.timer = setInterval(() => { $('#recTime').textContent = fmtTime((Date.now() - REC.t0) / 1000); }, 250);
  } catch (e) { toast('Microfono non disponibile: concedi il permesso al browser'); }
};
$('#recSave').onclick = async () => {
  if (!REC.blob) return;
  const ext = REC.blob.type.includes('mp4') ? 'm4a' : 'webm';
  const name = `${safeFile($('#recName').value || 'voce')}-voce.${ext}`;
  closeM($('#mRec')); galTab('file');
  await uploadOne(REC.blob, name); libRefresh(true);
};
const safeFile = s => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'file';

/* ---------- menu "Usa" di un file ---------- */
let USE = null;
function openUse(key) {
  const i = LIB.items.find(x => x.key === key); if (!i) return; USE = i;
  const u = LIB.urls[key];
  $('#useTitle').textContent = i.name;
  $('#usePrev').innerHTML = i.kind === 'video' ? `<video src="${u}" controls playsinline></video>`
    : i.kind === 'image' ? `<img src="${u}" alt="">` : i.kind === 'audio' ? `<audio src="${u}" controls></audio>` : '';
  const A = {
    video: [['ref', '🎞 Usa come ciak di riferimento (movimento)'], ['mont', '✂️ Aggiungi al montaggio'], ['dub', '🎤 Aggiungi voce o audio'], ['last', '⤳ Continua da qui (ultimo fotogramma)']],
    image: [['start', '📷 Usa come foto di partenza'], ['mont', '✂️ Aggiungi al montaggio'], ['char', '🎭 Crea un personaggio da questa foto']],
    audio: [['music', '♪ Musica del film (montaggio)'], ['talk', '🎤 Voce o canzone per InfiniteTalk']]
  }[i.kind] || [];
  $('#useActs').innerHTML = [...A, ['dl', '⬇ Scarica'], ['del', '🗑 Elimina dall\'archivio']]
    .map(([a, l]) => `<button class="btn ${a === 'del' ? 'danger' : ''}" data-act="${a}">${l}</button>`).join('');
  $$('#useActs [data-act]').forEach(b => b.onclick = () => useAction(b.dataset.act, b));
  openM('mUse');
}
async function useAction(a, btn) {
  const i = USE, url = await libUrl(i.key);
  const done = msg => { closeM($('#mUse')); if (msg) toast(msg); };
  if (a === 'dub') { done(); openDub({ item: i }); return; }
  if (a === 'start') { S.startImg = url; showStart(); done(); go('crea'); toast('Foto di partenza impostata'); }
  if (a === 'mont') { if (!MT.proj) mtLoad(); MT.proj.items.push('lib:' + i.key); mtSave(); done(`Aggiunto al montaggio (${MT.proj.items.length} in timeline)`); }
  if (a === 'ref') {
    if (!MODELS[S.engine].needs.video) setEngine('klingmc');
    fillRefVideos('lib:' + i.key); $('#refVideo').value = 'lib:' + i.key; updateCost();
    done(); go('crea'); toast(`Riferimento impostato · modello: ${MODELS[S.engine].name}`);
  }
  if (a === 'last') {
    btn.disabled = true; btn.textContent = 'RunPod estrae il fotogramma…';
    try { const out = await workerCall({ action: 'lastframe', key: i.key }); S.startImg = out.image; showStart(); done(); go('crea'); toast('Ultimo fotogramma pronto: descrivi cosa succede dopo'); }
    catch (e) { toast('Estrazione non riuscita: ' + e.message); btn.disabled = false; }
  }
  if (a === 'char') {
    try { charImg = await fileToJpeg(await (await fetch(url)).blob(), 1024); } catch (e) { return toast('Foto non leggibile'); }
    $('#charPreview').innerHTML = `<img src="${charImg}" alt="">`; $('#charName').value = '';
    done(); go('personaggi'); openM('mChar');
  }
  if (a === 'music') {
    MT.music = { id: 'music', name: i.name, key: i.key }; await dbPut('audio', MT.music);
    done('Musica del film impostata'); if (!MT.proj) mtLoad(); go('montaggio');
  }
  if (a === 'talk') {
    S.audioIn = url; S.audioName = i.name; S.audioDur = LIB.meta[i.key]?.dur || 0;
    const au = new Audio(url); au.onloadedmetadata = () => { S.audioDur = Math.round(au.duration) || 0; };
    setEngine('talk'); showAudioIn(); done(); go('crea'); toast('Audio pronto per InfiniteTalk');
  }
  if (a === 'dl') { const l = document.createElement('a'); l.href = url; l.download = i.name; l.target = '_blank'; l.rel = 'noopener'; l.click(); }
  if (a === 'del') {
    if (!confirm(`Eliminare "${i.name}" dall'archivio? Non si può annullare.`)) return;
    try { await workerCall({ action: 'delete', key: i.key }); LIB.items = LIB.items.filter(x => x.key !== i.key); done('Eliminato'); renderLib(); }
    catch (e) { toast('Eliminazione non riuscita: ' + e.message); }
  }
}

/* ---------- i file dell'archivio come "clip" per montaggio e riferimenti ---------- */
function libClip(id) {
  if (!String(id).startsWith('lib:')) return null;
  const key = id.slice(4), kind = libKind(key), m = LIB.meta[key] || {};
  const ratio = m.w && m.h ? (m.w / m.h > 1.5 ? '16:9' : m.w / m.h < 0.7 ? '9:16' : '1:1') : '16:9';
  return {
    id, lib: true, key, kind, take: null, created: Date.now(), url: LIB.urls[key] || '',
    settings: { engine: 'lib', duration: kind === 'image' ? 4 : (m.dur || 5), prompt: libName(key), ratio }
  };
}

/* ---------- impostazioni: archivio ---------- */
function r2Summary() { const e = $('#sumR2'); e.textContent = r2On() ? 'attivo ✓' : 'non attivo'; e.className = r2On() ? 'ok' : ''; }
$('#testR2').onclick = async () => {
  const s = $('#r2Status');
  if (!montId()) { s.textContent = 'Prima collega il worker di montaggio qui sopra'; s.className = 'status ko'; return; }
  s.textContent = 'Controllo (il primo avvio del worker può richiedere un minuto)…'; s.className = 'status';
  try {
    const ok = await libCheck(); r2Summary();
    s.textContent = ok ? 'Archivio collegato ✓' : 'Il worker risponde ma non vede l\'archivio: controlla le 3 variabili R2 su RunPod';
    s.className = 'status ' + (ok ? 'ok' : 'ko');
    if (ok) { LIB.loaded = false; renderLib(); }
  } catch (e) { s.textContent = e.message; s.className = 'status ko'; }
};
$('#openSet').addEventListener('click', r2Summary);
r2Summary();
