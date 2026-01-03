function q(sel){return document.querySelector(sel)}
function formatHM(totalMinutes){
  const h=Math.floor(totalMinutes/60);
  const m=totalMinutes%60;
  return `${h} ч ${String(m).padStart(2,'0')} мин`;
}

function calcMinutes(startStr,endStr){
  // startStr, endStr are "HH:MM"
  const [sh,sm]=startStr.split(':').map(Number);
  const [eh,em]=endStr.split(':').map(Number);
  let start = sh*60+sm;
  let end = eh*60+em;
  if(end<=start) end += 24*60; // crosses midnight or equal -> treat as next day
  return end-start;
}

function money(n){
  return n.toLocaleString('ru-RU', {style:'currency', currency:'RUB', maximumFractionDigits:0});
}

// Storage key
const STORAGE_KEY = 'shiftEntries_v1';
const PERIODS_KEY = 'shiftPeriods_v1';

function loadEntries(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw? JSON.parse(raw) : [];
  }catch(e){return []}
}
function saveEntries(arr){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

function addEntry(entry){
  const arr = loadEntries();
  // ensure periodKey
  if(!entry.periodKey) entry.periodKey = computePeriodKey(entry.date).key;
  arr.push(entry);
  saveEntries(arr);
  renderHistory();
}

function migrateEntries(){
  const arr = loadEntries();
  let changed = false;
  for(const it of arr){
    if(!it.periodKey && it.date){
      it.periodKey = computePeriodKey(it.date).key;
      changed = true;
    }
  }
  if(changed) saveEntries(arr);
}

function deleteEntry(id){
  const arr = loadEntries().filter(it => it.id !== id);
  saveEntries(arr);
  // if we're editing this id, cancel edit
  if(editingId === id){ editingId = null; editingType = null; q('#submitBtn').textContent='Посчитать'; q('#cancelEditBtn').style.display='none'; }
  renderHistory();
}

function clearHistory(){
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
}

function exportCSV(){
  const arr = getFilteredEntries();
  if(!arr.length){ alert('Нет записей для экспорта'); return; }
  // Russian headers and include numeric columns; append totals at the end
  const header = ['ID','Дата','Тип','Машина','Начало','Конец','Отработано_мин','Переработка_ч','Оплата_смена','Оплата_переработка','Оплата_слив','Слив','Сумма_расхода','Описание_расхода','Итого'];
  const rows = arr.map(r => [
    r.id || '',
    r.date || '',
    (r.type || ''),
    r.machine || '',
    r.start || '',
    r.end || '',
    r.workedMinutes != null ? String(r.workedMinutes) : '',
    r.overtimeHours != null ? String(r.overtimeHours) : '',
    r.payShift != null ? String(r.payShift) : '',
    r.payOvertime != null ? String(r.payOvertime) : '',
    r.paySliv != null ? String(r.paySliv) : '',
    r.sliv != null ? String(r.sliv) : '',
    r.expenseAmount != null ? String(r.expenseAmount) : '',
    r.expenseDesc || '',
    r.total != null ? String(r.total) : ''
  ].map(v => JSON.stringify(v)).join(','));

  // compute totals for the exported (filtered) set
  const shiftSum = arr.reduce((s,it)=> s + (it.type === 'expense' ? 0 : Number(it.total || 0)), 0);
  const expenseSum = arr.reduce((s,it)=> s + (it.type === 'expense' ? Number(it.expenseAmount || 0) : 0), 0);
  const net = shiftSum - expenseSum;

  const csv = [header.join(','), ...rows, '', JSON.stringify('Итого смены') + ',' + JSON.stringify(money(shiftSum)), JSON.stringify('Итого расходы') + ',' + JSON.stringify(money(expenseSum)), JSON.stringify('Чистый итог') + ',' + JSON.stringify(money(net))].join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'salary_history.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getFilteredEntries(){
  const arrAll = loadEntries();
  const filterFrom = q('#filterFrom').value;
  const filterTo = q('#filterTo').value;
  const filterMonth = q('#filterMonth').value;
  const currentPeriod = q('#periodTabs').getAttribute('data-current') || '';
  // if filterMonth is set, compute first/last day
  let from = filterFrom || '';
  let to = filterTo || '';
  if(filterMonth){
    const [y,m] = filterMonth.split('-').map(Number);
    const first = new Date(y, m-1, 1);
    const last = new Date(y, m, 0);
    const ff = first.toISOString().slice(0,10);
    const tt = last.toISOString().slice(0,10);
    from = ff; to = tt;
  }
  return arrAll.filter(it=>{
    if(currentPeriod){ return it.periodKey === currentPeriod; }
    if(!from && !to) return true;
    const d = new Date(it.date+'T00:00:00');
    if(from){ const f = new Date(from+'T00:00:00'); if(d < f) return false; }
    if(to){ const t = new Date(to+'T00:00:00'); if(d > t) return false; }
    return true;
  });
}

function computePeriodKey(dateStr){
  // dateStr like YYYY-MM-DD
  const d = new Date(dateStr+'T00:00:00');
  const y = d.getFullYear();
  const m = d.getMonth()+1;
  const day = d.getDate();
  const monthStr = String(m).padStart(2,'0');
  const key = day <= 15 ? `${y}-${monthStr}-01-15` : `${y}-${monthStr}-16-${new Date(y,m,0).getDate()}`;
  const from = day <= 15 ? `${y}-${monthStr}-01` : `${y}-${monthStr}-16`;
  const to = day <= 15 ? `${y}-${monthStr}-15` : `${y}-${monthStr}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`;
  const label = day <= 15 ? `${from} — ${to}` : `${from} — ${to}`;
  return {key, from, to, label};
}

function loadPeriodsMeta(){
  try{ return JSON.parse(localStorage.getItem(PERIODS_KEY) || '{}'); }catch(e){ return {}; }
}
function savePeriodsMeta(obj){ localStorage.setItem(PERIODS_KEY, JSON.stringify(obj)); }

function finalizePeriod(periodKey){
  const meta = loadPeriodsMeta();
  meta[periodKey] = meta[periodKey] || {};
  meta[periodKey].finalized = true;
  meta[periodKey].finalizedAt = new Date().toISOString();
  savePeriodsMeta(meta);
  renderPeriodTabs();
  renderHistory();
}

function renderPeriodTabs(){
  const container = q('#periodTabs');
  container.innerHTML = '';
  const arr = loadEntries();
  const meta = loadPeriodsMeta();
  const periods = {};
  arr.forEach(it=>{
    const p = computePeriodKey(it.date);
    periods[p.key] = p;
  });
  // also add current period
  const today = new Date();
  const curP = computePeriodKey(today.toISOString().slice(0,10));
  periods[curP.key] = curP;
  // If a month filter is active, show exactly two tabs for that month
  const filterMonth = q('#filterMonth') ? q('#filterMonth').value : '';
  let keys;
  if(filterMonth){
    const [y,m] = filterMonth.split('-').map(Number);
    function lastDayOfMonth(y,m){
      if(m === 2) return 28; // as requested: February = 28 days
      return new Date(y, m, 0).getDate();
    }
    const monthStr = String(m).padStart(2,'0');
    const d1_from = `${y}-${monthStr}-01`;
    const d1_to = `${y}-${monthStr}-15`;
    const d2_from = `${y}-${monthStr}-16`;
    const d2_to = `${y}-${monthStr}-${String(lastDayOfMonth(y,m)).padStart(2,'0')}`;
    const p1 = { key: `${y}-${monthStr}-01-15`, from: d1_from, to: d1_to, label: `${d1_from} — ${d1_to}` };
    const p2 = { key: `${y}-${monthStr}-16-${d2_to.slice(-2)}`, from: d2_from, to: d2_to, label: `${d2_from} — ${d2_to}` };
    periods[p1.key] = p1; periods[p2.key] = p2;
    keys = [p1.key, p2.key];
  } else {
    keys = Object.keys(periods).sort().reverse();
  }
  // all tab
  const allBtn = document.createElement('button');
  allBtn.className = 'btn';
  allBtn.textContent = 'Все';
  allBtn.addEventListener('click', ()=>{ container.setAttribute('data-current',''); renderHistory(); });
  // mark active
  const current = container.getAttribute('data-current') || '';
  if(!current) allBtn.classList.add('tab-active');
  container.appendChild(allBtn);

  keys.forEach(k=>{
    const p = periods[k];
    const pm = meta[k] || {};
    if(pm.hidden) return; // skip hidden tabs
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = p.label;
    if(meta[k] && meta[k].finalized) btn.classList.add('secondary');
    if(current === k) btn.classList.add('tab-active');
    btn.addEventListener('click', ()=>{ container.setAttribute('data-current', k); renderHistory(); });
    container.appendChild(btn);
    // add finalize small button
    const fin = document.createElement('button');
    fin.className = 'btn secondary';
    fin.style.marginLeft='6px';
    fin.textContent = (meta[k] && meta[k].finalized) ? 'Финализовано' : 'Финализовать';
    fin.addEventListener('click', ()=>{ if(confirm('Финализовать период? После финализации период будет помечен.')) finalizePeriod(k); });
    container.appendChild(fin);

    // delete tab (move or delete entries)
    const delTab = document.createElement('button');
    delTab.className = 'btn secondary';
    delTab.style.marginLeft='4px';
    delTab.textContent = 'Удалить вкладку';
    delTab.addEventListener('click', ()=>{
      const move = confirm('Удалить вкладку? Нажмите OK чтобы переместить записи этого периода в "Все" (сохранить записи). Нажмите Отмена чтобы перейти к удалению записей.');
      const meta2 = loadPeriodsMeta();
      if(move){
        // unset periodKey for entries in this period
        const arr = loadEntries();
        let changed = false;
        for(const it of arr){ if(it.periodKey === k){ delete it.periodKey; changed = true; } }
        if(changed) saveEntries(arr);
        // mark this period as hidden so tab disappears
        meta2[k] = meta2[k] || {};
        meta2[k].hidden = true;
        savePeriodsMeta(meta2);
        renderPeriodTabs(); renderHistory();
        return;
      }
      if(confirm('Подтвердите: удалить ВСЕ записи этого периода окончательно?')){
        clearPeriod(k);
      }
    });
    container.appendChild(delTab);
    // if finalized, allow clearing this period
    if(meta[k] && meta[k].finalized){
      const clr = document.createElement('button');
      clr.className = 'btn secondary';
      clr.style.marginLeft='4px';
      clr.textContent = 'Очистить период';
      clr.addEventListener('click', ()=>{ if(confirm('Удалить ВСЕ записи этого финализированного периода?')) clearPeriod(k); });
      container.appendChild(clr);
    }
  });
}

function clearPeriod(periodKey){
  const arr = loadEntries().filter(it => it.periodKey !== periodKey);
  saveEntries(arr);
  // remove meta for that period
  const meta = loadPeriodsMeta();
  delete meta[periodKey];
  savePeriodsMeta(meta);
  renderPeriodTabs();
  renderHistory();
}

function clearAllFinalized(){
  const meta = loadPeriodsMeta();
  const finalized = Object.keys(meta).filter(k=> meta[k] && meta[k].finalized);
  if(!finalized.length){ alert('Нет финализированных периодов для очистки'); return; }
  if(!confirm(`Удалить записи из ${finalized.length} финализированного(ых) период(ов)?`)) return;
  let arr = loadEntries();
  const dels = new Set(finalized);
  arr = arr.filter(it => !dels.has(it.periodKey));
  saveEntries(arr);
  // remove metas
  for(const k of finalized) delete meta[k];
  savePeriodsMeta(meta);
  renderPeriodTabs();
  renderHistory();
}

function renderHistory(){
  const list = q('#historyList');
  list.innerHTML = '';
  const arr = getFilteredEntries();
  if(!arr.length){
    list.innerHTML = '<div class="small" style="color:var(--muted)">История пуста</div>';
    // ensure overall is reset
    q('#overallTotal').textContent = money(0);
    q('#shownCount').textContent = '0';
    q('#shownShiftSum').textContent = money(0);
    q('#shownExpenseSum').textContent = money(0);
    q('#shownNet').textContent = money(0);
    return;
  }

  // group by date
  const map = {};
  arr.forEach(it => {
    (map[it.date] = map[it.date] || []).push(it);
  });

  Object.keys(map).sort((a,b)=> new Date(b) - new Date(a)).forEach(date=>{
    const group = map[date];
    const dateCard = document.createElement('div');
    dateCard.className = 'card';
    dateCard.style.padding = '10px';
    const header = document.createElement('div');
    header.style.display='flex'; header.style.justifyContent='space-between'; header.style.alignItems='center';
    header.innerHTML = `<div><div class="small">${new Date(date).toLocaleDateString('ru-RU')}</div><div class="small" style="color:var(--muted)">${group.length} запись(ей)</div></div>`;
    dateCard.appendChild(header);

    const entriesWrap = document.createElement('div');
    entriesWrap.style.marginTop='8px';
    let subtotal = 0;
    let expenseSubtotal = 0;
    group.forEach(it=>{
      if(it.type === 'expense'){
        const row = document.createElement('div');
        row.className = 'report-row';
        row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center';
        const left = document.createElement('div');
        left.innerHTML = `<div style="font-weight:600">РАСХОД</div><div class="small" style="color:var(--muted)">${it.expenseDesc || ''}</div>`;
        const right = document.createElement('div');
        right.style.textAlign='right';
        right.innerHTML = `<div style="color:var(--muted)">-${money(it.expenseAmount || 0)}</div><div style="margin-top:6px"><button data-id="${it.id}" data-action="edit" class="btn smallBtn">Редактировать</button> <button data-id="${it.id}" data-action="delete" class="btn secondary smallBtn">Удалить</button></div>`;
        row.appendChild(left);
        row.appendChild(right);
        entriesWrap.appendChild(row);
        expenseSubtotal += Number(it.expenseAmount || 0);
      } else {
        const row = document.createElement('div');
        row.className = 'report-row';
        row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center';
        const left = document.createElement('div');
        left.innerHTML = `<div style="font-weight:600">${it.machine.toUpperCase()}</div><div class="small" style="color:var(--muted)">${it.start} — ${it.end} • ${formatHM(it.workedMinutes)}</div>`;
        const right = document.createElement('div');
        right.style.textAlign='right';
        right.innerHTML = `<div>${money(it.total)}</div><div class="small">слив: ${it.sliv}</div><div style="margin-top:6px"><button data-id="${it.id}" data-action="edit" class="btn smallBtn">Редактировать</button> <button data-id="${it.id}" data-action="delete" class="btn secondary smallBtn">Удалить</button></div>`;
        row.appendChild(left);
        row.appendChild(right);
        entriesWrap.appendChild(row);
        subtotal += Number(it.total || 0);
      }
    });

    const subtotalRow = document.createElement('div');
    subtotalRow.className = 'report-row total';
    subtotalRow.style.marginTop='8px';
    const net = subtotal - expenseSubtotal;
    subtotalRow.innerHTML = `<div class="small">Итого за ${new Date(date).toLocaleDateString('ru-RU')}</div><div>${money(subtotal)} • расход: ${money(expenseSubtotal)} • чисто: ${money(net)}</div>`;

    dateCard.appendChild(entriesWrap);
    dateCard.appendChild(subtotalRow);
    list.appendChild(dateCard);
  });

  renderPeriodTabs();

  // update overall total display
  updateOverallTotal();
  // update shown meta for filtered set
  const shownCount = arr.length;
  const shownShiftSum = arr.reduce((s,it)=> s + (it.type === 'expense' ? 0 : Number(it.total||0)), 0);
  const shownExpenseSum = arr.reduce((s,it)=> s + (it.type === 'expense' ? Number(it.expenseAmount||0) : 0), 0);
  const shownNet = shownShiftSum - shownExpenseSum;
  q('#shownCount').textContent = String(shownCount);
  q('#shownShiftSum').textContent = money(shownShiftSum);
  q('#shownExpenseSum').textContent = money(shownExpenseSum);
  q('#shownNet').textContent = money(shownNet);

  // attach delete handlers
  // attach edit/delete handlers
  list.querySelectorAll('button[data-id]').forEach(btn=>{
    btn.addEventListener('click', function(){
      const id = this.getAttribute('data-id');
      const action = this.getAttribute('data-action') || 'delete';
      if(action === 'delete'){
        if(confirm('Удалить запись?')) deleteEntry(id);
      } else if(action === 'edit'){
        startEdit(id);
      }
    });
  });
}

// wire export / clear buttons
q('#exportBtn').addEventListener('click', exportCSV);
q('#clearHistoryBtn').addEventListener('click', function(){ if(confirm('Очистить всю историю?')) clearHistory(); });
// filter handlers
['change','input'].forEach(ev=>{
  q('#filterFrom').addEventListener(ev, renderHistory);
  q('#filterTo').addEventListener(ev, renderHistory);
  q('#filterMonth').addEventListener(ev, handleMonthChange);
});
q('#clearFilterBtn').addEventListener('click', function(){ q('#filterFrom').value=''; q('#filterTo').value=''; q('#filterMonth').value=''; renderHistory(); });
q('#printBtn').addEventListener('click', printVisible);
q('#clearFinalizedBtn').addEventListener('click', clearAllFinalized);

let editingId = null;
let editingType = null; // 'shift' or 'expense'

function handleMonthChange(){
  const v = q('#filterMonth').value;
  if(!v){ q('#filterFrom').value=''; q('#filterTo').value=''; renderHistory(); return; }
  const [y,m] = v.split('-').map(Number);
  const first = new Date(y, m-1, 1).toISOString().slice(0,10);
  const last = new Date(y, m, 0).toISOString().slice(0,10);
  q('#filterFrom').value = first;
  q('#filterTo').value = last;
  renderHistory();
}

function startEdit(id){
  const arr = loadEntries();
  const it = arr.find(x=> x.id === id);
  if(!it) return;
  editingId = id;
  editingType = it.type || 'shift';
  const submitBtn = q('#submitBtn');
  submitBtn.textContent = 'Сохранить';
  q('#cancelEditBtn').style.display = 'inline-block';
  if(editingType === 'expense'){
    // fill expense inputs
    q('#date').value = it.date;
    q('#personalExpense').value = it.expenseAmount || '';
    q('#expenseDesc').value = it.expenseDesc || '';
    // hide shift-specific visual? we keep fields but user can ignore
  } else {
    q('#date').value = it.date;
    q('#machine').value = it.machine || 'kamaz';
    q('#start').value = it.start || '';
    q('#end').value = it.end || '';
    q('#sliv').value = it.sliv || 0;
  }
}

q('#cancelEditBtn').addEventListener('click', function(){
  editingId = null; editingType = null;
  q('#submitBtn').textContent = 'Посчитать';
  q('#cancelEditBtn').style.display = 'none';
  q('#calcForm').reset();
});

function printVisible(){
  const arr = getFilteredEntries();
  if(!arr.length){ alert('Нет данных для печати'); return; }
  const w = window.open('', '_blank');
  const meta = `<div style="font-family:Inter, Arial; color:#111; padding:8px;"><h2>Отчёт</h2></div>`;
  const content = q('#historyList').innerHTML;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Печать</title><style>body{font-family:Inter, Arial; background:#fff; color:#111} .report-row{display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #eee} .total{font-weight:700}</style></head><body>${meta}<div>${content}</div><script>window.print();</script></body></html>`;
  w.document.write(html);
  w.document.close();
}

q('#calcForm').addEventListener('submit', function(e){
  e.preventDefault();
  const date = q('#date').value;
  const machine = q('#machine').value;
  const start = q('#start').value;
  const end = q('#end').value;
  const sliv = Math.max(0, Number(q('#sliv').value || 0));

  // If editing an expense entry, handle separately
  if(editingId && editingType === 'expense'){
    const amount = Math.max(0, Number(q('#personalExpense').value || 0));
    const desc = q('#expenseDesc').value || '';
    if(!date){ alert('Выберите дату.'); return; }
    if(!amount){ alert('Введите сумму больше 0.'); return; }
    const arr = loadEntries();
    const idx = arr.findIndex(x=> x.id === editingId);
    if(idx >= 0){
      arr[idx].date = date;
      arr[idx].expenseAmount = amount;
      arr[idx].expenseDesc = desc;
      arr[idx].periodKey = computePeriodKey(date).key;
      saveEntries(arr);
      editingId = null; editingType = null;
      q('#submitBtn').textContent = 'Посчитать';
      q('#cancelEditBtn').style.display = 'none';
      q('#personalExpense').value=''; q('#expenseDesc').value=''; q('#date').value='';
      renderHistory();
    }
    return;
  }

  if(!date || !start || !end){
    alert('Пожалуйста, заполните дату, время начала и окончания смены.');
    return;
  }

  const workedMinutes = calcMinutes(start,end);
  const standard = 7*60; // 420 minutes
  let overtimeMinutes = Math.max(0, workedMinutes - standard);
  let overtimeHours = 0;
  if(overtimeMinutes>=30){
    overtimeHours = Math.ceil(overtimeMinutes/60);
  }

  const rates = {
    maz: {shift:4200, overtime:500, sliv:1500},
    kamaz:{shift:4000, overtime:500, sliv:1300}
  };
  const r = rates[machine] || rates.kamaz;

  const payShift = r.shift;
  const payOvertime = overtimeHours * r.overtime;
  const paySliv = sliv * r.sliv;
  const total = payShift + payOvertime + paySliv;

  // render report
  q('#reportDate').textContent = new Date(date).toLocaleDateString('ru-RU');
  q('#workedTime').textContent = formatHM(workedMinutes);
  q('#overtime').textContent = `${overtimeHours} ч` + (overtimeMinutes>0 && overtimeHours===0 ? ` (не оплачивается ${overtimeMinutes} мин)` : '');
  q('#payShift').textContent = money(payShift);
  q('#payOvertime').textContent = money(payOvertime);
  q('#paySliv').textContent = money(paySliv);
  q('#total').textContent = money(total);

  q('#reportCard').classList.add('visible');

  if(editingId && editingType === 'shift'){
    const arr = loadEntries();
    const idx = arr.findIndex(x=> x.id === editingId);
    if(idx >= 0){
      arr[idx].date = date;
      arr[idx].machine = machine;
      arr[idx].start = start;
      arr[idx].end = end;
      arr[idx].workedMinutes = workedMinutes;
      arr[idx].overtimeMinutes = overtimeMinutes;
      arr[idx].overtimeHours = overtimeHours;
      arr[idx].payShift = payShift;
      arr[idx].payOvertime = payOvertime;
      arr[idx].paySliv = paySliv;
      arr[idx].sliv = sliv;
      arr[idx].total = total;
      arr[idx].periodKey = computePeriodKey(date).key;
      saveEntries(arr);
      editingId = null; editingType = null;
      q('#submitBtn').textContent = 'Посчитать';
      q('#cancelEditBtn').style.display = 'none';
      q('#calcForm').reset();
      renderHistory();
    }
  } else {
    // save new entry
    const entry = {
      id: String(Date.now()),
      date: date,
      machine: machine,
      start: start,
      end: end,
      workedMinutes: workedMinutes,
      overtimeMinutes: overtimeMinutes,
      overtimeHours: overtimeHours,
      payShift: payShift,
      payOvertime: payOvertime,
      paySliv: paySliv,
      sliv: sliv,
      type: 'shift',
      total: total
    };
    addEntry(entry);
  }
});

// optional: reset report on clear
q('#clearBtn').addEventListener('click', function(){
  q('#calcForm').reset();
  q('#reportCard').classList.remove('visible');
});

// initial render
// migrate old entries then render
migrateEntries();
renderHistory();

function updateOverallTotal(){
  // Use filtered entries so overall reflects selected period/tab or applied filters
  const arr = getFilteredEntries();
  const shiftSum = arr.reduce((s,it)=> s + (it.type === 'expense' ? 0 : Number(it.total || 0)), 0);
  const expenseSum = arr.reduce((s,it)=> s + (it.type === 'expense' ? Number(it.expenseAmount || 0) : 0), 0);
  const net = shiftSum - expenseSum;
  q('#overallTotal').innerHTML = `${money(shiftSum)} <div class="small" style="color:var(--muted);font-weight:400">расходы: ${money(expenseSum)} • чисто: ${money(net)}</div>`;
}

// add personal expense handler
q('#addExpenseBtn').addEventListener('click', function(){
  const date = q('#date').value;
  const amount = Math.max(0, Number(q('#personalExpense').value || 0));
  const desc = q('#expenseDesc').value || '';
  if(!date){ alert('Выберите дату для расхода.'); return; }
  if(!amount){ alert('Введите сумму расхода больше 0.'); return; }
  const entry = {
    id: String(Date.now()),
    date: date,
    type: 'expense',
    expenseAmount: amount,
    expenseDesc: desc,
    total: 0
  };
  addEntry(entry);
  // clear inputs
  q('#personalExpense').value = '';
  q('#expenseDesc').value = '';
});
