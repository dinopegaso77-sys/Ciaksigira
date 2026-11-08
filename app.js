/* Regista AI — generatore di clip video via RunPod Public Endpoints */
'use strict';

const API = 'https://api.runpod.ai/v2';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + ' $';

/* ---------- modelli ---------- */
const MODELS = {
  wan: {
    name: 'Wan 2.6', desc: 'Economico: ideale per prove e bozze', neg: true, audio: false,
    ratios: ['16:9', '9:16'], durations: [5, 10, 15], res: ['720p', '1080p'], defRes: '720p',
    hint: 'La foto di partenza diventa il primo fotogramma.',
    endpoint: o => o.startImg ? 'wan-2-6-i2v' : 'wan-2-6-t2v',
    price: o => (o.res === '1080p' ? 0.15 : 0.10) * o.duration,
    input(o) {
      const sizes = { '16:9': { '720p': '1280*720', '1080p': '1920*1080' }, '9:16': { '720p': '720*1280', '1080p': '1080*1920' } };
      const ratio = o.startImg ? '16:9' : o.ratio; // i2v solo orizzontale
      const inp = { prompt: o.prompt, duration: o.duration, shot_type: 'single', seed: -1, enable_prompt_expansion: false };
      if (o.startImg) inp.resolution = o.res;       // immagine→video: vuole "720p" / "1080p"
      else inp.size = sizes[ratio][o.res];           // testo→video: vuole "1280*720" ecc.
      if (o.negative) inp.negative_prompt = o.negative;
      if (o.startImg) inp.image = o.startImg;
      return inp;
    }
  },
  seedance: {
    name: 'Seedance 2.5', desc: 'Qualità massima, con audio incluso', neg: false, audio: true,
    ratios: ['16:9', '9:16', '21:9', '1:1', '4:3', '3:4'], durations: [4, 5, 6, 8, 10, 12, 15, 20, 30],
    res: ['480p', '720p', '1080p', '4k'], defRes: '1080p',
    hint: 'I personaggi scelti fanno da riferimento per i volti.',
    endpoint: o => o.startImg ? '16jsvx5ncmm24x' : 'tdq07exynr7zux',
    price: o => ({ '480p': 0.18, '720p': 0.36, '1080p': 0.90, '4k': 1.80 })[o.res] * o.duration,
    input(o) {
      const inp = { prompt: o.prompt, duration: o.duration, resolution: o.res, aspect_ratio: o.ratio, generate_audio: o.audio, seed: -1 };
      if (o.startImg) inp.image = o.startImg;
      else if (o.charImgs.length) inp.reference_images = o.charImgs.slice(0, 9);
      return inp;
    }
  },
  kling: {
    name: 'Kling O1', desc: 'Segue il movimento di un tuo ciak e ci mette i tuoi personaggi', neg: true, audio: false, needsVideo: true,
    ratios: ['16:9', '9:16', '1:1'], durations: [3, 4, 5, 6, 7, 8, 9, 10], res: [], defRes: null,
    hint: 'Scegli i personaggi (o una foto) e un ciak di riferimento.',
    endpoint: () => 'kling-video-o1-r2v',
    price: o => 0.112 * o.duration,
    input(o) {
      const images = [...(o.startImg ? [o.startImg] : []), ...o.charImgs].slice(0, 10);
      const inp = { prompt: o.prompt, images, video: o.refVideo, aspect_ratio: o.ratio, duration: o.duration, seed: -1, enable_prompt_expansion: false };
      if (o.negative) inp.negative_prompt = o.negative;
      return inp;
    }
  }
};

/* ---------- stato ---------- */
const S = {
  engine: 'wan', startImg: null, selChars: new Set(), chars: [], clips: [],
  filter: 'all', cmp: [], jobs: JSON.parse(ls('jobs') || '[]')
};
function ls(k, v) {
  try { if (v === undefined) return localStorage.getItem('regista_' + k); localStorage.setItem('regista_' + k, v); }
  catch (e) { return null; }
}
const key = () => (S.apiKey || '').trim();

