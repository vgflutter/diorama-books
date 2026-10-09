import {moneyCents,customerSummaries} from '/order-data.js';
const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let orders=[],anomalies=[],customers=[],selectedCustomer=null,cart=[],filter='pendente',history=[];
const euro=cents=>cents===undefined||cents===null?'Non registrato':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(cents/100);
const stateLabel={pendente:'Pendente',evaso:'Evaso',archiviato:'Archiviato'};
async function api(path,method='GET',data){const response=await fetch('/api/'+path,{method,headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});const result=await response.json();if(!response.ok){if(response.status===401&&path!=='login')showLogin();throw Error([result.error||'Operazione non riuscita',...(result.warnings||[])].join(' '));}return result;}
function showLogin(){$('#app').classList.add('hidden');$('#login').classList.remove('hidden');$('#order-dialog').close();}
function toast(text){$('#toast').textContent=text;$('#toast').classList.remove('hidden');setTimeout(()=>$('#toast').classList.add('hidden'),3500);}
const date=s=>new Date(s).toLocaleString('it-IT',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
async function load(){const data=await Promise.all([api('orders'),api('anomalies'),api('customers')]);[orders,anomalies,customers]=data;renderOrders();renderAnomalies();renderCustomers();await loadCatalog();}
async function enter(){$('#login').classList.add('hidden');$('#app').classList.remove('hidden');await load();}
$('#today').textContent=new Date().toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'});
$('#login-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter||e.target.querySelector('button');button.disabled=true;$('#login-error').textContent='';try{await api('login','POST',Object.fromEntries(new FormData(e.target)));e.target.reset();await enter();}catch(err){showLogin();$('#login-error').textContent=err.message;}finally{button.disabled=false;}};
$('#logout').onclick=async()=>{try{await api('logout','POST',{});orders=[];anomalies=[];customers=[];selectedCustomer=null;cart=[];history=[];$('#scan-history').innerHTML='<p>Le prossime scansioni compariranno qui.</p>';$('#scan-result').textContent='';showLogin();}catch(e){toast(e.message);}};
$('#mobile-logout').onclick=()=>$('#logout').click();
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('[data-view]').forEach(n=>n.classList.toggle('active',n===b));
 for(const view of ['orders','customers','catalog','receive','anomalies'])$('#'+view+'-view').classList.toggle('hidden',b.dataset.view!==view);
 if(b.dataset.view==='receive')$('#scan-isbn').focus();
 if(b.dataset.view==='catalog')loadCatalog().catch(e=>toast(e.message));
});
function renderOrders(){
 $('#pending-count').textContent=orders.filter(o=>o.status==='pendente').length;
 $('#done-count').textContent=orders.filter(o=>o.status==='evaso').length;
 $('#archived-count').textContent=orders.filter(o=>o.status==='archiviato').length;
 const q=$('#order-search').value.toLowerCase().trim();
 const shown=orders.filter(o=>o.status===filter&&`${o.first_name} ${o.last_name} ${o.items.map(i=>i.title+' '+i.isbn).join(' ')}`.toLowerCase().includes(q));
 $('#order-list').innerHTML=shown.length?orderTable(shown):`<div class="empty"><div class="empty-icon">⌑</div><h2>${orders.length?{pendente:'Nessun ordine pendente',evaso:'Nessun ordine evaso',archiviato:'Nessun ordine archiviato'}[filter]:'La prossima storia comincia qui'}</h2><p>${orders.length?'Le nuove richieste sono pendenti. La scansione dell’ultima copia le rende evase; Archivia le sposta nello storico.':'Aggiungi la prima richiesta di un lettore.'}</p>${orders.length?'':'<button class="secondary" id="empty-add">＋ Crea il primo ordine</button>'}</div>`;
 $('#list-footer').textContent=`${shown.length} ${shown.length===1?'ordine':'ordini'} · Ordinati dal più recente`;
 if($('#empty-add'))$('#empty-add').onclick=()=>openOrder();
}
function orderTable(list){return `<div class="table-scroll"><table><thead><tr><th>CLIENTE</th><th>LIBRI RICHIESTI</th><th>IMPORTI</th><th>INSERITO IL</th><th>STATO</th></tr></thead><tbody>${list.map(o=>`<tr><td><div class="customer"><div class="avatar">${esc(o.first_name[0]+o.last_name[0])}</div><div><button class="customer-link" type="button" data-customer="${o.customer_id}">${esc(o.first_name)} ${esc(o.last_name)}</button><span class="sub">Ordine #${o.id} · Cliente #${o.customer_id}</span></div></div></td><td>${o.items.map(i=>`<div class="item-line"><strong>${esc(i.title)}</strong><span class="sub">${esc([i.volume?'Volume '+i.volume:'',i.publisher,i.year].filter(Boolean).join(' · '))}</span><span class="sub">${esc(i.isbn)} · ${i.received}/${i.quantity} copie ricevute</span><span class="sub">${esc(euro(i.unit_price_cents))} per copia · ${esc(euro(i.unit_price_cents==null?null:i.unit_price_cents*i.quantity))} per ${i.quantity} ${i.quantity===1?'copia':'copie'}</span></div>`).join('')}</td><td class="amount-cell"><strong>Totale ${esc(euro(o.total_amount_cents))}</strong><span class="sub">Acconto ${esc(euro(o.deposit_cents))}</span><span class="sub">Da saldare ${esc(euro(o.balance_cents))}</span></td><td>${esc(date(o.created_at))}</td><td><span class="badge ${o.status}">${stateLabel[o.status]}</span><span class="sub">${o.received}/${o.total} copie</span>${o.status==='evaso'?`<button type="button" class="secondary archive-order" data-archive="${o.id}">Archivia</button>`:''}${o.archived_at?`<span class="sub">Archiviato il ${esc(date(o.archived_at))}</span>`:''}</td></tr>`).join('')}</tbody></table></div>`;}
function renderCustomers(){
 const shown=customerSummaries(customers,orders,$('#customer-first-search').value,$('#customer-last-search').value);
 $('#customer-list').innerHTML=shown.length?`<table><thead><tr><th>CLIENTE</th><th>PENDENTI</th><th>CHIUSI</th><th>TOTALE ORDINI</th></tr></thead><tbody>${shown.map(c=>`<tr><td><button type="button" class="customer-link" data-customer="${c.id}">${esc(c.first_name)} ${esc(c.last_name)}</button><span class="sub">Cliente #${c.id}</span></td><td>${c.pending_count}</td><td>${c.closed_count}<span class="sub">Evasi e archiviati</span></td><td>${c.order_count}</td></tr>`).join('')}</tbody></table>`:'<div class="empty"><h2>Nessun cliente trovato</h2><p>I nuovi clienti vengono registrati al salvataggio del primo ordine.</p></div>';
 $('#customer-footer').textContent=`${shown.length} clienti visualizzati · ${customers.length} clienti registrati`;
 if(selectedCustomer!==null){const c=customers.find(c=>c.id===selectedCustomer);if(c)renderCustomerDetail(c);else{$('#customer-detail').classList.add('hidden');selectedCustomer=null;}}
}
function renderCustomerDetail(customer){
 const own=orders.filter(o=>o.customer_id===customer.id);
 $('#customer-detail').classList.remove('hidden');$('#customer-detail-name').textContent=customer.first_name+' '+customer.last_name;
 $('#customer-detail-summary').textContent=`Cliente #${customer.id} · ${own.filter(o=>o.status==='pendente').length} pendenti · ${own.filter(o=>o.status!=='pendente').length} chiusi`;
 $('#customer-orders').innerHTML=own.length?orderTable(own):'<div class="empty">Nessun ordine associato.</div>';
}
function showCustomer(value){const c=customers.find(c=>c.id===Number(value));if(!c)return;selectedCustomer=c.id;document.querySelector('[data-view="customers"]').click();renderCustomerDetail(c);$('#customer-detail').scrollIntoView({behavior:'smooth',block:'start'});}
$('#customer-search-form').onsubmit=e=>{e.preventDefault();renderCustomers();};
$('#customer-first-search').oninput=renderCustomers;$('#customer-last-search').oninput=renderCustomers;
$('#customer-new-order').onclick=()=>openOrder(selectedCustomer);
function renderAnomalies(){
 $('#anomaly-count').textContent=anomalies.length;
 $('#anomaly-list').innerHTML=anomalies.length?`<table><thead><tr><th>ISBN SCANSIONATO</th><th>DATA E ORA</th><th>ANOMALIA</th></tr></thead><tbody>${anomalies.map(a=>`<tr><td><strong>${esc(a.isbn)}</strong><span class="sub">Una copia · Scansione #${a.id}</span></td><td>${esc(date(a.created_at))}</td><td><span class="badge">Senza ordine pendente</span></td></tr>`).join('')}</tbody></table>`:'<div class="empty"><h2>Nessuna anomalia</h2><p>Le scansioni senza una richiesta pendente compariranno qui.</p></div>';
 $('#anomaly-footer').textContent=`${anomalies.length} ${anomalies.length===1?'scansione senza ordine':'scansioni senza ordine'} · Registro conservato nell’archivio`;
}
async function orderActions(e){
 const client=e.target.closest('[data-customer]');if(client){showCustomer(client.dataset.customer);return;}
 const button=e.target.closest('[data-archive]');if(!button)return;
 button.disabled=true;
 try{await api('orders/'+button.dataset.archive+'/archive','POST',{});toast('Ordine archiviato.');await load().catch(()=>toast('Ordine archiviato. Ricarica per aggiornare la lista.'));}catch(error){toast(error.message);button.disabled=false;}
}
$('#order-list').onclick=orderActions;$('#customer-orders').onclick=orderActions;$('#customer-list').onclick=orderActions;
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(n=>n.classList.toggle('selected',n===b));renderOrders();});$('#order-search').oninput=renderOrders;
function chooseCustomer(){const c=customers.find(c=>c.id===Number($('#order-customer').value));for(const [field,value] of [['#first-name',c?.first_name],['#last-name',c?.last_name]]){const input=$(field);input.readOnly=Boolean(c);input.value=value||'';}if(!c)$('#first-name').focus();}
$('#order-customer').onchange=chooseCustomer;
function openOrder(customerId=null){
 cart=[];$('#order-form').reset();$('#order-customer').innerHTML='<option value="">＋ Crea un nuovo cliente</option>'+customers.map(c=>`<option value="${c.id}">${esc(c.first_name)} ${esc(c.last_name)} · Cliente #${c.id}</option>`).join('');
 $('#order-customer').value=Number.isSafeInteger(customerId)?String(customerId):'';chooseCustomer();$('#order-error').textContent='';$('#book-results').textContent='';renderCart();$('#order-dialog').showModal();$('#order-customer').focus();
}
$('#new-order').onclick=()=>openOrder();$('#close-dialog').onclick=()=>$('#order-dialog').close();
function addBook(book){const existing=cart.find(i=>i.isbn===book.isbn);if(existing)existing.quantity++;else cart.push({...book,quantity:1,unit_price:''});renderCart();}
function renderCart(){
 $('#cart').innerHTML=cart.length?cart.map((i,n)=>`<div class="cart-item"><div class="cart-book"><strong>${esc(i.title)}</strong><span class="sub">${esc([i.volume?'Volume '+i.volume:'',i.publisher,i.year,i.author,i.isbn].filter(Boolean).join(' · '))}</span></div><label>Copie<input type="number" min="1" max="999" required value="${i.quantity}" data-qty="${n}" aria-label="Quantità ${esc(i.title)}"></label><label>Prezzo per copia (€)<input inputmode="decimal" required maxlength="11" placeholder="0,00" value="${esc(i.unit_price)}" data-price="${n}" aria-label="Prezzo unitario ${esc(i.title)}"></label><span class="cart-line-total" data-line-total="${n}"></span><button type="button" data-remove="${n}" aria-label="Rimuovi ${esc(i.title)}">×</button></div>`).join(''):'<p class="field-note">Nessun libro aggiunto. Cerca nel catalogo o inserisci un ISBN manualmente.</p>';
 document.querySelectorAll('[data-qty]').forEach(el=>el.oninput=()=>{cart[Number(el.dataset.qty)].quantity=Number(el.value);updateOrderAmounts();});
 document.querySelectorAll('[data-price]').forEach(el=>el.oninput=()=>{cart[Number(el.dataset.price)].unit_price=el.value;updateOrderAmounts();});
 document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{cart.splice(Number(b.dataset.remove),1);renderCart();});updateOrderAmounts();
}
function updateOrderAmounts(){
 let total=0,complete=cart.length>0;
 cart.forEach((item,index)=>{let value=null;try{const cents=moneyCents(item.unit_price);if(cents!==null&&Number.isInteger(item.quantity)&&item.quantity>0&&item.quantity<=999)value=cents*item.quantity;}catch{}if(value===null)complete=false;else total+=value;$('[data-line-total="'+index+'"]').textContent=value===null?'—':euro(value);});
 const input=$('#order-deposit');let deposit=null;try{deposit=moneyCents(input.value);}catch{}
 input.setCustomValidity(deposit===null?'Inserisci un acconto valido (0 se non versato).':complete&&deposit>total?'L’acconto non può superare il totale.':'');
 $('#order-total').textContent=complete?euro(total):'Inserisci tutti i prezzi';$('#order-deposit-total').textContent=deposit===null?'—':euro(deposit);$('#order-balance').textContent=complete&&deposit!==null&&deposit<=total?euro(total-deposit):'—';
}
$('#order-deposit').oninput=updateOrderAmounts;
function normalize(value){let s=String(value??'').replace(/[\s-]/g,'').toUpperCase();if(/^\d{9}[\dX]$/.test(s)){if([...s].reduce((a,c,i)=>a+(c==='X'?10:Number(c))*(10-i),0)%11)throw Error('ISBN non valido');s='978'+s.slice(0,9);s+=(10-[...s].reduce((a,c,i)=>a+Number(c)*(i%2?3:1),0)%10)%10;}if(!/^97[89]\d{10}$/.test(s)||[...s].reduce((a,c,i)=>a+Number(c)*(i%2?3:1),0)%10)throw Error('ISBN non valido');return s;}
$('#manual-add').onclick=()=>{try{const title=$('#manual-title').value.trim();if(!title)throw Error('Inserisci il titolo');addBook({title,author:$('#manual-author').value.trim(),publisher:$('#manual-publisher').value.trim(),year:$('#manual-year').value.trim(),volume:$('#manual-volume').value.trim(),isbn:normalize($('#manual-isbn').value),source:'Manuale'});$('#manual-title').value='';$('#manual-author').value='';$('#manual-isbn').value='';$('#manual-publisher').value='';$('#manual-year').value='';$('#manual-volume').value='';$('#order-error').textContent='';}catch(e){$('#order-error').textContent=e.message;}};
async function searchBooks(){const button=$('#find-book');button.disabled=true;$('#book-results').textContent='Ricerca nel catalogo…';try{const result=await api('books?q='+encodeURIComponent($('#book-query').value)+'&scope='+($('#book-online').checked?'online':'catalog'));const books=result.books;const warnings=result.warnings||[];$('#book-results').innerHTML=books.length?books.map((b,i)=>`<div class="book-result"><div><strong>${esc(b.title)}</strong><span class="sub">${esc(b.author)}</span><span class="sub">${esc([b.volume?'Volume '+b.volume:'',b.publisher,b.year,b.languages,b.source,b.origin].filter(Boolean).join(' · '))}</span><span class="sub">ISBN ${esc(b.isbn)}</span></div><button type="button" class="secondary" data-book="${i}">＋ Aggiungi</button></div>`).join(''):'<p>Nessun risultato con ISBN. Puoi inserire il libro manualmente.</p>';if(warnings.length)$('#book-results').insertAdjacentHTML('afterbegin',`<p class="catalog-warning">${warnings.map(esc).join('<br>')}</p>`);document.querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>addBook(books[Number(b.dataset.book)]));}catch(e){$('#book-results').textContent=e.message;}finally{button.disabled=false;}}
$('#find-book').onclick=searchBooks;$('#book-query').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchBooks();}};
$('#order-form').onsubmit=async e=>{e.preventDefault();const button=$('#save-order');button.disabled=true;$('#order-error').textContent='';try{await api('orders','POST',{customer_id:$('#order-customer').value||null,first_name:$('#first-name').value,last_name:$('#last-name').value,deposit:$('#order-deposit').value,items:cart});$('#order-dialog').close();toast('Ordine salvato. Una nuova storia in attesa.');await load().catch(()=>toast('Ordine salvato. Ricarica la pagina per aggiornare la lista.'));}catch(err){$('#order-error').textContent=err.message;}finally{button.disabled=false;}};
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

