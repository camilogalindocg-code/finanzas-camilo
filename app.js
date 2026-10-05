const STORAGE_KEY = 'finanzasCamiloV1';
const fmt = new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0});
const today = () => new Date().toISOString().slice(0,10);
const currentMonth = () => new Date().toISOString().slice(0,7);

let state = loadState();
let deferredPrompt = null;

function defaultState(){return {budget:0,movements:[],debts:[],goals:[]}}
function loadState(){try{return {...defaultState(),...JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}}catch{return defaultState()}}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));render()}
function id(){return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random())}
function money(n){return fmt.format(Number(n)||0)}
function toast(msg){const el=document.querySelector('#toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800)}
function escapeHtml(s=''){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]))}

function render(){
  const month=currentMonth();
  const monthMoves=state.movements.filter(m=>m.date.startsWith(month));
  const income=monthMoves.filter(m=>m.type==='income').reduce((a,m)=>a+m.amount,0);
  const expense=monthMoves.filter(m=>m.type==='expense').reduce((a,m)=>a+m.amount,0);
  const savingMonth=monthMoves.filter(m=>m.type==='saving').reduce((a,m)=>a+m.amount,0);
  const savingsAll=state.movements.filter(m=>m.type==='saving').reduce((a,m)=>a+m.amount,0)+state.goals.reduce((a,g)=>a+g.current,0);
  const remaining=state.budget?state.budget-expense:0;
  document.querySelector('#incomeMonth').textContent=money(income);
  document.querySelector('#expenseMonth').textContent=money(expense);
  document.querySelector('#budgetRemaining').textContent=state.budget?money(remaining):'Sin definir';
  document.querySelector('#savingsTotal').textContent=money(savingsAll);
  document.querySelector('#availableBalance').textContent=money(income-expense-savingMonth);
  document.querySelector('#periodLabel').textContent=new Date().toLocaleDateString('es-CO',{month:'long',year:'numeric'});
  document.querySelector('#budgetInput').value=state.budget||'';
  renderBudget(expense); renderMovements(); renderRecent(); renderCategories(monthMoves); renderDebts(); renderGoals();
}

function renderBudget(expense){
  const txt=document.querySelector('#budgetText'), bar=document.querySelector('#budgetProgress');
  if(!state.budget){txt.textContent='Sin presupuesto definido.';bar.style.width='0%';return}
  const pct=Math.min(100,(expense/state.budget)*100);bar.style.width=pct+'%';
  txt.textContent=`Has usado ${pct.toFixed(0)}% (${money(expense)}) de ${money(state.budget)}.`;
}

