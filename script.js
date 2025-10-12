// ================== Util & Estado ==================
const PT_WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PT_MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const state = {
  view: 'month',           // 'month' | 'week' | 'day'
  current: new Date(),     // navegação do calendário
  selectedDate: new Date(),// dia focado (lista lateral)
  type: 'soro',            // 'soro' | 'eeg'
  editingId: null
};

const el = {
  calendar: document.getElementById('calendar'),
  rangeLabel: document.getElementById('rangeLabel'),
  dayList: document.getElementById('dayList'),
  sideTitle: document.getElementById('sideTitle'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  todayBtn: document.getElementById('todayBtn'),
  viewBtns: Array.from(document.querySelectorAll('.view-btn')),
  tabBtns: Array.from(document.querySelectorAll('.tab-btn')),
  newApptBtn: document.getElementById('newApptBtn'),

  // modal
  modalBackdrop: document.getElementById('modalBackdrop'),
  closeModal: document.getElementById('closeModal'),
  apptForm: document.getElementById('apptForm'),
  apptId: document.getElementById('apptId'),
  apptDate: document.getElementById('apptDate'),
  apptTime: document.getElementById('apptTime'),
  apptName: document.getElementById('apptName'),
  apptCPF: document.getElementById('apptCPF'),
  apptPhone: document.getElementById('apptPhone'),
  apptStatus: document.getElementById('apptStatus'),
  deleteBtn: document.getElementById('deleteBtn'),
  modalTitle: document.getElementById('modalTitle'),
  logoutBtn: document.getElementById('logoutBtn'),

  // layout
  shell: document.querySelector('.calendar-shell'),
  sidePanel: document.querySelector('.side-panel')
};

// ========== Máscaras ==========
el.apptCPF?.addEventListener('input', () => el.apptCPF.value = maskCPF(el.apptCPF.value));
el.apptPhone?.addEventListener('input', () => el.apptPhone.value = maskPhone(el.apptPhone.value));

function maskCPF(v){
  return v.replace(/\D/g,'')
    .slice(0,11)
    .replace(/(\d{3})(\d)/,'$1.$2')
    .replace(/(\d{3})(\d)/,'$1.$2')
    .replace(/(\d{3})(\d{1,2})$/,'$1-$2');
}
function maskPhone(v){
  return v.replace(/\D/g,'')
    .slice(0,11)
    .replace(/(\d{2})(\d)/,'($1) $2')
    .replace(/(\d{5})(\d{1,4})$/,'$1-$2');
}

// Normaliza 'HH:MM:SS' -> 'HH:MM'
function hhmm(t){
  if (!t) return t;
  return t.slice(0,5);
}

function startOfWeek(d){
  const x = new Date(d);
  const day = x.getDay();              // 0-6 (dom-sáb)
  const diff = (day + 6) % 7;          // começar na segunda-feira
  x.setDate(x.getDate() - diff);
  x.setHours(0,0,0,0);
  return x;
}
function fmtDateISO(d){ return d.toISOString().slice(0,10); }
function parseDateISO(s){
  const [y,m,dd] = s.split('-').map(Number);
  return new Date(y, m-1, dd);
}

// ================== API ==================
const API = {
  base: 'api/appointments.php', // ajuste se mudar a pasta
  async listByDay(type, dateISO){
    const r = await fetch(`${this.base}?type=${encodeURIComponent(type)}&date=${encodeURIComponent(dateISO)}`);
    if (!r.ok) throw new Error('LIST_DAY');
    return r.json();
  },
  async listByWeek(type, weekStartISO){
    const r = await fetch(`${this.base}?type=${encodeURIComponent(type)}&week_start=${encodeURIComponent(weekStartISO)}`);
    if (!r.ok) throw new Error('LIST_WEEK');
    return r.json();
  },
  async listByMonth(type, year, month){ // month: 1-12
    const ym = `${year}-${String(month).padStart(2,'0')}`;
    const r = await fetch(`${this.base}?type=${encodeURIComponent(type)}&month=${encodeURIComponent(ym)}`);
    if (!r.ok) throw new Error('LIST_MONTH');
    return r.json();
  },
  async create(appt){
    const r = await fetch(this.base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(appt)});
    if (r.status===409) throw new Error('CONFLICT');
    if (!r.ok) throw new Error('CREATE');
    return r.json();
  },
  async update(appt){
    const r = await fetch(this.base,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(appt)});
    if (r.status===409) throw new Error('CONFLICT');
    if (!r.ok) throw new Error('UPDATE');
    return r.json();
  },
  async remove(id){
    const r = await fetch(`${this.base}?id=${id}`,{method:'DELETE'});
    if (!r.ok) throw new Error('DELETE');
    return r.json();
  },
};

