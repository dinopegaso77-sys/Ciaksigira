/* Ciak si gira — CAST
   Scheda personaggio: più foto (volto, profilo, figura intera), foto principale, ritocco, voce (AI o registrata).
   Personaggi di fantasia: breve intervista → scheda fissa (aspetto in inglese per i modelli) → ritratto → voce. */
'use strict';

const PHOTO_KINDS = [['volto', 'Volto'], ['profilo', 'Profilo'], ['figura', 'Figura intera'], ['altro', 'Altro']];
function charPhotos(c) {
  if (!c.photos || !c.photos.length) c.photos = [{ id: uid(), img: c.img, kind: 'volto' }];
  return c.photos;
}
async function saveChar(c) {
  charPhotos(c);
  c.img = c.photos[0].img;                       // la prima foto è la principale
  const sig = c.img.length + ':' + c.img.slice(-32);
  if (c.imgSig !== sig) { delete c.r2key; c.imgSig = sig; }
  await dbPut('chars', c);
  const i = S.chars.findIndex(x => x.id === c.id); if (i < 0) S.chars.push(c); else S.chars[i] = c;
  renderChars(); renderRefChars();
  if (window.regiaRefresh) regiaRefresh();
}

/* =================== scheda personaggio =================== */
const CS = { id: null };
function csChar() { return S.chars.find(x => x.id === CS.id); }
function openCharSheet(id) {
  const c = S.chars.find(x => x.id === id); if (!c) return;
  CS.id = id; charPhotos(c);
  $('#csTitle').textContent = c.name;
  $('#csName').value = c.name; $('#csDesc').value = c.desc || '';
  renderCsPhotos(); renderCsVoice();
  openM('mCharSheet');
}
function renderCsPhotos() {
  const c = csChar(); if (!c) return;
  const ph = charPhotos(c);
  $('#csPhotos').innerHTML = ph.map((p, k) => `<div class="cs-ph ${k === 0 ? 'main' : ''}">
      <div class="im"><img src="${p.img}" alt="">${k === 0 ? '<i class="star">⭐ principale</i>' : ''}</div>
      <select data-kind="${p.id}" aria-label="Tipo di foto">${PHOTO_KINDS.map(([v, t]) => `<option value="${v}" ${p.kind === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <div class="ph-act">
        ${k ? `<button class="ic sm" data-main="${p.id}" title="Rendi principale">⭐</button>` : ''}
        <button class="ic sm" data-ped="${p.id}" title="Ritocca">✏️</button>
        ${ph.length > 1 ? `<button class="ic sm" data-pdel="${p.id}" title="Togli">🗑</button>` : ''}
      </div></div>`).join('');
  const missing = ['profilo', 'figura'].filter(k => !ph.some(p => p.kind === k));
  const b = $('#csViews');
  b.classList.toggle('hidden', !missing.length);
  b.textContent = `🎨 Crea ${missing.map(k => k === 'profilo' ? 'profilo' : 'figura intera').join(' e ')} con l'AI (≈ ${money(missing.length * 0.03)})`;
  $$('#csPhotos [data-kind]').forEach(s => s.onchange = () => { const p = ph.find(x => x.id === s.dataset.kind); p.kind = s.value; saveChar(c); renderCsPhotos(); });
  $$('#csPhotos [data-main]').forEach(btn => btn.onclick = async () => { const i = ph.findIndex(x => x.id === btn.dataset.main); const [p] = ph.splice(i, 1); ph.unshift(p); await saveChar(c); renderCsPhotos(); });
  $$('#csPhotos [data-ped]').forEach(btn => btn.onclick = () => openPhotoEdit(c.id, btn.dataset.ped));
  $$('#csPhotos [data-pdel]').forEach(btn => btn.onclick = async () => { if (!confirm('Togliere questa foto?')) return; c.photos = ph.filter(x => x.id !== btn.dataset.pdel); await saveChar(c); renderCsPhotos(); });
}
$('#csName').onchange = async () => { const c = csChar(); const v = $('#csName').value.trim(); if (!c || !v) return; c.name = v; $('#csTitle').textContent = v; await saveChar(c); };
$('#csDesc').onchange = async () => { const c = csChar(); if (!c) return; c.desc = $('#csDesc').value.trim(); await saveChar(c); };
$('#csFile').onchange = async e => {
  const c = csChar(); const fs = [...e.target.files]; e.target.value = ''; if (!c || !fs.length) return;
  const ph = charPhotos(c);
  for (const f of fs.slice(0, 8)) {
    try {
      const img = await fileToJpeg(f, 1280);
      const kind = !ph.some(p => p.kind === 'profilo') && ph.length === 1 ? 'profilo' : !ph.some(p => p.kind === 'figura') ? 'figura' : 'altro';
      ph.push({ id: uid(), img, kind });
    } catch (err) { toast(err.message); }
  }
  await saveChar(c); renderCsPhotos(); toast('Foto aggiunte: controlla il tipo sotto ogni foto');
};
$('#csDel').onclick = async () => {
  const c = csChar(); if (!c || !confirm(`Eliminare ${c.name} dal Cast?`)) return;
  await dbDel('chars', c.id); S.chars = S.chars.filter(x => x.id !== c.id); S.selChars.delete(c.id);
  renderChars(); renderRefChars(); closeM($('#mCharSheet'));
};

/* viste mancanti create dal ritratto principale: il volto resta lo stesso */
const VIEW_PROMPT = {
  profilo: 'The exact same person in a clean side profile view (90 degrees), head and shoulders, same face, same hairstyle, same clothing, neutral light-grey studio background, soft light, photorealistic, only one person.',
  figura: 'The exact same person standing, full body from head to feet, front view, relaxed natural pose, arms along the body, both hands visible and anatomically correct, same face, same hairstyle, same clothing, neutral light-grey studio background, soft light, photorealistic, only one person.'
};
async function createViews(c, kinds) {
  const ph = charPhotos(c);
  const ref = r2On() ? await toModelUrl(ph[0].img, 'cast-' + c.id + '-' + ph[0].id) : ph[0].img;
  for (const k of kinds) {
    const look = c.look_en ? ' Outfit and look: ' + c.look_en : '';
    const url = await rpJob('seedream-v4-edit', { prompt: VIEW_PROMPT[k] + look, images: [ref], size: '1024*1024', enable_safety_checker: true });
    ph.push({ id: uid(), img: await urlToJpeg(url, 1280), kind: k, ai: true });
    await saveChar(c);
  }
}
$('#csViews').onclick = async () => {
  const c = csChar(); if (!c) return;
  if (!key()) return toast('Collega prima RunPod');
  const missing = ['profilo', 'figura'].filter(k => !charPhotos(c).some(p => p.kind === k));
  const b = $('#csViews'); b.disabled = true; b.textContent = '🎨 RunPod disegna…';
  try { await createViews(c, missing); toast('Viste create ✓ Controllale: se una non somiglia, ritoccala o toglila'); }
  catch (e) { toast('Viste non riuscite: ' + e.message, 7000); }
  b.disabled = false; renderCsPhotos();
};

/* voce del personaggio */
function renderCsVoice() {
  const c = csChar(); if (!c) return;
  $('#csVoice').innerHTML = `<option value="">Automatica (scelta dal Regista)</option>` + voiceOptions(c.voiceId || '');
  const note = $('#csVoiceNote');
  if (c.voiceId && c.voiceId.startsWith('clone:')) note.textContent = voceId() ? 'Voce registrata: il Regista la userà per le sue battute.' : 'Voce registrata. Per usarla collega l\'endpoint "voce clonata" in ⚙︎ Impostazioni.';
  else note.textContent = 'Puoi registrare la sua voce mentre legge un breve testo (10–20 secondi): le sue battute avranno quella voce. Registra solo voci di chi ti ha dato il consenso.';
}
$('#csVoice').onchange = async () => { const c = csChar(); if (!c) return; c.voiceId = $('#csVoice').value || null; await saveChar(c); renderCsVoice(); };
$('#csVoiceTest').onclick = async () => {
  const c = csChar(); if (!c) return;
  const vid = c.voiceId || autoVoice(c, 0);
  const b = $('#csVoiceTest'); b.disabled = true; b.textContent = '🔊 …';
  try { const v = await ttsVoice(vid, `Ciao, sono ${c.name}. Questa è la mia voce.`, 'neutral', 'prova-' + safeFile(c.name)); new Audio(v.url).play().catch(() => { }); }
  catch (e) { toast('Voce non riuscita: ' + e.message, 6000); }
  b.disabled = false; b.textContent = '🔊 Prova';
};
$('#csVoiceRec').onclick = () => {
  const c = csChar(); if (!c) return;
  openVoceNew({ name: c.name, onSaved: async pid => { c.voiceId = 'clone:' + pid; await saveChar(c); renderCsVoice(); toast(`La voce di ${c.name} è pronta ✓`); } });
};

/* =================== personaggio di fantasia: intervista =================== */
const CA = { step: 1, name: '', idea: '', context: '', questions: [], answers: {}, sheet: null, img: null, onSaved: null, views: false };
function openCharAI(opts = {}) {
  Object.assign(CA, { step: 1, name: opts.name || '', idea: opts.idea || '', context: opts.context || '', questions: [], answers: {}, sheet: null, img: null, onSaved: opts.onSaved || null, views: false });
  renderCharAI(); openM('mCharAI');
}
$('#charFantasy').onclick = () => { const n = $('#charName').value.trim(), d = $('#charDesc').value.trim(); closeM($('#mChar')); openCharAI({ name: n, idea: d }); };
function caSteps() {
  return `<ol class="ca-steps">${['Idea', 'Domande', 'Personaggio'].map((t, i) => `<li class="${CA.step === i + 1 ? 'on' : CA.step > i + 1 ? 'done' : ''}"><b>${CA.step > i + 1 ? '✓' : i + 1}</b>${t}</li>`).join('')}</ol>`;
}
function renderCharAI() {
  const box = $('#caBody');
  if (CA.step === 1) {
    box.innerHTML = `${caSteps()}
      <label>Nome<input id="caName" type="text" value="${esc(CA.name)}" placeholder="Es. Nonna Peppa"></label>
      <label>Chi è? Scrivilo come ti viene<textarea id="caIdea" rows="3" placeholder="Es. una vecchia pescatrice sarda burbera ma dal cuore d'oro">${esc(CA.idea)}</textarea></label>
      <button class="btn primary big" id="caAsk">💬 Fammi le domande <small>≈ 0,01 $</small></button>`;
    $('#caAsk').onclick = caAsk;
  } else if (CA.step === 2) {
    box.innerHTML = `${caSteps()}<p class="muted small">Tocca una risposta o scrivi la tua. Le domande lasciate vuote le decido io.</p>
      ${CA.questions.map((q, i) => `<div class="ca-q"><b>${esc(q.q)}</b>
        <div class="chipset">${(q.options || []).map(o => `<button class="chip ${CA.answers[i] === o ? 'on' : ''}" data-qa="${i}">${esc(o)}</button>`).join('')}</div>
        <input type="text" data-qt="${i}" placeholder="oppure scrivi…" value="${esc(q.options && q.options.includes(CA.answers[i]) ? '' : (CA.answers[i] || ''))}"></div>`).join('')}
      <div class="actions"><button class="btn" id="caBack">← Idea</button><button class="btn primary" id="caMake">✨ Crea il personaggio <small>≈ 0,03 $</small></button></div>`;
    $$('#caBody [data-qa]').forEach(b => b.onclick = () => { const i = +b.dataset.qa; CA.answers[i] = CA.answers[i] === b.textContent ? '' : b.textContent; renderCharAI(); });
    $$('#caBody [data-qt]').forEach(t => t.oninput = () => { CA.answers[+t.dataset.qt] = t.value; $$(`#caBody [data-qa="${t.dataset.qt}"]`).forEach(b => b.classList.remove('on')); });
    $('#caBack').onclick = () => { CA.step = 1; renderCharAI(); };
    $('#caMake').onclick = caMake;
  } else {
    const s = CA.sheet || {};
    const vlabel = (VOICES.find(v => v[0] === s.voice) || [0, 'automatica'])[1];
    box.innerHTML = `${caSteps()}
      <div class="ca-res">
        <div class="ca-img">${CA.img ? `<img src="${CA.img}" alt="">` : '<span>RunPod disegna…</span>'}</div>
        <div class="ca-info"><b class="chalk">${esc(s.name || CA.name)}</b><p>${esc(s.desc || '')}</p>
          <details class="adv"><summary>Aspetto fisso (per i modelli video)</summary><p class="muted small">${esc(s.look_en || '')}</p></details>
          <p class="muted small">🗣 Voce: ${esc(vlabel)} — puoi cambiarla o registrarla dopo, nella sua scheda.</p></div>
      </div>
      <label class="check"><input type="checkbox" id="caViews" ${CA.views ? 'checked' : ''}> Crea anche profilo e figura intera, con lo stesso volto (≈ 0,06 $)</label>
      <div class="actions">
        <button class="btn" id="caRedo" ${CA.img ? '' : 'disabled'}>↻ Altro volto (≈ 0,02 $)</button>
        <button class="btn" id="caBack2">← Cambia le risposte</button>
        <button class="btn primary" id="caSave" ${CA.img ? '' : 'disabled'}>✓ Salva nel Cast</button>
      </div>`;
    $('#caViews').onchange = () => { CA.views = $('#caViews').checked; };
    $('#caRedo').onclick = caPortrait;
    $('#caBack2').onclick = () => { CA.step = 2; renderCharAI(); };
    $('#caSave').onclick = caSave;
  }
}
async function caAsk() {
  CA.name = $('#caName').value.trim(); CA.idea = $('#caIdea').value.trim();
  if (!CA.idea) { toast('Scrivi almeno due parole su chi è'); return $('#caIdea').focus(); }
  if (!key()) return toast('Collega prima RunPod');
  const b = $('#caAsk'); b.disabled = true; b.textContent = '💬 Penso alle domande…';
  try {
    const r = await llmJSON(
      'You are a casting director and character designer for photorealistic AI films. Ask the user, in Italian, the 5-7 most useful questions to define a FIXED visual look and a voice for this character: apparent age, build and height, face and distinctive features, hair, skin and complexion, typical outfit and colours, temperament and voice. Skip anything already clear from the description. Each question has 3-5 short suggested answers (max 4 words each). Reply ONLY with JSON {"questions":[{"q":"","options":["",""]}]}.',
      `Character name: ${CA.name || '(not decided)'}\nDescription: ${CA.idea}${CA.context ? '\nStory context: ' + CA.context.slice(0, 1200) : ''}`, 1200);
    CA.questions = (r.questions || []).filter(q => q && q.q).slice(0, 8);
    if (!CA.questions.length) throw new Error('nessuna domanda ricevuta');
    CA.answers = {}; CA.step = 2; renderCharAI();
  } catch (e) { toast('Non riuscito: ' + e.message, 7000); b.disabled = false; b.textContent = '💬 Fammi le domande'; }
}
async function caMake() {
  const b = $('#caMake'); b.disabled = true; b.textContent = '✨ Creo…';
  try {
    const qa = CA.questions.map((q, i) => `- ${q.q} → ${(CA.answers[i] || '').trim() || '(decide you, coherent with the rest)'}`).join('\n');
    const s = await llmJSON(
      `You design a character for photorealistic AI video. Build a FIXED character sheet. look_en must be a precise English description (45-80 words) usable in every prompt: apparent age, build, face shape and features, eyes, hair (colour, length, style), skin and complexion, distinctive marks, one typical outfit with colours. No celebrities. Choose the best voice id from this list: ${VOICES.map(v => v[0] + ' (' + v[1] + ')').join(', ')}. Reply ONLY with JSON {"name":"","desc":"Italian, max 15 words","look_en":"","gender":"m|f","age":40,"voice":"id"}.`,
      `Name: ${CA.name || '(invent a fitting Italian name)'}\nDescription: ${CA.idea}\nAnswers:\n${qa}${CA.context ? '\nStory context: ' + CA.context.slice(0, 1200) : ''}`, 1200);
    if (!s.look_en) throw new Error('scheda incompleta');
    CA.sheet = s; CA.name = s.name || CA.name; CA.img = null; CA.step = 3; renderCharAI();
    await caPortrait();
  } catch (e) { toast('Non riuscito: ' + e.message, 7000); if ($('#caMake')) { $('#caMake').disabled = false; $('#caMake').textContent = '✨ Crea il personaggio'; } }
}
async function caPortrait() {
  const b = $('#caRedo'); if (b) { b.disabled = true; b.textContent = '↻ Disegno…'; }
  try { CA.img = await aiPortrait(CA.sheet.name || CA.name, CA.sheet.look_en); }
  catch (e) { toast('Ritratto non riuscito: ' + e.message, 7000); }
  renderCharAI();
}
async function caSave() {
  const s = CA.sheet || {}; if (!CA.img) return;
  const b = $('#caSave'); b.disabled = true; b.textContent = 'Salvo…';
  const c = { id: uid(), name: s.name || CA.name || 'Personaggio', desc: s.desc || CA.idea, img: CA.img, created: Date.now(), ai: true,
    look_en: s.look_en, gender: s.gender, age: s.age, voiceId: VOICES.some(v => v[0] === s.voice) ? 'mm:' + s.voice : null,
    photos: [{ id: uid(), img: CA.img, kind: 'volto', ai: true }] };
  await saveChar(c);
  if (CA.views) { b.textContent = 'Creo le viste…'; try { await createViews(c, ['profilo', 'figura']); } catch (e) { toast('Viste non riuscite: ' + e.message, 6000); } }
  closeM($('#mCharAI')); toast(`${c.name} è nel Cast ✓`);
  if (CA.onSaved) await CA.onSaved(c);
}
