/* Regista AI — Voce AI (MiniMax Speech 02 HD su RunPod) e "Aggiungi voce" a clip e video.
   La voce viene generata da RunPod, salvata nell'archivio R2 e unita ai video dal worker. */
'use strict';

const VOICES = [
  ['Wise_Woman', 'Donna saggia'], ['Calm_Woman', 'Donna calma'], ['Friendly_Person', 'Voce cordiale'],
  ['Inspirational_girl', 'Ragazza ispirata'], ['Lively_Girl', 'Ragazza vivace'], ['Lovely_Girl', 'Ragazza dolce'],
  ['Sweet_Girl_2', 'Ragazza tenera'], ['Exuberant_Girl', 'Ragazza esuberante'], ['Abbess', 'Badessa (donna matura)'],
  ['Deep_Voice_Man', 'Uomo voce profonda'], ['Casual_Guy', 'Ragazzo informale'], ['Patient_Man', 'Uomo paziente'],
  ['Determined_Man', 'Uomo deciso'], ['Elegant_Man', 'Uomo elegante'], ['Imposing_Manner', 'Voce imponente'],
  ['Young_Knight', 'Giovane cavaliere'], ['Decent_Boy', 'Ragazzo garbato']
];
const EMOTIONS = [['neutral', 'Neutra'], ['happy', 'Felice'], ['sad', 'Triste'], ['angry', 'Arrabbiata'], ['fearful', 'Impaurita'], ['surprised', 'Sorpresa']];
const VOICE_PRICE = 0.05 / 1000; // $ per carattere

const VO = { onDone: null, last: null, dub: null };
const cents = x => x < 0.01 ? (x < 0.001 ? '< 0,001 $' : x.toFixed(3).replace('.', ',') + ' $') : money(x);

/* ---------- finestra "Crea voce" ---------- */
function openVoice(onDone) {
  VO.onDone = onDone || null; VO.last = null;
  $('#voVoice').innerHTML = VOICES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  $('#voEmo').innerHTML = EMOTIONS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  try { const p = JSON.parse(ls('voicePrefs') || '{}'); if (p.voice) $('#voVoice').value = p.voice; if (p.emo) $('#voEmo').value = p.emo; if (p.speed) $('#voSpeed').value = p.speed; } catch (e) { }
  $('#voResult').classList.add('hidden'); $('#voGo').disabled = false; $('#voGo').textContent = '🗣 Genera la voce';
  $('#voStatus').textContent = ''; fillClones(); voSetMode(ls('voiceMode') === 'clone' ? 'clone' : 'ai'); voSpeedLabel();
  $('#voUseTalk').classList.toggle('hidden', !!VO.onDone);
  $('#voUseDub').classList.toggle('hidden', !VO.onDone);
  openM('mVoice');
}
function voCost() {
  const n = $('#voText').value.trim().length;
  if (VO.mode === 'clone') { $('#voCost').innerHTML = `<span>${n} caratteri · tempo GPU del tuo endpoint, circa</span><b>${cents((n / 14 * 1.6 + 6) * 0.00025)}</b>`; return; }
  $('#voCost').innerHTML = `<span>${n} caratteri · costo stimato</span><b>${cents(Math.max(n, 1) * VOICE_PRICE)}</b>`;
}
function voSpeedLabel() { $('#voSpeedVal').textContent = (+$('#voSpeed').value).toFixed(1).replace('.', ',') + '×'; }
$('#voText').oninput = voCost;
$('#voSpeed').oninput = voSpeedLabel;

