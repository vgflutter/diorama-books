const archiveStorageKey='diorama.local-archive.v1';
let archiveState=emptyArchive(),archiveHandle=null,archiveAuthenticated=false,archiveCache=true;
let archiveSaveQueue=Promise.resolve();
try{const raw=localStorage.getItem(archiveStorageKey);if(raw)archiveState=readArchive(raw,normalize);}catch{archiveCache=false;}
try{archiveAuthenticated=sessionStorage.getItem(archiveStorageKey+'.session')==='yes';}catch{}
function archiveNotice(message){$('#archive-notice').textContent=message|| (archiveHandle?'Salvataggio automatico su '+archiveHandle.name:'Archivio nel browser. Salva o scarica il file JSON per conservarlo.');}
async function writeArchiveFile(handle,next){const writer=await handle.createWritable();try{await writer.write(JSON.stringify(next,null,2));await writer.close();}catch(e){await writer.abort().catch(()=>{});throw e;}}
async function commitArchive(next){
 if(archiveHandle){try{await writeArchiveFile(archiveHandle,next);}catch{throw Error('Salvataggio su file non riuscito. La modifica non è stata applicata: verifica i permessi e riprova.');}}
 try{localStorage.setItem(archiveStorageKey,JSON.stringify(next));archiveCache=true;}catch{archiveCache=false;if(!archiveHandle)throw Error('Non posso conservare i dati nel browser. Prima scegli un archivio con Salva su file, poi riprova.');}
 archiveState=next;
 archiveNotice(archiveHandle?'Salvato su '+archiveHandle.name+' · '+new Date().toLocaleTimeString('it-IT'):archiveCache?'Modifiche salvate nel browser. Scarica l’archivio JSON per conservarle.':'Salvataggio del browser non disponibile. Scarica l’archivio prima di chiudere.');
}
function mutateArchive(action){const operation=archiveSaveQueue.then(action);archiveSaveQueue=operation.catch(()=>{});return operation;}
async function api(path,method='GET',data){
 if(path==='login'){if(data.username!=='diorama'||data.password!=='diorama')throw Error('Credenziali non corrette');archiveAuthenticated=true;try{sessionStorage.setItem(archiveStorageKey+'.session','yes');}catch{}return {ok:true};}
 if(!archiveAuthenticated){if(path!=='session')showLogin();throw Error('Accedi per continuare');}
 if(path==='session')return {ok:true};
 if(path==='logout'){archiveAuthenticated=false;try{sessionStorage.removeItem(archiveStorageKey+'.session');}catch{}return {ok:true};}
 if(path==='catalog')return {count:archiveState.catalog.length};
 if(path.startsWith('catalog/books')&&method==='GET'){
  const q=new URLSearchParams(path.split('?')[1]||'').get('q')?.trim()||'';
  if(q.length>200)throw Error('Richiesta di ricerca troppo lunga');
  return {books:archiveSearch(archiveState,q,normalize),count:archiveState.catalog.length};
 }
 if(path==='catalog/books'&&method==='POST')return mutateArchive(async()=>{
  const book=validateCatalogBook(data);
  if(archiveState.catalog.some(b=>b.isbn===book.isbn))throw Error('ISBN già presente nel catalogo');
  const next=structuredClone(archiveState);next.catalog.push(book);await commitArchive(next);
  return {book,count:next.catalog.length};
 });
 if(path==='catalog/import')return mutateArchive(async()=>{const books=parseCatalogCSV(data.csv);const next=archiveImport(archiveState,books);await commitArchive(next);return {imported:books.length,count:next.catalog.length};});
 if(path.startsWith('books?')){
  const q=new URLSearchParams(path.slice(path.indexOf('?')+1)).get('q')?.trim()||'';if(q.length<3||q.length>200)throw Error('Inserisci almeno 3 caratteri');
  const local=archiveSearch(archiveState,q,normalize);if(local.length)return {books:local,warnings:[]};
  if(new URLSearchParams(path.slice(path.indexOf('?')+1)).get('scope')==='catalog')return {books:[],warnings:['Nessun libro nel catalogo scolastico: aggiungi titolo e ISBN in Catalogo oppure importa il CSV.']};
  let code;try{code=normalize(q);}catch{}
  try{const remote=await openLibrary(q,code,fetch);const seen=new Set(),books=[];for(const b of remote){let normalized;try{normalized=normalize(String(b.isbn));}catch{continue;}if(code&&code!==normalized||seen.has(normalized))continue;seen.add(normalized);books.push({...b,isbn:normalized});}return {books,warnings:['Risultati da Open Library: verifica edizione e ISBN.']};}
  catch{return {books:[],warnings:['Catalogo online non disponibile. Importa il CSV o inserisci il libro manualmente.']};}
 }
 if(path==='orders'&&method==='GET')return archiveOrders(archiveState);
 if(path==='anomalies'&&method==='GET')return archiveAnomalies(archiveState);
 const archiveMatch=/^orders\/(\d+)\/archive$/.exec(path);
 if(archiveMatch&&method==='POST')return mutateArchive(async()=>{const {next,result}=archiveOrder(archiveState,archiveMatch[1]);await commitArchive(next);return result;});
 if(path==='orders'&&method==='POST')return mutateArchive(async()=>{const {next,id}=archiveCreate(archiveState,data,normalize);await commitArchive(next);return {id};});
 if(path==='scan')return mutateArchive(async()=>{const {next,result}=archiveScan(archiveState,data.isbn,normalize);await commitArchive(next);return {result};});
 throw Error('Operazione non disponibile');
}
function requireArchiveLogin(){if(!archiveAuthenticated){toast('Accedi con diorama / diorama.');return false;}return true;}
function downloadArchive(){if(!requireArchiveLogin())return;const blob=new Blob([JSON.stringify(archiveState,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='dioramaBooks-archivio.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);archiveNotice('Download avviato: conserva dioramaBooks-archivio.json e riaprilo per continuare.');}
async function openArchive(file,handle=null){
 if(file.size>50000000)throw Error('Archivio troppo grande: massimo 50 MB');
 const next=readArchive(await file.text(),normalize);
 if((archiveState.orders.length||archiveState.catalog.length)&&!confirm('Aprire questo archivio al posto di quello corrente? Prima di cambiare archivio conserva una copia con Scarica JSON.'))return;
 await mutateArchive(async()=>{archiveHandle=handle;archiveState=next;
 try{localStorage.setItem(archiveStorageKey,JSON.stringify(next));}catch{}
 history=[];$('#scan-result').textContent='';$('#scan-history').innerHTML='<p>Le prossime scansioni compariranno qui.</p>';await load();archiveNotice(handle?'Archivio aperto: '+file.name+' · modifiche salvate automaticamente.':'Archivio aperto: '+file.name+' · scarica il JSON aggiornato dopo le modifiche.');toast('Archivio aperto.');});
}
