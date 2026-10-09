# dioramaBooks — ordini in libreria

Applicazione web in italiano per registrare richieste e assegnare le copie in arrivo ai lettori in ordine cronologico. Due versioni: pagina HTML locale con file JSON e applicazione server con SQLite oppure PostgreSQL (driver pg).

## Download pronti

- [dioramaBooks locale — ZIP da estrarre e aprire](downloads/dioramaBooks-locale.zip)
- [dioramaBooks server — sorgenti e configurazione Docker](downloads/dioramaBooks-server.zip)

La chat può mostrare un’anteprima HTML che non esegue JavaScript: scaricare il file o lo ZIP e aprire `dioramaBooks.html` dal computer.

## Versione locale — senza installazioni

Aprire [offline/dioramaBooks.html](offline/dioramaBooks.html) nel browser, oppure estrarre lo ZIP locale e aprire `dioramaBooks.html`. Login iniziale: **diorama / diorama**. La pagina è autonoma e contiene HTML, CSS e JavaScript; non serve Node.js per usarla.

**Cartella dati** (Chrome/Edge) collega una directory separata dall’app: contiene il JSON corrente, una copia precedente e una copia per giornata, scritte prima di modificare il file corrente. Ricollegarla a ogni avvio. `Salva su file` sceglie il JSON su cui Chrome/Edge possono salvare automaticamente. `Scarica JSON` e `Apri archivio` funzionano anche nei browser che non supportano l'accesso diretto ai file. Il JSON conserva catalogo, clienti, prezzi, acconti, ordini, archiviazioni, scansioni e anomalie; una copia nel browser è soltanto un supporto locale. Aprire il JSON salvato quando si riprende su un altro browser o dispositivo. Usare una sola scheda per archivio. Il login locale non cifra i file. Gli archivi JSON precedenti sono compatibili: i nuovi campi vengono aggiunti alla lettura.

La ricerca locale/CSV e l'inserimento manuale funzionano senza Internet. Open Library è consultato per libri mancanti quando è raggiungibile dal browser; Google Books resta nel backend per mantenere la chiave sul server.

Per rigenerare la pagina da sorgenti: `npm run build:local`. Istruzioni per il libraio in [offline/LEGGIMI.txt](offline/LEGGIMI.txt).

## Aggiornare la versione già in uso

Prima di inviare o aprire il nuovo ZIP, nella **vecchia app** usare **Scarica JSON** o **Salva su file** e verificare che il file esista sul computer. Conservarlo fuori dalla cartella dell’app e farne una seconda copia. Estrarre il nuovo ZIP in una cartella diversa, accedere e usare **Apri archivio** con quel JSON. Controllare ordini e ricevimenti, quindi collegare **Cartella dati** o **Salva su file**.

Lo ZIP non contiene i dati operativi. Cambiare percorso, browser o dispositivo può rendere inaccessibile la vecchia cache: il JSON è il mezzo di trasferimento. La chiave di salvataggio del browser resta la stessa; l’app apre anche il formato precedente e conserva una copia prima di salvarne l’aggiornamento. Un dato corrotto blocca le scritture, senza sostituirlo con un archivio vuoto. **Copia di recupero** scarica l’ultima delle cinque copie locali leggibili; la cartella dati mantiene anche copie esterne. Per proteggersi da guasti del computer, copiare periodicamente il JSON su un altro supporto.

## Clienti e importi

Un nuovo ordine seleziona un cliente esistente oppure registra un nuovo cliente, anche omonimo, con un ID distinto. **Clienti** cerca nome e/o cognome e mostra gli ordini pendenti e chiusi (evasi e archiviati). Gli ordini precedenti senza identità cliente vengono raggruppati per nome e cognome normalizzati: allora gli omonimi non erano distinguibili.

Ogni riga registra **prezzo per copia** e quantità. Il totale riguarda tutte le copie ordinate, l’**acconto** è riferito all’intero ordine e **da saldare** è totale meno acconto. Tutti gli importi sono interi in centesimi; prezzi e acconti negativi, più di due decimali e acconti superiori al totale sono rifiutati. I prezzi sono fotografie dell’ordine e non modificano il catalogo. I vecchi ordini senza importi mostrano **Non registrato**. La scansione modifica ricevimento e stato, senza cambiare prezzi o pagamenti.

API protette: `GET /api/customers?first_name=...&last_name=...` e `GET /api/customers/:id/orders`. `POST /api/orders` accetta `customer_id` oppure nome/cognome, `deposit` in euro e `items[].unit_price` in euro. I dati persistiti e restituiti usano `deposit_cents`, `unit_price_cents`, `total_amount_cents` e `balance_cents`. Gli input precedenti senza importi restano compatibili e non inventano valori.

