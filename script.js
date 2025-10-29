/* =========================================================
   Agenda Soro & EEG — script.js
   ========================================================= */

/* Helpers */
const $  = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
const pad2 = (n) => String(n).padStart(2, '0');
const ymd  = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const parseYMD = (s) => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };

function firstDayOfCalendarMonth(date){
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  const dow = d.getDay();
  const shift = (dow + 6) % 7; // começa na segunda
  d.setDate(d.getDate() - shift);
  return d;
}
function rangeDays(start, count){
  const arr = [];
  const d = new Date(start);
  for (let i=0;i<count;i++){ arr.push(new Date(d)); d.setDate(d.getDate()+1); }
  return arr;
}
function getWeekRange(date){
  const d = new Date(date);
  const dow = d.getDay();
  const shift = (dow + 6) % 7;
  d.setDate(d.getDate() - shift);
  const start = new Date(d);
  d.setDate(d.getDate()+6);
  return { start, end: new Date(d) };
}
function monthKey(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }

/* Config & Estado */
const API_APPTS  = './api/appointments.php';
const API_BLOCKS = './api/blocks.php';
const HOURS = Array.from({length:14}, (_,i) => `${pad2(7+i)}:00`); // 07..20

const WEEKDAYS_MON_FIRST = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const WEEKDAY_LABEL = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

const state = {
  view:  'month',
  type:  'soro',
  cursor: new Date(),
  appts: [],
  blocksByDate: {}
};

/* HTTP */
async function httpGet(url){
  const r = await fetch(url, { credentials:'same-origin' });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`GET ${url} -> ${r.status} (resposta não JSON)`); }
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}: ${json.error||'erro'}`);
  return json;
}
async function httpJSON(method, url, body){
  const r = await fetch(url, {
    method, credentials:'same-origin',
    headers: { 'Content-Type':'application/json' },
    body: body ? JSON.stringify(body) : null
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`${method} ${url} -> ${r.status} (resposta não JSON)`); }
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status}: ${json.error||'erro'}`);
  return json;
}
const httpPost  = (u,b) => httpJSON('POST', u, b);
const httpPut   = (u,b) => httpJSON('PUT',  u, b);
const httpPatch = (u,b) => httpJSON('PATCH',u, b);
async function httpDelete(url){
  const r = await fetch(url, { method:'DELETE', credentials:'same-origin' });
  if (!r.ok) throw new Error(`DELETE ${url} -> ${r.status}`);
  return r.json();
}

/* API: Appointments */
async function fetchAppointmentsForView(){
  const t = state.type;
  if (state.view === 'month'){
    const ym = monthKey(state.cursor);
    return httpGet(`${API_APPTS}?type=${encodeURIComponent(t)}&month=${encodeURIComponent(ym)}`);
  }
  if (state.view === 'week'){
    const {start} = getWeekRange(state.cursor);
    return httpGet(`${API_APPTS}?type=${encodeURIComponent(t)}&week_start=${encodeURIComponent(ymd(start))}`);
  }
  return httpGet(`${API_APPTS}?type=${encodeURIComponent(t)}&date=${encodeURIComponent(ymd(state.cursor))}`);
}
async function createAppointment(a){ return httpPost(API_APPTS, a); }
async function updateAppointmentFull(a){ return httpPut(API_APPTS, a); }
async function deleteAppointment(id){ return httpDelete(`${API_APPTS}?id=${encodeURIComponent(id)}`); }

/* API: Blocks */
async function fetchBlocksByDate(type, dateStr){
  return httpGet(`${API_BLOCKS}?type=${encodeURIComponent(type)}&date=${encodeURIComponent(dateStr)}`);
}
async function createBlock(b){ return httpPost(API_BLOCKS, b); }
async function deleteBlock(id){ return httpDelete(`${API_BLOCKS}?id=${encodeURIComponent(id)}`); }

/* Utils de consulta */
function apptsOn(dateStr){ return state.appts.filter(a => a.date === dateStr); }
function hasBlocksOn(dateStr){ return (state.blocksByDate[dateStr] || []).length > 0; }
function isTimeBlocked(dateStr, timeStr){
  const arr = state.blocksByDate[dateStr] || [];
  return arr.some(b => b.start_time <= timeStr && timeStr <= b.end_time);
}
function apptsInHour(dateStr, hourHH){
  return state.appts
    .filter(a => a.date === dateStr && (a.time||'').slice(0,2) === hourHH)
    .sort((a,b)=> (a.time||'').localeCompare(b.time||''));
}

