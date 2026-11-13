# Ciak si gira — versione 2.6

App personale per creare ciak video con RunPod, montarli in piccoli film con un editor a tracce,
dare loro una voce (anche la tua, clonata) e aggiungere i sottotitoli in italiano e inglese.
Tutta l'elaborazione avviene su RunPod: il browser invia le richieste, mostra le anteprime e salva i risultati.

## 1. L'app (GitHub Pages) — repository `Ciaksigira`
1. Carica nella radice: `index.html`, `style.css`, `app.js`, `models.js`, `montaggio.js`, `libreria.js`,
   `voce.js`, `sottotitoli.js`, `cast.js`, `archivio.js`, `regista.js`, `elementi.js`, `manifest.webmanifest` e le icone `icona*.png` / `icona.svg`.
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

## 7. Regista AI (versione 2.1)
Scheda **Regista**: dall'idea scritta, o dal copione/master in PDF, al film.
1. **L'idea** — scrivi l'idea oppure carica il PDF del copione; il worker di montaggio ne legge il testo.
   Scegli durata, genere, formato, modello video e quanti dialoghi vuoi.
2. **Scrivi la storia** — Qwen3 su RunPod scrive storia, personaggi (aspetto fisso e voce), luoghi,
   trama in parti con i tempi e, per ogni parte, le inquadrature con il prompt adatto al modello scelto.
3. **Personaggi** — collega ognuno a una foto del Cast, oppure "🎨 Crea con AI". Scegli la voce:
   una voce AI oppure una tua voce clonata.
4. **Per ogni parte, in tre passi (si paga solo quello che serve):**
   1. **Storyboard** (circa 0,03 $ a inquadratura): voce della battuta e fotogramma iniziale con i volti del Cast,
      salvati in R2 così non scadono. Nessun video ancora.
   2. **Approva:** guarda i fotogrammi; approva quelli buoni e rifai solo quelli sbagliati (↻ Rifai fotogramma).
   3. **Gira gli approvati:** parte prima un ciak di prova e, se RunPod lo accetta, gli altri.
      Chi parla in camera viene girato con InfiniteTalk, con le labbra a tempo.
   - "Rigira solo il video" non ripaga fotogramma e voce. Prima di ogni spesa l'app controlla gratis che i servizi rispondano.
   - **Budget:** se imposti un budget massimo, la barra in basso mostra "speso" e "per finire" e l'app avvisa prima di superarlo.
5. **Manda al montaggio** — i ciak vanno in ordine sulla traccia video e le battute sulla traccia voce.
   Dopo "Monta il film", in 💬 Sottotitoli le frasi italiane sono già pronte: premi "Traduci in inglese".

**Realismo dei movimenti.** Ogni inquadratura viene controllata (punteggio 0–100): azioni a catena, più di 2 persone,
mani impegnate, movimenti veloci, trasformazioni, camera brusca. Se il punteggio è basso, l'AI la riscrive con un
movimento semplice e fisico, e le scene complesse diventano ciak più corti.

**Contenuti +18.** La storia viene classificata (per tutti, temi adulti, violenza, esplicito) e per il modello scelto
l'app ti dice se di solito la accetta. I contenuti sessuali espliciti non vengono generati: c'è "Rendi suggerito".

**Cast (versione 2.3).** Tocca un personaggio per aprire la sua scheda:
- più foto, ognuna con il tipo (volto, profilo, figura intera): il Regista sceglie da solo quelle adatte a ogni inquadratura
  e nel prompt dice quali foto sono di chi, così i volti non si mescolano;
- ⭐ foto principale, ✏️ ritocco, 🗑, "Crea profilo e figura intera con l'AI" partendo dal volto;
- 🗣 voce: scegli una voce AI oppure "🎙 Registra la sua voce" (leggi un breve testo, con il consenso della persona).
**Master (versione 2.4).** Nella scheda: "Crea il master da tutte le foto" → una tavola con volto, tre quarti e figura intera
(Nano Banana 2, circa 0,13 $). Puoi scrivere i "tratti che non devono mai cambiare". Quando lo blocchi 🔒 diventa il primo riferimento
in ogni fotogramma e non cambia più (neanche aggiungendo foto), salvo "Rifai il master". Cambi di aspetto solo se la storia li chiede.
I fotogrammi con i personaggi usano di base "Volti fedeli" (Nano Banana 2, circa 0,09 $); "Economico" (Seedream, circa 0,03 $) si sceglie nel passo 1.
**Personaggio di fantasia:** "+ Nuovo" → "🧙 È un personaggio di fantasia". L'app ti fa poche domande (età, viso, capelli,
vestiti, voce), crea la scheda fissa e il ritratto; profilo e figura intera solo se li chiedi.
Nel Regista, "🎨 Crea con AI" apre la stessa intervista già compilata con quello che la storia sa del personaggio.

