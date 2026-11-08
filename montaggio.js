/* Regista AI — Montaggio. L'elaborazione (unione, titoli, transizioni, musica,
   estrazione fotogrammi) la fa il worker RunPod "regista-montaggio" con ffmpeg.
   L'app manda solo la richiesta e salva il risultato. */
'use strict';

const TITLE_SEC = 3, END_SEC = 2.5, DISSOLVE = 0.6;
const MAX_PAYLOAD = 9 * 1024 * 1024; // RunPod accetta richieste fino a 10 MB
const MT = { proj: null, pick: [], music: null, inited: false, job: null, prev: null };

const montId = () => (ls('montEndpoint') || '').trim();
function mtDefault() { return { title: '', items: [], trans: 'dissolve', end: true, keep: true, vol: 60 }; }
function mtLoad() { try { MT.proj = Object.assign(mtDefault(), JSON.parse(ls('film') || '{}')); } catch (e) { MT.proj = mtDefault(); } }
function mtSave() { ls('film', JSON.stringify(MT.proj)); }
const mtClips = () => MT.proj.items.map(id => S.clips.find(c => c.id === id) || (window.libClip && libClip(id))).filter(Boolean);
const thumbOf = c => c.kind === 'image' ? `<img src="${clipSrc(c)}" alt="">` : `<video src="${clipSrc(c)}#t=0.1" preload="metadata" muted playsinline></video>`;
const labelOf = c => c.lib ? (c.kind === 'image' ? 'Foto' : 'Mio video') : `Ciak ${c.take || '–'}`;
const fmtTime = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const urlValid = c => c.url && Date.now() - c.created < 6.5 * 864e5; // i link RunPod durano 7 giorni

function mtPlanDuration() {
  const cs = mtClips(); if (!cs.length) return 0;
  const parts = [...(MT.proj.title ? [TITLE_SEC] : []), ...cs.map(c => c.settings.duration), ...(MT.proj.end ? [END_SEC] : [])];
  return parts.reduce((a, b) => a + b, 0) - (MT.proj.trans === 'dissolve' ? DISSOLVE * (parts.length - 1) : 0);
}
function mtSize() {
  const r = (mtClips()[0] || { settings: { ratio: '16:9' } }).settings.ratio;
  return ({ '16:9': [1920, 1080], '9:16': [1080, 1920], '21:9': [1920, 822], '1:1': [1080, 1080], '4:3': [1440, 1080], '3:4': [1080, 1440] })[r] || [1920, 1080];
}