/* ---------- sicurezza: password + chiave cifrata ---------- */
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
let cryptoKey = null;
async function derive(pw, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, 512);
  const b = new Uint8Array(bits);
  return { verifier: b64(b.slice(32)), aes: await crypto.subtle.importKey('raw', b.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']) };
}
async function encryptKey(plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, enc.encode(plain));
  ls('keyEnc', b64(iv) + '.' + b64(ct));
}
async function decryptKey() {
  const v = ls('keyEnc'); if (!v) return '';
  const [iv, ct] = v.split('.');
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, cryptoKey, unb64(ct)));
}
async function setPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const d = await derive(pw, salt);
  cryptoKey = d.aes; ls('salt', b64(salt)); ls('verifier', d.verifier);
  if (S.apiKey) await encryptKey(S.apiKey); else localStorage.removeItem('regista_keyEnc');
}
async function checkPassword(pw) {
  const d = await derive(pw, unb64(ls('salt')));
  if (d.verifier !== ls('verifier')) return false;
  cryptoKey = d.aes;
  try { S.apiKey = await decryptKey(); } catch (e) { S.apiKey = ''; }
  return true;
}
function lockApp() { S.apiKey = ''; cryptoKey = null; location.reload(); }

async function showLock() {
  const hasPw = !!ls('verifier');
  const L = $('#lock');
  $('#lockTitle').textContent = hasPw ? 'App bloccata' : 'Crea la tua password';
  $('#lockText').textContent = hasPw ? 'Inserisci la password per entrare.' : 'Primo accesso su questo dispositivo: scegli una password (almeno 6 caratteri). Servirà ogni volta che apri l\'app.';
  $('#lockPw2').parentElement.classList.toggle('hidden', hasPw);
  $('#lockForgot').classList.toggle('hidden', !hasPw);
  L.classList.remove('hidden'); setTimeout(() => $('#lockPw').focus(), 50);
  let fails = 0;
  return new Promise(resolve => {
    $('#lockForm').onsubmit = async e => {
      e.preventDefault();
      const pw = $('#lockPw').value, msg = $('#lockMsg'), btn = $('#lockBtn');
      msg.textContent = '';
      if (!hasPw) {
        if (pw.length < 6) return msg.textContent = 'Almeno 6 caratteri';
        if (pw !== $('#lockPw2').value) return msg.textContent = 'Le due password non coincidono';
        btn.disabled = true; btn.textContent = 'Attendi…';
        S.apiKey = (ls('key') || '').trim(); // eventuale chiave salvata in chiaro da versioni precedenti
        await setPassword(pw); localStorage.removeItem('regista_key');
      } else {
        btn.disabled = true; btn.textContent = 'Controllo…';
        const ok = await checkPassword(pw);
        if (!ok) {
          fails++; $('#lockPw').value = '';
          await new Promise(r => setTimeout(r, Math.min(fails, 10) * 700));
          btn.disabled = false; btn.textContent = 'Entra';
          return msg.textContent = 'Password errata';
        }
      }
      $('#lockPw').value = ''; $('#lockPw2').value = '';
      L.classList.add('hidden'); resolve();
    };
    $('#lockForgot').onclick = () => {
      if (!confirm('Reimpostare la password? Per sicurezza la chiave RunPod salvata verrà cancellata e dovrai reinserirla. Clip e personaggi restano.')) return;
      ['salt', 'verifier', 'keyEnc', 'key'].forEach(k => localStorage.removeItem('regista_' + k));
      location.reload();
    };
  });
}

/* ---------- IndexedDB ---------- */
let dbp;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('regista', 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      ['clips', 'chars', 'films', 'audio'].forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function dbAll(store) { const d = await db(); return new Promise(r => { const q = d.transaction(store).objectStore(store).getAll(); q.onsuccess = () => r(q.result); q.onerror = () => r([]); }); }
async function dbPut(store, v) { const d = await db(); return new Promise(r => { const t = d.transaction(store, 'readwrite'); t.objectStore(store).put(v); t.oncomplete = r; t.onerror = r; }); }
async function dbDel(store, id) { const d = await db(); return new Promise(r => { const t = d.transaction(store, 'readwrite'); t.objectStore(store).delete(id); t.oncomplete = r; t.onerror = r; }); }

/* ---------- utilità ---------- */
function toast(msg, ms = 3500) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), ms); }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function fileToJpeg(file, max = 1280) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => rej(new Error('Immagine non leggibile'));
    img.src = URL.createObjectURL(file);
  });
}

async function rp(path, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { Authorization: 'Bearer ' + key(), 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  let j = {}; try { j = await r.json(); } catch (e) { }
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw new Error('Chiave RunPod non valida');
    throw new Error(j.error || j.message || ('Errore RunPod ' + r.status));
  }
  return j;
}

