import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {moneyCents} from '../order-data.js';
import {createStore,isbn} from '../store.js';
import {emptyArchive,readArchive,archiveCreate,archiveOrders,archiveCustomers,archiveCustomerOrders,archiveScan,archiveOrder} from '../offline/archive.js';
import {backupArchive} from '../offline/backups.js';
const book={title:'Matematica',isbn:'9788808077356',quantity:3,unit_price:'12,10'};
function jsonStore(){let state=emptyArchive();return {
 create(input){const change=archiveCreate(state,input,isbn);state=change.next;return change.id;},
 orders:()=>archiveOrders(state),customers:(first,last)=>archiveCustomers(state,first,last),customerOrders:id=>archiveCustomerOrders(state,id),
 scan(code){const change=archiveScan(state,code,isbn);state=change.next;return change.result;},archive(id){const change=archiveOrder(state,id);state=change.next;return change.result;},
 reopen(){state=readArchive(JSON.stringify(state),isbn);},close(){}
};}
for(const driver of ['SQLite','JSON'])test(driver+': centesimi, acconto, clienti esistenti e omonimi separati; storico completo',()=>{
 const store=driver==='SQLite'?createStore(':memory:'):jsonStore();
 try{
  const id=store.create({first_name:'Anna',last_name:'Rossi',deposit:'10,05',items:[book]});
  let order=store.orders().find(o=>o.id===id);const customer=order.customer_id;
  assert.equal(order.items[0].unit_price_cents,1210);assert.equal(order.total_amount_cents,3630);assert.equal(order.deposit_cents,1005);assert.equal(order.balance_cents,2625);
  const again=store.create({customer_id:customer,first_name:'Ignored',last_name:'Ignored',deposit:0,items:[{...book,quantity:1,unit_price:'0,10'}]});
  assert.equal(store.orders().find(o=>o.id===again).first_name,'Anna');assert.equal(store.orders().find(o=>o.id===again).total_amount_cents,10);
  store.create({first_name:'Anna',last_name:'Rossi',items:[book]});assert.equal(store.customers().length,2);
  assert.equal(store.customers('ANN','ros').length,2);assert.equal(store.customers('Anna','bianchi').length,0);
  for(let n=0;n<3;n++)store.scan(book.isbn);store.archive(id);
  assert.deepEqual(store.customerOrders(customer).map(o=>o.status).sort(),['archiviato','pendente']);
  assert.equal(store.customers().find(c=>c.id===customer).closed_count,1);
  for(const invalid of [{deposit:'1000'},{deposit:'-1'},{items:[{...book,unit_price:'12.345'}]},{customer_id:999}]){
   assert.throws(()=>store.create({first_name:'Bad',last_name:'Entry',items:[book],...invalid}));
   assert.equal(store.orders().length,3);assert.equal(store.customers().length,2);
  }
  if(store.reopen){store.reopen();assert.equal(store.customerOrders(customer).find(o=>o.id===id).balance_cents,2625);}
 }finally{if(store.db)store.db.close();else store.close();}
});
test('Migrazione SQLite: copia precedente, identità e date preservate, importi assenti non inventati',()=>{
 const dir=mkdtempSync(tmpdir()+'/diorama-upgrade-'),path=dir+'/diorama.sqlite';
 try{
  const old=new DatabaseSync(path);old.exec(`CREATE TABLE orders(id INTEGER PRIMARY KEY,first_name TEXT,last_name TEXT,created_at TEXT);CREATE TABLE items(id INTEGER PRIMARY KEY,order_id INTEGER,title TEXT,author TEXT,isbn TEXT,quantity INTEGER,received INTEGER);INSERT INTO orders VALUES(7,'Anna','Rossi','2025-01-01T00:00:00.000Z'),(9,'Anna','Rossi','2025-02-01T00:00:00.000Z');INSERT INTO items VALUES(11,7,'Libro','','9788808077356',2,0),(12,9,'Libro','','9788808077356',1,0);`);old.close();
  let store=createStore(path);const orders=store.orders();assert.equal(orders.length,2);assert.equal(orders[0].created_at,'2025-02-01T00:00:00.000Z');assert.equal(store.customers().length,1);assert.equal(orders[0].total_amount_cents,null);assert.equal(orders[0].deposit_cents,null);assert.equal(orders[0].customer_id,orders[1].customer_id);assert.equal(store.scan(book.isbn).order_id,7);store.db.close();
  store=createStore(path);store.db.close();const backups=readdirSync(dir).filter(p=>p.includes('.backup-'));assert.equal(backups.length,1);const backup=new DatabaseSync(dir+'/'+backups[0]);assert.equal(backup.prepare('SELECT COUNT(*) n FROM orders').get().n,2);assert.ok(!backup.prepare('PRAGMA table_info(orders)').all().some(c=>c.name==='customer_id'));backup.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Vecchio JSON: catalogo, scansioni, date e stati intatti; migrazione ripetibile e validazione importi/identità',()=>{
 let state=archiveCreate(emptyArchive(),{first_name:'Anna',last_name:'Rossi',items:[book]},isbn).next;
 state=archiveScan(state,book.isbn,isbn).next;
 const raw=structuredClone(state);delete raw.customers;delete raw.nextCustomer;
 delete raw.orders[0].customer_id;delete raw.orders[0].deposit_cents;delete raw.orders[0].items[0].unit_price_cents;
 const migrated=readArchive(raw,isbn);assert.equal(migrated.customers.length,1);assert.equal(migrated.receipts.length,1);assert.equal(migrated.orders[0].created_at,raw.orders[0].created_at);assert.equal(migrated.orders[0].items[0].received,1);assert.equal(archiveOrders(migrated)[0].total_amount_cents,null);assert.deepEqual(readArchive(migrated,isbn),migrated);
 for(const mutate of [s=>s.orders[0].items[0].unit_price_cents=1.5,s=>s.orders[0].deposit_cents=-1,s=>s.orders[0].customer_id=999,s=>s.orders[0].deposit_cents=100]){const bad=structuredClone(migrated);mutate(bad);assert.throws(()=>readArchive(bad,isbn));}
});
test('Copie di recupero: conserva il JSON originale prima della migrazione, quota/registro corrotto non eliminano i dati',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
 const original=JSON.stringify(emptyArchive());backupArchive(storage,'archive',original);backupArchive(storage,'archive',original);assert.equal(JSON.parse(data.get('archive.backups')).length,1);assert.equal(JSON.parse(data.get('archive.backups'))[0].raw,original);
 storage.setItem('archive.backups','broken');assert.throws(()=>backupArchive(storage,'archive','new'),/recupero/);assert.equal(storage.getItem('archive.backups'),'broken');
 assert.throws(()=>backupArchive({getItem:()=>null,setItem:()=>{throw Error('quota');}},'archive',original),/quota/);
 assert.equal(moneyCents('0,10')+moneyCents('0.20'),30);
});
