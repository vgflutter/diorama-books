# Verifica API e catalogo scolastico — 8 ottobre 2026

Il catalogo principale per Diorama è il CSV del fornitore. È un archivio persistente, non un file letto a ogni ricerca. Un ISBN identifica una determinata edizione e un determinato volume: titolo e autore da soli non permettono un'assegnazione affidabile.

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