$('#voGo').onclick = async () => {
  if (!key()) { toast('Collega prima RunPod'); return openSettings(); }
  if (VO.mode === 'clone') return cloneGo();
  const text = $('#voText').value.trim();
  if (!text) { toast('Scrivi il testo da far dire alla voce'); return $('#voText').focus(); }
  if (text.length > 5000) return toast('Testo troppo lungo: massimo 5000 caratteri per volta');
  const voice = $('#voVoice').value, emotion = $('#voEmo').value, speed = +$('#voSpeed').value;
  ls('voicePrefs', JSON.stringify({ voice, emo: emotion, speed }));
  const btn = $('#voGo'), st = $('#voStatus');
  btn.disabled = true; btn.textContent = 'RunPod sta registrando…'; st.textContent = '';
  try {
    const r = await rp('/minimax-speech-02-hd/run', { method: 'POST', body: JSON.stringify({ input: { prompt: text, voice_id: voice, speed, volume: 1, pitch: 0, emotion, english_normalization: false } }) });
    let out = r.status === 'COMPLETED' ? r.output : null;
    for (let n = 0; out == null && n < 80; n++) {
      await new Promise(res => setTimeout(res, 2500));
      const s = await rp(`/minimax-speech-02-hd/status/${r.id}`);
      if (s.status === 'COMPLETED') out = s.output;
      else if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(s.status)) throw new Error(traduciErrore(s.error || s.status));
    }
    const audioUrlOut = out && (typeof out === 'string' ? out : (out.audio_url || out.result || out.url || out.audio || (out.output && (out.output.audio_url || out.output.result))));
    if (!audioUrlOut) throw new Error('RunPod non ha restituito l\'audio. Risposta: ' + JSON.stringify(out || {}).slice(0, 300));
    if (typeof out === 'object') out.audio_url = audioUrlOut; else out = { audio_url: audioUrlOut };
    const cost = typeof out.cost === 'number' ? out.cost : text.length * VOICE_PRICE;
    ls('spent', String((parseFloat(ls('spent')) || 0) + cost)); showSpent();
    const label = VOICES.find(v => v[0] === voice)[1];
    const name = `voce-AI-${safeFile(($('#voName').value || text.slice(0, 30)))}`;
    VO.last = { url: out.audio_url, name: name + '.mp3', key: null, dur: 0 };
    if (r2On()) {
      btn.textContent = 'Salvo nell\'archivio…';
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const k = `libreria/${stamp.slice(0, 8)}-${stamp.slice(8)}-${Math.random().toString(16).slice(2, 8)}-${name}.mp3`;
      try { VO.last.key = (await workerCall({ action: 'save_url', url: out.audio_url, key: k, type: 'audio/mpeg' }, 120)).key; libRefresh(true); }
      catch (e) { st.textContent = 'Voce pronta, ma non salvata nell\'archivio (resta disponibile 7 giorni).'; }
    } else st.textContent = 'Voce pronta. Senza archivio collegato resta disponibile per 7 giorni.';
    $('#voPlay').src = out.audio_url;
    $('#voPlay').onloadedmetadata = () => { VO.last.dur = $('#voPlay').duration || 0; };
    $('#voResult').classList.remove('hidden');
    $('#voInfo').textContent = `${label} · ${EMOTIONS.find(e => e[0] === emotion)[1].toLowerCase()} · ${cents(cost)}`;
    btn.textContent = '🗣 Rigenera'; toast('Voce pronta ✓');
  } catch (e) { toast('Voce non riuscita: ' + (e.message === 'Failed to fetch' ? 'connessione a RunPod non riuscita' : e.message), 6000); btn.textContent = '🗣 Genera la voce'; }
  btn.disabled = false;
};
$('#voUseTalk').onclick = () => {
  if (!VO.last) return;
  S.audioIn = VO.last.url; S.audioName = VO.last.name; S.audioDur = Math.round(VO.last.dur) || 0;
  setEngine('talk'); showAudioIn(); closeM($('#mVoice')); go('crea'); toast('Voce pronta per InfiniteTalk: scegli la foto del personaggio');
};
$('#voUseDub').onclick = () => { if (VO.last && VO.onDone) { const f = VO.onDone; closeM($('#mVoice')); f(VO.last); } };