## Avvio della versione server

```sh
npm ci
npm test
npm start
```

L’avvio abilita il proxy di rete supportato da Node.js (`--use-env-proxy`). Porta predefinita 3000, configurabile con `PORT`. Login iniziale: utente **diorama**, password **diorama**. Il database viene creato in `data/diorama.sqlite`; non viene salvato in Git. `DATA_DIR` può indicare una directory persistente alternativa. Le sessioni durano 12 ore e terminano al riavvio.

## Flusso

1. Nuovo ordine: cliente esistente oppure nuovo nome e cognome, prezzo unitario per libro, quantità e acconto; ricerca per titolo/autore/ISBN, selezione dell'edizione e quantità. In alternativa inserire titolo e ISBN manualmente. La ricerca usa il catalogo della libreria; con Cerca anche online consulta anche Google Books e le edizioni italiane di Open Library; un ISBN cerca esattamente la sua edizione; editore, data, lingua e ISBN aiutano a riconoscere l'edizione. Il catalogo non garantisce copertura completa: verificare sempre il codice dell'edizione richiesta.
2. Il server salva la data UTC automaticamente e mostra la data nell'ora locale del browser. Gli ordini iniziano pendenti.
3. Ricevi libri: mantenere il campo ISBN attivo e scansionare con un lettore che invia il codice seguito da Invio. Si può anche digitare il codice. Ogni scansione equivale a una copia.
4. Assegnazione al più vecchio ordine ancora pendente per lo stesso ISBN. A parità di data vale l'ID dell'ordine. Lo stato resta **pendente** finché mancano copie o titoli, con il progresso delle quantità visibile. La scansione dell’ultima copia rende l’ordine **evaso**. Il pulsante **Archivia**, disponibile solo per gli evasi, lo rende **archiviato** e conserva la data di archiviazione.
5. Un ISBN valido senza copie pendenti registra una **anomalia** con ISBN, data e ora. Il registro Anomalie resta disponibile dopo il riavvio. Non vengono modificate quantità degli ordini; un codice non valido viene segnalato come errore e non registrato come libro.

ISBN-10 e ISBN-13 vengono validati e normalizzati in ISBN-13. Le operazioni di ricezione sono transazioni del backend selezionato (SQLite o PostgreSQL). La quantità ricevuta indica arrivo in libreria, non consegna fisica al cliente.

## Configurazione e dati

Per un utilizzo pubblico, configurare `DIORAMA_USER` e `DIORAMA_PASSWORD` con credenziali proprie, usare HTTPS e impostare `COOKIE_SECURE=true`. Non committare credenziali. Montare `DATA_DIR` su storage persistente e fare backup con strumenti compatibili con SQLite/WAL (per esempio API di backup SQLite). Non affidarsi al disco temporaneo di un hosting. Le migrazioni aggiungono campi senza ricreare l’archivio. Prima della migrazione dei clienti, SQLite crea un file `.backup-<data>` consistente accanto al database. Mantenere la stessa `DATA_DIR` o `DATABASE_URL` negli aggiornamenti. Per PostgreSQL predisporre anche i backup del provider o `pg_dump`.

È necessario accesso HTTPS a `openlibrary.org` e `www.googleapis.com` per le ricerche esterne; l'inserimento manuale funziona anche senza catalogo. I test automatici verificano database, persistenza, ISBN, FIFO, quantità, login e API. Non verificano l'hardware del lettore né la disponibilità del catalogo esterno. La pistola reale va provata con due copie dello stesso ISBN e un ordine con più titoli.


## Catalogo manuale

La sezione **Catalogo** permette di salvare uno scolastico con titolo e ISBN senza creare un ordine. Autore, editore, anno/edizione e volume sono facoltativi. ISBN-10 viene normalizzato a ISBN-13; un ISBN già presente viene segnalato, mantenendo la scheda esistente. I libri sono salvati nel backend scelto o nell’archivio JSON locale e diventano disponibili nei nuovi ordini. Anche l’importazione CSV è disponibile direttamente in Catalogo.

La ricerca dei nuovi ordini usa inizialmente **solo il catalogo della libreria**. Selezionare **Cerca anche online** per consultare le fonti esterne: i risultati devono essere verificati come scolastici italiani e come edizioni effettivamente richieste. La lingua italiana e il prefisso ISBN non identificano da soli un testo scolastico.

`GET /api/catalog/books?q=...` cerca nell’archivio locale (fino a 40 risultati); `POST /api/catalog/books` salva un libro manuale. Gli endpoint richiedono login e non generano ordini.

## Catalogo scolastico italiano

