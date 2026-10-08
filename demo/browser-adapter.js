// Adapter della demo offline: nessuna richiesta al server o a cataloghi esterni.
const demoStorageKey='diorama.offline-demo.v1';
let demoStorageAvailable=true;
let demoAuthenticated=false;
try{demoAuthenticated=sessionStorage.getItem(demoStorageKey+'.session')==='yes';}catch{}
function initialDemoState(){
 const now=Date.now();const at=n=>new Date(now-n*60000).toISOString();
 const book=demoBooks[0],other=demoBooks[1];
 return {version:1,catalog:structuredClone(demoBooks),nextOrder:4,nextItem:4,nextAnomaly:1,anomalies:[],receipts:[{item_id:3,created_at:at(20)}],orders:[
  {id:1,first_name:'Anna',last_name:'Rossi',created_at:at(120),items:[{...book,id:1,order_id:1,quantity:2,received:0}]},
  {id:2,first_name:'Luca',last_name:'Bianchi',created_at:at(60),items:[{...book,id:2,order_id:2,quantity:1,received:0}]},
  {id:3,first_name:'Giulia',last_name:'Verdi',created_at:at(30),items:[{...other,id:3,order_id:3,quantity:1,received:1}]},
 ]};
}
let demoState;
try{const saved=localStorage.getItem(demoStorageKey);demoState=saved?JSON.parse(saved):initialDemoState();if(!Array.isArray(demoState.catalog)||!Array.isArray(demoState.orders))throw Error();if(!saved)localStorage.setItem(demoStorageKey,JSON.stringify(demoState));}
catch{demoStorageAvailable=false;demoState=initialDemoState();}
function saveDemo(next){
 if(demoStorageAvailable){try{localStorage.setItem(demoStorageKey,JSON.stringify(next));}catch{throw Error('Spazio del browser insufficiente. La modifica non è stata salvata.');}}
 demoState=next;
}
demoState.anomalies??=[];demoState.nextAnomaly??=demoState.anomalies.reduce((n,a)=>Math.max(n,a.id+1),1);
function demoOrder(order){const copy=structuredClone(order);copy.total=copy.items.reduce((n,i)=>n+i.quantity,0);copy.received=copy.items.reduce((n,i)=>n+i.received,0);copy.status=copy.archived_at?'archiviato':copy.received===copy.total?'evaso':'pendente';return copy;}
async function api(path,method='GET',data){
 if(path==='login'){
  if(data.username!=='diorama'||data.password!=='diorama')throw Error('Credenziali non corrette');
  demoAuthenticated=true;try{sessionStorage.setItem(demoStorageKey+'.session','yes');}catch{}return {ok:true};
 }
 if(!demoAuthenticated){if(path!=='session')showLogin();throw Error('Accedi per continuare');}
 if(path==='session')return {ok:true};
 if(path==='logout'){demoAuthenticated=false;try{sessionStorage.removeItem(demoStorageKey+'.session');}catch{}return {ok:true};}
 if(path==='catalog')return {count:demoState.catalog.length};
 if(path==='catalog/import'){
  const books=parseCatalogCSV(data.csv);const next=structuredClone(demoState);
  for(const book of books){const existing=next.catalog.findIndex(b=>b.isbn===book.isbn);const value={...book,languages:'ita',origin:'CSV',source:'Catalogo libreria'};if(existing<0)next.catalog.push(value);else next.catalog[existing]=value;}
  saveDemo(next);return {imported:books.length,count:next.catalog.length};
 }
 if(path.startsWith('books?')){
  const q=new URLSearchParams(path.slice(path.indexOf('?')+1)).get('q')?.trim()||'';
  if(q.length<3||q.length>200)throw Error('Inserisci almeno 3 caratteri');
  let code;try{code=normalize(q);}catch{}
  const words=q.toLocaleLowerCase('it').split(/\s+/);
  const books=demoState.catalog.filter(b=>code?b.isbn===code:words.every(w=>[b.title,b.author,b.publisher,b.year,b.volume].join(' ').toLocaleLowerCase('it').includes(w))).slice(0,40);
  return {books:structuredClone(books),warnings:['Demo offline: ricerca nel catalogo locale. Le API online sono disponibili nella versione server.']};
 }
 if(path==='orders'&&method==='GET')return [...demoState.orders].sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id-a.id).map(demoOrder);
 if(path==='anomalies'&&method==='GET')return archiveAnomalies(demoState);
 const archiveMatch=/^orders\/(\d+)\/archive$/.exec(path);
 if(archiveMatch&&method==='POST'){const {next,result}=archiveOrder(demoState,archiveMatch[1]);saveDemo(next);return result;}
 if(path==='orders'&&method==='POST'){
  const first=String(data.first_name||'').trim(),last=String(data.last_name||'').trim();
  if(!first||!last||first.length>100||last.length>100)throw Error('Inserisci nome e cognome');
  if(!Array.isArray(data.items)||!data.items.length||data.items.length>100)throw Error('Aggiungi almeno un libro');
  const items=data.items.map(i=>{const title=String(i.title||'').trim(),quantity=Number(i.quantity);if(!title||title.length>500||!Number.isInteger(quantity)||quantity<1||quantity>999)throw Error('Titolo o quantità non validi');return {...structuredClone(i),title,isbn:normalize(String(i.isbn)),quantity,received:0};});
  const next=structuredClone(demoState),id=next.nextOrder++;
  for(const item of items){item.id=next.nextItem++;item.order_id=id;if(!next.catalog.some(b=>b.isbn===item.isbn)){const {id:ignoredId,order_id:ignoredOrder,quantity:ignoredQty,received:ignoredReceived,...book}=item;next.catalog.push({...book,origin:item.source||'Ordine',source:'Catalogo libreria'});}}
  next.orders.push({id,first_name:first,last_name:last,created_at:new Date().toISOString(),items});saveDemo(next);return {id};
 }
 if(path==='scan'){const {next,result}=archiveScan(demoState,data.isbn,normalize);saveDemo(next);return {result};}
 throw Error('Operazione non disponibile nella demo');
}