/* ---------- finestra "Aggiungi voce" a una clip o a un mio video ---------- */
async function openDub(target) {
  VO.dub = { target, audio: null };
  if (r2On() && !LIB.loaded) { await libRefresh(true); }
  const auds = (r2On() ? LIB.items.filter(i => i.kind === 'audio') : []);
  $('#dubAudio').innerHTML = (auds.length ? '<option value="">— scegli un audio —</option>' : '<option value="">Nessun audio: crea una voce</option>')
    + auds.map(i => `<option value="${esc(i.key)}">${esc(i.name).slice(0, 50)}</option>`).join('');
  const t = target.clip || target.item;
  $('#dubTitle').textContent = target.clip ? `Voce su ciak ${t.take || ''}` : 'Voce su ' + t.name;
  $('#dubStart').value = 0; $('#dubVol').value = 100; $('#dubVolVal').textContent = '100%'; $('#dubOrig').value = 'low';
  $('#dubPrev').classList.add('hidden'); $('#dubGo').disabled = false; $('#dubGo').textContent = '🎤 Unisci su RunPod';
  openM('mDub');
}
$('#dubVol').oninput = () => { $('#dubVolVal').textContent = $('#dubVol').value + '%'; };
$('#dubAudio').onchange = async () => {
  const k = $('#dubAudio').value; VO.dub.audio = k ? { key: k } : null;
  if (k) { $('#dubPrev').src = await libUrl(k); $('#dubPrev').classList.remove('hidden'); } else $('#dubPrev').classList.add('hidden');
};
$('#dubNew').onclick = () => openVoice(v => {
  VO.dub.audio = v.key ? { key: v.key } : String(v.url).startsWith('data:') ? { b64: v.url } : { url: v.url };
  if (v.key) { LIB.items.unshift({ key: v.key, kind: 'audio', name: libName(v.key), size: 0, modified: new Date().toISOString() }); }
  const opt = document.createElement('option'); opt.value = v.key || ''; opt.textContent = '★ ' + v.name;
  $('#dubAudio').prepend(opt); $('#dubAudio').value = opt.value;
  $('#dubPrev').src = v.url; $('#dubPrev').classList.remove('hidden');
});
async function dubVideoSource(t) {
  if (t.item) return { key: t.item.key };
  const c = t.clip;
  if (c.r2key && r2On()) return { key: c.r2key };
  if (c.url && Date.now() - c.created < 6.5 * 864e5) return { url: c.url };
  if (c.blob && c.blob.size < 7 * 1024 * 1024) return { b64: await b64Of(c.blob) };
  throw new Error('il ciak è troppo vecchio o pesante: collega l\'archivio per usarlo');
}
$('#dubGo').onclick = async () => {
  if (!montId()) { toast('Serve il worker di montaggio: collegalo in ⚙︎'); return; }
  const d = VO.dub; if (!d.audio && !$('#dubAudio').value) return toast('Scegli un audio o crea una voce');
  if (!d.audio) d.audio = { key: $('#dubAudio').value };
  const btn = $('#dubGo'); btn.disabled = true; btn.textContent = 'RunPod sta unendo…';
  try {
    const t = d.target, isClip = !!t.clip;
    const base = isClip ? `ciak-${t.clip.take || ''}-con-voce` : t.item.name.replace(/\.[^.]+$/, '') + '-con-voce';
    const out = await workerCall({
      action: 'voiceover', video: await dubVideoSource(t), audio: d.audio,
      start: Math.max(0, +$('#dubStart').value || 0), voice_vol: (+$('#dubVol').value || 100) / 100, orig: $('#dubOrig').value,
      folder: isClip ? 'ciak' : 'libreria', name: base
    }, 300);
    if (isClip) {
      const c = t.clip, url = out.url || null;
      let blob = null;
      if (out.video_b64) blob = await (await fetch('data:video/mp4;base64,' + out.video_b64)).blob();
      else if (url) { try { const f = await fetch(url); if (f.ok) blob = await f.blob(); } catch (e) { } }
      const nc = { ...c, id: uid(), url, blob, r2key: out.key || null, created: Date.now(), cost: 0, fav: false, audioFrom: null,
        settings: { ...c.settings, prompt: c.settings.prompt + ' · con voce' } };
      await dbPut('clips', nc); S.clips.unshift(nc);
      closeM($('#mDub')); go('galleria'); toast(`Nuova versione del ciak ${c.take || ''} con voce ✓`);
    } else {
      closeM($('#mDub')); libRefresh(true); toast('Video con voce salvato in "I miei file" ✓');
    }
  } catch (e) { toast('Unione non riuscita: ' + e.message, 6000); }
  btn.disabled = false; btn.textContent = '🎤 Unisci su RunPod';
};

/* ---------- pulsanti che aprono le finestre ---------- */
$('#voOpen').onclick = () => openVoice();
$('#vDub').onclick = () => { const c = viewing; closeM($('#viewer')); openDub({ clip: c }); };
$('#audioInVoice').onclick = () => openVoice();


/* =====================================================================
   VOCE CLONATA (Chatterbox su un endpoint GPU personale)
   Il campione resta sul telefono (IndexedDB) e, se l'archivio è attivo, anche in R2 nella cartella voci/.
   ===================================================================== */
