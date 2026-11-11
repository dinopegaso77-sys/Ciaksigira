/* Ciak si gira — generatore di clip video via RunPod Public Endpoints */
'use strict';
const APP_VERSION = '2.3.2'; // deve coincidere con ?v= in index.html

const API = 'https://api.runpod.ai/v2';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + ' $';

/* i modelli sono in models.js */

/* ---------- stato ---------- */
const S = {
  engine: 'wan', startImg: null, audioIn: null, audioName: '', selChars: new Set(), chars: [], clips: [],
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
    const ep = (path.split('/')[1] || '').slice(0, 40);
    if (r.status === 401) throw new Error('Chiave RunPod non valida');
    if (r.status === 403) throw new Error(`RunPod ha rifiutato l'accesso a "${ep}" (403)${j.error ? ': ' + j.error : ''}. Se la chiave ha permessi limitati, dalle accesso in lettura e scrittura a tutti gli endpoint`);
    if (r.status === 404) throw new Error(`Servizio "${ep}" non trovato su RunPod (404)`);
    throw new Error(j.error || j.message || ('Errore RunPod ' + r.status));
  }
  return j;
}

/* ---------- navigazione e finestre ---------- */
function go(view) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  if (view === 'galleria') renderGallery();
  if (view === 'regista' && window.renderRegia) renderRegia();
  if (view === 'montaggio' && window.renderMontage) renderMontage();
  window.scrollTo(0, 0);
}
$$('.tab').forEach(t => t.onclick = () => go(t.dataset.view));

