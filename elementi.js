/* Ciak si gira — ELEMENTI e COMPONI
   Oltre ai personaggi, il Cast tiene oggetti e costumi, sfondi e luoghi, simboli e loghi.
   🎨 Componi li mescola in una sola immagine: personaggi vestiti in un certo modo, coppie e gruppi, banner, loghi.
   Ogni immagine pagata viene salvata subito (Composizioni + archivio R2), così non si perde mai. */
'use strict';

const ELEM_TYPES = {
  oggetto: { icon: '👕', tab: 'Oggetti', title: 'Nuovo oggetto o costume', name: 'Es. Giubbotto di pelle',
    ph: 'Es. giubbotto di pelle nera da motociclista con zip argentate',
    intro: 'Vestiti, accessori, oggetti di scena, veicoli. Con 🎨 Componi li fai indossare o tenere ai personaggi; nel Regista li aggiungi a un\'inquadratura e restano uguali.' },
  sfondo: { icon: '🏞', tab: 'Sfondi', title: 'Nuovo sfondo o luogo', name: 'Es. Faro al tramonto',
    ph: 'Es. faro bianco su una scogliera, mare calmo, luce del tramonto',
    intro: 'Luoghi e ambienti vuoti. Usati in più scene, il posto resta sempre lo stesso.' },
  simbolo: { icon: '✳️', tab: 'Simboli', title: 'Nuovo simbolo o logo', name: 'Es. Logo Ciak',
    ph: 'Es. ciak cinematografico stilizzato con una stella, oro su nero, stile minimal',
    intro: 'Simboli e loghi tuoi per banner, magliette e pubblicità. Crea segni originali: i modelli rifiutano o storpiano i marchi famosi.' },
  composizione: { icon: '🖼', tab: 'Composizioni',
    intro: 'Le immagini create con 🎨 Componi: personaggi vestiti come vuoi, coppie e gruppi, banner, loghi. Una copia resta anche nell\'archivio R2.' }
};
const CAST_TABS = [['personaggi', '👤', 'Personaggi'], ...Object.entries(ELEM_TYPES).map(([k, t]) => [k, t.icon, t.tab])];
const ELEM_PROMPT = {
  oggetto: en => `Professional catalogue photograph of ${en}. One single item, fully visible and centred, plain light-grey seamless studio background, soft even light, sharp focus, true colours and materials, photorealistic. No people, no mannequin, no hands, no text, no watermark.`,
  sfondo: en => `Cinematic establishing photograph of ${en}. Empty location with no people and no animals, natural light coherent with the place and the time of day, realistic materials and depth, 35mm film look, photorealistic, no text, no watermark.`,
  simbolo: (en, txt) => `Original logo design: ${en}. Clean flat vector emblem, bold simple shapes, centred on a plain white background, high contrast, crisp edges, balanced negative space. ${txt ? `The only text is "${txt}", spelled exactly letter by letter, in a clean bold typeface.` : 'No text, no letters.'} No mockup, no photo, no watermark.`
};
const ELEM_NEG = {
  oggetto: 'people, person, hands, mannequin, text, watermark, blurry, cluttered background, deformed',
  sfondo: 'people, person, crowd, animals, text, watermark, blurry, cartoon, cgi',
  simbolo: 'photo, 3d render, mockup, misspelled text, extra letters, watermark, blurry, noise'
};
const sizeFor = r => ({ '1:1': '1328*1328', '4:5': '1184*1480', '3:2': '1584*1056', '16:9': '1664*928', '9:16': '928*1664' })[r] || '1328*1328';
const RATIO_DESC = { '1:1': 'square composition', '4:5': 'vertical 4:5 composition', '3:2': 'horizontal 3:2 composition', '16:9': 'horizontal widescreen 16:9 composition', '9:16': 'vertical 9:16 composition' };