/* Render */
function setRangeLabel(){
  const el = $('#rangeLabel');
  if (!el) return;
  if (state.view === 'month'){
    el.textContent = state.cursor.toLocaleDateString('pt-BR', { month:'long', year:'numeric' });
  } else if (state.view === 'week'){
    const {start, end} = getWeekRange(state.cursor);
    el.textContent = `${pad2(start.getDate())}/${pad2(start.getMonth()+1)} – ${pad2(end.getDate())}/${pad2(end.getMonth()+1)} ${end.getFullYear()}`;
  } else {
    el.textContent = `${state.cursor.toLocaleDateString('pt-BR', { weekday:'long' })} • ${pad2(state.cursor.getDate())}/${pad2(state.cursor.getMonth()+1)}/${state.cursor.getFullYear()}`;
  }
}
function syncToolbarActive(){
  $$('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.type === state.type));
}

function render(){
  syncToolbarActive();
  setRangeLabel();
  const shell = $('.calendar-shell');
  const side  = $('.side-panel');
  if (state.view === 'month'){
    shell?.classList.remove('no-side');
    side?.classList.remove('hidden');
    renderMonth();
  } else if (state.view === 'week'){
    shell?.classList.add('no-side');
    side?.classList.add('hidden');
    renderWeek();
  } else {
    shell?.classList.add('no-side');
    side?.classList.add('hidden');
    renderDay();
  }
}

/* MÊS */
function renderMonth(){
  const wrap = $('#calendar');
  wrap.innerHTML = `
    <div class="weekdays">
      ${WEEKDAYS_MON_FIRST.map(d=>`<div class="wk">${d}</div>`).join('')}
    </div>
    <div class="grid-month"></div>
  `;
  const grid = $('.grid-month', wrap);

  const start = firstDayOfCalendarMonth(state.cursor);
  const days  = rangeDays(start, 42);

  days.forEach(day => {
    const ds = ymd(day);
    const inMonth = (day.getMonth() === state.cursor.getMonth());
    const apCount = apptsOn(ds).length;
    const hasBlock = hasBlocksOn(ds);

    const cell = document.createElement('div');
    cell.className = 'day-cell' + (inMonth ? '' : ' other') + (apCount ? ' has-appt' : '') + (hasBlock ? ' has-block' : '');
    cell.dataset.date = ds;
    cell.innerHTML = `
      <div class="day-num">${day.getDate()}</div>
      ${hasBlock ? `<div class="block-count" title="Dia com bloqueios">🔒 ${(state.blocksByDate[ds]||[]).length}</div>` : ''}
      ${apCount  ? `<div class="day-count" title="${apCount} agendamento(s)">${apCount}</div>` : ''}
    `;
    cell.addEventListener('click', ()=>{
      state.view = 'day';
      state.cursor = parseYMD(ds);
      refresh(true);
    });
    grid.appendChild(cell);
  });

  renderSideListForSelectedDay();
}

function renderSideListForSelectedDay(){
  const listEl = $('#dayList');
  const title  = $('#sideTitle');
  if (!listEl || !title) return;

  const ds = ymd(state.cursor);
  title.textContent = `Agendamentos de ${ds}`;
  const items = apptsOn(ds).sort((a,b)=> (a.time||'').localeCompare(b.time||''));
  listEl.innerHTML = '';

  if (!items.length){
    listEl.innerHTML = `<li class="appt-item"><div class="row">Sem agendamentos neste dia.</div></li>`;
    return;
  }
  items.forEach(a => {
    const li = document.createElement('li');
    li.className = 'appt-item';
    li.innerHTML = `
      <div class="row">
        <span class="dot ${state.type==='soro'?'soro':'eeg'}"></span>
        <strong>${(a.time||'').slice(0,5)} • ${a.name || a.nome || 'Paciente'}</strong>
        <span class="tag ${a.status==='FEITO'?'done':'ok'}">${(a.status||'').toUpperCase()}</span>
      </div>
      <div class="row" style="color:#555">
        <span>CPF: ${a.cpf||'-'}</span> • <span>Tel: ${a.phone||a.tel||'-'}</span>
      </div>
      <div class="actions">
        <button class="btn small" data-edit="${a.id}">Editar</button>
        <button class="btn small danger" data-del="${a.id}">Excluir</button>
      </div>
    `;
    listEl.appendChild(li);
  });

  $$('[data-edit]', listEl).forEach(b=> b.addEventListener('click', ()=> openEditModal(b.dataset.edit)));
  $$('[data-del]', listEl).forEach(b=> b.addEventListener('click', ()=> handleDeleteAppt(b.dataset.del)));
}

/* SEMANA */
function renderWeek(){
  const wrap = $('#calendar');
  wrap.innerHTML = `<div class="week-list"></div>`;
  const grid = $('.week-list', wrap);

  const { start } = getWeekRange(state.cursor);
  const days = rangeDays(start, 7);

  days.forEach(day=>{
    const ds = ymd(day);
    const col = document.createElement('div');
    col.className = 'week-col';
    col.innerHTML = `
      <h4>
        <span>${WEEKDAY_LABEL[day.getDay()]} • ${pad2(day.getDate())}/${pad2(day.getMonth()+1)}</span>
        ${hasBlocksOn(ds) ? `<span class="badge day-block-flag">Bloqueado</span>` : ''}
      </h4>
      <div class="day-agenda"></div>
    `;
    const list = $('.day-agenda', col);

    HOURS.forEach(hh=>{
      const hourHH = hh.slice(0,2);
      const blocked = isTimeBlocked(ds, hh);
      const items = apptsInHour(ds, hourHH);

      const row = document.createElement('div');
      row.className = 'time-slot' + (blocked ? ' blocked' : '');
      row.innerHTML = `
        <div class="time">${hh}</div>
        <div class="content"></div>
      `;
      const c = $('.content', row);

      if (items.length){
        items.forEach(a=>{
          const chip = document.createElement('div');
          chip.className = 'appt-chip';
          chip.innerHTML = `
            <span class="dot ${state.type==='soro'?'soro':'eeg'}"></span>
            <strong>${(a.time||'').slice(0,5)} • ${a.name || a.nome || 'Paciente'}</strong>
            <span class="tag ${a.status==='FEITO'?'done':'ok'}">${(a.status||'').toUpperCase()}</span>
          `;
          c.appendChild(chip);

          const btn = document.createElement('button');
          btn.className = 'btn small';
          btn.textContent = 'Editar';
          btn.addEventListener('click', ()=> openEditModal(a.id));
          c.appendChild(btn);
        });

        if (!blocked){
          const add = document.createElement('button');
          add.className = 'btn small';
          add.textContent = 'Agendar';
          add.addEventListener('click', ()=> openNewApptModal(ds, hh));
          c.appendChild(add);
        }
      } else if (blocked){
        c.innerHTML = `<span class="badge block">BLOQUEADO</span>`;
      } else {
        const add = document.createElement('button');
        add.className = 'btn small';
        add.textContent = 'Agendar';
        add.addEventListener('click', ()=> openNewApptModal(ds, hh));
        c.appendChild(add);
      }

      list.appendChild(row);
    });

    grid.appendChild(col);
  });
}

/* DIA */
function renderDay(){
  const wrap = $('#calendar');
  wrap.innerHTML = `<div class="day-agenda"></div>`;
  const list = $('.day-agenda', wrap);

  const ds = ymd(state.cursor);
  HOURS.forEach(hh=>{
    const hourHH = hh.slice(0,2);
    const blocked = isTimeBlocked(ds, hh);
    const items = apptsInHour(ds, hourHH);

    const row = document.createElement('div');
    row.className = 'time-slot' + (blocked ? ' blocked' : '');
    row.innerHTML = `
      <div class="time">${hh}</div>
      <div class="content"></div>
    `;
    const c = $('.content', row);

    if (items.length){
      items.forEach(a=>{
        const chip = document.createElement('div');
        chip.className = 'appt-chip';
        chip.innerHTML = `
          <span class="dot ${state.type==='soro'?'soro':'eeg'}"></span>
          <strong>${(a.time||'').slice(0,5)} • ${a.name || a.nome || 'Paciente'}</strong>
          <span class="tag ${a.status==='FEITO'?'done':'ok'}">${(a.status||'').toUpperCase()}</span>
        `;
        c.appendChild(chip);

        const btn = document.createElement('button');
        btn.className = 'btn small';
        btn.textContent = 'Editar';
        btn.addEventListener('click', ()=> openEditModal(a.id));
        c.appendChild(btn);
      });

      if (!blocked){
        const add = document.createElement('button');
        add.className = 'btn small';
        add.textContent = 'Agendar';
        add.addEventListener('click', ()=> openNewApptModal(ds, hh));
        c.appendChild(add);
      }
    } else if (blocked){
      c.innerHTML = `<span class="badge block">BLOQUEADO</span>`;
    } else {
      const add = document.createElement('button');
      add.className = 'btn small';
      add.textContent = 'Agendar';
      add.addEventListener('click', ()=> openNewApptModal(ds, hh));
      c.appendChild(add);
    }

    list.appendChild(row);
  });
}

/* Modais — Agendamento */
const modalBackdrop = $('#modalBackdrop');
const apptForm      = $('#apptForm');

const fldId     = $('#apptId');
const fldDate   = $('#apptDate');
const fldTime   = $('#apptTime');
const fldName   = $('#apptName');
const fldCPF    = $('#apptCPF');
const fldPhone  = $('#apptPhone');
const fldStatus = $('#apptStatus');
const btnDelete = $('#deleteBtn');

function openNewApptModal(dateStr, timeStr){
  $('#modalTitle').textContent = 'Novo Agendamento';
  fldId.value   = '';
  fldDate.value = dateStr || ymd(state.cursor);
  fldTime.value = (timeStr || '').slice(0,5);
  fldName.value = '';
  fldCPF.value  = '';
  fldPhone.value= '';
  fldStatus.value = 'MARCADO';
  btnDelete.style.display = 'none';
  modalBackdrop.classList.remove('hidden');
}
function openEditModal(id){
  const a = state.appts.find(x => String(x.id) === String(id));
  if (!a) return;
  $('#modalTitle').textContent = 'Editar Agendamento';
  fldId.value   = a.id;
  fldDate.value = a.date;
  fldTime.value = (a.time || '').slice(0,5);
  fldName.value = a.name || a.nome || '';
  fldCPF.value  = a.cpf  || '';
  fldPhone.value= a.phone|| a.tel || '';
  fldStatus.value = a.status || 'MARCADO';
  btnDelete.style.display = 'inline-block';
  modalBackdrop.classList.remove('hidden');
}

$('#cancelAppt')?.addEventListener('click', ()=> modalBackdrop.classList.add('hidden'));
btnDelete?.addEventListener('click', async ()=>{
  const id = fldId.value;
  if (!id) return;
  if (!confirm('Excluir este agendamento?')) return;
  await deleteAppointment(id);
  modalBackdrop.classList.add('hidden');
  await refresh(true);
});

apptForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const payload = {
    type:   state.type,
    date:   fldDate.value,
    time:   fldTime.value,
    name:   fldName.value.trim(),
    cpf:    fldCPF.value.trim(),
    phone:  fldPhone.value.trim(),
    status: fldStatus.value
  };
  if (!payload.name) { alert('Informe o nome do paciente.'); return; }
  if (!payload.date || !payload.time) { alert('Informe data e hora.'); return; }

  if (!fldId.value){
    const existsExact = state.appts.some(a => a.date===payload.date && (a.time||'').slice(0,5)===payload.time);
    if (existsExact) { alert('Já existe agendamento neste horário.'); return; }
    if (isTimeBlocked(payload.date, payload.time)) { alert('Horário bloqueado.'); return; }
    await createAppointment(payload);
  } else {
    payload.id = fldId.value;
    const old = state.appts.find(x => String(x.id) === String(payload.id));
    const changed = old && (old.date !== payload.date || (old.time||'').slice(0,5) !== payload.time);
    if (changed){
      const existsExact = state.appts.some(a => a.date===payload.date && (a.time||'').slice(0,5)===payload.time);
      if (existsExact) { alert('Já existe agendamento neste horário.'); return; }
      if (isTimeBlocked(payload.date, payload.time)) { alert('Horário bloqueado.'); return; }
    }
    await updateAppointmentFull(payload);
  }
  modalBackdrop.classList.add('hidden');
  await refresh(true);
});