/* ---------- navigazione e finestre ---------- */
function go(view) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  if (view === 'galleria') renderGallery();
  if (view === 'montaggio' && window.renderMontage) renderMontage();
  window.scrollTo(0, 0);
}
$$('.tab').forEach(t => t.onclick = () => go(t.dataset.view));

function openM(id) { if (id === 'mSettings') return openSettings(); $('#' + id).classList.remove('hidden'); }
function closeM(m) {
  m.classList.add('hidden');
  m.querySelectorAll('video').forEach(v => v.pause());
}
$$('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) closeM(m); });
  m.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeM(m));
});
$$('[data-open]').forEach(b => b.onclick = () => openM(b.dataset.open));
document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.modal:not(.hidden)').forEach(closeM); });
$('#openSet').onclick = () => openSettings();
$('#jobsPill').onclick = () => openM('mJobs');

/* numero di ciak progressivo */
const nextTake = () => (parseInt(ls('take')) || 0) + 1;
function showTake() { $('#nextTake').textContent = nextTake(); }

/* ---------- form Crea ---------- */
function fillSelect(sel, values, labelFn, keep) {
  const old = keep ?? sel.value;
  sel.innerHTML = values.map(v => `<option value="${v}">${labelFn(v)}</option>`).join('');
  if (values.map(String).includes(String(old))) sel.value = old;
}
function setEngine(e, keepVals) {
  S.engine = e; const m = MODELS[e];
  $$('#engine button').forEach(b => b.classList.toggle('active', b.dataset.v === e));
  $('#engDesc').innerHTML = `<b>${m.name}</b> · ${m.desc}`;
  const lab = {};
  fillSelect($('#ratio'), m.ratios, v => lab[v] || v, keepVals?.ratio);
  fillSelect($('#duration'), m.durations, v => v + ' sec', keepVals?.duration ?? (m.durations.includes(5) ? 5 : m.durations[0]));
  $('#resWrap').classList.toggle('hidden', !m.res.length);
  if (m.res.length) fillSelect($('#res'), m.res, v => v === '4k' ? '4K' : v, keepVals?.res ?? m.defRes);
  $('#audioWrap').classList.toggle('hidden', !m.audio);
  $('#negWrap').classList.toggle('hidden', !m.neg);
  $('#refHint').textContent = m.hint;
  $('#refVidWrap').classList.toggle('hidden', !m.needsVideo);
  if (m.needsVideo) fillRefVideos(keepVals?.refVideoId);
  updateCost();
}
function fillRefVideos(keep) {
  const sel = $('#refVideo'), old = keep ?? sel.value;
  sel.innerHTML = S.clips.length
    ? '<option value="">— scegli un ciak —</option>' + S.clips.map(c => `<option value="${c.id}">Ciak ${c.take || '–'} · ${esc(c.settings.prompt).slice(0, 40)}</option>`).join('')
    : '<option value="">Prima gira un ciak con Wan o Seedance</option>';
  if (S.clips.some(c => c.id === old)) sel.value = old;
}
async function videoSource(c) {
  if (c.url && Date.now() - c.created < 6.5 * 864e5) return c.url;
  if (c.blob && c.blob.size < 7 * 1024 * 1024) return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(c.blob); });
  throw new Error(`Il ciak ${c.take || ''} è troppo vecchio o pesante: scegline uno più recente`);
}
$$('#engine button').forEach(b => b.onclick = () => setEngine(b.dataset.v));
['#ratio', '#duration', '#res'].forEach(s => $(s).onchange = updateCost);

function currentOpts() {
  const m = MODELS[S.engine];
  const chars = S.chars.filter(c => S.selChars.has(c.id));
  let prompt = $('#prompt').value.trim();
  if (chars.length) prompt += '\n' + chars.map(c => `${c.name}: ${c.desc}`.trim()).join('. ');
  return {
    engine: S.engine, prompt, rawPrompt: $('#prompt').value.trim(),
    negative: m.neg ? $('#negative').value.trim() : '',
    ratio: $('#ratio').value, duration: +$('#duration').value,
    res: m.res.length ? $('#res').value : '720p', audio: $('#audio').checked,
    startImg: S.startImg, charImgs: chars.map(c => c.img), charIds: chars.map(c => c.id),
    refVideoId: m.needsVideo ? $('#refVideo').value : ''
  };
}
function updateCost() {
  const o = currentOpts(); const m = MODELS[S.engine];
  const extra = (S.engine === 'wan' && o.startImg && o.ratio === '9:16') ? '<span>con foto di partenza Wan gira solo in 16:9</span>' : '';
  $('#costHint').innerHTML = `<span>Costo stimato</span><b>${money(m.price(o))}</b>${extra}`;
}

