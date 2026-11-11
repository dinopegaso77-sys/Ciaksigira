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
10. Continuity: same time of day, lighting and wardrobe inside the same location.
11. Composition: say where each person stands in the frame (left / right / centre, foreground / background, distance) and where each one is LOOKING (at whom or what).
12. Screens, whiteboards, windows and glass are matte, without reflections. Avoid clasped, joined or intertwined hands.`;

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
  const people = (sh.chars || []).length, all = p + ' ' + (sh.frame || '');
  if (people > 2) { issues.push('più di 2 persone in scena'); score -= 15; }
  if (people && !/\bhands?\b/i.test(all)) { issues.push('non dice dove sono le mani'); score -= 6; }
  if (/hands? (are |held |pressed )?(together|clasped|joined|intertwined)|clasp(s|ed|ing)? (his|her|their) hands|joined hands/i.test(all)) { issues.push('mani giunte o intrecciate: spesso escono deformate'); score -= 10; }
  const gz = (sh.chars || []).filter(n => !(sh.gaze || []).some(g => g.char.toLowerCase() === String(n).toLowerCase() && g.at));
  const gazeTxt = /\b(look|looks|looking|gaze|gazes|gazing|eyes (on|fixed|toward|towards|down|up|lowered|closed)|eyeline|watch|watches|watching|stares?|staring|glanc|observ|facing|turns? (his|her) head)/i.test(all);
  if (people && gz.length && !(gazeTxt && people === 1)) { issues.push(`non dice dove guarda${gz.length > 1 ? 'no' : ''}: ${gz.join(', ')}`); score -= 6; }
  const pl = (sh.chars || []).filter(n => !(sh.place || []).some(g => g.char.toLowerCase() === String(n).toLowerCase() && g.where));
  if (people >= 2 && pl.length && !/\b(left|right|centre|center|foreground|background)\b/i.test(all)) { issues.push('non dice chi sta a sinistra e chi a destra'); score -= 8; }
  if (/\b(screen|monitor|whiteboard|television|\btv\b|window|glass|mirror)/i.test(all) && !/matte|no reflections?|without reflections?/i.test(all)) { issues.push('schermi o vetri: possibili riflessi'); score -= 6; }
  if (people && !sh.frame) { issues.push('manca la descrizione del primo fotogramma'); score -= 5; }
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
  const bl = blockingText(sh); if (bl && !p.includes(bl)) p += (/[.!]$/.test(p) ? ' ' : '. ') + bl;
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
/* ogni spesa va nel totale dell'app e, durante un lavoro del Regista, anche nel conto del progetto */
function addSpend(c) {
  if (!(c > 0)) return;
  ls('spent', String((parseFloat(ls('spent')) || 0) + c)); showSpent();
  if (RG.spendTo) rgMut(RG.spendTo, p => { p.spent = (p.spent || 0) + c; });
}
function llmCost(o0, maxTokens) {
  const u = o0 && o0.usage;
  const cost = (o0 && typeof o0.cost === 'number') ? o0.cost : u ? ((u.input || u.prompt_tokens || 0) + (u.output || u.completion_tokens || 0)) / 1e6 * 10 : maxTokens / 1e6 * 10;
  addSpend(cost);
}
function cleanLLM(t) {
  t = String(t || '');
  t = t.replace(/<think>[\s\S]*?<\/think>/g, '');
  if (t.includes('</think>')) t = t.slice(t.lastIndexOf('</think>') + 8);
  return t.replace(/<\|im_end\|>[\s\S]*$/, '').replace(/^\s*<think>\s*/, '').trim();
}
/* 1ª via: endpoint "chat" compatibile OpenAI (applica il formato giusto per Qwen3) */
async function llmChat(system, user, maxTokens) {
  const r = await rp(`/${LLM_EP}/openai/v1/chat/completions`, { method: 'POST', retry: 1, body: JSON.stringify({
    model: 'Qwen/Qwen3-32B-AWQ', max_tokens: maxTokens, temperature: 0.6, top_p: 0.9,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user + '\n/no_think' }],
    chat_template_kwargs: { enable_thinking: false }
  }) });
  const c = r && r.choices && r.choices[0];
  const t = c && ((c.message && c.message.content) || c.text);
  if (!t) throw new Error('nessun testo dalla via chat');
  llmCost(r, maxTokens);
  return cleanLLM(t);
}
/* 2ª via: endpoint nativo con il formato di Qwen3 scritto a mano */
async function llmNative(system, user, maxTokens, onWait) {
  const prompt = `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${user}\n/no_think<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`;
  const r = await rp(`/${LLM_EP}/run`, { method: 'POST', retry: 2, body: JSON.stringify({ input: { prompt, max_tokens: maxTokens, temperature: 0.6, top_p: 0.9, stop: '<|im_end|>' } }) });
  let out = r.status === 'COMPLETED' ? r.output : null;
  for (let n = 0; out == null && r.id && n < 160; n++) {
    await wait(2500);
    const s = await rp(`/${LLM_EP}/status/${r.id}`);
    if (s.status === 'COMPLETED') out = s.output;
    else if (BAD.includes(s.status)) throw new Error(s.error || s.status);
    else if (onWait) onWait(s.status);
  }
  llmCost(Array.isArray(out) ? out[0] : out, maxTokens);
  const t = deepText(out);
  if (!t) throw new Error('il modello di testo non ha risposto');
  return cleanLLM(t);
}
async function llm(system, user, maxTokens = 3000, onWait, wantJSON) {
  let t = '';
  if (onWait) onWait('RUN');
  try { t = await llmChat(system, user, maxTokens); }
  catch (e) { if (/Chiave/.test(e.message)) throw e; }
  if (!t || (wantJSON && t.indexOf('{') < 0)) t = await llmNative(system, user, maxTokens, onWait);
  try { ls('llmLast', t.slice(0, 4000)); } catch (e) { }
  return t;
}
/* chiude un JSON rimasto tagliato a metà (risposta troppo lunga) */
function closeJSON(s) {
  const st = []; let inS = false, esc2 = false, lastSafe = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inS) { if (esc2) esc2 = false; else if (ch === '\\') esc2 = true; else if (ch === '"') inS = false; continue; }
    if (ch === '"') inS = true;
    else if (ch === '{' || ch === '[') st.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') { st.pop(); lastSafe = i + 1; }
    else if (ch === ',') lastSafe = i;
  }
  let out = s;
  if (inS || st.length) {
    out = s.slice(0, lastSafe).replace(/,\s*$/, '');
    const st2 = [];
    let q = false, e2 = false;
    for (const ch of out) {
      if (q) { if (e2) e2 = false; else if (ch === '\\') e2 = true; else if (ch === '"') q = false; continue; }
      if (ch === '"') q = true; else if (ch === '{') st2.push('}'); else if (ch === '[') st2.push(']'); else if (ch === '}' || ch === ']') st2.pop();
    }
    out += st2.reverse().join('');
  }
  return out;
}
function parseJSON(t) {
  t = String(t).replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('{');
  if (a < 0) throw new Error('risposta non valida: «' + t.slice(0, 140).replace(/\s+/g, ' ') + '»');
  const b = t.lastIndexOf('}');
  const tries = [t.slice(a, b + 1), closeJSON(t.slice(a))];
  for (const s of tries) {
    if (!s) continue;
    try { return JSON.parse(s); } catch (e) { }
    try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"')); } catch (e) { }
  }
  throw new Error('risposta non valida: «' + t.slice(a, a + 140).replace(/\s+/g, ' ') + '…»');
}
async function llmJSON(system, user, maxTokens, onWait) {
  const sys = system + '\nYour whole answer must be ONE JSON object that starts with { and ends with }. No markdown, no explanations.';
  try { return parseJSON(await llm(sys, user, maxTokens, onWait, true)); }
  catch (e) {
    if (/Chiave|401|403/.test(e.message)) throw e;
    return parseJSON(await llm(sys, user + '\n\nIMPORTANT: reply with ONE valid JSON object only, keep every text short.', Math.round(maxTokens * 1.3), onWait, true));
  }
}
async function toEnglish(txt) {
  if (!txt.trim()) return '';
  try { return (await llm('You translate short instructions into concise English. Reply with the translation only.', txt, 300)).replace(/^["']|["']$/g, ''); }
  catch (e) { return txt; }
}

/* =================== immagini (RunPod) =================== */
async function rpJob(endpoint, input, maxWait = 300) {
  const r = await rp(`/${endpoint}/run`, { method: 'POST', retry: 1, body: JSON.stringify({ input }) });
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
  addSpend(cost);
  return url;
}
/* scarica un'immagine creata da RunPod. Alcuni server (es. Nano Banana) non lasciano scaricare al browser (CORS):
   in quel caso il worker di montaggio la copia nell'archivio R2 e la scarichiamo da lì. Gratis, niente da rigenerare. */
async function urlToJpeg(url, max = 1024) {
  try {
    const r = await fetch(url); if (!r.ok) throw new Error('http ' + r.status);
    return await fileToJpeg(await r.blob(), max);
  } catch (e) {
    if (!(r2On() && montId())) throw new Error('immagine creata ma non scaricabile dal browser: attiva l\'archivio R2 e il worker di montaggio in ⚙︎, poi riprova (non verrà ricreata)');
    let k;
    try { k = (await workerCall({ action: 'save_url', url, key: `temp/immagine-${uid()}.jpg`, type: 'image/jpeg' })).key; }
    catch (e2) { throw new Error('immagine creata ma non copiata nell\'archivio: ' + e2.message + ' (riprova: non verrà ricreata)'); }
    const r2 = await fetch(await libUrl(k)); if (!r2.ok) throw new Error('immagine copiata ma archivio non raggiungibile (riprova)');
    return await fileToJpeg(await r2.blob(), max);
  }
}
const kfSize = ratio => ratio === '9:16' ? '928*1664' : ratio === '1:1' ? '1328*1328' : '1664*928';
const RATIO_TXT = { '16:9': 'horizontal widescreen 16:9 landscape composition', '9:16': 'vertical 9:16 portrait composition', '1:1': 'square composition' };
function imgDims(src) { return new Promise(res => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res(null); i.src = src; }); }
function ratioOk(p, kf) {
  if (!kf || !kf.w || !kf.h) return true;
  const want = p.ratio === '9:16' ? 9 / 16 : p.ratio === '1:1' ? 1 : 16 / 9;
  return Math.abs((kf.w / kf.h) / want - 1) < 0.12;
}

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
const PE = { id: null, ph: null, sel: new Set() };
function peChar() { return S.chars.find(x => x.id === PE.id); }
function pePhoto(c) { const ph = charPhotos(c); return ph.find(p => p.id === PE.ph) || ph[0]; }
function openPhotoEdit(id, photoId) {
  const c = S.chars.find(x => x.id === id); if (!c) return;
  PE.id = id; PE.ph = photoId || charPhotos(c)[0].id; PE.sel.clear();
  $('#peImg').src = pePhoto(c).img; $('#peText').value = ''; $('#peStatus').textContent = '';
  $('#pePresets').innerHTML = PE_PRESETS.map((p, i) => `<button class="chip" data-pp="${i}">${p[0]}</button>`).join('');
  $$('#pePresets [data-pp]').forEach(b => b.onclick = () => { const i = +b.dataset.pp; PE.sel.has(i) ? PE.sel.delete(i) : PE.sel.add(i); b.classList.toggle('on', PE.sel.has(i)); });
  peButtons(c); openM('mPhotoEdit');
}
function peButtons(c) { const p = pePhoto(c); $('#peUndo').disabled = !(p.hist && p.hist.length); $('#peOrig').disabled = !p.orig || p.orig === p.img; }
async function setCharImg(c, img, keepHist = true) {
  const p = pePhoto(c);
  if (keepHist) { p.hist = [...(p.hist || []), p.img].slice(-5); if (!p.orig) p.orig = p.img; }
  p.img = img;
  await saveChar(c); $('#peImg').src = img; peButtons(c);
  if ($('#mCharSheet') && !$('#mCharSheet').classList.contains('hidden')) renderCsPhotos();
}
$('#peGo').onclick = async () => {
  const c = peChar(); if (!c) return;
  if (!key()) return toast('Collega prima RunPod');
  const free = $('#peText').value.trim();
  if (!PE.sel.size && !free) return toast('Scegli un ritocco o scrivi cosa cambiare');
  const btn = $('#peGo'), st = $('#peStatus'); btn.disabled = true; $('#peBusy').classList.remove('hidden'); st.textContent = '';
  try {
    let instr = [...PE.sel].map(i => PE_PRESETS[i][1]).join(' ');
    if (free) instr += ' ' + await toEnglish(free);
    instr += ' Keep the main person\'s face, identity, expression, hairstyle, body and clothing exactly the same. Photorealistic, natural anatomy, no extra limbs.';
    const p = pePhoto(c);
    const image = r2On() ? await toModelUrl(p.img, 'ritocco-' + c.id + '-' + p.id) : p.img;
    const url = await rpJob('qwen-image-edit', { prompt: instr, image, negative_prompt: 'extra people, extra hands, extra arms, deformed, blurry, changed face', seed: -1, output_format: 'jpeg', enable_safety_checker: true });
    await setCharImg(c, (await storeImage(url, 'ritocco', c.name, 1280)).img);
    st.textContent = 'Fatto ✓ Se non ti piace premi "Annulla l\'ultimo".';
  } catch (e) { st.textContent = 'Ritocco non riuscito: ' + e.message; }
  btn.disabled = false; $('#peBusy').classList.add('hidden');
};
$('#peUndo').onclick = async () => { const c = peChar(); if (!c) return; const p = pePhoto(c); if (!p.hist || !p.hist.length) return; const prev = p.hist.pop(); await setCharImg(c, prev, false); };
$('#peOrig').onclick = async () => { const c = peChar(); if (!c) return; const p = pePhoto(c); if (!p.orig) return; await setCharImg(c, p.orig); };

async function aiPortrait(name, look) {
  const prompt = `Photorealistic cinematic character reference portrait of ${look}. Front view, from the chest up, looking at the camera with a neutral relaxed expression, plain neutral grey studio background, soft key light, sharp focus, natural skin texture, 50mm lens. Only one person in the image, both shoulders visible, no hands in front of the body, no text.`;
  const url = await rpJob('qwen-image-t2i', { prompt, negative_prompt: 'extra people, extra hands, extra fingers, deformed face, cartoon, cgi, text, watermark, blurry', size: '1024*1024', seed: -1, enable_safety_checker: true });
  return (await storeImage(url, 'ritratto', name, 1024)).img;
}
/* =================== REGISTA: progetti =================== */
const RG = { cur: null, busy: new Map(), thinking: null };
function rgList() { try { return JSON.parse(ls('regie') || '[]'); } catch (e) { return []; } }
function rgSaveAll(list) { ls('regie', JSON.stringify(list)); }
function rgProj() { return rgList().find(p => p.id === RG.cur) || null; }
function rgSave(p) { const l = rgList(); const i = l.findIndex(x => x.id === p.id); if (i < 0) l.unshift(p); else { if (l[i].spent > (p.spent || 0)) p.spent = l[i].spent; l[i] = p; } rgSaveAll(l); }
/* modifiche sicure durante i lavori lunghi: rilegge sempre il progetto aggiornato */
function rgMut(pid, fn) { const l = rgList(); const p = l.find(x => x.id === pid); if (!p) return null; fn(p); rgSaveAll(l); return p; }
function rgFind(p, shId) { for (const pt of p.parts) { const s = pt.shots.find(x => x.id === shId); if (s) return s; } return null; }
function rgShotMut(pid, shId, fn) { return rgMut(pid, p => { const s = rgFind(p, shId); if (s) fn(s, p); }); }
const hashStr = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
function rgNewProj() {
  return { id: uid(), created: Date.now(), idea: '', length: 60, genre: 'Drammatico realistico', ratio: '16:9', engine: 'wan', audio: false, dialog: 'pochi', lipsync: true, script: null, nChars: 0, castSel: [], bible: null, parts: [] };
}
const GENRES = ['Drammatico realistico', 'Commedia', 'Thriller', 'Noir', 'Romantico', 'Avventura', 'Fantascienza realistica', 'Horror (suggerito)', 'Documentario', 'Spot pubblicitario', 'Videoclip narrativo'];
const LENGTHS = [[30, '30 secondi'], [60, '1 minuto'], [90, '1 minuto e mezzo'], [120, '2 minuti'], [180, '3 minuti']];
const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function charOfName(p, name) {
  const ch = (p.bible.characters || []).find(c => c.name.toLowerCase() === String(name).toLowerCase());
  const cast = ch && ch.castId && S.chars.find(c => c.id === ch.castId);
  return { ch, cast };
}
function shotState(sh, p) {
  const job = S.jobs.find(j => j.settings && j.settings.rgShot === sh.id);
  const clip = S.clips.find(c => c.settings && c.settings.rgShot === sh.id);
  if (RG.busy.has(sh.id)) return { st: 'kf', label: RG.busy.get(sh.id) };
  if (job && !job.done) return { st: 'run', label: 'Si gira', job };
  if (job && job.error && (!clip || job.created > clip.created)) return { st: 'err', label: 'Errore', err: job.error, job, clip };
  if (sh.err) return { st: 'err', label: 'Errore', err: sh.err, clip };
  if (clip) return { st: 'ok', label: 'Pronto', clip };
  p = p || rgProj();
  if (p && kfValid(p, sh)) return sh.ok ? { st: 'appr', label: 'Approvato' } : { st: 'frame', label: 'Da approvare' };
  return { st: 'todo', label: 'Da preparare' };
}
/* il fotogramma vale finché non cambiano prompt, look, volti, formato o voce in camera; dura 7 giorni su RunPod, per sempre in R2 */
function kfSig(p, sh) {
  const B = p.bible || {}, look = B.look ? JSON.stringify(B.look) : '';
  const casts = (sh.chars || []).map(n => { const c = charOfName(p, n).cast; return c ? c.id + ':' + (c.master ? 'M' + c.master.t : '') + charPhotos(c).map(x => x.kind + x.img.length + x.img.slice(-12)).join(',') : n; }).join('|') + JSON.stringify(storyChangesFor(p, sh));
  return hashStr([(p.kfEngine || 'fedele'), sh.prompt, sh.frame || '', JSON.stringify(sh.gaze || []), JSON.stringify(sh.place || []), look, p.ratio, casts, isTalk(p, sh) ? 'talk' : ''].join('#'));
}
const kfFresh = kf => !!kf && (Date.now() - kf.t < 6.5 * 864e5 || !!kf.key);
function kfValid(p, sh) { return !!(sh.kf && sh.kf.sig === kfSig(p, sh) && kfFresh(sh.kf)); }
function voiceValid(p, sh) {
  const line = p.dialog !== 'no' ? (sh.lines || [])[0] : null;
  if (!line) return true;
  const v = sh.voice; return !!(v && v.text === line.text && v.vid === voiceOfChar(p, line.char) && v.emotion === line.emotion);
}
const KF_PRICE = 0.03;
const KF_ENGINES = {
  fedele: { label: 'Volti fedeli (Nano Banana 2)', ep: 'google-nano-banana-2-edit', price: 0.09 },
  eco: { label: 'Economico (Seedream)', ep: 'seedream-v4-edit', price: 0.03 }
};
const kfEngine = p => KF_ENGINES[(p && p.kfEngine) || 'fedele'] || KF_ENGINES.fedele;
function kfPrice(p, sh) { return (sh.chars || []).some(n => charOfName(p, n).cast) ? kfEngine(p).price : 0.02; }
function costParts(p, sh) {
  const voice = voiceValid(p, sh) ? 0 : (sh.lines || []).slice(0, 1).reduce((k, l) => k + l.text.length * 0.00005, 0);
  const frame = kfValid(p, sh) ? 0 : kfPrice(p, sh);
  let video = 0;
  if (isTalk(p, sh)) video = 0.5;
  else { const m = MODELS[p.engine]; try { video = m.price({ engine: p.engine, duration: nearestDur(p.engine, sh.dur), res: m.defRes || '720p', ratio: p.ratio, audio: p.audio, ex: {}, startImg: 'x', img: 'x', charImgs: [] }); } catch (e) { } }
  return { voice, frame, video };
}
function shotCost(p, sh) { const c = costParts(p, sh); return c.voice + c.frame + c.video; }
function isTalk(p, sh) { const l = (sh.lines || [])[0]; return !!(l && l.oncam && p.lipsync !== false && p.dialog !== 'no'); }
/* storyboard: ogni inquadratura parte da un fotogramma da approvare (costa ~0,03 $ contro 0,5–2 $ di un video) */
function needsKeyframe(p) { return MODELS[p.engine].needs.image !== 'no'; }

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
    <div class="rg-who first">
      <label>Quanti personaggi <b class="req">*</b><select id="rgN" class="${p.nChars ? '' : 'need'}"><option value="0" ${p.nChars ? '' : 'selected'} disabled>Scegli…</option>${[1, 2, 3, 4].map(v => `<option value="${v}" ${p.nChars == v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      ${S.chars.length ? `<div class="rg-castsel"><span>Dal Cast (facoltativo)</span><div class="chipset">${S.chars.map(c => `<button class="chip cc ${(p.castSel || []).includes(c.id) ? 'on' : ''}" data-csel="${c.id}"><img src="${c.img}" alt="">${esc(c.name)}</button>`).join('')}</div></div>` : '<p class="muted small">Il Cast è vuoto: i personaggi li inventa il Regista e poi li crei con l\'intervista.</p>'}
    </div>
    <p class="muted small rg-whonote">${rgWhoNote(p)}</p>
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
    <label class="rg-budget">Fotogrammi con i personaggi<select id="rgKf">${Object.entries(KF_ENGINES).map(([k, v]) => `<option value="${k}" ${(p.kfEngine || 'fedele') === k ? 'selected' : ''}>${v.label} · ≈ ${money(v.price)}</option>`).join('')}</select></label>
    <label class="rg-budget">Budget massimo del film ($) <input id="rgBudget" type="number" min="0" step="1" inputmode="decimal" placeholder="nessun limite" value="${p.budget || ''}"></label>
    <label class="check"><input type="checkbox" id="rgLip" ${p.lipsync !== false ? 'checked' : ''}> Labbra sincronizzate quando un personaggio parla in camera (InfiniteTalk)</label>
    <label class="check"><input type="checkbox" id="rgAudio" ${p.audio ? 'checked' : ''}> Suoni d'ambiente nei ciak (la musica la metti tu al montaggio)</label>
    <button class="btn primary big ${p.nChars ? '' : 'off'}" id="rgWrite">${hasB ? '↻ Riscrivi tutto da capo' : '🎬 Scrivi la storia'} <small>≈ 0,05 $</small></button>
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
  const cost = p.parts.reduce((n, pt) => n + pt.shots.reduce((k, s) => k + (shotState(s, p).clip ? 0 : shotCost(p, s)), 0), 0);
  const over = p.budget && (p.spent || 0) + cost > p.budget;
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
        <div class="rg-ci"><b>${esc(c.name)}${cast && cast.master ? ' <i class="mtag">🔒 master</i>' : ''}</b><small>${esc(c.role || '')}</small>${!cast ? '<em class="warn-inv">⚠ non collegato: il volto verrà inventato a ogni fotogramma</em>' : !cast.master ? '<em class="warn-soft">Consiglio: crea e blocca il suo master nella scheda</em>' : ''}
          <select data-cast="${i}"><option value="">${cast ? '— scollega —' : 'Scegli dal Cast…'}</option>${S.chars.map(x => `<option value="${x.id}" ${c.castId === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
          ${p.dialog !== 'no' ? `<select data-voice="${i}" aria-label="Voce">${voiceOptions(c.voiceId)}</select>` : ''}
          <div class="rg-cb">${cast ? `<button class="btn small" data-rpe="${cast.id}">📷 Scheda</button>` : `<button class="btn small" data-aic="${i}">🎨 Crea con AI</button>`}${p.dialog !== 'no' ? `<button class="btn small" data-vtest="${i}">🔊 Prova voce</button>` : ''}</div>
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
    <span><b>${done}/${tot}</b> ciak girati · speso <b>${money(p.spent || 0)}</b> · per finire ≈ ${money(cost)}${p.budget ? ` · budget <b class="${over ? 'over' : ''}">${money(p.budget)}</b>` : ''}</span>
    <button class="btn primary" id="rgToMont" ${done ? '' : 'disabled'}>✂️ Manda al montaggio</button>
  </div>`;
  return { left, right };
}
function rgPartHtml(p, pt, pi) {
  const sts = pt.shots.map(s => shotState(s, p));
  const ok = sts.filter(s => s.st === 'ok').length, run = sts.some(s => s.st === 'run' || s.st === 'kf');
  const prep = pt.shots.filter((s, i) => !sts[i].clip && ['todo', 'err'].includes(sts[i].st) && (!kfValid(p, s) || !voiceValid(p, s)));
  const toAppr = pt.shots.filter((s, i) => sts[i].st === 'frame');
  const toFilm = pt.shots.filter((s, i) => sts[i].st === 'appr' || (sts[i].st === 'err' && s.ok && kfValid(p, s)));
  const prepCost = prep.reduce((k, s) => { const c = costParts(p, s); return k + c.frame + c.voice; }, 0);
  const filmCost = toFilm.reduce((k, s) => { const c = costParts(p, s); return k + c.video + c.voice; }, 0);
  return `<div class="rg-part">
    <div class="rg-ph"><b>Parte ${pi + 1}</b><span>${mmss(pt.start)}–${mmss(pt.end)}</span><em>${esc(pt.title || '')}</em><small>${ok}/${pt.shots.length}</small></div>
    <label class="nolabel"><textarea data-psum="${pi}" rows="3">${esc(pt.summary || '')}</textarea></label>
    <div class="rg-shots">${pt.shots.map((sh, si) => {
      const s = sts[si], L = lintShot(sh, p.engine);
      sh.kf = sh.kf || null;
      const th = s.clip ? `<video src="${clipSrc(s.clip)}#t=0.5" muted playsinline preload="metadata"></video>` : sh.kf && (sh.kf.img || sh.kf.url) ? `<img src="${sh.kf.img || sh.kf.url}" alt="">` : `<span class="n">${pi + 1}.${si + 1}</span>`;
      return `<button class="rg-shot st-${s.st}" data-shot="${pi}:${si}">
        <div class="th">${th}<i class="badge">${s.st === 'kf' ? '⏳' : s.st === 'run' ? '🎬' : s.st === 'ok' ? '✓' : s.st === 'err' ? '!' : s.st === 'appr' ? '👍' : s.st === 'frame' ? '?' : ''}</i></div>
        <div class="sl"><b>${pi + 1}.${si + 1} · ${nearestDur(p.engine, sh.dur)}s</b><span class="stl">${s.st === 'kf' ? esc(s.label) + '…' : s.label}</span><small>${esc(sh.action || '')}</small>${(sh.lines || []).length ? `<i class="ln">💬 ${esc(sh.lines[0].char)}: «${esc(sh.lines[0].text)}»</i>` : ''}<em class="rs ${L.score >= 80 ? 'g' : L.score >= 60 ? 'y' : 'r'}">prompt ${L.score}</em>${sh.kf && !ratioOk(p, sh.kf) ? '<em class="rs r">⚠ formato</em>' : ''}</div>
      </button>`;
    }).join('')}</div>
    <div class="actions">
      ${run ? '<button class="btn small" disabled>⏳ Al lavoro…</button>' : ''}
      ${!run && prep.length ? `<button class="btn primary small" data-prep="${pi}">🖼 1 · Storyboard: ${prep.length} fotogrammi ≈ ${money(prepCost)}</button>` : ''}
      ${!run && toAppr.length ? `<button class="btn small" data-apprall="${pi}">✓ 2 · Approva tutti (${toAppr.length})</button>` : ''}
      ${!run && toFilm.length ? `<button class="btn primary small" data-film="${pi}">🎬 3 · Gira ${toFilm.length} approvati ≈ ${money(filmCost)}</button>` : ''}
      ${!run && !prep.length && !toAppr.length && !toFilm.length && ok === pt.shots.length ? '<button class="btn small" disabled>✓ Parte girata</button>' : ''}
      <button class="btn small" data-rewrite="${pi}" ${run ? 'disabled' : ''}>✍️ Riscrivi inquadrature</button>
    </div>
  </div>`;
}
function rgWhoNote(p) {
  const sel = (p.castSel || []).map(id => S.chars.find(c => c.id === id)).filter(Boolean).map(c => c.name);
  const n = p.nChars || 0;
  if (!n) return 'Prima di tutto scegli quanti personaggi avrà il film: il Regista non potrà aggiungerne altri.';
  const extra = n - sel.length;
  return `${n} personagg${n === 1 ? 'io' : 'i'}${sel.length ? ': ' + sel.join(', ') : ''}${extra > 0 ? `${sel.length ? ' e ' : ', '}${extra} invent${extra === 1 ? 'ato' : 'ati'} dal Regista` : ''}. In ogni inquadratura ce ne saranno al massimo 2.`;
}
function rgWireIdea(p) {
  const upd = () => {
    p.idea = $('#rgIdea').value; p.length = +$('#rgLen').value; p.genre = $('#rgGenre').value; p.ratio = $('#rgRatio').value;
    p.engine = $('#rgEngine').value; p.audio = $('#rgAudio').checked; p.dialog = $('#rgDialog').value; p.lipsync = $('#rgLip').checked; p.budget = +$('#rgBudget').value || 0; p.kfEngine = $('#rgKf').value;
    if (rgList().some(x => x.id === p.id)) rgSave(p);
  };
  ['#rgIdea', '#rgLen', '#rgGenre', '#rgRatio', '#rgAudio', '#rgDialog', '#rgLip', '#rgBudget', '#rgKf'].forEach(s => $(s).addEventListener('change', upd));
  const whoNote = () => { const el = $('.rg-whonote'); if (el) el.textContent = rgWhoNote(p); };
  $('#rgN').onchange = () => {
    p.nChars = +$('#rgN').value; const sel = (p.castSel || []).length;
    if (p.nChars && sel > p.nChars) { p.castSel = p.castSel.slice(0, p.nChars); $$('[data-csel]').forEach(b => b.classList.toggle('on', p.castSel.includes(b.dataset.csel))); toast(`Tengo solo ${p.nChars} dal Cast`); }
    $('#rgN').classList.toggle('need', !p.nChars); $('#rgWrite').classList.toggle('off', !p.nChars); upd(); whoNote();
  };
  $$('[data-csel]').forEach(b => b.onclick = () => {
    const id = b.dataset.csel; p.castSel = p.castSel || [];
    p.castSel = p.castSel.includes(id) ? p.castSel.filter(x => x !== id) : [...p.castSel, id];
    if (!p.nChars) { p.nChars = Math.min(4, p.castSel.length); $('#rgN').value = String(p.nChars); $('#rgN').classList.remove('need'); $('#rgWrite').classList.remove('off'); }
    else if (p.castSel.length > p.nChars) { p.nChars = p.castSel.length; $('#rgN').value = String(Math.min(4, p.nChars)); toast(`Hai scelto ${p.castSel.length} dal Cast: imposto ${p.castSel.length} personaggi`); }
    b.classList.toggle('on', p.castSel.includes(id)); upd(); whoNote();
  });
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
  $$('[data-cast]').forEach(s => s.onchange = () => {
    const ch = B.characters[+s.dataset.cast], cast = S.chars.find(x => x.id === s.value);
    ch.castId = s.value || null; if (cast && cast.voiceId) ch.voiceId = cast.voiceId;
    rgSave(p); renderRegia();
  });
  $$('[data-rpe]').forEach(b => b.onclick = () => openCharSheet(b.dataset.rpe));
  $$('[data-voice]').forEach(s => s.onchange = () => { B.characters[+s.dataset.voice].voiceId = s.value; rgSave(p); });
  $$('[data-vtest]').forEach(b => b.onclick = () => rgVoiceTest(p, +b.dataset.vtest, b));
  $$('[data-aic]').forEach(b => b.onclick = () => rgAiChar(p, +b.dataset.aic));
  $$('[data-shot]').forEach(b => b.onclick = () => { const [pi, si] = b.dataset.shot.split(':').map(Number); openShot(p, pi, si); });
  $$('[data-prep]').forEach(b => b.onclick = () => rgPreparePart(p.id, +b.dataset.prep));
  $$('[data-apprall]').forEach(b => b.onclick = () => {
    let skip = 0;
    rgMut(p.id, x => x.parts[+b.dataset.apprall].shots.forEach(s => { if (kfValid(x, s)) { if (ratioOk(x, s.kf)) s.ok = true; else skip++; } }));
    if (skip) toast(`${skip} fotogrammi non sono nel formato ${p.ratio}: rifalli prima di approvarli`, 6000);
    renderRegia();
  });
  $$('[data-film]').forEach(b => b.onclick = () => rgFilmPart(p.id, +b.dataset.film));
  $$('[data-rewrite]').forEach(b => b.onclick = () => rgRewritePart(p, +b.dataset.rewrite));
  const s = $('#rgSoften'); if (s) s.onclick = () => rgSoften(p);
  $('#rgToMont').onclick = () => rgToMontage(p);
}
function renderRegiaList() { const p = rgProj(); const o = $(`#rgProjects option[value="${RG.cur}"]`); if (o && p && p.bible) o.textContent = p.bible.title; }
$('#rgProjects').onchange = () => { RG.cur = $('#rgProjects').value; renderRegia(); };
$('#rgNew').onclick = () => { RG.draft = rgNewProj(); RG.cur = '__draft'; renderRegia(); $('#rgN').focus(); };
let rgRefT = 0;
function regiaRefresh() { clearTimeout(rgRefT); rgRefT = setTimeout(() => { if ($('#view-regista').classList.contains('active') && !document.querySelector('#rgBody :focus')) renderRegia(); }, 400); }

/* =================== REGISTA: scrittura con l'AI =================== */
function castBrief() {
  return S.chars.length ? S.chars.map(c => c.master
    ? `- ${c.name}: HAS A LOCKED MASTER REFERENCE IMAGE. Never invent or change face, hair, age or body${c.master.traits_en ? ' (' + c.master.traits_en + ')' : ''}; for look_en write only "as in the master reference".`
    : `- ${c.name}: HAS REFERENCE PHOTOS. Never invent or change face, hair, age or body${c.desc ? ' (' + c.desc + ')' : ''}; for look_en write only "as in the reference photos".`).join('\n') : '(empty: invent the characters)';
}
async function rgWrite(p) {
  if (!key()) { toast('Collega prima RunPod'); return openSettings(); }
  if (!p.nChars) { toast('Prima scegli quanti personaggi avrà il film'); const n = $('#rgN'); if (n) { n.focus(); n.scrollIntoView({ behavior: 'smooth', block: 'center' }); } return; }
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
  RG.thinking = { pid: p.id, steps }; RG.spendTo = p.id; renderRegia();
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
- ${rgCharRule(p)}
- Max 3 locations. Never more than 2 characters in the same shot. No crowds, no on-screen text, no complex fights or intertwined bodies, no fast action.
- Show emotions through simple physical actions, looks and light, not dialogue.
- Split the film into consecutive parts of 12-25 seconds covering exactly 0..${p.length} s with no gaps.
- Each character gets one fixed look_en (apparent age, build, face, hair, one outfit) reused identically in every shot.
- Characters with a locked master keep exactly that appearance for the whole film. Add an entry in "changes" ONLY if the user's idea or screenplay explicitly requires an appearance change (e.g. a haircut), with the part number from which it applies.
- Rate the content honestly: "tutti" (all audiences), "maturo" (adult themes, nothing explicit), "violento" (strong violence), "esplicito" (nudity or sexual content).

JSON schema:
{"title":"","logline":"","story":"5-8 sentences","themes":"emotions and themes in Italian","look":{"style_en":"","palette_en":"","lighting_en":"","camera_en":""},"characters":[{"name":"","cast":"exact cast name or empty","role":"","gender":"m|f","age":30,"voice":"Italian, 3-6 words describing the voice","look_en":""}],"locations":[{"name":"","look_en":""}],"parts":[{"title":"","start":0,"end":15,"summary":"3-5 Italian sentences: what we SEE"}],"rating":{"level":"tutti|maturo|violento|esplicito","notes":"Italian, one sentence"},"changes":[{"char":"name","from_part":2,"change_en":"English, only if the story requires it"}]}`;
    let B = await llmJSON(sys, usr, 3500, s => { steps[0].d = s === 'IN_QUEUE' ? 'RunPod accende il modello di testo…' : 'tema, tono ed emozioni della storia'; rgThinkRender(); });
    // controllo: numero e nomi dei personaggi come scelto dall'utente (una sola correzione, costa < 0,01 $)
    const bad = rgCharCheck(p, B);
    if (bad) {
      steps[1].d = 'correggo: ' + bad; rgThinkRender();
      try { const B2 = await llmJSON(sys, usr + `\n\nYOUR PREVIOUS ANSWER WAS WRONG: ${bad}. Fix it and reply with the full JSON again.`, 3500); if (!rgCharCheck(p, B2)) B = B2; } catch (e) { }
    }
    steps.forEach(s => s.st = 'done'); steps[0].d = B.themes || steps[0].d; rgThinkRender();
    (B.characters || []).forEach((c, k) => { const m = S.chars.find(x => x.name.toLowerCase() === String(c.cast || c.name).toLowerCase()); c.castId = m ? m.id : null; c.voiceId = (m && m.voiceId) || autoVoice(c, k); if (m && m.master) c.look_en = 'as in the master reference' + (m.master.traits_en ? ' (' + m.master.traits_en + ')' : ''); else if (m) c.look_en = 'as in the reference photos'; });
    let parts = (B.parts || []).map(x => ({ id: uid(), title: x.title, start: +x.start || 0, end: +x.end || 0, summary: x.summary, shots: [] }));
    if (!parts.length) throw new Error('nessuna parte nella trama');
    p.bible = B; p.parts = parts; rgSave(p);
    await rgShotsAll(p, steps);
    toast('Storia pronta: controlla personaggi e inquadrature, poi gira parte per parte');
  } catch (e) { toast('Il regista non è riuscito: ' + e.message, 7000); }
  RG.thinking = null; RG.spendTo = null; renderRegia();
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
LANGUAGE: "prompt", "frame", "motion", "camera" and "negative" MUST be written in ENGLISH even though the story is Italian; only "action", "framing" and "lines" are in Italian.
DIALOGUE: when a character speaks, put the spoken words in "lines" (Italian, natural spoken language, max 14 words per line, ONE speaker per shot). A speaking shot is a medium close-up or close-up of the speaker, facing the camera at three-quarters, mouth clearly visible, small natural gestures; set "oncam": true. Lines spoken off-screen or over other images use "oncam": false.
CHARACTERS WITH PHOTOS: for characters whose look_en starts with "as in the" (master or reference photos), NEVER describe their face, hair, age, body or clothes in "prompt" or "frame": write their name and describe only pose, action, expression and gaze.
GAZE AND BLOCKING: for EVERY character in "chars" fill "gaze" (whom or what they look at, e.g. "at Luca", "down at the VHS tape in his hands") and "place" (where they are in the frame). Never leave anyone out.
FIRST FRAME: "frame" is an English description of the very first frame as a STILL PHOTO (no motion verbs): framing and camera angle, where each person is in the frame, body pose, where each hand is, where each person looks, expression, key props, light. The video model will animate from that photo, so "prompt" focuses on the movement that starts from it.
Reply ONLY with JSON: {"shots":[{"dur":5,"chars":["exact character names in frame"],"location":"name","framing":"Italian, e.g. piano medio","camera":"English camera move","action":"ONE Italian sentence","frame":"English still description of the first frame","motion":"English physics of the movement","prompt":"English, model-specific","negative":"English, scene-specific things to avoid","gaze":[{"char":"name","at":"English: whom or what this character looks at"}],"place":[{"char":"name","where":"English: left / right / centre and foreground / background"}],"lines":[{"char":"name","text":"Italian line","emotion":"neutral|happy|sad|angry|fearful|surprised","oncam":true}]}]}`;
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
  let shots = (r.shots || []).map(s => ({ id: uid(), dur: +s.dur || 5, chars: (s.chars || []).filter(Boolean), location: s.location || '', framing: s.framing || '', camera: s.camera || '', action: s.action || '', frame: s.frame || '', motion: s.motion || '', prompt: s.prompt || '', gaze: normPairs(s.gaze, 'at'), place: normPairs(s.place, 'where'), negative: s.negative || '', lines: p.dialog === 'no' ? [] : (s.lines || []).filter(l => l && l.text).slice(0, 2).map(l => ({ char: l.char || (s.chars || [])[0] || '', text: String(l.text).trim(), emotion: l.emotion || 'neutral', oncam: l.oncam !== false })) }));
  if (!shots.length) throw new Error('nessuna inquadratura');
  // algoritmo di realismo: controlla ogni inquadratura e fa riscrivere quelle a rischio
  const bad = shots.map((s, k) => ({ k, L: lintShot(s, p.engine) })).filter(x => x.L.score < 70);
  if (bad.length && !fixNotes) {
    try {
      const fix = await llmJSON(shotsSystem(p.engine), `Rewrite ONLY these shots so the motion becomes simple and physically real, keeping their story meaning. Same JSON schema, same order.\n${bad.map(b => `SHOT ${b.k + 1}: ${JSON.stringify(shots[b.k])}\nPROBLEMS: ${b.L.issues.join('; ')}`).join('\n')}`, 2500);
      (fix.shots || []).forEach((s, j) => { const b = bad[j]; if (b && s.prompt) Object.assign(shots[b.k], { action: s.action || shots[b.k].action, frame: s.frame || shots[b.k].frame, motion: s.motion || shots[b.k].motion, prompt: s.prompt, negative: s.negative || shots[b.k].negative, camera: s.camera || shots[b.k].camera, chars: (s.chars || shots[b.k].chars) }); });
    } catch (e) { }
  }
  for (const s of shots) { if (looksItalian(s.prompt)) { try { const en = await llm('You translate AI video prompts from Italian into precise cinematic English. Keep every visual detail. Reply with the translation only.', s.prompt, 1200); if (en && !looksItalian(en)) s.prompt = en.trim(); } catch (e) { } } }
  try { await fillBlocking(p, shots); } catch (e) { }
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
function rgAiChar(p, i) {
  const c = p.bible.characters[i], B = p.bible;
  openCharAI({ name: c.name, idea: [c.role, c.voice ? 'voce ' + c.voice : '', c.look_en].filter(Boolean).join('. '), context: `${B.title || ''}: ${B.story || ''}`,
    onSaved: ch => { rgMut(p.id, x => { const cc = x.bible.characters[i]; cc.castId = ch.id; if (ch.voiceId) cc.voiceId = ch.voiceId; if (ch.look_en) cc.look_en = ch.look_en; }); renderRegia(); } });
}

/* =================== REGISTA: si gira =================== */
/* ---- controllo gratuito dei servizi prima di spendere ---- */
RG.health = {};
async function rgPreflight(eps) {
  // solo i TUOI endpoint (montaggio e voce) espongono /health: i modelli pubblici di RunPod non si controllano così
  const bad = [];
  for (const ep of [...new Set(eps.filter(Boolean))]) {
    const own = ep === montId() || ep === voceId();
    if (!own) continue;
    const h = RG.health[ep]; if (h && Date.now() - h < 10 * 60e3) continue;
    try { await rp(`/${ep}/health`); RG.health[ep] = Date.now(); }
    catch (e) {
      if (/404|non trovato/i.test(e.message)) bad.push(ep === montId() ? 'worker di montaggio (ID sbagliato?)' : 'worker voce clonata (ID sbagliato?)');
    }
  }
  if (bad.length) throw new Error('servizio non raggiungibile: ' + bad.join(', ') + '. Controlla in ⚙︎ Impostazioni');
}
function rgBudgetOk(p, cost, what) {
  if (!p.budget || (p.spent || 0) + cost <= p.budget) return true;
  return confirm(`${what} costa circa ${money(cost)}: con ${money(p.spent || 0)} già spesi supereresti il budget di ${money(p.budget)}. Procedo lo stesso?`);
}
/* lancia i lavori: il primo da solo (prova), poi gli altri 3 alla volta solo se la prova è andata */
async function pilotRun(items, fn) {
  if (!items.length) return { ok: 0, err: null };
  let ok = 0;
  try { await fn(items[0]); ok++; } catch (e) { return { ok, err: e }; }
  const q = items.slice(1);
  const w = async () => { while (q.length) { const it = q.shift(); try { await fn(it); ok++; } catch (e) { } } };
  await Promise.all([w(), w(), w()]);
  return { ok, err: null };
}
function imgEndpointsFor(p, shots) { return shots.map(s => (s.chars || []).some(n => charOfName(p, n).cast) ? kfEngine(p).ep : 'qwen-image-t2i'); }
function voiceEndpointsFor(p, shots) {
  return shots.flatMap(s => (s.lines || []).slice(0, 1)).map(l => { const v = voiceOfChar(p, l.char); return v.startsWith('clone:') ? voceId() : 'minimax-speech-02-hd'; });
}

/* ---- 1 · storyboard: voce + fotogramma, nessun video ---- */
async function rgPreparePart(pid, pi) {
  if (!key()) { toast('Collega prima RunPod'); return openSettings(); }
  let p = rgList().find(x => x.id === pid); if (!p) return;
  const ver = ratingVerdict(p.bible.rating, p.engine);
  if (!ver.ok && !confirm(`Attenzione: ${ver.txt}\nPreparo comunque i fotogrammi?`)) return;
  const shots = p.parts[pi].shots.filter(s => { const st = shotState(s, p); return !st.clip && ['todo', 'err'].includes(st.st) && (!kfValid(p, s) || !voiceValid(p, s)); });
  const cost = shots.reduce((k, s) => { const c = costParts(p, s); return k + c.frame + c.voice; }, 0);
  const unlinked = [...new Set(shots.flatMap(s => s.chars || []).filter(n => !charOfName(p, n).cast))];
  if (unlinked.length && !confirm(`${unlinked.join(', ')} non ${unlinked.length > 1 ? 'sono collegati' : 'è collegato'} al Cast: il volto verrà inventato e cambierà da un fotogramma all'altro.\nCollegali in "3 · Personaggi" prima di continuare. Procedo lo stesso?`)) return;
  if (!rgBudgetOk(p, cost, 'Lo storyboard')) return;
  if (!r2On()) toast('Consiglio: con l\'archivio R2 attivo i fotogrammi non scadono e i volti del Cast funzionano meglio', 5000);
  try { await rgPreflight([...imgEndpointsFor(p, shots), ...voiceEndpointsFor(p, shots), r2On() ? montId() : null]); }
  catch (e) { toast(e.message, 7000); return; }
  shots.forEach(s => rgShotMut(pid, s.id, x => { delete x.err; }));
  RG.spendTo = pid;
  const res = await pilotRun(shots.map(s => s.id), id => rgPrepare(pid, id));
  RG.spendTo = null;
  if (res.err) toast('Mi fermo alla prima inquadratura, così non spendi per le altre: ' + res.err.message, 8000);
  else toast(`Storyboard pronto (${res.ok}): guarda i fotogrammi, approva quelli buoni e rifai solo quelli sbagliati`, 7000);
  renderRegia();
}
async function rgPrepare(pid, shId) {
  let p = rgList().find(x => x.id === pid), sh = p && rgFind(p, shId); if (!sh) return;
  const line = p.dialog !== 'no' ? (sh.lines || [])[0] : null;
  let step = 'Preparazione';
  try {
    if (line && !voiceValid(p, sh)) {
      step = 'Voce'; RG.busy.set(shId, 'Voce'); regiaRefresh();
      const v = await ttsLine(p, line);
      p = rgShotMut(pid, shId, x => { x.voice = v; }); sh = rgFind(p, shId);
    }
    if (!kfValid(p, sh) && (looksItalian(sh.prompt) || !sh.frame || looksItalian(sh.frame) || missingBlocking(sh).length || blockingItalian(sh))) { step = 'Testo della scena'; RG.busy.set(shId, 'Preparo la scena'); regiaRefresh(); await ensureFrame(pid, shId); p = rgList().find(x => x.id === pid); sh = rgFind(p, shId); }
    if (!kfValid(p, sh)) {
      step = 'Fotogramma'; RG.busy.set(shId, 'Fotogramma'); regiaRefresh();
      const kf = await makeKeyframe(p, sh);
      rgShotMut(pid, shId, x => { x.kf = kf; x.ok = false; });
    }
  } catch (e) { const msg = `${step}: ${e.message}`; rgShotMut(pid, shId, x => { x.err = msg; }); throw new Error(msg); }
  finally { RG.busy.delete(shId); regiaRefresh(); }
}
/* i modelli video e immagine capiscono molto meglio l'inglese: se un prompt è in italiano lo traduce (costa < 0,001 $) */
function looksItalian(s) {
  s = ' ' + String(s || '').toLowerCase() + ' ';
  const it = (s.match(/\b(il|lo|gli|della|delle|degli|dello|che|con|una|uno|anni|capelli|occhi|si|sulla|nella|alla|del|nel|mentre|lentamente|verso|sono|viene)\b/g) || []).length;
  const en = (s.match(/\b(the|and|with|of|his|her|is|on|at|while|slowly|towards|from|their)\b/g) || []).length;
  return it >= 4 && it > en * 1.5;
}
/* prepara il testo del fotogramma: prompt in inglese e descrizione FERMA del primo istante (costa < 0,001 $) */
async function ensureFrame(pid, shId) {
  await ensureEnglish(pid, shId);
  await englishBlocking(pid, shId);
  const p = rgList().find(x => x.id === pid), sh = p && rgFind(p, shId);
  if (!sh) return;
  if (sh.frame && !looksItalian(sh.frame)) { if (missingBlocking(sh).length) await fillBlockingOne(pid, shId); return; }
  const who = (sh.chars || []).map(n => { const c = charOfName(p, n); return `${n}: ${(c.cast && c.cast.look_en) || (c.ch && c.ch.look_en) || ''}`; }).join('; ');
  const f = await llm('You are a cinematographer. Turn an AI video shot description into a description of its FIRST FRAME as a STILL PHOTO, in English, 50-90 words, with no motion verbs: framing and camera angle, where each person stands in the frame (left/right/centre, foreground/background), body pose, where each hand is (relaxed, natural, never clasped together), where each person is looking, expression, key props, light. Screens and glass are matte without reflections. Reply with the description only.',
    `Shot: ${sh.prompt}\nItalian action: ${sh.action || ''}\nFraming: ${sh.framing || ''}\nCharacters: ${who}`, 600);
  if (f && !looksItalian(f)) rgShotMut(pid, shId, x => { x.frame = f.replace(/^["']|["']$/g, '').trim(); });
  if (missingBlocking(rgFind(rgList().find(x => x.id === pid), shId) || {}).length) await fillBlockingOne(pid, shId);
}
async function ensureEnglish(pid, shId) {
  let p = rgList().find(x => x.id === pid), sh = p && rgFind(p, shId);
  if (!sh || !looksItalian(sh.prompt)) return;
  const en = await llm('You translate AI video prompts from Italian into precise cinematic English for video generation models. Keep every visual detail, character description and camera direction. Reply with the translation only.', sh.prompt, 1200);
  if (en && !looksItalian(en)) rgShotMut(pid, shId, x => { x.prompt = en.replace(/^["']|["']$/g, '').trim(); });
}
function lookOf(p) { const B = p.bible || {}; return B.look ? [B.look.style_en, B.look.palette_en, B.look.lighting_en, B.look.camera_en].filter(Boolean).join(', ') : ''; }
async function makeKeyframe(p, sh) {
  const look = lookOf(p);
  const refs = refsForShot(p, sh);
  const prev = refs.length ? prevShotWithKf(p, sh) : null;
  const who = refs.map(x => `reference image${x.n.length > 1 ? 's' : ''} ${x.n.join(' and ')} show ${x.c.name}${x.c.master ? ` (image ${x.n[0]} is the locked MASTER sheet of ${x.c.name}: follow it over any text)` : ''}`).join('; ');
  const lockTxt = refs.map(x => `${x.c.name} must look EXACTLY like ${x.c.master ? 'the master reference' : 'the reference photos'}: same face, same hair colour, length, texture and hairstyle, same age and body${x.c.master && x.c.master.traits_en ? ', ' + x.c.master.traits_en : ''}; ignore any different description of ${x.c.name}'s hair, face or age in the scene text.`).join(' ');
  const chg = storyChangesFor(p, sh);
  const bl = blockingText(sh);
  const still = (sh.frame || sh.prompt) + (bl && !(sh.frame || '').includes(bl) ? ' ' + bl : '');
  const nRefs = refs.reduce((k, x) => k + x.ph.length, 0);
  const cont = prev ? ` The last reference image (${nRefs + 1}) is the PREVIOUS SHOT of the same film: keep the same clothes, hairstyle, location and lighting for continuity, but compose this new shot as described.` : '';
  const ident = refs.length ? `IDENTITY FIRST: ${who}.${cont} Keep exactly their faces, hairstyles and clothing; each person appears only once and is not mixed with the others. ${lockTxt} ${chg} ` : (chg ? chg + ' ' : '');
  const kfPrompt = `${ident}Cinematic film still, ${RATIO_TXT[p.ratio] || RATIO_TXT['16:9']}. SCENE: ${still} ${look ? 'Look: ' + look + '.' : ''} Photorealistic, natural skin texture, correct anatomy with two arms and two hands per person, relaxed natural hands, nobody else in frame, matte screens and glass without reflections, no text.`;
  const neg = NEG_BASE + ', reflection, mirror image, clasped hands, vertical frame';
  const gen = async extra => {
    if (refs.length) {
      const imgs = [];
      for (const x of refs) for (const ph of x.ph) imgs.push(r2On() ? await toModelUrl(ph.img, 'cast-' + x.c.id + '-' + ph.id) : ph.img);
      if (prev) { try { imgs.push(await kfUrl(prev.kf)); } catch (e) { } }
      const E = kfEngine(p);
      if (E.ep === 'google-nano-banana-2-edit') return await rpJob(E.ep, { prompt: kfPrompt + extra, images: imgs.slice(0, 6), resolution: '1k', aspect_ratio: p.ratio, output_format: 'jpeg' });
      return await rpJob(E.ep, { prompt: kfPrompt + extra, images: imgs, size: kfSize(p.ratio), enable_safety_checker: true });
    }
    return await rpJob('qwen-image-t2i', { prompt: kfPrompt + extra, negative_prompt: neg, size: kfSize(p.ratio), seed: -1, enable_safety_checker: true });
  };
  let url = await gen(''), kf;
  // per i modelli che non rispettano il formato: un solo nuovo tentativo (vedi sotto)
  for (let tries = 0; tries < 2; tries++) {
    kf = { url, t: Date.now(), sig: kfSig(p, sh) };
    try { const s = await storeImage(url, 'fotogramma', (sh.chars || []).join('-') || 'scena', 640); kf.img = s.img; kf.key = s.key; } catch (e) { }
    { const d = await imgDims(kf.img || url); if (d) { kf.w = d.w; kf.h = d.h; } }
    if (ratioOk(p, kf) || tries) break;
    // formato sbagliato: un solo nuovo tentativo, perché un fotogramma nel formato sbagliato non serve
    url = await gen(` The image MUST be ${RATIO_TXT[p.ratio] || RATIO_TXT['16:9']}.`);
  }
  return kf;
}
async function kfUrl(kf) { if (kf.key && r2On()) { try { return await libUrl(kf.key); } catch (e) { } } return kf.url; }

/* ---- 3 · video solo dei fotogrammi approvati ---- */
async function rgFilmPart(pid, pi) {
  if (!key()) { toast('Collega prima RunPod'); return openSettings(); }
  const p = rgList().find(x => x.id === pid); if (!p) return;
  const shots = p.parts[pi].shots.filter(s => { const st = shotState(s, p); return st.st === 'appr' || (st.st === 'err' && s.ok && kfValid(p, s)); });
  if (!shots.length) return toast('Approva prima i fotogrammi');
  const cost = shots.reduce((k, s) => { const c = costParts(p, s); return k + c.video + c.voice; }, 0);
  if (!rgBudgetOk(p, cost, `Girare ${shots.length} ciak`)) return;
  if (cost >= 3 && !p.budget && !confirm(`Gira ${shots.length} ciak approvati della parte ${pi + 1}: circa ${money(cost)}. Procedo?`)) return;
  shots.forEach(s => rgShotMut(pid, s.id, x => { delete x.err; }));
  RG.spendTo = pid;
  const res = await pilotRun(shots.map(s => s.id), id => rgFilm(pid, id));
  RG.spendTo = null;
  if (res.err) toast('Il ciak di prova non è partito, mi fermo così non spendi per gli altri: ' + res.err.message, 9000);
  else toast(`Parte ${pi + 1}: ${res.ok} ciak in ripresa. Li trovi qui e in Galleria quando sono pronti`, 6000);
  renderRegia();
}
async function rgFilm(pid, shId) {
  let p = rgList().find(x => x.id === pid), sh = p && rgFind(p, shId); if (!sh) return;
  try {
    if (!voiceValid(p, sh)) { await rgPrepare(pid, shId); p = rgList().find(x => x.id === pid); sh = rgFind(p, shId); }
    if (!kfValid(p, sh) || !sh.ok) throw new Error('fotogramma da approvare');
    if (!ratioOk(p, sh.kf)) throw new Error(`il fotogramma non è nel formato ${p.ratio}: rifallo prima di girare il video`);
    const B = p.bible, line = p.dialog !== 'no' ? (sh.lines || [])[0] : null;
    const talk = isTalk(p, sh) && sh.voice && sh.voice.dur > 0;
    const engine = talk ? 'talk' : p.engine, m = MODELS[engine];
    const img = await kfUrl(sh.kf);
    const people = (sh.chars || []).map(n => charOfName(p, n));
    const look = lookOf(p);
    const motion = await cleanMotion(pid, shId);
    const prompt = `${motion} ${blockingText(sh)} ${KEEP_SAME} ${REAL_SUFFIX}`.replace(/\s+/g, ' ').trim();
    let dur = nearestDur(p.engine, sh.voice ? Math.max(sh.dur, Math.ceil(sh.voice.dur + 0.8)) : sh.dur), audioIn = null;
    if (talk) { dur = Math.ceil(sh.voice.dur); audioIn = sh.voice.key && r2On() ? await libUrl(sh.voice.key) : sh.voice.url; }
    const o = {
      engine, prompt: talk ? `${motion} ${line.char} speaks with natural lip movement, subtle head motion and blinking, small natural hand gestures. ${KEEP_SAME}` : prompt,
      rawPrompt: `🎥 ${B.title || 'Regia'} · ${sh.action || ''}${line ? ' 💬 ' + line.text : ''}`.slice(0, 300),
      negative: m.neg ? [sh.negative, NEG_BASE, 'hairstyle change, hair colour change, outfit change, different person'].filter(Boolean).join(', ').slice(0, 1000) : '',
      ratio: m.ratios ? (m.ratios.includes(p.ratio) ? p.ratio : m.ratios[0]) : p.ratio,
      duration: dur, res: talk ? '720p' : (m.defRes || (m.res && m.res[0]) || '720p'),
      audio: p.audio, ex: {}, startImg: img, charImgs: [], charIds: people.filter(x => x.cast).map(x => x.cast.id),
      img, audioIn, refVideoId: '', refDuration: 0, klAudio: false
    };
    const job = await launchClip(o, { rgShot: sh.id, rgProj: p.id });
    rgMut(pid, x => { x.spent = (x.spent || 0) + job.est; });
    return job;
  } catch (e) { rgShotMut(pid, shId, x => { x.err = e.message; }); throw e; }
}

/* =================== REGISTA: dettaglio inquadratura =================== */
function openShot(p, pi, si) {
  const sh = p.parts[pi].shots[si], s = shotState(sh), L = lintShot(sh, p.engine);
  $('#shTitle').textContent = `Inquadratura ${pi + 1}.${si + 1}`;
  const media = s.clip ? `<video src="${clipSrc(s.clip)}" controls playsinline></video>` : sh.kf && (sh.kf.img || sh.kf.url) ? `<img src="${sh.kf.img || sh.kf.url}" alt="">${!kfValid(p, sh) ? '<p class="muted small sh-old">Il prompt è cambiato: questo fotogramma va rifatto.</p>' : ''}` : '<div class="sh-none">Nessun fotogramma: crealo e guardalo prima di pagare il video.</div>';
  $('#shBody').innerHTML = `${media ? `<div class="sh-media">${media}</div>` : ''}
    <p class="sh-act"><b>${esc(sh.action || '')}</b><br><span class="muted small">${esc(sh.framing || '')} · ${nearestDur(p.engine, sh.dur)} s · ${esc((sh.chars || []).join(', ') || 'nessun personaggio')}</span></p>
    ${sh.kf && !ratioOk(p, sh.kf) ? `<p class="status ko">⚠ Il fotogramma non è nel formato ${p.ratio} del film: rifallo, il video uscirebbe tagliato.</p>` : ''}
    <div class="sh-real ${L.score >= 80 ? 'g' : L.score >= 60 ? 'y' : 'r'}"><b>Controllo del prompt ${L.score}/100</b>${L.issues.length ? '<ul>' + L.issues.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>' : '<span> testo chiaro e senza rischi noti ✓</span>'}
      <small class="muted">Controlla il testo, non l'immagine: guarda sempre il fotogramma prima di approvarlo.</small></div>
    ${s.st === 'err' ? `<p class="status ko">${esc(s.err || '')}</p>` : ''}
    ${p.dialog !== 'no' ? `<div class="sh-lines"><b>Battute</b>${(sh.lines || []).length ? sh.lines.map((l, k) => `<div class="sh-line"><span>${esc(l.char)}</span><input data-lt="${k}" value="${esc(l.text)}"><select data-le="${k}">${EMOTIONS.map(([v, t]) => `<option value="${v}" ${l.emotion === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`).join('') : '<span class="muted small"> nessuna, inquadratura muta</span>'}
      ${sh.voice ? `<audio controls src="${sh.voice.url}"></audio>` : ''}
      ${isTalk(p, sh) ? '<p class="muted small">Parla in camera: InfiniteTalk muoverà le labbra a tempo con la voce.</p>' : ''}</div>` : ''}
    ${(sh.chars || []).length ? `<div class="sh-block"><b>Sguardi e posizioni</b>${sh.chars.map((n, k) => `<div class="sh-bl"><span>${esc(n)}</span>
        <input data-gz="${esc(n)}" value="${esc(((sh.gaze || []).find(g => g.char === n) || {}).at || '')}" placeholder="guarda… (es. Luca, la cassetta)">
        <input data-pl="${esc(n)}" value="${esc(((sh.place || []).find(g => g.char === n) || {}).where || '')}" placeholder="dove sta… (es. a sinistra, davanti)"></div>`).join('')}
      <small class="muted">Puoi scrivere in italiano: li traduco io prima del fotogramma.</small></div>` : ''}
    <label>Primo fotogramma (foto ferma, inglese)<textarea id="shFrame" rows="5" placeholder="Si scrive da solo quando crei il fotogramma">${esc(sh.frame || '')}</textarea></label>
    <label>Movimento per ${esc(MODELS[p.engine].name)} (inglese)<textarea id="shPrompt" rows="6">${esc(sh.prompt)}</textarea></label>
    <details class="adv"><summary>Fisica del movimento e cosa evitare</summary>
      <label>Movimento<textarea id="shMotion" rows="2">${esc(sh.motion || '')}</textarea></label>
      <label>Cosa evitare<textarea id="shNeg" rows="2">${esc(sh.negative || '')}</textarea></label></details>
    <div class="actions">
      ${kfValid(p, sh) && !sh.ok && !s.clip ? '<button class="btn primary" id="shOk">✓ Fotogramma approvato</button>' : ''}
      ${kfValid(p, sh) && sh.ok ? `<button class="btn primary" id="shGo" ${s.st === 'run' || s.st === 'kf' ? 'disabled' : ''}>${s.clip ? '↻ Rigira solo il video' : '🎬 Gira il video'} · ≈ ${money(costParts(p, sh).video + costParts(p, sh).voice)}</button>` : ''}
      <button class="btn" id="shKf" ${s.st === 'run' || s.st === 'kf' ? 'disabled' : ''}>${kfValid(p, sh) ? '↻ Rifai fotogramma' : '🖼 Crea fotogramma'} · ≈ ${money(kfPrice(p, sh) + costParts(p, sh).voice)}</button>
      ${prevShot(p, sh) && shotState(prevShot(p, sh), p).clip ? '<button class="btn" id="shChain">⛓ Continua dall\'ultimo fotogramma del ciak precedente (gratis)</button>' : ''}
      <button class="btn" id="shFix">✨ Rendi più realistico</button>
      ${s.clip ? '<button class="btn" id="shGal">Apri in Galleria</button>' : ''}
    </div>`;
  const save = () => {
    sh.prompt = $('#shPrompt').value; sh.frame = $('#shFrame').value.trim(); sh.motion = $('#shMotion').value; sh.negative = $('#shNeg').value;
    $$('#shBody [data-lt]').forEach(i => { sh.lines[+i.dataset.lt].text = i.value.trim(); });
    $$('#shBody [data-le]').forEach(s => { sh.lines[+s.dataset.le].emotion = s.value; });
    sh.lines = (sh.lines || []).filter(l => l.text);
    $$('#shBody [data-gz]').forEach(i => setPair(sh, 'gaze', 'at', i.dataset.gz, i.value.trim()));
    $$('#shBody [data-pl]').forEach(i => setPair(sh, 'place', 'where', i.dataset.pl, i.value.trim()));
    rgSave(p);
  };
  $$('#shBody [data-lt], #shBody [data-le], #shBody [data-gz], #shBody [data-pl]').forEach(x => x.onchange = save);
  ['#shPrompt', '#shFrame', '#shMotion', '#shNeg'].forEach(x => $(x).onchange = save);
  const reopen = () => { const np = rgList().find(x => x.id === p.id); if (np) openShot(np, pi, si); renderRegia(); };
  const ok = $('#shOk'); if (ok) ok.onclick = () => { rgShotMut(p.id, sh.id, x => { x.ok = true; }); reopen(); };
  const go1 = $('#shGo'); if (go1) go1.onclick = async () => {
    save(); go1.disabled = true; go1.textContent = 'Invio…';
    const np = rgList().find(x => x.id === p.id);
    if (!rgBudgetOk(np, costParts(np, rgFind(np, sh.id)).video, 'Questo ciak')) { go1.disabled = false; return; }
    rgShotMut(p.id, sh.id, x => { delete x.err; });
    RG.spendTo = p.id;
    try { await rgFilm(p.id, sh.id); toast('Ciak in ripresa'); closeM($('#mShot')); } catch (e) { toast(e.message, 7000); }
    RG.spendTo = null; renderRegia();
  };
  const ch = $('#shChain'); if (ch) ch.onclick = async () => {
    save(); ch.disabled = true; ch.textContent = '⛓ Estraggo l\'ultimo fotogramma…';
    try { await chainFromPrev(p.id, sh.id); toast('Fotogramma preso dal ciak precedente: controllalo e approvalo'); }
    catch (e) { toast('Non riuscito: ' + e.message, 7000); }
    reopen();
  };
  $('#shKf').onclick = async () => {
    save(); const b = $('#shKf'); b.disabled = true; b.textContent = '🖼 Preparo…';
    rgShotMut(p.id, sh.id, x => { delete x.err; if (x.kf) x.kf.sig = 'rifai'; });
    RG.spendTo = p.id;
    try { const np = rgList().find(x => x.id === p.id); await rgPreflight([...imgEndpointsFor(np, [sh]), ...voiceEndpointsFor(np, [sh])]); await rgPrepare(p.id, sh.id); }
    catch (e) { toast('Fotogramma non riuscito: ' + e.message, 7000); }
    RG.spendTo = null; reopen();
  };
  $('#shFix').onclick = async () => {
    save(); const b = $('#shFix'); b.disabled = true; b.textContent = '✨ Riscrivo…';
    try {
      const r = await llmJSON(shotsSystem(p.engine), `FILM BIBLE: ${bibleBrief(p)}\nRewrite this single shot to make the motion simpler and physically real, same story meaning. Problems found: ${L.issues.join('; ') || 'make it more cinematic and realistic'}.\nSHOT: ${JSON.stringify(sh)}\nReply with {"shots":[ONE shot]}`, 1500);
      const n = (r.shots || [])[0];
      if (n && n.prompt) { Object.assign(sh, { prompt: n.prompt, frame: n.frame || sh.frame, motion: n.motion || sh.motion, negative: n.negative || sh.negative, action: n.action || sh.action, camera: n.camera || sh.camera }); sh.dur = nearestDur(p.engine, Math.min(+n.dur || sh.dur, lintShot(sh, p.engine).maxDur)); rgSave(p); }
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
function voiceOfChar(p, name) { const { ch, cast } = charOfName(p, name); return (ch && ch.voiceId) || (cast && cast.voiceId) || 'mm:Friendly_Person'; }
function audioDur(url) {
  return new Promise(res => { const a = new Audio(); a.preload = 'metadata'; a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : 0); a.onerror = () => res(0); a.src = url; setTimeout(() => res(0), 15000); });
}
async function ttsLine(p, line) {
  const vid = voiceOfChar(p, line.char);
  return await ttsVoice(vid, line.text, line.emotion, `voce-${safeFile(line.char)}-${safeFile(line.text.slice(0, 24))}`, line.char);
}
async function ttsVoice(vid, text, emotion, base, who) {
  const line = { text, emotion: emotion || 'neutral', char: who || '' };
  let url = null, key = null, dur = 0;
  if (vid.startsWith('clone:')) {
    const prof = voiceProfiles().find(v => v.id === vid.slice(6));
    if (!prof) throw new Error(`la voce clonata ${line.char ? 'di ' + line.char + ' ' : ''}non esiste più: scegline un'altra`);
    if (!voceId()) throw new Error('per le voci registrate serve l\'endpoint "voce clonata" in ⚙︎ Impostazioni');
    const out = await voceCall({ action: 'tts', text: line.text, lang: 'it', ref: await refOf(prof), exaggeration: line.emotion && line.emotion !== 'neutral' ? 0.75 : 0.5, cfg_weight: 0.5 });
    if (!out.audio_b64) throw new Error('la voce clonata non ha restituito audio');
    const blob = await (await fetch('data:audio/mpeg;base64,' + out.audio_b64)).blob();
    dur = out.duration || 0;
    if (r2On()) { const up = await uploadToR2(blob, base + '.mp3', 'libreria'); key = up.key; url = up.get; } else url = 'data:audio/mpeg;base64,' + out.audio_b64;
  } else {
    const r = await rp('/minimax-speech-02-hd/run', { method: 'POST', retry: 2, body: JSON.stringify({ input: { prompt: line.text, voice_id: vid.slice(3), speed: 1, volume: 1, pitch: 0, emotion: line.emotion || 'neutral', english_normalization: false } }) });
    let out = r.status === 'COMPLETED' ? r.output : null;
    for (let n = 0; out == null && r.id && n < 80; n++) {
      await wait(2000);
      const s = await rp(`/minimax-speech-02-hd/status/${r.id}`);
      if (s.status === 'COMPLETED') out = s.output; else if (BAD.includes(s.status)) throw new Error(s.error || s.status);
    }
    url = out && (typeof out === 'string' ? out : (out.audio_url || out.result || out.url || out.audio || (out.output && (out.output.audio_url || out.output.result))));
    if (!url) throw new Error('RunPod non ha restituito la voce');
    addSpend(line.text.length * VOICE_PRICE);
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

/* sceglie le foto del Cast adatte all'inquadratura: volti nei primi piani, figura intera nei campi larghi (max 4 in tutto) */
function refsForShot(p, sh) {
  const casts = [...new Set((sh.chars || []).map(n => charOfName(p, n).cast).filter(Boolean))];
  if (!casts.length) return [];
  const txt = ((sh.framing || '') + ' ' + (sh.prompt || '').slice(0, 120)).toLowerCase();
  const close = /primo piano|primissimo|dettaglio|close/.test(txt);
  const wide = /campo|figura intera|totale|wide|full shot|long shot|establishing/.test(txt);
  const order = close ? ['volto', 'profilo', 'altro', 'figura'] : wide ? ['figura', 'volto', 'altro', 'profilo'] : ['volto', 'figura', 'profilo', 'altro'];
  const per = casts.length === 1 ? 3 : casts.length === 2 ? 2 : 1;
  let n = 0;
  return casts.slice(0, 4).map(c => {
    let ph = [...charPhotos(c)].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    if (c.master) ph = [{ id: 'master-' + c.master.t, img: c.master.img, kind: 'master' }, ...ph.slice(0, Math.max(1, per - 1))];
    else ph = ph.slice(0, per);
    const nums = ph.map(() => ++n);
    return { c, ph, n: nums };
  });
}

/* regola sui personaggi scelta dall'utente nel passo 1 */
function rgSelNames(p) { return (p.castSel || []).map(id => S.chars.find(c => c.id === id)).filter(Boolean).map(c => c.name); }
function rgCharRule(p) {
  const n = p.nChars || 0, sel = rgSelNames(p);
  const must = sel.length ? ` They MUST include these cast members with these exact names: ${sel.join(', ')}.` : '';
  if (!n) return `Max 3 recurring characters.${must}`;
  return `EXACTLY ${n} recurring character${n > 1 ? 's' : ''} in the whole film, no more and no less (people in the background do not exist).${must}${sel.length < n ? ` Invent the other ${n - sel.length}.` : ''}`;
}
function rgCharCheck(p, B) {
  const chars = (B && B.characters) || [], n = p.nChars || 0;
  const names = chars.map(c => String(c.cast || c.name).toLowerCase());
  if (n && chars.length !== n) return `you wrote ${chars.length} characters instead of exactly ${n}`;
  const miss = rgSelNames(p).filter(s => !names.includes(s.toLowerCase()) && !chars.some(c => String(c.name).toLowerCase() === s.toLowerCase()));
  if (miss.length) return `these cast members are missing: ${miss.join(', ')}`;
  return '';
}

/* =================== sguardi e posizioni: dati obbligatori, non consigli =================== */
function normPairs(a, k) { return (Array.isArray(a) ? a : []).filter(x => x && x.char && x[k]).map(x => ({ char: String(x.char).trim(), [k]: String(x[k]).trim() })); }
function setPair(sh, field, k, name, val) {
  sh[field] = (sh[field] || []).filter(x => x.char !== name);
  if (val) sh[field].push({ char: name, [k]: val });
}
function missingBlocking(sh) {
  return (sh.chars || []).filter(n => {
    const g = (sh.gaze || []).some(x => x.char.toLowerCase() === String(n).toLowerCase());
    const pl = (sh.chars || []).length < 2 || (sh.place || []).some(x => x.char.toLowerCase() === String(n).toLowerCase());
    return !g || !pl;
  });
}
function blockingText(sh) {
  const g = (sh.gaze || []).map(x => { const a = x.at.replace(/^looks?\s+/i, '').replace(/^at\s+(forward|ahead|straight|away|down|up|sideways|off-screen)/i, '$1'); return `${x.char} looks ${/^(at|down|up|toward|towards|into|out|away|straight|forward|ahead|sideways|off-screen|over|past|back)\b/i.test(a) ? '' : 'at '}${a}`; });
  const pl = (sh.chars || []).length > 1 ? (sh.place || []).map(x => `${x.char} is ${/^(on|in|at)\b/i.test(x.where) ? '' : 'on the '}${x.where}`) : [];
  const parts = [];
  if (pl.length) parts.push('Blocking: ' + pl.join('; ') + '.');
  if (g.length) parts.push('Eyeline: ' + g.join('; ') + '.');
  return parts.join(' ');
}
const IT_WORDS = /\b(guarda|verso|sinistra|destra|davanti|dietro|centro|il|la|lo|gli|le|sua|suo|cassetta|lavagna|basso|alto)\b/i;
function blockingItalian(sh) { return [...(sh.gaze || []).map(x => x.at), ...(sh.place || []).map(x => x.where)].some(s => IT_WORDS.test(s)); }
async function englishBlocking(pid, shId) {
  const p = rgList().find(x => x.id === pid), sh = p && rgFind(p, shId);
  if (!sh || !blockingItalian(sh)) return;
  const r = await llmJSON('Translate these short stage directions from Italian into concise English. Keep the same JSON structure. Reply ONLY with JSON.', JSON.stringify({ gaze: sh.gaze || [], place: sh.place || [] }), 500);
  rgShotMut(pid, shId, x => { if (r.gaze) x.gaze = normPairs(r.gaze, 'at'); if (r.place) x.place = normPairs(r.place, 'where'); });
}
const BLOCK_SYS = 'You are a film director. For each shot, decide where each listed character LOOKS and where they STAND in the frame, coherent with the shot description. English, short. Reply ONLY with JSON {"shots":[{"i":0,"gaze":[{"char":"","at":""}],"place":[{"char":"","where":"left/right/centre, foreground/background"}]}]}.';
async function fillBlocking(p, shots) {
  const need = shots.map((s, i) => ({ s, i })).filter(x => missingBlocking(x.s).length);
  if (!need.length) return;
  const r = await llmJSON(BLOCK_SYS, need.map(x => `SHOT ${x.i}: characters ${x.s.chars.join(', ')}. ${x.s.prompt}`).join('\n'), 900);
  (r.shots || []).forEach(o => {
    const s = shots[+o.i]; if (!s) return;
    normPairs(o.gaze, 'at').forEach(g => { if (!(s.gaze || []).some(x => x.char === g.char)) (s.gaze = s.gaze || []).push(g); });
    normPairs(o.place, 'where').forEach(g => { if (!(s.place || []).some(x => x.char === g.char)) (s.place = s.place || []).push(g); });
  });
}
async function fillBlockingOne(pid, shId) {
  const p = rgList().find(x => x.id === pid), sh = p && rgFind(p, shId); if (!sh) return;
  const tmp = [JSON.parse(JSON.stringify(sh))];
  await fillBlocking(p, tmp);
  rgShotMut(pid, shId, x => { x.gaze = tmp[0].gaze || []; x.place = tmp[0].place || []; });
}

/* cambi di aspetto: solo se la storia li chiede, dalla parte indicata in poi */
function storyChangesFor(p, sh) {
  const ch = (p.bible && p.bible.changes) || [];
  if (!ch.length) return '';
  const pi = p.parts.findIndex(pt => pt.shots.some(s => s.id === sh.id)) + 1;
  return ch.filter(c => c && c.change_en && (sh.chars || []).some(n => String(n).toLowerCase() === String(c.char).toLowerCase()) && pi >= (+c.from_part || 1))
    .map(c => `Story-required appearance change for ${c.char}: ${c.change_en}.`).join(' ');
}

/* =================== continuità tra un ciak e l'altro =================== */
const KEEP_SAME = 'Everyone stays exactly as in the first frame: same face, same hairstyle and hair colour, same clothes, same body; no transformation.';
function shotOrder(p) { return p.parts.flatMap(pt => pt.shots); }
function prevShot(p, sh) { const all = shotOrder(p), i = all.findIndex(s => s.id === sh.id); return i > 0 ? all[i - 1] : null; }
/* inquadratura precedente approvata con almeno un personaggio in comune: fa da riferimento per vestiti, luogo e luce */
function prevShotWithKf(p, sh) {
  const all = shotOrder(p), i = all.findIndex(s => s.id === sh.id);
  for (let k = i - 1; k >= 0 && k >= i - 3; k--) {
    const s = all[k];
    if (s.kf && s.ok && kfFresh(s.kf) && (s.chars || []).some(n => (sh.chars || []).includes(n))) return s;
  }
  return null;
}
/* il testo del video descrive solo il movimento: l'aspetto viene dal primo fotogramma (costa < 0,001 $) */
async function cleanMotion(pid, shId) {
  const p = rgList().find(x => x.id === pid), sh = p && rgFind(p, shId); if (!sh) return '';
  const sig = hashStr((sh.prompt || '') + '#' + (sh.motion || '') + '#' + (sh.camera || ''));
  if (sh.mclean && sh.mclean.sig === sig) return sh.mclean.text;
  let t = '';
  try {
    t = await llm('You edit prompts for IMAGE-TO-VIDEO models. The first frame is already given, so the prompt must describe ONLY what moves: the action, gestures, expression changes, camera movement, light changes, physics. REMOVE every description of people\'s appearance: age, face, hair, skin, body, clothes, accessories. Refer to people only by their name. English, under 80 words. Reply with the prompt only.',
      `Prompt: ${sh.prompt}\nMotion notes: ${sh.motion || ''}\nCamera: ${sh.camera || ''}`, 500);
    t = t.replace(/^["']|["']$/g, '').trim();
  } catch (e) { }
  if (!t || looksItalian(t)) t = [sh.camera, sh.motion].filter(Boolean).join('. ') || sh.prompt;
  rgShotMut(pid, shId, x => { x.mclean = { sig, text: t }; });
  return t;
}
/* ⛓ parte dall'ultimo fotogramma del ciak precedente: gratis (worker di montaggio), eredita viso, vestiti e luce */
async function chainFromPrev(pid, shId) {
  const p = rgList().find(x => x.id === pid), sh = p && rgFind(p, shId); if (!sh) return;
  const prev = prevShot(p, sh), clip = prev && shotState(prev, p).clip;
  if (!clip) throw new Error('il ciak precedente non è ancora girato');
  if (!montId()) throw new Error('serve il worker di montaggio collegato');
  const { audio, image, ...src } = await clipSource(clip, { left: MAX_PAYLOAD });
  const out = await workerCall({ action: 'lastframe', ...src });
  if (!out || !out.image) throw new Error('fotogramma non ricevuto');
  const kf = { url: out.image, t: Date.now(), sig: kfSig(p, sh), chained: prev.id };
  if (r2On()) { try { const up = await uploadToR2(await dataUrlToBlob(out.image), `${stamp()}-fotogramma-continua-${safeFile((sh.chars || []).join('-') || 'scena')}.jpg`, 'immagini'); kf.key = up.key; kf.url = up.get; } catch (e) { } }
  try { kf.img = await fileToJpeg(await dataUrlToBlob(out.image), 640); } catch (e) { kf.img = out.image; }
  const d = await imgDims(kf.img); if (d) { kf.w = d.w; kf.h = d.h; }
  rgShotMut(pid, shId, x => { x.kf = kf; x.ok = false; delete x.err; });
}