**Ritocco foto.** ✏️ su ogni personaggio per ritoccare la foto (togliere persone, mani o braccia estranee, oggetti, sfondo);
puoi annullare l'ultimo ritocco o tornare all'originale. **Crea:** ✨ Crea prompt trasforma la tua idea in un prompt
per il modello scelto, con le regole contro mani in più, arti tagliati e volti che cambiano.

## 8. Archivio completo (versione 2.5)
Tutto resta in Cloudflare R2: ciak (`ciak/`), film (`film/`), i tuoi file e le voci (`libreria/`), campioni delle voci clonate (`voci/`)
e ora anche ogni immagine (`immagini/`): master, fotogrammi, ritratti e viste AI, ritocchi e foto del Cast.
Le immagini create da RunPod vengono copiate direttamente dal worker (gratis); le foto del Cast si caricano da sole in sottofondo.
Galleria → **Archivio**: filtri per tipo (video, immagini, audio) e provenienza, anteprime, scarica, elimina, spazio usato.
"Svuota temporanei" elimina solo i file di servizio (`temp/`, `anteprima/`) più vecchi di 2 giorni.
R2 è gratis fino a 10 GB, poi circa 0,015 $ al GB al mese.

## 9. Oggetti, sfondi, simboli e 🎨 Componi (versione 2.6)
La scheda **Cast** ha cinque sezioni: 👤 Personaggi · 👕 Oggetti · 🏞 Sfondi · ✳️ Simboli · 🖼 Composizioni.
- **+ Nuovo** in Oggetti, Sfondi o Simboli: descrivilo e premi "✨ Crealo con l'AI" (Qwen Image, circa 0,02 $), oppure carica una tua foto.
  Per i simboli puoi scrivere il testo esatto del logo. Crea segni tuoi: i marchi famosi vengono rifiutati o storpiati.
- Tocca un elemento per aprirne la scheda: ✏️ modifica a parole (circa 0,02 $, con ↶ per annullare), usalo come foto di partenza in Crea,
  scaricalo, oppure "🎨 Componi con questo".
- **🎨 Componi** mescola fino a 6 elementi in una sola immagine: 📸 foto o scena, 👥 coppia o gruppo, 👕 prova costume, 📣 banner (con il testo esatto),
  ✳️ logo. Formati 1:1, 4:5, 3:2, 16:9, 9:16. Motore "Fedele" (Nano Banana 2, circa 0,09 $; 2K circa 0,13 $) oppure "Economico" (Seedream, circa 0,03 $).
  Senza elementi l'immagine nasce solo dalla descrizione (circa 0,02 $). "✏️ Correggi" modifica il risultato senza rifarlo da zero.
  Per i personaggi con il master 🔒 viene usato il master; nella prova costume la foto a figura intera.
- Ogni immagine pagata viene salvata subito in 🖼 Composizioni e in R2 (`immagini/`): non si perde. Da lì puoi aggiungerla alle foto di un personaggio
  (il master non cambia).
- **Crea:** oggetti, sfondi e simboli compaiono accanto ai personaggi tra i riferimenti.
- **Regista:** nella finestra dell'inquadratura, "Oggetti e sfondi in scena" (al massimo 3) entrano nel fotogramma come riferimento.
  "Usa questi anche nelle altre inquadrature di questa parte" tiene uguali luogo e oggetti in tutta la parte.

## 10. Backup delle chiavi (versione 2.6.1)
⚙︎ → **Backup delle chiavi**:
- **💾 Salva su file**: scegli una password (due volte) e l'app scarica `ciaksigira-chiavi-AAAA-MM-GG.json` con la chiave RunPod
  e gli ID di montaggio e voce, cifrati (AES-256). Senza quella password il file è illeggibile.
- **📂 Carica da file**: scrivi la password del file e scegli il file; chiave e ID tornano al loro posto, cifrati con la password dell'app.
- **🗑 Elimina da questo dispositivo**: toglie chiave e ID dal dispositivo; ciak, film, Cast e archivio restano.
Le chiavi R2 non sono nel file: restano nelle variabili dell'endpoint di montaggio su RunPod.

## Note
- Non modificare l'endpoint di Fonica Infinity: gli endpoint di Ciak si gira sono separati.
- I link ai video RunPod durano 7 giorni: con l'archivio R2 attivo ogni ciak ha anche una copia permanente.
- Prompt in inglese danno di solito risultati migliori.
