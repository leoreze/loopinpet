import { api } from './api.js';

(function () {
  const state = {
    items: [],
    currentView: 'day',
    currentDate: new Date(),
    filters: { search: '', status: '', staff: '' },
    meta: { session_statuses: [], collaborators: [], services: [], pets: [], tutors: [] },
    operatingHours: [],
    tutorPets: [],
    editing: null
  };

  const el = (id) => document.getElementById(id);
  const viewContainer = el('agenda-view');
  const summaryContainer = el('agenda-summary');
  const flowContainer = el('session-flow');
  const modal = el('appointment-modal');
  const form = el('appointment-form');
  const detailsView = el('appointment-details');
  const modalTitle = el('modal-title');
  const modalSubtitle = el('modal-subtitle');
  const commandSummary = el('appointment-command-summary');
  const statusFilter = el('filter-status');
  const staffFilter = el('filter-staff');
  const appointmentStatus = el('appointment-status');
  const appointmentStaff = el('appointment-staff');
  const petRows = el('pet-rows');
  const serviceRows = el('service-rows');
  const tutorIdInput = el('appointment-tutor-id');
  const whatsappInput = el('appointment-whatsapp');
  const clientNameInput = el('appointment-client-name');
  const dateInput = el('appointment-date');
  const timeInput = el('appointment-time');
  const notesInput = el('appointment-notes');
  const paymentStatusInput = el('appointment-payment-status');
  const paymentMethodInput = el('appointment-payment-method');
  const feedback = el('customer-lookup-feedback');
  const formAlert = el('appointment-form-alert');
  const petTemplate = el('pet-row-template');
  const serviceTemplate = el('service-row-template');
  const saveBtn = el('modal-save-btn');
  const deleteBtn = el('modal-delete-btn');
  const checkinBtn = el('modal-checkin-btn');
  const printBtn = el('btn-print-receipt');

  function normalize(value = '') {
    return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }
  function money(cents) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100); }
  function dateToYMD(date) { return new Date(date).toISOString().slice(0, 10); }
  function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
  function labelStatus(code) {
    const found = state.meta.session_statuses.find((item) => normalize(item.name) === normalize(code) || normalize(item.code) === normalize(code));
    return found?.name || String(code || '').replace(/_/g, ' ');
  }
  function statusColor(code) {
    const found = state.meta.session_statuses.find((item) => normalize(item.name) === normalize(code) || normalize(item.code) === normalize(code));
    return found?.color || '#8F8866';
  }
  function currentSlotString() { return `${dateInput.value || dateToYMD(new Date())}T${timeInput.value || '09:00'}`; }


  function showFormAlert(message, type = 'error') {
    if (!formAlert) return;
    formAlert.hidden = false;
    formAlert.className = `agenda-form-alert is-${type}`;
    formAlert.textContent = message;
  }

  function clearFormAlert() {
    if (!formAlert) return;
    formAlert.hidden = true;
    formAlert.className = 'agenda-form-alert';
    formAlert.textContent = '';
  }

  function applyPhoneMask(value = '') {
    const digits = String(value || '').replace(/\D+/g, '').slice(0, 11);
    if (!digits) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 11) {
      const middle = digits.length === 11 ? digits.slice(2, 7) : digits.slice(2, 6);
      const end = digits.length === 11 ? digits.slice(7, 11) : digits.slice(6, 10);
      return `(${digits.slice(0, 2)}) ${middle}${end ? '-' + end : ''}`;
    }
    return digits;
  }

  function focusFirstInvalidField() {
    const invalid = form?.querySelector(':invalid');
    if (invalid) invalid.focus();
  }

  function findPetById(petId) {
    return (state.tutorPets.length ? state.tutorPets : state.meta.pets || []).find((pet) => String(pet.id) === String(petId));
  }

  function avatarMarkupForPet(pet) {
    if (pet?.photo_url) return `<span class="pet-avatar-image"><img src="${pet.photo_url}" alt="${pet.name || 'Pet'}"></span>`;
    return `<span class="appointment-avatar-fallback">${String((pet?.name || 'Pet')).slice(0,2).toUpperCase()}</span>`;
  }

  function appointmentAvatarMarkup(item) {
    const pets = (item.pets?.length ? item.pets : []).map((pet) => findPetById(pet.id) || pet).filter(Boolean);
    if (!pets.length && item.pet_id) {
      const pet = findPetById(item.pet_id) || { id: item.pet_id, name: item.pet };
      pets.push(pet);
    }
    return pets.slice(0, 2).map(avatarMarkupForPet).join('') || `<span class="appointment-avatar-fallback">${String((item.pet || 'Pet')).slice(0,2).toUpperCase()}</span>`;
  }

  function paymentLabel(status, method) {
    const statusLabel = normalize(status) === 'pago' ? 'Pago' : 'Pendente';
    const methodMap = { pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito', transferencia: 'Transferência' };
    return method ? `${statusLabel} • ${methodMap[method] || method}` : statusLabel;
  }

  function friendlyErrorMessage(error, fallback = 'Não foi possível concluir a ação.') {
    const message = String(error?.message || fallback || '').trim();
    if (!message) return fallback;
    if (message.includes('horário de funcionamento')) return 'Esse horário está fora do horário de funcionamento configurado. Ajuste a data ou a hora e tente novamente.';
    if (message.includes('slot máximo')) return 'Esse horário já atingiu o limite de agendamentos por hora configurado para o sistema.';
    if (message.includes('Configure o horário de funcionamento')) return 'Antes de agendar, configure o horário de funcionamento da empresa.';
    if (message.includes('Data do agendamento inválida')) return 'Informe uma data e um horário válidos para o agendamento.';
    if (message.includes('Cliente não encontrado')) return 'Cliente não encontrado. Cadastre o cliente antes de continuar.';
    if (message.includes('conflito de tipos')) return 'O agendamento não pôde ser atualizado por um conflito interno. Reabra o modal e tente novamente.';
    if (message.includes('Informe WhatsApp')) return 'Preencha WhatsApp, cliente, pets, serviços, data e hora para salvar.';
    return message;
  }

  function withFriendlyError(error, fallback) {
    const message = friendlyErrorMessage(error, fallback);
    showFormAlert(message);
    return message;
  }

  async function loadMeta() {
    const [meta, users, operatingHoursResponse] = await Promise.all([
      api.get('/api/tenant/manage/meta'),
      api.get('/api/tenant/manage/users'),
      api.get('/api/tenant/operating-hours').catch(() => ({ items: [] }))
    ]);
    state.meta = {
      ...meta,
      collaborators: (meta.collaborators?.length ? meta.collaborators : users.items || []).filter((item) => item.is_active !== false)
    };
    state.operatingHours = operatingHoursResponse?.items || [];
    fillDynamicFilters();
    renderFlow();
  }

  async function loadAgenda() {
    const params = new URLSearchParams();
    if (state.filters.search) params.set('search', state.filters.search);
    if (state.filters.status) params.set('status', state.filters.status);
    if (state.filters.staff) params.set('staff', state.filters.staff);
    const data = await api.get(`/api/tenant/manage/agenda${params.toString() ? `?${params.toString()}` : ''}`);
    state.items = data.items || [];
    renderSummary();
    render();
  }

  function fillDynamicFilters() {
    const statuses = state.meta.session_statuses || [];
    const statusOptions = ['<option value="">Todos status</option>'].concat(statuses.map((item) => `<option value="${normalize(item.name)}">${item.name}</option>`));
    statusFilter.innerHTML = statusOptions.join('');
    staffFilter.innerHTML = ['<option value="">Todos colaboradores</option>'].concat((state.meta.collaborators || []).map((item) => `<option value="${item.full_name}">${item.full_name}</option>`)).join('');
    appointmentStatus.innerHTML = statuses.map((item) => `<option value="${normalize(item.name)}">${item.name}</option>`).join('');
    appointmentStaff.innerHTML = ['<option value="">Selecionar colaborador</option>'].concat((state.meta.collaborators || []).map((item) => `<option value="${item.full_name}" data-id="${item.id}">${item.full_name}</option>`)).join('');
  }

  function renderFlow() {
    const items = state.meta.session_statuses || [];
    flowContainer.innerHTML = items.map((item, index) => `
      <span class="flow-tag" style="--flow-color:${item.color || '#8F8866'}">${item.name}</span>
      ${index < items.length - 1 ? '<span class="flow-arrow">→</span>' : ''}
    `).join('');
  }

  function renderSummary() {
    const total = state.items.length;
    const todayKey = dateToYMD(new Date());
    const today = state.items.filter((item) => item.date === todayKey).length;
    const checkin = state.items.filter((item) => normalize(item.status) === 'checkin').length;
    const completed = state.items.filter((item) => normalize(item.status) === 'concluido').length;
    summaryContainer.innerHTML = `
      <article class="metric-card"><span class="metric-label">Agenda do período</span><strong>${total}</strong></article>
      <article class="metric-card"><span class="metric-label">Hoje</span><strong>${today}</strong></article>
      <article class="metric-card"><span class="metric-label">Check-in</span><strong>${checkin}</strong></article>
      <article class="metric-card"><span class="metric-label">Concluídos</span><strong>${completed}</strong></article>
    `;
  }

  function filteredItems() {
    return state.items.filter((item) => {
      const searchTerm = normalize(state.filters.search);
      const searchOk = !searchTerm || [item.tutor, item.pet, item.phone, item.service].some((value) => normalize(value).includes(searchTerm));
      const staffOk = !state.filters.staff || (item.staff || '') === state.filters.staff;
      const statusOk = !state.filters.status || normalize(item.status) === state.filters.status;
      return searchOk && statusOk && staffOk;
    });
  }

  function renderCurrentPeriod() {
    const current = state.currentDate;
    const label = state.currentView === 'month'
      ? current.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      : state.currentView === 'week'
        ? `Semana de ${getWeekDates(current)[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
        : current.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    el('current-period').textContent = label;
  }


  function hourOnly(value = '') {
    return String(value || '').slice(0, 2);
  }

  function getOperatingHourRow(dateYmd) {
    const date = new Date(`${dateYmd}T12:00:00`);
    const dow = date.getDay();
    return (state.operatingHours || []).find((row) => Number(row.dow) === Number(dow)) || null;
  }

  function slotCapacity(dateYmd) {
    const row = getOperatingHourRow(dateYmd);
    return Number(row?.slot_capacity || 0);
  }

  function appointmentsInSlot(dateYmd, hour) {
    return filteredItems().filter((item) => item.date === dateYmd && hourOnly(item.hour) === hourOnly(hour));
  }

  function slotRemaining(dateYmd, hour) {
    const capacity = slotCapacity(dateYmd);
    if (!capacity) return null;
    return Math.max(capacity - appointmentsInSlot(dateYmd, hour).length, 0);
  }

  function slotBadgeMarkup(dateYmd, hour) {
    const remaining = slotRemaining(dateYmd, hour);
    if (remaining === null) return '<span class="slot-capacity-badge">Sem slot</span>';
    const label = remaining === 1 ? '1 slot livre' : `${remaining} slots livres`;
    return `<span class="slot-capacity-badge ${remaining === 0 ? 'is-full' : ''}">${label}</span>`;
  }

  function slotAddButtonMarkup(dateYmd, hour) {
    return `<button class="slot-add-button" type="button" data-new-slot-date="${dateYmd}" data-new-slot-hour="${hour}">+ Agendar</button>`;
  }

  function slotContent(dateYmd, hour) {
    const items = appointmentsInSlot(dateYmd, hour);
    const capacityBadge = slotBadgeMarkup(dateYmd, hour);
    const blocks = items.length
      ? `<div class="slot-appointments slot-count-${Math.min(items.length, 4)}">${items.map((item) => appointmentBlock(item)).join('')}</div>`
      : '<div class="slot-empty-state">Sem agendamentos neste horário.</div>';
    return `
      <div class="timeline-slot-inner">
        <div class="slot-header-row">${capacityBadge}${slotAddButtonMarkup(dateYmd, hour)}</div>
        ${blocks}
      </div>
    `;
  }

  function appointmentBlock(item) {
    return `
      <div class="appointment-block status-${normalize(item.status)}" draggable="true" data-id="${item.id}" data-open-id="${item.id}" style="border-left-color:${item.status_color || statusColor(item.status)}">
        <button class="appointment-kebab" type="button" data-menu-toggle aria-label="Abrir ações">⋯</button>
        <div class="appointment-menu" data-menu>
          <button type="button" data-action="edit" data-id="${item.id}">✏️ Editar</button>
          <button type="button" data-action="checkin" data-id="${item.id}">✅ Check-in</button>
          <button type="button" data-action="receipt" data-id="${item.id}">🧾 Comprovante</button>
          <button type="button" data-action="delete" data-id="${item.id}">🗑️ Excluir</button>
        </div>
        <div class="appointment-top">
          <div class="appointment-main">
            <div class="avatar-stack">${appointmentAvatarMarkup(item)}</div>
            <div class="appointment-main-copy">
              <div class="appointment-title-row">
                <div class="appointment-title">${item.pet}</div>
                <span class="status-pill-inline" style="--pill:${item.status_color || statusColor(item.status)}">${item.status_label || labelStatus(item.status)}</span>
              </div>
              <div class="appointment-meta">${item.tutor} • ${item.service}</div>
              <div class="appointment-meta">${item.staff || 'Sem colaborador'} • ${item.phone || 'Sem WhatsApp'}</div>
              <div class="appointment-meta">${paymentLabel(item.payment_status, item.payment_method)}</div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function getWeekDates(baseDate) {
    const current = new Date(baseDate);
    const day = current.getDay() || 7;
    const monday = addDays(current, 1 - day);
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  }

  function renderDayView() {
    const selectedDate = dateToYMD(state.currentDate);
    const hours = Array.from({ length: 12 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`);
    let html = `<div class="timeline-shell"><div class="timeline-header" style="--days-count:1"><div class="timeline-header-cell">Hora</div><div class="timeline-header-cell">${state.currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })}</div></div><div class="timeline-grid" style="--days-count:1">`;
    hours.forEach((hour) => {
      html += `<div class="timeline-time">${hour}</div><div class="timeline-slot" data-date="${selectedDate}" data-hour="${hour}">${slotContent(selectedDate, hour)}</div>`;
    });
    html += '</div></div>';
    viewContainer.innerHTML = html;
    bindInteractions();
  }

  function renderWeekView() {
    const weekDates = getWeekDates(state.currentDate);
    const hours = Array.from({ length: 12 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`);
    let html = `<div class="timeline-shell"><div class="timeline-header" style="--days-count:7"><div class="timeline-header-cell">Hora</div>${weekDates.map((date) => `<div class="timeline-header-cell">${date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })}</div>`).join('')}</div><div class="timeline-grid" style="--days-count:7">`;
    hours.forEach((hour) => {
      html += `<div class="timeline-time">${hour}</div>`;
      weekDates.forEach((date) => {
        const ymd = dateToYMD(date);
        html += `<div class="timeline-slot" data-date="${ymd}" data-hour="${hour}">${slotContent(ymd, hour)}</div>`;
      });
    });
    html += '</div></div>';
    viewContainer.innerHTML = html;
    bindInteractions();
  }

  function renderMonthView() {
    const first = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
    const offset = (first.getDay() || 7) - 1;
    const start = addDays(first, -offset);
    const filtered = filteredItems();
    let html = `<div class="month-view"><div class="month-header">${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map((d) => `<div class="month-header-cell">${d}</div>`).join('')}</div><div class="month-grid">`;
    for (let i = 0; i < 35; i += 1) {
      const date = addDays(start, i);
      const ymd = dateToYMD(date);
      const items = filtered.filter((item) => item.date === ymd).slice(0, 3);
      html += `<div class="month-day"><div class="month-day-number">${date.getDate()}</div>${items.map((item) => `<div class="month-mini-card" data-open-id="${item.id}"><strong>${item.hour}</strong> ${item.pet}</div>`).join('')}</div>`;
    }
    html += '</div></div>';
    viewContainer.innerHTML = html;
    bindInteractions();
  }

  function renderCardsView() {
    viewContainer.innerHTML = `<div class="cards-view">${filteredItems().map((item) => `
      <article class="appointment-card" data-open-id="${item.id}">
        <div class="card-row">
          <div class="card-avatar-group">${appointmentAvatarMarkup(item)}</div>
          <div>
            <div class="card-title">${item.pet}</div>
            <div class="card-subtitle">${item.tutor}</div>
          </div>
        </div>
        <div class="card-meta">
          <div>📅 ${item.date} • ${item.hour}</div>
          <div>🧾 ${item.ticket_code || 'Comanda automática'}</div>
          <div>💼 ${item.service}</div>
          <div>👤 ${item.staff || 'Sem colaborador'}</div>
          <div>💳 ${paymentLabel(item.payment_status, item.payment_method)}</div>
        </div>
      </article>`).join('')}</div>`;
    bindInteractions();
  }

  function render() {
    renderCurrentPeriod();
    if (state.currentView === 'day') renderDayView();
    else if (state.currentView === 'week') renderWeekView();
    else if (state.currentView === 'month') renderMonthView();
    else renderCardsView();
  }

  function buildPetOptions(selectedId = '') {
    const selectedTutorId = tutorIdInput.value;
    const source = state.tutorPets.length ? state.tutorPets : (state.meta.pets || []);
    const pets = source.filter((pet) => !selectedTutorId || !pet.tutor_id || pet.tutor_id === selectedTutorId);
    return ['<option value="">Selecione o pet</option>']
      .concat(pets.map((pet) => `<option value="${pet.id}" ${String(selectedId) === String(pet.id) ? 'selected' : ''}>${pet.name}</option>`))
      .join('');
  }

  function allowedServicesForPets(selectedPetIds = []) {
    const selectedPets = (state.tutorPets.length ? state.tutorPets : state.meta.pets || []).filter((pet) => selectedPetIds.includes(pet.id));
    const allowedSizeIds = new Set(selectedPets.map((pet) => pet.size_id).filter(Boolean).map(String));
    const allowedSizeLabels = new Set(selectedPets.map((pet) => pet.size).filter(Boolean).map(normalize));
    if (!selectedPets.length || (!allowedSizeIds.size && !allowedSizeLabels.size)) return [];
    return (state.meta.services || []).filter((service) => {
      const serviceSizeId = service.pet_size_id ? String(service.pet_size_id) : '';
      const serviceSizeLabel = normalize(service.pet_size_label || service.pet_size_name || service.size || '');
      if (serviceSizeId && allowedSizeIds.has(serviceSizeId)) return true;
      if (serviceSizeLabel && allowedSizeLabels.has(serviceSizeLabel)) return true;
      return false;
    });
  }

  function buildServiceOptions(selectedId = '') {
    const petIds = [...petRows.querySelectorAll('.pet-select')].map((node) => node.value).filter(Boolean);
    const services = allowedServicesForPets(petIds);
    return ['<option value="">Selecione o serviço</option>']
      .concat(services.map((service) => `<option value="${service.id}" ${String(selectedId) === String(service.id) ? 'selected' : ''}>${service.name}</option>`))
      .join('');
  }

  function refreshPetRows() {
    petRows.querySelectorAll('.pet-select').forEach((select) => {
      const selected = select.value;
      select.innerHTML = buildPetOptions(selected);
      updatePetMeta(select.closest('.agenda-row-card'));
    });
    refreshServiceRows();
    updateCommandSummary();
  }

  function refreshServiceRows() {
    serviceRows.querySelectorAll('.service-select').forEach((select) => {
      const selected = select.value;
      select.innerHTML = buildServiceOptions(selected);
      if (selected && ![...select.options].some((opt) => opt.value === selected)) select.value = '';
      updateServiceMeta(select.closest('.agenda-row-card'));
    });
    updateCommandSummary();
  }

  function updatePetMeta(card) {
    const select = card?.querySelector('.pet-select');
    const meta = card?.querySelector('.pet-meta');
    if (!select || !meta) return;
    const pet = (state.tutorPets.length ? state.tutorPets : state.meta.pets || []).find((item) => item.id === select.value);
    meta.textContent = pet ? `${pet.breed || 'Raça não informada'} • ${pet.size || 'Porte não informado'}` : 'Selecione um pet para filtrar serviços pelo porte.';
  }

  function updateServiceMeta(card) {
    const select = card?.querySelector('.service-select');
    const meta = card?.querySelector('.service-meta');
    if (!select || !meta) return;
    const service = (state.meta.services || []).find((item) => item.id === select.value);
    const petIds = [...petRows.querySelectorAll('.pet-select')].map((node) => node.value).filter(Boolean);
    meta.textContent = service ? `${service.category || 'Sem categoria'} • ${money(service.price_cents)} • ${service.duration_minutes || 0} min` : (petIds.length ? 'Selecione um serviço disponível para os pets escolhidos.' : 'Selecione primeiro ao menos um pet para listar os serviços do porte correspondente.');
  }

  function addPetRow(pet = null) {
    const node = petTemplate.content.firstElementChild.cloneNode(true);
    const select = node.querySelector('.pet-select');
    select.required = true;
    select.innerHTML = buildPetOptions(pet?.id);
    if (pet?.id) select.value = pet.id;
    select.addEventListener('change', () => { updatePetMeta(node); refreshServiceRows(); updateCommandSummary(); });
    node.querySelector('.remove-row').addEventListener('click', () => { node.remove(); refreshServiceRows(); updateCommandSummary(); });
    petRows.appendChild(node);
    updatePetMeta(node);
  }

  function addServiceRow(service = null) {
    const node = serviceTemplate.content.firstElementChild.cloneNode(true);
    const select = node.querySelector('.service-select');
    select.required = true;
    select.innerHTML = buildServiceOptions(service?.id);
    if (service?.id) select.value = service.id;
    select.addEventListener('change', () => { updateServiceMeta(node); updateCommandSummary(); });
    node.querySelector('.remove-row').addEventListener('click', () => { node.remove(); updateCommandSummary(); });
    serviceRows.appendChild(node);
    updateServiceMeta(node);
  }

  function resetForm() {
    form.hidden = false;
    detailsView.hidden = true;
    state.editing = null;
    modalTitle.textContent = 'Novo agendamento';
    modalSubtitle.textContent = 'Comece pelo WhatsApp e monte a comanda do atendimento.';
    tutorIdInput.value = '';
    whatsappInput.value = '';
    clientNameInput.value = '';
    dateInput.value = dateToYMD(new Date());
    timeInput.value = '09:00';
    notesInput.value = '';
    paymentStatusInput.value = 'pendente';
    paymentMethodInput.value = '';
    feedback.textContent = 'Digite o WhatsApp para buscar cliente e pets já cadastrados.';
    feedback.className = 'agenda-inline-help';
    state.tutorPets = [];
    appointmentStatus.value = normalize((state.meta.session_statuses[0] || {}).name || 'Agendado');
    appointmentStaff.value = '';
    petRows.innerHTML = '';
    serviceRows.innerHTML = '';
    addPetRow();
    addServiceRow();
    deleteBtn.style.display = 'none';
    checkinBtn.style.display = 'none';
    printBtn.style.display = 'none';
    updateCommandSummary();
  }

  async function lookupCustomerByPhone() {
    clearFormAlert();
    const phone = whatsappInput.value.trim();
    if (!phone) {
      feedback.textContent = 'Informe o WhatsApp para buscar o cliente.';
      feedback.className = 'agenda-inline-help agenda-inline-help--warning';
      return;
    }
    try {
      const result = await api.get(`/api/tenant/tutors?search=${encodeURIComponent(phone)}`);
    const exact = (result.items || []).find((item) => normalize(item.phone) === normalize(phone) || normalize(item.phone_secondary) === normalize(phone)) || (result.items || [])[0];
    if (!exact) {
      tutorIdInput.value = '';
      clientNameInput.value = '';
      state.tutorPets = [];
      refreshPetRows();
      feedback.textContent = 'Cliente não encontrado. Cadastre o cliente primeiro para continuar o agendamento.';
      feedback.className = 'agenda-inline-help agenda-inline-help--warning';
      return;
    }
      const details = await api.get(`/api/tenant/tutors/${exact.id}`);
      tutorIdInput.value = exact.id;
      clientNameInput.value = exact.full_name;
      whatsappInput.value = applyPhoneMask(exact.phone || phone);
      state.tutorPets = (details.pets || []).map((pet) => ({ ...pet, tutor_id: exact.id }));
      refreshPetRows();
      feedback.textContent = `${exact.full_name} encontrado. ${state.tutorPets.length} pet(s) carregado(s) do cadastro.`;
      feedback.className = 'agenda-inline-help agenda-inline-help--success';
    } catch (error) {
      feedback.textContent = friendlyErrorMessage(error, 'Não foi possível buscar o cliente agora.');
      feedback.className = 'agenda-inline-help agenda-inline-help--warning';
      showFormAlert(friendlyErrorMessage(error, 'Não foi possível buscar o cliente agora.'));
    }
  }

  function gatherFormPayload() {
    const pets = [...petRows.querySelectorAll('.pet-select')]
      .map((select) => {
        const pet = (state.tutorPets.length ? state.tutorPets : state.meta.pets || []).find((item) => item.id === select.value);
        return pet ? { id: pet.id, name: pet.name, breed: pet.breed, size: pet.size, size_id: pet.size_id } : null;
      })
      .filter(Boolean);
    const services = [...serviceRows.querySelectorAll('.service-select')]
      .map((select) => (state.meta.services || []).find((item) => item.id === select.value) || null)
      .filter(Boolean)
      .map((service) => ({ id: service.id, name: service.name, category: service.category, price_cents: service.price_cents, duration_minutes: service.duration_minutes, pet_size_id: service.pet_size_id, pet_size_label: service.pet_size_label || service.pet_size_name }));

    return {
      tutor_id: tutorIdInput.value || undefined,
      tutor_name: clientNameInput.value,
      phone: whatsappInput.value,
      pet_id: pets[0]?.id,
      pet_name: pets.map((item) => item.name).join(' • '),
      service_id: services[0]?.id,
      service_name: services.map((item) => item.name).join(' • '),
      staff_name: appointmentStaff.value,
      staff_user_id: appointmentStaff.selectedOptions[0]?.dataset?.id || undefined,
      scheduled_at: currentSlotString(),
      status: appointmentStatus.value,
      notes: notesInput.value,
      payment_status: paymentStatusInput.value || 'pendente',
      payment_method: paymentMethodInput.value || '',
      breed: pets[0]?.breed || '',
      size: pets[0]?.size || '',
      pets,
      services
    };
  }

  function updateCommandSummary() {
    const payload = gatherFormPayload();
    const serviceTotal = (payload.services || []).reduce((sum, item) => sum + Number(item.price_cents || 0), 0);
    const petNames = (payload.pets || []).map((item) => item.name).join(', ') || 'Nenhum pet selecionado';
    const serviceNames = (payload.services || []).map((item) => item.name).join(', ') || 'Nenhum serviço selecionado';
    commandSummary.textContent = `${petNames} • ${serviceNames} • total ${money(serviceTotal)} • ${paymentLabel(paymentStatusInput.value, paymentMethodInput.value)}`;
  }

  function openModal(item = null) {
    modal.style.display = 'flex';
    clearFormAlert();
    if (!item) {
      resetForm();
      return;
    }
    state.editing = item;
    modalTitle.textContent = `Agendamento • ${item.pet}`;
    modalSubtitle.textContent = `${item.date} às ${item.hour} • ${item.ticket_code || 'Comanda automática'}`;
    tutorIdInput.value = item.tutor_id || '';
    whatsappInput.value = item.phone || '';
    clientNameInput.value = item.tutor || '';
    dateInput.value = item.date;
    timeInput.value = item.hour;
    notesInput.value = item.notes || '';
    paymentStatusInput.value = item.payment_status || 'pendente';
    paymentMethodInput.value = item.payment_method || '';
    appointmentStatus.value = normalize(item.status);
    appointmentStaff.value = item.staff || '';
    state.tutorPets = item.tutor_id ? (state.meta.pets || []).filter((pet) => pet.tutor_id === item.tutor_id) : [];
    petRows.innerHTML = '';
    serviceRows.innerHTML = '';
    (item.pets?.length ? item.pets : [{ id: item.pet_id, name: item.pet, breed: item.breed, size: item.size }]).forEach((pet) => addPetRow(pet));
    (item.services?.length ? item.services : [{ id: item.service_id, name: item.service }]).forEach((service) => addServiceRow(service));
    deleteBtn.style.display = '';
    checkinBtn.style.display = '';
    printBtn.style.display = '';
    updateCommandSummary();
  }

  function closeModal() { clearFormAlert(); modal.style.display = 'none'; }

  async function saveAppointment() {
    clearFormAlert();
    whatsappInput.value = applyPhoneMask(whatsappInput.value);
    const payload = gatherFormPayload();
    if (!form.reportValidity()) {
      showFormAlert('Preencha os campos obrigatórios destacados para salvar o agendamento.');
      focusFirstInvalidField();
      return;
    }
    if (!payload.pets.length || !payload.services.length) {
      showFormAlert('Selecione ao menos um pet e ao menos um serviço para gerar a comanda.');
      return;
    }
    if (payload.payment_status === 'pago' && !payload.payment_method) {
      showFormAlert('Selecione a forma de pagamento quando o agendamento estiver marcado como pago.');
      paymentMethodInput.focus();
      return;
    }
    try {
      if (state.editing) await api.put(`/api/tenant/manage/agenda/${state.editing.id}`, payload);
      else await api.post('/api/tenant/manage/agenda', payload);
      closeModal();
      await loadAgenda();
    } catch (error) {
      withFriendlyError(error, 'Não foi possível salvar o agendamento.');
    }
  }

  async function removeAppointment() {
    if (!state.editing || !confirm('Deseja excluir este agendamento?')) return;
    try {
      await api.delete(`/api/tenant/manage/agenda/${state.editing.id}`);
      closeModal();
      await loadAgenda();
    } catch (error) {
      withFriendlyError(error, 'Não foi possível excluir o agendamento.');
    }
  }

  async function doCheckin() {
    if (!state.editing) return;
    try {
      await api.patch(`/api/tenant/manage/agenda/${state.editing.id}/checkin`, {});
      closeModal();
      await loadAgenda();
    } catch (error) {
      withFriendlyError(error, 'Não foi possível atualizar o check-in.');
    }
  }

  function printReceipt() {
    const payload = state.editing || gatherFormPayload();
    const services = payload.services?.length ? payload.services : [{ name: payload.service }];
    const pets = payload.pets?.length ? payload.pets : [{ name: payload.pet }];
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Comprovante</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}h1{font-size:20px;margin-bottom:8px}.box{border:1px solid #dbe2ea;border-radius:12px;padding:16px;margin-top:14px}.muted{color:#64748b;font-size:13px}</style></head><body><h1>LoopinPet • Comprovante</h1><div class="muted">${payload.ticket_code || payload.ticket_code || ''}</div><div class="box"><strong>Cliente:</strong> ${payload.tutor || payload.tutor_name}<br><strong>WhatsApp:</strong> ${payload.phone || ''}<br><strong>Data:</strong> ${payload.date || dateInput.value} ${payload.hour || timeInput.value}<br><strong>Pagamento:</strong> ${paymentLabel(payload.payment_status || paymentStatusInput.value, payload.payment_method || paymentMethodInput.value)}</div><div class="box"><strong>Pets:</strong><ul>${pets.map((pet) => `<li>${pet.name}</li>`).join('')}</ul><strong>Serviços:</strong><ul>${services.map((service) => `<li>${service.name}</li>`).join('')}</ul></div></body></html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  function bindInteractions() {
    document.querySelectorAll('[data-open-id]').forEach((node) => node.addEventListener('click', (event) => {
      if (event.target.closest('[data-menu-toggle], [data-menu], .appointment-kebab')) return;
      const item = state.items.find((entry) => entry.id === node.dataset.openId);
      if (item) openModal(item);
    }));
    document.querySelectorAll('.appointment-block').forEach((node) => node.addEventListener('dragstart', (event) => event.dataTransfer.setData('text/plain', node.dataset.id)));
    document.querySelectorAll('[data-menu-toggle]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation();
      const menu = button.parentElement.querySelector('[data-menu]');
      document.querySelectorAll('[data-menu].is-open').forEach((item) => { if (item !== menu) item.classList.remove('is-open'); });
      menu?.classList.toggle('is-open');
    }));
    document.querySelectorAll('[data-menu] button').forEach((button) => button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const item = state.items.find((entry) => entry.id === button.dataset.id);
      if (!item) return;
      if (button.dataset.action === 'edit') openModal(item);
      if (button.dataset.action === 'receipt') printReceiptForItem(item);
      if (button.dataset.action === 'checkin') {
        try { await api.patch(`/api/tenant/manage/agenda/${item.id}/checkin`, {}); await loadAgenda(); }
        catch (error) { openModal(item); showFormAlert(friendlyErrorMessage(error, 'Não foi possível atualizar o check-in.')); }
      }
      if (button.dataset.action === 'delete' && confirm('Deseja excluir este agendamento?')) {
        try { await api.delete(`/api/tenant/manage/agenda/${item.id}`); await loadAgenda(); }
        catch (error) { openModal(item); showFormAlert(friendlyErrorMessage(error, 'Não foi possível excluir o agendamento.')); }
      }
    }));
    document.querySelectorAll('.timeline-slot').forEach((slot) => {
      slot.addEventListener('dragover', (event) => { event.preventDefault(); slot.classList.add('drop-hover'); });
      slot.addEventListener('dragleave', () => slot.classList.remove('drop-hover'));
      slot.addEventListener('drop', async (event) => {
        event.preventDefault();
        slot.classList.remove('drop-hover');
        const id = event.dataTransfer.getData('text/plain');
        try {
          await api.patch(`/api/tenant/manage/agenda/${id}/move`, { scheduled_at: `${slot.dataset.date}T${slot.dataset.hour}` });
          await loadAgenda();
        } catch (error) {
          showFormAlert(friendlyErrorMessage(error, 'Não foi possível mover o agendamento para este horário.'));
        }
      });
    });
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.appointment-kebab') && !event.target.closest('[data-menu]')) {
      document.querySelectorAll('[data-menu].is-open').forEach((item) => item.classList.remove('is-open'));
    }
  });

  function printReceiptForItem(item) {
    state.editing = item;
    printReceipt();
  }

  document.querySelectorAll('.view-btn').forEach((btn) => btn.addEventListener('click', () => {
    document.querySelectorAll('.view-btn').forEach((item) => item.classList.remove('active'));
    btn.classList.add('active');
    state.currentView = btn.dataset.view;
    render();
  }));
  el('search-input').addEventListener('input', (event) => { state.filters.search = event.target.value; loadAgenda(); });
  statusFilter.addEventListener('change', (event) => { state.filters.status = event.target.value; loadAgenda(); });
  staffFilter.addEventListener('change', (event) => { state.filters.staff = event.target.value; loadAgenda(); });
  el('prev-period').addEventListener('click', () => { if (state.currentView === 'day') state.currentDate = addDays(state.currentDate, -1); else if (state.currentView === 'week') state.currentDate = addDays(state.currentDate, -7); else state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() - 1, 1); render(); });
  el('next-period').addEventListener('click', () => { if (state.currentView === 'day') state.currentDate = addDays(state.currentDate, 1); else if (state.currentView === 'week') state.currentDate = addDays(state.currentDate, 7); else state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 1); render(); });
  el('btn-new-appointment').addEventListener('click', () => openModal());
  el('btn-find-customer').addEventListener('click', lookupCustomerByPhone);
  el('btn-add-pet-row').addEventListener('click', () => addPetRow());
  el('btn-add-service-row').addEventListener('click', () => addServiceRow());
  whatsappInput.addEventListener('input', () => { whatsappInput.value = applyPhoneMask(whatsappInput.value); });
  whatsappInput.addEventListener('blur', () => { if (whatsappInput.value.trim()) lookupCustomerByPhone().catch(() => {}); });
  el('modal-close-btn').addEventListener('click', closeModal);
  el('modal-cancel-btn').addEventListener('click', closeModal);
  saveBtn.addEventListener('click', saveAppointment);
  deleteBtn.addEventListener('click', removeAppointment);
  checkinBtn.addEventListener('click', doCheckin);
  printBtn.addEventListener('click', printReceipt);
  paymentStatusInput.addEventListener('change', updateCommandSummary);
  paymentMethodInput.addEventListener('change', updateCommandSummary);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });

  Promise.all([loadMeta(), loadAgenda()]).catch((error) => {
    console.error(error);
    viewContainer.innerHTML = `<div class="empty-state">${error.message || 'Não foi possível carregar a agenda.'}</div>`;
  });
})();