function wireCatalogImport(buttonId,fileId,statusId){
 $(buttonId).onclick=async()=>{
  const file=$(fileId).files[0],status=$(statusId),button=$(buttonId);
  if(!file){status.textContent='Scegli un file CSV.';return;}if(file.size>4500000){status.textContent='Il file deve essere inferiore a 4,5 MB.';return;}
  button.disabled=true;
  try{const r=await api('catalog/import','POST',{csv:await file.text()});status.textContent=`${r.imported} libri importati. Catalogo: ${r.count} ISBN.`;await loadCatalog().catch(()=>toast('Catalogo importato. Ricarica per aggiornare la lista.'));}
  catch(error){status.textContent=error.message;}finally{button.disabled=false;}
 };
}
wireCatalogImport('#catalog-import','#catalog-file','#catalog-status');
wireCatalogImport('#catalog-page-import','#catalog-page-file','#catalog-page-status');


async function loadCatalog(){
 const q=$('#catalog-search').value.trim();
 const result=await api('catalog/books?q='+encodeURIComponent(q));
 $('#catalog-count-label').textContent=`Libri nel catalogo · ${result.count}`;
 $('#catalog-list').innerHTML=result.books.length?`<table><thead><tr><th>TITOLO</th><th>ISBN</th><th>EDIZIONE</th><th>FONTE</th></tr></thead><tbody>${result.books.map(b=>`<tr><td><strong>${esc(b.title)}</strong><span class="sub">${esc(b.author)}</span></td><td>${esc(b.isbn)}</td><td>${esc([b.volume?'Volume '+b.volume:'',b.publisher,b.year].filter(Boolean).join(' · '))||'—'}</td><td>${esc(b.origin||'Catalogo libreria')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty"><h2>'+ (result.count?'Nessun libro trovato':'Il catalogo è pronto per il primo libro')+'</h2><p>Aggiungi titolo e ISBN di uno scolastico italiano o importa il CSV del fornitore.</p></div>';
 $('#catalog-list-footer').textContent=`${result.books.length} ${result.books.length===1?'libro visualizzato':'libri visualizzati'} · ${result.count} ISBN nel catalogo · Fino a 40 risultati per ricerca`;
}
$('#catalog-search-form').onsubmit=e=>{e.preventDefault();loadCatalog().catch(error=>toast(error.message));};
$('#catalog-add-form').onsubmit=async e=>{
 e.preventDefault();const button=$('#catalog-add-save');button.disabled=true;$('#catalog-add-error').textContent='';
 try{
  const result=await api('catalog/books','POST',Object.fromEntries(new FormData(e.target)));
  e.target.reset();$('#catalog-search').value='';toast('Libro salvato nel catalogo · ISBN '+result.book.isbn);
  await loadCatalog().catch(()=>toast('Libro salvato. Ricarica la pagina per aggiornare il catalogo.'));
 }catch(error){$('#catalog-add-error').textContent=error.message;}
 finally{button.disabled=false;}
};
