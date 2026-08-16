# Monitor CAE per iPad

Questa è una **PWA offline**: non contiene Python, Streamlit, Google Sheets, account o credenziali. Tutti i risultati sono salvati nel browser del solo iPad tramite la memoria locale del sito.

## Installazione su iPad

Un iPad non può avviare direttamente un server Python e Safari non permette di installare una PWA aprendo semplicemente i file dal gestore File. L'app deve quindi essere pubblicata una sola volta come sito statico HTTPS; dopo la prima apertura potrà funzionare anche senza connessione.

Il metodo più semplice è GitHub Pages:

1. Crea un repository GitHub vuoto, ad esempio `monitor-cae-ipad`.
2. Carica **il contenuto di questa cartella** nella radice del repository: `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js` e la cartella `assets`.
3. Nel repository apri **Settings → Pages**, scegli **Deploy from a branch**, quindi `main` e la cartella `/ (root)`. Salva.
4. Dopo pochi minuti GitHub mostrerà l'indirizzo del sito, del tipo `https://tuo-nome.github.io/monitor-cae-ipad/`.
5. Apri quell'indirizzo in **Safari sull'iPad**, tocca Condividi e scegli **Aggiungi a Home**. Aprila quindi dall'icona appena creata.

L'app non invia punteggi a GitHub: GitHub Pages ospita soltanto i file dell'interfaccia. I dati sono nella memoria di Safari su quell'iPad.

## Uso e sicurezza dei dati

- Inserisci i risultati dalla sezione **Inserisci**. Nel modo *Paper completo* le righe senza punteggio ottenuto non vengono salvate.
- Il modo **Esame intero (18 parti)** richiede tutti i punteggi e applica le soglie della guida ufficiale Cambridge English Scale per Reading, Use of English, Writing, Listening e Speaking. Per Speaking devi anche inserire il punteggio complessivo Cambridge su 75, perché la valutazione ufficiale è basata su criteri e non sulle quattro attività separatamente.
- La guida Cambridge si applica esclusivamente ai practice test ufficiali e dichiara esplicitamente che non predice un punteggio preciso dell'esame reale. Per questo l'app mostra una fascia di Scala Cambridge e segnala se il C1 è sicuramente raggiunto, sicuramente non raggiunto o vicino alla soglia.
- La dashboard comprende filtri, percentuale pesata, aree deboli, torta, barre, andamento, tabella colorata e modifica/eliminazione dei risultati.
- In **Backup**, scarica periodicamente il backup JSON su File/iCloud Drive. È l'unico modo per recuperare i dati dopo aver cancellato i dati di Safari, ripristinato l'iPad o cambiato dispositivo.
- Il CSV è pensato per leggere i dati con Numbers o Excel; per ripristinare l'app usa invece il JSON.

## Limiti intenzionali

I dati non sono sincronizzati con Google Sheets, iCloud o altri dispositivi e non esiste un accesso tramite account. Questo è ciò che rende l'app personale e utilizzabile solo dall'iPad su cui è stata installata.
