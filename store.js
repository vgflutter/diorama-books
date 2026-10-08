import { DatabaseSync } from 'node:sqlite';
export function isbn(value) {
 const s=String(value??'').replace(/[\s-]/g,'').toUpperCase();
 if (/^\d{9}[\dX]$/.test(s)) {
  if ([...s].reduce((a,c,i)=>a+(c==='X'?10:Number(c))*(10-i),0)%11) throw Error('ISBN non valido');
  const base='978'+s.slice(0,9); return base+((10-[...base].reduce((a,c,i)=>a+Number(c)*(i%2?3:1),0)%10)%10);
 }
 if(!/^97[89]\d{10}$/.test(s)||[...s].reduce((a,c,i)=>a+Number(c)*(i%2?3:1),0)%10) throw Error('ISBN non valido');
 return s;
}
export function validateOrder(input){const first=String(input.first_name??'').trim(),last=String(input.last_name??'').trim();if(!first||!last||first.length>100||last.length>100)throw Error('Inserisci nome e cognome');if(!Array.isArray(input.items)||!input.items.length||input.items.length>100)throw Error('Aggiungi almeno un libro');const items=input.items.map(i=>{const title=String(i.title??'').trim(),quantity=Number(i.quantity);if(!title||title.length>500||!Number.isInteger(quantity)||quantity<1||quantity>999)throw Error('Titolo o quantità non validi');return {title,quantity,isbn:isbn(i.isbn),author:String(i.author??'').slice(0,300),publisher:String(i.publisher??'').slice(0,300),year:String(i.year??'').slice(0,100),volume:String(i.volume??'').slice(0,100),languages:String(i.languages??'').slice(0,100),source:String(i.source??'Ordine').slice(0,100)};});return {first,last,items};}
export function createStore(path,{onOrderItems}={}) {
 const db=new DatabaseSync(path); db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, first_name TEXT NOT NULL,last_name TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY,order_id INTEGER REFERENCES orders(id),title TEXT NOT NULL,author TEXT NOT NULL,isbn TEXT NOT NULL,quantity INTEGER NOT NULL,received INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS isbn_pending ON items(isbn,received);
 CREATE TABLE IF NOT EXISTS receipts(id INTEGER PRIMARY KEY,item_id INTEGER REFERENCES items(id),created_at TEXT NOT NULL);`);
 const itemColumns=new Set(db.prepare('PRAGMA table_info(items)').all().map(c=>c.name));
 for(const column of ['publisher','year','volume'])if(!itemColumns.has(column))db.exec(`ALTER TABLE items ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
 return {db,
 orders(){return db.prepare('SELECT * FROM orders ORDER BY created_at DESC,id DESC').all().map(o=>{const items=db.prepare('SELECT * FROM items WHERE order_id=? ORDER BY id').all(o.id);const total=items.reduce((a,i)=>a+i.quantity,0),received=items.reduce((a,i)=>a+i.received,0);return {...o,items,total,received,status:received===total?'evaso':received?'parziale':'pendente'};});},
 create(input){const {first,last,items}=validateOrder(input);db.exec('BEGIN IMMEDIATE');try{const id=Number(db.prepare('INSERT INTO orders(first_name,last_name,created_at) VALUES(?,?,?)').run(first,last,new Date().toISOString()).lastInsertRowid);const insert=db.prepare('INSERT INTO items(order_id,title,author,isbn,quantity,publisher,year,volume) VALUES(?,?,?,?,?,?,?,?)');for(const i of items)insert.run(id,i.title,i.author,i.isbn,i.quantity,i.publisher,i.year,i.volume);onOrderItems?.(items);db.exec('COMMIT');return id;}catch(e){db.exec('ROLLBACK');throw e;}},
 scan(code){const normalized=isbn(code);db.exec('BEGIN IMMEDIATE');try{const item=db.prepare(`SELECT i.*,o.first_name,o.last_name,o.created_at FROM items i JOIN orders o ON o.id=i.order_id WHERE i.isbn=? AND i.received<i.quantity ORDER BY o.created_at,o.id,i.id LIMIT 1`).get(normalized);if(!item){db.exec('COMMIT');return null;}db.prepare('UPDATE items SET received=received+1 WHERE id=?').run(item.id);db.prepare('INSERT INTO receipts(item_id,created_at) VALUES(?,?)').run(item.id,new Date().toISOString());db.exec('COMMIT');return {...item,received:item.received+1};}catch(e){db.exec('ROLLBACK');throw e;}}
 };
}
