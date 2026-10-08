export function emptyArchive(){return {format:'diorama-books',version:1,catalog:[],orders:[],receipts:[],anomalies:[],nextOrder:1,nextItem:1,nextAnomaly:1};}
const text=(v,max=500)=>String(v??'').slice(0,max);
const validDate=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export function readArchive(raw,normalize){
 const input=typeof raw==='string'?JSON.parse(raw):raw;
 if(input?.format!=='diorama-books'||input.version!==1||!Array.isArray(input.catalog)||!Array.isArray(input.orders)||!Array.isArray(input.receipts))throw Error('Il file non è un archivio Diorama valido');
 const next=emptyArchive(),catalogCodes=new Set(),orderIds=new Set(),itemIds=new Set(),received=new Map();
 for(const b of input.catalog){const code=normalize(String(b.isbn??''));if(!b.title||String(b.title).length>500||catalogCodes.has(code))throw Error('Catalogo non valido o ISBN duplicato');catalogCodes.add(code);next.catalog.push({isbn:code,title:text(b.title),author:text(b.author,300),publisher:text(b.publisher,300),year:text(b.year,100),volume:text(b.volume,100),languages:text(b.languages,100),origin:text(b.origin,100),source:'Catalogo libreria'});}
 for(const order of input.orders){
  if(!Number.isSafeInteger(order.id)||order.id<1||orderIds.has(order.id)||!order.first_name||!order.last_name||!validDate(order.created_at)||!Array.isArray(order.items)||!order.items.length)throw Error('Ordine non valido nell’archivio');
  orderIds.add(order.id);next.nextOrder=Math.max(next.nextOrder,order.id+1);
  const copy={id:order.id,first_name:text(order.first_name,100),last_name:text(order.last_name,100),created_at:order.created_at,archived_at:order.archived_at??null,items:[]};
  for(const i of order.items){
   if(!Number.isSafeInteger(i.id)||i.id<1||itemIds.has(i.id)||!i.title||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>999||!Number.isInteger(i.received)||i.received<0||i.received>i.quantity)throw Error('Quantità o riga ordine non valida');
   itemIds.add(i.id);next.nextItem=Math.max(next.nextItem,i.id+1);received.set(i.id,i.received);
   copy.items.push({id:i.id,order_id:order.id,isbn:normalize(String(i.isbn??'')),title:text(i.title),author:text(i.author,300),publisher:text(i.publisher,300),year:text(i.year,100),volume:text(i.volume,100),quantity:i.quantity,received:i.received});
  }
  if(copy.archived_at!==null&&(!validDate(copy.archived_at)||copy.items.some(i=>i.received!==i.quantity)))throw Error('Ordine archiviato non valido: mancano copie o data di archiviazione');
  next.orders.push(copy);
 }
 const counts=new Map();
 for(const r of input.receipts){if(!itemIds.has(r.item_id)||!validDate(r.created_at))throw Error('Ricevimento non valido');next.receipts.push({item_id:r.item_id,created_at:r.created_at});counts.set(r.item_id,(counts.get(r.item_id)||0)+1);}
 for(const [id,n] of received)if((counts.get(id)||0)!==n)throw Error('Le scansioni non corrispondono alle quantità ricevute');
 if(input.anomalies!==undefined&&!Array.isArray(input.anomalies))throw Error('Registro anomalie non valido');
 const anomalyIds=new Set();
 for(const a of input.anomalies||[]){
  if(!Number.isSafeInteger(a.id)||a.id<1||anomalyIds.has(a.id)||!validDate(a.created_at))throw Error('Anomalia non valida');
  anomalyIds.add(a.id);next.nextAnomaly=Math.max(next.nextAnomaly,a.id+1);
  next.anomalies.push({id:a.id,isbn:normalize(String(a.isbn??'')),created_at:a.created_at});
 }
 return next;
}
export function archiveOrders(state){return [...state.orders].sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id-a.id).map(o=>{const copy=structuredClone(o);copy.total=copy.items.reduce((n,i)=>n+i.quantity,0);copy.received=copy.items.reduce((n,i)=>n+i.received,0);copy.status=copy.archived_at?'archiviato':copy.received===copy.total?'evaso':'pendente';return copy;});}
export function archiveAnomalies(state){return structuredClone(state.anomalies).sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id-a.id);}
export function archiveOrder(state,value){
 const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw Error('Ordine non valido');
 const next=structuredClone(state),order=next.orders.find(o=>o.id===id);
 if(!order)throw Error('Ordine non trovato');
 if(order.items.some(i=>i.received<i.quantity))throw Error('Ordine ancora pendente: ricevi tutte le copie prima di archiviarlo');
 order.archived_at=order.archived_at||new Date().toISOString();
 return {next,result:{id,status:'archiviato',archived_at:order.archived_at}};
}
export function archiveCreate(state,input,normalize){
 const first=String(input.first_name??'').trim(),last=String(input.last_name??'').trim();if(!first||!last||first.length>100||last.length>100)throw Error('Inserisci nome e cognome');
 if(!Array.isArray(input.items)||!input.items.length||input.items.length>100)throw Error('Aggiungi almeno un libro');
 const items=input.items.map(i=>{const title=String(i.title??'').trim(),quantity=Number(i.quantity);if(!title||title.length>500||!Number.isInteger(quantity)||quantity<1||quantity>999)throw Error('Titolo o quantità non validi');return {title,author:text(i.author,300),publisher:text(i.publisher,300),year:text(i.year,100),volume:text(i.volume,100),isbn:normalize(String(i.isbn)),quantity,received:0,origin:text(i.source||'Manuale',100)};});
 const next=structuredClone(state),id=next.nextOrder++;
 for(const item of items){item.id=next.nextItem++;item.order_id=id;if(!next.catalog.some(b=>b.isbn===item.isbn))next.catalog.push({isbn:item.isbn,title:item.title,author:item.author,publisher:item.publisher,year:item.year,volume:item.volume,origin:item.origin,languages:'',source:'Catalogo libreria'});}
 next.orders.push({id,first_name:first,last_name:last,created_at:new Date().toISOString(),archived_at:null,items});return {next,id};
}
export function archiveScan(state,value,normalize){
 const code=normalize(String(value));const next=structuredClone(state);
 for(const order of [...next.orders].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id-b.id)){
  if(order.archived_at)continue;
  const item=order.items.find(i=>i.isbn===code&&i.received<i.quantity);if(!item)continue;
  item.received++;next.receipts.push({item_id:item.id,created_at:new Date().toISOString()});return {next,result:{...item,first_name:order.first_name,last_name:order.last_name,created_at:order.created_at}};
 }
 next.anomalies.push({id:next.nextAnomaly++,isbn:code,created_at:new Date().toISOString()});
 return {next,result:null};
}
export function archiveImport(state,books){const next=structuredClone(state);for(const book of books){const index=next.catalog.findIndex(b=>b.isbn===book.isbn);const value={...book,languages:'ita',origin:'CSV',source:'Catalogo libreria'};if(index<0)next.catalog.push(value);else next.catalog[index]=value;}return next;}
export function archiveSearch(state,q,normalize){let code;try{code=normalize(q);}catch{}const words=q.toLocaleLowerCase('it').split(/\s+/);return structuredClone(state.catalog.filter(b=>code?b.isbn===code:words.every(w=>[b.title,b.author,b.publisher,b.year,b.volume].join(' ').toLocaleLowerCase('it').includes(w))).slice(0,40));}