// ================== Cache mensal (para visão Mês) ==================
const monthCache = new Map(); // key: `${type}-${yyyy}-${mm}` -> rows array

function cacheKeyForMonth(type, d){
  return `${type}-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
async function getMonthData(type, d){
  const key = cacheKeyForMonth(type, d);
  if (monthCache.has(key)) return monthCache.get(key);
  const arr = await API.listByMonth(type, d.getFullYear(), d.getMonth()+1);
  monthCache.set(key, arr);
  return arr;
}

// ======== Funções de dados (assíncronas) ========
async function listByTypeDay(date){
  const iso = fmtDateISO(date);
  return API.listByDay(state.type, iso); // retorna ordenado
}
async function listByTypeWeek(date){
  const start = startOfWeek(date);
  const iso = fmtDateISO(start);
  return API.listByWeek(state.type, iso); // retorna ordenado
}
async function countByDayInMonth(d){
  const rows = await getMonthData(state.type, d);
  const counts = new Map(); // 'YYYY-MM-DD' -> count
  rows.forEach(a => {
    counts.set(a.date, (counts.get(a.date)||0) + 1);
  });
  return counts;
}

// CRUD
async function addOrUpdate(appt){
  if (appt.id) await API.update(appt);
  else {
    const res = await API.create(appt);
    appt.id = res.id;
  }
  monthCache.clear(); // invalida cache mensal
}
async function removeById(id){
  await API.remove(id);
  monthCache.clear();
}

// ================== Render ==================
async function render(){
  renderHeader();
  if (state.view === 'month') await renderMonth();
  if (state.view === 'week')  await renderWeek();
  if (state.view === 'day')   await renderDay();

  toggleSidePanel();              // painel lateral só no mês
  if (state.view === 'month') await renderSideList();
}

function renderHeader(){
  const d = state.current;
  if (state.view === 'month'){
    el.rangeLabel.textContent = `${PT_MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
  } else if (state.view === 'week'){
    const s = startOfWeek(d);
    const e = new Date(s); e.setDate(s.getDate()+6);
    el.rangeLabel.textContent = `${s.getDate()} ${PT_MONTHS[s.getMonth()].slice(0,3)} — ${e.getDate()} ${PT_MONTHS[e.getMonth()].slice(0,3)} ${e.getFullYear()}`;
  } else {
    el.rangeLabel.textContent = `${state.selectedDate.getDate()} ${PT_MONTHS[state.selectedDate.getMonth()]} ${state.selectedDate.getFullYear()}`;
  }
}

function statusTagClass(status){
  if (status === 'FEITO') return 'done';
  if (status === 'CONFIRMADO') return 'ok';
  return 'warn'; // MARCADO
}

// ================== Mostrar / esconder painel lateral ==================
function toggleSidePanel(){
  const show = (state.view === 'month');
  if (show){
    el.sidePanel.classList.remove('hidden');
    el.shell.classList.remove('no-side');
  } else {
    el.sidePanel.classList.add('hidden');
    el.shell.classList.add('no-side');
  }
}