/* ---------- interfaccia ---------- */
async function renderMontage() {
  if (!MT.proj) mtLoad();
  if (!MT.inited) {
    MT.inited = true;
    try { const a = await dbAll('audio'); MT.music = a.find(x => x.id === 'music') || null; } catch (e) { }
    const saved = ls('mtJob'); if (saved && !MT.job) { try { MT.job = JSON.parse(saved); pollMontage(); } catch (e) { } }
  }
  const p = MT.proj;
  if (p.items.some(id => String(id).startsWith('lib:')) && r2On() && !LIB.loaded && !LIB.loading) libRefresh(true).then(renderMontage);
  $('#mtTitle').value = p.title; $('#mtEnd').checked = p.end; $('#mtKeep').checked = p.keep; $('#mtVol').value = p.vol;
  $('#mtTitleShow').textContent = p.title || 'Senza titolo';
  $$('#mtTrans button').forEach(b => b.classList.toggle('active', b.dataset.v === p.trans));
  $('#mtMusicName').textContent = MT.music ? '♪ ' + MT.music.name : 'Nessuna musica';
  $('#mtMusicDel').classList.toggle('hidden', !MT.music);
  $('#mtDur').textContent = fmtTime(mtPlanDuration());

  const [W, H] = mtSize();
  $('.screen').style.aspectRatio = W + '/' + H;
  const cs = mtClips();
  $('#mtEmpty').classList.toggle('hidden', !!cs.length);
  if (!MT.prev) $('#mtVideo').classList.toggle('hidden', !cs.length);
  $('#mtPlay').disabled = !cs.length;
  $('#mtExport').disabled = !cs.length || !!MT.job;
  $('#mtExport').textContent = MT.job ? 'Montaggio in corso…' : '🎞 Monta su RunPod';
  $('#mtProgWrap').classList.toggle('hidden', !MT.job);

  const list = $('#mtList');
  list.innerHTML = cs.length ? cs.map((c, i) => `<li>
      ${thumbOf(c)}
      <div class="tx"><b>${labelOf(c)} · ${c.settings.duration}s</b><span>${esc(c.settings.prompt)}</span></div>
      <div class="mv">
        <button class="ic" data-up="${i}" ${i === 0 ? 'disabled' : ''} title="Su">↑</button>
        <button class="ic" data-dn="${i}" ${i === cs.length - 1 ? 'disabled' : ''} title="Giù">↓</button>
        <button class="ic" data-rmi="${i}" title="Togli">✕</button>
      </div></li>`).join('')
    : '<div class="tl-empty">La timeline è vuota.<br>Tocca "+ Ciak" per aggiungere le clip.</div>';
  const ids = cs.map(c => c.id);
  const set = arr => { p.items = arr; mtSave(); stopPreview(); renderMontage(); };
  list.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up; const a = [...ids];[a[i - 1], a[i]] = [a[i], a[i - 1]]; set(a); });
  list.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => { const i = +b.dataset.dn; const a = [...ids];[a[i + 1], a[i]] = [a[i], a[i + 1]]; set(a); });
  list.querySelectorAll('[data-rmi]').forEach(b => b.onclick = () => { const a = [...ids]; a.splice(+b.dataset.rmi, 1); set(a); });
  renderFilms();
}

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
        <button class="btn small" data-df="${f.id}">Elimina</button></div></div></div>`;
  }).join('') : '<div class="empty">Ancora nessun film.<br>Monta la timeline e premi "Monta su RunPod".</div>';
  box.querySelectorAll('[data-df]').forEach(b => b.onclick = async () => {
    if (!confirm('Eliminare questo film?')) return; await dbDel('films', b.dataset.df); renderFilms();
  });
}

$('#mtTitle').oninput = e => { MT.proj.title = e.target.value; mtSave(); $('#mtTitleShow').textContent = MT.proj.title || 'Senza titolo'; $('#mtDur').textContent = fmtTime(mtPlanDuration()); };
$('#mtEnd').onchange = e => { MT.proj.end = e.target.checked; mtSave(); renderMontage(); };
$('#mtKeep').onchange = e => { MT.proj.keep = e.target.checked; mtSave(); };
$('#mtVol').oninput = e => { MT.proj.vol = +e.target.value; mtSave(); };
$$('#mtTrans button').forEach(b => b.onclick = () => { MT.proj.trans = b.dataset.v; mtSave(); renderMontage(); });
$('#mtNew').onclick = () => {
  if (MT.proj.items.length && !confirm('Iniziare un nuovo film? La timeline verrà svuotata (i film già montati restano).')) return;
  MT.proj = mtDefault(); mtSave(); stopPreview(); renderMontage();
};
$('#mtMusic').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.size > 6 * 1024 * 1024) return toast('Musica troppo pesante (max 6 MB): usa un MP3 più corto');
  MT.music = { id: 'music', name: f.name, blob: f }; await dbPut('audio', MT.music); renderMontage();
};
$('#mtMusicDel').onclick = async () => { await dbDel('audio', 'music'); MT.music = null; renderMontage(); };

/* scelta ciak */
$('#mtAdd').onclick = () => {
  MT.pick = [];
  const box = $('#pickGrid');
  const libs = r2On() ? LIB.items.filter(i => i.kind === 'video' || i.kind === 'image').map(i => libClip('lib:' + i.key)) : [];
  const card = c => `<div class="clip" data-pk="${esc(c.id)}">${thumbOf(c)}
      <span class="tag">${labelOf(c).toUpperCase()}</span>
      <div class="meta"><div>${esc(c.settings.prompt)}</div>${MODELS[c.settings.engine].name} · ${c.settings.duration}s</div></div>`;
  box.innerHTML = (S.clips.length || libs.length)
    ? (S.clips.length ? '<h3 class="mgroup">Ciak generati</h3><div class="gallery pick">' + S.clips.map(card).join('') + '</div>' : '')
      + (libs.length ? '<h3 class="mgroup">I miei file</h3><div class="gallery pick">' + libs.map(card).join('') + '</div>' : '')
    : '<div class="empty">Nessuna clip: gira un ciak o carica i tuoi file in Galleria → I miei file.</div>';
  box.querySelectorAll('[data-pk]').forEach(el => el.onclick = () => {
    const id = el.dataset.pk, i = MT.pick.indexOf(id);
    i >= 0 ? MT.pick.splice(i, 1) : MT.pick.push(id);
    el.classList.toggle('sel', i < 0);
    $('#pickOk').textContent = MT.pick.length ? `Aggiungi ${MT.pick.length} alla timeline` : 'Aggiungi alla timeline';
  });
  $('#pickOk').textContent = 'Aggiungi alla timeline';
  openM('mPick');
};
$('#pickOk').onclick = () => {
  if (!MT.pick.length) return toast('Tocca le clip da aggiungere');
  MT.proj.items.push(...MT.pick); mtSave(); closeM($('#mPick')); renderMontage();
};

/* ---------- anteprima: riproduce i ciak in fila (nessuna elaborazione) ---------- */
$('#mtPlay').onclick = () => {
  const v = $('#mtVideo');
  if (MT.prev) { stopPreview(); return; }
  const cs = mtClips(); if (!cs.length) return;
  MT.prev = { i: 0, cs };
  $('#mtPlay').textContent = '■ Ferma';
  const next = () => {
    if (!MT.prev) return;
    if (MT.prev.i >= MT.prev.cs.length) return stopPreview();
    const c = MT.prev.cs[MT.prev.i++];
    $('#mtStatus').textContent = `Anteprima: ${labelOf(c).toLowerCase()} (${MT.prev.i}/${MT.prev.cs.length}) — titoli, transizioni e musica compaiono nel film montato`;
    if (c.kind === 'image') { v.removeAttribute('src'); v.poster = clipSrc(c); v.load(); MT.prev.t = setTimeout(next, c.settings.duration * 1000); return; }
    v.poster = ''; v.src = clipSrc(c); v.muted = !MT.proj.keep; v.play().catch(() => { });
  };
  v.onended = next; v.classList.remove('hidden'); next();
};
function stopPreview() {
  if (!MT.prev) return;
  clearTimeout(MT.prev.t); MT.prev = null; const v = $('#mtVideo'); v.pause(); v.onended = null; v.poster = '';
  $('#mtPlay').textContent = '▶ Anteprima'; if (!MT.job) $('#mtStatus').textContent = '';
}

/* ---------- invio a RunPod ---------- */
const b64Of = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
async function clipSource(c, budget) {
  if (c.lib) return c.kind === 'image' ? { key: c.key, image: true, duration: c.settings.duration } : { key: c.key };
  if (urlValid(c)) {
    const src = { url: c.url };
    // clip Kling con audio preso dal ciak di riferimento: il worker lo rimette al montaggio
    const ref = c.audioFrom && S.clips.find(x => x.id === c.audioFrom);
    if (ref && urlValid(ref)) src.audio = { url: ref.url };
    return src;
  }
  if (c.r2key && r2On()) return { key: c.r2key }; // copia nell'archivio: nessun limite di peso
  if (c.blob && c.blob.size * 1.37 < budget.left) { budget.left -= c.blob.size * 1.37; return { b64: await b64Of(c.blob) }; }
  throw new Error(`Il ciak ${c.take || ''} è più vecchio di 7 giorni ed è troppo pesante da rimandare a RunPod`);
}

$('#mtExport').onclick = async () => {
  if (!key()) { toast('Collega prima RunPod'); return openSettings(); }
  if (!montId()) { toast('Inserisci l\'ID dell\'endpoint di montaggio'); openSettings(); $('#secMont').open = true; return; }
  const cs = mtClips(); if (!cs.length) return;
  stopPreview();
  const p = MT.proj, [W, H] = mtSize(), btn = $('#mtExport');
  btn.disabled = true; btn.textContent = 'Preparo…';
  try {
    const budget = { left: MAX_PAYLOAD };
    let music_b64 = null, music_key = null, music_ext = 'mp3';
    if (MT.music) {
      if (MT.music.key) music_key = MT.music.key;
      else { music_b64 = await b64Of(MT.music.blob); budget.left -= music_b64.length; }
      music_ext = (MT.music.name.split('.').pop() || 'mp3').toLowerCase();
    }
    const clips = [];
    for (const c of cs) clips.push(await clipSource(c, budget));
    const input = {
      action: 'montage', clips, title: p.title.trim(), end_card: p.end, transition: p.trans,
      keep_audio: p.keep, music_b64, music_key, music_ext, music_vol: p.vol / 100, width: W, height: H
    };
    const r = await rp(`/${montId()}/run`, { method: 'POST', body: JSON.stringify({ input }) });
    if (!r.id) throw new Error('Risposta inattesa da RunPod');
    MT.job = { jobId: r.id, title: p.title.trim(), started: Date.now() }; ls('mtJob', JSON.stringify(MT.job));
    renderMontage(); pollMontage();
    toast('Film inviato a RunPod: puoi chiudere l\'app, riprende da sola');
  } catch (e) {
    toast(e.message === 'Failed to fetch' ? 'Connessione a RunPod non riuscita' : e.message, 6000);
    MT.job = null; renderMontage();
  }
};

const MST = { IN_QUEUE: 'In coda su RunPod (avvio del worker)…', IN_PROGRESS: 'RunPod sta montando il film…' };
async function pollMontage() {
  const job = MT.job; if (!job) return;
  while (MT.job === job) {
    const mins = Math.round((Date.now() - job.started) / 60000);
    try {
      const r = await rp(`/${montId()}/status/${job.jobId}`);
      if (r.status === 'COMPLETED') {
        const out = r.output || {};
        if (out.error) throw Object.assign(new Error('Montaggio non riuscito: ' + out.error.slice(0, 200)), { fatal: true });
        $('#mtStatus').textContent = 'Scarico il film…';
        let blob = null, url = out.url || null;
        if (out.video_b64) blob = await (await fetch('data:video/mp4;base64,' + out.video_b64)).blob();
        else if (url) { try { const f = await fetch(url); if (f.ok) blob = await f.blob(); } catch (e) { } }
        if (!blob && !url) throw Object.assign(new Error('RunPod non ha restituito il film'), { fatal: true });
        await dbPut('films', { id: uid(), title: job.title, blob, url, key: out.key || null, created: Date.now(), dur: out.duration || 0 });
        endJob(); toast('Film montato ✓ — lo trovi in "Film montati"');
        return;
      }
      if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(r.status)) throw Object.assign(new Error('Montaggio non riuscito: ' + (r.error || r.status)), { fatal: true });
      $('#mtStatus').textContent = (MST[r.status] || r.status) + ` · ${mins} min`;
    } catch (e) {
      if (e.fatal || e.message.includes('Chiave')) { endJob(); toast(e.message, 7000); return; }
      $('#mtStatus').textContent = 'Connessione in pausa, riprovo…';
    }
    await new Promise(r => setTimeout(r, 5000));
  }
}
function endJob() { MT.job = null; localStorage.removeItem('regista_mtJob'); $('#mtStatus').textContent = ''; renderMontage(); }

/* ---------- dalla Galleria: "Al montaggio" e "Continua da qui" ---------- */
$('#vToMont').onclick = () => {
  if (!MT.proj) mtLoad();
  MT.proj.items.push(viewing.id); mtSave();
  toast(`Ciak ${viewing.take || ''} aggiunto al montaggio (${MT.proj.items.length} in timeline)`);
};
$('#vContinue').onclick = async () => {
  if (!montId()) { toast('Per estrarre il fotogramma serve l\'endpoint di montaggio'); closeM($('#viewer')); openSettings(); $('#secMont').open = true; return; }
  const c = viewing, btn = $('#vContinue'); btn.disabled = true; btn.textContent = 'RunPod estrae…';
  try {
    const src = await clipSource(c, { left: MAX_PAYLOAD });
    const r = await rp(`/${montId()}/runsync`, { method: 'POST', body: JSON.stringify({ input: { action: 'lastframe', ...src } }) });
    let out = r.output;
    for (let n = 0; !out && r.id && n < 40; n++) { // il worker si sta ancora avviando
      await new Promise(res => setTimeout(res, 3000));
      const s = await rp(`/${montId()}/status/${r.id}`); if (s.status === 'COMPLETED') out = s.output;
      else if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(s.status)) break;
    }
    if (!out || !out.image) throw new Error(out && out.error ? out.error : 'Fotogramma non ricevuto');
    loadSettings(c.settings);
    S.startImg = out.image; showStart(); renderRefChars();
    $('#prompt').value = '';
    closeM($('#viewer')); go('crea'); $('#prompt').focus();
    toast('Ultimo fotogramma pronto: descrivi cosa succede dopo');
  } catch (e) { toast('Estrazione non riuscita: ' + e.message, 6000); }
  btn.disabled = false; btn.textContent = '⤳ Continua da qui';
};

/* ---------- impostazioni montaggio ---------- */
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