/* Modais — Bloqueios */
const blockBackdrop = $('#blockBackdrop');
const blockDate   = $('#blockDate');
const blockType   = $('#blockType');
const blockStart  = $('#blockStart');
const blockEnd    = $('#blockEnd');
const blockReason = $('#blockReason');
const blockList   = $('#blockList');

$('#openBlockModal')?.addEventListener('click', ()=>{
  blockDate.value = ymd(state.cursor);
  blockType.value = state.type;
  blockStart.value= '07:00';
  blockEnd.value  = '20:00';
  blockReason.value = '';
  renderBlockListFor(blockDate.value);
  blockBackdrop.classList.remove('hidden');
});
$('#cancelBlock')?.addEventListener('click', ()=> blockBackdrop.classList.add('hidden'));

$('#saveBlock')?.addEventListener('click', async ()=>{
  const payload = {
    type:       blockType.value,
    date:       blockDate.value,
    start_time: blockStart.value,
    end_time:   blockEnd.value,
    reason:     blockReason.value.trim() || undefined
  };
  if (!payload.date || !payload.start_time || !payload.end_time){ alert('Preencha data e intervalo.'); return; }
  if (payload.start_time > payload.end_time){ alert('Intervalo inválido.'); return; }
  await createBlock(payload);
  await refresh(true);
  await renderBlockListFor(blockDate.value);
});

