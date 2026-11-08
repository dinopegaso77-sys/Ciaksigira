# Regista AI

App personale per creare clip video con RunPod (Wan 2.6, Seedance 2.5, Kling O1) e montarle in piccoli film.
Tutta l'elaborazione avviene su RunPod: l'app invia le richieste e salva i risultati.

## 1. L'app (GitHub Pages)
1. Crea un repository (es. `regista-ai`) e carica: `index.html`, `style.css`, `app.js`, `montaggio.js`.
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

### Film lunghi (facoltativo)
Il film torna all'app dentro la risposta di RunPod. Per film molto lunghi o in 4K si può collegare uno spazio di
archiviazione S3 (es. Cloudflare R2): aggiungi all'endpoint le variabili `BUCKET_ENDPOINT_URL`,
`BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY` e il worker restituirà un link al file.

## Note
- I link ai video RunPod durano 7 giorni: monta i ciak entro una settimana dalla generazione.
- Musica: file audio fino a 6 MB (es. MP3).
- Prompt in inglese danno di solito risultati migliori.
