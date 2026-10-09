// Copie di recupero indipendenti dall'archivio corrente, anche per dati delle versioni precedenti.
export function backupArchive(storage,key,raw){
 if(!raw)return;
 const backupKey=key+'.backups';
 let entries=[];
 try{const saved=storage.getItem(backupKey);if(saved)entries=JSON.parse(saved);if(!Array.isArray(entries))throw Error();}catch{throw Error('Le copie di recupero del browser non sono leggibili. Scarica il JSON prima di continuare.');}
 if(entries[0]?.raw===raw)return;
 const entry={saved_at:new Date().toISOString(),raw};
 storage.setItem(backupKey,JSON.stringify([entry,...entries].slice(0,5)));
}