async function renderBlockListFor(dateStr){
  blockList.innerHTML = '<li class="appt-item">Carregando…</li>';
  try{
    const data = await fetchBlocksByDate(state.type, dateStr);
    state.blocksByDate[dateStr] = data;
    if (!data.length){
      blockList.innerHTML = '<li class="appt-item">Sem bloqueios neste dia.</li>';
      return;
    }
    blockList.innerHTML = '';
    data.forEach(b=>{
      const li = document.createElement('li');
      li.className = 'appt-item';
      li.innerHTML = `
        <div class="row">
          <span class="badge block">BLOQUEIO</span>
          <strong>${b.start_time.slice(0,5)} – ${b.end_time.slice(0,5)}</strong>
          ${b.reason ? `<span style="color:#555">• ${b.reason}</span>` : ''}
        </div>
        <div class="actions">
          <button class="btn small danger" data-delblock="${b.id}">Remover</button>
        </div>
      `;
      blockList.appendChild(li);
    });
    $$('[data-delblock]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        if (!confirm('Remover este bloqueio?')) return;
        await deleteBlock(btn.dataset.delblock);
        await refresh(true);
        await renderBlockListFor(dateStr);
      });
    });
  }catch(e){
    blockList.innerHTML = `<li class="appt-item" style="color:#b91c1c">Erro: ${e.message}</li>`;
  }
}

