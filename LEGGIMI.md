# Regista AI

App personale per creare clip video con RunPod (Wan 2.6, Seedance 2.5, Kling O1) e montarle in piccoli film.
Tutta l'elaborazione avviene su RunPod: l'app invia le richieste e salva i risultati.

## 1. L'app (GitHub Pages)
1. Crea un repository (es. `Ciaksigira`) e carica: `index.html`, `style.css`, `app.js`, `models.js`, `montaggio.js`, `libreria.js`.
2. Settings → Pages → Branch `main` → Save.
3. Apri l'app, crea la password, incolla la chiave API RunPod e premi "Prova chiave".

## 2. Il worker di montaggio (RunPod Serverless)
Serve per unire i ciak, aggiungere titoli, transizioni e musica, ed estrarre l'ultimo fotogramma ("Continua da qui").
1. Crea un SECONDO repository (es. `regista-montaggio`) e carica il contenuto della cartella `worker-montaggio`
   (`Dockerfile`, `handler.py`, `test_input.json`) nella radice del repository.
2. Su RunPod: Serverless → New Endpoint → GitHub Repo → scegli `regista-montaggio` (branch `main`).
3. Scegli un worker **CPU** (basta e costa poco), Max workers 1, Active workers 0.
4. Crea l'endpoint e attendi la fine della build.
5. Copia l'**Endpoint ID** e incollalo nell'app: ⚙︎ → Montaggio su RunPod → Salva → Prova.

Non modificare l'endpoint di Fonica Infinity: questo è un endpoint separato.

## 3. L'archivio dei tuoi file (Cloudflare R2)
Serve per caricare i tuoi video, foto e registrazioni, per tenere una copia di ogni ciak e per i film lunghi.
1. Su RunPod apri l'endpoint di montaggio → **Manage → Edit Endpoint** → **Environment Variables**.
2. Aggiungi queste 3 variabili (i valori sono quelli salvati da Cloudflare):
   - `R2_ENDPOINT` → l'indirizzo S3 che finisce con `.r2.cloudflarestorage.com`
   - `R2_ACCESS_KEY_ID` → l'Access Key ID
   - `R2_SECRET_ACCESS_KEY` → la Secret Access Key
3. Salva: RunPod riavvia il worker.
4. Nell'app: ⚙︎ → Archivio file (R2) → **Verifica archivio**.

Il bucket si chiama `ciaksigira` e deve avere la regola CORS per `https://dinopegaso77-sys.github.io`.

## Note
- I link ai video RunPod durano 7 giorni: monta i ciak entro una settimana dalla generazione.
- Musica: file audio fino a 6 MB (es. MP3).
- Prompt in inglese danno di solito risultati migliori.