function movementHTML(m){
  const sign=m.type==='expense'?'-':m.type==='income'?'+':'↗';
  return `<div class="item"><div class="item-main"><div class="item-title">${escapeHtml(m.description)}</div><div class="item-meta">${escapeHtml(m.category)} · ${escapeHtml(m.account||'Sin cuenta')} · ${m.date}</div></div><div><strong class="amount ${m.type}">${sign} ${money(m.amount)}</strong><button class="mini" onclick="deleteMovement('${m.id}')" aria-label="Eliminar">✕</button></div></div>`;
}
function renderMovements(){
  const filter=document.querySelector('#movementFilter').value, q=document.querySelector('#movementSearch').value.toLowerCase();
  const arr=[...state.movements].sort((a,b)=>b.date.localeCompare(a.date)).filter(m=>(filter==='all'||m.type===filter)&&(`${m.description} ${m.category} ${m.account}`.toLowerCase().includes(q)));
  document.querySelector('#movementList').innerHTML=arr.length?arr.map(movementHTML).join(''):'Aún no hay movimientos.';
}
function renderRecent(){const arr=[...state.movements].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);document.querySelector('#recentMovements').innerHTML=arr.length?arr.map(movementHTML).join(''):'Aún no hay movimientos.'}
function renderCategories(moves){
  const totals={}; moves.filter(m=>m.type==='expense').forEach(m=>totals[m.category]=(totals[m.category]||0)+m.amount);
  const entries=Object.entries(totals).sort((a,b)=>b[1]-a[1]); const max=entries[0]?.[1]||1;
  document.querySelector('#categoryBars').innerHTML=entries.length?entries.map(([c,v])=>`<div class="bar-row"><span>${escapeHtml(c)}</span><div class="bar-track"><div class="bar-fill" style="width:${v/max*100}%"></div></div><strong>${money(v)}</strong></div>`).join(''):'Registra gastos para ver el resumen.';
}
function renderDebts(){
  const el=document.querySelector('#debtList');
  el.innerHTML=state.debts.length?state.debts.map(d=>`<div class="item"><div><div class="item-title">${escapeHtml(d.name)}</div><div class="item-meta">Saldo ${money(d.balance)} · Cuota ${money(d.payment)}${d.rate?` · ${d.rate}% EA`:''}</div></div><button class="mini" onclick="deleteDebt('${d.id}')">Eliminar</button></div>`).join(''):'No has registrado deudas.';
}
function renderGoals(){
  const el=document.querySelector('#savingGoals');
  el.innerHTML=state.goals.length?state.goals.map(g=>{const pct=Math.min(100,g.current/g.target*100);return `<div class="item"><div class="item-main"><div class="item-title">${escapeHtml(g.name)}</div><div class="item-meta">${money(g.current)} de ${money(g.target)} · ${pct.toFixed(0)}%</div><div class="bar-track" style="margin-top:7px"><div class="bar-fill" style="width:${pct}%"></div></div></div><div class="goal-actions"><input type="number" min="0" placeholder="Aporte" id="goal-${g.id}"><button class="mini" onclick="addGoalAmount('${g.id}')">+</button><button class="mini" onclick="deleteGoal('${g.id}')">✕</button></div></div>`}).join(''):'No has creado metas.';
}

function parseQuick(text){
  const normalized=text.toLowerCase().replace(/\./g,'').replace(/,/g,'.');
  const amountMatch=normalized.match(/\b(\d+(?:\.\d+)?)\s*(mil|k)?\b/); if(!amountMatch)return null;
  let amount=parseFloat(amountMatch[1]); if(amountMatch[2])amount*=1000;
  let type='expense'; if(/salario|sueldo|ingreso|honorario|prima|pago recibido/.test(normalized)) type='income'; if(/ahorro|ahorrar|fondo/.test(normalized)) type='saving';
  let category='Otros';
  const cats=[['Alimentación',/almuerzo|desayuno|cena|restaurante|comida|mercado|supermercado|cafe|café/],['Transporte',/gasolina|combustible|uber|taxi|transporte|peaje|parqueadero/],['Vivienda',/arriendo|hipoteca|administracion|administración/],['Servicios',/internet|celular|luz|agua|gas|servicio/],['Salud',/medico|médico|farmacia|salud|medicina/],['Educación',/curso|universidad|libro|educacion|educación/],['Ocio',/cine|streaming|netflix|ocio|viaje/],['Compras',/ropa|compra|amazon|mercadolibre/],['Deudas',/cuota|credito|crédito|tarjeta/],['Ahorro',/ahorro|ahorrar|fondo/],['Ingresos',/salario|sueldo|ingreso|honorario|prima/]];
  for(const [c,re] of cats){if(re.test(normalized)){category=c;break}}
  const accountMatch=normalized.match(/\b(mastercard|visa|nequi|daviplata|bancolombia|davivienda|efectivo|cash|amex)\b/);
  let desc=text.replace(amountMatch[0],'').trim().replace(/\s+/g,' '); if(accountMatch)desc=desc.replace(new RegExp(accountMatch[0],'i'),'').trim();
  return {id:id(),type,amount:Math.round(amount),description:desc||category,category,account:accountMatch?accountMatch[0]:'',date:today()}
}