/* Navegação topo */
$('#prevBtn')?.addEventListener('click', async ()=>{
  if (state.view === 'month') state.cursor.setMonth(state.cursor.getMonth()-1);
  if (state.view === 'week')  state.cursor.setDate(state.cursor.getDate()-7);
  if (state.view === 'day')   state.cursor.setDate(state.cursor.getDate()-1);
  await refresh(true);
});
$('#nextBtn')?.addEventListener('click', async ()=>{
  if (state.view === 'month') state.cursor.setMonth(state.cursor.getMonth()+1);
  if (state.view === 'week')  state.cursor.setDate(state.cursor.getDate()+7);
  if (state.view === 'day')   state.cursor.setDate(state.cursor.getDate()+1);
  await refresh(true);
});
$('#todayBtn')?.addEventListener('click', async ()=>{
  state.cursor = new Date();
  await refresh(true);
});
$$('.view-btn').forEach(b => b.addEventListener('click', async ()=>{ state.view = b.dataset.view; await refresh(true); }));
$$('.tab-btn').forEach(b => b.addEventListener('click', async ()=>{ state.type = b.dataset.type; await refresh(true); }));
$('#newApptBtn')?.addEventListener('click', ()=> openNewApptModal(ymd(state.cursor), ''));
$('#logoutBtn')?.addEventListener('click', ()=>{ sessionStorage.removeItem('logado'); sessionStorage.removeItem('usuario'); location.href = 'login.html'; });

/* Refresh */
async function loadBlocksForVisibleDates(){
  let dates = [];
  if (state.view === 'month'){
    const start = firstDayOfCalendarMonth(state.cursor);
    dates = rangeDays(start, 42).map(ymd);
  } else if (state.view === 'week'){
    const {start} = getWeekRange(state.cursor);
    dates = rangeDays(start, 7).map(ymd);
  } else {
    dates = [ ymd(state.cursor) ];
  }
  dates.forEach(d => { state.blocksByDate[d] = state.blocksByDate[d] || []; });
  await Promise.all(dates.map(async d=>{
    try{ state.blocksByDate[d] = await fetchBlocksByDate(state.type, d); }
    catch{ state.blocksByDate[d] = state.blocksByDate[d] || []; }
  }));
}
async function loadDataForCurrentView(){
  const appts = await fetchAppointmentsForView();
  state.appts = (appts||[]).map(a => ({
    id:     a.id,
    type:   a.type || state.type,
    date:   a.date,
    time:   (a.time || ''),
    name:   a.name ?? a.nome ?? '',
    cpf:    a.cpf  ?? '',
    phone:  a.phone ?? a.tel ?? '',
    status: (a.status || 'MARCADO').toUpperCase()
  }));
  await loadBlocksForVisibleDates();
}
async function refresh(force=true){
  if (force) await loadDataForCurrentView();
  render();
}

/* Init */
document.addEventListener('DOMContentLoaded', async ()=>{
  if (sessionStorage.getItem('logado') !== '1'){
    if (!location.pathname.endsWith('login.html')){
      location.href = 'login.html';
      return;
    }
  }
  await refresh(true);
});

/* Excluir rápido (lista lateral) */
async function handleDeleteAppt(id){
  if (!confirm('Excluir este agendamento?')) return;
  await deleteAppointment(id);
  await refresh(true);
}