// ================== Renders por visão ==================
async function renderMonth(){
  const c = el.calendar;
  c.innerHTML = '';

  // cabeçalho dos dias da semana
  const w = document.createElement('div');
  w.className = 'weekdays';
  PT_WEEKDAYS.forEach(d=>{
    const s = document.createElement('div');
    s.textContent = d;
    w.appendChild(s);
  });
  c.appendChild(w);

  const grid = document.createElement('div');
  grid.className = 'grid-month';

  const first = new Date(state.current.getFullYear(), state.current.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // segunda=0
  const start = new Date(first);
  start.setDate(first.getDate() - offset);

  // pega a contagem do mês atual de uma vez
  const monthCounts = await countByDayInMonth(state.current);

  for (let i=0; i<42; i++){
    const d = new Date(start);
    d.setDate(start.getDate() + i);

    const cell = document.createElement('div');
    cell.className = 'day-cell' + (d.getMonth()!==state.current.getMonth() ? ' other':'');
    const num = document.createElement('div');
    num.className = 'day-num';
    num.textContent = d.getDate();
    cell.appendChild(num);

    const count = monthCounts.get(fmtDateISO(d)) || 0;
    if (count > 0){
      cell.classList.add('has-appt', state.type === 'soro' ? 'soro' : 'eeg');
      const badge = document.createElement('span');
      badge.className = 'day-count';
      badge.textContent = count;
      cell.appendChild(badge);
    }

    // clique para abrir novo agendamento já com a data
    cell.addEventListener('click', ()=>{
      state.selectedDate = d;
      openModal({
        id:null, type:state.type, date:fmtDateISO(d), time:'08:00',
        name:'', cpf:'', phone:'', status:'MARCADO'
      });
    });

    grid.appendChild(cell);
  }
  c.appendChild(grid);
}

async function renderWeek(){
  const c = el.calendar;
  c.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'week-list';

  const s = startOfWeek(state.current);
  const weekRows = await listByTypeWeek(state.current); // todos da semana (tipo atual)

  for (let i=0;i<7;i++){
    const d = new Date(s); d.setDate(s.getDate()+i);
    const col = document.createElement('div');
    col.className = 'week-col';
    const h4 = document.createElement('h4');
    h4.textContent = `${PT_WEEKDAYS[d.getDay()]} • ${d.getDate()}/${String(d.getMonth()+1).padStart(2,'0')}`;
    col.appendChild(h4);

    const items = weekRows.filter(a => a.date === fmtDateISO(d));
    if (items.length===0){
      const empty = document.createElement('div');
      empty.className = 'badge';
      empty.textContent = 'Sem agendamentos';
      col.appendChild(empty);
    } else {
      items.forEach(a=>{
        const it = document.createElement('div');
        it.className = 'appt-item';
        it.innerHTML = `
          <div class="row">
            <span class="badge ${a.type==='soro'?'soro':'eeg'}">${hhmm(a.time)}</span>
            <span>${a.name}</span>
            <span class="tag ${statusTagClass(a.status)}">${a.status}</span>
          </div>
          <div class="row"><small>CPF: ${a.cpf} • Tel: ${a.phone}</small></div>
          <div class="actions">
            <button class="btn small ghost" data-act="edit">Editar</button>
          </div>
        `;
        it.querySelector('[data-act="edit"]').addEventListener('click',()=>openModal(a));
        col.appendChild(it);
      });
    }

    // Duplo clique no dia cria novo rapidamente
    col.addEventListener('dblclick', ()=>{
      state.selectedDate = d;
      openModal({id:null, type:state.type, date:fmtDateISO(d), time:'08:00', name:'', cpf:'', phone:'', status:'MARCADO'});
    });

    wrap.appendChild(col);
  }
  c.appendChild(wrap);
}

async function renderDay(){
  const c = el.calendar;
  c.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'day-agenda';

  const dayRows = await listByTypeDay(state.selectedDate);

  // Slots por hora 07-20
  for (let h=7; h<=20; h++){
    const slot = document.createElement('div');
    slot.className = 'time-slot';
    const hh = String(h).padStart(2,'0') + ':00';
    const left = document.createElement('span');
    left.textContent = hh;
    slot.appendChild(left);

    // itens do horário (normaliza HH:MM:SS -> HH:MM)
    const items = dayRows.filter(a=>hhmm(a.time) === hh);

    // lado direito (botão Agendar só se estiver livre)
    const right = document.createElement('div');
    right.style.display='flex'; right.style.gap='.4rem';
    if (items.length === 0) {
      const btn = document.createElement('button');
      btn.className = 'btn small ghost';
      btn.textContent = 'Agendar';
      btn.addEventListener('click', ()=>{
        openModal({id:null, type:state.type, date:fmtDateISO(state.selectedDate), time:hh, name:'', cpf:'', phone:'', status:'MARCADO'});
      });
      right.appendChild(btn);
    }
    slot.appendChild(right);

    // renderiza os agendamentos (se houver)
    if (items.length){
      const group = document.createElement('div');
      group.style.display='flex'; group.style.flexDirection='column'; group.style.gap='.3rem'; group.style.marginTop='.4rem';
      items.forEach(a=>{
        const it = document.createElement('div');
        it.className = 'appt-chip';
        it.innerHTML = `
          <span class="dot ${a.type==='soro'?'soro':'eeg'}"></span>
          <span>${a.name}</span>
          <span class="tag ${statusTagClass(a.status)}">${a.status}</span>
          <button class="btn small ghost" data-act="edit" style="margin-left:.4rem">Editar</button>
        `;
        it.querySelector('[data-act="edit"]').addEventListener('click', (e)=>{ e.stopPropagation(); openModal(a); });
        it.addEventListener('click', ()=>openModal(a));
        group.appendChild(it);
      });
      slot.appendChild(group);
    }

    wrap.appendChild(slot);
  }

  c.appendChild(wrap);
}

async function renderSideList(){
  el.sideTitle.textContent = `Agendamentos de ${state.selectedDate.toLocaleDateString('pt-BR')}`;
  el.dayList.innerHTML = '';
  const rows = await listByTypeDay(state.selectedDate);
  rows.forEach(a=>{
    const li = document.createElement('li');
    li.className = 'appt-item';
    li.innerHTML = `
      <div class="row">
        <strong>${hhmm(a.time)}</strong>
        <span class="tag ${statusTagClass(a.status)}">${a.status}</span>
      </div>
      <div class="row">${a.name}</div>
      <div class="row"><small>CPF: ${a.cpf} • Tel: ${a.phone}</small></div>
      <div class="actions">
        <button class="btn small ghost" data-act="edit">Editar</button>
      </div>
    `;
    li.querySelector('[data-act="edit"]').addEventListener('click',()=>openModal(a));
    el.dayList.appendChild(li);
  });
}

// ================== Modal ==================
function openModal(a){
  el.modalBackdrop.classList.remove('hidden');
  el.modalTitle.textContent = a.id ? 'Editar Agendamento' : 'Novo Agendamento';
  el.apptId.value = a.id || '';
  el.apptDate.value = a.date || fmtDateISO(new Date());
  el.apptTime.value = hhmm(a.time || '08:00');
  el.apptName.value = a.name || '';
  el.apptCPF.value = a.cpf || '';
  el.apptPhone.value = a.phone || '';
  el.apptStatus.value = a.status || 'MARCADO';
  state.editingId = a.id || null;

  if (a.id){
    el.deleteBtn.classList.remove('hidden');
    el.deleteBtn.onclick = async ()=>{ 
      await removeById(a.id); 
      closeModal(); 
      await render(); 
    };
  } else {
    el.deleteBtn.classList.add('hidden');
    el.deleteBtn.onclick=null;
  }
}
function closeModal(){
  el.modalBackdrop.classList.add('hidden');
  state.editingId = null;
}

el.closeModal.addEventListener('click', closeModal);
el.modalBackdrop.addEventListener('click', (e)=>{ if(e.target===el.modalBackdrop) closeModal(); });

el.apptForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const payload = {
    id: el.apptId.value || null,
    type: state.type,
    date: el.apptDate.value,
    time: el.apptTime.value, // 'HH:MM' (MySQL aceita, converte para TIME)
    name: el.apptName.value.trim(),
    cpf: el.apptCPF.value.trim(),
    phone: el.apptPhone.value.trim(),
    status: el.apptStatus.value
  };

  if (!payload.name){ alert('Informe o nome.'); return; }
  if (!/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(payload.cpf)){ alert('CPF inválido.'); return; }
  if (!/^\(\d{2}\)\s\d{5}-\d{4}$/.test(payload.phone)){ alert('Telefone inválido.'); return; }

  try{
    await addOrUpdate(payload);
  }catch(e){
    if (e.message==='CONFLICT'){
      alert('Já existe um agendamento para este TIPO, DATA e HORÁRIO.');
      return;
    }
    alert('Erro ao salvar.');
    return;
  }

  closeModal();
  state.selectedDate = parseDateISO(payload.date);
  await render();
});

