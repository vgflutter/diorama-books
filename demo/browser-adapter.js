// Adapter della demo offline: nessuna richiesta al server o a cataloghi esterni.
const demoStorageKey='diorama.offline-demo.v1';
let demoStorageAvailable=true;
let demoAuthenticated=false;
try{demoAuthenticated=sessionStorage.getItem(demoStorageKey+'.session')==='yes';}catch{}
function initialDemoState(){
 const now=Date.now();const at=n=>new Date(now-n*60000).toISOString();
 const book=demoBooks[0],other=demoBooks[1];
 return readArchive({format:'diorama-books',version:1,catalog:structuredClone(demoBooks),nextOrder:4,nextItem:4,nextAnomaly:1,anomalies:[],receipts:[{item_id:3,created_at:at(20)}],orders:[
  {id:1,first_name:'Anna',last_name:'Rossi',created_at:at(120),items:[{...book,id:1,order_id:1,quantity:2,received:0}]},
  {id:2,first_name:'Luca',last_name:'Bianchi',created_at:at(60),items:[{...book,id:2,order_id:2,quantity:1,received:0}]},
  {id:3,first_name:'Giulia',last_name:'Verdi',created_at:at(30),items:[{...other,id:3,order_id:3,quantity:1,received:1}]},
 ]},normalize);
}
let demoState;
try{const saved=localStorage.getItem(demoStorageKey);demoState=saved?readArchive({...JSON.parse(saved),format:'diorama-books'},normalize):initialDemoState();if(!Array.isArray(demoState.catalog)||!Array.isArray(demoState.orders))throw Error();if(!saved)localStorage.setItem(demoStorageKey,JSON.stringify(demoState));}
catch{demoStorageAvailable=false;demoState=initialDemoState();}
function saveDemo(next){
 if(demoStorageAvailable){try{localStorage.setItem(demoStorageKey,JSON.stringify(next));}catch{throw Error('Spazio del browser insufficiente. La modifica non è stata salvata.');}}
 demoState=next;
}
demoState.anomalies??=[];demoState.nextAnomaly??=demoState.anomalies.reduce((n,a)=>Math.max(n,a.id+1),1);
async function api(path,method='GET',data){
 if(path==='login'){
  if(data.username!=='diorama'||data.password!=='diorama')throw Error('Credenziali non corrette');
  demoAuthenticated=true;try{sessionStorage.setItem(demoStorageKey+'.session','yes');}catch{}return {ok:true};
 }
 if(!demoAuthenticated){if(path!=='session')showLogin();throw Error('Accedi per continuare');}
 if(path==='session')return {ok:true};
 if(path==='logout'){demoAuthenticated=false;try{sessionStorage.removeItem(demoStorageKey+'.session');}catch{}return {ok:true};}
 if(path==='catalog')return {count:demoState.catalog.length};
 if(path.startsWith('catalog/books')&&method==='GET'){
  const q=new URLSearchParams(path.split('?')[1]||'').get('q')?.trim()||'';
  if(q.length>200)throw Error('Richiesta di ricerca troppo lunga');
  return {books:archiveSearch(demoState,q,normalize),count:demoState.catalog.length};
 }
 if(path==='catalog/books'&&method==='POST'){
  const book=validateCatalogBook(data);
  if(demoState.catalog.some(b=>b.isbn===book.isbn))throw Error('ISBN già presente nel catalogo');
  const next=structuredClone(demoState);next.catalog.push(book);saveDemo(next);
  return {book,count:next.catalog.length};
 }
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
 if(path.split('?')[0]==='customers'&&method==='GET'){const query=new URLSearchParams(path.split('?')[1]||'');return archiveCustomers(demoState,query.get('first_name')||'',query.get('last_name')||'');}
 const customerMatch=/^customers\/(\d+)\/orders$/.exec(path);
 if(customerMatch&&method==='GET')return archiveCustomerOrders(demoState,customerMatch[1]);
 if(path==='orders'&&method==='GET')return archiveOrders(demoState);
 if(path==='anomalies'&&method==='GET')return archiveAnomalies(demoState);
 const archiveMatch=/^orders\/(\d+)\/archive$/.exec(path);
 if(archiveMatch&&method==='POST'){const {next,result}=archiveOrder(demoState,archiveMatch[1]);saveDemo(next);return result;}
 if(path==='orders'&&method==='POST'){const {next,id}=archiveCreate(demoState,data,normalize);saveDemo(next);return {id};}
 if(path==='scan'){const {next,result}=archiveScan(demoState,data.isbn,normalize);saveDemo(next);return {result};}
 throw Error('Operazione non disponibile nella demo');
}