/* traduce in inglese ma lascia intatte le scritte tra virgolette (nomi, slogan, testi dei loghi) */
async function toEnglishKeep(txt) {
  if (!String(txt || '').trim()) return '';
  const q = [];
  const t = txt.replace(/["“«]([^"”»]+)["”»]/g, (m, s) => { q.push(s); return `[[Q${q.length - 1}]]`; });
  let en = await toEnglish(t);
  en = en.trim().replace(/[.\s]+$/, '');
  q.forEach((s, i) => { en = en.split(`[[Q${i}]]`).join(`"${s}"`); if (!en.includes(`"${s}"`)) en += `, with the text "${s}"`; });
  return en;
}
/* link per i modelli: la copia in R2 (piena qualità) se c'è, altrimenti la foto del telefono */
async function elemModelUrl(e) {
  if (e.key && r2On()) { try { return await libUrl(e.key); } catch (err) { } }
  return r2On() ? await toModelUrl(e.img, 'el-' + e.id) : e.img;
}
/* come un elemento viene presentato ai modelli quando entra in un'immagine */
function elemRefText(e, n) {
  const d = e.en || e.desc || '';
  return ({
    oggetto: `Image ${n} shows "${e.name}"${d ? ` (${d})` : ''}, an object or piece of clothing: reproduce it exactly, same design, shape, colours, materials and details.`,
    sfondo: `Image ${n} shows the location "${e.name}": use it as the setting, same architecture, colours and atmosphere, framed as the scene requires.`,
    simbolo: `Image ${n} shows the symbol/logo "${e.name}": reproduce it exactly, same shapes, colours and lettering, wherever it appears.`,
    composizione: `Image ${n} is a reference picture ("${e.name}"): keep the people, clothes and objects it shows exactly the same.`
  })[e.type] || '';
}
async function saveElem(e) {
  await dbPut('elems', e);
  const i = S.elems.findIndex(x => x.id === e.id); if (i < 0) S.elems.unshift(e); else S.elems[i] = e;
  renderCastTabs(); renderRefChars();
  if (window.syncCastToR2) setTimeout(syncCastToR2, 500);
}
async function elemDownloadUrl(e) { if (e.key && r2On()) { try { return await libUrl(e.key); } catch (err) { } } return e.img; }

/* =================== scheda Cast con le sottoschede =================== */
let castTab = ls('castTab') || 'personaggi';
function renderCastTabs() {
  if (!CAST_TABS.some(t => t[0] === castTab)) castTab = 'personaggi';
  const n = k => k === 'personaggi' ? S.chars.length : S.elems.filter(e => e.type === k).length;
  $('#castTabs').innerHTML = CAST_TABS.map(([k, ic, t]) => `<button class="chip ${castTab === k ? 'active' : ''}" data-ct="${k}">${ic} ${t}${n(k) ? ` <i>${n(k)}</i>` : ''}</button>`).join('');
  $$('#castTabs [data-ct]').forEach(b => b.onclick = () => { castTab = b.dataset.ct; ls('castTab', castTab); renderCastTabs(); });
  const isP = castTab === 'personaggi';
  $('#chars').classList.toggle('hidden', !isP); $('#elems').classList.toggle('hidden', isP);
  $('#castIntro').textContent = isP ? 'Le loro foto (e il master 🔒) tengono uguali volto e capelli in Crea e nel Regista. Con 🎨 Componi li vesti, li metti in coppia o in gruppo, li porti in un banner.' : ELEM_TYPES[castTab].intro;
  $('#castNew').classList.toggle('hidden', castTab === 'composizione');
  if (!isP) renderElems();
  if (!$('#mComp').classList.contains('hidden')) renderComp();
}
const renderCast = renderCastTabs;
function renderElems() {
  const list = S.elems.filter(e => e.type === castTab);
  $('#elems').innerHTML = list.length ? list.map(e => `<button class="ch t-${e.type}" data-es="${e.id}"><img src="${e.img}" alt="" loading="lazy">
      <span class="ch-b">${e.ai ? '<i>AI</i>' : ''}${e.key ? '<i>☁︎</i>' : ''}</span>
      <div class="info"><b>${esc(e.name)}</b><small>${esc(e.desc || '')}</small></div></button>`).join('')
    : `<div class="empty">${castTab === 'composizione' ? 'Nessuna composizione.<br>Tocca "🎨 Componi" per mescolare personaggi, oggetti, sfondi e simboli.' : `Nessun ${ELEM_TYPES[castTab].tab.toLowerCase().replace(/i$/, 'o')}.<br>Tocca "+ Nuovo": lo crei con l'AI da una descrizione o carichi una foto.`}</div>`;
  $$('#elems [data-es]').forEach(b => b.onclick = () => openElemSheet(b.dataset.es));
}
$('#castNew').onclick = () => castTab === 'personaggi' ? openM('mChar') : castTab === 'composizione' ? openComp() : openElemNew(castTab);
$('#compOpen').onclick = () => openComp();

/* =================== nuovo elemento =================== */
const EL = { type: 'oggetto', img: null, key: null, ai: false, en: '', onSaved: null, busy: false };
function openElemNew(type = 'oggetto', opts = {}) {
  Object.assign(EL, { type, img: null, key: null, ai: false, en: '', onSaved: opts.onSaved || null, busy: false });
  $('#elName').value = ''; $('#elDesc').value = ''; $('#elText').value = ''; $('#elStatus').textContent = '';
  elRender(); openM('mElem');
}
function elRender() {
  const T = ELEM_TYPES[EL.type];
  $('#elTitle').textContent = T.title;
  $('#elTypes').innerHTML = ['oggetto', 'sfondo', 'simbolo'].map(k => `<button class="${EL.type === k ? 'active' : ''}" data-et="${k}">${ELEM_TYPES[k].icon} ${ELEM_TYPES[k].tab}</button>`).join('');
  $$('#elTypes [data-et]').forEach(b => b.onclick = () => { if (EL.busy) return; EL.type = b.dataset.et; EL.en = ''; elRender(); });
  $('#elName').placeholder = T.name; $('#elDesc').placeholder = T.ph;
  $('#elRatioWrap').classList.toggle('hidden', EL.type !== 'sfondo');
  $('#elTextWrap').classList.toggle('hidden', EL.type !== 'simbolo');
  $('#elPrev').classList.toggle('hidden', !EL.img);
  $('#elPrev').className = `el-prev t-${EL.type}${EL.img ? '' : ' hidden'}`;
  $('#elPrev').innerHTML = EL.img ? `<img src="${EL.img}" alt="">` : '';
  $('#elActs').innerHTML = EL.img
    ? `<button class="btn primary" id="elSave">✓ Salva nel Cast</button>${EL.ai ? '<button class="btn" id="elAI">↻ Altra versione (≈ 0,02 $)</button>' : ''}<label class="btn" for="elFile">📷 Cambia foto</label><input type="file" id="elFile" accept="image/*">`
    : `<button class="btn primary" id="elAI">✨ Crealo con l'AI (≈ 0,02 $)</button><label class="btn" for="elFile">📷 Ho già la foto</label><input type="file" id="elFile" accept="image/*">`;
  const ai = $('#elAI'); if (ai) ai.onclick = elMakeAI;
  const sv = $('#elSave'); if (sv) sv.onclick = elSave;
  $('#elFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { EL.img = await fileToJpeg(f, 1280); EL.key = null; EL.ai = false; elRender(); } catch (err) { toast(err.message); }
  };
}
async function elMakeAI() {
  if (EL.busy) return;
  if (!key()) { toast('Collega prima RunPod'); return openSettings(); }
  const desc = $('#elDesc').value.trim();
  if (!desc) { toast('Descrivilo in poche parole'); return $('#elDesc').focus(); }
  EL.busy = true; const b = $('#elAI'); b.disabled = true; b.textContent = '✨ RunPod disegna…'; $('#elStatus').textContent = '';
  try {
    EL.en = await toEnglishKeep(desc);
    const txt = EL.type === 'simbolo' ? $('#elText').value.trim() : '';
    const size = EL.type === 'sfondo' ? sizeFor($('#elRatio').value) : '1328*1328';
    const url = await rpJob('qwen-image-t2i', { prompt: ELEM_PROMPT[EL.type](EL.en, txt), negative_prompt: ELEM_NEG[EL.type], size, seed: -1, enable_safety_checker: true });
    const s = await storeImage(url, EL.type, $('#elName').value.trim() || EL.type, 1280);
    Object.assign(EL, { img: s.img, key: s.key, ai: true });
    $('#elStatus').textContent = 'Se non ti convince, chiedi un\'altra versione o correggi la descrizione.';
  } catch (e) { $('#elStatus').textContent = 'Non riuscito: ' + e.message; }
  EL.busy = false; elRender();
}
async function elSave() {
  if (!EL.img) return;
  const desc = $('#elDesc').value.trim();
  const name = $('#elName').value.trim() || desc.split(/[,.]/)[0].slice(0, 32) || ELEM_TYPES[EL.type].tab;
  const b = $('#elSave'); b.disabled = true; b.textContent = 'Salvo…';
  if (desc && !EL.en && key()) { try { EL.en = await toEnglishKeep(desc); } catch (e) { } }
  const e = { id: uid(), type: EL.type, name, desc, en: EL.en || desc, text: EL.type === 'simbolo' ? $('#elText').value.trim() : '',
    img: EL.img, key: EL.key, ai: EL.ai, created: Date.now(), ratio: EL.type === 'sfondo' ? $('#elRatio').value : '1:1' };
  await saveElem(e);
  closeM($('#mElem'));
  if (castTab !== e.type && $('#view-personaggi').classList.contains('active') && $('#mComp').classList.contains('hidden')) { castTab = e.type; ls('castTab', castTab); renderCastTabs(); }
  toast(`${e.name} è nel Cast ✓`);
  if (EL.onSaved) EL.onSaved(e);
}

/* =================== scheda dell'elemento =================== */
const ES = { id: null };
const esElem = () => S.elems.find(e => e.id === ES.id);
async function openElemSheet(id) {
  const e = S.elems.find(x => x.id === id); if (!e) return;
  ES.id = id;
  $('#esTitle').textContent = `${ELEM_TYPES[e.type].icon} ${e.name}`;
  $('#esImg').src = e.img; $('#esImg').className = 't-' + e.type;
  $('#esName').value = e.name; $('#esDesc').value = e.desc || ''; $('#esEditTxt').value = '';
  $('#esUndo').disabled = !(e.hist && e.hist.length);
  $('#esToChar').classList.toggle('hidden', !S.chars.length);
  $('#esInfo').textContent = e.comp ? `Creata con 🎨 Componi · ${new Date(e.created).toLocaleDateString('it-IT')}` : '';
  $('#esDl').href = e.img; $('#esDl').setAttribute('download', safeFile(e.name) + '.jpg');
  openM('mElemSheet');
  $('#esDl').href = await elemDownloadUrl(e);
}
$('#esName').onchange = async () => { const e = esElem(); const v = $('#esName').value.trim(); if (!e || !v) return; e.name = v; $('#esTitle').textContent = `${ELEM_TYPES[e.type].icon} ${v}`; await saveElem(e); };
$('#esDesc').onchange = async () => {
  const e = esElem(); if (!e) return; e.desc = $('#esDesc').value.trim(); e.en = e.desc; await saveElem(e);
  if (key() && e.desc) { try { e.en = await toEnglishKeep(e.desc); await saveElem(e); } catch (err) { } }
};
$('#esEdit').onclick = async () => {
  const e = esElem(); if (!e) return;
  if (!key()) { toast('Collega prima RunPod'); return openSettings(); }
  const t = $('#esEditTxt').value.trim(); if (!t) { toast('Scrivi cosa cambiare'); return $('#esEditTxt').focus(); }
  const b = $('#esEdit'); b.disabled = true; $('#esBusy').classList.remove('hidden');
  try {
    const keep = e.type === 'composizione' ? 'Keep every person\'s face, identity, hair, body and clothes exactly the same, and everything else unchanged.' : 'Keep everything else exactly the same.';
    const url = await rpJob('qwen-image-edit', { prompt: (await toEnglishKeep(t)) + ' ' + keep + ' Photorealistic where the image is a photo, correct anatomy, no extra limbs.', image: await elemModelUrl(e), negative_prompt: 'extra people, extra hands, deformed, blurry, changed face', seed: -1, output_format: 'jpeg', enable_safety_checker: true });
    const s = await storeImage(url, e.type, e.name + '-modifica', e.type === 'composizione' ? 1600 : 1280);
    e.hist = [...(e.hist || []), { img: e.img, key: e.key }].slice(-5);
    e.img = s.img; e.key = s.key; await saveElem(e);
    $('#esImg').src = e.img; $('#esUndo').disabled = false; $('#esEditTxt').value = '';
    $('#esDl').href = await elemDownloadUrl(e);
    toast('Fatto ✓ Se non ti piace premi ↶');
  } catch (err) { toast('Modifica non riuscita: ' + err.message, 7000); }
  b.disabled = false; $('#esBusy').classList.add('hidden');
};
$('#esUndo').onclick = async () => {
  const e = esElem(); if (!e || !e.hist || !e.hist.length) return;
  const p = e.hist.pop(); e.img = p.img; e.key = p.key; await saveElem(e);
  $('#esImg').src = e.img; $('#esUndo').disabled = !e.hist.length; $('#esDl').href = await elemDownloadUrl(e);
};
$('#esComp').onclick = () => { const e = esElem(); if (!e) return; closeM($('#mElemSheet')); openComp({ add: { k: 'e', id: e.id } }); };
$('#esStart').onclick = async () => {
  const e = esElem(); if (!e) return;
  S.startImg = await elemDownloadUrl(e); showStart(); closeM($('#mElemSheet')); go('crea');
  toast('Foto di partenza impostata: descrivi cosa succede');
};
$('#esToChar').onclick = () => {
  const e = esElem(); if (!e) return;
  $('#esInfo').innerHTML = `Aggiungi alle foto di: ${S.chars.map(c => `<button class="rc" data-tc="${c.id}"><img src="${c.img}" alt="">${esc(c.name)}</button>`).join(' ')}`;
  $$('#esInfo [data-tc]').forEach(b => b.onclick = async () => {
    const c = S.chars.find(x => x.id === b.dataset.tc); if (!c) return;
    charPhotos(c).push({ id: uid(), img: e.img, key: e.key || undefined, kind: 'altro' });
    await saveChar(c);
    $('#esInfo').textContent = `Aggiunta alle foto di ${c.name} (tipo "Altro": puoi cambiarlo nella sua scheda).${c.master ? ' Il master 🔒 non cambia.' : ''}`;
  });
};
$('#esDel').onclick = async () => {
  const e = esElem(); if (!e || !confirm(`Eliminare "${e.name}" dal Cast?${e.key ? ' La copia nell\'archivio R2 resta (Galleria → Archivio).' : ''}`)) return;
  await dbDel('elems', e.id); S.elems = S.elems.filter(x => x.id !== e.id); S.selElems.delete(e.id);
  CP.sel = CP.sel.filter(x => !(x.k === 'e' && x.id === e.id)); if (CP.result && CP.result.id === e.id) CP.result = null;
  closeM($('#mElemSheet')); renderCastTabs(); renderRefChars();
};

/* =================== 🎨 COMPONI =================== */
const COMP_MODES = [
  ['foto', '📸 Foto o scena', 'Es. Elena seduta sul muretto davanti al faro, guarda il mare, luce del tramonto', '3:2'],
  ['gruppo', '👥 Coppia o gruppo', 'Es. Elena e Marco abbracciati, sorridono in camera, mezza figura', '4:5'],
  ['costume', '👕 Prova costume', 'Es. Elena indossa il giubbotto di pelle, in piedi, figura intera', '4:5'],
  ['banner', '📣 Banner', 'Es. Elena tiene in mano la tazza, a destra spazio libero per il titolo', '16:9'],
  ['logo', '✳️ Logo o simbolo', 'Es. il ciak stilizzato dentro un cerchio, stile minimal oro su nero', '1:1']
];
const COMP_STYLE = {
  foto: 'Photorealistic cinematic photograph, natural light, 50mm lens, natural skin texture, correct anatomy.',
  gruppo: 'Photorealistic photograph of the people together, natural interaction and body contact only where described; every person appears exactly ONCE, clearly distinct, faces not merged, each face fully visible; correct anatomy with two arms and two hands each, relaxed natural hands.',
  costume: 'Photorealistic fashion photograph: the person wears the clothing and accessories shown in the object references, with exactly the same design, colours, materials and details, correct fit and natural folds; full body visible from head to feet.',
  banner: 'Professional advertising banner: high-end commercial photography combined with a clean graphic layout, strong focal point, generous clear space for the headline, balanced composition.',
  logo: 'Original logo / symbol design: clean flat vector style, bold simple shapes, plain background, high contrast, crisp edges, no mockup, no photo.'
};
const COMP_RATIOS = [['1:1', '1:1'], ['4:5', '4:5 post'], ['3:2', '3:2 foto'], ['16:9', '16:9 banner'], ['9:16', '9:16 storia']];
const COMP_ENG = { fedele: { label: 'Fedele · Nano Banana 2', ep: 'google-nano-banana-2-edit' }, eco: { label: 'Economico · Seedream', ep: 'seedream-v4-edit' } };
const COMP_MAX = 6;
const CP = { mode: 'foto', sel: [], desc: '', text: '', fix: '', ratio: '3:2', eng: 'fedele', hd: false, pick: null, busy: false, result: null };

function compItems() {
  return CP.sel.map(s => {
    const obj = s.k === 'c' ? S.chars.find(c => c.id === s.id) : S.elems.find(e => e.id === s.id);
    return obj ? { ...s, obj, name: obj.name, img: s.k === 'c' && obj.master ? obj.master.img : obj.img, icon: s.k === 'c' ? '👤' : ELEM_TYPES[obj.type].icon } : null;
  }).filter(Boolean);
}
function compPrice() {
  if (!compItems().length) return 0.02;
  return CP.eng === 'eco' ? 0.03 : CP.hd ? 0.13 : 0.0875;
}
function openComp(opts = {}) {
  if (opts.add && !CP.sel.some(x => x.k === opts.add.k && x.id === opts.add.id)) {
    if (CP.sel.length >= COMP_MAX) toast(`Al massimo ${COMP_MAX} elementi`); else CP.sel.push(opts.add);
  }
  CP.pick = null; renderComp(); openM('mComp');
}
function compRead() {
  const d = $('#cpDesc'), t = $('#cpText'), f = $('#cpFixTxt');
  if (d) CP.desc = d.value; if (t) CP.text = t.value; if (f) CP.fix = f.value;
}
function renderComp() {
  compRead();
  const items = compItems(), M = COMP_MODES.find(m => m[0] === CP.mode) || COMP_MODES[0];
  const hasText = CP.mode === 'banner' || CP.mode === 'logo';
  const pickTabs = CAST_TABS.filter(([k]) => k === 'personaggi' ? S.chars.length : S.elems.some(e => e.type === k) || k !== 'composizione');
  let picker = '';
  if (CP.pick) {
    const list = CP.pick === 'personaggi' ? S.chars.map(c => ({ k: 'c', id: c.id, name: c.name, img: c.master ? c.master.img : c.img }))
      : S.elems.filter(e => e.type === CP.pick).map(e => ({ k: 'e', id: e.id, name: e.name, img: e.img }));
    picker = `<div class="cp-pick">
      <div class="chipset">${pickTabs.map(([k, ic, t]) => `<button class="chip ${CP.pick === k ? 'on' : ''}" data-pt="${k}">${ic} ${t}</button>`).join('')}</div>
      <div class="cp-grid">${list.map(x => `<button class="cp-pi ${CP.sel.some(s => s.k === x.k && s.id === x.id) ? 'on' : ''} t-${CP.pick}" data-pk="${x.k}" data-pid="${x.id}"><img src="${x.img}" alt=""><small>${esc(x.name)}</small></button>`).join('')}
        ${CP.pick !== 'composizione' ? `<button class="cp-pi cp-new" data-pnew="${CP.pick}"><span>＋</span><small>${CP.pick === 'personaggi' ? 'Nuovo personaggio' : 'Crea nuovo'}</small></button>` : ''}</div>
      <button class="btn small" id="cpPickDone">Fatto</button></div>`;
  }
  const r = CP.result;
  $('#cpBody').innerHTML = `
    <div class="cp-step"><b>1 · Cosa vuoi creare</b><div class="chipset">${COMP_MODES.map(m => `<button class="chip ${CP.mode === m[0] ? 'on' : ''}" data-cm="${m[0]}">${m[1]}</button>`).join('')}</div></div>
    <div class="cp-step"><b>2 · Elementi</b><small class="muted">Fino a ${COMP_MAX}. Con 1–3 la fedeltà è massima.${items.some(i => i.k === 'c' && i.obj.master) ? ' Per i personaggi con master 🔒 uso il master.' : ''}</small>
      <div class="cp-sel">${items.map((it, k) => `<div class="cp-it t-${it.k === 'c' ? 'personaggi' : it.obj.type}"><img src="${it.img}" alt=""><button class="cp-x" data-rm="${k}" aria-label="Togli">✕</button><small>${it.icon} ${esc(it.name)}</small></div>`).join('')}
        ${items.length < COMP_MAX ? '<button class="cp-it cp-add" id="cpAdd"><span>＋</span><small>Aggiungi</small></button>' : ''}</div>
      ${picker}</div>
    <div class="cp-step"><b>3 · Descrivi l'immagine</b>
      <textarea id="cpDesc" rows="3" placeholder="${esc(M[2])}">${esc(CP.desc)}</textarea>
      ${items.length ? `<small class="muted">Chiamali per nome: ${items.map(i => esc(i.name)).join(', ')}.</small>` : '<small class="muted">Senza elementi l\'immagine nasce solo dalla descrizione (≈ 0,02 $).</small>'}
      ${hasText ? `<label>Testo da scrivere, esatto (facoltativo)<input id="cpText" type="text" value="${esc(CP.text)}" placeholder="${CP.mode === 'banner' ? 'Es. SALDI DI FINE ESTATE −30%' : 'Es. CIAK SI GIRA'}"></label>` : ''}</div>
    <div class="cp-step"><b>4 · Formato e qualità</b>
      <div class="chipset">${COMP_RATIOS.map(([v, t]) => `<button class="chip ${CP.ratio === v ? 'on' : ''}" data-cr="${v}">${t}</button>`).join('')}</div>
      ${items.length ? `<div class="chipset">${Object.entries(COMP_ENG).map(([k, e]) => `<button class="chip ${CP.eng === k ? 'on' : ''}" data-ce="${k}">${e.label} · ${money(k === 'eco' ? 0.03 : CP.hd ? 0.13 : 0.0875)}</button>`).join('')}</div>
        ${CP.eng === 'fedele' ? `<label class="check"><input type="checkbox" id="cpHd" ${CP.hd ? 'checked' : ''}> Alta definizione 2K, per stampa e banner grandi (≈ 0,13 $)</label>` : ''}
        <small class="muted">${CP.eng === 'fedele' ? 'Volti e scritte più fedeli.' : 'Costa meno; volti e scritte un po\' meno precisi.'}</small>` : ''}</div>
    <div class="cp-go"><div class="cost"><span>Costo stimato</span><b>${money(compPrice())}</b></div>
      <button class="btn primary big" id="cpGo" ${CP.busy ? 'disabled' : ''}>${CP.busy ? '🎨 RunPod crea…' : r ? '↻ Crea di nuovo' : '🎨 Crea l\'immagine'}</button></div>
    ${r ? `<div class="cp-res" id="cpRes"><div class="pe-wrap"><img src="${r.img}" alt="">${CP.busy ? '<div class="pe-busy"><span>RunPod crea…</span></div>' : ''}</div>
      <p class="muted small">Salvata in 🖼 Composizioni${r.key ? ' e nell\'archivio R2' : ''}.</p>
      <div class="es-edit"><input id="cpFixTxt" type="text" value="${esc(CP.fix)}" placeholder="Correggi: es. togli la mano dalla spalla, scritta più grande"><button class="btn" id="cpFix" ${CP.busy ? 'disabled' : ''}>✏️ Correggi · ${money(compPrice())}</button></div>
      <div class="actions"><button class="btn" id="cpOpenRes">Apri: usa, ritocca, aggiungi a un personaggio</button><a class="btn" id="cpDl" target="_blank" rel="noopener" href="${r.img}" download="${safeFile(r.name)}.jpg">⬇ Scarica</a></div></div>` : ''}`;
  $$('#cpBody [data-cm]').forEach(b => b.onclick = () => { const m = COMP_MODES.find(x => x[0] === b.dataset.cm); CP.mode = m[0]; CP.ratio = m[3]; renderComp(); });
  $$('#cpBody [data-rm]').forEach(b => b.onclick = () => { const it = compItems()[+b.dataset.rm]; CP.sel = CP.sel.filter(s => !(s.k === it.k && s.id === it.id)); renderComp(); });
  const add = $('#cpAdd'); if (add) add.onclick = () => { CP.pick = CP.pick ? null : (S.chars.length ? 'personaggi' : 'oggetto'); renderComp(); };
  $$('#cpBody [data-pt]').forEach(b => b.onclick = () => { CP.pick = b.dataset.pt; renderComp(); });
  $$('#cpBody [data-pid]').forEach(b => b.onclick = () => {
    const k = b.dataset.pk, id = b.dataset.pid, i = CP.sel.findIndex(s => s.k === k && s.id === id);
    if (i >= 0) CP.sel.splice(i, 1); else if (CP.sel.length >= COMP_MAX) return toast(`Al massimo ${COMP_MAX} elementi`); else CP.sel.push({ k, id });
    renderComp();
  });
  $$('#cpBody [data-pnew]').forEach(b => b.onclick = () => {
    if (b.dataset.pnew === 'personaggi') return openM('mChar');
    openElemNew(b.dataset.pnew, { onSaved: e => { if (CP.sel.length < COMP_MAX) CP.sel.push({ k: 'e', id: e.id }); renderComp(); } });
  });
  const pd = $('#cpPickDone'); if (pd) pd.onclick = () => { CP.pick = null; renderComp(); };
  $$('#cpBody [data-cr]').forEach(b => b.onclick = () => { CP.ratio = b.dataset.cr; renderComp(); });
  $$('#cpBody [data-ce]').forEach(b => b.onclick = () => { CP.eng = b.dataset.ce; renderComp(); });
  const hd = $('#cpHd'); if (hd) hd.onchange = () => { CP.hd = hd.checked; renderComp(); };
  $('#cpDesc').oninput = () => { CP.desc = $('#cpDesc').value; };
  const tx = $('#cpText'); if (tx) tx.oninput = () => { CP.text = tx.value; };
  $('#cpGo').onclick = () => compGenerate(false);
  const fx = $('#cpFix'); if (fx) fx.onclick = () => compGenerate(true);
  const ft = $('#cpFixTxt'); if (ft) ft.oninput = () => { CP.fix = ft.value; };
  const op = $('#cpOpenRes'); if (op) op.onclick = () => { closeM($('#mComp')); openElemSheet(r.id); };
  if (r) elemDownloadUrl(r).then(u => { const a = $('#cpDl'); if (a) a.href = u; });
}

/* immagine di ogni elemento per il modello: master del personaggio se bloccato; per la prova costume la figura intera */
async function compImgUrl(it) {
  if (it.k === 'e') return await elemModelUrl(it.obj);
  const c = it.obj;
  if (c.master) { if (c.master.key && r2On()) { try { return await libUrl(c.master.key); } catch (e) { } } return r2On() ? await toModelUrl(c.master.img, 'master-' + c.id) : c.master.img; }
  const ph = charPhotos(c), p = (CP.mode === 'costume' && ph.find(x => x.kind === 'figura')) || ph[0];
  if (p.key && r2On()) { try { return await libUrl(p.key); } catch (e) { } }
  return r2On() ? await toModelUrl(p.img, 'cast-' + c.id + '-' + p.id) : p.img;
}
function compRefLine(it, n) {
  if (it.k === 'e') return elemRefText(it.obj, n);
  const c = it.obj;
  return c.master ? `Image ${n} is the locked reference sheet of ${c.name} (the same person shown in three views: draw ${c.name} only ONCE).`
    : `Image ${n} shows ${c.name}, a real person.`;
}
function compPrompt(items, descEn, base) {
  const off = base ? 1 : 0;
  const refs = items.map((it, k) => compRefLine(it, k + 1 + off)).join(' ');
  const people = items.filter(i => i.k === 'c');
  const hasSym = items.some(i => i.k === 'e' && i.obj.type === 'simbolo');
  const txt = CP.text.trim();
  const ident = people.length ? `Keep each person EXACTLY as in their reference: same face and facial features, same hair colour, length and hairstyle, same age and body proportions; each person appears only once. Nobody else in the image unless the scene asks for it.` : '';
  const textRule = txt ? `The only text in the image is "${txt}", spelled exactly letter by letter, large and perfectly legible${CP.mode === 'banner' ? ', placed in the clear space' : ''}.`
    : hasSym ? 'No other text, no watermark.' : 'No text, no watermark, no logos.';
  return `${refs ? 'REFERENCES: ' + refs + ' ' : ''}${ident} SCENE: ${descEn}. ${COMP_STYLE[CP.mode]} ${textRule} ${RATIO_DESC[CP.ratio] || ''}.`.replace(/\s+/g, ' ').trim();
}
async function compGenerate(fix) {
  compRead();
  if (CP.busy) return;
  if (!key()) { toast('Collega prima RunPod'); return openSettings(); }
  const items = compItems();
  if (fix && !CP.fix.trim()) { toast('Scrivi cosa correggere'); return $('#cpFixTxt').focus(); }
  if (!fix && !CP.desc.trim()) { toast('Descrivi l\'immagine'); return $('#cpDesc').focus(); }
  if (!fix && (CP.mode === 'gruppo') && items.filter(i => i.k === 'c').length < 2) { toast('Per una coppia o un gruppo scegli almeno 2 personaggi'); return; }
  if (!fix && CP.mode === 'costume' && (!items.some(i => i.k === 'c') || !items.some(i => i.k === 'e' && i.obj.type === 'oggetto'))) { toast('Per la prova costume scegli un personaggio e almeno un oggetto o vestito'); return; }
  CP.busy = true; renderComp();
  try {
    const descEn = await toEnglishKeep(CP.desc);
    const imgs = []; for (const it of items) imgs.push(await compImgUrl(it));
    let url, prompt;
    if (fix) {
      const fixEn = await toEnglishKeep(CP.fix);
      const base = await elemModelUrl(CP.result);
      prompt = `Edit image 1, the current picture: ${fixEn}. Keep everything else exactly the same: same people, faces, hair, clothes, objects, background, framing and text.` + (items.length ? ' ' + compPrompt(items, descEn, true).replace(/SCENE:.*$/, '') : '');
      if (!items.length) url = await rpJob('qwen-image-edit', { prompt, image: base, negative_prompt: 'deformed, blurry, extra limbs', seed: -1, output_format: 'jpeg', enable_safety_checker: true });
      else if (CP.eng === 'eco') url = await rpJob('seedream-v4-edit', { prompt, images: [base, ...imgs], size: sizeFor(CP.ratio), enable_safety_checker: true });
      else url = await rpJob('google-nano-banana-2-edit', { prompt, images: [base, ...imgs], resolution: CP.hd ? '2k' : '1k', aspect_ratio: CP.ratio, output_format: 'jpeg' });
    } else {
      prompt = compPrompt(items, descEn, false);
      if (!items.length) url = await rpJob('qwen-image-t2i', { prompt, negative_prompt: 'deformed, extra limbs, extra fingers, misspelled text, watermark, blurry', size: sizeFor(CP.ratio), seed: -1, enable_safety_checker: true });
      else if (CP.eng === 'eco') url = await rpJob('seedream-v4-edit', { prompt, images: imgs, size: sizeFor(CP.ratio), enable_safety_checker: true });
      else url = await rpJob('google-nano-banana-2-edit', { prompt, images: imgs, resolution: CP.hd ? '2k' : '1k', aspect_ratio: CP.ratio, output_format: 'jpeg' });
    }
    const M = COMP_MODES.find(m => m[0] === CP.mode);
    const name = (items.length ? items.map(i => i.name).join(' + ') : CP.desc.split(/[,.]/)[0]).slice(0, 40) || M[1].replace(/^\S+\s/, '');
    const s = await storeImage(url, 'composizione', name, 1600);
    const e = { id: uid(), type: 'composizione', name, desc: CP.desc.trim() + (fix ? ' · ' + CP.fix.trim() : ''), en: descEn, img: s.img, key: s.key, ai: true, created: Date.now(), ratio: CP.ratio,
      comp: { mode: CP.mode, sel: CP.sel.map(x => ({ ...x })), text: CP.text, eng: items.length ? CP.eng : 'testo', prompt } };
    await saveElem(e);
    CP.result = e; if (fix) CP.fix = '';
    toast('Immagine pronta ✓ Salvata in Composizioni');
  } catch (err) { toast('Non riuscita: ' + err.message, 8000); }
  CP.busy = false; renderComp();
  const res = $('#cpRes'); if (res) res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

renderCastTabs();
