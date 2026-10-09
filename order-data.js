const maxCents=999999999;
export function storedCents(value,label='Importo'){
 if(value===undefined||value===null)return null;
 if(!Number.isSafeInteger(value)||value<0||value>maxCents)throw Error(label+' non valido');
 return value;
}
export function moneyCents(value,label='Importo'){
 if(value===undefined||value===null||String(value).trim()==='')return null;
 const raw=String(value).trim();
 if(!/^(?:\d{1,7}(?:[.,]\d{1,2})?|[.,]\d{1,2})$/.test(raw))throw Error(label+' non valido: usa un importo positivo con al massimo due decimali');
 const [whole,fraction='']=raw.replace(',','.').split('.');
 return storedCents(Number(whole||0)*100+Number(fraction.padEnd(2,'0')),label);
}
export function moneyFields(input,items){
 const deposit_cents=input.deposit!==undefined?moneyCents(input.deposit,'Acconto'):storedCents(input.deposit_cents,'Acconto');
 const amounts=priceSummary({items,deposit_cents});
 if(deposit_cents>0&&amounts.total_amount_cents===null)throw Error('Inserisci il prezzo di tutti i libri prima dell’acconto');
 if(amounts.total_amount_cents!==null&&deposit_cents>amounts.total_amount_cents)throw Error('Acconto superiore al totale dell’ordine');
 return {deposit_cents};
}
export function priceSummary(order){
 const complete=order.items.every(i=>i.unit_price_cents!==undefined&&i.unit_price_cents!==null);
 const total_amount_cents=complete?order.items.reduce((n,i)=>n+i.unit_price_cents*i.quantity,0):null;
 if(total_amount_cents!==null&&!Number.isSafeInteger(total_amount_cents))throw Error('Importo totale non valido');
 const deposit_cents=order.deposit_cents??null;
 return {total_amount_cents,deposit_cents,balance_cents:total_amount_cents!==null&&deposit_cents!==null?total_amount_cents-deposit_cents:null};
}
export function customerKey(first,last){return JSON.stringify([first,last].map(s=>String(s).trim().replace(/\s+/g,' ').toLocaleLowerCase('it')));}
export function customerSummaries(customers,orders,first='',last=''){
 const normalized=s=>String(s).trim().toLocaleLowerCase('it');
 return customers.filter(c=>normalized(c.first_name).includes(normalized(first))&&normalized(c.last_name).includes(normalized(last)))
 .sort((a,b)=>a.last_name.localeCompare(b.last_name,'it')||a.first_name.localeCompare(b.first_name,'it')||a.id-b.id)
 .map(c=>{const own=orders.filter(o=>o.customer_id===c.id);return {...c,order_count:own.length,pending_count:own.filter(o=>o.status==='pendente').length,closed_count:own.filter(o=>o.status!=='pendente').length};});
}