// ================== Navegação & View ==================
el.prevBtn?.addEventListener('click', async ()=>{
  if (state.view==='month'){ state.current.setMonth(state.current.getMonth()-1); }
  else if (state.view==='week'){ state.current.setDate(state.current.getDate()-7); state.selectedDate = new Date(state.current); }
  else { state.selectedDate.setDate(state.selectedDate.getDate()-1); state.current = new Date(state.selectedDate); }
  await render();
});
el.nextBtn?.addEventListener('click', async ()=>{
  if (state.view==='month'){ state.current.setMonth(state.current.getMonth()+1); }
  else if (state.view==='week'){ state.current.setDate(state.current.getDate()+7); state.selectedDate = new Date(state.current); }
  else { state.selectedDate.setDate(state.selectedDate.getDate()+1); state.current = new Date(state.selectedDate); }
  await render();
});
el.todayBtn?.addEventListener('click', async ()=>{
  state.current = new Date();
  state.selectedDate = new Date();
  await render();
});
el.viewBtns.forEach(b=>{
  b.addEventListener('click', async ()=>{
    el.viewBtns.forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    state.view = b.dataset.view;
    await render();
  });
});
el.tabBtns.forEach(b=>{
  b.addEventListener('click', async ()=>{
    el.tabBtns.forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    state.type = b.dataset.type; // soro | eeg
    await render();
  });
});
el.newApptBtn?.addEventListener('click', ()=>{
  openModal({id:null, type:state.type, date:fmtDateISO(state.selectedDate), time:'08:00', name:'', cpf:'', phone:'', status:'MARCADO'});
});
el.logoutBtn?.addEventListener('click', ()=>{
  sessionStorage.removeItem('logado');
  window.location.href = 'login.html';
});

// ================== Boot ==================
(async function boot(){
  // força o login antes de renderizar a agenda:
  if (sessionStorage.getItem('logado') !== '1') {
    window.location.href = 'login.html';
    return;
  }
  state.current.setHours(0,0,0,0);
  state.selectedDate.setHours(0,0,0,0);
  await render();
})();