let MZ = 80; // l'ultima finestra aperta resta sempre sopra le altre
function openM(id) { if (id === 'mSettings') return openSettings(); const m = $('#' + id); m.style.zIndex = ++MZ; m.classList.remove('hidden'); }
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
  if (!MODELS[e]) e = 'wan';
  S.engine = e; ls('engine', e); const m = MODELS[e];
  $('#modelBtn').innerHTML = `<span class="mb-name">${m.name}</span><span class="mb-price">${m.priceLabel}</span>
    <span class="mb-desc">${m.desc}</span><span class="mb-badges">${modelBadges(m).map(b => `<i>${b}</i>`).join('')}</span><span class="mb-change">Cambia ▸</span>`;
  $('#ratioWrap').classList.toggle('hidden', !m.ratios);
  if (m.ratios) fillSelect($('#ratio'), m.ratios, v => v, keepVals?.ratio);
  $('#durWrap').classList.toggle('hidden', !m.durations.length);
  if (m.durations.length) fillSelect($('#duration'), m.durations, v => v + ' sec', keepVals?.duration ?? (m.durations.includes(5) ? 5 : m.durations[0]));
  $('#resWrap').classList.toggle('hidden', !m.res.length);
  if (m.res.length) fillSelect($('#res'), m.res, v => v === '4k' ? '4K' : v, keepVals?.res ?? m.defRes);
  const shown = [m.ratios, m.durations.length, m.res.length].filter(Boolean).length;
  $('#optRow').classList.toggle('hidden', !shown);
  $('#audioWrap').classList.toggle('hidden', m.audioOut !== 'toggle');
  $('#negWrap').classList.toggle('hidden', !m.neg);
  $('#refHint').textContent = m.hint;
  $('#refVidWrap').classList.toggle('hidden', !m.needs.video);
  $('#klAudioWrap').classList.toggle('hidden', e !== 'kling');
  if (m.needs.video) fillRefVideos(keepVals?.refVideoId);
  $('#audioInWrap').classList.toggle('hidden', !m.needs.audio);
  renderExtras(m, keepVals?.ex);
  updateCost();
}
function renderExtras(m, keep = {}) {
  const box = $('#extras');
  box.innerHTML = (m.extras || []).map(x => {
    const v = keep && x.id in keep ? keep[x.id] : x.def;
    if (x.type === 'check') return `<label class="check"><input type="checkbox" data-ex="${x.id}" ${v ? 'checked' : ''}> ${x.label}</label>`;
    return `<label>${x.label}<select data-ex="${x.id}">${x.options.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  }).join('');
  box.classList.toggle('hidden', !(m.extras || []).length);
  box.querySelectorAll('[data-ex]').forEach(el => el.onchange = updateCost);
}
function readExtras() {
  const ex = {};
  $$('#extras [data-ex]').forEach(el => { ex[el.dataset.ex] = el.type === 'checkbox' ? el.checked : el.value; });
  return ex;
}

/* finestra di scelta del modello */
function renderModelPicker() {
  $('#modelList').innerHTML = GROUPS.map(g => {
    const ms = Object.entries(MODELS).filter(([, m]) => m.group === g);
    return `<h3 class="mgroup">${g}</h3><div class="mcards">${ms.map(([k, m]) => `
      <button class="mcard ${k === S.engine ? 'on' : ''}" data-model="${k}">
        <span class="mc-top"><b>${m.name}</b>${m.tag ? `<em>${m.tag}</em>` : ''}</span>
        <span class="mc-price">${m.priceLabel}</span>
        <span class="mc-desc">${m.desc}</span>
        <span class="mb-badges">${modelBadges(m).map(b => `<i>${b}</i>`).join('')}</span>
      </button>`).join('')}</div>`;
  }).join('');
  $$('#modelList [data-model]').forEach(b => b.onclick = () => { setEngine(b.dataset.model); closeM($('#mModels')); });
}
$('#modelBtn').onclick = () => { renderModelPicker(); openM('mModels'); };

/* file audio (InfiniteTalk) */
$('#audioInFile').onchange = e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.size > 6 * 1024 * 1024) return toast('Audio troppo pesante (max 6 MB): usa un MP3 più corto');
  const r = new FileReader();
  r.onload = () => {
    S.audioIn = r.result; S.audioName = f.name; S.audioDur = 0; showAudioIn();
    const au = new Audio(r.result); au.onloadedmetadata = () => { S.audioDur = Math.round(au.duration) || 0; };
  };
  r.readAsDataURL(f);
};
$('#audioInClear').onclick = () => { S.audioIn = null; S.audioName = ''; showAudioIn(); };
function showAudioIn() {
  $('#audioInName').textContent = S.audioIn ? '♪ ' + S.audioName : 'Nessun audio';
  $('#audioInClear').classList.toggle('hidden', !S.audioIn);
}
function fillRefVideos(keep) {
  const sel = $('#refVideo'), old = keep ?? sel.value;
  const libVids = (typeof LIB !== 'undefined' && r2On()) ? LIB.items.filter(i => i.kind === 'video') : [];
  sel.innerHTML = (S.clips.length || libVids.length)
    ? '<option value="">— scegli un video —</option>'
      + (S.clips.length ? '<optgroup label="Ciak generati">' + S.clips.map(c => `<option value="${c.id}">Ciak ${c.take || '–'} · ${esc(c.settings.prompt).slice(0, 40)}</option>`).join('') + '</optgroup>' : '')
      + (libVids.length ? '<optgroup label="I miei video">' + libVids.map(i => `<option value="lib:${esc(i.key)}">${esc(i.name).slice(0, 48)}</option>`).join('') + '</optgroup>' : '')
    : '<option value="">Prima gira un ciak o carica un tuo video</option>';
  if (old && [...sel.options].some(op => op.value === old)) sel.value = old;
}
async function videoSource(c) {
  if (c.url && Date.now() - c.created < 6.5 * 864e5) return c.url;
  if (c.r2key && r2On()) return await libUrl(c.r2key);
  if (c.blob && c.blob.size < 7 * 1024 * 1024) return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(c.blob); });
  throw new Error(`Il ciak ${c.take || ''} è troppo vecchio o pesante: scegline uno più recente`);
}
['#ratio', '#duration', '#res', '#refVideo', '#audio'].forEach(s => $(s).addEventListener('change', updateCost));

function currentOpts() {
  const m = MODELS[S.engine];
  const chars = S.chars.filter(c => S.selChars.has(c.id));
  let prompt = $('#prompt').value.trim();
  if (chars.length) prompt += '\n' + chars.map(c => `${c.name}: ${c.desc}`.trim()).join('. ');
  const refVideoId = m.needs.video ? $('#refVideo').value : '';
  const refClip = refVideoId && (S.clips.find(c => c.id === refVideoId) || (window.libClip && libClip(refVideoId)));
  return {
    engine: S.engine, prompt, rawPrompt: $('#prompt').value.trim(),
    negative: m.neg ? $('#negative').value.trim() : '',
    ratio: m.ratios ? $('#ratio').value : '16:9',
    duration: m.durations.length ? +$('#duration').value : 0,
    res: m.res.length ? $('#res').value : (m.defRes || '720p'),
    audio: $('#audio').checked, ex: readExtras(),
    startImg: S.startImg, charImgs: chars.map(c => c.img), charIds: chars.map(c => c.id),
    img: S.startImg || (chars[0] && chars[0].img) || null,   // per i modelli che vogliono per forza una foto
    audioIn: S.audioIn,
    refVideoId, refDuration: refClip ? refClip.settings.duration : 0,
    klAudio: S.engine === 'kling' && $('#klAudio').checked
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
  if (m.needs.image === 'req' && !o.img) { toast(`${m.name} vuole una foto: caricala o scegli un personaggio`); return; }
  if (m.needs.chars && !o.startImg && !o.charImgs.length) { toast(`${m.name} vuole almeno un personaggio o una foto`); return; }
  if (m.needs.audio && !o.audioIn) { toast(`${m.name} vuole un file audio`); return; }
  if (m.needs.video) {
    const rc = S.clips.find(c => c.id === o.refVideoId) || libClip(o.refVideoId);
    if (!rc) { toast('Scegli il ciak di riferimento'); $('#refVideo').focus(); return; }
    try { o.refVideo = rc.lib ? await libUrl(rc.key) : await videoSource(rc); } catch (e) { toast(e.message, 5000); return; }
  }
  if (r2On()) {
    $('#goBtn').textContent = 'Preparo i file…';
    try { await prepareModelInputs(o); } catch (e) { toast('Archivio non raggiungibile, uso le foto dal telefono'); }
    $('#goBtn').textContent = GO_LABEL;
  }
  const est = m.price(o);
  if (est >= 3 && !confirm(`Questa clip costa circa ${money(est)}. Procedo?`)) return;
  const btn = $('#goBtn'); btn.disabled = true; btn.textContent = 'Invio al set…';
  try {
    const job = await launchClip(o);
    toast(`Ciak ${job.take} in ripresa: puoi chiudere l'app, riprende da sola`);
  } catch (err) { toast(err.message === 'Failed to fetch' ? 'Connessione a RunPod non riuscita' : err.message, 5000); }
  btn.disabled = false; btn.textContent = GO_LABEL;
};
/* invia un ciak a RunPod e lo segue fino alla Galleria (usato da Crea e dal Regista) */
async function launchClip(o, extra) {
  const m = MODELS[o.engine];
  const est = m.price(o);
  const endpoint = m.endpoint(o);
  const input = m.input(o);
  const r = await rp(`/${endpoint}/run`, { method: 'POST', body: JSON.stringify({ input }) });
  if (!r.id) throw new Error('Risposta inattesa da RunPod');
  const take = nextTake(); ls('take', String(take)); showTake();
  const job = {
    id: uid(), jobId: r.id, endpoint, status: r.status || 'IN_QUEUE', created: Date.now(), est, take,
    settings: { engine: o.engine, prompt: o.rawPrompt, negative: o.negative, ratio: o.ratio, duration: o.duration || o.refDuration || (m.needs.audio ? S.audioDur : 0) || 5, res: o.res, audio: o.audio, charIds: o.charIds, refVideoId: o.refVideoId, klAudio: o.klAudio, ex: o.ex, ...(extra || {}) },
    fullPrompt: o.prompt, input
  };
  S.jobs.unshift(job); saveJobs(); renderJobs(); poll(job);
  return job;
}

/* ---------- lavori ---------- */
function saveJobs() { ls('jobs', JSON.stringify(S.jobs.map(({ input, ...j }) => j))); }
const STAT = { IN_QUEUE: 'In coda', IN_PROGRESS: 'Si gira', COMPLETED: 'Salvataggio', MUX: 'Aggiungo l\'audio', FAILED: 'Errore', CANCELLED: 'Annullata', TIMED_OUT: 'Tempo scaduto' };
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
        let muxed = null;
        if (job.settings.klAudio && job.settings.refVideoId) { job.status = 'MUX'; renderJobs(); muxed = await addRefAudio(url, job.settings.refVideoId); }
        renderJobs();
        await saveClip(job, url, out.cost, muxed);
        job.done = true; removeJob(job.id);
        toast(`Ciak ${job.take} pronto in Galleria ✓`); if ($('#view-galleria').classList.contains('active')) renderGallery();
        return;
      }
      if (BAD.includes(r.status)) {
        const raw = r.error || (r.output && r.output.error);
        if (await retryWithRawImages(job, raw)) continue;
        job.done = true; job.error = traduciErrore(raw) + (job.firstError ? '\n— Primo tentativo: ' + job.firstError : ''); saveJobs(); renderJobs(); if (window.regiaRefresh) regiaRefresh(); return;
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
  const keys = ['image', 'images', 'reference_images', 'video', 'audio'].filter(k => {
    const v = inp[k]; return Array.isArray(v) ? v.some(x => String(x).startsWith('data:')) : String(v || '').startsWith('data:');
  });
  if (!keys.length) return false;
  const s = typeof err === 'string' ? err : JSON.stringify(err || '');
  if (!/image|img_|audio|base64|data ?uri/i.test(s)) return false; // solo errori che riguardano la foto
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

/* Kling è muto: il worker RunPod ci mette l'audio del ciak di riferimento */
async function workerCall(input, maxWait = 120) {
  const id = (typeof montId === 'function') ? montId() : '';
  if (!id) throw new Error('worker non collegato');
  const r = await rp(`/${id}/runsync`, { method: 'POST', body: JSON.stringify({ input }) });
  let out = r.status === 'COMPLETED' ? r.output : null;
  for (let n = 0; !out && r.id && n < maxWait / 3; n++) {
    await new Promise(res => setTimeout(res, 3000));
    const s = await rp(`/${id}/status/${r.id}`);
    if (s.status === 'COMPLETED') out = s.output;
    else if (BAD.includes(s.status)) throw new Error(s.error || s.status);
  }
  if (!out) throw new Error('il worker non ha risposto in tempo');
  if (out.error) throw new Error(out.error);
  return out;
}
const asSource = v => v.startsWith('data:') ? { b64: v } : { url: v };
async function addRefAudio(url, refId) {
  const ref = S.clips.find(c => c.id === refId);
  if (!ref) return null;
  try {
    const out = await workerCall({ action: 'mux', video: { url }, audio: asSource(await videoSource(ref)) });
    if (!out.video_b64) return null;
    return { blob: await (await fetch('data:video/mp4;base64,' + out.video_b64)).blob(), audioFrom: refId };
  } catch (e) {
    toast(e.message === 'worker non collegato'
      ? 'Clip salvata muta: per l\'audio collega il worker di montaggio in ⚙︎'
      : 'Clip salvata muta: audio non aggiunto (' + e.message.slice(0, 80) + ')', 6000);
    return null;
  }
}

async function saveClip(job, url, cost, muxed) {
  let blob = muxed ? muxed.blob : null;
  if (!blob) try { const r = await fetch(url); if (r.ok) blob = await r.blob(); } catch (e) { }
  const clip = { id: job.id, take: job.take, url, blob, created: Date.now(), cost: typeof cost === 'number' ? cost : job.est, settings: job.settings, fullPrompt: job.fullPrompt, fav: false, audioFrom: muxed ? muxed.audioFrom : null };
  await dbPut('clips', clip);
  S.clips.unshift(clip);
  backupClip(clip, muxed ? muxed.blob : null); // copia nell'archivio R2, se attivo
  if (MODELS[S.engine].needs.video) fillRefVideos();
  ls('spent', String((parseFloat(ls('spent')) || 0) + clip.cost)); showSpent();
  if (window.regiaRefresh) regiaRefresh();
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
  renderGalFilter();
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
function renderGalFilter() {
  const used = [...new Set(S.clips.map(c => c.settings.engine))].filter(k => MODELS[k]);
  if (S.filter !== 'all' && S.filter !== 'fav' && !used.includes(S.filter)) S.filter = 'all';
  const chips = [['all', 'Tutte'], ['fav', '★ Preferite'], ...used.map(k => [k, MODELS[k].name])];
  $('#galFilter').innerHTML = chips.map(([v, l]) => `<button class="chip ${S.filter === v ? 'active' : ''}" data-v="${v}">${l}</button>`).join('');
  $$('#galFilter .chip').forEach(b => b.onclick = () => { S.filter = b.dataset.v; renderGallery(); });
}
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
  setEngine(s.engine, { ratio: s.ratio, duration: s.duration, res: s.res, refVideoId: s.refVideoId, ex: s.ex });
  $('#prompt').value = s.prompt; if (s.negative) $('#negative').value = s.negative;
  $('#audio').checked = s.audio !== false;
  S.selChars = new Set((s.charIds || []).filter(id => S.chars.some(c => c.id === id)));
  renderRefChars(); updateCost();
}

/* ---------- personaggi ---------- */
let charImg = null, charExtra = [];
$('#charFile').onchange = async e => {
  const fs = [...e.target.files]; e.target.value = ''; if (!fs.length) return;
  try {
    const imgs = []; for (const f of fs.slice(0, 8)) imgs.push(await fileToJpeg(f, 1280));
    charImg = imgs[0]; charExtra = imgs.slice(1);
    $('#charPreview').innerHTML = `<img src="${charImg}" alt="">${charExtra.length ? `<i class="more">+${charExtra.length}</i>` : ''}`;
  } catch (err) { toast(err.message); }
};
$('#charSave').onclick = async () => {
  const name = $('#charName').value.trim();
  if (!charImg) return toast('Scegli una foto del personaggio');
  if (!name) return toast('Dai un nome al personaggio');
  const kinds = ['volto', 'profilo', 'figura', 'altro'];
  const c = { id: uid(), name, desc: $('#charDesc').value.trim(), img: charImg, created: Date.now(),
    photos: [charImg, ...charExtra].map((img, k) => ({ id: uid(), img, kind: kinds[Math.min(k, 3)] })) };
  await dbPut('chars', c); S.chars.push(c);
  $('#charName').value = ''; $('#charDesc').value = ''; charImg = null; charExtra = []; $('#charPreview').innerHTML = '<span>+ Foto</span>';
  closeM($('#mChar')); renderChars(); renderRefChars(); toast(`${c.name} è nel cast ✓`);
};
function renderChars() {
  const box = $('#chars');
  box.innerHTML = S.chars.length ? S.chars.map(c => `<button class="ch" data-cs="${c.id}"><img src="${c.img}" alt=""><span class="ch-b">${(c.photos || []).length > 1 ? `<i>📷 ${c.photos.length}</i>` : ''}${c.voiceId ? `<i>${c.voiceId.startsWith('clone:') ? '🎙' : '🗣'}</i>` : ''}</span><div class="info"><b>${esc(c.name)}</b><small>${esc(c.desc || '')}</small></div></button>`).join('')
    : '<div class="empty">Il cast è vuoto.<br>Tocca "+ Nuovo" per aggiungere un personaggio.</div>';
  box.querySelectorAll('[data-cs]').forEach(b => b.onclick = () => window.openCharSheet && openCharSheet(b.dataset.cs));
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
  keySummary(); if (window.montSummary) montSummary(); if (window.r2Summary) r2Summary(); $('#mSettings').style.zIndex = ++MZ; $('#mSettings').classList.remove('hidden');
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
  setEngine(ls('engine') || 'wan'); showAudioIn(); renderRefChars(); renderChars(); renderJobs();
  S.jobs.filter(j => !j.done && !BAD.includes(j.status)).forEach(poll);
  $('#prompt').oninput = updateCost;
  if (!key()) openSettings(); // primo avvio: subito al collegamento
  else if (typeof r2On === 'function' && r2On() && montId()) libRefresh(true); // elenco dei miei file in sottofondo
})();