const voceId = () => ls('voceEndpoint') || '';
const READ_TEXT = {
  it: 'Ciao, questa è la mia voce. La sto registrando con calma, in una stanza silenziosa, per insegnare all\'app come parlo. ' +
    'Leggo con il mio tono naturale: a volte allegro, a volte serio, proprio come quando racconto una storia agli amici. ' +
    'Il sole tramonta dietro le colline, il vento muove le foglie e, in lontananza, si sente il rumore del mare.',
  en: 'Hello, this is my voice. I am recording it calmly, in a quiet room, to teach the app how I speak. ' +
    'I read with my natural tone: sometimes cheerful, sometimes serious, just like when I tell a story to my friends. ' +
    'The sun sets behind the hills, the wind moves the leaves and, far away, you can hear the sound of the sea.'
};
function voiceProfiles() { try { return JSON.parse(ls('voci') || '[]'); } catch (e) { return []; } }
function saveProfiles(a) { ls('voci', JSON.stringify(a)); }

function voSetMode(m) {
  VO.mode = m; ls('voiceMode', m);
  $$('#voMode button').forEach(b => b.classList.toggle('active', b.dataset.m === m));
  $('#voAiPanel').classList.toggle('hidden', m !== 'ai');
  $('#voClonePanel').classList.toggle('hidden', m !== 'clone');
  const n = $('#voCloneNote');
  if (m === 'clone') n.textContent = !voceId() ? 'Per usare le tue voci collega l\'endpoint "voce clonata" in ⚙︎ Impostazioni.'
    : !voiceProfiles().length ? 'Crea la prima voce: leggi un breve testo e l\'app imparerà a parlare come te.' : 'La prima voce dopo una pausa può richiedere 1–2 minuti (RunPod accende la GPU).';
  voCost();
}
$$('#voMode button').forEach(b => b.onclick = () => voSetMode(b.dataset.m));
function fillClones(sel) {
  const p = voiceProfiles();
  $('#voClone').innerHTML = p.length ? p.map(v => `<option value="${v.id}">${esc(v.name)}${v.lang && v.lang !== 'it' ? ' (' + v.lang + ')' : ''}</option>`).join('') : '<option value="">Nessuna voce: creane una →</option>';
  if (sel) $('#voClone').value = sel; else if (ls('voiceClone') && p.some(v => v.id === ls('voiceClone'))) $('#voClone').value = ls('voiceClone');
  $('#voCloneDel').disabled = !p.length;
}
const exagLbl = () => { $('#voExagVal').textContent = (+$('#voExag').value).toFixed(2).replace('.', ','); };
const paceLbl = () => { const x = +$('#voPace').value; $('#voPaceVal').textContent = x < 0.4 ? 'più lento' : x > 0.6 ? 'più rapido' : 'normale'; };
$('#voExag').oninput = exagLbl; $('#voPace').oninput = paceLbl;
$('#voClone').onchange = () => ls('voiceClone', $('#voClone').value);
$('#voCloneDel').onclick = async () => {
  const id = $('#voClone').value, p = voiceProfiles().find(v => v.id === id); if (!p) return;
  if (!confirm(`Eliminare la voce "${p.name}"? Il campione verrà cancellato.`)) return;
  saveProfiles(voiceProfiles().filter(v => v.id !== id)); await dbDel('audio', 'voce-' + id);
  if (p.key && r2On()) { try { await workerCall({ action: 'delete', key: p.key }); } catch (e) { } }
  fillClones(); voSetMode('clone'); toast('Voce eliminata');
};

async function refOf(p) {
  if (p.key && r2On()) { try { return { url: await libUrl(p.key) }; } catch (e) { } }
  const rec = (await dbAll('audio')).find(a => a.id === 'voce-' + p.id);
  if (rec && rec.blob) return { b64: await b64Of(rec.blob) };
  throw new Error('campione della voce non trovato su questo dispositivo: ricrealo');
}
async function voceCall(input, maxWait = 900) {
  const id = voceId(); if (!id) throw new Error('endpoint voce non collegato');
  const r = await rp(`/${id}/run`, { method: 'POST', body: JSON.stringify({ input }) });
  let out = r.status === 'COMPLETED' ? r.output : null;
  for (let n = 0; !out && n < maxWait / 3; n++) {
    await new Promise(res => setTimeout(res, 3000));
    const s = await rp(`/${id}/status/${r.id}`);
    if (s.status === 'COMPLETED') out = s.output;
    else if (BAD.includes(s.status)) throw new Error(s.error || s.status);
    else $('#voGo').textContent = s.status === 'IN_QUEUE' ? 'RunPod accende la GPU…' : 'La tua voce sta parlando…';
  }
  if (!out) throw new Error('il worker voce non ha risposto in tempo');
  if (out.error) throw new Error(out.error);
  return out;
}

