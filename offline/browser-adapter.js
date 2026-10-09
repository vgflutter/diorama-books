const archiveStorageKey='diorama.local-archive.v1';
let archiveState=emptyArchive(),archiveHandle=null,archiveAuthenticated=false,archiveCache=true,archiveLoadError=false,archiveRaw=null,archiveDirectory=null;
let archiveSaveQueue=Promise.resolve();
try{archiveRaw=localStorage.getItem(archiveStorageKey);}catch{archiveCache=false;}
if(archiveRaw){try{archiveState=readArchive(archiveRaw,normalize);}catch{archiveLoadError=true;}}
try{archiveAuthenticated=sessionStorage.getItem(archiveStorageKey+'.session')==='yes';}catch{}
function archiveNotice(message){
 const notice=$('#archive-notice');
 notice.textContent=archiveLoadError?'Archivio del browser non leggibile: le scritture sono bloccate. Scarica i dati originali o una copia di recupero, poi apri il JSON corretto.':message|| (archiveHandle?'Salvataggio automatico su '+archiveHandle.name:archiveCache?'Dati nel browser: scegli Cartella dati o salva il JSON prima di aggiornare l’app.':'Salvataggio nel browser non disponibile: scegli Cartella dati o Salva su file.');
 notice.classList.toggle('error',archiveLoadError);
}
function ensureArchiveWritable(){if(archiveLoadError)throw Error('Archivio non leggibile: apri un JSON valido prima di scrivere nuovi dati. I dati originali sono conservati.');}
async function writeArchiveFile(handle,next){const writer=await handle.createWritable();try{await writer.write(typeof next==='string'?next:JSON.stringify(next,null,2));await writer.close();}catch(e){await writer.abort().catch(()=>{});throw e;}}
async function backupDirectory(directory,raw){
 if(!raw)return;
 await writeArchiveFile(await directory.getFileHandle('dioramaBooks-recupero.json',{create:true}),raw);
 const dated='dioramaBooks-backup-'+new Date().toISOString().slice(0,10)+'.json';
 let existing=null;try{existing=await directory.getFileHandle(dated);}catch(e){if(e.name!=='NotFoundError')throw e;}
 if(!existing||(await existing.getFile()).size===0)await writeArchiveFile(existing||await directory.getFileHandle(dated,{create:true}),raw);
}
async function commitArchive(next){
 ensureArchiveWritable();const raw=JSON.stringify(next);
 if(!archiveHandle){let current;try{current=localStorage.getItem(archiveStorageKey);}catch{throw Error('Archivio del browser non accessibile. Scegli una cartella dati prima di continuare.');}if(current!==archiveRaw)throw Error('L’archivio è stato modificato in un’altra scheda. Ricarica la pagina prima di continuare.');}

 if(archiveHandle){try{if(archiveHandle.getFile){const current=await archiveHandle.getFile();if(JSON.stringify(readArchive(await current.text(),normalize))!==JSON.stringify(readArchive(archiveState,normalize)))throw Error('Il file è stato modificato altrove: riaprilo prima di continuare.');}if(archiveDirectory)await backupDirectory(archiveDirectory,archiveRaw||JSON.stringify(archiveState));await writeArchiveFile(archiveHandle,next);}catch(e){throw Error('Salvataggio su file non riuscito. La modifica non è stata applicata: '+(e.message.includes('modificato altrove')?e.message:'verifica i permessi e riprova.'));}}
 try{backupArchive(localStorage,archiveStorageKey,archiveRaw);localStorage.setItem(archiveStorageKey,raw);archiveCache=true;}catch{archiveCache=false;if(!archiveHandle)throw Error('Non posso conservare i dati e la copia di recupero nel browser. Scegli Cartella dati o Salva su file, poi riprova.');}
 archiveState=next;archiveRaw=raw;
 archiveNotice(archiveHandle?'Salvato su '+archiveHandle.name+' · '+new Date().toLocaleTimeString('it-IT')+(archiveDirectory?' · copie di recupero nella cartella.':' · conserva una copia con Scarica JSON.'):'Salvato nel browser · scarica il JSON a fine giornata e prima di cambiare versione.');
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
 if(path.split('?')[0]==='customers'&&method==='GET'){const query=new URLSearchParams(path.split('?')[1]||'');return archiveCustomers(archiveState,query.get('first_name')||'',query.get('last_name')||'');}
 const customerMatch=/^customers\/(\d+)\/orders$/.exec(path);
 if(customerMatch&&method==='GET')return archiveCustomerOrders(archiveState,customerMatch[1]);
 if(path==='orders'&&method==='GET')return archiveOrders(archiveState);
 if(path==='anomalies'&&method==='GET')return archiveAnomalies(archiveState);
 const archiveMatch=/^orders\/(\d+)\/archive$/.exec(path);
 if(archiveMatch&&method==='POST')return mutateArchive(async()=>{const {next,result}=archiveOrder(archiveState,archiveMatch[1]);await commitArchive(next);return result;});
 if(path==='orders'&&method==='POST')return mutateArchive(async()=>{const {next,id}=archiveCreate(archiveState,data,normalize);await commitArchive(next);return {id};});
 if(path==='scan')return mutateArchive(async()=>{const {next,result}=archiveScan(archiveState,data.isbn,normalize);await commitArchive(next);return {result};});
 throw Error('Operazione non disponibile');
}
function requireArchiveLogin(){if(!archiveAuthenticated){toast('Accedi con diorama / diorama.');return false;}return true;}
function downloadJSON(raw,name){const blob=new Blob([raw],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function downloadArchive(){if(!requireArchiveLogin())return;downloadJSON(archiveLoadError?archiveRaw||'':JSON.stringify(archiveState,null,2),archiveLoadError?'dioramaBooks-dati-originali.json':'dioramaBooks-archivio.json');archiveNotice('Download avviato: conserva il JSON fuori dalla cartella dell’app e riaprilo nella nuova versione.');}
function downloadRecovery(){if(!requireArchiveLogin())return;try{const entries=JSON.parse(localStorage.getItem(archiveStorageKey+'.backups')||'[]');const valid=entries.find(e=>{try{readArchive(e.raw,normalize);return true;}catch{return false;}});if(!valid)throw Error('Nessuna copia di recupero disponibile.');downloadJSON(valid.raw,'dioramaBooks-recupero-'+valid.saved_at.replace(/[:.]/g,'-')+'.json');toast('Copia di recupero scaricata. Aprila con Apri archivio per verificarla.');}catch(e){toast(e.message);}}
async function openArchive(file,handle=null,directory=null){
 if(file.size>50000000)throw Error('Archivio troppo grande: massimo 50 MB');
 const raw=await file.text(),next=readArchive(raw,normalize);
 if(!archiveLoadError&&JSON.stringify(next)!==JSON.stringify(readArchive(archiveState,normalize))&&(archiveState.orders.length||archiveState.catalog.length)&&!confirm('Aprire questo archivio al posto di quello corrente? Scarica prima il JSON corrente se vuoi conservarlo anche fuori dal browser.'))return;
 await mutateArchive(async()=>{
  try{backupArchive(localStorage,archiveStorageKey,archiveRaw);localStorage.setItem(archiveStorageKey,raw);archiveCache=true;}catch{archiveCache=false;if(!handle)throw Error('Non posso conservare il file nel browser. Scegli una cartella dati oppure libera spazio dopo aver scaricato i dati originali.');}
  archiveHandle=handle;archiveDirectory=directory;archiveState=next;archiveRaw=raw;archiveLoadError=false;
  history=[];selectedCustomer=null;$('#scan-result').textContent='';$('#scan-history').innerHTML='<p>Le prossime scansioni compariranno qui.</p>';await load();archiveNotice(handle?'Archivio aperto: '+file.name+' · salvataggio automatico'+(directory?' e copie di recupero nella cartella.':'.'):'Archivio aperto: '+file.name+' · scarica il JSON aggiornato dopo le modifiche.');toast('Archivio aperto.');
 });
}
async function selectArchiveDirectory(){
 if(!requireArchiveLogin())return;
 if(!window.showDirectoryPicker){toast('Per la cartella dati usa Chrome o Edge sul computer. Puoi anche aprire e scaricare il JSON.');return;}
 try{
  const directory=await showDirectoryPicker({mode:'readwrite',id:'dioramaBooks-data'});
  let handle;try{handle=await directory.getFileHandle('dioramaBooks-archivio.json');}catch(e){if(e.name!=='NotFoundError')throw e;}
  if(handle){await openArchive(await handle.getFile(),handle,directory);return;}
  ensureArchiveWritable();
  await mutateArchive(async()=>{handle=await directory.getFileHandle('dioramaBooks-archivio.json',{create:true});const raw=JSON.stringify(archiveState,null,2);await backupDirectory(directory,raw);await writeArchiveFile(handle,raw);archiveHandle=handle;archiveDirectory=directory;});
  archiveNotice('Cartella dati collegata: archivio, copia precedente e copia giornaliera salvati separatamente dall’app.');toast('Cartella dati pronta. Riaprila a ogni avvio.');
 }catch(e){if(e.name!=='AbortError')toast(e.message);}
}