Open Library ha copertura limitata degli scolastici italiani. Google Books è una seconda fonte, non un catalogo completo delle adozioni. Non garantiamo che tutte le edizioni e tutti i volumi siano presenti. La libreria può importare l'esportazione del proprio fornitore in CSV, dal pannello Nuovo ordine. Questo catalogo ha priorità e funziona senza servizi esterni. Non sono stati inventati ISBN o popolati cataloghi con corrispondenze non verificate.

Colonne obbligatorie: `isbn`, `titolo`. Facoltative: `autore`, `editore`, `anno`, `volume`. Separatore virgola o punto e virgola, codifica UTF-8, supporto campi fra virgolette e ISBN-10. Massimo 20000 righe e file di 4,5 MB. Una riga non valida rifiuta l'intera importazione; lo stesso ISBN aggiorna la scheda esistente. Gli ordini già salvati non cambiano. Il modello vuoto è scaricabile dall'interfaccia.

Per una copertura professionale delle adozioni scolastiche serve il catalogo del fornitore o un accordo con un distributore di dati editoriali. Non è collegato alcun servizio commerciale senza credenziali e contratto. Google Books richiede una chiave del progetto Google per accesso e quota. Abilitare Books API, quindi configurare `GOOGLE_BOOKS_API_KEY` sul server, senza inserirla nel codice o nel browser.

## Pubblicazione con Docker

```sh
docker compose up --build -d
```

Il servizio ascolta sulla porta 3000. Il volume `diorama-data` mantiene il database fra riavvii e aggiornamenti. Non usare `docker compose down -v` sull'archivio operativo: eliminerebbe il volume. Configurare credenziali diverse per l'uso reale, dominio/HTTPS tramite il proprio hosting e `COOKIE_SECURE=true` con HTTPS. La demo iniziale non contiene clienti reali o ordini fittizi: si possono creare ordini di prova direttamente nell'interfaccia.


## Dati persistenti e API

Il backend scrive realmente nel database selezionato, SQLite o PostgreSQL. Le tabelle `customers`, `catalog`, `orders`, `items` e `receipts` conservano rispettivamente clienti, schede libro, cliente/data/acconto dell’ordine, titoli/ISBN/quantità/prezzo/metadati dell’edizione e scansioni con data e ora. Gli unici tre stati sono pendente, evaso e archiviato. Le quantità ricevute determinano i primi due; `orders.archived_at` registra il passaggio allo storico. La tabella `anomalies` conserva ogni scansione senza un ordine pendente. Stati, ricevimenti e anomalie restano disponibili dopo un riavvio. Il catalogo e gli ordini vengono scritti nella stessa transazione quando si salva un nuovo ordine. Una nuova importazione CSV aggiorna il catalogo ma mantiene le informazioni storiche già salvate negli ordini.

La ricerca locale comprende titolo, autore, editore, anno e volume, con più parole chiave. I libri inseriti manualmente o scelti dalle API vengono conservati nel catalogo alla creazione dell'ordine, senza sovrascrivere le schede già importate dal fornitore.

`GET /api/books?q=...` restituisce `{books, warnings}`: eventuali problemi di una fonte esterna sono visibili anche quando l'altra fonte risponde. `GET /api/catalog` include numero di libri e stato osservato delle fonti, senza mostrare chiavi. `POST /api/orders/:id/archive` archivia un ordine interamente ricevuto; `GET /api/anomalies` legge il registro delle copie senza richiesta. Tutti gli endpoint dati richiedono login.

La chiave Google resta sul server. In Docker Compose viene letta da `GOOGLE_BOOKS_API_KEY` nell'ambiente o nel file locale `.env`; non committare il file. Nelle impostazioni cloud è predisposto un campo sicuro con lo stesso nome. Consultare [la verifica delle API](docs/api-cataloghi.md) per risultati e limiti attuali.


## PostgreSQL

Con `DATABASE_URL` configurata, il server usa PostgreSQL con il driver `pg`; senza, usa SQLite. I dati non passano automaticamente fra archivi diversi. Dettagli e verifica di concorrenza in [docs/postgresql.md](docs/postgresql.md).

## Build e verifica

`npm run build` genera l'HTML locale. `npm test` esegue le verifiche dei backend SQLite, JSON e API; il test PostgreSQL richiede il database di prova dedicato. La build locale è stata aperta nel browser direttamente da file, verificando CSV, ordine, scansione, download di un JSON reale e ripristino in un browser senza dati precedenti.

Per rigenerare i pacchetti ZIP dopo `npm run build`, eseguire `python3 scripts/package-release.py` (Python 3 richiesto soltanto per creare gli ZIP).