async function cloneGo() {
  if (!voceId()) { toast('Collega prima l\'endpoint della voce clonata'); openSettings(); $('#secVoce').open = true; return; }
  const p = voiceProfiles().find(v => v.id === $('#voClone').value);
  if (!p) { toast('Crea prima una voce'); return openVoceNew(); }
  const text = $('#voText').value.trim();
  if (!text) { toast('Scrivi il testo da far dire alla voce'); return $('#voText').focus(); }
  if (text.length > 5000) return toast('Testo troppo lungo: massimo 5000 caratteri per volta');
  const btn = $('#voGo'), st = $('#voStatus'); btn.disabled = true; btn.textContent = 'Preparo il campione…'; st.textContent = '';
  const t0 = Date.now();
  try {
    const out = await voceCall({ action: 'tts', text, lang: $('#voLang').value, ref: await refOf(p), exaggeration: +$('#voExag').value, cfg_weight: 1 - +$('#voPace').value });
    if (!out.audio_b64) throw new Error('RunPod non ha restituito l\'audio');
    const blob = await (await fetch('data:audio/mpeg;base64,' + out.audio_b64)).blob();
    const cost = Math.max(1, (Date.now() - t0) / 1000) * 0.00025;
    ls('spent', String((parseFloat(ls('spent')) || 0) + cost)); showSpent();
    const name = `voce-${safeFile(p.name)}-${safeFile($('#voName').value || text.slice(0, 30))}`;
    VO.last = { url: 'data:audio/mpeg;base64,' + out.audio_b64, name: name + '.mp3', key: null, dur: out.duration || 0 };
    if (r2On()) {
      btn.textContent = 'Salvo nell\'archivio…';
      try { const up = await uploadToR2(blob, name + '.mp3', 'libreria'); VO.last.key = up.key; VO.last.url = up.get; libRefresh(true); }
      catch (e) { st.textContent = 'Voce pronta, ma non salvata nell\'archivio.'; }
    } else st.textContent = 'Voce pronta. Collega l\'archivio per ritrovarla in "I miei file".';
    $('#voPlay').src = URL.createObjectURL(blob);
    $('#voResult').classList.remove('hidden');
    $('#voInfo').textContent = `${p.name} · ${$('#voLang').selectedOptions[0].textContent.toLowerCase()} · ${fmtTime(out.duration || 0)} · circa ${cents(cost)}`;
    btn.textContent = '🗣 Rigenera'; toast('Voce pronta ✓');
  } catch (e) { toast('Voce non riuscita: ' + (e.message === 'Failed to fetch' ? 'connessione a RunPod non riuscita' : e.message), 7000); btn.textContent = '🗣 Genera la voce'; }
  btn.disabled = false;
}