/* foto di partenza */
$('#refFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { S.startImg = await fileToJpeg(f); showStart(); } catch (err) { toast(err.message); }
};
$('#refClear').onclick = () => { S.startImg = null; showStart(); };
function showStart() {
  $('#refPreview').classList.toggle('hidden', !S.startImg);
  $('#refClear').classList.toggle('hidden', !S.startImg);
  $('#refPreview').innerHTML = S.startImg ? `<img src="${S.startImg}" alt="">` : '';
  updateCost();
}

function renderRefChars() {
  const box = $('#refChars');
  box.innerHTML = S.chars.map(c => `<button class="rc ${S.selChars.has(c.id) ? 'on' : ''}" data-id="${c.id}"><img src="${c.img}" alt="">${esc(c.name)}</button>`).join('');
  box.querySelectorAll('.rc').forEach(b => b.onclick = () => {
    S.selChars.has(b.dataset.id) ? S.selChars.delete(b.dataset.id) : S.selChars.add(b.dataset.id); renderRefChars(); updateCost();
  });
}

/* ---------- avvio generazione ---------- */
const GO_LABEL = '🎬 Ciak, si gira!';
$('#goBtn').onclick = async () => {
  if (!key()) { toast('Collega prima RunPod'); openSettings(); return; }
  const o = currentOpts(); const m = MODELS[o.engine];
  if (!o.rawPrompt) { toast('Scrivi la descrizione della scena'); $('#prompt').focus(); return; }
  if (o.engine === 'kling' && !o.startImg && !o.charImgs.length) { toast('Kling vuole almeno un personaggio o una foto'); return; }
  if (m.needsVideo) {
    const rc = S.clips.find(c => c.id === o.refVideoId);
    if (!rc) { toast('Scegli il ciak di riferimento per Kling'); $('#refVideo').focus(); return; }
    try { o.refVideo = await videoSource(rc); } catch (e) { toast(e.message, 5000); return; }
  }
  const est = m.price(o);
  if (est >= 3 && !confirm(`Questa clip costa circa ${money(est)}. Procedo?`)) return;
  const btn = $('#goBtn'); btn.disabled = true; btn.textContent = 'Invio al set…';
  const endpoint = m.endpoint(o);
  try {
    const input = m.input(o);
    const r = await rp(`/${endpoint}/run`, { method: 'POST', body: JSON.stringify({ input }) });
    if (!r.id) throw new Error('Risposta inattesa da RunPod');
    const take = nextTake(); ls('take', String(take)); showTake();
    const job = {
      id: uid(), jobId: r.id, endpoint, status: r.status || 'IN_QUEUE', created: Date.now(), est, take,
      settings: { engine: o.engine, prompt: o.rawPrompt, negative: o.negative, ratio: o.ratio, duration: o.duration, res: o.res, audio: o.audio, charIds: o.charIds, refVideoId: o.refVideoId },
      fullPrompt: o.prompt, input
    };
    S.jobs.unshift(job); saveJobs(); renderJobs(); poll(job);
    toast(`Ciak ${take} in ripresa: puoi chiudere l'app, riprende da sola`);
  } catch (err) { toast(err.message === 'Failed to fetch' ? 'Connessione a RunPod non riuscita' : err.message, 5000); }
  btn.disabled = false; btn.textContent = GO_LABEL;
};

