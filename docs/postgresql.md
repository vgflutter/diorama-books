# PostgreSQL

La versione server usa PostgreSQL quando `DATABASE_URL` è presente; altrimenti mantiene SQLite in `DATA_DIR`. Non vengono migrati automaticamente i dati da SQLite: cambiare connessione seleziona un archivio diverso.

Il driver è `pg`, con connessioni in pool e tabelle catalogo, ordini, righe ordine e ricevimenti. Ordine e schede libro vengono salvati nella stessa transazione. Le scansioni dello stesso ISBN sono serializzate con un lock di transazione, così richieste contemporanee rispettano FIFO senza assegnare più copie del necessario.

Configurare `DATABASE_URL` nelle impostazioni sicure del proprio server, senza inserirla nel repository. Usare la configurazione TLS verificata prevista dal provider, per esempio `sslmode=verify-full` e la CA fornita quando richiesta. Non disabilitare la verifica dei certificati.

Docker Compose passa `DATABASE_URL` alla app e può collegarsi a un PostgreSQL gestito o già installato. La configurazione predefinita continua a usare SQLite e il suo volume persistente.

Il test PostgreSQL viene saltato se non è impostata `DIORAMA_TEST_POSTGRES_URL`. È stato eseguito in questa sessione su un PostgreSQL 17 reale e isolato, verificando importazione, metadati, concorrenza, evasione e riconnessione. Per ripeterlo usare esclusivamente un database dedicato chiamato `diorama_test`; il test cancella le quattro tabelle applicative del database di prova.
