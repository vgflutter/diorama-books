# PostgreSQL

La versione server usa PostgreSQL quando `DATABASE_URL` è presente; altrimenti mantiene SQLite in `DATA_DIR`. Non vengono migrati automaticamente i dati da SQLite: cambiare connessione seleziona un archivio diverso.

Il driver è `pg`, con connessioni in pool e tabelle clienti, catalogo, ordini, righe ordine, ricevimenti e anomalie. La data di archiviazione è conservata sull’ordine. Ordine e schede libro vengono salvati nella stessa transazione. Le scansioni dello stesso ISBN sono serializzate con un lock di transazione, così richieste contemporanee rispettano FIFO senza assegnare più copie del necessario.

Configurare `DATABASE_URL` nelle impostazioni sicure del proprio server, senza inserirla nel repository. Usare la configurazione TLS verificata prevista dal provider, per esempio `sslmode=verify-full` e la CA fornita quando richiesta. Non disabilitare la verifica dei certificati.

Docker Compose passa `DATABASE_URL` alla app e può collegarsi a un PostgreSQL gestito o già installato. La configurazione predefinita continua a usare SQLite e il suo volume persistente.

Il test PostgreSQL viene saltato se non è impostata `DIORAMA_TEST_POSTGRES_URL`. È stato eseguito in questa sessione su un PostgreSQL 17 reale e isolato, verificando importazione, metadati, concorrenza, i tre stati, archiviazione, anomalie e riconnessione, prezzi in centesimi, acconti e selezione del cliente esistente. Le migrazioni sono additive e associano gli ordini precedenti ai clienti, mantenendo date e stati. Per ripeterlo usare esclusivamente un database dedicato chiamato `diorama_test`; il test cancella le sei tabelle applicative del database di prova.
