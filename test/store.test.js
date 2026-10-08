import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore,isbn} from '../store.js';
const book={title:'Il libro',author:'Autore',isbn:'9780140328721',quantity:2};
test('ISBN-10 e ISBN-13 identificano la stessa edizione; codici errati rifiutati',()=>{assert.equal(isbn('0-14-032872-6'),book.isbn);assert.equal(isbn(book.isbn),book.isbn);assert.throws(()=>isbn('9780140328722'));assert.throws(()=>isbn('123'));});
test('Assegnazione cronologica, quantità multiple, copie incomplete pendenti, persistenza',()=>{const dir=mkdtempSync(join(tmpdir(),'diorama-'));const path=join(dir,'db.sqlite');let store=createStore(path);try{const first=store.create({first_name:'Anna',last_name:'Primo',items:[book,{...book,title:'Secondo titolo',isbn:'9788804668237',quantity:1}]});const second=store.create({first_name:'Luca',last_name:'Secondo',items:[{...book,quantity:1}]});assert.equal(store.scan('0140328726').order_id,first);assert.equal(store.orders().find(o=>o.id===first).status,'pendente');assert.equal(store.scan(book.isbn).order_id,first);assert.equal(store.scan(book.isbn).order_id,second);assert.equal(store.scan(book.isbn),null);assert.equal(store.orders().find(o=>o.id===second).status,'evaso');assert.equal(store.scan('9788804668237').order_id,first);assert.equal(store.orders().find(o=>o.id===first).status,'evaso');store.db.close();store=createStore(path);assert.equal(store.orders().length,2);assert.equal(store.orders().every(o=>o.status==='evaso'),true);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM receipts').get().n,4);}finally{store.db.close();rmSync(dir,{recursive:true});}});
test('Validazione completa prima di salvare: nessun ordine incompleto',()=>{const s=createStore(':memory:');try{assert.throws(()=>s.create({first_name:'A',last_name:'B',items:[book,{...book,quantity:0}]}));assert.equal(s.orders().length,0);assert.throws(()=>s.create({first_name:'A',last_name:'B',items:[]}));assert.throws(()=>s.scan('invalid'));}finally{s.db.close();}});
test('Tre stati, archiviazione solo dopo il match completo e registro persistente delle anomalie',()=>{
 const dir=mkdtempSync(join(tmpdir(),'diorama-states-')),path=join(dir,'db.sqlite');let store=createStore(path);
 try{
  const first=store.create({first_name:'Anna',last_name:'Prima',items:[book]});
  const second=store.create({first_name:'Luca',last_name:'Secondo',items:[{...book,quantity:1}]});
  assert.throws(()=>store.archive(first),/pendente/);
  assert.equal(store.scan(book.isbn).order_id,first);
  assert.equal(store.orders().find(o=>o.id===first).status,'pendente');
  assert.equal(store.scan(book.isbn).order_id,first);
  assert.equal(store.orders().find(o=>o.id===first).status,'evaso');
  const saved=store.archive(first);assert.equal(saved.status,'archiviato');
  assert.equal(store.archive(first).archived_at,saved.archived_at);
  assert.equal(store.scan(book.isbn).order_id,second);
  assert.equal(store.scan('0140328726'),null);
  assert.equal(store.scan('9788806031329'),null);
  assert.throws(()=>store.scan('bad'));assert.equal(store.anomalies().length,2);
  assert.throws(()=>store.archive(999),/non trovato/);
  store.db.close();store=createStore(path);
  assert.equal(store.orders().find(o=>o.id===first).archived_at,saved.archived_at);
  assert.equal(store.orders().find(o=>o.id===first).status,'archiviato');
  assert.equal(store.anomalies().length,2);assert.equal(store.anomalies()[1].isbn,book.isbn);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM receipts').get().n,3);
 }finally{store.db.close();rmSync(dir,{recursive:true});}
});