function download(name,content,type){const blob=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function csvCell(v){return `"${String(v??'').replace(/"/g,'""')}"`}

window.deleteMovement=(idv)=>{state.movements=state.movements.filter(x=>x.id!==idv);save()};
window.deleteDebt=(idv)=>{state.debts=state.debts.filter(x=>x.id!==idv);save()};
window.deleteGoal=(idv)=>{state.goals=state.goals.filter(x=>x.id!==idv);save()};
window.addGoalAmount=(idv)=>{const input=document.querySelector(`#goal-${CSS.escape(idv)}`);const val=Number(input.value);if(val>0){const g=state.goals.find(x=>x.id===idv);g.current+=val;save();toast('Aporte registrado')}};

document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
document.querySelectorAll('[data-tab-jump]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tabJump)));
function switchTab(name){document.querySelectorAll('.tab,.tab-panel').forEach(x=>x.classList.remove('active'));document.querySelector(`.tab[data-tab="${name}"]`)?.classList.add('active');document.querySelector(`#${name}`)?.classList.add('active')}

document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>{const name=b.dataset.open;document.querySelector(`#${name}Dialog`).showModal()}));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelector('#mDate').value=today();

document.querySelector('#movementForm').addEventListener('submit',e=>{e.preventDefault();state.movements.push({id:id(),type:mType.value,amount:Number(mAmount.value),description:mDescription.value.trim(),category:mCategory.value,account:mAccount.value.trim(),date:mDate.value});save();e.target.reset();mDate.value=today();movementDialog.close();toast('Movimiento guardado')});
document.querySelector('#debtForm').addEventListener('submit',e=>{e.preventDefault();state.debts.push({id:id(),name:dName.value.trim(),balance:Number(dBalance.value),payment:Number(dPayment.value||0),rate:Number(dRate.value||0)});save();e.target.reset();debtDialog.close();toast('Deuda guardada')});
document.querySelector('#savingForm').addEventListener('submit',e=>{e.preventDefault();state.goals.push({id:id(),name:sName.value.trim(),target:Number(sTarget.value),current:Number(sCurrent.value||0)});save();e.target.reset();savingDialog.close();toast('Meta creada')});
document.querySelector('#quickAddBtn').addEventListener('click',()=>{const parsed=parseQuick(quickInput.value);if(!parsed){toast('No pude identificar el monto');return}state.movements.push(parsed);quickInput.value='';save();toast('Movimiento agregado')});
document.querySelector('#quickInput').addEventListener('keydown',e=>{if(e.key==='Enter')document.querySelector('#quickAddBtn').click()});
document.querySelector('#saveBudget').addEventListener('click',()=>{state.budget=Number(budgetInput.value||0);save();toast('Presupuesto actualizado')});
document.querySelector('#movementFilter').addEventListener('change',renderMovements);document.querySelector('#movementSearch').addEventListener('input',renderMovements);

document.querySelector('#exportCsv').addEventListener('click',()=>{const rows=[['fecha','tipo','monto','descripcion','categoria','cuenta'],...state.movements.map(m=>[m.date,m.type,m.amount,m.description,m.category,m.account])];download('movimientos-finanzas-camilo.csv',rows.map(r=>r.map(csvCell).join(',')).join('\n'),'text/csv;charset=utf-8')});
document.querySelector('#exportBackup').addEventListener('click',()=>download('respaldo-finanzas-camilo.json',JSON.stringify(state,null,2),'application/json'));
document.querySelector('#importBackup').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());state={...defaultState(),...data};save();toast('Respaldo importado')}catch{toast('Archivo inválido')}});
document.querySelector('#resetData').addEventListener('click',()=>{if(confirm('¿Seguro que deseas borrar todos los datos?')){state=defaultState();save();toast('Datos eliminados')}});

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;installBtn.classList.remove('hidden')});
installBtn.addEventListener('click',async()=>{if(!deferredPrompt){toast('Usa “Agregar a pantalla de inicio” desde el menú del navegador');return}deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installBtn.classList.add('hidden')});
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
render();