/* ---------- lavori ---------- */
function saveJobs() { ls('jobs', JSON.stringify(S.jobs.map(({ input, ...j }) => j))); }
const STAT = { IN_QUEUE: 'In coda', IN_PROGRESS: 'Si gira', COMPLETED: 'Salvataggio', FAILED: 'Errore', CANCELLED: 'Annullata', TIMED_OUT: 'Tempo scaduto' };
const BAD = ['FAILED', 'CANCELLED', 'TIMED_OUT'];
function jobsHtml() {
  if (!S.jobs.length) return '<div class="empty-set">Nessuna ripresa in corso.<br>Le clip finite vanno in Galleria.</div>';
  return S.jobs.map(j => {
    const bad = BAD.includes(j.status);
    const mins = Math.max(0, Math.round((Date.now() - j.created) / 60000));
    return `<div class="job ${bad ? 'err' : ''}">
      <div class="t"><b>Ciak ${j.take || ''} · ${MODELS[j.settings.engine].name}</b><span>${STAT[j.status] || j.status} · ${mins} min</span></div>
      <p>${esc(j.settings.prompt)}</p>
      ${bad ? `<p class="e">${esc(j.error || 'Generazione non riuscita')}</p>` : '<div class="prog"><i></i></div>'}
      <div class="actions">${bad ? `<button class="btn small" data-retry="${j.id}">Riprova</button><button class="btn small" data-copy="${j.id}">Copia errore</button><button class="btn small" data-rm="${j.id}">Rimuovi</button>`
        : `<button class="btn small" data-cancel="${j.id}">Annulla</button>`}</div></div>`;
  }).join('');
}
function renderJobs() {
  const html = jobsHtml();
  ['#jobs', '#jobsSheet'].forEach(sel => {
    const box = $(sel); box.innerHTML = html;
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => removeJob(b.dataset.rm));
    box.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
      const j = S.jobs.find(x => x.id === b.dataset.copy);
      try { await navigator.clipboard.writeText(j.error || ''); toast('Errore copiato: incollalo a Claude'); } catch (e) { toast('Copia non riuscita: fai uno screenshot'); }
    });
    box.querySelectorAll('[data-retry]').forEach(b => b.onclick = () => {
      const j = S.jobs.find(x => x.id === b.dataset.retry); loadSettings(j.settings); removeJob(j.id);
      closeM($('#mJobs')); go('crea'); toast('Impostazioni ricaricate: premi Ciak');
    });
    box.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => {
      const j = S.jobs.find(x => x.id === b.dataset.cancel); if (!j || !confirm('Annullare questa ripresa?')) return;
      try { await rp(`/${j.endpoint}/cancel/${j.jobId}`, { method: 'POST' }); } catch (e) { }
      j.status = 'CANCELLED'; j.done = true; saveJobs(); renderJobs();
    });
  });
  const active = S.jobs.filter(j => !BAD.includes(j.status)).length;
  const errs = S.jobs.length - active;
  const parts = [];
  if (active) parts.push(`${active} in ripresa`);
  if (errs) parts.push(`${errs} ${errs === 1 ? 'errore' : 'errori'}`);
  $('#jobsCount').textContent = parts.join(' · ');
  $('#jobsPill').classList.toggle('hidden', !S.jobs.length);
  $('#jobsPill').classList.toggle('bad', !active && !!errs);
  $('#jobsPill').querySelector('.rec').style.display = active ? '' : 'none';
}
function removeJob(id) { S.jobs = S.jobs.filter(j => j.id !== id); saveJobs(); renderJobs(); }

