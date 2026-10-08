import {isbn} from './store.js';

const providers = {
 google: {name: 'Google Books', state: 'untested', message: 'Non ancora verificato.'},
 openlibrary: {name: 'Open Library', state: 'untested', message: 'Non ancora verificato.'},
};
export function providerStatus() {
 return Object.values(providers).map(p=>({...p, ...(p.name==='Google Books'?{key_configured:Boolean(process.env.GOOGLE_BOOKS_API_KEY)}:{})}));
}
function record(name, state, message) {
 providers[name] = {...providers[name], state, message, checked_at: new Date().toISOString()};
}
async function requestJSON(url, fetcher) {
 const response=await fetcher(url,{signal:AbortSignal.timeout(10000)});
 if(response.status===404)return null;
 if(!response.ok){const error=Error('Errore catalogo');error.status=response.status;throw error;}
 return response.json();
}
async function googleBooks(query,code,fetcher,googleKey) {
 const params=new URLSearchParams({q:code?'isbn:'+code:query,langRestrict:'it',printType:'books',maxResults:'40'});
 params.set('key',googleKey);
 const data=await requestJSON('https://www.googleapis.com/books/v1/volumes?'+params,fetcher);
 const books=[];
 for(const item of data?.items||[]){
  const v=item.volumeInfo||{};
  if(!code&&v.language!=='it')continue;
  for(const id of v.industryIdentifiers||[]){
   if(!['ISBN_10','ISBN_13'].includes(id.type))continue;
   books.push({title:[v.title,v.subtitle].filter(Boolean).join(' — '),author:(v.authors||[]).join(', '),isbn:id.identifier,publisher:v.publisher||'',year:v.publishedDate||'',languages:v.language||'',source:'Google Books'});
  }
 }
 return books;
}
async function openLibrary(query,code,fetcher) {
 if(code){
  const e=await requestJSON('https://openlibrary.org/isbn/'+code+'.json',fetcher);
  return e?[{title:e.title,author:'',isbn:code,publisher:(e.publishers||[]).join(', '),year:e.publish_date||'',languages:(e.languages||[]).map(l=>l.key.split('/').pop()).join(', '),source:'Open Library'}]:[];
 }
 const params=new URLSearchParams({q:query+' language:ita',fields:'key,title,author_name,editions,editions.title,editions.isbn,editions.language,editions.publishers,editions.publish_date',limit:'12'});
 const data=await requestJSON('https://openlibrary.org/search.json?'+params,fetcher);
 const books=[];
 for(const d of data?.docs||[])for(const e of d.editions?.docs||[])for(const raw of e.isbn||[]){
  if(e.language?.length&&!e.language.includes('ita'))continue;
  books.push({title:e.title,author:(d.author_name||[]).join(', '),isbn:raw,publisher:(e.publishers||[]).join(', '),year:(e.publish_date||[]).join(', '),languages:(e.language||[]).join(', '),source:'Open Library'});
 }
 return books;
}
export async function searchCatalog(query, local, fetcher=fetch,{googleKey=process.env.GOOGLE_BOOKS_API_KEY}={}) {
 let code;try{code=isbn(query);}catch{}
 const localBooks=await local.search(query,code);
 if(localBooks.length)return {books:localBooks,warnings:[]};
 const warnings=[];
 const results=await Promise.all([
  ['google',()=>{if(!googleKey){const error=Error('Chiave non configurata');error.status='key_missing';throw error;}return googleBooks(query,code,fetcher,googleKey);}],
  ['openlibrary',()=>openLibrary(query,code,fetcher)],
 ].map(async([name,lookup])=>{
  try{const books=await lookup();record(name,'available','Servizio raggiungibile.');return {books,ok:true};}
  catch(e){
   let message=providers[name].name+': servizio non raggiungibile. Puoi usare il catalogo importato o l’inserimento manuale.';
   if(name==='google'&&e.status==='key_missing')message='Google Books: chiave API non configurata. La ricerca usa il catalogo importato e Open Library.';
   else if(name==='google'&&e.status===429)message='Google Books: quota esaurita. Configura una chiave API dedicata e verifica la quota del progetto.';
   else if(name==='google'&&[401,403].includes(e.status))message='Google Books: accesso rifiutato. Verifica la chiave API, l’abilitazione del servizio e le restrizioni di rete.';
   record(name,e.status==='key_missing'?'not_configured':e.status===429?'quota_exceeded':'unavailable',message);warnings.push(message);return {books:[],ok:false};
  }
 }));
 const books=[],seen=new Set();
 for(const result of results)for(const book of result.books){
  let normalized;try{normalized=isbn(book.isbn);}catch{continue;}
  if(code&&normalized!==code||!book.title||seen.has(normalized))continue;
  seen.add(normalized);books.push({...book,isbn:normalized});
 }
 if(!books.length&&results.every(r=>!r.ok)){const error=Error('Cataloghi esterni non disponibili. Importa il catalogo del fornitore o inserisci il libro manualmente.');error.warnings=warnings;throw error;}
 return {books,warnings};
}
export function parseCatalogCSV(text) {
 const input=String(text).replace(/^\uFEFF/,'');const first=input.split(/\r?\n/)[0];const separator=first.includes(';')?';':',';const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<input.length;i++){const c=input[i];if(c==='"'){if(quoted&&input[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===separator&&!quoted){row.push(cell.trim());cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('CSV non valido: virgolette non chiuse');row.push(cell.trim());if(row.some(Boolean))rows.push(row);const headers=(rows.shift()||[]).map(h=>h.toLowerCase());const index=(...names)=>headers.findIndex(h=>names.includes(h));const ix={isbn:index('isbn','isbn13','ean'),title:index('titolo','title'),author:index('autore','autori','author'),publisher:index('editore','publisher'),year:index('anno','year'),volume:index('volume')};if(ix.isbn<0||ix.title<0)throw Error('Il CSV richiede le colonne isbn e titolo');if(!rows.length||rows.length>20000)throw Error('Il CSV deve contenere da 1 a 20000 libri');return rows.map((r,i)=>{let code;try{code=isbn(r[ix.isbn]);}catch{throw Error('ISBN non valido alla riga '+(i+2));}const title=r[ix.title];if(!title||title.length>500)throw Error('Titolo non valido alla riga '+(i+2));const read=k=>ix[k]<0?'':String(r[ix[k]]||'').slice(0,300);return {isbn:code,title,author:read('author'),publisher:read('publisher'),year:read('year'),volume:read('volume')};});
}
export function validateCatalogBook(input) {
 const title=String(input?.title??'').trim();
 if(!title||title.length>500)throw Error('Titolo non valido: inserisci il titolo del libro');
 const field=(name,max)=>String(input?.[name]??'').trim().slice(0,max);
 return {title,isbn:isbn(input?.isbn),author:field('author',300),publisher:field('publisher',300),year:field('year',100),volume:field('volume',100),origin:'Manuale',languages:'ita',source:'Catalogo libreria'};
}
export function localCatalog(db) {
 db.exec("CREATE TABLE IF NOT EXISTS catalog(isbn TEXT PRIMARY KEY,title TEXT NOT NULL,author TEXT,publisher TEXT,year TEXT,volume TEXT,origin TEXT NOT NULL DEFAULT 'CSV',languages TEXT NOT NULL DEFAULT 'ita')");
 const columns=new Set(db.prepare('PRAGMA table_info(catalog)').all().map(c=>c.name));
 if(!columns.has('origin'))db.exec("ALTER TABLE catalog ADD COLUMN origin TEXT NOT NULL DEFAULT 'CSV'");
 if(!columns.has('languages'))db.exec("ALTER TABLE catalog ADD COLUMN languages TEXT NOT NULL DEFAULT 'ita'");
 const insert=db.prepare('INSERT INTO catalog(isbn,title,author,publisher,year,volume,origin,languages) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(isbn) DO UPDATE SET title=excluded.title,author=excluded.author,publisher=excluded.publisher,year=excluded.year,volume=excluded.volume,origin=excluded.origin,languages=excluded.languages');
 const remember=db.prepare('INSERT INTO catalog(isbn,title,author,publisher,year,volume,origin,languages) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(isbn) DO NOTHING');
 return {
  count(){return db.prepare('SELECT COUNT(*) AS n FROM catalog').get().n;},
  add(input){
   const book=validateCatalogBook(input);
   const result=remember.run(book.isbn,book.title,book.author,book.publisher,book.year,book.volume,book.origin,book.languages);
   if(!result.changes)throw Error('ISBN già presente nel catalogo');
   return book;
  },
  search(q,code){
   let rows;
   if(code)rows=db.prepare('SELECT * FROM catalog WHERE isbn=?').all(code);
   else {
    const words=q.toLowerCase().trim().split(/\s+/).slice(0,12);
    const expression="lower(title||' '||coalesce(author,'')||' '||coalesce(publisher,'')||' '||coalesce(year,'')||' '||coalesce(volume,''))";
    rows=db.prepare('SELECT * FROM catalog WHERE '+words.map(()=>expression+" LIKE ? ESCAPE '\\'").join(' AND ')+' ORDER BY title COLLATE NOCASE LIMIT 40').all(...words.map(w=>'%'+w.replace(/[\\%_]/g,c=>'\\'+c)+'%'));
   }
   return rows.map(b=>({...b,source:'Catalogo libreria'}));
  },
  remember(books){for(const b of books)remember.run(b.isbn,b.title,b.author||'',b.publisher||'',b.year||'',b.volume||'',b.source||'Ordine',b.languages||'');},
  import(books){
   db.exec('BEGIN IMMEDIATE');
   try{for(const b of books)insert.run(b.isbn,b.title,b.author,b.publisher,b.year,b.volume,'CSV','ita');db.exec('COMMIT');return books.length;}
   catch(e){db.exec('ROLLBACK');throw e;}
  }
 };
}