/* ---- nuova voce: registra o carica il campione ---- */
const VN = { mr: null, chunks: [], blob: null, t0: 0, timer: 0, dur: 0 };
function openVoceNew(opts) {
  opts = opts && opts.name !== undefined ? opts : {};
  VN.onSaved = opts.onSaved || null;
  VN.blob = null; VN.dur = 0; $('#vnName').value = opts.name || ''; $('#vnOk').checked = false; $('#vnStatus').textContent = '';
  $('#vnPrev').classList.add('hidden'); $('#vnTime').textContent = '0:00'; $('#vnRec').textContent = '● Registra'; $('#vnRec').classList.remove('on');
  $('#vnText').textContent = READ_TEXT[$('#vnLang').value] || READ_TEXT.it; vnCheck(); openM('mVoceNew');
}
$('#voCloneNew').onclick = () => openVoceNew();
$('#vnLang').onchange = () => { $('#vnText').textContent = READ_TEXT[$('#vnLang').value] || READ_TEXT.it; };
function vnCheck() { $('#vnSave').disabled = !(VN.blob && $('#vnOk').checked && $('#vnName').value.trim()); }
$('#vnOk').onchange = vnCheck; $('#vnName').oninput = vnCheck;
function vnSetBlob(blob) {
  VN.blob = blob; const a = $('#vnPrev'); a.src = URL.createObjectURL(blob); a.classList.remove('hidden');
  a.onloadedmetadata = () => {
    VN.dur = isFinite(a.duration) ? a.duration : VN.dur;
    $('#vnStatus').textContent = VN.dur && VN.dur < 10 ? 'Il campione è corto: per un buon risultato servono almeno 10 secondi.' : 'Ascolta il campione: se è chiaro e senza rumori, salvalo.';
  };
  vnCheck();
}
$('#vnRec').onclick = async () => {
  if (VN.mr && VN.mr.state === 'recording') { VN.mr.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
    VN.mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); VN.chunks = [];
    VN.mr.ondataavailable = e => e.data.size && VN.chunks.push(e.data);
    VN.mr.onstop = () => {
      clearInterval(VN.timer); stream.getTracks().forEach(t => t.stop());
      VN.dur = (Date.now() - VN.t0) / 1000;
      $('#vnRec').textContent = '● Registra di nuovo'; $('#vnRec').classList.remove('on');
      vnSetBlob(new Blob(VN.chunks, { type: (VN.mr.mimeType || 'audio/webm').split(';')[0] }));
    };
    VN.mr.start(); VN.t0 = Date.now(); $('#vnRec').textContent = '■ Ferma'; $('#vnRec').classList.add('on');
    VN.timer = setInterval(() => { const s = (Date.now() - VN.t0) / 1000; $('#vnTime').textContent = fmtTime(s); if (s >= 40) VN.mr.stop(); }, 250);
  } catch (e) { toast('Microfono non disponibile: controlla i permessi del browser'); }
};
$('#vnFile').onchange = e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.size > 15 * 1024 * 1024) return toast('File troppo grande: bastano 20–30 secondi di voce');
  VN.dur = 0; vnSetBlob(f);
};
$('#vnSave').onclick = async () => {
  if (!VN.blob) return;
  const btn = $('#vnSave'); btn.disabled = true; btn.textContent = 'Salvo…';
  try {
    const id = uid(), name = $('#vnName').value.trim().slice(0, 40), lang = $('#vnLang').value;
    await dbPut('audio', { id: 'voce-' + id, blob: VN.blob, created: Date.now() });
    let key = null;
    if (r2On()) {
      const ext = (VN.blob.name && VN.blob.name.split('.').pop()) || ((VN.blob.type.split('/')[1] || 'webm').replace('mpeg', 'mp3'));
      try { key = (await uploadToR2(VN.blob, `${safeFile(name)}-campione.${ext}`, 'voci')).key; } catch (e) { }
    }
    saveProfiles([{ id, name, lang, key, created: Date.now(), dur: Math.round(VN.dur) }, ...voiceProfiles()]);
    closeM($('#mVoceNew'));
    if (VN.onSaved) { const cb = VN.onSaved; VN.onSaved = null; await cb(id, name); }
    else { ls('voiceClone', id); fillClones(id); $('#voLang').value = lang; voSetMode('clone'); toast(`Voce "${name}" salvata ✓ Ora scrivi il testo e premi Genera`); }
  } catch (e) { toast('Salvataggio non riuscito: ' + e.message); }
  btn.textContent = 'Salva la voce'; vnCheck();
};

/* ---- impostazioni ---- */
function voceSummary() { const e = $('#sumVoce'); e.textContent = voceId() ? 'collegata ✓' : 'facoltativa'; e.className = voceId() ? 'ok' : ''; $('#setVoce').value = voceId(); }
$('#openSet').addEventListener('click', voceSummary);
$('#saveVoce').onclick = () => { ls('voceEndpoint', $('#setVoce').value.trim()); voceSummary(); const s = $('#voceStatus'); s.textContent = 'Salvato ✓'; s.className = 'status ok'; };
$('#testVoce').onclick = async () => {
  ls('voceEndpoint', $('#setVoce').value.trim()); voceSummary();
  const s = $('#voceStatus');
  if (!voceId()) { s.textContent = 'Inserisci l\'ID'; s.className = 'status ko'; return; }
  s.textContent = 'Controllo (la prima accensione della GPU può richiedere un paio di minuti)…'; s.className = 'status';
  try {
    const r = await rp(`/${voceId()}/runsync`, { method: 'POST', body: JSON.stringify({ input: { action: 'ping' } }) });
    if (r.output && r.output.ok) { s.textContent = r.output.device === 'cuda' ? 'Worker voce pronto su GPU ✓' : 'Worker raggiunto, ma senza GPU: scegli una GPU nell\'endpoint'; s.className = r.output.device === 'cuda' ? 'status ok' : 'status ko'; }
    else { s.textContent = 'Endpoint raggiunto: il worker si sta avviando, riprova tra poco'; s.className = 'status'; }
  } catch (e) { s.textContent = e.message.includes('404') ? 'ID endpoint non trovato' : e.message; s.className = 'status ko'; }
};
voceSummary();
