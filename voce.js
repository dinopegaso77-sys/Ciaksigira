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
  $('#voStatus').textContent = ''; voCost(); voSpeedLabel();
  $('#voUseTalk').classList.toggle('hidden', !!VO.onDone);
  $('#voUseDub').classList.toggle('hidden', !VO.onDone);
  openM('mVoice');
}
function voCost() {
  const n = $('#voText').value.trim().length;
  $('#voCost').innerHTML = `<span>${n} caratteri · costo stimato</span><b>${cents(Math.max(n, 1) * VOICE_PRICE)}</b>`;
}
function voSpeedLabel() { $('#voSpeedVal').textContent = (+$('#voSpeed').value).toFixed(1).replace('.', ',') + '×'; }
$('#voText').oninput = voCost;
$('#voSpeed').oninput = voSpeedLabel;

$('#voGo').onclick = async () => {
  if (!key()) { toast('Collega prima RunPod'); return openSettings(); }
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
    for (let n = 0; !out && n < 60; n++) {
      await new Promise(res => setTimeout(res, 2500));
      const s = await rp(`/minimax-speech-02-hd/status/${r.id}`);
      if (s.status === 'COMPLETED') out = s.output;
      else if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(s.status)) throw new Error(traduciErrore(s.error || s.status));
    }
    if (!out || !out.audio_url) throw new Error('RunPod non ha restituito l\'audio');
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
  VO.dub.audio = v.key ? { key: v.key } : { url: v.url };
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
