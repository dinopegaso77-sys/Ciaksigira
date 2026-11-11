/* Ciak si gira — REGISTA AI
   Dall'idea scritta al film: storia, personaggi, trama in parti, inquadrature con prompt
   costruiti per il modello scelto, controllo di realismo dei movimenti, fotogramma chiave
   con i volti del Cast, ciak su RunPod e montaggio automatico.
   Include anche: ✨ Crea prompt (modulo Crea), ritocco foto e personaggi creati con l'AI (Cast). */
'use strict';

/* =================== regole per video AI realistici =================== */
const RULES_EN = `AI-VIDEO RULES (avoid typical artifacts, reach real cinema quality):
1. One shot = ONE simple continuous action with a clear start and end. Never chain several actions ("then... then...").
2. At most 2 people in frame, prefer 1. No crowds, no undescribed background people.
3. Say where every visible hand is (e.g. "her left hand rests on the table, her right hand holds a white cup"). Avoid hand-heavy interactions (handshakes, hugs, hands on faces, typing, writing, playing instruments with visible fingers); if essential, use a wider shot or keep the hands partly out of frame.
4. Frame bodies intentionally with standard framings (wide, full, medium from the waist up, close-up). Never crop at joints. Nothing appears from nowhere or vanishes.
5. Every character keeps the same face, hair and clothes: copy their fixed look description verbatim in each prompt and add "the same person throughout the shot".
6. REAL MOTION: slow or natural speed, real weight and inertia, feet planted on the ground, natural gait, subtle breathing and blinking, cloth and hair reacting to movement and wind, objects obey gravity. No fast spins, jumps, morphing, transformations, sudden appearances.
7. Camera: one motivated move at most (static tripod, slow dolly-in, slow pan, slow tracking, gentle handheld). No crash zooms, no whip pans.
8. Realistic cinema look: natural skin texture, motivated lighting, shallow depth of field, 35mm or 50mm lens, subtle film grain, graded colours. No readable text, signs, logos, mirrors or screens showing faces.
9. Objects keep shape and count: say how many (one cup, two chairs).
10. Continuity: same time of day, lighting and wardrobe inside the same location.`;

const NEG_BASE = 'extra fingers, extra hands, extra arms, extra legs, missing limbs, fused fingers, deformed hands, malformed limbs, floating limbs, disconnected body parts, cropped head, duplicate person, clone, face morphing, identity change, changing clothes, distorted face, asymmetrical eyes, unnatural motion, sliding feet, rubbery limbs, flickering, warping, jitter, blurry, low quality, plastic skin, waxy skin, cartoon, CGI, 3d render, text, subtitles, watermark, logo';

const MODEL_GUIDE = {
  pruna: 'Pruna Video: short direct prompt of 40-70 words: subject, single action, setting, camera, light. No negative prompt: state what to avoid as positive facts.',
  wan22: 'Wan 2.2 (image-to-video): the first frame is given; describe the MOTION that starts from it: camera move, the single action, how body/cloth/hair move, light. 50-90 words. Supports a negative prompt.',
  wan21: 'Wan 2.1 (image-to-video): the first frame is given; describe the MOTION from it: camera move, the single action, body/cloth/hair movement, light. 50-90 words. Supports a negative prompt.',
  wan25: 'Wan 2.5 (image-to-video with sound): first frame given; describe camera move, the single action, body movement, light, then one short sentence of ambient sound (no music). 60-100 words. Supports a negative prompt.',
  wan: 'Wan 2.6: structure = shot type + camera move, subject(s) with appearance, the single action, environment, lighting/time of day, lens and style, then one short sentence of ambient sound (no music). 70-120 words, concrete visual nouns. Supports a negative prompt.',
  vidu: 'Vidu Q3: 40-80 words, subject - action - scene - camera, simple clear wording. No negative prompt: state avoidances positively.',
  seedance: 'Seedance: precise cinematic language: subject + single action + camera movement + scene + lighting + style, 60-110 words; it follows camera terms well (slow dolly in, tracking shot, low angle). Single continuous shot, never "cut to". No negative prompt.',
  sora: 'Sora 2 (image-to-video): write like a cinematographer\'s shot note: lens and format, camera position and move, lighting, then the action as short beats, 80-140 words; end with ambient sound (no music). No negative prompt.',
  sorapro: 'Sora 2 Pro (image-to-video): write like a cinematographer\'s shot note: lens and format, camera position and move, lighting, then the action as short beats, 80-140 words; end with ambient sound (no music). No negative prompt.',
  kling: 'Kling O1 (reference images + reference video): refer to people as "the person in the reference image"; 40-80 words; one camera move named plainly; the movement must be physically plausible.',
  klingmc: 'Kling Motion Control: the movement comes from the reference video; describe only appearance, setting and light, 30-60 words.',
  talk: 'InfiniteTalk: the person speaks or sings the given audio; describe expression, subtle natural head and hand movement, framing (medium close-up), light; 30-60 words.'
};
const RG_MODELS = ['wan', 'seedance', 'vidu', 'wan25', 'wan22', 'wan21', 'pruna', 'sora', 'sorapro'];

/* Cosa accettano di solito i modelli (le regole possono cambiare: in caso di rifiuto RunPod restituisce errore) */
const POLICY = {
  strict: { label: 'molto severo', models: ['sora', 'sorapro'], note: 'rifiuta nudità, sesso, violenza esplicita, persone reali famose' },
  standard: { label: 'severo', models: ['seedance', 'kling', 'klingmc', 'vidu', 'wan', 'wan25', 'pruna'], note: 'rifiuta nudità e sesso; violenza da film d\'azione di solito accettata' },
  open: { label: 'più permissivo', models: ['wan22', 'wan21', 'talk'], note: 'modelli aperti: accettano più scene forti, ma l\'app non genera contenuti sessuali espliciti' }
};
const policyOf = e => Object.values(POLICY).find(p => p.models.includes(e)) || POLICY.standard;
const RATING_LABEL = { tutti: 'Per tutti', maturo: 'Temi adulti (non esplicito)', violento: 'Violenza forte', esplicito: 'Contenuti espliciti +18' };
function ratingVerdict(rating, engine) {
  const pol = policyOf(engine), lv = (rating && rating.level) || 'tutti';
  if (lv === 'tutti') return { ok: true, txt: 'Adatto a tutti i modelli.' };
  if (lv === 'maturo') return { ok: pol !== POLICY.strict, txt: pol === POLICY.strict ? `${MODELS[engine].name} è ${pol.label}: potrebbe rifiutare alcune scene.` : 'Di solito accettato: le scene sono suggerite, non esplicite.' };
  if (lv === 'violento') return { ok: pol === POLICY.open, txt: pol === POLICY.open ? 'Di solito accettato da questo modello.' : `${MODELS[engine].name} è ${pol.label}: ${pol.note}. Meglio mostrare le conseguenze che l'atto.` };
  return { ok: false, txt: 'Le scene sessuali esplicite non vengono generate: nessun modello di RunPod lo consente e l\'app non aggira i filtri. Usa "Rendi suggerito": baci, sguardi, stacchi sul nero.' };
}

/* =================== algoritmo di realismo dei movimenti =================== */
const RISK = [
  { re: /\b(morph|morphing|transform|transforms|transforming|turns into|shape-?shift)/i, w: 3, it: 'trasformazioni: l\'AI deforma i corpi' },
  { re: /\b(suddenly|instantly|appears out of|disappears|vanish)/i, w: 2, it: 'apparizioni improvvise' },
  { re: /\b(fast|rapid|rapidly|quickly|sprint|sprints|spinning|spins|whirl|jumps?|leaps?|backflip|somersault|tumbl)/i, w: 2, it: 'movimento veloce o acrobatico' },
  { re: /\b(crowd|many people|group of people|audience|dozens|several people)/i, w: 3, it: 'folla: volti e corpi si fondono' },
  { re: /\b(fight|fighting|punch|punches|kicks?|wrestl|grapple|stab)/i, w: 3, it: 'lotta: arti che si intrecciano' },
  { re: /\b(hug|hugs|hugging|embrace|embraces|cuddle|handshake|shake hands|holding hands|hold hands)/i, w: 2, it: 'contatto tra persone: mani e braccia in più' },
  { re: /\b(typing|writes|writing|plays? (the )?(piano|guitar|violin)|playing (the )?(piano|guitar|violin)|knit|sew|shuffl|juggl|counting money)/i, w: 2, it: 'dita in movimento ravvicinato' },
  { re: /\b(sign that (says|reads)|text that|written|letters|newspaper headline|reads the)/i, w: 1, it: 'testo leggibile: esce storpiato' },
  { re: /\b(mirror|reflection in)/i, w: 1, it: 'specchi e riflessi' },
  { re: /\b(crash zoom|whip pan|fast zoom|zooms? in quickly|rapid cut)/i, w: 2, it: 'camera brusca' },
  { re: /\b(dancing|dances|dance)\b/i, w: 1, it: 'ballo: movimenti complessi' }
];
const ACTION_SPLIT = /\b(then|and then|after that|afterwards|before|while also|next,)\b/gi;
function lintShot(sh, engine) {
  const p = sh.prompt || '', issues = [];
  let score = 100;
  RISK.forEach(r => { if (r.re.test(p)) { issues.push(r.it); score -= r.w * 9; } });
  const chain = (p.match(ACTION_SPLIT) || []).length;
  if (chain >= 2) { issues.push('troppe azioni in un\'inquadratura'); score -= 10 * (chain - 1); }
  const people = (sh.chars || []).length;
  if (people > 2) { issues.push('più di 2 persone in scena'); score -= 15; }
  if (people && !/\bhands?\b/i.test(p)) { issues.push('non dice dove sono le mani'); score -= 6; }
  if (people && !/(weight|inertia|natural (gait|motion|movement)|grounded|planted)/i.test(p)) score -= 4;
  if (!/(slow|gentle|steady|static|tripod|locked-off|subtle)/i.test(p)) score -= 4;
  const words = p.split(/\s+/).length;
  if (words < 30) { issues.push('descrizione troppo corta'); score -= 8; }
  // durata consigliata: più è complessa la scena, più il ciak deve essere corto
  const cx = chain + people + issues.length;
  const maxDur = cx >= 5 ? 5 : cx >= 3 ? 8 : 12;
  return { score: Math.max(5, Math.min(100, Math.round(score))), issues, maxDur };
}
const REAL_SUFFIX = 'Real-world physics: natural human motion with weight and inertia, feet planted, subtle breathing and blinking, clothing and hair react naturally; consistent anatomy with two arms and two hands per person; the same person throughout the shot.';
function realismPrompt(sh) {
  let p = (sh.prompt || '').trim();
  if (!/Real-world physics/i.test(p)) p += (/[.!]$/.test(p) ? ' ' : '. ') + REAL_SUFFIX;
  return p;
}
function nearestDur(engine, want) {
  const ds = MODELS[engine].durations; if (!ds || !ds.length) return want || 5;
  return ds.reduce((a, b) => Math.abs(b - want) < Math.abs(a - want) ? b : a, ds[0]);
}

