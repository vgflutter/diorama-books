import pg from 'pg';
import {isbn,validateOrder} from './store.js';
const iso=value=>value instanceof Date?value.toISOString():value;
const row=item=>({...item,id:Number(item.id),...(item.order_id?{order_id:Number(item.order_id)}:{}),...(item.created_at?{created_at:iso(item.created_at)}:{}),...(item.archived_at?{archived_at:iso(item.archived_at)}:{})});
export async function createPostgresStore(connectionString,{onOrderItems}={}){
 const pool=new pg.Pool({connectionString,connectionTimeoutMillis:10000});
 pool.on('error',e=>console.error('Errore connessione PostgreSQL:',e.code||e.name));
 try{await pool.query(`
 CREATE TABLE IF NOT EXISTS orders(id BIGSERIAL PRIMARY KEY,first_name TEXT NOT NULL,last_name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
 CREATE TABLE IF NOT EXISTS items(id BIGSERIAL PRIMARY KEY,order_id BIGINT NOT NULL REFERENCES orders(id),title TEXT NOT NULL,author TEXT NOT NULL,isbn TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),received INTEGER NOT NULL DEFAULT 0 CHECK(received>=0 AND received<=quantity),publisher TEXT NOT NULL DEFAULT '',year TEXT NOT NULL DEFAULT '',volume TEXT NOT NULL DEFAULT '');
 ALTER TABLE items ADD COLUMN IF NOT EXISTS publisher TEXT NOT NULL DEFAULT '';
 ALTER TABLE items ADD COLUMN IF NOT EXISTS year TEXT NOT NULL DEFAULT '';
 ALTER TABLE items ADD COLUMN IF NOT EXISTS volume TEXT NOT NULL DEFAULT '';
 ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
 CREATE TABLE IF NOT EXISTS anomalies(id BIGSERIAL PRIMARY KEY,isbn TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
 CREATE INDEX IF NOT EXISTS isbn_pending ON items(isbn,received);
 CREATE TABLE IF NOT EXISTS receipts(id BIGSERIAL PRIMARY KEY,item_id BIGINT NOT NULL REFERENCES items(id),created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
 CREATE TABLE IF NOT EXISTS catalog(isbn TEXT PRIMARY KEY,title TEXT NOT NULL,author TEXT,publisher TEXT,year TEXT,volume TEXT,origin TEXT NOT NULL DEFAULT 'CSV',languages TEXT NOT NULL DEFAULT 'ita');
 ALTER TABLE catalog ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'CSV';
 ALTER TABLE catalog ADD COLUMN IF NOT EXISTS languages TEXT NOT NULL DEFAULT 'ita';
 `);}catch(e){await pool.end();throw e;}
 return {pool,close:()=>pool.end(),
  async orders(){const orders=(await pool.query('SELECT * FROM orders ORDER BY created_at DESC,id DESC')).rows;const items=(await pool.query('SELECT * FROM items ORDER BY id')).rows.map(row);return orders.map(o=>{const list=items.filter(i=>i.order_id===Number(o.id));const total=list.reduce((n,i)=>n+i.quantity,0),received=list.reduce((n,i)=>n+i.received,0);return {...row(o),items:list,total,received,status:o.archived_at?'archiviato':received===total?'evaso':'pendente'};});},
  async anomalies(){return (await pool.query('SELECT * FROM anomalies ORDER BY created_at DESC,id DESC')).rows.map(row);},
  async archive(value){
   const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw Error('Ordine non valido');
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    const order=(await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!order)throw Error('Ordine non trovato');
    const pending=await client.query('SELECT 1 FROM items WHERE order_id=$1 AND received<quantity LIMIT 1',[id]);
    if(pending.rows.length)throw Error('Ordine ancora pendente: ricevi tutte le copie prima di archiviarlo');
    const saved=(await client.query('UPDATE orders SET archived_at=COALESCE(archived_at,clock_timestamp()) WHERE id=$1 RETURNING archived_at',[id])).rows[0];
    await client.query('COMMIT');return {id,status:'archiviato',archived_at:iso(saved.archived_at)};
   }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  },
  async create(input){const {first,last,items}=validateOrder(input);const client=await pool.connect();try{await client.query('BEGIN');const id=Number((await client.query('INSERT INTO orders(first_name,last_name) VALUES($1,$2) RETURNING id',[first,last])).rows[0].id);for(const i of items)await client.query('INSERT INTO items(order_id,title,author,isbn,quantity,publisher,year,volume) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,i.title,i.author,i.isbn,i.quantity,i.publisher,i.year,i.volume]);await onOrderItems?.(items,client);await client.query('COMMIT');return id;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}},
  async scan(value){const normalized=isbn(value);const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['diorama:'+normalized]);const found=await client.query('SELECT i.*,o.first_name,o.last_name,o.created_at FROM items i JOIN orders o ON o.id=i.order_id WHERE i.isbn=$1 AND i.received<i.quantity AND o.archived_at IS NULL ORDER BY o.created_at,o.id,i.id LIMIT 1 FOR UPDATE OF i',[normalized]);const item=found.rows[0];if(!item){await client.query('INSERT INTO anomalies(isbn) VALUES($1)',[normalized]);await client.query('COMMIT');return null;}await client.query('UPDATE items SET received=received+1 WHERE id=$1',[item.id]);await client.query('INSERT INTO receipts(item_id) VALUES($1)',[item.id]);await client.query('COMMIT');return {...row(item),received:item.received+1};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
 };
}
export function postgresCatalog(pool){
 const put=async(book,connection,overwrite)=>{const values=[book.isbn,book.title,book.author||'',book.publisher||'',book.year||'',book.volume||'',book.origin||book.source||'Ordine',book.languages||''];await connection.query('INSERT INTO catalog(isbn,title,author,publisher,year,volume,origin,languages) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(isbn) '+(overwrite?'DO UPDATE SET title=excluded.title,author=excluded.author,publisher=excluded.publisher,year=excluded.year,volume=excluded.volume,origin=excluded.origin,languages=excluded.languages':'DO NOTHING'),values);};
 return {
  async count(){return Number((await pool.query('SELECT COUNT(*) AS n FROM catalog')).rows[0].n);},
  async search(q,code){let result;if(code)result=await pool.query('SELECT * FROM catalog WHERE isbn=$1',[code]);else{const words=q.toLowerCase().trim().split(/\s+/).slice(0,12);const expression="lower(title||' '||coalesce(author,'')||' '||coalesce(publisher,'')||' '||coalesce(year,'')||' '||coalesce(volume,''))";result=await pool.query('SELECT * FROM catalog WHERE '+words.map((_,i)=>expression+' LIKE $'+(i+1)+" ESCAPE '\\'").join(' AND ')+' ORDER BY title LIMIT 40',words.map(w=>'%'+w.replace(/[\\%_]/g,c=>'\\'+c)+'%'));}return result.rows.map(b=>({...b,source:'Catalogo libreria'}));},
  async remember(books,connection=pool){for(const b of books)await put(b,connection,false);},
  async import(books){const client=await pool.connect();try{await client.query('BEGIN');for(const b of books)await put({...b,origin:'CSV',languages:'ita'},client,true);await client.query('COMMIT');return books.length;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
 };
}
