const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let orders=[],anomalies=[],cart=[],filter='pendente',history=[];
async function api(path,method='GET',data){const response=await fetch('/api/'+path,{method,headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});const result=await response.json();if(!response.ok){if(response.status===401&&path!=='login')showLogin();throw Error([result.error||'Operazione non riuscita',...(result.warnings||[])].join(' '));}return result;}
function showLogin(){$('#app').classList.add('hidden');$('#login').classList.remove('hidden');$('#order-dialog').close();}
function toast(text){$('#toast').textContent=text;$('#toast').classList.remove('hidden');setTimeout(()=>$('#toast').classList.add('hidden'),3500);}
const date=s=>new Date(s).toLocaleString('it-IT',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
async function load(){const data=await Promise.all([api('orders'),api('anomalies')]);[orders,anomalies]=data;renderOrders();renderAnomalies();}
async function enter(){$('#login').classList.add('hidden');$('#app').classList.remove('hidden');await load();}
$('#today').textContent=new Date().toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'});
$('#login-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter||e.target.querySelector('button');button.disabled=true;$('#login-error').textContent='';try{await api('login','POST',Object.fromEntries(new FormData(e.target)));e.target.reset();await enter();}catch(err){showLogin();$('#login-error').textContent=err.message;}finally{button.disabled=false;}};
$('#logout').onclick=async()=>{try{await api('logout','POST',{});orders=[];anomalies=[];cart=[];history=[];$('#scan-history').innerHTML='<p>Le prossime scansioni compariranno qui.</p>';$('#scan-result').textContent='';showLogin();}catch(e){toast(e.message);}};
$('#mobile-logout').onclick=()=>$('#logout').click();
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('[data-view]').forEach(n=>n.classList.toggle('active',n===b));
 for(const view of ['orders','receive','anomalies'])$('#'+view+'-view').classList.toggle('hidden',b.dataset.view!==view);
 if(b.dataset.view==='receive')$('#scan-isbn').focus();
});
function renderOrders(){
 $('#pending-count').textContent=orders.filter(o=>o.status==='pendente').length;
 $('#done-count').textContent=orders.filter(o=>o.status==='evaso').length;
 $('#archived-count').textContent=orders.filter(o=>o.status==='archiviato').length;
 const q=$('#order-search').value.toLowerCase().trim();
 const shown=orders.filter(o=>o.status===filter&&`${o.first_name} ${o.last_name} ${o.items.map(i=>i.title+' '+i.isbn).join(' ')}`.toLowerCase().includes(q));
 $('#order-list').innerHTML=shown.length?`<table><thead><tr><th>CLIENTE</th><th>LIBRI RICHIESTI</th><th>INSERITO IL</th><th>STATO</th></tr></thead><tbody>${shown.map(o=>`<tr><td><div class="customer"><div class="avatar">${esc(o.first_name[0]+o.last_name[0])}</div><div><strong>${esc(o.first_name)} ${esc(o.last_name)}</strong><span class="sub">Ordine #${o.id}</span></div></div></td><td>${o.items.map(i=>`<div class="item-line"><strong>${esc(i.title)}</strong>${i.volume||i.publisher||i.year?`<span class="sub">${esc([i.volume?'Volume '+i.volume:'',i.publisher,i.year].filter(Boolean).join(' · '))}</span>`:''}<span class="sub">${esc(i.isbn)} · ${i.received}/${i.quantity} copie ricevute</span></div>`).join('')}</td><td>${esc(date(o.created_at))}</td><td><span class="badge ${o.status}">${{pendente:'Pendente',evaso:'Evaso',archiviato:'Archiviato'}[o.status]}</span><span class="sub">${o.received}/${o.total} copie</span>${o.status==='evaso'?`<button type="button" class="secondary archive-order" data-archive="${o.id}">Archivia</button>`:''}${o.archived_at?`<span class="sub">Archiviato il ${esc(date(o.archived_at))}</span>`:''}</td></tr>`).join('')}</tbody></table>`:`<div class="empty"><div class="empty-icon">⌑</div><h2>${orders.length?{pendente:'Nessun ordine pendente',evaso:'Nessun ordine evaso',archiviato:'Nessun ordine archiviato'}[filter]:'La prossima storia comincia qui'}</h2><p>${orders.length?'Le nuove richieste sono pendenti. La scansione dell’ultima copia le rende evase; Archivia le sposta nello storico.':'Aggiungi la prima richiesta di un lettore. Al resto pensiamo insieme.'}</p>${orders.length?'':'<button class="secondary" id="empty-add">＋ Crea il primo ordine</button>'}</div>`;
 $('#list-footer').textContent=`${shown.length} ${shown.length===1?'ordine':'ordini'} · Ordinati dal più recente`;
 if($('#empty-add'))$('#empty-add').onclick=openOrder;
}
function renderAnomalies(){
 $('#anomaly-count').textContent=anomalies.length;
 $('#anomaly-list').innerHTML=anomalies.length?`<table><thead><tr><th>ISBN SCANSIONATO</th><th>DATA E ORA</th><th>ANOMALIA</th></tr></thead><tbody>${anomalies.map(a=>`<tr><td><strong>${esc(a.isbn)}</strong><span class="sub">Una copia · Scansione #${a.id}</span></td><td>${esc(date(a.created_at))}</td><td><span class="badge">Senza ordine pendente</span></td></tr>`).join('')}</tbody></table>`:'<div class="empty"><h2>Nessuna anomalia</h2><p>Le scansioni senza una richiesta pendente compariranno qui.</p></div>';
 $('#anomaly-footer').textContent=`${anomalies.length} ${anomalies.length===1?'scansione senza ordine':'scansioni senza ordine'} · Registro conservato nell’archivio`;
}
$('#order-list').onclick=async e=>{
 const button=e.target.closest('[data-archive]');if(!button)return;
 button.disabled=true;
 try{await api('orders/'+button.dataset.archive+'/archive','POST',{});toast('Ordine archiviato.');await load().catch(()=>toast('Ordine archiviato. Ricarica per aggiornare la lista.'));}catch(error){toast(error.message);button.disabled=false;}
};
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(n=>n.classList.toggle('selected',n===b));renderOrders();});$('#order-search').oninput=renderOrders;
function openOrder(){cart=[];$('#order-form').reset();$('#order-error').textContent='';$('#book-results').textContent='';renderCart();$('#order-dialog').showModal();$('#first-name').focus();}$('#new-order').onclick=openOrder;$('#close-dialog').onclick=()=>$('#order-dialog').close();
function addBook(book){const existing=cart.find(i=>i.isbn===book.isbn);if(existing)existing.quantity++;else cart.push({...book,quantity:1});renderCart();}
function renderCart(){$('#cart').innerHTML=cart.length?cart.map((i,n)=>`<div class="cart-item"><div><strong>${esc(i.title)}</strong><span class="sub">${esc([i.volume?'Volume '+i.volume:'',i.publisher,i.year,i.author,i.isbn].filter(Boolean).join(' · '))}</span></div><input type="number" min="1" max="999" value="${i.quantity}" data-qty="${n}" aria-label="Quantità ${esc(i.title)}"><button type="button" data-remove="${n}" aria-label="Rimuovi ${esc(i.title)}">×</button></div>`).join(''):'<p class="field-note">Nessun libro aggiunto. Cerca nel catalogo o inserisci un ISBN manualmente.</p>';document.querySelectorAll('[data-qty]').forEach(el=>el.oninput=()=>cart[Number(el.dataset.qty)].quantity=Number(el.value));document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{cart.splice(Number(b.dataset.remove),1);renderCart();});}
function normalize(value){let s=value.replace(/[\s-]/g,'').toUpperCase();if(/^\d{9}[\dX]$/.test(s)){if([...s].reduce((a,c,i)=>a+(c==='X'?10:Number(c))*(10-i),0)%11)throw Error('ISBN non valido');s='978'+s.slice(0,9);s+=(10-[...s].reduce((a,c,i)=>a+Number(c)*(i%2?3:1),0)%10)%10;}if(!/^97[89]\d{10}$/.test(s)||[...s].reduce((a,c,i)=>a+Number(c)*(i%2?3:1),0)%10)throw Error('ISBN non valido');return s;}
$('#manual-add').onclick=()=>{try{const title=$('#manual-title').value.trim();if(!title)throw Error('Inserisci il titolo');addBook({title,author:$('#manual-author').value.trim(),publisher:$('#manual-publisher').value.trim(),year:$('#manual-year').value.trim(),volume:$('#manual-volume').value.trim(),isbn:normalize($('#manual-isbn').value),source:'Manuale'});$('#manual-title').value='';$('#manual-author').value='';$('#manual-isbn').value='';$('#manual-publisher').value='';$('#manual-year').value='';$('#manual-volume').value='';$('#order-error').textContent='';}catch(e){$('#order-error').textContent=e.message;}};
async function searchBooks(){const button=$('#find-book');button.disabled=true;$('#book-results').textContent='Ricerca nel catalogo…';try{const result=await api('books?q='+encodeURIComponent($('#book-query').value));const books=result.books;const warnings=result.warnings||[];$('#book-results').innerHTML=books.length?books.map((b,i)=>`<div class="book-result"><div><strong>${esc(b.title)}</strong><span class="sub">${esc(b.author)}</span><span class="sub">${esc([b.volume?'Volume '+b.volume:'',b.publisher,b.year,b.languages,b.source,b.origin].filter(Boolean).join(' · '))}</span><span class="sub">ISBN ${esc(b.isbn)}</span></div><button type="button" class="secondary" data-book="${i}">＋ Aggiungi</button></div>`).join(''):'<p>Nessun risultato con ISBN. Puoi inserire il libro manualmente.</p>';if(warnings.length)$('#book-results').insertAdjacentHTML('afterbegin',`<p class="catalog-warning">${warnings.map(esc).join('<br>')}</p>`);document.querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>addBook(books[Number(b.dataset.book)]));}catch(e){$('#book-results').textContent=e.message;}finally{button.disabled=false;}}
$('#find-book').onclick=searchBooks;$('#book-query').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchBooks();}};
$('#order-form').onsubmit=async e=>{e.preventDefault();const button=$('#save-order');button.disabled=true;$('#order-error').textContent='';try{await api('orders','POST',{first_name:$('#first-name').value,last_name:$('#last-name').value,items:cart});$('#order-dialog').close();toast('Ordine salvato. Una nuova storia in attesa.');await load().catch(()=>toast('Ordine salvato. Ricarica la pagina per aggiornare la lista.'));}catch(err){$('#order-error').textContent=err.message;}finally{button.disabled=false;}};
let scanning=false;
$('#scan-form').onsubmit=async e=>{
 e.preventDefault();if(scanning)return;scanning=true;
 const input=$('#scan-isbn'),code=input.value,button=e.submitter||e.target.querySelector('button');
 input.disabled=true;button.disabled=true;
 try{
  const {result:r}=await api('scan','POST',{isbn:code});
  await load().catch(()=>toast('Scansione salvata. Ricarica per aggiornare le liste.'));
  if(r){
   const order=orders.find(o=>o.id===r.order_id);
   $('#scan-result').innerHTML=`<div class="scan-success"><span>UNA COPIA ASSEGNATA A</span><strong>${esc(r.first_name)} ${esc(r.last_name)}</strong><p>${esc(r.title)}${r.volume?' · Volume '+esc(r.volume):''} · Ordine #${r.order_id}<br>${r.received} di ${r.quantity} copie ricevute per questo titolo${order?`<br><strong class="scan-order-state">${order.status==='evaso'?'Ordine evaso: tutti i libri abbinati.':'Ordine pendente: mancano ancora libri o copie.'}</strong>`:''}</p></div>`;
   history.unshift({...r,time:new Date().toISOString()});
   $('#scan-history').innerHTML=history.slice(0,30).map(r=>`<div class="history-entry"><div><strong>${esc(r.first_name)} ${esc(r.last_name)}</strong><span class="sub">${esc(r.title)} · ${esc(r.isbn)}</span></div><span class="sub">${esc(date(r.time))}</span></div>`).join('');
  }else $('#scan-result').innerHTML=`<div class="scan-warning"><strong>Anomalia registrata: libro senza ordine</strong><p>ISBN ${esc(normalize(code))}. Non ci sono copie pendenti per questo codice. La scansione è conservata nel registro Anomalie.</p></div>`;
  input.value='';
 }catch(err){$('#scan-result').innerHTML=`<div class="scan-warning">${esc(err.message)}</div>`;input.select();}
 finally{scanning=false;input.disabled=false;button.disabled=false;input.focus();}
};
api('session').then(enter).catch(showLogin);

$('#catalog-import').onclick=async()=>{const file=$('#catalog-file').files[0];const status=$('#catalog-status');if(!file){status.textContent='Scegli un file CSV.';return;}if(file.size>4500000){status.textContent='Il file deve essere inferiore a 4,5 MB.';return;}const button=$('#catalog-import');button.disabled=true;try{const r=await api('catalog/import','POST',{csv:await file.text()});status.textContent=`${r.imported} libri importati. Catalogo: ${r.count} ISBN.`;}catch(e){status.textContent=e.message;}finally{button.disabled=false;}};
