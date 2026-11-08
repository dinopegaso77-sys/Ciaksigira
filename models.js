/* Regista AI — catalogo modelli video RunPod (campi verificati sulla documentazione ufficiale, novembre 2026).
   needs.image: 'no' | 'opt' (foto facoltativa) | 'req' (serve una foto o un personaggio)
   needs.video: serve un ciak di riferimento · needs.audio: serve un file audio
   audioOut: 'yes' (crea l'audio) | 'no' (muto) | 'toggle' (attivabile) | 'ref' (prende l'audio del ciak di riferimento) */
'use strict';

const GROUPS = ['Bozze economiche', 'Con audio', 'Qualità massima', 'Personaggi e movimento', 'Speciali'];
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const neg = (inp, o) => { if (o.negative) inp.negative_prompt = o.negative; return inp; };

const MODELS = {
  /* ---------------- BOZZE ECONOMICHE ---------------- */
  pruna: {
    name: 'Pruna Video', group: 'Bozze economiche', tag: 'Il più economico',
    desc: 'Il modello più economico: ottimo per provare idee e inquadrature. Da testo o da una foto.',
    priceLabel: '0,10 $ / 5 s · bozza 0,03 $',
    needs: { image: 'opt' }, audioOut: 'no', neg: false,
    ratios: ['16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '1:1'], durations: range(1, 10), res: ['720p', '1080p'], defRes: '720p',
    extras: [{ id: 'draft', type: 'check', label: 'Bozza veloce (costa il 75% in meno, qualità più bassa)', def: false }],
    hint: 'Foto facoltativa: se la metti diventa il primo fotogramma.',
    endpoint: () => 'p-video',
    price: o => (o.res === '1080p' ? 0.04 : 0.02) * (o.ex.draft ? 0.25 : 1) * o.duration,
    input: o => {
      const inp = { prompt: o.prompt, duration: o.duration, resolution: o.res, aspect_ratio: o.ratio, draft: !!o.ex.draft };
      if (o.startImg) inp.image = o.startImg;
      return inp;
    }
  },
  wan22: {
    name: 'Wan 2.2', group: 'Bozze economiche',
    desc: 'Anima una foto in 720p. Economico e stabile, senza audio.',
    priceLabel: '0,30 $ / 5 s',
    needs: { image: 'req' }, audioOut: 'no', neg: true,
    ratios: null, durations: [5, 8, 10, 15], res: [], defRes: '720p',
    hint: 'Serve una foto (o scegli un personaggio): il video parte da lì.',
    endpoint: () => 'wan-2-2-i2v-720',
    price: o => 0.06 * o.duration,
    input: o => neg({ prompt: o.prompt, image: o.img, num_inference_steps: 30, guidance: 5, size: '1280*720', duration: o.duration, flow_shift: 5, seed: -1, enable_prompt_optimization: false }, o)
  },
  wan21: {
    name: 'Wan 2.1', group: 'Bozze economiche',
    desc: 'Versione precedente di Wan 2.2: anima una foto in 720p, senza audio.',
    priceLabel: '0,30 $ / 5 s',
    needs: { image: 'req' }, audioOut: 'no', neg: true,
    ratios: null, durations: [5, 10, 15], res: [], defRes: '720p',
    hint: 'Serve una foto (o scegli un personaggio): il video parte da lì.',
    endpoint: () => 'wan-2-1-i2v-720',
    price: o => 0.06 * o.duration,
    input: o => neg({ prompt: o.prompt, image: o.img, num_inference_steps: 30, guidance: 5, size: '1280*720', duration: o.duration, flow_shift: 5, seed: -1, enable_prompt_optimization: false }, o)
  },

  /* ---------------- CON AUDIO ---------------- */
  wan: {
    name: 'Wan 2.6', group: 'Con audio',
    desc: 'Da testo o da foto, crea anche l\'audio. Buon equilibrio tra prezzo e qualità.',
    priceLabel: '0,50 $ / 5 s',
    needs: { image: 'opt' }, audioOut: 'yes', neg: true,
    ratios: ['16:9', '9:16'], durations: [5, 10, 15], res: ['720p', '1080p'], defRes: '720p',
    hint: 'Foto facoltativa: diventa il primo fotogramma (con foto solo 16:9).',
    endpoint: o => o.startImg ? 'wan-2-6-i2v' : 'wan-2-6-t2v',
    price: o => (o.res === '1080p' ? 0.15 : 0.10) * o.duration,
    input: o => {
      const sizes = { '16:9': { '720p': '1280*720', '1080p': '1920*1080' }, '9:16': { '720p': '720*1280', '1080p': '1080*1920' } };
      const inp = { prompt: o.prompt, duration: o.duration, shot_type: 'single', seed: -1, enable_prompt_expansion: false };
      if (o.startImg) { inp.image = o.startImg; inp.resolution = o.res; inp.size = o.res; } // i2v: RunPod passa 'size' al campo 'resolution'
      else inp.size = sizes[o.ratio][o.res];
      return neg(inp, o);
    }
  },
  wan25: {
    name: 'Wan 2.5', group: 'Con audio', tag: 'Audio a poco prezzo',
    desc: 'Anima una foto e crea da solo l\'audio sincronizzato. Il più economico con audio.',
    priceLabel: '0,25–0,75 $ / 5 s',
    needs: { image: 'req' }, audioOut: 'yes', neg: true,
    ratios: null, durations: range(3, 10), res: ['480p', '720p', '1080p'], defRes: '720p',
    hint: 'Serve una foto (o scegli un personaggio): il video parte da lì.',
    endpoint: () => 'wan-2-5',
    price: o => ({ '480p': 0.05, '720p': 0.10, '1080p': 0.15 })[o.res] * o.duration,
    input: o => neg({ prompt: o.prompt, image: o.img, resolution: o.res, duration: o.duration, seed: -1, enable_prompt_expansion: false }, o)
  },
  vidu: {
    name: 'Vidu Q3', group: 'Con audio',
    desc: 'Da testo o da foto, fino a 16 secondi, con effetti sonori e musica di sottofondo. Ha anche lo stile anime.',
    priceLabel: '0,75 $ / 5 s',
    needs: { image: 'opt' }, audioOut: 'toggle', neg: false,
    ratios: ['16:9', '9:16', '4:3', '3:4', '1:1'], durations: [3, 4, 5, 6, 8, 10, 12, 16], res: ['540p', '720p', '1080p'], defRes: '720p',
    extras: [
      { id: 'bgm', type: 'check', label: 'Musica di sottofondo', def: true },
      { id: 'style', type: 'select', label: 'Stile (solo da testo)', def: 'general', options: [['general', 'Realistico'], ['anime', 'Anime']] },
      { id: 'move', type: 'select', label: 'Movimento', def: 'auto', options: [['auto', 'Automatico'], ['small', 'Piccolo'], ['medium', 'Medio'], ['large', 'Grande']] }
    ],
    hint: 'Foto facoltativa: se la metti, il video parte da lì.',
    endpoint: o => o.startImg ? 'vidu-q3-i2v' : 'vidu-q3-t2v',
    price: o => 0.15 * o.duration,
    input: o => {
      const inp = { prompt: o.prompt, resolution: o.res, duration: o.duration, movement_amplitude: o.ex.move || 'auto', generate_audio: o.audio, bgm: !!o.ex.bgm, seed: -1 };
      if (o.startImg) inp.image = o.startImg;
      else { inp.style = o.ex.style || 'general'; inp.aspect_ratio = o.ratio; }
      return inp;
    }
  },
  sora: {
    name: 'Sora 2', group: 'Con audio',
    desc: 'Il modello di OpenAI: anima una foto con suoni d\'ambiente e dialoghi. Descrivi azione, suoni e battute.',
    priceLabel: '0,40 $ / 4 s',
    needs: { image: 'req' }, audioOut: 'yes', neg: false,
    ratios: null, durations: [4, 8, 12], res: [], defRes: '720p',
    hint: 'Serve una foto (o un personaggio). Nel testo scrivi: Azione… Suoni… Dialogo…',
    endpoint: () => 'sora-2-i2v',
    price: o => 0.10 * o.duration,
    input: o => ({ prompt: o.prompt, image: o.img, duration: o.duration })
  },

  /* ---------------- QUALITÀ MASSIMA ---------------- */
  seedance: {
    name: 'Seedance 2.5', group: 'Qualità massima', tag: 'Il migliore',
    desc: 'Qualità cinematografica fino al 4K, audio incluso, volti coerenti con i personaggi. Il più caro.',
    priceLabel: '0,90 $ (480p) – 4,50 $ (1080p) / 5 s',
    needs: { image: 'opt' }, audioOut: 'toggle', neg: false,
    ratios: ['16:9', '9:16', '21:9', '1:1', '4:3', '3:4'], durations: [4, 5, 6, 8, 10, 12, 15, 20, 30],
    res: ['480p', '720p', '1080p', '4k'], defRes: '720p',
    hint: 'I personaggi fanno da riferimento per i volti; una foto diventa il primo fotogramma.',
    endpoint: o => o.startImg ? '16jsvx5ncmm24x' : 'tdq07exynr7zux',
    price: o => ({ '480p': 0.18, '720p': 0.36, '1080p': 0.90, '4k': 1.80 })[o.res] * o.duration,
    input: o => {
      const inp = { prompt: o.prompt, duration: o.duration, resolution: o.res, aspect_ratio: o.ratio, generate_audio: o.audio, seed: -1 };
      if (o.startImg) inp.image = o.startImg;
      else if (o.charImgs.length) inp.reference_images = o.charImgs.slice(0, 9);
      return inp;
    }
  },
  sorapro: {
    name: 'Sora 2 Pro', group: 'Qualità massima',
    desc: 'Versione Pro di Sora 2: più dettaglio, fino al 1080p, con suoni e dialoghi.',
    priceLabel: '1,20 $ (720p) – 2,00 $ (1080p) / 4 s',
    needs: { image: 'req' }, audioOut: 'yes', neg: false,
    ratios: null, durations: [4, 8, 12], res: ['720p', '1080p'], defRes: '720p',
    hint: 'Serve una foto (o un personaggio). Nel testo scrivi: Azione… Suoni… Dialogo…',
    endpoint: () => 'sora-2-pro-i2v',
    price: o => (o.res === '1080p' ? 0.50 : 0.30) * o.duration,
    input: o => ({ prompt: o.prompt, image: o.img, size: o.res, duration: o.duration })
  },

  /* ---------------- PERSONAGGI E MOVIMENTO ---------------- */
  kling: {
    name: 'Kling O1', group: 'Personaggi e movimento',
    desc: 'Rigira un tuo ciak con i tuoi personaggi (fino a 10 foto di riferimento). Video muto: l\'app ci rimette l\'audio del ciak.',
    priceLabel: '0,56 $ / 5 s',
    needs: { image: 'opt', video: true, chars: true }, audioOut: 'ref', neg: true,
    ratios: ['16:9', '9:16', '1:1'], durations: range(3, 10), res: [], defRes: null,
    hint: 'Scegli i personaggi (o una foto) e un ciak di riferimento.',
    endpoint: () => 'kling-video-o1-r2v',
    price: o => 0.112 * o.duration,
    input: o => neg({ prompt: o.prompt, images: [...(o.startImg ? [o.startImg] : []), ...o.charImgs].slice(0, 10), video: o.refVideo, aspect_ratio: o.ratio, duration: o.duration, seed: -1, enable_prompt_expansion: false }, o)
  },
  klingmc: {
    name: 'Kling Motion Control', group: 'Personaggi e movimento', tag: 'Copia i movimenti',
    desc: 'Trasferisce i movimenti di un tuo ciak (balli, gesti, camminate) su un personaggio da foto. Tiene l\'audio del ciak.',
    priceLabel: '0,42 $ / 4–6 s',
    needs: { image: 'req', video: true }, audioOut: 'ref', neg: true,
    ratios: null, durations: [], res: [], defRes: null,
    extras: [
      { id: 'orient', type: 'select', label: 'Orientamento', def: 'video', options: [['video', 'Come nel ciak'], ['image', 'Come nella foto']] },
      { id: 'sound', type: 'check', label: 'Tieni l\'audio del ciak di riferimento', def: true }
    ],
    hint: 'Serve la foto del personaggio (o sceglilo dal cast) e il ciak con il movimento da copiare.',
    endpoint: () => 'kling-v2-6-std-motion-control',
    price: o => { const d = o.refDuration || 5; return d <= 3 ? 0.21 : d <= 6 ? 0.42 : 0.63; },
    input: o => neg({ image: o.img, video: o.refVideo, character_orientation: o.ex.orient || 'video', prompt: o.prompt, keep_original_sound: o.ex.sound !== false }, o)
  },

  /* ---------------- SPECIALI ---------------- */
  talk: {
    name: 'InfiniteTalk', group: 'Speciali', tag: 'Fa parlare e cantare',
    desc: 'Fa parlare o cantare un personaggio da una foto e un file audio (voce o canzone), con labbra a tempo.',
    priceLabel: '0,25 $ (480p) – 0,50 $ (720p) a video',
    needs: { image: 'req', audio: true }, audioOut: 'yes', neg: false,
    ratios: null, durations: [], res: ['480p', '720p'], defRes: '480p',
    hint: 'Serve la foto del personaggio e un file audio con la voce o la canzone.',
    endpoint: () => 'infinitetalk',
    price: o => o.res === '720p' ? 0.50 : 0.25,
    input: o => ({ prompt: o.prompt, image: o.img, audio: o.audioIn, size: o.res, enable_safety_checker: true })
  }
};

const BADGES = {
  image: { req: '📷 serve una foto', opt: '📷 foto facoltativa', no: '' },
  audioOut: { yes: '🔊 crea l\'audio', toggle: '🔊 audio attivabile', no: '🔇 muto', ref: '🔊 audio dal ciak' }
};
function modelBadges(m) {
  return [BADGES.image[m.needs.image], m.needs.video ? '🎞 serve un ciak' : '', m.needs.audio ? '🎵 serve un audio' : '', BADGES.audioOut[m.audioOut]].filter(Boolean);
}
