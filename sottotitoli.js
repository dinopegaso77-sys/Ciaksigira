/* Ciak si gira — Sottotitoli italiano + inglese.
   Trascrizione: Whisper sul worker di montaggio (RunPod CPU).
   Traduzione: Qwen3 32B su RunPod (endpoint pubblico); se non risponde, Whisper traduce direttamente dall'audio.
   Il film sottotitolato (tracce IT/EN ed eventuale scritta nel video) lo crea il worker con ffmpeg. */
'use strict';

const SUB = { film: null, rows: [], vtt: [], saveT: 0 };

const srtT = t => { const ms = Math.round(Math.max(0, t) * 1000); const p = (n, l = 2) => String(n).padStart(l, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
const vttT = t => srtT(t).replace(',', '.');
const segsOf = lang => SUB.rows.filter(r => (r[lang] || '').trim()).map(r => ({ start: r.start, end: r.end, text: r[lang].trim() }));
function toSrt(lang) { return segsOf(lang).map((s, i) => `${i + 1}\n${srtT(s.start)} --> ${srtT(Math.max(s.end, s.start + 0.3))}\n${s.text}\n`).join('\n'); }
function toVtt(lang) { return 'WEBVTT\n\n' + segsOf(lang).map(s => `${vttT(s.start)} --> ${vttT(Math.max(s.end, s.start + 0.3))}\n${s.text}\n`).join('\n'); }

async function filmSource(f) {
  if (f.key && r2On()) return { key: f.key };
  if (f.url && Date.now() - f.created < 6.5 * 864e5) return { url: f.url };
  if (f.blob && f.blob.size < 7 * 1024 * 1024) return { b64: await b64Of(f.blob) };
  throw new Error('il film è troppo pesante per essere inviato senza archivio: collega l\'archivio R2');
}

async function openSubs(f) {
  if (!f) return;
  SUB.film = f; SUB.rows = (f.subs || []).map(r => ({ ...r }));
  $('#subFilmName').textContent = (f.title || 'Film senza titolo') + (f.dur ? ' · ' + fmtTime(f.dur) : '');
  const v = $('#subVideo');
  v.src = f.blob ? URL.createObjectURL(f.blob) : (f.key && r2On() ? await libUrl(f.key) : f.url);
  $('#subBurn').value = '';
  $('#subStatus').textContent = SUB.rows.length ? 'Correggi le frasi e poi crea il film sottotitolato.' : 'RunPod ascolta il film e scrive i sottotitoli; poi li puoi correggere qui sotto.';
  renderSubs(); openM('mSubs');
}

function renderSubs() {
  const box = $('#subList');
  box.innerHTML = SUB.rows.length ? SUB.rows.map((r, i) => `<div class="subrow" data-i="${i}">
      <div class="subtime"><button class="ic sm" data-seek="${i}" title="Vai a questo punto">▶</button>
        <input type="number" step="0.1" min="0" value="${r.start.toFixed(1)}" data-f="start" aria-label="Inizio"><span>→</span>
        <input type="number" step="0.1" min="0" value="${r.end.toFixed(1)}" data-f="end" aria-label="Fine">
        <button class="ic sm del" data-del="${i}" title="Togli">✕</button></div>
      <textarea rows="2" data-f="it" placeholder="Italiano">${esc(r.it || '')}</textarea>
      <textarea rows="2" data-f="en" placeholder="English">${esc(r.en || '')}</textarea>
    </div>`).join('') : '<div class="empty small">Nessun sottotitolo ancora.<br>Premi "Trascrivi l\'italiano" oppure aggiungi le righe a mano.</div>';
  box.querySelectorAll('.subrow').forEach(row => {
    const r = SUB.rows[+row.dataset.i];
    row.querySelectorAll('[data-f]').forEach(el => el.oninput = () => {
      const k = el.dataset.f; r[k] = (k === 'start' || k === 'end') ? Math.max(0, +el.value || 0) : el.value; subsChanged();
    });
  });
  box.querySelectorAll('[data-seek]').forEach(b => b.onclick = () => { const v = $('#subVideo'); v.currentTime = SUB.rows[+b.dataset.seek].start; v.play().catch(() => { }); });
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { SUB.rows.splice(+b.dataset.del, 1); renderSubs(); subsChanged(); });
  const has = SUB.rows.length > 0;
  $('#subTransl').disabled = !has; $('#subGo').disabled = !has; $('#subSrtIt').disabled = !has; $('#subSrtEn').disabled = !SUB.rows.some(r => (r.en || '').trim());
  $('#subTrans').textContent = has ? '🎙 1 · Trascrivi di nuovo' : '🎙 1 · Trascrivi l\'italiano';
  refreshTracks();
}

function subsChanged() {
  clearTimeout(SUB.saveT);
  SUB.saveT = setTimeout(async () => {
    SUB.rows.sort((a, b) => a.start - b.start);
    SUB.film.subs = SUB.rows.map(r => ({ start: r.start, end: r.end, it: r.it || '', en: r.en || '' }));
    await dbPut('films', SUB.film); refreshTracks();
    $('#subSrtEn').disabled = !SUB.rows.some(r => (r.en || '').trim());
  }, 600);
}

function refreshTracks() { // anteprima dei sottotitoli direttamente nel lettore
  const v = $('#subVideo');
  v.querySelectorAll('track').forEach(t => t.remove()); SUB.vtt.forEach(u => URL.revokeObjectURL(u)); SUB.vtt = [];
  [['it', 'Italiano'], ['en', 'English']].forEach(([l, label], n) => {
    if (!segsOf(l).length) return;
    const u = URL.createObjectURL(new Blob([toVtt(l)], { type: 'text/vtt' })); SUB.vtt.push(u);
    const t = document.createElement('track'); t.kind = 'subtitles'; t.srclang = l; t.label = label; t.src = u;
    if (!v.querySelector('track')) t.default = true;
    v.appendChild(t);
  });
  setTimeout(() => { [...v.textTracks].forEach((t, i) => { t.mode = i === 0 ? 'showing' : 'hidden'; }); }, 50);
}

/* ---- 1. trascrizione ---- */
$('#subTrans').onclick = async () => {
  if (!montId()) { toast('Serve il worker di montaggio: collegalo in ⚙︎'); return; }
  if (SUB.rows.length && !confirm('Rifare la trascrizione? Le correzioni fatte andranno perse.')) return;
  const btn = $('#subTrans'), st = $('#subStatus'); btn.disabled = true; btn.textContent = 'RunPod ascolta…';
  st.textContent = 'Trascrizione in corso: per un film di 1–2 minuti serve circa un minuto (la prima volta qualcosa in più).';
  try {
    const out = await workerCall({ action: 'transcribe', src: await filmSource(SUB.film), lang: 'it' }, 900);
    const segs = out.segments || [];
    if (!segs.length) { st.textContent = out.note === 'il film non ha audio' ? 'Il film non ha audio: aggiungi le righe a mano.' : 'Nessuna frase riconosciuta: aggiungi le righe a mano.'; }
    else st.textContent = `${segs.length} frasi trascritte. Controllale, poi premi "Traduci in inglese".`;
    SUB.rows = segs.map(s => ({ start: s.start, end: s.end, it: s.text, en: '' }));
    renderSubs(); subsChanged();
  } catch (e) { st.textContent = ''; toast('Trascrizione non riuscita: ' + e.message, 7000); }
  btn.disabled = false; if (!SUB.rows.length) btn.textContent = '🎙 1 · Trascrivi l\'italiano'; else btn.textContent = '🎙 1 · Trascrivi di nuovo';
};

/* ---- 2. traduzione ---- */
function deepText(o) {
  if (o == null) return '';
  if (typeof o === 'string') return o;
  if (Array.isArray(o)) { for (const x of o) { const t = deepText(x); if (t) return t; } return ''; }
  if (o.choices) { const c = o.choices[0] || {}; if (c.message && c.message.content) return c.message.content; if (Array.isArray(c.tokens)) return c.tokens.join(''); if (c.text) return c.text; }
  for (const k of ['text', 'output', 'result', 'generated_text', 'content']) if (o[k]) { const t = deepText(o[k]); if (t) return t; }
  return '';
}
async function qwen(task) {
  const EP = '/qwen3-32b-awq';
  try {
    const r = await rp(EP + '/openai/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'Qwen/Qwen3-32B-AWQ', messages: [{ role: 'user', content: task + ' /no_think' }], max_tokens: 4000, temperature: 0.2 }) });
    const t = deepText(r); if (t) return t;
  } catch (e) { if (e.message.includes('Chiave')) throw e; }
  const prompt = `<|im_start|>user\n${task}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`;
  const r = await rp(EP + '/runsync', { method: 'POST', body: JSON.stringify({ input: { prompt, max_tokens: 4000, temperature: 0.2, sampling_params: { max_tokens: 4000, temperature: 0.2 } } }) });
  let out = r.status === 'COMPLETED' ? r.output : null;
  for (let n = 0; out == null && r.id && n < 60; n++) {
    await new Promise(res => setTimeout(res, 2500));
    const s = await rp(`${EP}/status/${r.id}`);
    if (s.status === 'COMPLETED') out = s.output; else if (BAD.includes(s.status)) throw new Error(s.error || s.status);
  }
  const t = deepText(out); if (!t) throw new Error('nessuna risposta dal traduttore'); return t;
}
async function translateLines(lines) {
  const res = [];
  for (let i = 0; i < lines.length; i += 30) {
    const part = lines.slice(i, i + 30);
    const task = `Translate these Italian film subtitle lines into natural, concise English. Keep the same number of lines and the same order. Reply with ONLY a JSON array of ${part.length} strings, nothing else.\n\n${JSON.stringify(part)}`;
    let txt = (await qwen(task)).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const a = txt.indexOf('['), b = txt.lastIndexOf(']');
    let arr = null; try { arr = JSON.parse(txt.slice(a, b + 1)); } catch (e) { }
    if (!Array.isArray(arr) || arr.length !== part.length) throw new Error('traduzione incompleta');
    res.push(...arr.map(x => String(x).trim()));
  }
  return res;
}
$('#subTransl').onclick = async () => {
  if (!key()) { toast('Collega prima RunPod'); return; }
  if (SUB.rows.some(r => (r.en || '').trim()) && !confirm('Rifare la traduzione inglese? Le correzioni in inglese andranno perse.')) return;
  const btn = $('#subTransl'), st = $('#subStatus'); btn.disabled = true; btn.textContent = 'RunPod traduce…';
  try {
    const en = await translateLines(SUB.rows.map(r => r.it || ''));
    SUB.rows.forEach((r, i) => { r.en = r.it ? en[i] : ''; });
    st.textContent = 'Traduzione pronta (Qwen3). Controllala, poi crea il film sottotitolato.';
  } catch (e) {
    // piano B: Whisper traduce direttamente dall'audio
    st.textContent = 'Il traduttore non ha risposto: provo con Whisper dall\'audio…';
    try {
      if (!montId()) throw e;
      const out = await workerCall({ action: 'transcribe', src: await filmSource(SUB.film), lang: 'it', translate: true }, 900);
      const segs = out.segments || [];
      SUB.rows.forEach(r => {
        r.en = segs.filter(s => { const m = (s.start + s.end) / 2; return m >= r.start - 0.3 && m <= r.end + 0.3; }).map(s => s.text).join(' ');
      });
      st.textContent = 'Traduzione pronta (Whisper). Controlla le righe rimaste vuote.';
    } catch (e2) { st.textContent = ''; toast('Traduzione non riuscita: ' + e.message + ' · ' + e2.message, 7000); }
  }
  renderSubs(); subsChanged();
  btn.disabled = false; btn.textContent = '🌍 2 · Traduci in inglese';
};

/* ---- righe a mano e file .srt ---- */
$('#subAdd').onclick = () => {
  const t = $('#subVideo').currentTime || 0;
  SUB.rows.push({ start: +t.toFixed(1), end: +(t + 2.5).toFixed(1), it: '', en: '' }); SUB.rows.sort((a, b) => a.start - b.start);
  renderSubs(); subsChanged();
  const i = SUB.rows.findIndex(r => r.start === +t.toFixed(1)); const el = $(`#subList .subrow[data-i="${i}"] textarea`); if (el) el.focus();
};
function dlText(text, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/x-subrip' })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const subBase = () => (SUB.film.title || 'film').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'film';
$('#subSrtIt').onclick = () => dlText(toSrt('it'), subBase() + '.it.srt');
$('#subSrtEn').onclick = () => dlText(toSrt('en'), subBase() + '.en.srt');

/* ---- 3. film sottotitolato ---- */
$('#subGo').onclick = async () => {
  if (!montId()) { toast('Serve il worker di montaggio: collegalo in ⚙︎'); return; }
  const tracks = [['it', segsOf('it')], ['en', segsOf('en')]].filter(([, s]) => s.length).map(([lang, segments]) => ({ lang, segments }));
  if (!tracks.length) return toast('Scrivi almeno una frase');
  const burn = $('#subBurn').value;
  if (burn && !tracks.some(t => t.lang === burn)) return toast(burn === 'en' ? 'Mancano i sottotitoli in inglese' : 'Mancano i sottotitoli in italiano');
  const btn = $('#subGo'); btn.disabled = true; btn.textContent = 'RunPod sta lavorando…';
  try {
    const f = SUB.film;
    const out = await workerCall({ action: 'subtitle', src: await filmSource(f), tracks, burn: burn || null, name: subBase() + '-sottotitoli' }, 900);
    let blob = null, url = out.url || null;
    if (out.video_b64) blob = await (await fetch('data:video/mp4;base64,' + out.video_b64)).blob();
    else if (url) { try { const r = await fetch(url); if (r.ok) blob = await r.blob(); } catch (e) { } }
    const label = burn ? (burn === 'it' ? 'sottotitoli IT nel video' : 'sottotitoli EN nel video') : 'tracce IT/EN';
    await dbPut('films', { id: uid(), title: `${f.title || 'Film'} · ${label}`, blob, url, key: out.key || null, created: Date.now(), dur: out.duration || f.dur || 0, subs: f.subs || [] });
    closeM($('#mSubs')); renderFilms();
    toast(burn ? 'Film sottotitolato pronto ✓' : 'Film con tracce IT/EN pronto ✓ (attivale dal lettore, es. VLC)', 6000);
  } catch (e) { toast('Sottotitoli non riusciti: ' + e.message, 7000); }
  btn.disabled = false; btn.textContent = '🎬 Crea il film sottotitolato';
};
