# Ciak si gira — versione 2.0

App personale per creare ciak video con RunPod, montarli in piccoli film con un editor a tracce,
dare loro una voce (anche la tua, clonata) e aggiungere i sottotitoli in italiano e inglese.
Tutta l'elaborazione avviene su RunPod: il browser invia le richieste, mostra le anteprime e salva i risultati.

## 1. L'app (GitHub Pages) — repository `Ciaksigira`
1. Carica nella radice: `index.html`, `style.css`, `app.js`, `models.js`, `montaggio.js`, `libreria.js`,
   `voce.js`, `sottotitoli.js`, `manifest.webmanifest` e le icone `icona*.png` / `icona.svg`.
2. Settings → Pages → Branch `main` → Save.
3. Apri l'app, crea la password, incolla la chiave API RunPod e premi "Prova chiave".

## 2. Il worker di montaggio (RunPod Serverless, CPU) — repository `Ciaksigira-montaggio`
Monta il film (transizioni, testi, voce, musica), estrae l'ultimo fotogramma, unisce le voci ai video,
trascrive l'audio con Whisper e crea i film sottotitolati.
1. Nel repository `Ciaksigira-montaggio` carica `Dockerfile` e `handler.py` della cartella `worker-montaggio`.
2. Su RunPod: Serverless → New Endpoint → GitHub Repo → `Ciaksigira-montaggio` (branch `main`).
3. Worker **CPU** (8 vCPU), Max workers 2, Active workers 0, Execution timeout 1800 s.
4. Copia l'**Endpoint ID** nell'app: ⚙︎ → Montaggio su RunPod → Salva → Prova.

Quando aggiorni `handler.py` o il `Dockerfile` su GitHub, RunPod ricostruisce il worker da solo
(con la v2.0 la build dura qualche minuto in più perché scarica il modello Whisper per i sottotitoli).

## 3. L'archivio dei tuoi file (Cloudflare R2)
1. Su RunPod apri l'endpoint di montaggio → **Manage → Edit Endpoint** → **Environment Variables**.
2. Variabili: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (valori salvati da Cloudflare).
3. Nell'app: ⚙︎ → Archivio file (R2) → **Verifica archivio**.

Il bucket `ciaksigira` deve avere la regola CORS per `https://dinopegaso77-sys.github.io`.
Cartelle: `libreria/` (i tuoi file), `ciak/`, `film/`, `anteprima/`, `temp/`, `voci/` (campioni delle voci clonate).

## 4. La voce clonata (RunPod Serverless, GPU) — repository `Ciaksigira-voce` (facoltativo)
Registri (o carichi) 20–30 secondi della tua voce mentre leggi un testo; poi l'app fa dire qualsiasi frase
con quella voce, in italiano, inglese, francese, spagnolo o tedesco. Modello: Chatterbox Multilingual (licenza MIT).
1. Crea il repository `Ciaksigira-voce` e carica `Dockerfile` e `handler.py` della cartella `worker-voce`.
2. Su RunPod: Serverless → New Endpoint → GitHub Repo → `Ciaksigira-voce`.
3. Worker **GPU da 16 o 24 GB** (es. RTX A4000/A5000/4090), Max workers 1, Active workers 0,
   Idle timeout 60 s, Execution timeout 900 s. Nessuna variabile da aggiungere.
4. Attendi la build (la prima è lunga: scarica PyTorch e il modello).
5. Nell'app: ⚙︎ → Voce clonata su RunPod → incolla l'ID → Prova ("pronto su GPU ✓").
6. Crea voce → **Le mie voci** → ＋ Nuova voce → leggi il testo → spunta il consenso → Salva.

Clona solo la tua voce o quella di persone che te lo hanno permesso. L'audio creato contiene un watermark
impercettibile che lo identifica come sintetico. La prima frase dopo una pausa richiede 1–2 minuti
(RunPod accende la GPU); poi è rapida. Si paga solo il tempo di GPU usato (pochi centesimi a voce).

## 5. Come si usa il montaggio (editor a tracce)
- **Video/foto**, **Cartello**, **Testo**, **Voce**, **Musica** aggiungono elementi alle 5 tracce.
- Tocca un blocco per selezionarlo; trascinalo per spostarlo, tira le maniglie bianche ‖ per accorciarlo.
- Trascina una **transizione** sul rombo ◇ tra due clip (o toccala e poi tocca il rombo).
- ▶ mostra l'anteprima dal vivo nel browser; **Anteprima esatta** la fa montare a RunPod in bassa qualità;
  **Monta il film** crea il film finale in Full HD.

## 6. Sottotitoli italiano + inglese
Nella lista "Film montati" premi **💬 Sottotitoli**:
1. **Trascrivi l'italiano** — Whisper (sul worker di montaggio) ascolta il film e scrive le frasi con i tempi.
2. **Traduci in inglese** — Qwen3 su RunPod traduce le frasi; se non risponde, Whisper traduce dall'audio.
3. Correggi le frasi, scarica i file `.srt` oppure **Crea il film sottotitolato**:
   - "Nessuna": tracce IT ed EN dentro il file, da attivare nel lettore (VLC, iPhone, TV);
   - "Italiano" o "Inglese": la scritta è stampata nel video e si vede ovunque (anche sui social).

## Note
- Non modificare l'endpoint di Fonica Infinity: gli endpoint di Ciak si gira sono separati.
- I link ai video RunPod durano 7 giorni: con l'archivio R2 attivo ogni ciak ha anche una copia permanente.
- Prompt in inglese danno di solito risultati migliori.
