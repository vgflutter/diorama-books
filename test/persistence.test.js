import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../store.js';
import {localCatalog,parseCatalogCSV,searchCatalog,providerStatus} from '../catalog.js';

test('Ordini, catalogo CSV, metadati di edizione e ricevimenti persistono; reimport non riscrive gli ordini',()=>{
 const dir=mkdtempSync(join(tmpdir(),'diorama-persist-'));const path=join(dir,'db.sqlite');let catalog;
 let store=createStore(path,{onOrderItems:items=>catalog.remember(items)});catalog=localCatalog(store.db);
 try{
  catalog.import(parseCatalogCSV('isbn;titolo;volume;editore;anno\n9788808077356;Matematica;3;Editore di prova;2008'));
  const selected=catalog.search('matematica 3')[0];assert.ok(selected);assert.equal(selected.volume,'3');
  const id=store.create({first_name:'Prova',last_name:'Lettore',items:[{...selected,quantity:2}]});
  assert.equal(store.orders()[0].status,'pendente');store.scan(selected.isbn);assert.equal(store.orders()[0].status,'pendente');
  store.create({first_name:'Altro',last_name:'Cliente',items:[{title:'Il barone rampante',isbn:'9788806031329',quantity:1,source:'Open Library',year:'1971'}]});
  assert.equal(catalog.count(),2);
  catalog.import(parseCatalogCSV('isbn;titolo;volume;editore;anno\n9788808077356;Titolo aggiornato;3;Editore nuovo;2009'));
  assert.equal(store.orders().find(o=>o.id===id).items[0].title,'Matematica');
  store.db.close();store=createStore(path,{onOrderItems:items=>catalog.remember(items)});catalog=localCatalog(store.db);
  assert.equal(catalog.count(),2);assert.equal(catalog.search('',selected.isbn)[0].title,'Titolo aggiornato');
  let order=store.orders().find(o=>o.id===id);assert.equal(order.status,'pendente');assert.equal(order.items[0].volume,'3');assert.equal(order.items[0].publisher,'Editore di prova');assert.equal(order.items[0].year,'2008');
  store.scan(selected.isbn);assert.equal(store.orders().find(o=>o.id===id).status,'evaso');
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM receipts').get().n,2);
 }finally{store.db.close();rmSync(dir,{recursive:true});}
});
test('Scrittura ordine e inserimento libro sono una singola transazione',()=>{
 let catalog;const store=createStore(':memory:',{onOrderItems:items=>{catalog.remember(items);throw Error('Errore simulato');}});catalog=localCatalog(store.db);
 try{assert.throws(()=>store.create({first_name:'A',last_name:'B',items:[{title:'Libro',isbn:'9788806031329',quantity:1}]}));assert.equal(store.orders().length,0);assert.equal(catalog.count(),0);}finally{store.db.close();}
});
test('Migrazione mantiene il catalogo già presente',()=>{
 const store=createStore(':memory:');try{store.db.exec("CREATE TABLE catalog(isbn TEXT PRIMARY KEY,title TEXT NOT NULL,author TEXT,publisher TEXT,year TEXT,volume TEXT);INSERT INTO catalog VALUES('9788806031329','Esistente','','','1971','')");const catalog=localCatalog(store.db);assert.equal(catalog.count(),1);assert.equal(catalog.search('Esistente')[0].origin,'CSV');}finally{store.db.close();}
});
test('Un limite di quota Google viene segnalato anche se Open Library trova il libro',async()=>{
 const fetcher=async url=>url.includes('googleapis')?{ok:false,status:429}:{ok:true,status:200,json:async()=>({title:'Il barone rampante',publishers:['Einaudi'],publish_date:'1971',languages:[{key:'/languages/ita'}]})};
 const result=await searchCatalog('9788806031329',{search:()=>[]},fetcher,{googleKey:'test-fixture'});
 assert.equal(result.books.length,1);assert.equal(result.books[0].source,'Open Library');assert.match(result.warnings[0],/quota esaurita/);assert.equal(providerStatus().find(p=>p.name==='Google Books').state,'quota_exceeded');
});

test('Nessuna richiesta Google senza chiave: fallback a Open Library e avviso esplicito',async()=>{
 const urls=[];const result=await searchCatalog('9788806031329',{search:()=>[]},async url=>{urls.push(url);return {ok:true,json:async()=>({title:'Il barone rampante'})};},{googleKey:''});
 assert.equal(urls.length,1);assert.ok(urls.every(u=>u.startsWith('https://openlibrary.org/')));assert.match(result.warnings[0],/chiave API non configurata/);assert.equal(result.books[0].isbn,'9788806031329');
});
