import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {createStore,isbn} from './store.js';
import {searchCatalog,localCatalog,parseCatalogCSV,providerStatus} from './catalog.js';
let catalog,store;
if(process.env.DATABASE_URL){
 const {createPostgresStore,postgresCatalog}=await import('./postgres-store.js');
 store=await createPostgresStore(process.env.DATABASE_URL,{onOrderItems:(items,client)=>catalog.remember(items,client)});
 catalog=postgresCatalog(store.pool);
}else{
 const directory=process.env.DATA_DIR||new URL('./data/',import.meta.url).pathname;
 await mkdir(directory,{recursive:true});store=createStore(directory+'/diorama.sqlite',{onOrderItems:items=>catalog.remember(items)});
 catalog=localCatalog(store.db);
}
const sessions=new Map(),attempts=new Map();const salt=randomBytes(32);const password=scryptSync(process.env.DIORAMA_PASSWORD||'diorama',salt,64);
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>5000000)throw Error('Richiesta troppo grande');}return JSON.parse(raw||'{}');}
const server=http.createServer(async(req,res)=>{try{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
 const url=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true});
 if(!url.pathname.startsWith('/api/')){const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/order-data.js':['../order-data.js','text/javascript'],'/style.css':['style.css','text/css'],'/catalog-template.csv':['catalog-template.csv','text/csv; charset=utf-8']};const file=files[url.pathname];if(!file||req.method!=='GET')return json(res,404,{error:'Pagina non trovata'});res.writeHead(200,{'Content-Type':file[1]});return res.end(await readFile(new URL('./public/'+file[0],import.meta.url)));}
 if(req.method!=='GET'&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Origine non consentita'});
 if(url.pathname==='/api/login'&&req.method==='POST'){const key=req.socket.remoteAddress;const now=Date.now();const a=attempts.get(key);if(a&&a.until>now&&a.count>=10)return json(res,429,{error:'Troppi tentativi. Riprova tra 15 minuti.'});const data=await body(req);const candidate=scryptSync(String(data.password??'').slice(0,256),salt,64);if(data.username!==(process.env.DIORAMA_USER||'diorama')||!timingSafeEqual(candidate,password)){attempts.set(key,{count:a&&a.until>now?a.count+1:1,until:a&&a.until>now?a.until:now+900000});return json(res,401,{error:'Credenziali non corrette'});}attempts.delete(key);const token=randomBytes(32).toString('hex');sessions.set(token,now+43200000);res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);return json(res,200,{ok:true});}
 const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('session='))?.slice(8);if(!token||!(sessions.get(token)>Date.now())){if(token)sessions.delete(token);return json(res,401,{error:'Accedi per continuare'});}
 if(url.pathname==='/api/session')return json(res,200,{ok:true});
 if(url.pathname==='/api/logout'&&req.method==='POST'){sessions.delete(token);res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
 if(url.pathname==='/api/customers'&&req.method==='GET')return json(res,200,await store.customers(url.searchParams.get('first_name')||'',url.searchParams.get('last_name')||''));
 const customerMatch=/^\/api\/customers\/(\d+)\/orders$/.exec(url.pathname);
 if(customerMatch&&req.method==='GET')return json(res,200,await store.customerOrders(customerMatch[1]));
 if(url.pathname==='/api/orders'&&req.method==='GET')return json(res,200,await store.orders());
 if(url.pathname==='/api/orders'&&req.method==='POST')return json(res,201,{id:await store.create(await body(req))});
 const archiveMatch=/^\/api\/orders\/(\d+)\/archive$/.exec(url.pathname);
 if(archiveMatch&&req.method==='POST')return json(res,200,await store.archive(archiveMatch[1]));
 if(url.pathname==='/api/anomalies'&&req.method==='GET')return json(res,200,await store.anomalies());
 if(url.pathname==='/api/scan'&&req.method==='POST'){const result=await store.scan((await body(req)).isbn);return json(res,200,{result});}
 if(url.pathname==='/api/catalog'&&req.method==='GET')return json(res,200,{count:await catalog.count(),providers:providerStatus()});
 if(url.pathname==='/api/catalog/books'&&req.method==='GET'){
  const q=(url.searchParams.get('q')||'').trim();if(q.length>200)return json(res,400,{error:'Richiesta di ricerca troppo lunga'});
  let code;try{code=isbn(q);}catch{}
  return json(res,200,{books:await catalog.search(q,code),count:await catalog.count()});
 }
 if(url.pathname==='/api/catalog/books'&&req.method==='POST')return json(res,201,{book:await catalog.add(await body(req)),count:await catalog.count()});
 if(url.pathname==='/api/catalog/import'&&req.method==='POST'){const data=await body(req);try{return json(res,200,{imported:await catalog.import(parseCatalogCSV(data.csv)),count:await catalog.count()});}catch(e){return json(res,400,{error:e.message});}}
 if(url.pathname==='/api/books'&&req.method==='GET'){const q=(url.searchParams.get('q')||'').trim();if(q.length<3||q.length>200)return json(res,400,{error:'Inserisci almeno 3 caratteri'});if(url.searchParams.get('scope')==='catalog'){let code;try{code=isbn(q);}catch{}const books=await catalog.search(q,code);return json(res,200,{books,warnings:books.length?[]:['Nessun libro nel catalogo scolastico: aggiungi titolo e ISBN in Catalogo oppure importa il CSV.']});}try{return json(res,200,await searchCatalog(q,catalog));}catch(e){return json(res,502,{error:e.message,warnings:e.warnings||[]});}}
 return json(res,404,{error:'Operazione non trovata'});
 }catch(e){if(e instanceof SyntaxError)return json(res,400,{error:'Richiesta non valida'});if(/ISBN|Inserisci|Aggiungi|Titolo|Richiesta|Ordine|Cliente|Prezzo|Importo|Acconto/.test(e.message))return json(res,400,{error:e.message});console.error(e);return json(res,500,{error:'Errore interno. Riprova.'});}});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('dioramaBooks in ascolto sulla porta '+(process.env.PORT||3000)));
setInterval(()=>{const now=Date.now();for(const [k,v]of sessions)if(v<now)sessions.delete(k);for(const[k,v]of attempts)if(v.until<now)attempts.delete(k);},60000).unref();

let stopping=false;async function stop(){if(stopping)return;stopping=true;server.close(async()=>{try{if(store.close)await store.close();else store.db.close();}finally{process.exit(0);}});setTimeout(()=>process.exit(1),10000).unref();}process.on('SIGTERM',stop);process.on('SIGINT',stop);
