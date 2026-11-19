/* Ciak si gira — SERIE DRAMA (micro-drama verticali stile ReelShort)
   Analisi del formato: episodi brevi 9:16, gancio nei primi 3 secondi, ogni episodio chiude su un cliffhanger
   che apre un problema NUOVO, i primi episodi gratis e la svolta più forte proprio prima del "muro" a pagamento,
   tropi riconoscibili, dialoghi corti e carichi, primi piani e reazioni.
   Il motore: 1) la serie (bibbia + scaletta di tutti gli episodi, ≈ 0,05 $)
              2) ogni episodio diventa un progetto del Regista con la STESSA bibbia (personaggi, luoghi, look)
                 e le regole del drama: storyboard → approva → gira, come per i film. */
'use strict';

const DR = { mode: ls('rgMode') || 'film', cur: null, draft: null, busy: null };
const TROPES = [
  ['vendetta', 'Vendetta'], ['segreto', 'Identità segreta'], ['erede', 'Erede nascosto'], ['matrimonio', 'Matrimonio per contratto'],
  ['nemici', 'Da nemici ad amanti'], ['rinascita', 'Seconda possibilità'], ['tradimento', 'Tradimento'], ['famiglia', 'Segreti di famiglia'],
  ['mistero', 'Mistero / thriller'], ['riscatto', 'Dal niente al successo']
];
const TROPE_EN = { vendetta: 'revenge', segreto: 'hidden identity', erede: 'hidden heir', matrimonio: 'contract marriage', nemici: 'enemies to lovers', rinascita: 'second chance / reborn to set things right', tradimento: 'betrayal', famiglia: 'family secrets', mistero: 'mystery thriller', riscatto: 'rags to riches' };
const EP_COUNTS = [6, 8, 10, 12, 16, 20], EP_LENS = [[45, '45 s'], [60, '60 s'], [90, '90 s']];

function drList() { try { return JSON.parse(ls('drama') || '[]'); } catch (e) { return []; } }
function drSaveAll(l) { ls('drama', JSON.stringify(l)); }
function drFind(id) { return drList().find(s => s.id === id) || null; }
function drSave(s) { const l = drList(); const i = l.findIndex(x => x.id === s.id); if (i < 0) l.unshift(s); else l[i] = s; drSaveAll(l); }
function drMut(id, fn) { const l = drList(); const s = l.find(x => x.id === id); if (!s) return null; fn(s); drSaveAll(l); return s; }
function drNew() {
  return { id: uid(), created: Date.now(), idea: '', tropes: [], nEp: 10, epLen: 60, free: 3, nChars: 0, castSel: [], engine: 'wan', kfEngine: 'fedele', budgetEp: 0, bible: null, episodes: [] };
}
const drWall = s => Math.min(s.free, s.nEp - 1);

/* =================== modo Film / Serie nella scheda Regista =================== */
function setRgMode(m) {
  DR.mode = m; ls('rgMode', m);
  $$('#rgMode [data-m]').forEach(b => b.classList.toggle('active', b.dataset.m === m));
  $('#rgProjects').classList.toggle('hidden', m !== 'film'); $('#rgNew').classList.toggle('hidden', m !== 'film');
  $('#drSeries').classList.toggle('hidden', m !== 'serie'); $('#drNew').classList.toggle('hidden', m !== 'serie');
  $('#rgHead').textContent = m === 'serie' ? 'Serie drama' : 'Regista AI';
  m === 'serie' ? renderDrama() : renderRegia();
}
$$('#rgMode [data-m]').forEach(b => b.onclick = () => setRgMode(b.dataset.m));
$('#drNew').onclick = () => { DR.draft = drNew(); DR.cur = '__draft'; renderDrama(); const n = $('#drN'); if (n) n.focus(); };
$('#drSeries').onchange = () => { DR.cur = $('#drSeries').value; renderDrama(); };

