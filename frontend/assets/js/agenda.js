import { api } from './api.js';

(function () {
  const state = {
    items: [],
    currentView: 'day',
    currentDate: new Date(),
    filters: { search: '', status: '', service: '', staff: '' },
    editing: null
  };

  const viewContainer = document.getElementById('agenda-view');
  const currentPeriodEl = document.getElementById('current-period');
  const modal = document.getElementById('appointment-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalSubtitle = document.getElementById('modal-subtitle');
  const modalContent = document.getElementById('modal-content');

  function pad(value) { return String(value).padStart(2, '0'); }
  function dateToYMD(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
  function addDays(date, days) { const cloned = new Date(date); cloned.setDate(cloned.getDate() + days); return cloned; }
  function getWeekDates(baseDate) { const date = new Date(baseDate); const day = date.getDay(); const diff = day === 0 ? -6 : 1 - day; const monday = addDays(date, diff); return Array.from({ length: 7 }, (_, i) => addDays(monday, i)); }
  function fmtDay(date) { return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }); }
  function fmtMonth(date) { return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); }
  function labelStatus(status) { return ({ confirmado: 'Confirmado', pendente: 'Pendente', checkin: 'Check-in', concluido: 'Concluído' })[status] || status; }

  function filteredItems() {
    return state.items.filter((item) => {
      const blob = `${item.pet} ${item.tutor} ${item.phone} ${item.service}`.toLowerCase();
      if (state.filters.search && !blob.includes(state.filters.search.toLowerCase())) return false;
      if (state.filters.status && item.status !== state.filters.status) return false;
      if (state.filters.service && item.service !== state.filters.service) return false;
      if (state.filters.staff && item.staff !== state.filters.staff) return false;
      return true;
    });
  }

  async function loadAgenda() {
    const data = await api.get('/api/tenant/manage/agenda');
    state.items = (data.items || []).map((item) => ({ ...item, id: String(item.id) }));
    const services = [...new Set(state.items.map((item) => item.service).filter(Boolean))];
    const staffs = [...new Set(state.items.map((item) => item.staff).filter(Boolean))];
    document.getElementById('filter-service').innerHTML = '<option value="">Todos serviços</option>' + services.map((value) => `<option value="${value}">${value}</option>`).join('');
    document.getElementById('filter-staff').innerHTML = '<option value="">Todos colaboradores</option>' + staffs.map((value) => `<option value="${value}">${value}</option>`).join('');
    render();
  }

  function renderCurrentPeriod() {
    if (state.currentView === 'day') currentPeriodEl.textContent = fmtDay(state.currentDate);
    else if (state.currentView === 'week') {
      const week = getWeekDates(state.currentDate);
      currentPeriodEl.textContent = `${week[0].toLocaleDateString('pt-BR')} - ${week[6].toLocaleDateString('pt-BR')}`;
    } else if (state.currentView === 'month') currentPeriodEl.textContent = fmtMonth(state.currentDate);
    else currentPeriodEl.textContent = 'Visualização em cards';
  }

  function appointmentBlock(item) {
    const initials1 = (item.pet || 'P').slice(0,1).toUpperCase();
    const initials2 = (item.tutor || 'T').slice(0,1).toUpperCase();
    return `<div class="appointment-block status-${item.status}" draggable="true" data-id="${item.id}"><div class="appointment-top"><div class="avatar-stack"><div class="appointment-avatar" style="display:flex;align-items:center;justify-content:center;background:#d1fae5;color:#065f46">${initials1}</div><div class="appointment-avatar" style="display:flex;align-items:center;justify-content:center;background:#e0e7ff;color:#3730a3">${initials2}</div></div><div><div class="appointment-title">${item.pet}</div><div class="appointment-meta">${item.service} · ${item.staff || 'Equipe'}</div></div></div><div class="appointment-actions"><button class="icon-action" data-open-id="${item.id}">👁</button><button class="icon-action" data-edit-id="${item.id}">✏</button><button class="icon-action" data-delete-id="${item.id}">🗑</button></div></div>`;
  }

  function renderDayView() {
    const selectedDate = dateToYMD(state.currentDate);
    const filtered = filteredItems().filter((item) => item.date === selectedDate);
    const hours = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];
    let grid = `<div class="timeline-shell"><div class="timeline-header" style="--days-count:1"><div class="timeline-header-cell">Hora</div><div class="timeline-header-cell">${fmtDay(state.currentDate)}</div></div><div class="timeline-grid" style="--days-count:1">`;
    hours.forEach((hour) => {
      const event = filtered.find((item) => item.hour === hour);
      grid += `<div class="timeline-time">${hour}</div><div class="timeline-slot" data-date="${selectedDate}" data-hour="${hour}">${event ? appointmentBlock(event) : ''}</div>`;
    });
    grid += '</div></div>';
    viewContainer.innerHTML = grid;
    bindInteractions();
  }

  function renderWeekView() {
    const weekDates = getWeekDates(state.currentDate); const filtered = filteredItems(); const hours = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];
    let html = `<div class="timeline-shell"><div class="timeline-header" style="--days-count:7"><div class="timeline-header-cell">Hora</div>${weekDates.map((date)=>`<div class="timeline-header-cell">${date.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit'})}</div>`).join('')}</div><div class="timeline-grid" style="--days-count:7">`;
    hours.forEach((hour) => {
      html += `<div class="timeline-time">${hour}</div>`;
      weekDates.forEach((date) => {
        const ymd = dateToYMD(date); const event = filtered.find((item) => item.date === ymd && item.hour === hour);
        html += `<div class="timeline-slot" data-date="${ymd}" data-hour="${hour}">${event ? appointmentBlock(event) : ''}</div>`;
      });
    });
    html += '</div></div>';
    viewContainer.innerHTML = html;
    bindInteractions();
  }

  function renderMonthView() {
    const first = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1); const offset = (first.getDay() || 7) - 1; const start = addDays(first, -offset); const filtered = filteredItems();
    let html = `<div class="month-view"><div class="month-header">${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map((d)=>`<div class="month-header-cell">${d}</div>`).join('')}</div><div class="month-grid">`;
    for (let i=0;i<35;i++) { const date = addDays(start, i); const ymd = dateToYMD(date); const items = filtered.filter((item) => item.date === ymd).slice(0,3); html += `<div class="month-day"><div class="month-day-number">${date.getDate()}</div>${items.map((item)=>`<div class="month-mini-card" data-open-id="${item.id}"><strong>${item.hour}</strong> · ${item.pet}</div>`).join('')}</div>`; }
    html += '</div></div>'; viewContainer.innerHTML = html; bindInteractions();
  }

  function renderCardsView() {
    const filtered = filteredItems();
    viewContainer.innerHTML = `<div class="cards-view">${filtered.map((item) => `<div class="appointment-card" data-open-id="${item.id}"><div class="card-row"><div class="pet-avatar" style="display:flex;align-items:center;justify-content:center;background:#d1fae5;color:#065f46">${(item.pet||'P')[0]}</div><div><div class="card-title">${item.pet}</div><div class="card-subtitle">${item.service}</div></div></div><div class="card-meta"><div>${item.tutor}</div><div>📅 ${item.date} · ${item.hour}</div><div>👩‍💼 ${item.staff || 'Equipe'}</div><div><span class="status-pill ${item.status}">${labelStatus(item.status)}</span></div></div><div class="card-actions"><button class="action-btn" data-edit-id="${item.id}">Editar</button><button class="action-btn" data-delete-id="${item.id}">Excluir</button><button class="action-btn" data-open-id="${item.id}">Ver</button></div></div>`).join('')}</div>`;
    bindInteractions();
  }

  function render() { renderCurrentPeriod(); if (state.currentView === 'day') renderDayView(); else if (state.currentView === 'week') renderWeekView(); else if (state.currentView === 'month') renderMonthView(); else renderCardsView(); }

  function fillModal(item) {
    modalTitle.textContent = `${item.pet} · ${item.service}`;
    modalSubtitle.textContent = `${item.date} às ${item.hour} · ${item.unit || 'Unidade Centro'}`;
    modalContent.innerHTML = `<div class="detail-grid"><div class="detail-box"><h4>Tutor</h4><div class="detail-line"><strong>Nome:</strong> ${item.tutor}</div><div class="detail-line"><strong>Telefone:</strong> ${item.phone || '—'}</div></div><div class="detail-box"><h4>Atendimento</h4><div class="detail-line"><strong>Serviço:</strong> ${item.service}</div><div class="detail-line"><strong>Colaborador:</strong> ${item.staff || 'Equipe'}</div><div class="detail-line"><strong>Status:</strong> ${labelStatus(item.status)}</div></div><div class="detail-box"><h4>Pet</h4><div class="detail-line"><strong>Nome:</strong> ${item.pet}</div><div class="detail-line"><strong>Raça:</strong> ${item.breed || '—'}</div><div class="detail-line"><strong>Porte:</strong> ${item.size || '—'}</div></div><div class="detail-box"><h4>Observações</h4><div class="detail-line">${item.notes || 'Sem observações.'}</div></div></div>`;
    document.getElementById('modal-edit-btn').onclick = () => editAppointment(item.id);
    document.getElementById('modal-delete-btn').onclick = () => deleteAppointment(item.id);
    document.getElementById('modal-checkin-btn').onclick = async () => { await api.patch(`/api/tenant/manage/agenda/${item.id}/checkin`, {}); closeModal(); await loadAgenda(); };
  }

  function closeModal() { modal.style.display = 'none'; }
  function openAppointment(id) { const found = state.items.find((item) => item.id === String(id)); if (!found) return; fillModal(found); modal.style.display = 'flex'; }

  async function editAppointment(id) {
    const found = state.items.find((item) => item.id === String(id)); if (!found) return;
    const tutor = prompt('Tutor', found.tutor); if (tutor === null) return;
    const pet = prompt('Pet', found.pet); if (pet === null) return;
    const service = prompt('Serviço', found.service); if (service === null) return;
    const staff = prompt('Colaborador', found.staff || ''); if (staff === null) return;
    await api.put(`/api/tenant/manage/agenda/${id}`, { tutor_name: tutor, pet_name: pet, service_name: service, staff_name: staff, phone: found.phone, scheduled_at: `${found.date}T${found.hour}`, status: found.status, notes: found.notes, breed: found.breed, size: found.size, unit_name: found.unit });
    closeModal(); await loadAgenda();
  }

  async function deleteAppointment(id) {
    if (!confirm('Deseja excluir este agendamento?')) return;
    await api.delete(`/api/tenant/manage/agenda/${id}`); closeModal(); await loadAgenda();
  }

  function bindInteractions() {
    document.querySelectorAll('[data-open-id]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); openAppointment(el.dataset.openId); }));
    document.querySelectorAll('[data-edit-id]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); editAppointment(el.dataset.editId); }));
    document.querySelectorAll('[data-delete-id]').forEach((el) => el.addEventListener('click', async (e) => { e.stopPropagation(); await deleteAppointment(el.dataset.deleteId); }));
    document.querySelectorAll('.appointment-card[data-open-id]').forEach((card) => card.addEventListener('click', () => openAppointment(card.dataset.openId)));
    document.querySelectorAll('.appointment-block').forEach((block) => block.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', block.dataset.id)));
    document.querySelectorAll('.timeline-slot').forEach((slot) => {
      slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('drop-hover'); });
      slot.addEventListener('dragleave', () => slot.classList.remove('drop-hover'));
      slot.addEventListener('drop', async (e) => {
        e.preventDefault(); slot.classList.remove('drop-hover'); const id = e.dataTransfer.getData('text/plain');
        await api.patch(`/api/tenant/manage/agenda/${id}/move`, { scheduled_at: `${slot.dataset.date}T${slot.dataset.hour}` });
        await loadAgenda();
      });
    });
  }

  document.querySelectorAll('.view-btn').forEach((btn) => btn.addEventListener('click', () => { document.querySelectorAll('.view-btn').forEach((b) => b.classList.remove('active')); btn.classList.add('active'); state.currentView = btn.dataset.view; render(); }));
  document.getElementById('search-input').addEventListener('input', (e) => { state.filters.search = e.target.value; render(); });
  document.getElementById('filter-status').addEventListener('change', (e) => { state.filters.status = e.target.value; render(); });
  document.getElementById('filter-service').addEventListener('change', (e) => { state.filters.service = e.target.value; render(); });
  document.getElementById('filter-staff').addEventListener('change', (e) => { state.filters.staff = e.target.value; render(); });
  document.getElementById('prev-period').addEventListener('click', () => { if (state.currentView === 'day') state.currentDate = addDays(state.currentDate, -1); else if (state.currentView === 'week') state.currentDate = addDays(state.currentDate, -7); else if (state.currentView === 'month') state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth()-1, 1); render(); });
  document.getElementById('next-period').addEventListener('click', () => { if (state.currentView === 'day') state.currentDate = addDays(state.currentDate, 1); else if (state.currentView === 'week') state.currentDate = addDays(state.currentDate, 7); else if (state.currentView === 'month') state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth()+1, 1); render(); });
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.getElementById('btn-new-appointment').addEventListener('click', async () => {
    const tutor = prompt('Tutor'); if (!tutor) return;
    const pet = prompt('Pet'); if (!pet) return;
    const service = prompt('Serviço'); if (!service) return;
    const when = prompt('Data e hora (YYYY-MM-DDTHH:MM)', `${dateToYMD(new Date())}T09:00`); if (!when) return;
    await api.post('/api/tenant/manage/agenda', { tutor_name: tutor, pet_name: pet, service_name: service, scheduled_at: when, status: 'pendente' });
    await loadAgenda();
  });

  loadAgenda();
})();