async function poll(job) {
  while (!job.done) {
    await new Promise(r => setTimeout(r, 6000));
    if (job.done || !S.jobs.includes(job)) return;
    try {
      const r = await rp(`/${job.endpoint}/status/${job.jobId}`);
      job.status = r.status || job.status;
      if (r.status === 'COMPLETED') {
        const out = r.output || {};
        const url = typeof out === 'string' ? out : (out.result || out.video_url || out.url || (out.videos && out.videos[0]));
        if (!url) throw Object.assign(new Error('Nessun video nella risposta'), { fatal: true });
        renderJobs();
        await saveClip(job, url, out.cost);
        job.done = true; removeJob(job.id);
        toast(`Ciak ${job.take} pronto in Galleria ✓`); if ($('#view-galleria').classList.contains('active')) renderGallery();
        return;
      }
      if (BAD.includes(r.status)) {
        const raw = r.error || (r.output && r.output.error);
        if (await retryWithRawImages(job, raw)) continue;
        job.done = true; job.error = traduciErrore(raw) + (job.firstError ? '\n— Primo tentativo: ' + job.firstError : ''); saveJobs(); renderJobs(); return;
      }
      saveJobs(); renderJobs();
    } catch (e) {
      if (e.fatal || e.message.includes('Chiave')) { job.done = true; job.status = 'FAILED'; job.error = e.message; saveJobs(); renderJobs(); return; }
    }
  }
}
/* Se RunPod rifiuta la foto come data-URI, la rimanda una volta in base64 puro (senza prefisso) */
const stripPrefix = v => typeof v === 'string' && v.startsWith('data:') ? v.slice(v.indexOf(',') + 1) : v;
async function retryWithRawImages(job, err) {
  const inp = job.input;
  if (!inp || job.rawTried) return false;
  const keys = ['image', 'images', 'reference_images', 'video'].filter(k => {
    const v = inp[k]; return Array.isArray(v) ? v.some(x => String(x).startsWith('data:')) : String(v || '').startsWith('data:');
  });
  if (!keys.length) return false;
  const s = typeof err === 'string' ? err : JSON.stringify(err || '');
  if (!/image|img_|base64|data ?uri/i.test(s)) return false; // solo errori che riguardano la foto
  job.rawTried = true;
  const inp2 = { ...inp };
  keys.forEach(k => { inp2[k] = Array.isArray(inp[k]) ? inp[k].map(stripPrefix) : stripPrefix(inp[k]); });
  try {
    const r = await rp(`/${job.endpoint}/run`, { method: 'POST', body: JSON.stringify({ input: inp2 }) });
    if (!r.id) return false;
    job.jobId = r.id; job.status = 'IN_QUEUE'; job.input = inp2; job.firstError = s.slice(0, 300);
    saveJobs(); renderJobs(); toast(`Ciak ${job.take}: riprovo con la foto in un altro formato`);
    return true;
  } catch (e) { return false; }
}
function traduciErrore(e) {
  const s = typeof e === 'string' ? e : JSON.stringify(e || '');
  if (/image/i.test(s) && /(url|invalid|download|fetch)/i.test(s)) return 'Il modello non ha accettato la foto. (' + s.slice(0, 500) + ')';
  if (/safety|sensitive|nsfw|moderat/i.test(s)) return 'Bloccata dal filtro di sicurezza del modello: riformula la scena.';
  if (/balance|credit|insufficient/i.test(s)) return 'Credito RunPod insufficiente.';
  return s ? s.slice(0, 700) : 'Generazione non riuscita';
}

async function saveClip(job, url, cost) {
  let blob = null;
  try { const r = await fetch(url); if (r.ok) blob = await r.blob(); } catch (e) { }
  const clip = { id: job.id, take: job.take, url, blob, created: Date.now(), cost: typeof cost === 'number' ? cost : job.est, settings: job.settings, fullPrompt: job.fullPrompt, fav: false };
  await dbPut('clips', clip);
  S.clips.unshift(clip);
  if (MODELS[S.engine].needsVideo) fillRefVideos();
  ls('spent', String((parseFloat(ls('spent')) || 0) + clip.cost)); showSpent();
}