/* =================== schermata della serie =================== */
function drEpProj(ep) { return ep.projId ? rgList().find(p => p.id === ep.projId) : null; }
function drEpState(ep) {
  const p = drEpProj(ep); if (!p) return { t: 'Da scrivere', cls: 'todo', ok: 0, tot: 0 };
  const shots = p.parts.flatMap(pt => pt.shots), ok = shots.filter(sh => shotState(sh, p).st === 'ok').length;
  if (!shots.length) return { t: 'Inquadrature da rifare', cls: 'err', ok, tot: 0, p };
  return { t: ok === shots.length ? 'Tutti i ciak pronti' : ok ? `${ok}/${shots.length} ciak girati` : `${shots.length} inquadrature scritte`, cls: ok === shots.length ? 'ok' : 'wip', ok, tot: shots.length, p };
}
function renderDrama() {
  const list = drList();
  if (DR.cur !== '__draft' && !list.some(s => s.id === DR.cur)) DR.cur = list[0] ? list[0].id : '__draft';
  const opts = list.map(s => `<option value="${s.id}">${esc((s.bible && s.bible.title) || (s.idea || 'Serie').slice(0, 30))}</option>`);
  if (DR.cur === '__draft') opts.unshift('<option value="__draft">Nuova serie</option>');
  $('#drSeries').innerHTML = opts.join(''); $('#drSeries').value = DR.cur; $('#drSeries').classList.toggle('hidden', opts.length < 2 || DR.mode !== 'serie');
  const s = DR.cur === '__draft' ? (DR.draft = DR.draft || drNew()) : drFind(DR.cur);
  const B = s.bible, box = $('#rgBody');
  box.className = B ? 'rg-grid' : '';
  const castChips = S.chars.length ? `<div class="rg-castsel"><span>Dal Cast (facoltativo)</span><div class="chipset">${S.chars.map(c => `<button class="chip cc ${(s.castSel || []).includes(c.id) ? 'on' : ''}" data-dsel="${c.id}"><img src="${c.img}" alt="">${esc(c.name)}</button>`).join('')}</div></div>` : '<p class="muted small">Il Cast è vuoto: i personaggi li inventa la serie e poi li crei con l\'intervista.</p>';
  const left = `<div class="rg-left">
  <div class="rg-card">
    <div class="rg-step"><b>1</b><span>La serie</span></div>
    <p class="muted small">Episodi verticali 9:16 come su ReelShort: gancio nei primi 3 secondi, ogni episodio finisce con un colpo di scena, la svolta più forte arriva alla fine dell'ultimo episodio gratis.</p>
    <div class="rg-who first">
      <label>Quanti personaggi <b class="req">*</b><select id="drN" class="${s.nChars ? '' : 'need'}"><option value="0" ${s.nChars ? '' : 'selected'} disabled>Scegli…</option>${[1, 2, 3, 4].map(v => `<option value="${v}" ${s.nChars == v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      ${castChips}
    </div>
    <label class="nolabel"><textarea id="drIdea" rows="4" placeholder="L'idea in poche righe. Es. Una cameriera scopre che il cliente scorbutico che serve ogni mattina è il padre che l'ha abbandonata, ora proprietario dell'hotel.">${esc(s.idea)}</textarea></label>
    <div class="dr-tropes"><span class="muted small">Motore della storia (fino a 2)</span><div class="chipset">${TROPES.map(([k, t]) => `<button class="chip ${s.tropes.includes(k) ? 'on' : ''}" data-tr="${k}">${t}</button>`).join('')}</div></div>
    <div class="rg-opts">
      <label>Episodi<select id="drNep">${EP_COUNTS.map(v => `<option ${s.nEp == v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Durata episodio<select id="drLen">${EP_LENS.map(([v, t]) => `<option value="${v}" ${s.epLen == v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Episodi gratis<select id="drFree">${[1, 2, 3, 4, 5].map(v => `<option ${s.free == v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Modello video<select id="drEngine">${RG_MODELS.map(k => `<option value="${k}" ${s.engine === k ? 'selected' : ''}>${MODELS[k].name}</option>`).join('')}</select></label>
    </div>
    <label class="rg-budget">Fotogrammi con i personaggi<select id="drKf">${Object.entries(KF_ENGINES).map(([k, v]) => `<option value="${k}" ${(s.kfEngine || 'fedele') === k ? 'selected' : ''}>${v.label} · ≈ ${money(v.price)}</option>`).join('')}</select></label>
    <label class="rg-budget">Budget massimo per episodio ($) <input id="drBudget" type="number" min="0" step="1" inputmode="decimal" placeholder="nessun limite" value="${s.budgetEp || ''}"></label>
    <p class="muted small" id="drEst">${drEstimate(s)}</p>
    <button class="btn primary big ${s.nChars ? '' : 'off'}" id="drWrite">${B ? '↻ Riscrivi la serie da capo' : '📺 Scrivi la serie'} <small>≈ 0,05 $</small></button>
    ${DR.cur !== '__draft' ? '<button class="linkbtn" id="drDel">Elimina questa serie</button>' : ''}
  </div>
  <div id="rgThink"></div>
  ${B ? drCharsHtml(s) : ''}</div>`;
  const right = B ? `<div class="rg-right">${drEpisodesHtml(s)}</div>` : '';
  box.innerHTML = left + right;
  drWire(s);
  rgThinkRender();
}
function drEstimate(s) {
  const per = drEpCost(s);
  return `Stima per ${s.nEp} episodi da ${s.epLen} s con ${MODELS[s.engine].name}: ≈ ${money(per)} a episodio, ≈ ${money(per * s.nEp)} la serie intera. Scrivere la serie costa ≈ 0,05 $; ogni episodio lo giri e lo paghi solo quando vuoi.`;
}
function drEpCost(s) {
  const n = Math.ceil(s.epLen / 5), m = MODELS[s.engine];
  let vid = 0; try { vid = m.price({ duration: 5, res: '480p', ex: {}, refDuration: 5 }); } catch (e) { vid = 0.25; }
  const kf = KF_ENGINES[s.kfEngine || 'fedele'].price;
  return n * (vid + kf) + n * 0.5 * 0.01 + Math.round(n * 0.35) * 0.25; // ciak + fotogrammi + voci + labiale per chi parla in camera
}
function drCharsHtml(s) {
  const B = s.bible;
  return `<div class="rg-card">
    <div class="rg-step"><b>2</b><span>${esc(B.title || 'La serie')}</span></div>
    <p class="rg-log">${esc(B.logline || '')}</p>
    <details class="adv"><summary>Premessa e regole della serie</summary><p class="small">${esc(B.premise || '')}</p>${B.tropes ? `<p class="muted small">Tropi: ${esc([].concat(B.tropes).join(', '))}</p>` : ''}</details>
    <div class="rg-chars">${(B.characters || []).map((c, i) => {
      const cast = c.castId && S.chars.find(x => x.id === c.castId);
      return `<div class="rg-char">
        <div class="rg-face">${cast ? `<img src="${cast.img}" alt="">` : '<span>?</span>'}</div>
        <div class="rg-ci"><b>${esc(c.name)}${cast && cast.master ? ' <i class="mtag">🔒 master</i>' : ''}</b><small>${esc(c.role || '')}${c.want ? ' · vuole: ' + esc(c.want) : ''}</small>
          ${!cast ? '<em class="warn-inv">⚠ non collegato: in ogni episodio il volto cambierebbe</em>' : ''}
          <select data-dcast="${i}"><option value="">${cast ? '— scollega —' : 'Scegli dal Cast…'}</option>${S.chars.map(x => `<option value="${x.id}" ${c.castId === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
          <select data-dvoice="${i}" aria-label="Voce">${voiceOptions(c.voiceId)}</select>
          <div class="rg-cb">${cast ? `<button class="btn small" data-rpe="${cast.id}">📷 Scheda</button>` : `<button class="btn small" data-daic="${i}">🎨 Crea con AI</button>`}<button class="btn small" data-dvtest="${i}">🔊 Prova voce</button></div>
        </div></div>`;
    }).join('')}</div>
    <p class="muted small">Collega qui i personaggi: valgono per tutti gli episodi, già scritti e futuri.</p>
  </div>`;
}
function drEpisodesHtml(s) {
  const wall = drWall(s);
  const eps = s.episodes.map((ep, i) => {
    const st = drEpState(ep), paid = ep.n > s.free;
    return `<div class="dr-ep ${paid ? 'paid' : ''}" data-ep="${i}">
      <div class="dr-eph"><span class="dr-n">EP ${String(ep.n).padStart(2, '0')}</span><b>${esc(ep.title || '')}</b>
        <span class="dr-tag ${paid ? 't-lock' : 't-free'}">${paid ? '🔒 a pagamento' : 'gratis'}</span>${ep.n === wall ? '<span class="dr-tag t-wall">⚡ svolta del muro</span>' : ''}</div>
      <p class="dr-hook"><i>Gancio</i> ${esc(ep.hook || '')}</p>
      <p class="small">${esc(ep.summary || '')}</p>
      <p class="dr-cliff"><i>Colpo di scena</i> ${esc(ep.cliffhanger || '')}</p>
      <div class="dr-epf"><span class="dr-st ${st.cls}">${st.t}</span>
        ${st.p ? `<button class="btn small primary" data-dopen="${i}">🎬 Apri nel Regista</button><button class="btn small" data-dre="${i}">↻ Riscrivi</button>`
          : `<button class="btn small primary" data-dwrite="${i}" ${DR.busy ? 'disabled' : ''}>✍️ Scrivi le inquadrature <small>≈ 0,04 $</small></button>`}</div>
    </div>`;
  }).join('');
  const done = s.episodes.filter(ep => drEpState(ep).cls === 'ok').length;
  return `<div class="rg-card">
    <div class="rg-step"><b>3</b><span>Gli episodi</span></div>
    <p class="muted small">Scrivi le inquadrature di un episodio alla volta: diventa un progetto del Regista (9:16, stessi personaggi e luoghi). Lì fai storyboard, approvi e giri, come per i film.</p>
    ${eps}
    <div class="actions"><button class="btn" id="drAllEp" ${DR.busy ? 'disabled' : ''}>✍️ Scrivi tutti quelli mancanti <small>≈ ${money(s.episodes.filter(e => !drEpProj(e)).length * 0.04)}</small></button></div>
  </div>
  <div class="rg-bar"><span><b>${done}/${s.episodes.length}</b> episodi con tutti i ciak · per girare tutto ≈ ${money(drEpCost(s) * s.episodes.filter(e => drEpState(e).cls !== 'ok').length)}</span></div>`;
}
function drWire(s) {
  const persist = () => { if (drList().some(x => x.id === s.id)) drSave(s); };
  const upd = () => {
    s.idea = $('#drIdea').value; s.nEp = +$('#drNep').value; s.epLen = +$('#drLen').value; s.free = +$('#drFree').value;
    s.engine = $('#drEngine').value; s.kfEngine = $('#drKf').value; s.budgetEp = +$('#drBudget').value || 0;
    if (s.free >= s.nEp) { s.free = s.nEp - 1; $('#drFree').value = String(s.free); }
    $('#drEst').textContent = drEstimate(s); persist();
  };
  ['#drIdea', '#drNep', '#drLen', '#drFree', '#drEngine', '#drKf', '#drBudget'].forEach(q => $(q).addEventListener('change', upd));
  $('#drIdea').addEventListener('input', () => { s.idea = $('#drIdea').value; persist(); });
  $('#drN').onchange = () => {
    s.nChars = +$('#drN').value;
    if (s.castSel.length > s.nChars) { s.castSel = s.castSel.slice(0, s.nChars); toast(`Tengo solo ${s.nChars} dal Cast`); }
    persist(); renderDrama();
  };
  $$('[data-dsel]').forEach(b => b.onclick = () => {
    const id = b.dataset.dsel;
    s.castSel = s.castSel.includes(id) ? s.castSel.filter(x => x !== id) : [...s.castSel, id];
    if (s.castSel.length > (s.nChars || 0)) s.nChars = Math.min(4, s.castSel.length);
    upd(); renderDrama();
  });
  $$('[data-tr]').forEach(b => b.onclick = () => {
    const k = b.dataset.tr;
    s.tropes = s.tropes.includes(k) ? s.tropes.filter(x => x !== k) : [...s.tropes, k].slice(-2);
    persist(); $$('[data-tr]').forEach(x => x.classList.toggle('on', s.tropes.includes(x.dataset.tr)));
  });
  $('#drWrite').onclick = () => { upd(); drWriteSeries(s); };
  const del = $('#drDel'); if (del) del.onclick = () => {
    if (!confirm('Eliminare questa serie? I progetti degli episodi restano nel Regista e i ciak in Galleria.')) return;
    drSaveAll(drList().filter(x => x.id !== s.id)); DR.cur = null; renderDrama();
  };
  if (!s.bible) return;
  $$('[data-dcast]').forEach(sel => sel.onchange = () => {
    const i = +sel.dataset.dcast, c = s.bible.characters[i], m = S.chars.find(x => x.id === sel.value);
    c.castId = m ? m.id : null;
    if (m) { if (m.voiceId) c.voiceId = m.voiceId; c.look_en = m.master ? 'as in the master reference' + (m.master.traits_en ? ' (' + m.master.traits_en + ')' : '') : 'as in the reference photos' + (charLookEn(m) ? ' (' + charLookEn(m) + ')' : ''); }
    else c.look_en = c.look_orig || c.look_en;
    drSave(s); drSyncChars(s); renderDrama();
  });
  $$('[data-dvoice]').forEach(sel => sel.onchange = () => { s.bible.characters[+sel.dataset.dvoice].voiceId = sel.value; drSave(s); drSyncChars(s); });
  $$('[data-dvtest]').forEach(b => b.onclick = () => rgVoiceTest({ id: s.id, bible: s.bible, parts: [] }, +b.dataset.dvtest, b));
  $$('#rgBody [data-rpe]').forEach(b => b.onclick = () => openCharSheet(b.dataset.rpe));
  $$('[data-daic]').forEach(b => b.onclick = () => {
    const i = +b.dataset.daic, c = s.bible.characters[i];
    openCharAI({ name: c.name, idea: [c.role, c.voice ? 'voce ' + c.voice : '', c.look_en].filter(Boolean).join('. '), context: `${s.bible.title || ''}: ${s.bible.premise || ''}`,
      onSaved: ch => { drMut(s.id, x => { const cc = x.bible.characters[i]; cc.castId = ch.id; if (ch.voiceId) cc.voiceId = ch.voiceId; cc.look_en = 'as in the reference photos' + (charLookEn(ch) ? ' (' + charLookEn(ch) + ')' : ''); }); drSyncChars(drFind(s.id)); renderDrama(); } });
  });
  $$('[data-dwrite]').forEach(b => b.onclick = () => drWriteEpisode(s.id, +b.dataset.dwrite));
  $$('[data-dre]').forEach(b => b.onclick = () => {
    if (!confirm('Riscrivere le inquadrature di questo episodio? Fotogrammi e voci già fatti andranno rifatti (i ciak girati restano in Galleria).')) return;
    drWriteEpisode(s.id, +b.dataset.dre, true);
  });
  $$('[data-dopen]').forEach(b => b.onclick = () => drOpenEpisode(s.id, +b.dataset.dopen));
  const all = $('#drAllEp'); if (all) all.onclick = async () => {
    const todo = s.episodes.map((e, i) => i).filter(i => !drEpProj(s.episodes[i]));
    if (!todo.length) return toast('Tutti gli episodi sono già scritti');
    for (const i of todo) { const ok = await drWriteEpisode(s.id, i); if (!ok) break; }
  };
}
/* i personaggi della serie valgono per tutti gli episodi già scritti */
function drSyncChars(s) {
  s.episodes.forEach(ep => {
    if (!ep.projId) return;
    rgMut(ep.projId, p => { (p.bible.characters || []).forEach(c => { const m = s.bible.characters.find(x => x.name.toLowerCase() === c.name.toLowerCase()); if (m) { c.castId = m.castId; c.voiceId = m.voiceId; c.look_en = m.look_en; } }); });
  });
}

/* =================== 1) la serie: bibbia + scaletta =================== */
function drCharRule(s) { return rgCharRule({ nChars: s.nChars, castSel: s.castSel }); }
async function drWriteSeries(s) {
  if (!key()) { toast('Collega prima RunPod'); return openSettings(); }
  if (!s.nChars) { toast('Prima scegli quanti personaggi avrà la serie'); return $('#drN').focus(); }
  if (s.idea.trim().length < 15) { toast('Racconta l\'idea con qualche parola in più'); return $('#drIdea').focus(); }
  if (s.bible && !confirm('Riscrivere la serie da capo? La scaletta verrà sostituita; i progetti degli episodi già scritti restano nel Regista ma non saranno più collegati.')) return;
  if (!drList().some(x => x.id === s.id)) { drSave(s); DR.cur = s.id; DR.draft = null; }
  const wall = drWall(s);
  const steps = [
    { t: 'La premessa', d: 'il conflitto in una frase, chi vuole cosa', st: 'run' },
    { t: 'Personaggi e luoghi', d: 'aspetto fisso, voce, segreti', st: '' },
    { t: `Scaletta di ${s.nEp} episodi`, d: `gancio, svolta, colpo di scena · muro dopo l'episodio ${wall}`, st: '' }
  ];
  RG.thinking = { pid: s.id, steps }; DR.busy = s.id; renderDrama();
  try {
    const sys = 'You are the head writer of a hit vertical micro-drama app (like ReelShort). You plan series that will be produced entirely with AI video generators, one short shot at a time, so every scene must be simple, visual and physically filmable. Write user-facing fields in ITALIAN and every field ending in _en in ENGLISH. Reply ONLY with valid JSON.';
    const usr = `IDEA (from the user, Italian): ${s.idea}
STORY ENGINES / TROPES: ${s.tropes.length ? s.tropes.map(k => TROPE_EN[k]).join(' + ') : 'choose the best fitting ones'}
FORMAT: ${s.nEp} episodes of ${s.epLen} seconds each, vertical 9:16 for phones.
FREE EPISODES: 1-${s.free}; the paywall comes right after episode ${wall}.
AVAILABLE CAST (use these exact names when they fit):
${castBrief()}

Rules of the format:
- The premise fits in ONE sentence; the central conflict is visible in the first seconds of episode 1. No slow setup.
- Every episode: "hook" = what we SEE and HEAR in the first 3 seconds (a shocking line, a reveal, a slap of tension); then something happens, it gets complicated, the audience gets the moment it wanted; then CUT on the "cliffhanger".
- Every cliffhanger creates a NEW problem or reveals something new: never just delay an old question, never repeat the same question for many episodes.
- Episode ${wall} ends with the BIGGEST twist so far (the paywall moment); the episodes after it open the story up, they do not pad it.
- The last episode pays off the main conflict in a satisfying way (a small tease for a season 2 is allowed).
- Drama through faces, reactions, looks and SHORT loaded lines (characters accuse, hide, bargain, provoke, confess). No small talk.
- ${drCharRule(s)}
- Max 4 recurring locations in the whole series. Never more than 2 characters in the same shot. No crowds, no fights, no fast action, no on-screen text.
- Original story and characters: never reuse titles, names or plots of existing shows.
- Each character gets one fixed look_en (apparent age, build, face, hair, one outfit) reused in every episode.
- Rate the content honestly: "tutti", "maturo" (adult themes, nothing explicit), "violento", "esplicito".

JSON schema:
{"title":"","logline":"one Italian sentence","premise":"3-5 Italian sentences","tropes":["Italian"],"themes":"Italian","look":{"style_en":"","palette_en":"","lighting_en":"","camera_en":"vertical 9:16, close-ups and medium close-ups"},"characters":[{"name":"","cast":"exact cast name or empty","role":"Italian","want":"Italian: what they want","secret":"Italian: what they hide","gender":"m|f","age":30,"voice":"Italian, 3-6 words","look_en":""}],"locations":[{"name":"","look_en":""}],"episodes":[{"n":1,"title":"Italian","hook":"Italian, first 3 seconds","summary":"3-4 Italian sentences: what we SEE","cliffhanger":"Italian"}],"rating":{"level":"tutti|maturo|violento|esplicito","notes":"Italian, one sentence"}}`;
    let B = await llmJSON(sys, usr, 1800 + s.nEp * 380, st => { steps[0].d = st === 'IN_QUEUE' ? 'RunPod accende il modello di testo…' : 'il conflitto in una frase, chi vuole cosa'; rgThinkRender(); });
    const bad = rgCharCheck({ nChars: s.nChars, castSel: s.castSel }, B) || ((B.episodes || []).length < s.nEp ? `you wrote ${(B.episodes || []).length} episodes instead of ${s.nEp}` : '');
    if (bad) {
      steps[1].d = 'correggo: ' + bad; rgThinkRender();
      try { const B2 = await llmJSON(sys, usr + `\n\nYOUR PREVIOUS ANSWER WAS WRONG: ${bad}. Fix it and reply with the full JSON again.`, 1800 + s.nEp * 380); if ((B2.episodes || []).length >= (B.episodes || []).length) B = B2; } catch (e) { }
    }
    if (!(B.episodes || []).length) throw new Error('nessun episodio nella scaletta');
    (B.characters || []).forEach((c, k) => {
      const m = S.chars.find(x => x.name.toLowerCase() === String(c.cast || c.name).toLowerCase());
      c.look_orig = c.look_en; c.castId = m ? m.id : null; c.voiceId = (m && m.voiceId) || autoVoice(c, k);
      if (m && m.master) c.look_en = 'as in the master reference' + (m.master.traits_en ? ' (' + m.master.traits_en + ')' : '');
      else if (m) c.look_en = 'as in the reference photos' + (charLookEn(m) ? ' (' + charLookEn(m) + ')' : '');
    });
    s.bible = B;
    s.episodes = B.episodes.slice(0, s.nEp).map((e, i) => ({ n: i + 1, title: e.title || '', hook: e.hook || '', summary: e.summary || '', cliffhanger: e.cliffhanger || '', projId: null }));
    delete s.bible.episodes;
    drSave(s);
    steps.forEach(x => x.st = 'done'); steps[2].d = `${s.episodes.length} episodi`;
    toast('Serie pronta: collega i personaggi al Cast, poi scrivi l\'episodio 1');
  } catch (e) { toast('La serie non è riuscita: ' + e.message, 7000); }
  RG.thinking = null; DR.busy = null; renderDrama();
}

/* =================== 2) un episodio → progetto del Regista =================== */
async function drWriteEpisode(sid, i, rewrite) {
  if (!key()) { toast('Collega prima RunPod'); openSettings(); return false; }
  const s = drFind(sid); if (!s || DR.busy) return false;
  const ep = s.episodes[i], prev = s.episodes[i - 1], next = s.episodes[i + 1], wall = drWall(s);
  const steps = [{ t: `Episodio ${ep.n}: le scene`, d: 'gancio, sviluppo, colpo di scena', st: 'run' }];
  RG.thinking = { pid: s.id, steps }; DR.busy = s.id; RG.spendTo = null; renderDrama();
  const th = $('#rgThink'); if (th) th.scrollIntoView({ behavior: 'smooth', block: 'center' });
  let ok = false;
  try {
    const sys = 'You are the head writer of a vertical micro-drama series produced with AI video, one short shot at a time. Write user-facing fields in ITALIAN. Reply ONLY with valid JSON.';
    const usr = `SERIES BIBLE: ${JSON.stringify({ title: s.bible.title, premise: s.bible.premise, characters: s.bible.characters.map(c => ({ name: c.name, role: c.role, want: c.want, secret: c.secret })), locations: s.bible.locations })}
EPISODE ${ep.n} of ${s.episodes.length} (${s.epLen} seconds): "${ep.title}"
Hook: ${ep.hook}
Summary: ${ep.summary}
Cliffhanger: ${ep.cliffhanger}
${prev ? `Previous episode ended on: ${prev.cliffhanger}. Open by picking up that moment immediately (no recap).` : 'This is the first episode: the conflict must be clear within seconds.'}
${next ? `Next episode opens with: ${next.hook}` : 'This is the final episode: pay off the main conflict.'}
${ep.n === wall ? 'This episode ends right before the paywall: the cliffhanger must be the strongest of the series so far.' : ''}
Split the episode into 3-4 consecutive parts of 12-22 seconds covering exactly 0..${s.epLen} s. Part 1 starts with the hook in the first 3 seconds. The last part ends ON the cliffhanger (a reveal or a held reaction close-up), then cut.
JSON: {"story":"4-6 Italian sentences","parts":[{"title":"Italian","start":0,"end":15,"summary":"3-5 Italian sentences: what we SEE and the key lines"}]}`;
    const E = await llmJSON(sys, usr, 2200);
    const parts = (E.parts || []).map(x => ({ id: uid(), title: x.title, start: +x.start || 0, end: +x.end || 0, summary: x.summary, shots: [] }));
    if (!parts.length) throw new Error('nessuna scena');
    steps[0].st = 'done'; steps[0].d = `${parts.length} scene`;
    const old = ep.projId && rgList().find(p => p.id === ep.projId);
    const p = old || rgNewProj();
    Object.assign(p, {
      idea: ep.summary, length: s.epLen, genre: 'Micro-drama verticale', ratio: '9:16', engine: s.engine, kfEngine: s.kfEngine, audio: false, dialog: 'drama', lipsync: true,
      nChars: s.nChars, castSel: s.castSel, budget: s.budgetEp || 0,
      drama: { sid: s.id, n: ep.n, of: s.episodes.length, hook: ep.hook, cliffhanger: ep.cliffhanger, wall: ep.n === wall, series: s.bible.title },
      bible: { title: `${s.bible.title} · Ep. ${ep.n}`, logline: ep.title, story: E.story || ep.summary, themes: s.bible.themes, look: s.bible.look,
        characters: JSON.parse(JSON.stringify(s.bible.characters)), locations: s.bible.locations, rating: s.bible.rating, changes: [] },
      parts
    });
    rgSave(p);
    drMut(s.id, x => { x.episodes[i].projId = p.id; });
    RG.thinking = { pid: s.id, steps };
    await rgShotsAll(p, steps);
    ok = p.parts.some(pt => pt.shots.length);
    toast(ok ? `Episodio ${ep.n} scritto: aprilo nel Regista per storyboard e ciak` : 'Inquadrature non riuscite: riprova', 6000);
  } catch (e) { toast(`Episodio ${ep.n} non riuscito: ` + e.message, 7000); }
  RG.thinking = null; DR.busy = null; if (DR.mode === 'serie') renderDrama();
  return ok;
}
function drOpenEpisode(sid, i) {
  const s = drFind(sid), ep = s && s.episodes[i]; if (!ep || !ep.projId) return;
  RG.cur = ep.projId; setRgMode('film');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function drBackToSeries(sid) { DR.cur = sid; setRgMode('serie'); }

/* regole di regia aggiunte alle inquadrature di un episodio */
function dramaShotRules(p, i) {
  const d = p.drama, last = i === p.parts.length - 1;
  return `\nVERTICAL MICRO-DRAMA (episode ${d.n} of ${d.of}, 9:16 phone screen): favour close-ups and medium close-ups of faces and reactions, characters placed for a vertical frame, eye-lines clear. Dialogue-driven: about half of the shots carry ONE short loaded line (accuse, hide, bargain, provoke, confess), never small talk.${i === 0 ? `\nTHE FIRST SHOT IS THE HOOK and must grab attention within 2-3 seconds: ${d.hook}` : ''}${last ? `\nTHE LAST SHOT LANDS THE CLIFFHANGER: ${d.cliffhanger}. End on a held reaction close-up or a reveal, 4-5 s, no resolution.` : ''}`;
}

if (DR.mode === 'serie') setTimeout(() => setRgMode('serie'), 0); else setTimeout(() => $$('#rgMode [data-m]').forEach(b => b.classList.toggle('active', b.dataset.m === 'film')), 0);
