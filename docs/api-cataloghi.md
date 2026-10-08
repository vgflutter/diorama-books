# Verifica API e catalogo scolastico — 8 ottobre 2026

Il catalogo principale di dioramaBooks è l’archivio scolastico della libreria, alimentato da inserimenti manuali e dal CSV del fornitore. È un archivio persistente, non un file letto a ogni ricerca. Un ISBN identifica una determinata edizione e un determinato volume: titolo e autore da soli non permettono un'assegnazione affidabile.

| Fonte | Integrazione | Verifica eseguita | Limite |
| --- | --- | --- | --- |
| CSV della libreria | Importazione, aggiornamento per ISBN, ricerca locale | Test database, browser e persistenza; volume/edizione mantenuti negli ordini | Deve essere fornito un file aggiornato e con ISBN corretti |
| Open Library | Ricerca per titolo italiano e ISBN esatto | Richieste reali: ricerca Bergamini e ISBN 9788808077356; risposta disponibile | Copertura incompleta; non garantisce le adozioni correnti |
| Google Books v1 | Ricerca italiana, ISBN esatto, metadati, avvisi di errore | Contratto API ufficiale letto; risposta reale senza chiave: HTTP 429, quota giornaliera esaurita; adapter verificato con risposte simulate | Serve una chiave API dedicata e quota abilitata. Copertura scolastica completa non dimostrata |

## Google Books: cosa serve

Il documento ufficiale di discovery [Books API v1](https://www.googleapis.com/discovery/v1/apis/books/v1/rest) conferma l'endpoint `books/v1/volumes`, i parametri `q`, `langRestrict`, `maxResults` e la necessità di una API key o autenticazione OAuth per accesso e quota. Questa app usa la API key sul backend.

1. Nel proprio progetto Google Cloud, abilitare [Books API](https://console.cloud.google.com/apis/library/books.googleapis.com).
2. Creare una chiave per il backend e impostare `GOOGLE_BOOKS_API_KEY` nelle impostazioni sicure del server/cloud. Non inviare valori in chat e non inserirli nel codice o nel browser.
3. Consentire HTTPS a `www.googleapis.com` e riavviare il processo dopo l'iniezione della variabile.
4. Verificare ricerca per ISBN e per titolo su libri effettivamente trattati dalla libreria, controllando volume, editore, edizione e ISBN. Una risposta 200 non dimostra copertura completa degli scolastici.

Senza chiave l'app non invia chiamate Google; usa il catalogo CSV e Open Library e mostra un avviso. Una quota esaurita o un errore di autorizzazione viene segnalato. Non si usano chiavi condivise o credenziali inventate.

## Fonti professionali italiane

Informazioni Editoriali e il servizio adozioni di AIE sono possibili punti di ricerca per dati editoriali/scolastici italiani. In questa sessione i loro siti, insieme alla documentazione ISBNdb, erano bloccati dal proxy con HTTP 403: non è stato possibile verificare API disponibili, licenze, contratti o copertura attuale. Non sono integrati e non vengono presentati come API gratuite o già funzionanti.

La libreria non dispone attualmente di un fornitore/gestionale collegato. Per un futuro feed professionale servono documentazione e condizioni d'uso del servizio scelto. Per ora un CSV aggiornato del fornitore permette di lavorare con le edizioni reali senza dipendere dalla copertura dei cataloghi pubblici.


## Scelta delle fonti per soli scolastici italiani

La ricerca dei nuovi ordini usa per default solo il catalogo della libreria. La selezione **Cerca anche online** abilita le fonti generali già integrate. Il titolo in italiano, la lingua `it`/`ita` e il prefisso di gruppo ISBN non certificano che un libro sia scolastico o che corrisponda all’adozione corrente. La validazione del codice controlla formato e checksum, non la categoria editoriale. Il catalogo locale è scolastico perché la libreria sceglie le schede da inserire o importare.

| Fonte | Come utilizzarla per Diorama | Cosa va verificato |
| --- | --- | --- |
| CSV del fornitore/editore | Importare soltanto il catalogo scolastico italiano aggiornato, con ISBN, titolo, editore, anno e volume | Aggiornamenti, set composti, volumi e corrispondenza alle adozioni |
| [AIE – portale adozioni](https://www.adozioniaie.it/) | Valutare elenchi di adozione per scuola/classe e i relativi ISBN | Non è stata confermata una API pubblica o una licenza per importazione automatica; richiedere condizioni e formato dei dati |
| [Informazioni Editoriali](https://www.ie-online.it/) | Valutare un feed professionale licenziato con metadati editoriali italiani | Chiedere copertura scolastica, filtro di categoria, aggiornamenti, formato CSV/ONIX o API e diritto di memorizzazione |
| [Google Books API](https://www.googleapis.com/discovery/v1/apis/books/v1/rest) | Lookup `q=isbn:ISBN` o ricerca per titolo con `langRestrict=it`; integrazione backend già presente | Chiave/quota, copertura, categoria, volume ed edizione: non garantisce soltanto scolastici |
| [Open Library API](https://openlibrary.org/developers/api) | Ricerca puntuale per ISBN o titolo italiano; già presente anche nell’HTML locale | Copertura scolastica incompleta e metadati non sempre sufficienti per le adozioni |

La documentazione ufficiale Open Library è stata verificata nuovamente l’8 ottobre 2026. Prevede lookup/search per utenti e [dump mensili](https://openlibrary.org/developers/dumps) per accesso massivo. Questi dump sono bibliografici generali: non costituiscono un catalogo pronto degli scolastici italiani. Non costruire il catalogo scaricando migliaia di schede mediante richieste API individuali.

Il discovery ufficiale Google Books è raggiungibile e conferma `q`, `langRestrict`, `printType` e il requisito API key/OAuth. Il filtro di lingua riguarda la lingua, non le adozioni scolastiche. La chiave Google resta da configurare e non è stato verificato un progetto autenticato.

In questa verifica, il proxy ha rifiutato il tunnel HTTPS a `www.ie-online.it`, `www.adozioniaie.it` e `isbndb.com` con HTTP 403. Per questo non sono confermati API, tariffe, licenze o copertura attuali di questi servizi, né è stato collegato un catalogo professionale. La richiesta utile al fornitore è: «catalogo scolastico italiano aggiornato con ISBN di ogni edizione/volume, feed CSV/ONIX o API, diritto di salvataggio e frequenza degli aggiornamenti».