/* ---------- galleria ---------- */
const objUrls = new Map();
function clipSrc(c) {
  if (!c.blob) return c.url;
  if (!objUrls.has(c.id)) objUrls.set(c.id, URL.createObjectURL(c.blob));
  return objUrls.get(c.id);
}
const expired = c => !c.blob && Date.now() - c.created > 7 * 864e5;
function renderGallery() {
  const list = S.clips.filter(c => S.filter === 'all' || (S.filter === 'fav' ? c.fav : c.settings.engine === S.filter));
  const box = $('#gallery');
  if (!list.length) box.innerHTML = `<div class="empty">${S.clips.length ? 'Nessuna clip con questo filtro.' : 'Ancora nessun ciak.<br>Vai su "Crea" e gira la prima scena.'}</div>`;
  else box.innerHTML = list.map(c => {
    const s = c.settings;
    const warn = expired(c) ? '<div class="warn">Link scaduto</div>' : (!c.blob ? '<div class="warn">Solo online 7 giorni: scaricala</div>' : '');
    return `<div class="clip ${S.cmp.includes(c.id) ? 'sel' : ''}">
      <video src="${clipSrc(c)}#t=0.1" preload="metadata" muted playsinline data-view="${c.id}"></video>
      <span class="tag">CIAK ${c.take || '–'}</span>
      <div class="ops">
        <button class="ic ${c.fav ? 'on' : ''}" data-fav="${c.id}" title="Preferita">${c.fav ? '★' : '☆'}</button>
        <button class="ic ${S.cmp.includes(c.id) ? 'on' : ''}" data-cmp="${c.id}" title="Confronta">⇆</button>
        <button class="ic" data-del="${c.id}" title="Elimina">✕</button>
      </div>
      <div class="meta"><div>${esc(s.prompt)}</div>${MODELS[s.engine].name} · ${s.duration}s · ${money(c.cost)}${warn}</div>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-view]').forEach(v => v.onclick = () => openViewer(v.dataset.view));
  box.querySelectorAll('[data-fav]').forEach(b => b.onclick = async () => { const c = S.clips.find(x => x.id === b.dataset.fav); c.fav = !c.fav; await dbPut('clips', c); renderGallery(); });
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Eliminare questa clip dal dispositivo?')) return;
    await dbDel('clips', b.dataset.del); S.clips = S.clips.filter(x => x.id !== b.dataset.del); S.cmp = S.cmp.filter(x => x !== b.dataset.del); renderGallery();
  });
  box.querySelectorAll('[data-cmp]').forEach(b => b.onclick = () => {
    const id = b.dataset.cmp;
    if (S.cmp.includes(id)) S.cmp = S.cmp.filter(x => x !== id); else { S.cmp.push(id); if (S.cmp.length > 2) S.cmp.shift(); }
    renderGallery();
  });
  $('#cmpBtn').textContent = `⇆ Confronta (${S.cmp.length}/2)`; $('#cmpBtn').disabled = S.cmp.length !== 2;
}
$$('#galFilter .chip').forEach(b => b.onclick = () => { S.filter = b.dataset.v; $$('#galFilter .chip').forEach(x => x.classList.toggle('active', x === b)); renderGallery(); });
$('#cmpBtn').onclick = () => {
  const cs = S.cmp.map(id => S.clips.find(c => c.id === id)).filter(Boolean); if (cs.length !== 2) return;
  $('#compare').innerHTML = cs.map(c => `<div><video src="${clipSrc(c)}" controls playsinline loop></video><p>Ciak ${c.take || '–'} · ${MODELS[c.settings.engine].name} · ${c.settings.duration}s · ${money(c.cost)}</p></div>`).join('');
  openM('mCompare');
};
$('#playBoth').onclick = () => $$('#compare video').forEach(v => { v.currentTime = 0; v.play(); });

/* visualizzatore */
let viewing = null;
function openViewer(id) {
  const c = S.clips.find(x => x.id === id); if (!c) return; viewing = c;
  const s = c.settings;
  $('#vTitle').textContent = 'Ciak ' + (c.take || '');
  $('#vVideo').src = clipSrc(c);
  $('#vMeta').textContent = `${MODELS[s.engine].name} · ${s.ratio} · ${s.duration}s${MODELS[s.engine].res.length ? ' · ' + s.res : ''} · ${money(c.cost)} · ${new Date(c.created).toLocaleString('it-IT')}`;
  $('#vPrompt').textContent = c.fullPrompt || s.prompt;
  $('#vDl').href = clipSrc(c); $('#vDl').download = 'ciak-' + (c.take || c.id) + '.mp4';
  openM('viewer'); $('#vVideo').play().catch(() => { });
}
$('#vClose').onclick = () => closeM($('#viewer'));
$('#vReuse').onclick = () => { loadSettings(viewing.settings); closeM($('#viewer')); go('crea'); toast('Impostazioni ricaricate'); };

function loadSettings(s) {
  setEngine(s.engine, { ratio: s.ratio, duration: s.duration, res: s.res, refVideoId: s.refVideoId });
  $('#prompt').value = s.prompt; if (s.negative) $('#negative').value = s.negative;
  $('#audio').checked = s.audio !== false;
  S.selChars = new Set((s.charIds || []).filter(id => S.chars.some(c => c.id === id)));
  renderRefChars(); updateCost();
}

/* ---------- personaggi ---------- */
let charImg = null;
$('#charFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { charImg = await fileToJpeg(f, 1024); $('#charPreview').innerHTML = `<img src="${charImg}" alt="">`; } catch (err) { toast(err.message); }
};
$('#charSave').onclick = async () => {
  const name = $('#charName').value.trim();
  if (!charImg) return toast('Scegli una foto del personaggio');
  if (!name) return toast('Dai un nome al personaggio');
  const c = { id: uid(), name, desc: $('#charDesc').value.trim(), img: charImg, created: Date.now() };
  await dbPut('chars', c); S.chars.push(c);
  $('#charName').value = ''; $('#charDesc').value = ''; charImg = null; $('#charPreview').innerHTML = '<span>+ Foto</span>';
  closeM($('#mChar')); renderChars(); renderRefChars(); toast(`${c.name} è nel cast ✓`);
};
function renderChars() {
  const box = $('#chars');
  box.innerHTML = S.chars.length ? S.chars.map(c => `<div class="ch"><img src="${c.img}" alt=""><button class="ic" data-dc="${c.id}" title="Elimina">✕</button><div class="info"><b>${esc(c.name)}</b><small>${esc(c.desc || '')}</small></div></div>`).join('')
    : '<div class="empty">Il cast è vuoto.<br>Tocca "+ Nuovo" per aggiungere un personaggio.</div>';
  box.querySelectorAll('[data-dc]').forEach(b => b.onclick = async () => {
    if (!confirm('Eliminare questo personaggio?')) return;
    await dbDel('chars', b.dataset.dc); S.chars = S.chars.filter(c => c.id !== b.dataset.dc); S.selChars.delete(b.dataset.dc); renderChars(); renderRefChars();
  });
}

/* ---------- impostazioni ---------- */
function status(msg, ok) { const s = $('#setStatus'); s.textContent = msg; s.className = 'status ' + (ok === true ? 'ok' : ok === false ? 'ko' : ''); }
function keySummary() {
  const e = $('#sumKey'); e.textContent = key() ? 'collegato ✓' : 'da collegare'; e.className = key() ? 'ok' : '';
  $('#noKey').classList.toggle('hidden', !!key());
}
function openSettings() {
  $('#setKey').value = key(); status('');
  $('#secKey').open = !key();
  keySummary(); if (window.montSummary) montSummary(); $('#mSettings').classList.remove('hidden');
}
$('#showKey').onclick = () => { const i = $('#setKey'); i.type = i.type === 'password' ? 'text' : 'password'; $('#showKey').textContent = i.type === 'password' ? 'Mostra' : 'Nascondi'; };
async function storeKey() { S.apiKey = $('#setKey').value.trim(); await encryptKey(S.apiKey); keySummary(); }
$('#saveSet').onclick = async () => { await storeKey(); status(key() ? 'Salvata e cifrata ✓' : 'Chiave rimossa', true); };
$('#lockNow').onclick = lockApp;
$('#chgPw').onclick = async () => {
  const s = $('#pwStatus'), a = $('#pwOld').value, b = $('#pwNew').value;
  if (b.length < 6) { s.textContent = 'La nuova password deve avere almeno 6 caratteri'; s.className = 'status ko'; return; }
  const keep = S.apiKey;
  if (!(await checkPassword(a))) { s.textContent = 'Password attuale errata'; s.className = 'status ko'; return; }
  S.apiKey = keep; await setPassword(b);
  $('#pwOld').value = ''; $('#pwNew').value = ''; s.textContent = 'Password cambiata ✓'; s.className = 'status ok';
};
$('#testKey').onclick = async () => {
  await storeKey();
  if (!key()) return status('Inserisci la chiave', false);
  status('Controllo…');
  try {
    const r = await fetch(API + '/wan-2-6-t2v/health', { headers: { Authorization: 'Bearer ' + key() } });
    if (r.status === 401 || r.status === 403) status('Chiave RunPod non valida', false);
    else status('Chiave accettata ✓ — collegamento riuscito', true);
  } catch (e) { status('Nessuna risposta da RunPod: controlla la connessione', false); }
};
function showSpent() { const v = money(parseFloat(ls('spent')) || 0); $('#spent').textContent = v; $('#sumSpent').textContent = v; }
$('#resetSpent').onclick = () => { if (confirm('Azzerare il contatore della spesa?')) { ls('spent', '0'); showSpent(); } };

/* ---------- avvio ---------- */
(async function init() {
  if (!window.crypto || !crypto.subtle) { document.body.innerHTML = '<p style="padding:24px">Apri l\'app dall\'indirizzo https:// di GitHub Pages.</p>'; return; }
  await showLock();
  let idle; const arm = () => { clearTimeout(idle); idle = setTimeout(lockApp, 30 * 60000); };
  ['click', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, arm, { passive: true })); arm();
  showSpent(); showTake(); keySummary();
  try {
    S.chars = (await dbAll('chars')).sort((a, b) => a.created - b.created);
    S.clips = (await dbAll('clips')).sort((a, b) => b.created - a.created);
  } catch (e) { toast('Archivio del dispositivo non disponibile'); }
  setEngine('wan'); renderRefChars(); renderChars(); renderJobs();
  S.jobs.filter(j => !j.done && !BAD.includes(j.status)).forEach(poll);
  $('#prompt').oninput = updateCost;
  if (!key()) openSettings(); // primo avvio: subito al collegamento
})();
