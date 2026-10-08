import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../store.js';
import {localCatalog,parseCatalogCSV,searchCatalog} from '../catalog.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const sample='isbn;titolo;autore;editore;anno;volume\n9788806031329;"Il barone rampante";Italo Calvino;Einaudi;1971;1';
test('CSV con BOM, separatore italiano e campi tra virgolette; ISBN validati',()=>{const rows=parseCatalogCSV('\uFEFF'+sample);assert.equal(rows[0].isbn,'9788806031329');assert.equal(rows[0].volume,'1');assert.equal(parseCatalogCSV('isbn,title\n0140328726,"Fantastic, Mr. Fox"')[0].title,'Fantastic, Mr. Fox');assert.throws(()=>parseCatalogCSV('titolo\nLibro'));assert.throws(()=>parseCatalogCSV('isbn;titolo\n123;Libro'));assert.throws(()=>parseCatalogCSV('isbn;titolo\n9788806031329;"non chiuso'));});
test('Catalogo locale: upsert, ricerca volume, priorità, importazione atomica',async()=>{const store=createStore(':memory:');try{const local=localCatalog(store.db);local.import(parseCatalogCSV(sample));local.import(parseCatalogCSV(sample));assert.equal(local.count(),1);assert.equal(local.search('barone')[0].source,'Catalogo libreria');assert.equal(local.search('barone 1')[0].volume,'1');assert.equal(local.search('%').length,0);const {books}=await searchCatalog('9788806031329',local,async()=>{throw Error('offline');});assert.equal(books.length,1);assert.equal(books[0].isbn,'9788806031329');const original=local.count();assert.throws(()=>local.import([{isbn:'test',title:null,author:'',publisher:'',year:'',volume:''}]));assert.equal(local.count(),original);}finally{store.db.close();}});
test('Google Books: filtra lingua, normalizza ISBN, non associa un altro ISBN',async()=>{const local={search:()=>[]};const fetcher=async url=>url.startsWith('https://www.googleapis.com')?{ok:true,json:async()=>({items:[{volumeInfo:{title:'Il barone rampante',language:'it',industryIdentifiers:[{type:'ISBN_10',identifier:'8806031325'},{type:'ISBN_13',identifier:'9788806031329'}]}},{volumeInfo:{title:'Fantastic Mr. Fox',language:'en',industryIdentifiers:[{type:'ISBN_13',identifier:'9780140328721'}]}}]})}:{ok:false,status:404};let {books}=await searchCatalog('barone',local,fetcher,{googleKey:'test-fixture'});assert.equal(books.length,1);assert.equal(books[0].source,'Google Books');({books}=await searchCatalog('9788806031329',local,fetcher,{googleKey:'test-fixture'}));assert.equal(books.length,1);assert.equal(books[0].isbn,'9788806031329');});
test('Errore chiaro se tutti i cataloghi sono indisponibili e non ci sono dati locali',async()=>{await assert.rejects(searchCatalog('matematica',{search:()=>[]},async()=>{throw Error('offline');}),/Cataloghi esterni non disponibili/);});
test('Catalogo manuale persistente, ISBN normalizzati, duplicati protetti e nessun ordine creato',()=>{
 const directory=mkdtempSync(join(tmpdir(),'diorama-catalog-')),path=join(directory,'db.sqlite');let store=createStore(path),catalog=localCatalog(store.db);
 try{
  const book=catalog.add({title:'Matematica 3',isbn:'8808077357',publisher:'Zanichelli',volume:'3'});
  assert.equal(book.isbn,'9788808077356');assert.equal(book.origin,'Manuale');assert.equal(store.orders().length,0);
  assert.throws(()=>catalog.add({...book,title:'Sovrascrittura'}),/già presente/);
  assert.throws(()=>catalog.add({title:'',isbn:book.isbn}),/Titolo/);assert.throws(()=>catalog.add({title:'Libro',isbn:'invalid'}),/ISBN/);
  const order=store.create({first_name:'Anna',last_name:'Prova',items:[{...book,quantity:1}]});
  catalog.import([{...book,title:'Titolo del fornitore'}]);assert.equal(store.orders().find(o=>o.id===order).items[0].title,'Matematica 3');
  catalog.add({title:'Matematica 5',isbn:'9788808039330',volume:'5'});
  store.db.close();store=createStore(path);catalog=localCatalog(store.db);
  assert.equal(catalog.count(),2);assert.equal(catalog.search('matematica 5')[0].origin,'Manuale');assert.equal(store.orders().length,1);
 }finally{store.db.close();rmSync(directory,{recursive:true});}
});
