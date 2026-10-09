import { DatabaseSync } from 'node:sqlite';
import {moneyCents,storedCents,moneyFields,priceSummary,customerKey,customerSummaries} from './order-data.js';
export function isbn(value) {
 const s=String(value??'').replace(/[\s-]/g,'').toUpperCase();
 if (/^\d{9}[\dX]$/.test(s)) {
  if ([...s].reduce((a,c,i)=>a+(c==='X'?10:Number(c))*(10-i),0)%11) throw Error('ISBN non valido');
  const base='978'+s.slice(0,9); return base+((10-[...base].reduce((a,c,i)=>a+Number(c)*(i%2?3:1),0)%10)%10);
 }
 if(!/^97[89]\d{10}$/.test(s)||[...s].reduce((a,c,i)=>a+Number(c)*(i%2?3:1),0)%10) throw Error('ISBN non valido');
 return s;
}
export function validateOrder(input){
 input=input??{};
 const first=String(input.first_name??'').trim(),last=String(input.last_name??'').trim();
 const customer_id=input.customer_id===undefined||input.customer_id===null||input.customer_id===''?null:Number(input.customer_id);
 if(customer_id!==null&&(!Number.isSafeInteger(customer_id)||customer_id<1))throw Error('Cliente non valido');
 if(customer_id===null&&(!first||!last||first.length>100||last.length>100))throw Error('Inserisci nome e cognome');
 if(!Array.isArray(input.items)||!input.items.length||input.items.length>100)throw Error('Aggiungi almeno un libro');
 const items=input.items.map(i=>{
  const title=String(i.title??'').trim(),quantity=Number(i.quantity);
  if(!title||title.length>500||!Number.isInteger(quantity)||quantity<1||quantity>999)throw Error('Titolo o quantità non validi');
  const unit_price_cents=i.unit_price!==undefined?moneyCents(i.unit_price,'Prezzo unitario'):storedCents(i.unit_price_cents,'Prezzo unitario');
  return {title,quantity,unit_price_cents,isbn:isbn(i.isbn),author:String(i.author??'').slice(0,300),publisher:String(i.publisher??'').slice(0,300),year:String(i.year??'').slice(0,100),volume:String(i.volume??'').slice(0,100),languages:String(i.languages??'').slice(0,100),source:String(i.source??'Ordine').slice(0,100)};
 });
 return {first,last,customer_id,items,...moneyFields(input,items)};
}
export function createStore(path,{onOrderItems}={}) {
 const db=new DatabaseSync(path);
 // Copia consistente prima della migrazione dei database già utilizzati.
 const existing=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'").get();
 if(existing&&path!==':memory:'&&!db.prepare('PRAGMA table_info(orders)').all().some(c=>c.name==='customer_id')){
  const destination=String(path)+'.backup-'+new Date().toISOString().replace(/[:.]/g,'-');
  db.exec("VACUUM INTO '"+destination.replaceAll("'","''")+"'");
 }

 db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY,first_name TEXT NOT NULL,last_name TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,first_name TEXT NOT NULL,last_name TEXT NOT NULL,created_at TEXT NOT NULL,archived_at TEXT);
 CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY,order_id INTEGER REFERENCES orders(id),title TEXT NOT NULL,author TEXT NOT NULL,isbn TEXT NOT NULL,quantity INTEGER NOT NULL,received INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS isbn_pending ON items(isbn,received);
 CREATE TABLE IF NOT EXISTS receipts(id INTEGER PRIMARY KEY,item_id INTEGER REFERENCES items(id),created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS anomalies(id INTEGER PRIMARY KEY,isbn TEXT NOT NULL,created_at TEXT NOT NULL);`);
 const orderColumns=new Set(db.prepare('PRAGMA table_info(orders)').all().map(c=>c.name));
 if(!orderColumns.has('archived_at'))db.exec('ALTER TABLE orders ADD COLUMN archived_at TEXT');
 if(!orderColumns.has('customer_id'))db.exec('ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id)');
 if(!orderColumns.has('deposit_cents'))db.exec('ALTER TABLE orders ADD COLUMN deposit_cents INTEGER');
 const itemColumns=new Set(db.prepare('PRAGMA table_info(items)').all().map(c=>c.name));
 if(!itemColumns.has('unit_price_cents'))db.exec('ALTER TABLE items ADD COLUMN unit_price_cents INTEGER');
 for(const column of ['publisher','year','volume'])if(!itemColumns.has(column))db.exec(`ALTER TABLE items ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
 db.exec('BEGIN IMMEDIATE');
 try{
  const known=new Map(db.prepare('SELECT * FROM customers ORDER BY id').all().map(c=>[customerKey(c.first_name,c.last_name),c.id]));
  for(const o of db.prepare('SELECT * FROM orders WHERE customer_id IS NULL ORDER BY id').all()){
   const key=customerKey(o.first_name,o.last_name);let id=known.get(key);
   if(!id){id=Number(db.prepare('INSERT INTO customers(first_name,last_name) VALUES(?,?)').run(o.first_name,o.last_name).lastInsertRowid);known.set(key,id);}
   db.prepare('UPDATE orders SET customer_id=? WHERE id=?').run(id,o.id);
  }
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');db.close();throw e;}
 return {db,
  orders(){
   return db.prepare('SELECT * FROM orders ORDER BY created_at DESC,id DESC').all().map(o=>{
    const items=db.prepare('SELECT * FROM items WHERE order_id=? ORDER BY id').all(o.id);
    const total=items.reduce((n,i)=>n+i.quantity,0),received=items.reduce((n,i)=>n+i.received,0);
    return {...o,items,total,received,...priceSummary({...o,items}),status:o.archived_at?'archiviato':received===total?'evaso':'pendente'};
   });
  },
  customers(first='',last=''){return customerSummaries(db.prepare('SELECT * FROM customers').all(),this.orders(),first,last);},
  customerOrders(value){const id=Number(value);if(!db.prepare('SELECT id FROM customers WHERE id=?').get(id))throw Error('Cliente non trovato');return this.orders().filter(o=>o.customer_id===id);},
  anomalies(){return db.prepare('SELECT * FROM anomalies ORDER BY created_at DESC,id DESC').all();},
  archive(value){
   const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw Error('Ordine non valido');
   db.exec('BEGIN IMMEDIATE');
   try{
    const order=db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    if(!order)throw Error('Ordine non trovato');
    if(db.prepare('SELECT COUNT(*) AS n FROM items WHERE order_id=? AND received<quantity').get(id).n)throw Error('Ordine ancora pendente: ricevi tutte le copie prima di archiviarlo');
    const archived_at=order.archived_at||new Date().toISOString();
    db.prepare('UPDATE orders SET archived_at=? WHERE id=?').run(archived_at,id);
    db.exec('COMMIT');return {id,status:'archiviato',archived_at};
   }catch(e){db.exec('ROLLBACK');throw e;}
  },
  create(input){
   const {first,last,customer_id,deposit_cents,items}=validateOrder(input);db.exec('BEGIN IMMEDIATE');
   try{
    let customer=customer_id?db.prepare('SELECT * FROM customers WHERE id=?').get(customer_id):null;
    if(customer_id&&!customer)throw Error('Cliente non trovato');
    if(!customer){const cid=Number(db.prepare('INSERT INTO customers(first_name,last_name) VALUES(?,?)').run(first,last).lastInsertRowid);customer={id:cid,first_name:first,last_name:last};}
    const id=Number(db.prepare('INSERT INTO orders(first_name,last_name,created_at,customer_id,deposit_cents) VALUES(?,?,?,?,?)').run(customer.first_name,customer.last_name,new Date().toISOString(),customer.id,deposit_cents).lastInsertRowid);
    const insert=db.prepare('INSERT INTO items(order_id,title,author,isbn,quantity,publisher,year,volume,unit_price_cents) VALUES(?,?,?,?,?,?,?,?,?)');
    for(const i of items)insert.run(id,i.title,i.author,i.isbn,i.quantity,i.publisher,i.year,i.volume,i.unit_price_cents);
    onOrderItems?.(items);db.exec('COMMIT');return id;
   }catch(e){db.exec('ROLLBACK');throw e;}
  },
  scan(code){
   const normalized=isbn(code);db.exec('BEGIN IMMEDIATE');
   try{
    const item=db.prepare(`SELECT i.*,o.first_name,o.last_name,o.created_at FROM items i JOIN orders o ON o.id=i.order_id WHERE i.isbn=? AND i.received<i.quantity AND o.archived_at IS NULL ORDER BY o.created_at,o.id,i.id LIMIT 1`).get(normalized);
    if(!item){db.prepare('INSERT INTO anomalies(isbn,created_at) VALUES(?,?)').run(normalized,new Date().toISOString());db.exec('COMMIT');return null;}
    db.prepare('UPDATE items SET received=received+1 WHERE id=?').run(item.id);
    db.prepare('INSERT INTO receipts(item_id,created_at) VALUES(?,?)').run(item.id,new Date().toISOString());
    db.exec('COMMIT');return {...item,received:item.received+1};
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
 };
}