/* =================== testo con Qwen3 32B su RunPod =================== */
const LLM_EP = 'qwen3-32b-awq';
const wait = ms => new Promise(r => setTimeout(r, ms));
async function llm(system, user, maxTokens = 3000, onWait) {
  const prompt = `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`;
  const r = await rp(`/${LLM_EP}/run`, { method: 'POST', body: JSON.stringify({ input: { prompt, max_tokens: maxTokens, temperature: 0.6, top_p: 0.9 } }) });
  let out = r.status === 'COMPLETED' ? r.output : null;
  for (let n = 0; out == null && r.id && n < 160; n++) {
    await wait(2500);
    const s = await rp(`/${LLM_EP}/status/${r.id}`);
    if (s.status === 'COMPLETED') out = s.output;
    else if (BAD.includes(s.status)) throw new Error(s.error || s.status);
    else if (onWait) onWait(s.status);
  }
  const o0 = Array.isArray(out) ? out[0] : out, u = o0 && o0.usage;
  const cost = (o0 && typeof o0.cost === 'number') ? o0.cost : u ? ((u.input || u.prompt_tokens || 0) + (u.output || u.completion_tokens || 0)) / 1e6 * 10 : maxTokens / 1e6 * 10;
  ls('spent', String((parseFloat(ls('spent')) || 0) + cost)); showSpent();
  const t = deepText(out);
  if (!t) throw new Error('il modello di testo non ha risposto');
  return t.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
function parseJSON(t) {
  t = t.replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('risposta non valida');
  const s = t.slice(a, b + 1);
  try { return JSON.parse(s); } catch (e) { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"')); }
}
async function llmJSON(system, user, maxTokens, onWait) {
  try { return parseJSON(await llm(system, user, maxTokens, onWait)); }
  catch (e) {
    if (/Chiave|401|403/.test(e.message)) throw e;
    return parseJSON(await llm(system, user + '\n\nIMPORTANT: reply with ONE valid JSON object only, no comments.', maxTokens, onWait));
  }
}
async function toEnglish(txt) {
  if (!txt.trim()) return '';
  try { return (await llm('You translate short instructions into concise English. Reply with the translation only.', txt, 300)).replace(/^["']|["']$/g, ''); }
  catch (e) { return txt; }
}

/* =================== immagini (RunPod) =================== */
async function rpJob(endpoint, input, maxWait = 300) {
  const r = await rp(`/${endpoint}/run`, { method: 'POST', body: JSON.stringify({ input }) });
  let out = r.status === 'COMPLETED' ? r.output : null;
  for (let n = 0; out == null && r.id && n < maxWait / 2.5; n++) {
    await wait(2500);
    const s = await rp(`/${endpoint}/status/${r.id}`);
    if (s.status === 'COMPLETED') out = s.output;
    else if (BAD.includes(s.status)) throw new Error(traduciErrore(s.error || (s.output && s.output.error) || s.status));
  }
  if (out == null) throw new Error('RunPod non ha risposto in tempo');
  if (out.error) throw new Error(traduciErrore(out.error));
  const url = typeof out === 'string' ? out : (out.result || out.image_url || out.url || (out.images && out.images[0]));
  if (!url) throw new Error('RunPod non ha restituito l\'immagine');
  const cost = typeof out.cost === 'number' ? out.cost : 0.03;
  ls('spent', String((parseFloat(ls('spent')) || 0) + cost)); showSpent();
  return url;
}
async function urlToJpeg(url, max = 1024) {
  const r = await fetch(url); if (!r.ok) throw new Error('immagine non scaricabile');
  return await fileToJpeg(await r.blob(), max);
}
const kfSize = ratio => ratio === '9:16' ? '720*1280' : ratio === '1:1' ? '1024*1024' : '1280*720';

/* =================== ✨ CREA PROMPT (modulo Crea) =================== */
let magicPrev = null;
$('#magicBtn').onclick = async () => {
  if (!key()) { toast('Collega prima RunPod'); return openSettings(); }
  const raw = $('#prompt').value.trim();
  if (!raw) { toast('Scrivi prima la tua idea, anche in italiano e in poche parole'); return $('#prompt').focus(); }
  const o = currentOpts(), m = MODELS[o.engine];
  const chars = S.chars.filter(c => S.selChars.has(c.id));
  const btn = $('#magicBtn'); btn.disabled = true; btn.textContent = '✨ Scrivo…';
  try {
    const sys = `You are a top cinematographer and an expert prompt engineer for AI video generators. You turn rough ideas (often in Italian) into one production-ready ENGLISH prompt for the given model, aiming at real, physically believable motion and cinema quality.\n${RULES_EN}\nMODEL GUIDE: ${MODEL_GUIDE[o.engine] || MODEL_GUIDE.wan}\nReply ONLY with JSON: {"prompt":"...","negative":"...","tips":"one or two short tips in Italian about what could still go wrong and how to frame it better"}`;
    const usr = `Idea: ${raw}\nModel: ${m.name}\nClip length: ${o.duration || o.refDuration || 5} s\nAspect ratio: ${o.ratio}\nStarting photo given: ${o.startImg ? 'yes (the first frame is fixed: describe motion from it)' : 'no'}\n${chars.length ? 'Characters (keep exactly this look): ' + chars.map(c => `${c.name}: ${c.desc || 'as in the reference photo'}`).join('; ') : ''}\nDO NOT invent extra people.`;
    const r = await llmJSON(sys, usr, 1200);
    if (!r.prompt) throw new Error('nessun prompt ricevuto');
    magicPrev = { prompt: raw, neg: $('#negative').value };
    const sh = { prompt: r.prompt, chars: chars.map(c => c.name) };
    $('#prompt').value = realismPrompt(sh);
    if (m.neg) $('#negative').value = [r.negative, NEG_BASE].filter(Boolean).join(', ').slice(0, 900);
    $('#magicUndo').classList.remove('hidden');
    const L = lintShot(sh, o.engine);
    toast(`Prompt pronto · realismo ${L.score}/100${L.issues.length ? ' · attenzione: ' + L.issues.slice(0, 2).join(', ') : ''}${r.tips ? '\n' + r.tips : ''}`, 9000);
    $('#prompt').dispatchEvent(new Event('input'));
  } catch (e) { toast('Crea prompt non riuscito: ' + e.message, 6000); }
  btn.disabled = false; btn.textContent = '✨ Crea prompt';
};
$('#magicUndo').onclick = () => {
  if (!magicPrev) return;
  $('#prompt').value = magicPrev.prompt; $('#negative').value = magicPrev.neg; magicPrev = null;
  $('#magicUndo').classList.add('hidden');
};

/* =================== CAST: ritocco foto e personaggi creati dall'AI =================== */
const PE_PRESETS = [
  ['Togli le altre persone', 'Remove every other person from the photo and keep only the main person exactly as they are; fill the background naturally where they were.'],
  ['Togli mani o braccia estranee', 'Remove any hands or arms that do not belong to the main person (for example hands resting on the shoulders); restore the clothing and background underneath naturally.'],
  ['Togli oggetti davanti', 'Remove objects that cover the person (bags, glasses on the table, other items in the foreground) and restore what is behind them.'],
  ['Sfondo neutro', 'Replace the background with a plain neutral light-grey studio backdrop.'],
  ['Luce da ritratto', 'Improve the light like a professional portrait: soft key light, gentle shadows, sharp focus, natural skin texture.'],
  ['Togli scritte e loghi', 'Remove all text, logos and watermarks.']
];
const PE = { id: null, sel: new Set() };
function openPhotoEdit(id) {
  const c = S.chars.find(x => x.id === id); if (!c) return;
  PE.id = id; PE.sel.clear();
  $('#peImg').src = c.img; $('#peText').value = ''; $('#peStatus').textContent = '';
  $('#pePresets').innerHTML = PE_PRESETS.map((p, i) => `<button class="chip" data-pp="${i}">${p[0]}</button>`).join('');
  $$('#pePresets [data-pp]').forEach(b => b.onclick = () => { const i = +b.dataset.pp; PE.sel.has(i) ? PE.sel.delete(i) : PE.sel.add(i); b.classList.toggle('on', PE.sel.has(i)); });
  peButtons(c); openM('mPhotoEdit');
}
function peButtons(c) { $('#peUndo').disabled = !(c.hist && c.hist.length); $('#peOrig').disabled = !c.orig || c.orig === c.img; }
async function setCharImg(c, img, keepHist = true) {
  if (keepHist) { c.hist = [...(c.hist || []), c.img].slice(-5); if (!c.orig) c.orig = c.img; }
  c.img = img; delete c.r2key;
  await dbPut('chars', c); renderChars(); renderRefChars(); $('#peImg').src = img; peButtons(c);
  if (window.renderRegia && $('#view-regista').classList.contains('active')) renderRegia();
}
$('#peGo').onclick = async () => {
  const c = S.chars.find(x => x.id === PE.id); if (!c) return;
  if (!key()) return toast('Collega prima RunPod');
  const free = $('#peText').value.trim();
  if (!PE.sel.size && !free) return toast('Scegli un ritocco o scrivi cosa cambiare');
  const btn = $('#peGo'), st = $('#peStatus'); btn.disabled = true; $('#peBusy').classList.remove('hidden'); st.textContent = '';
  try {
    let instr = [...PE.sel].map(i => PE_PRESETS[i][1]).join(' ');
    if (free) instr += ' ' + await toEnglish(free);
    instr += ' Keep the main person\'s face, identity, expression, hairstyle, body and clothing exactly the same. Photorealistic, natural anatomy, no extra limbs.';
    const image = r2On() ? await toModelUrl(c.img, 'ritocco-' + c.id) : c.img;
    const url = await rpJob('qwen-image-edit', { prompt: instr, image, negative_prompt: 'extra people, extra hands, extra arms, deformed, blurry, changed face', seed: -1, output_format: 'jpeg', enable_safety_checker: true });
    await setCharImg(c, await urlToJpeg(url, 1280));
    st.textContent = 'Fatto ✓ Se non ti piace premi "Annulla l\'ultimo".';
  } catch (e) { st.textContent = 'Ritocco non riuscito: ' + e.message; }
  btn.disabled = false; $('#peBusy').classList.add('hidden');
};
$('#peUndo').onclick = async () => { const c = S.chars.find(x => x.id === PE.id); if (!c || !c.hist || !c.hist.length) return; const prev = c.hist.pop(); await setCharImg(c, prev, false); };
$('#peOrig').onclick = async () => { const c = S.chars.find(x => x.id === PE.id); if (!c || !c.orig) return; await setCharImg(c, c.orig); };

async function aiPortrait(name, look) {
  const prompt = `Photorealistic cinematic character reference portrait of ${look}. Front view, from the chest up, looking at the camera with a neutral relaxed expression, plain neutral grey studio background, soft key light, sharp focus, natural skin texture, 50mm lens. Only one person in the image, both shoulders visible, no hands in front of the body, no text.`;
  const url = await rpJob('qwen-image-t2i', { prompt, negative_prompt: 'extra people, extra hands, extra fingers, deformed face, cartoon, cgi, text, watermark, blurry', size: '1024*1024', seed: -1, enable_safety_checker: true });
  return await urlToJpeg(url, 1024);
}
$('#charAi').onclick = async () => {
  const desc = $('#charDesc').value.trim(), name = $('#charName').value.trim();
  if (!desc) { toast('Scrivi prima la descrizione (età, viso, capelli, vestiti)'); return $('#charDesc').focus(); }
  if (!key()) return toast('Collega prima RunPod');
  const btn = $('#charAi'); btn.disabled = true; btn.textContent = '🎨 RunPod disegna…';
  try {
    const look = await toEnglish(`${name ? name + ', ' : ''}${desc}`);
    charImg = await aiPortrait(name, look);
    $('#charPreview').innerHTML = `<img src="${charImg}" alt="">`;
    toast('Foto pronta: se ti piace salva il personaggio, altrimenti riprova');
  } catch (e) { toast('Foto non riuscita: ' + e.message, 6000); }
  btn.disabled = false; btn.textContent = '🎨 Crea la foto con l\'AI dalla descrizione (≈ 0,02 $)';
};

/* =================== REGISTA: progetti =================== */
const RG = { cur: null, busy: new Map(), thinking: null };
function rgList() { try { return JSON.parse(ls('regie') || '[]'); } catch (e) { return []; } }
function rgSaveAll(list) { ls('regie', JSON.stringify(list)); }
function rgProj() { return rgList().find(p => p.id === RG.cur) || null; }
function rgSave(p) { const l = rgList(); const i = l.findIndex(x => x.id === p.id); if (i < 0) l.unshift(p); else l[i] = p; rgSaveAll(l); }
function rgNewProj() {
  return { id: uid(), created: Date.now(), idea: '', length: 60, genre: 'Drammatico realistico', ratio: '16:9', engine: 'wan', audio: false, dialog: 'pochi', lipsync: true, script: null, bible: null, parts: [] };
}
const GENRES = ['Drammatico realistico', 'Commedia', 'Thriller', 'Noir', 'Romantico', 'Avventura', 'Fantascienza realistica', 'Horror (suggerito)', 'Documentario', 'Spot pubblicitario', 'Videoclip narrativo'];
const LENGTHS = [[30, '30 secondi'], [60, '1 minuto'], [90, '1 minuto e mezzo'], [120, '2 minuti'], [180, '3 minuti']];
const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function charOfName(p, name) {
  const ch = (p.bible.characters || []).find(c => c.name.toLowerCase() === String(name).toLowerCase());
  const cast = ch && ch.castId && S.chars.find(c => c.id === ch.castId);
  return { ch, cast };
}
function shotState(sh) {
  const job = S.jobs.find(j => j.settings && j.settings.rgShot === sh.id);
  const clip = S.clips.find(c => c.settings && c.settings.rgShot === sh.id);
  if (RG.busy.has(sh.id)) return { st: 'kf', label: RG.busy.get(sh.id) };
  if (job && !job.done) return { st: 'run', label: 'Si gira', job };
  if (job && job.error && (!clip || job.created > clip.created)) return { st: 'err', label: 'Errore', err: job.error, job };
  if (sh.err) return { st: 'err', label: 'Errore', err: sh.err };
  if (clip) return { st: 'ok', label: 'Pronto', clip };
  return { st: 'todo', label: 'Da girare' };
}
function shotCost(p, sh) {
  const tts = (sh.lines || []).reduce((k, l) => k + l.text.length * 0.00005, 0);
  if (isTalk(p, sh)) return 0.5 + 0.03 + tts;
  const m = MODELS[p.engine];
  const o = { engine: p.engine, duration: nearestDur(p.engine, sh.dur), res: m.defRes || '720p', ratio: p.ratio, audio: p.audio, ex: {}, startImg: 'x', img: 'x', charImgs: [] };
  let c = 0; try { c = m.price(o); } catch (e) { }
  return c + (needsKeyframe(p, sh) ? 0.03 : 0) + tts;
}
function isTalk(p, sh) { const l = (sh.lines || [])[0]; return !!(l && l.oncam && p.lipsync !== false && p.dialog !== 'no'); }
function needsKeyframe(p, sh) {
  if (isTalk(p, sh)) return true;
  const m = MODELS[p.engine];
  if (m.needs.image === 'no') return false;
  return m.needs.image === 'req' || (sh.chars || []).some(n => charOfName(p, n).cast);
}

/* =================== REGISTA: interfaccia =================== */
function renderRegia() {
  const list = rgList();
  if (RG.cur !== '__draft' && !list.some(p => p.id === RG.cur)) RG.cur = list[0] ? list[0].id : '__draft';
  const opts = list.map(p => `<option value="${p.id}">${esc((p.bible && p.bible.title) || (p.idea || 'Regia').slice(0, 30))}</option>`);
  if (RG.cur === '__draft') opts.unshift('<option value="__draft">Nuova regia</option>');
  $('#rgProjects').innerHTML = opts.join('');
  $('#rgProjects').value = RG.cur;
  $('#rgProjects').classList.toggle('hidden', opts.length < 2);
  const p = RG.cur === '__draft' ? (RG.draft = RG.draft || rgNewProj()) : rgProj();
  const box = $('#rgBody');
  const hasB = !!p.bible;
  const SH = hasB ? rgStoryHtml(p) : { left: '', right: '' };
  box.className = hasB ? 'rg-grid' : '';
  box.innerHTML = `<div class="rg-left">
  <div class="rg-card rg-idea">
    <div class="rg-step"><b>1</b><span>L'idea</span></div>
    <div class="rg-script">
      ${p.script ? `<span class="rg-pdf">📄 <b>${esc(p.script.name)}</b> · ${p.script.pages || '?'} pagine · ${Math.round(p.script.text.length / 1000)}k caratteri</span><button class="btn small" id="rgPdfDel">Togli</button>`
        : `<label class="btn small" for="rgPdf">📄 Carica copione o master (PDF)</label><span class="muted small">la storia, i personaggi e i dialoghi verranno presi da lì</span>`}
      <input type="file" id="rgPdf" accept="application/pdf,.pdf">
    </div>
    <label class="nolabel"><textarea id="rgIdea" rows="4" placeholder="Racconta la tua idea in poche righe, in italiano. Es. Un padre e il figlio ormai adulto svuotano la vecchia casa di famiglia e ritrovano la bicicletta con cui lui imparò a pedalare.">${esc(p.idea)}</textarea></label>
    <div class="rg-opts">
      <label>Durata<select id="rgLen">${LENGTHS.map(([v, t]) => `<option value="${v}" ${p.length == v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Genere<select id="rgGenre">${GENRES.map(g => `<option ${p.genre === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      <label>Formato<select id="rgRatio">${['16:9', '9:16'].map(r => `<option ${p.ratio === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label>Modello video<select id="rgEngine">${RG_MODELS.map(k => `<option value="${k}" ${p.engine === k ? 'selected' : ''}>${MODELS[k].name}</option>`).join('')}</select></label>
    </div>
    <div class="rg-opts rg-opts2">
      <label>Dialoghi<select id="rgDialog">${[['no', 'Nessuno (solo immagini)'], ['pochi', 'Pochi e brevi'], ['copione', 'Come nel copione']].map(([v, t]) => `<option value="${v}" ${p.dialog === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    <label class="check"><input type="checkbox" id="rgLip" ${p.lipsync !== false ? 'checked' : ''}> Labbra sincronizzate quando un personaggio parla in camera (InfiniteTalk)</label>
    <label class="check"><input type="checkbox" id="rgAudio" ${p.audio ? 'checked' : ''}> Suoni d'ambiente nei ciak (la musica la metti tu al montaggio)</label>
    <button class="btn primary big" id="rgWrite">${hasB ? '↻ Riscrivi tutto da capo' : '🎬 Scrivi la storia'} <small>≈ 0,05 $</small></button>
    ${RG.cur !== '__draft' ? '<button class="linkbtn" id="rgDel">Elimina questa regia</button>' : ''}
  </div>
  <div id="rgThink"></div>
  ${SH.left}</div><div class="rg-right">${SH.right}</div>`;
  rgWireIdea(p);
  rgThinkRender();
  if (hasB) rgWireStory(p);
}
function rgThinkRender() {
  const t = RG.thinking, el = $('#rgThink'); if (!el) return;
  if (!t || t.pid !== RG.cur) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="rg-card rg-think"><div class="rg-step"><b>✦</b><span>Il regista sta lavorando</span></div>
    <ol>${t.steps.map(s => `<li class="${s.st}"><i>${s.st === 'done' ? '✓' : s.st === 'run' ? '' : '·'}</i><div><b>${esc(s.t)}</b><small>${esc(s.d || '')}</small></div></li>`).join('')}</ol></div>`;
}
function rgStoryHtml(p) {
  const B = p.bible, ver = ratingVerdict(B.rating, p.engine);
  const done = p.parts.reduce((n, pt) => n + pt.shots.filter(s => shotState(s).st === 'ok').length, 0);
  const tot = p.parts.reduce((n, pt) => n + pt.shots.length, 0);
  const cost = p.parts.reduce((n, pt) => n + pt.shots.reduce((k, s) => k + shotCost(p, s), 0), 0);
  const left = `
  <div class="rg-card">
    <div class="rg-step"><b>2</b><span>La storia</span></div>
    <input id="rgTitle" class="rg-title" value="${esc(B.title || '')}" aria-label="Titolo">
    <p class="rg-log">${esc(B.logline || '')}</p>
    <label class="nolabel"><textarea id="rgStory" rows="5">${esc(B.story || '')}</textarea></label>
    <div class="rg-rating ${ver.ok ? 'ok' : 'warn'}"><b>${RATING_LABEL[(B.rating && B.rating.level) || 'tutti'] || 'Per tutti'}</b><span>${esc(ver.txt)}</span>
      ${!ver.ok ? '<button class="btn small" id="rgSoften">Rendi suggerito</button>' : ''}</div>
  </div>
  <div class="rg-card">
    <div class="rg-step"><b>3</b><span>Personaggi</span></div>
    <div class="rg-chars">${(B.characters || []).map((c, i) => {
      const cast = c.castId && S.chars.find(x => x.id === c.castId);
      return `<div class="rg-char">
        <div class="rg-face">${cast ? `<img src="${cast.img}" alt="">` : '<span>?</span>'}</div>
        <div class="rg-ci"><b>${esc(c.name)}</b><small>${esc(c.role || '')}</small>
          <select data-cast="${i}"><option value="">${cast ? '— scollega —' : 'Scegli dal Cast…'}</option>${S.chars.map(x => `<option value="${x.id}" ${c.castId === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
          ${p.dialog !== 'no' ? `<select data-voice="${i}" aria-label="Voce">${voiceOptions(c.voiceId)}</select>` : ''}
          <div class="rg-cb">${cast ? `<button class="btn small" data-rpe="${cast.id}">✏️ Ritocca</button>` : `<button class="btn small" data-aic="${i}">🎨 Crea con AI</button>`}${p.dialog !== 'no' ? `<button class="btn small" data-vtest="${i}">🔊 Prova voce</button>` : ''}</div>
        </div></div>`;
    }).join('')}</div>
    <p class="muted small">Le foto del Cast tengono uguali volti e vestiti in tutte le scene. Senza foto il modello inventa il volto a ogni ciak.</p>
  </div>`;
  const right = `
  <div class="rg-card">
    <div class="rg-step"><b>4</b><span>Trama e inquadrature</span></div>
    ${p.parts.map((pt, pi) => rgPartHtml(p, pt, pi)).join('')}
  </div>
  <div class="rg-bar">
    <span><b>${done}/${tot}</b> ciak girati · stima totale ${money(cost)}</span>
    <button class="btn primary" id="rgToMont" ${done ? '' : 'disabled'}>✂️ Manda al montaggio</button>
  </div>`;
  return { left, right };
}
function rgPartHtml(p, pt, pi) {
  const sts = pt.shots.map(shotState);
  const ok = sts.filter(s => s.st === 'ok').length, run = sts.some(s => s.st === 'run' || s.st === 'kf');
  const todo = pt.shots.filter((s, i) => sts[i].st === 'todo' || sts[i].st === 'err');
  const cost = todo.reduce((k, s) => k + shotCost(p, s), 0);
  return `<div class="rg-part">
    <div class="rg-ph"><b>Parte ${pi + 1}</b><span>${mmss(pt.start)}–${mmss(pt.end)}</span><em>${esc(pt.title || '')}</em><small>${ok}/${pt.shots.length}</small></div>
    <label class="nolabel"><textarea data-psum="${pi}" rows="3">${esc(pt.summary || '')}</textarea></label>
    <div class="rg-shots">${pt.shots.map((sh, si) => {
      const s = sts[si], L = lintShot(sh, p.engine);
      const th = s.clip ? `<video src="${clipSrc(s.clip)}#t=0.5" muted playsinline preload="metadata"></video>` : sh.kf && sh.kf.img ? `<img src="${sh.kf.img}" alt="">` : `<span class="n">${pi + 1}.${si + 1}</span>`;
      return `<button class="rg-shot st-${s.st}" data-shot="${pi}:${si}">
        <div class="th">${th}<i class="badge">${s.st === 'kf' ? '🖼' : s.st === 'run' ? '🎬' : s.st === 'ok' ? '✓' : s.st === 'err' ? '!' : ''}</i></div>
        <div class="sl"><b>${pi + 1}.${si + 1} · ${nearestDur(p.engine, sh.dur)}s</b><small>${esc(sh.action || '')}</small>${(sh.lines || []).length ? `<i class="ln">💬 ${esc(sh.lines[0].char)}: «${esc(sh.lines[0].text)}»</i>` : ''}<em class="rs ${L.score >= 80 ? 'g' : L.score >= 60 ? 'y' : 'r'}">realismo ${L.score}</em></div>
      </button>`;
    }).join('')}</div>
    <div class="actions">
      <button class="btn primary small" data-gopart="${pi}" ${!todo.length || run ? 'disabled' : ''}>${run ? '🎬 Si gira…' : todo.length ? `🎬 Gira la parte · ${todo.length} ciak ≈ ${money(cost)}` : '✓ Parte girata'}</button>
      <button class="btn small" data-rewrite="${pi}" ${run ? 'disabled' : ''}>✍️ Riscrivi inquadrature</button>
    </div>
  </div>`;
}
function rgWireIdea(p) {
  const upd = () => {
    p.idea = $('#rgIdea').value; p.length = +$('#rgLen').value; p.genre = $('#rgGenre').value; p.ratio = $('#rgRatio').value;
    p.engine = $('#rgEngine').value; p.audio = $('#rgAudio').checked; p.dialog = $('#rgDialog').value; p.lipsync = $('#rgLip').checked;
    if (rgList().some(x => x.id === p.id)) rgSave(p);
  };
  ['#rgIdea', '#rgLen', '#rgGenre', '#rgRatio', '#rgAudio', '#rgDialog', '#rgLip'].forEach(s => $(s).addEventListener('change', upd));
  $('#rgPdf').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) { upd(); await rgLoadPdf(p, f); } };
  const pd = $('#rgPdfDel'); if (pd) pd.onclick = () => { p.script = null; if (p.dialog === 'copione') p.dialog = 'pochi'; if (rgList().some(x => x.id === p.id)) rgSave(p); renderRegia(); };
  $('#rgIdea').addEventListener('input', upd);
  $('#rgEngine').onchange = () => { upd(); if (p.bible) renderRegia(); };
  $('#rgWrite').onclick = () => { upd(); rgWrite(p); };
  const d = $('#rgDel'); if (d) d.onclick = () => {
    if (!confirm('Eliminare questa regia? I ciak girati restano in Galleria.')) return;
    rgSaveAll(rgList().filter(x => x.id !== p.id)); RG.cur = null; renderRegia();
  };
}
function rgWireStory(p) {
  const B = p.bible;
  $('#rgTitle').onchange = () => { B.title = $('#rgTitle').value; rgSave(p); renderRegiaList(); };
  $('#rgStory').onchange = () => { B.story = $('#rgStory').value; rgSave(p); };
  $$('[data-psum]').forEach(t => t.onchange = () => { p.parts[+t.dataset.psum].summary = t.value; rgSave(p); });
  $$('[data-cast]').forEach(s => s.onchange = () => { B.characters[+s.dataset.cast].castId = s.value || null; rgSave(p); renderRegia(); });
  $$('[data-rpe]').forEach(b => b.onclick = () => openPhotoEdit(b.dataset.rpe));
  $$('[data-voice]').forEach(s => s.onchange = () => { B.characters[+s.dataset.voice].voiceId = s.value; rgSave(p); });
  $$('[data-vtest]').forEach(b => b.onclick = () => rgVoiceTest(p, +b.dataset.vtest, b));
  $$('[data-aic]').forEach(b => b.onclick = () => rgAiChar(p, +b.dataset.aic, b));
  $$('[data-shot]').forEach(b => b.onclick = () => { const [pi, si] = b.dataset.shot.split(':').map(Number); openShot(p, pi, si); });
  $$('[data-gopart]').forEach(b => b.onclick = () => rgShootPart(p, +b.dataset.gopart));
  $$('[data-rewrite]').forEach(b => b.onclick = () => rgRewritePart(p, +b.dataset.rewrite));
  const s = $('#rgSoften'); if (s) s.onclick = () => rgSoften(p);
  $('#rgToMont').onclick = () => rgToMontage(p);
}
function renderRegiaList() { const p = rgProj(); const o = $(`#rgProjects option[value="${RG.cur}"]`); if (o && p && p.bible) o.textContent = p.bible.title; }
$('#rgProjects').onchange = () => { RG.cur = $('#rgProjects').value; renderRegia(); };
$('#rgNew').onclick = () => { RG.draft = rgNewProj(); RG.cur = '__draft'; renderRegia(); $('#rgIdea').focus(); };
let rgRefT = 0;
function regiaRefresh() { clearTimeout(rgRefT); rgRefT = setTimeout(() => { if ($('#view-regista').classList.contains('active') && !document.querySelector('#rgBody :focus')) renderRegia(); }, 400); }

/* =================== REGISTA: scrittura con l'AI =================== */
function castBrief() { return S.chars.length ? S.chars.map(c => `- ${c.name}: ${c.desc || 'photo available'}`).join('\n') : '(empty: invent the characters)'; }
async function rgWrite(p) {
  if (!key()) { toast('Collega prima RunPod'); return openSettings(); }
  if (p.idea.trim().length < 15 && !p.script) { toast('Racconta l\'idea con qualche parola in più, oppure carica il copione in PDF'); return $('#rgIdea').focus(); }
  if (p.bible && !confirm('Riscrivere tutto da capo? Storia, personaggi e inquadrature verranno sostituiti (i ciak già girati restano in Galleria).')) return;
  if (!rgList().some(x => x.id === p.id)) { rgSave(p); RG.cur = p.id; RG.draft = null; }
  RG.cur = p.id;
  const steps = [
    { t: 'Capisco l\'idea', d: 'tema, tono ed emozioni della storia', st: 'run' },
    { t: 'Personaggi e luoghi', d: 'aspetto fisso di ogni personaggio, pochi luoghi ben definiti', st: '' },
    { t: 'Trama in parti', d: `divido ${p.length} secondi in parti di 12–25 secondi`, st: '' },
    { t: 'Controllo dei contenuti', d: 'verifico cosa accetta il modello scelto', st: '' }
  ];
  RG.thinking = { pid: p.id, steps }; renderRegia();
  const th = $('#rgThink'); if (th) th.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const btn = $('#rgWrite'); btn.disabled = true;
  try {
    const sys = 'You are an award-winning film director and screenwriter. You plan short films that will be produced entirely with AI video generators, one short shot at a time, so the story must be simple, visual and physically filmable. Write user-facing fields in ITALIAN and every field ending in _en in ENGLISH. Reply ONLY with valid JSON.';
    const src = p.script ? `\nSOURCE SCREENPLAY / MASTER (follow its plot, characters, settings and dialogue; condense it to the target length, keep the most important scenes and lines):\n"""\n${p.script.text.slice(0, 26000)}\n"""\n` : '';
    const usr = `IDEA (from the user, Italian): ${p.idea || '(take it from the screenplay)'}${src}
TOTAL LENGTH: ${p.length} seconds
GENRE / TONE: ${p.genre}
ASPECT RATIO: ${p.ratio}
AVAILABLE CAST (use these exact names when they fit; invent others only if needed):
${castBrief()}

Rules:
- Max 3 recurring characters and max 3 locations. No crowds, no on-screen text, no complex fights or intertwined bodies, no fast action.
- Show emotions through simple physical actions, looks and light, not dialogue.
- Split the film into consecutive parts of 12-25 seconds covering exactly 0..${p.length} s with no gaps.
- Each character gets one fixed look_en (apparent age, build, face, hair, one outfit) reused identically in every shot.
- Rate the content honestly: "tutti" (all audiences), "maturo" (adult themes, nothing explicit), "violento" (strong violence), "esplicito" (nudity or sexual content).

JSON schema:
{"title":"","logline":"","story":"5-8 sentences","themes":"emotions and themes in Italian","look":{"style_en":"","palette_en":"","lighting_en":"","camera_en":""},"characters":[{"name":"","cast":"exact cast name or empty","role":"","gender":"m|f","age":30,"voice":"Italian, 3-6 words describing the voice","look_en":""}],"locations":[{"name":"","look_en":""}],"parts":[{"title":"","start":0,"end":15,"summary":"3-5 Italian sentences: what we SEE"}],"rating":{"level":"tutti|maturo|violento|esplicito","notes":"Italian, one sentence"}}`;
    const B = await llmJSON(sys, usr, 3500, s => { steps[0].d = s === 'IN_QUEUE' ? 'RunPod accende il modello di testo…' : 'tema, tono ed emozioni della storia'; rgThinkRender(); });
    steps.forEach(s => s.st = 'done'); steps[0].d = B.themes || steps[0].d; rgThinkRender();
    (B.characters || []).forEach((c, k) => { const m = S.chars.find(x => x.name.toLowerCase() === String(c.cast || c.name).toLowerCase()); c.castId = m ? m.id : null; c.voiceId = autoVoice(c, k); });
    let parts = (B.parts || []).map(x => ({ id: uid(), title: x.title, start: +x.start || 0, end: +x.end || 0, summary: x.summary, shots: [] }));
    if (!parts.length) throw new Error('nessuna parte nella trama');
    p.bible = B; p.parts = parts; rgSave(p);
    await rgShotsAll(p, steps);
    toast('Storia pronta: controlla personaggi e inquadrature, poi gira parte per parte');
  } catch (e) { toast('Il regista non è riuscito: ' + e.message, 7000); }
  RG.thinking = null; renderRegia();
}
async function rgShotsAll(p, steps) {
  const idx = p.parts.map((_, i) => i);
  idx.forEach(i => steps.push({ t: `Inquadrature · parte ${i + 1}`, d: 'prompt per ' + MODELS[p.engine].name + ' e controllo del realismo', st: '' }));
  const base = steps.length - idx.length;
  const queue = [...idx];
  const worker = async () => {
    while (queue.length) {
      const i = queue.shift(); steps[base + i].st = 'run'; rgThinkRender();
      try { p.parts[i].shots = await rgShots(p, i); steps[base + i].st = 'done'; steps[base + i].d = `${p.parts[i].shots.length} inquadrature`; }
      catch (e) { steps[base + i].st = 'err'; steps[base + i].d = 'non riuscita: usa "Riscrivi inquadrature"'; }
      rgSave(p); rgThinkRender();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}
function shotsSystem(engine) {
  const m = MODELS[engine];
  return `You are a cinematographer and an expert prompt engineer for AI video models. You break a story part into shots that the model "${m.name}" can render with REAL, physically believable motion.
${RULES_EN}
MODEL GUIDE: ${MODEL_GUIDE[engine] || MODEL_GUIDE.wan}
ALLOWED SHOT DURATIONS (seconds): ${(m.durations && m.durations.length ? m.durations : [5]).join(', ')}. Prefer 4-6 s for shots with people moving, up to 8-10 s only for calm establishing shots.
Each prompt must be self-contained: repeat the full look_en of every visible character and of the location, plus the global look (style, palette, lighting, lens).
For "motion" describe the physics of the movement: speed, weight shifts, contact points, what moves secondarily (cloth, hair, dust, light).
DIALOGUE: when a character speaks, put the spoken words in "lines" (Italian, natural spoken language, max 14 words per line, ONE speaker per shot). A speaking shot is a medium close-up or close-up of the speaker, facing the camera at three-quarters, mouth clearly visible, small natural gestures; set "oncam": true. Lines spoken off-screen or over other images use "oncam": false.
Reply ONLY with JSON: {"shots":[{"dur":5,"chars":["exact character names in frame"],"location":"name","framing":"Italian, e.g. piano medio","camera":"English camera move","action":"ONE Italian sentence","motion":"English physics of the movement","prompt":"English, model-specific","negative":"English, scene-specific things to avoid","lines":[{"char":"name","text":"Italian line","emotion":"neutral|happy|sad|angry|fearful|surprised","oncam":true}]}]}`;
}
function bibleBrief(p) {
  const B = p.bible;
  return JSON.stringify({ title: B.title, story: B.story, look: B.look, characters: (B.characters || []).map(c => ({ name: c.name, look_en: c.look_en })), locations: B.locations });
}
async function rgShots(p, i, fixNotes) {
  const pt = p.parts[i], len = Math.max(4, pt.end - pt.start);
  const prev = p.parts[i - 1], next = p.parts[i + 1];
  const usr = `FILM BIBLE: ${bibleBrief(p)}
PART ${i + 1} (${pt.start}-${pt.end} s, ${len} s): ${pt.summary}
${prev ? 'Previous part ends with: ' + (prev.summary || '').slice(-200) : 'This is the opening of the film.'}
${next ? 'Next part: ' + (next.summary || '').slice(0, 200) : 'This is the ending of the film.'}
Aspect ratio ${p.ratio}. Make the shot durations add up to about ${len} s.
DIALOGUE MODE: ${p.dialog === 'no' ? 'no dialogue at all, "lines" always empty' : p.dialog === 'copione' && p.script ? 'use the dialogue of the screenplay for this part (shortened if needed)' : 'only a few short meaningful lines, most shots silent'}.${p.script ? '\nSCREENPLAY EXCERPT for reference:\n' + rgScriptFor(p, i) : ''}${p.bible.rating && p.bible.rating.level !== 'tutti' ? '\nKeep every shot non-explicit and implied (cut away, looks, aftermath), acceptable for mainstream video models.' : ''}${fixNotes ? '\nFIX THESE PROBLEMS from the previous version: ' + fixNotes : ''}`;
  const r = await llmJSON(shotsSystem(p.engine), usr, 3500);
  let shots = (r.shots || []).map(s => ({ id: uid(), dur: +s.dur || 5, chars: (s.chars || []).filter(Boolean), location: s.location || '', framing: s.framing || '', camera: s.camera || '', action: s.action || '', motion: s.motion || '', prompt: s.prompt || '', negative: s.negative || '', lines: p.dialog === 'no' ? [] : (s.lines || []).filter(l => l && l.text).slice(0, 2).map(l => ({ char: l.char || (s.chars || [])[0] || '', text: String(l.text).trim(), emotion: l.emotion || 'neutral', oncam: l.oncam !== false })) }));
  if (!shots.length) throw new Error('nessuna inquadratura');
  // algoritmo di realismo: controlla ogni inquadratura e fa riscrivere quelle a rischio
  const bad = shots.map((s, k) => ({ k, L: lintShot(s, p.engine) })).filter(x => x.L.score < 70);
  if (bad.length && !fixNotes) {
    try {
      const fix = await llmJSON(shotsSystem(p.engine), `Rewrite ONLY these shots so the motion becomes simple and physically real, keeping their story meaning. Same JSON schema, same order.\n${bad.map(b => `SHOT ${b.k + 1}: ${JSON.stringify(shots[b.k])}\nPROBLEMS: ${b.L.issues.join('; ')}`).join('\n')}`, 2500);
      (fix.shots || []).forEach((s, j) => { const b = bad[j]; if (b && s.prompt) Object.assign(shots[b.k], { action: s.action || shots[b.k].action, motion: s.motion || shots[b.k].motion, prompt: s.prompt, negative: s.negative || shots[b.k].negative, camera: s.camera || shots[b.k].camera, chars: (s.chars || shots[b.k].chars) }); });
    } catch (e) { }
  }
  // durata: rispetta i limiti del modello e accorcia le scene complesse
  shots.forEach(s => { const L = lintShot(s, p.engine); s.dur = nearestDur(p.engine, Math.min(s.dur, L.maxDur)); });
  return shots;
}
async function rgRewritePart(p, i) {
  const pt = p.parts[i];
  const ran = pt.shots.some(s => shotState(s).st === 'ok');
  if (ran && !confirm('Riscrivere le inquadrature di questa parte? I ciak già girati restano in Galleria ma non saranno più collegati.')) return;
  const b = $(`[data-rewrite="${i}"]`); if (b) { b.disabled = true; b.textContent = '✍️ Scrivo…'; }
  try { pt.shots = await rgShots(p, i); rgSave(p); toast(`Parte ${i + 1} riscritta`); }
  catch (e) { toast('Non riuscito: ' + e.message, 6000); }
  renderRegia();
}
async function rgSoften(p) {
  const b = $('#rgSoften'); b.disabled = true; b.textContent = 'Riscrivo…';
  try {
    const r = await llmJSON('You are a film editor. Rewrite the story so every sensitive moment is implied, never shown explicitly (cut away, looks, aftermath, fade to black), acceptable for mainstream video models. Keep the same characters and structure. Italian text. Reply ONLY with JSON {"story":"","parts":[{"summary":""}],"rating":{"level":"tutti|maturo","notes":""}}.',
      JSON.stringify({ story: p.bible.story, parts: p.parts.map(x => ({ summary: x.summary })) }), 2500);
    if (r.story) p.bible.story = r.story;
    (r.parts || []).forEach((x, i) => { if (p.parts[i] && x.summary) p.parts[i].summary = x.summary; });
    p.bible.rating = r.rating || { level: 'maturo' };
    rgSave(p); renderRegia();
    RG.thinking = { pid: p.id, steps: [] }; await rgShotsAll(p, RG.thinking.steps); RG.thinking = null;
    toast('Storia resa suggerita e inquadrature riscritte');
  } catch (e) { toast('Non riuscito: ' + e.message, 6000); }
  renderRegia();
}
async function rgAiChar(p, i, btn) {
  const c = p.bible.characters[i];
  btn.disabled = true; btn.textContent = '🎨 Disegno…';
  try {
    const img = await aiPortrait(c.name, c.look_en || c.name);
    const ch = { id: uid(), name: c.name, desc: (c.role ? c.role + '. ' : '') + (c.look_en || ''), img, created: Date.now(), ai: true };
    await dbPut('chars', ch); S.chars.push(ch); renderChars(); renderRefChars();
    c.castId = ch.id; rgSave(p); toast(`${c.name} è nel Cast ✓ Puoi ritoccarlo con ✏️`);
  } catch (e) { toast('Foto non riuscita: ' + e.message, 6000); }
  renderRegia();
}

/* =================== REGISTA: si gira =================== */
async function rgShootPart(p, pi) {
  if (!key()) { toast('Collega prima RunPod'); return openSettings(); }
  const ver = ratingVerdict(p.bible.rating, p.engine);
  if (!ver.ok && !confirm(`Attenzione: ${ver.txt}\nGirare comunque? Le scene rifiutate da RunPod non costano.`)) return;
  const pt = p.parts[pi];
  const todo = pt.shots.filter(s => ['todo', 'err'].includes(shotState(s).st));
  const cost = todo.reduce((k, s) => k + shotCost(p, s), 0);
  if (cost >= 3 && !confirm(`Gira la parte ${pi + 1}: ${todo.length} ciak, circa ${money(cost)}. Procedo?`)) return;
  if (needsKeyframe(p, todo[0] || {}) && !r2On()) toast('Consiglio: attiva l\'archivio R2, i fotogrammi con i volti funzionano meglio con i link', 5000);
  todo.forEach(s => { delete s.err; }); rgSave(p);
  let n = 0;
  const queue = [...todo];
  const worker = async () => { while (queue.length) { const s = queue.shift(); try { await rgShoot(p, s); n++; } catch (e) { s.err = e.message; rgSave(p); } regiaRefresh(); } };
  await Promise.all([worker(), worker(), worker()]);
  toast(`Parte ${pi + 1}: ${n} ciak in ripresa. Li trovi qui e in Galleria quando sono pronti`);
  renderRegia();
}
async function rgShoot(p, sh) {
  const B = p.bible, line = p.dialog !== 'no' ? (sh.lines || [])[0] : null;
  if (line) {
    const vid = voiceOfChar(p, line.char);
    if (!sh.voice || sh.voice.text !== line.text || sh.voice.vid !== vid || sh.voice.emotion !== line.emotion) {
      RG.busy.set(sh.id, 'Voce'); regiaRefresh();
      try { sh.voice = await ttsLine(p, line); rgSave(p); } finally { RG.busy.delete(sh.id); }
    }
  } else delete sh.voice;
  const talk = isTalk(p, sh) && sh.voice && sh.voice.dur > 0;
  const engine = talk ? 'talk' : p.engine, m = MODELS[engine];
  const people = (sh.chars || []).map(n => charOfName(p, n));
  const look = B.look ? [B.look.style_en, B.look.palette_en, B.look.lighting_en, B.look.camera_en].filter(Boolean).join(', ') : '';
  const prompt = realismPrompt(sh) + (look && !sh.prompt.includes(look.slice(0, 20)) ? ' Look: ' + look + '.' : '');
  let img = null;
  if (needsKeyframe(p, sh) || talk) {
    RG.busy.set(sh.id, 'Fotogramma'); regiaRefresh();
    try {
      const casts = people.filter(x => x.cast).map(x => x.cast).slice(0, 4);
      const kfPrompt = `Cinematic film still, the very first frame of this shot: ${sh.prompt} ${look ? 'Look: ' + look + '.' : ''} ${casts.length ? 'Use the exact faces, hairstyles and clothing of the people in the reference images; each person appears only once.' : ''} Photorealistic, natural skin texture, correct anatomy with two arms and two hands per person, nobody else in frame, no text.`;
      if (casts.length) {
        const imgs = []; for (const c of casts) imgs.push(await charModelUrl(c));
        img = await rpJob('seedream-v4-edit', { prompt: kfPrompt, images: imgs, size: kfSize(p.ratio), enable_safety_checker: true });
      } else {
        img = await rpJob('qwen-image-t2i', { prompt: kfPrompt, negative_prompt: NEG_BASE, size: kfSize(p.ratio), seed: -1, enable_safety_checker: true });
      }
      sh.kf = { url: img, t: Date.now() };
      try { sh.kf.img = await urlToJpeg(img, 480); } catch (e) { }
      rgSave(p);
    } finally { RG.busy.delete(sh.id); }
  }
  let dur = nearestDur(p.engine, sh.voice ? Math.max(sh.dur, Math.ceil(sh.voice.dur + 0.8)) : sh.dur);
  let audioIn = null;
  if (talk) { dur = Math.ceil(sh.voice.dur); audioIn = sh.voice.key && r2On() ? await libUrl(sh.voice.key) : sh.voice.url; }
  const o = {
    engine, prompt: talk ? `${sh.prompt} ${line.char} speaks with natural lip movement, subtle head motion and blinking, small natural hand gestures, the same person throughout.` : prompt,
    rawPrompt: `🎥 ${B.title || 'Regia'} · ${sh.action || ''}${line ? ' 💬 ' + line.text : ''}`.slice(0, 300),
    negative: m.neg ? [sh.negative, NEG_BASE].filter(Boolean).join(', ').slice(0, 900) : '',
    ratio: m.ratios ? (m.ratios.includes(p.ratio) ? p.ratio : m.ratios[0]) : p.ratio,
    duration: dur, res: talk ? '720p' : (m.defRes || (m.res && m.res[0]) || '720p'),
    audio: p.audio, ex: {}, startImg: img, charImgs: [], charIds: people.filter(x => x.cast).map(x => x.cast.id),
    img, audioIn, refVideoId: '', refDuration: 0, klAudio: false
  };
  return await launchClip(o, { rgShot: sh.id, rgProj: p.id });
}

/* =================== REGISTA: dettaglio inquadratura =================== */
function openShot(p, pi, si) {
  const sh = p.parts[pi].shots[si], s = shotState(sh), L = lintShot(sh, p.engine);
  $('#shTitle').textContent = `Inquadratura ${pi + 1}.${si + 1}`;
  const media = s.clip ? `<video src="${clipSrc(s.clip)}" controls playsinline></video>` : sh.kf && (sh.kf.img || sh.kf.url) ? `<img src="${sh.kf.img || sh.kf.url}" alt="">` : '';
  $('#shBody').innerHTML = `${media ? `<div class="sh-media">${media}</div>` : ''}
    <p class="sh-act"><b>${esc(sh.action || '')}</b><br><span class="muted small">${esc(sh.framing || '')} · ${nearestDur(p.engine, sh.dur)} s · ${esc((sh.chars || []).join(', ') || 'nessun personaggio')}</span></p>
    <div class="sh-real ${L.score >= 80 ? 'g' : L.score >= 60 ? 'y' : 'r'}"><b>Realismo ${L.score}/100</b>${L.issues.length ? '<ul>' + L.issues.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>' : '<span> movimento semplice e credibile ✓</span>'}</div>
    ${s.st === 'err' ? `<p class="status ko">${esc(s.err || '')}</p>` : ''}
    ${p.dialog !== 'no' ? `<div class="sh-lines"><b>Battute</b>${(sh.lines || []).length ? sh.lines.map((l, k) => `<div class="sh-line"><span>${esc(l.char)}</span><input data-lt="${k}" value="${esc(l.text)}"><select data-le="${k}">${EMOTIONS.map(([v, t]) => `<option value="${v}" ${l.emotion === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`).join('') : '<span class="muted small"> nessuna, inquadratura muta</span>'}
      ${sh.voice ? `<audio controls src="${sh.voice.url}"></audio>` : ''}
      ${isTalk(p, sh) ? '<p class="muted small">Parla in camera: InfiniteTalk muoverà le labbra a tempo con la voce.</p>' : ''}</div>` : ''}
    <label>Prompt per ${esc(MODELS[p.engine].name)} (inglese)<textarea id="shPrompt" rows="7">${esc(sh.prompt)}</textarea></label>
    <details class="adv"><summary>Fisica del movimento e cosa evitare</summary>
      <label>Movimento<textarea id="shMotion" rows="2">${esc(sh.motion || '')}</textarea></label>
      <label>Cosa evitare<textarea id="shNeg" rows="2">${esc(sh.negative || '')}</textarea></label></details>
    <div class="actions">
      <button class="btn primary" id="shGo" ${s.st === 'run' || s.st === 'kf' ? 'disabled' : ''}>${s.st === 'ok' ? '↻ Rigira' : '🎬 Gira'} · ≈ ${money(shotCost(p, sh))}</button>
      <button class="btn" id="shFix">✨ Rendi più realistico</button>
      ${s.clip ? '<button class="btn" id="shGal">Apri in Galleria</button>' : ''}
    </div>`;
  const save = () => {
    sh.prompt = $('#shPrompt').value; sh.motion = $('#shMotion').value; sh.negative = $('#shNeg').value;
    $$('#shBody [data-lt]').forEach(i => { sh.lines[+i.dataset.lt].text = i.value.trim(); });
    $$('#shBody [data-le]').forEach(s => { sh.lines[+s.dataset.le].emotion = s.value; });
    sh.lines = (sh.lines || []).filter(l => l.text); rgSave(p);
  };
  $$('#shBody [data-lt], #shBody [data-le]').forEach(x => x.onchange = save);
  ['#shPrompt', '#shMotion', '#shNeg'].forEach(x => $(x).onchange = save);
  $('#shGo').onclick = async () => {
    save(); const b = $('#shGo'); b.disabled = true; b.textContent = 'Invio…';
    try { delete sh.err; await rgShoot(p, sh); toast('Ciak in ripresa'); closeM($('#mShot')); } catch (e) { sh.err = e.message; rgSave(p); toast(e.message, 6000); b.disabled = false; }
    renderRegia();
  };
  $('#shFix').onclick = async () => {
    save(); const b = $('#shFix'); b.disabled = true; b.textContent = '✨ Riscrivo…';
    try {
      const r = await llmJSON(shotsSystem(p.engine), `FILM BIBLE: ${bibleBrief(p)}\nRewrite this single shot to make the motion simpler and physically real, same story meaning. Problems found: ${L.issues.join('; ') || 'make it more cinematic and realistic'}.\nSHOT: ${JSON.stringify(sh)}\nReply with {"shots":[ONE shot]}`, 1500);
      const n = (r.shots || [])[0];
      if (n && n.prompt) { Object.assign(sh, { prompt: n.prompt, motion: n.motion || sh.motion, negative: n.negative || sh.negative, action: n.action || sh.action, camera: n.camera || sh.camera }); sh.dur = nearestDur(p.engine, Math.min(+n.dur || sh.dur, lintShot(sh, p.engine).maxDur)); rgSave(p); }
      openShot(p, pi, si); renderRegia();
    } catch (e) { toast('Non riuscito: ' + e.message, 6000); b.disabled = false; b.textContent = '✨ Rendi più realistico'; }
  };
  const g = $('#shGal'); if (g) g.onclick = () => { closeM($('#mShot')); openViewer(s.clip.id); };
  openM('mShot');
}

/* =================== REGISTA: al montaggio =================== */
function rgToMontage(p) {
  const clips = [], pairs = [];
  p.parts.forEach(pt => pt.shots.forEach(sh => { const s = shotState(sh); if (s.clip) { clips.push(s.clip); pairs.push({ clip: s.clip, sh }); } }));
  if (!clips.length) return toast('Nessun ciak ancora pronto');
  const tot = p.parts.reduce((n, pt) => n + pt.shots.length, 0);
  if (clips.length < tot && !confirm(`Sono pronti ${clips.length} ciak su ${tot}. Montare intanto quelli pronti?`)) return;
  const cur = proj();
  if ((cur.items.length || cur.audio.length || cur.texts.length) && !confirm('Sostituire il film che hai ora nel montaggio? (I film già montati restano.)')) return;
  edStop(); MT.proj = edDefault(); MT.proj.title = p.bible.title || ''; MT.proj.clipAudio = !!p.audio;
  MT.proj.items.push({ id: nid(), kind: 'card', text: p.bible.title || 'Film', dur: 3, trans: { type: 'cut', dur: 0.6 } });
  clips.forEach(c => edAddVideo(c.id));
  MT.proj.items.forEach((it, i) => { if (i > 1) it.trans = { type: 'cut', dur: 0.6 }; else if (i === 1) it.trans = { type: 'fade', dur: 0.8 }; });
  // battute sulla traccia voce, a tempo con il loro ciak (diventano anche i sottotitoli)
  const { L } = layout(); let nv = 0;
  pairs.forEach((pr, k) => {
    const v = pr.sh.voice, line = (pr.sh.lines || [])[0]; if (!v || !line) return;
    const talk = pr.clip.settings.engine === 'talk';
    const start = L[k + 1].start + (talk ? 0 : 0.4);
    MT.proj.audio.push({ id: nid(), lane: 'voice', src: v.key ? { key: v.key } : String(v.url).startsWith('data:') ? { b64: v.url } : { url: v.url }, name: `${line.char}: ${line.text}`.slice(0, 60), start: +start.toFixed(2), in: 0, dur: v.dur, srcDur: v.dur, vol: 1, fin: 0, fout: 0, loop: false, sub: line.text, who: line.char });
    nv++;
  });
  mtSave(); go('montaggio');
  toast(nv ? `Film nel montaggio con ${nv} battute: i sottotitoli sono già pronti dopo "Monta il film"` : 'Film nel montaggio: aggiungi musica, voce e sottotitoli', 6000);
}

/* =================== copione PDF, voci dei personaggi =================== */
async function rgLoadPdf(p, f) {
  if (!montId()) { toast('Per leggere il PDF serve il worker di montaggio: collegalo in ⚙︎'); return; }
  if (f.size > 25 * 1024 * 1024) return toast('PDF troppo grande (massimo 25 MB)');
  const box = document.querySelector('.rg-script'); if (box) box.innerHTML = '<span class="muted">📄 RunPod legge il copione…</span>';
  try {
    let src;
    if (r2On()) src = { key: (await uploadToR2(f, f.name.replace(/[^\w.\-]+/g, '_'), 'temp')).key };
    else if (f.size < 7 * 1024 * 1024) src = { b64: await b64Of(f) };
    else throw new Error('senza archivio R2 il PDF deve essere sotto i 7 MB');
    const out = await workerCall({ action: 'pdf_text', src }, 300);
    const text = (out.text || '').trim();
    if (text.length < 200) throw new Error('il PDF non contiene testo leggibile (forse è una scansione): esportalo come PDF di testo');
    p.script = { name: f.name, text, pages: out.pages || 0 };
    p.dialog = 'copione';
    rgSave(p); RG.cur = p.id; RG.draft = null;
    toast(`Copione letto: ${out.pages || '?'} pagine. Ora premi "Scrivi la storia"`);
  } catch (e) { toast('Copione non letto: ' + e.message, 7000); }
  renderRegia();
}
function rgScriptFor(p, i) {
  const t = p.script.text, pt = p.parts[i], len = Math.max(1, p.length);
  const a = Math.max(0, Math.floor(t.length * (pt.start / len)) - 800);
  return t.slice(a, a + 4000);
}
const VOICE_POOL = {
  m: { old: ['Deep_Voice_Man', 'Patient_Man', 'Imposing_Manner'], mid: ['Determined_Man', 'Elegant_Man', 'Patient_Man'], young: ['Casual_Guy', 'Decent_Boy', 'Young_Knight'] },
  f: { old: ['Wise_Woman', 'Abbess', 'Calm_Woman'], mid: ['Calm_Woman', 'Friendly_Person', 'Inspirational_girl'], young: ['Lively_Girl', 'Sweet_Girl_2', 'Lovely_Girl'] }
};
function autoVoice(c, k) {
  const g = String(c.gender || '').toLowerCase().startsWith('f') ? 'f' : 'm', a = +c.age || 35;
  const pool = VOICE_POOL[g][a >= 50 ? 'old' : a < 25 ? 'young' : 'mid'];
  return 'mm:' + pool[k % pool.length];
}
function voiceOptions(sel) {
  const clones = voiceProfiles();
  return `<optgroup label="Voci AI (MiniMax)">${VOICES.map(([id, t]) => `<option value="mm:${id}" ${sel === 'mm:' + id ? 'selected' : ''}>🗣 ${t}</option>`).join('')}</optgroup>` +
    (clones.length ? `<optgroup label="Le mie voci clonate">${clones.map(v => `<option value="clone:${v.id}" ${sel === 'clone:' + v.id ? 'selected' : ''}>🎙 ${esc(v.name)}</option>`).join('')}</optgroup>` : '');
}
function voiceOfChar(p, name) { const { ch } = charOfName(p, name); return (ch && ch.voiceId) || 'mm:Friendly_Person'; }
function audioDur(url) {
  return new Promise(res => { const a = new Audio(); a.preload = 'metadata'; a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : 0); a.onerror = () => res(0); a.src = url; setTimeout(() => res(0), 15000); });
}
async function ttsLine(p, line) {
  const vid = voiceOfChar(p, line.char), base = `voce-${safeFile(line.char)}-${safeFile(line.text.slice(0, 24))}`;
  let url = null, key = null, dur = 0;
  if (vid.startsWith('clone:')) {
    const prof = voiceProfiles().find(v => v.id === vid.slice(6));
    if (!prof) throw new Error(`la voce clonata di ${line.char} non esiste più: scegline un'altra`);
    const out = await voceCall({ action: 'tts', text: line.text, lang: 'it', ref: await refOf(prof), exaggeration: line.emotion && line.emotion !== 'neutral' ? 0.75 : 0.5, cfg_weight: 0.5 });
    if (!out.audio_b64) throw new Error('la voce clonata non ha restituito audio');
    const blob = await (await fetch('data:audio/mpeg;base64,' + out.audio_b64)).blob();
    dur = out.duration || 0;
    if (r2On()) { const up = await uploadToR2(blob, base + '.mp3', 'libreria'); key = up.key; url = up.get; } else url = 'data:audio/mpeg;base64,' + out.audio_b64;
  } else {
    const r = await rp('/minimax-speech-02-hd/run', { method: 'POST', body: JSON.stringify({ input: { prompt: line.text, voice_id: vid.slice(3), speed: 1, volume: 1, pitch: 0, emotion: line.emotion || 'neutral', english_normalization: false } }) });
    let out = r.status === 'COMPLETED' ? r.output : null;
    for (let n = 0; out == null && r.id && n < 80; n++) {
      await wait(2000);
      const s = await rp(`/minimax-speech-02-hd/status/${r.id}`);
      if (s.status === 'COMPLETED') out = s.output; else if (BAD.includes(s.status)) throw new Error(s.error || s.status);
    }
    url = out && (typeof out === 'string' ? out : (out.audio_url || out.result || out.url || out.audio || (out.output && (out.output.audio_url || out.output.result))));
    if (!url) throw new Error('RunPod non ha restituito la voce');
    ls('spent', String((parseFloat(ls('spent')) || 0) + line.text.length * VOICE_PRICE)); showSpent();
    if (r2On() && montId()) { try { key = (await workerCall({ action: 'save_url', url, key: `libreria/${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${uid().slice(0, 6)}-${base}.mp3`, type: 'audio/mpeg' })).key; } catch (e) { } }
  }
  if (!dur) dur = await audioDur(url);
  if (!dur) dur = Math.max(1.5, line.text.split(/\s+/).length / 2.6);
  return { url, key, dur: +dur.toFixed(2), text: line.text, vid, emotion: line.emotion, t: Date.now() };
}
async function rgVoiceTest(p, i, btn) {
  const c = p.bible.characters[i];
  const first = p.parts.flatMap(pt => pt.shots).flatMap(s => s.lines || []).find(l => l.char === c.name);
  const line = { char: c.name, text: first ? first.text : `Ciao, sono ${c.name}.`, emotion: first ? first.emotion : 'neutral' };
  btn.disabled = true; btn.textContent = '🔊 …';
  try { const v = await ttsLine(p, line); new Audio(v.url).play().catch(() => { }); }
  catch (e) { toast('Voce non riuscita: ' + e.message, 6000); }
  btn.disabled = false; btn.textContent = '🔊 Prova voce';
}
