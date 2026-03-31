import { api, openLoadingModal, closeFeedbackModal } from './api.js';
import { getAuth } from './auth.js';

(function () {
  const state = {
    items: [],
    currentView: 'day',
    currentDate: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 12, 0, 0, 0),
    filters: { search: '', status: '', staff: '' },
    meta: { session_statuses: [], collaborators: [], services: [], pets: [], tutors: [] },
    operatingHours: [],
    tutorPets: [],
    editing: null,
    ai: { dashboard: null, rotationTimer: null, history: [], loading: false }
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
  const appointmentGroups = el('appointment-groups');
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
  const appointmentGroupTemplate = el('appointment-group-template');
  const serviceTemplate = el('service-row-template');
  const saveBtn = el('modal-save-btn');
  const deleteBtn = el('modal-delete-btn');
  const printBtn = el('btn-print-receipt');
  const documentModal = el('document-modal');
  const documentContent = el('document-content');
  const documentModalTitle = el('document-modal-title');
  const documentModalSubtitle = el('document-modal-subtitle');
  const documentCloseBtn = el('document-close-btn');
  const documentCloseFooterBtn = el('document-close-footer-btn');
  const documentPdfBtn = el('document-pdf-btn');
  const documentWhatsappBtn = el('document-whatsapp-btn');
  const aiWidget = document.querySelector('[data-ai-widget]');
  const aiWidgetPanel = document.querySelector('[data-ai-widget-panel]');
  const aiWidgetToggle = document.querySelector('[data-ai-widget-toggle]');
  const aiWidgetClose = document.querySelector('[data-ai-widget-close]');
  const aiWidgetMessages = document.querySelector('[data-ai-widget-messages]');
  const aiWidgetForm = document.querySelector('[data-ai-widget-form]');
  const aiWidgetInput = document.querySelector('[data-ai-widget-input]');
  const aiWidgetSend = document.querySelector('[data-ai-widget-send]');
  const notificationList = document.querySelector('[data-notification-list]');
  const notificationChip = document.querySelector('[data-notification-chip]');
  const notificationDot = document.querySelector('.notification-dot');

  const agendaDatePicker = el('agenda-date-picker');
  const todayBtn = el('btn-today');
  const agendaDatePickerBtn = el('btn-date-picker');

  function normalize(value = '') {
    return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }
  function money(cents) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100); }
  function dateToYMD(date) { return new Date(date).toISOString().slice(0, 10); }
  function addDays(date, days) { const d = new Date(date); d.setHours(12,0,0,0); d.setDate(d.getDate() + days); return d; }
  function localDateFromYmd(value) { const [y,m,d] = String(value || '').split('-').map(Number); return new Date(y || 1970, (m || 1) - 1, d || 1, 12, 0, 0, 0); }
  function todayLocalDate() { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0); }
  function labelStatus(code) {
    const found = state.meta.session_statuses.find((item) => normalize(item.name) === normalize(code) || normalize(item.code) === normalize(code));
    return found?.name || String(code || '').replace(/_/g, ' ');
  }
  function statusColor(code) {
    const found = state.meta.session_statuses.find((item) => normalize(item.name) === normalize(code) || normalize(item.code) === normalize(code));
    return found?.color || '#8F8866';
  }
  function statusBackground(code) {
    return statusBackgroundFromColor(statusColor(code));
  }

  function statusBackgroundFromColor(color) {
    const value = String(color || '#8F8866').trim();
    const hex = value.startsWith('#') ? value.slice(1) : value;
    const normalizedHex = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(normalizedHex)) {
      return 'color-mix(in srgb, var(--pill, #8F8866) 18%, white)';
    }
    const red = parseInt(normalizedHex.slice(0, 2), 16);
    const green = parseInt(normalizedHex.slice(2, 4), 16);
    const blue = parseInt(normalizedHex.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, 0.18)`;
  }
  function canonicalHourLabel(value = '') {
    const match = String(value || '').trim().match(/^(\d{1,2})(?::(\d{2}))?/);
    if (!match) return '';
    const hour = String(Number(match[1] || 0)).padStart(2, '0');
    const minute = String(match[2] ?? '00').padStart(2, '0');
    return `${hour}:${minute}`;
  }
  function currentSlotString() { return `${dateInput.value || dateToYMD(new Date())}T${canonicalHourLabel(timeInput.value) || '09:00'}`; }

  function currentDateYmd() { return dateToYMD(state.currentDate); }

  function hasItemsForDate(dateYmd) {
    return state.items.some((item) => item.date === dateYmd);
  }

  function pickBestCurrentDate() {
    const currentYmd = currentDateYmd();
    if (hasItemsForDate(currentYmd)) return state.currentDate;
    const firstWithDate = state.items.find((item) => item?.date);
    return firstWithDate?.date ? localDateFromYmd(firstWithDate.date) : state.currentDate;
  }

  function isPastDateYmd(dateYmd) {
    const selected = localDateFromYmd(dateYmd);
    const today = todayLocalDate();
    return selected.getTime() < today.getTime();
  }

  function isPastSlot(dateYmd, hour = '00:00') {
    const [h, m] = String(hour || '00:00').split(':').map(Number);
    const base = localDateFromYmd(dateYmd);
    base.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
    return base.getTime() < Date.now();
  }

  function toggleNewAppointmentAvailability() {
    const btn = el('btn-new-appointment');
    if (!btn) return;
    const past = isPastDateYmd(currentDateYmd());
    btn.hidden = past;
    btn.disabled = past;
  }


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

  function feedbackModalNodes() {
    const overlay = document.getElementById('global-crud-feedback');
    return {
      overlay,
      media: overlay?.querySelector('[data-feedback-media]'),
      title: overlay?.querySelector('[data-feedback-title]'),
      message: overlay?.querySelector('[data-feedback-message]'),
      actions: overlay?.querySelector('[data-feedback-actions]'),
      close: overlay?.querySelector('[data-feedback-close]')
    };
  }

  function showAgendaLookupModal({ title = 'Aviso', message = '', type = 'success', buttonText = 'OK', onClose = null }) {
    const ui = feedbackModalNodes();
    if (!ui.overlay) {
      if (typeof onClose === 'function') onClose();
      return;
    }
    ui.overlay.hidden = false;
    if (ui.media) {
      ui.media.innerHTML = `<span class="crud-feedback-icon">${type === 'error' ? '⚠️' : '✅'}</span>`;
    }
    if (ui.title) ui.title.textContent = title;
    if (ui.message) ui.message.textContent = message;
    if (ui.actions) ui.actions.hidden = false;
    if (ui.close) {
      const next = typeof onClose === 'function' ? onClose : null;
      ui.close.className = `crud-feedback-button${type === 'error' ? ' is-error' : ''}`;
      ui.close.textContent = buttonText;
      ui.close.onclick = () => {
        ui.overlay.hidden = true;
        ui.close.onclick = null;
        if (next) next();
      };
    }
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

  function formatPhoneDisplay(value = '') {
    const digits = String(value || '').replace(/\D+/g, '');
    if (!digits) return '';
    const normalized = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
    const masked = applyPhoneMask(normalized.slice(0, 11));
    return masked ? `+55 ${masked}` : value;
  }

  function formatDateBr(value = '') {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      const [y, m, d] = String(value).split('-');
      return `${d}/${m}/${y}`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(date);
  }

  function formatDateTimeLabel(dateValue = '', hourValue = '') {
    const dateLabel = formatDateBr(dateValue);
    const hourLabel = canonicalHourLabel(hourValue || '');
    return [dateLabel, hourLabel ? `às ${hourLabel}` : ''].filter(Boolean).join(' ');
  }

  function focusFirstInvalidField() {
    const invalid = form?.querySelector(':invalid');
    if (invalid) invalid.focus();
  }

  function findPetById(petId) {
    return (state.tutorPets.length ? state.tutorPets : state.meta.pets || []).find((pet) => String(pet.id) === String(petId));
  }

  function darkenHexColor(color, factor = 0.18) {
    const value = String(color || '').trim();
    const hex = value.startsWith('#') ? value.slice(1) : value;
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#334155';
    const r = Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(0, 2), 16) * (1 - factor))));
    const g = Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(2, 4), 16) * (1 - factor))));
    const b = Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(4, 6), 16) * (1 - factor))));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  function avatarMarkupForPet(pet, options = {}) {
    const statusTone = options.statusTone || '#1F8560';
    const safeName = escapeHtml(pet?.name || 'Pet');
    const avatarStyle = `style="--avatar-tone:${statusTone}"`;
    if (pet?.photo_url) return `<span class="pet-avatar-image" ${avatarStyle}><img src="${pet.photo_url}" alt="${safeName}"></span>`;
    return `<span class="appointment-avatar-fallback" ${avatarStyle}>${String((pet?.name || 'Pet')).slice(0,2).toUpperCase()}</span>`;
  }

  function appointmentAvatarMarkup(item) {
    const pets = (item.pets?.length ? item.pets : []).map((pet) => findPetById(pet.id) || pet).filter(Boolean);
    if (!pets.length && item.pet_id) {
      const pet = findPetById(item.pet_id) || { id: item.pet_id, name: item.pet };
      pets.push(pet);
    }
    const statusTone = darkenHexColor(item.status_color || statusColor(item.status), 0.2);
    return pets.slice(0, 2).map((pet) => avatarMarkupForPet(pet, { statusTone })).join('') || `<span class="appointment-avatar-fallback" style="--avatar-tone:${statusTone}">${String((item.pet || 'Pet')).slice(0,2).toUpperCase()}</span>`;
  }

  function paymentLabel(status, method) {
    const statusLabel = normalize(status) === 'pago' ? 'Pago' : 'Pendente';
    const methodMap = { pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito', transferencia: 'Transferência' };
    return method ? `${statusLabel} • ${methodMap[method] || method}` : statusLabel;
  }

  function appointmentInfoRowsMarkup(item, options = {}) {
    const compact = Boolean(options.compact);
    const rows = [
      ...(isPackageAppointment(item) && packageSessionLabel(item) ? [{ icon: '📦', value: `${packageSessionLabel(item)}${item.is_last_package_session ? ' • última sessão' : ''}` }] : []),
      { icon: '✂️', value: item.service || '-' },
      { icon: '👤', value: item.tutor || '-' },
      { icon: '💬', value: item.phone_display || formatPhoneDisplay(item.phone) || '-' },
      { icon: '💳', value: paymentLabel(item.payment_status, item.payment_method) }
    ];
    return rows.map((row) => `
      <div class="appointment-meta ${compact ? 'appointment-meta--compact' : ''}">
        <span class="appointment-meta-icon" aria-hidden="true">${row.icon}</span>
        <span>${escapeHtml(row.value)}</span>
      </div>`).join('');
  }

  function escapeHtml(value = '') {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isPaidAppointment(item) {
    return normalize(item?.payment_status) === 'pago';
  }

  function isPackageAppointment(item) {
    return normalize(item?.booking_origin) === 'pacote' || Boolean(item?.customer_package_id);
  }

  function packageSessionLabel(item) {
    const current = Number(item?.package_session_number || item?.package_snapshot_json?.session_number || 0);
    const total = Number(item?.package_session_total || item?.package_snapshot_json?.session_total || 0);
    return current && total ? `${current} de ${total}` : '';
  }

  function packageFinancials(item) {
    const totalWithout = Number(item?.package_total_without_discount_cents || item?.package_snapshot_json?.total_without_discount_cents || 0);
    const totalWith = Number(item?.package_total_with_discount_cents || item?.package_snapshot_json?.total_with_discount_cents || 0);
    const discountPercent = Number(item?.package_discount_percent || item?.package_snapshot_json?.discount_percent || 0);
    const discountValue = Math.max(0, totalWithout - totalWith);
    return { totalWithout, totalWith, discountPercent, discountValue };
  }

  function isPastAppointment(item) {
    if (!item?.date) return false;
    return isPastSlot(item.date, canonicalHourLabel(item.hour || '00:00'));
  }

  function getTenantDocumentInfo() {
    const auth = getAuth() || {};
    const tenant = auth.tenant || {};
    const line1 = [tenant.address_line, tenant.address_number].filter(Boolean).join(', ');
    const line2 = [tenant.address_district, tenant.address_city, tenant.address_state].filter(Boolean).join(' • ');
    return {
      brand: tenant.brand_name || tenant.name || 'LoopinPet',
      logo: tenant.logo_url || '../../assets/logo-loopinpet.png',
      whatsapp: tenant.whatsapp_number || '',
      support: tenant.support_email || '',
      addressLine: line1,
      addressLine2: line2,
      addressZip: tenant.address_zip || '',
      addressComplement: tenant.address_complement || ''
    };
  }

  function servicesFromItem(item = {}) {
    const snapshotServices = Array.isArray(item?.package_snapshot_json?.services) ? item.package_snapshot_json.services : [];
    const services = Array.isArray(item.services) && item.services.length ? item.services : [];
    if (isPackageAppointment(item) && snapshotServices.length) {
      return snapshotServices.flatMap((entry) => {
        const qty = Math.max(1, Number(entry.quantity || 1) || 1);
        return Array.from({ length: qty }, () => ({
          id: entry.service_id || entry.id || null,
          service_id: entry.service_id || entry.id || null,
          name: entry.service_name || entry.name || 'Serviço',
          service_name: entry.service_name || entry.name || 'Serviço',
          category: entry.category || '',
          duration_minutes: Number(entry.duration_minutes || 0),
          price_cents: Number(entry.price_cents || 0)
        }));
      });
    }
    if (services.length) return services;
    return item.service ? [{ name: item.service, category: '', duration_minutes: 0, price_cents: 0 }] : [];
  }

  function petsFromItem(item = {}) {
    const pets = Array.isArray(item.pets) ? item.pets : [];
    if (pets.length) return pets;
    return item.pet ? [{ name: item.pet, breed: item.breed || '', size: item.size || '' }] : [];
  }

  function serviceRowsForDocument(item = {}) {
    const pets = petsFromItem(item);
    const services = servicesFromItem(item);
    if (!services.length) return pets.map((pet) => ({ pet, service: { name: item.service || 'Serviço', category: '', duration_minutes: 0, price_cents: 0 } }));
    return services.map((service, index) => ({
      pet: pets[index] || pets[0] || { name: item.pet || 'Pet', breed: item.breed || '', size: item.size || '' },
      service
    }));
  }

  function serviceTotalsForItem(item = {}) {
    const rows = serviceRowsForDocument(item);
    return rows.reduce((acc, row) => {
      acc.totalCents += Number(row.service?.price_cents || 0);
      acc.totalMinutes += Number(row.service?.duration_minutes || 0);
      return acc;
    }, { totalCents: 0, totalMinutes: 0 });
  }

  function buildMenuActions(item = {}) {
    const actions = [];
    const paid = isPaidAppointment(item);
    actions.push({ action: 'document', label: paid ? '🧾 Exibir recibo' : '📋 Exibir comanda' });
    actions.push({ action: 'edit', label: '✏️ Editar' });
    if (!isPastAppointment(item)) actions.push({ action: 'delete', label: '⛔ Cancelar agendamento' });
    return actions;
  }

  function menuMarkup(item = {}) {
    return buildMenuActions(item).map((entry) => `<button type="button" data-action="${entry.action}" data-id="${item.id}">${entry.label}</button>`).join('');
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

  function mapAgendaApiItem(row) {
    if (!row || typeof row !== 'object') return null;
    const status = normalize(row.status || row.status_code || 'agendado');
    const scheduled = row.scheduled_at ? new Date(row.scheduled_at) : null;
    const statusMeta = (state.meta.session_statuses || []).find((item) => normalize(item.name) === status || normalize(item.code) === status);
    return {
      ...row,
      status,
      pets: Array.isArray(row.pets) ? row.pets : Array.isArray(row.pets_json) ? row.pets_json : [],
      services: Array.isArray(row.services) ? row.services : Array.isArray(row.services_json) ? row.services_json : [],
      staff: row.staff || row.staff_name || '',
      pet: row.pet || row.pet_name || '',
      tutor: row.tutor || row.tutor_name || '',
      phone: row.phone || '',
      phone_display: formatPhoneDisplay(row.phone || ''),
      service: row.service || row.service_name || '',
      breed: row.breed || '',
      size: row.size || '',
      notes: row.notes || '',
      payment_status: row.payment_status || 'pendente',
      payment_method: row.payment_method || '',
      ticket_code: row.ticket_code || '',
      date: row.date || (scheduled && !Number.isNaN(scheduled.getTime())
        ? new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' }).format(scheduled)
        : ''),
      hour: canonicalHourLabel(row.hour || (scheduled && !Number.isNaN(scheduled.getTime())
        ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(scheduled)
        : '')),
      status_label: row.status_label || statusMeta?.name || labelStatus(status),
      status_color: row.status_color || statusMeta?.color || statusColor(status),
      receipt_ready: typeof row.receipt_ready === 'boolean' ? row.receipt_ready : status === 'concluido'
    };
  }

  function upsertAgendaItemLocally(item) {
    const normalizedItem = mapAgendaApiItem(item);
    if (!normalizedItem?.id) return null;
    const index = state.items.findIndex((entry) => String(entry.id) === String(normalizedItem.id));
    if (index >= 0) state.items[index] = { ...state.items[index], ...normalizedItem };
    else state.items.unshift(normalizedItem);
    return normalizedItem;
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

  async function loadAgenda(options = {}) {
    if (!options.silent) openLoadingModal('Carregando agenda do pet shop...');
    try {
      const params = new URLSearchParams();
      if (state.filters.search) params.set('search', state.filters.search);
      if (state.filters.status) params.set('status', state.filters.status);
      if (state.filters.staff) params.set('staff', state.filters.staff);
      const data = await api.get(`/api/tenant/manage/agenda${params.toString() ? `?${params.toString()}` : ''}`);
      state.items = (data.items || []).map(mapAgendaApiItem).filter(Boolean);
      if (!options.keepCurrentDate) {
        state.currentDate = pickBestCurrentDate();
      }
      renderSummary();
      render();
    } finally {
      if (!options.silent) closeFeedbackModal();
    }
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

  function datesForCurrentView() {
    if (state.currentView === 'week') return getWeekDates(state.currentDate).map((date) => dateToYMD(date));
    if (state.currentView === 'month') {
      const year = state.currentDate.getFullYear();
      const month = state.currentDate.getMonth();
      const totalDays = new Date(year, month + 1, 0).getDate();
      return Array.from({ length: totalDays }, (_, index) => dateToYMD(new Date(year, month, index + 1, 12, 0, 0, 0)));
    }
    return [currentDateYmd()];
  }

  function configuredHoursForDate(dateYmd) {
    const row = getOperatingHourRow(dateYmd);
    if (row && !row.is_closed) {
      const [openHour] = String(row.open_time || '08:00').slice(0, 5).split(':').map(Number);
      const [closeHour] = String(row.close_time || '18:00').slice(0, 5).split(':').map(Number);
      if (Number.isFinite(openHour) && Number.isFinite(closeHour) && closeHour > openHour) {
        return Array.from({ length: closeHour - openHour }, (_, index) => `${String(openHour + index).padStart(2, '0')}:00`);
      }
    }
    return visibleHoursForDate(dateYmd);
  }

  function occupancyMetrics() {
    const periodDates = datesForCurrentView();
    const visible = filteredItems().filter((item) => periodDates.includes(item.date));
    const slotTotal = periodDates.reduce((acc, dateYmd) => {
      const capacity = slotCapacity(dateYmd);
      const hours = configuredHoursForDate(dateYmd);
      if (!capacity || !hours.length) return acc;
      return acc + (capacity * hours.length);
    }, 0);
    const occupied = visible.length;
    const rate = slotTotal > 0 ? Math.min((occupied / slotTotal) * 100, 100) : 0;
    const label = state.currentView === 'week' ? 'Taxa de ocupação da semana' : state.currentView === 'month' ? 'Taxa de ocupação do mês' : state.currentView === 'cards' ? 'Taxa de ocupação do dia' : 'Taxa de ocupação do dia';
    return {
      slotTotal,
      occupied,
      rate,
      label,
      helper: slotTotal > 0 ? `${occupied} de ${slotTotal} slots ocupados` : 'Configure horário de funcionamento para medir ocupação'
    };
  }

  function renderNotifications() {
    if (!notificationList) return;
    const alerts = Array.isArray(state.ai.dashboard?.alerts) ? state.ai.dashboard.alerts : [];
    if (notificationChip) notificationChip.textContent = alerts.length ? `${alerts.length} alerta(s)` : 'IA + Sistema';
    if (notificationDot) notificationDot.style.display = alerts.length ? 'inline-flex' : 'none';
    if (!alerts.length) {
      notificationList.innerHTML = `
        <div class="notification-item">
          <span class="notification-icon">✅</span>
          <div>
            <strong>Sem alertas críticos agora</strong>
            <p>A agenda está sob controle. Continue acompanhando ocupação, pagamentos e oportunidades.</p>
            <small>Agora</small>
          </div>
        </div>`;
      return;
    }
    notificationList.innerHTML = alerts.map((item) => `
      <div class="notification-item notification-item--${escapeHtml(item.priority || 'low')}">
        <span class="notification-icon">${escapeHtml(item.icon || '🔔')}</span>
        <div>
          <strong>${escapeHtml(item.title || 'Alerta da operação')}</strong>
          <p>${escapeHtml(item.text || '')}</p>
          <small>${escapeHtml(item.cta || 'Ação sugerida pela IA')}</small>
        </div>
      </div>`).join('');
  }

  function renderSummary() {
    const visible = filteredItems();
    const total = visible.length;
    const periodDates = datesForCurrentView();
    const todayKey = dateToYMD(new Date());
    const today = state.items.filter((item) => item.date === todayKey).length;
    const checkin = visible.filter((item) => normalize(item.status) === 'checkin').length;
    const completed = visible.filter((item) => ['concluido', 'finalizado'].includes(normalize(item.status))).length;
    const unpaid = visible.filter((item) => normalize(item.payment_status) !== 'pago').length;
    const occupancy = occupancyMetrics();
    summaryContainer.innerHTML = `
      <article class="metric-card"><span class="metric-label">Agenda do período</span><strong>${total}</strong><small>${state.currentView === 'month' ? 'Itens do mês selecionado' : state.currentView === 'week' ? 'Itens da semana selecionada' : 'Itens do dia selecionado'}</small></article>
      <article class="metric-card"><span class="metric-label">${occupancy.label}</span><strong>${occupancy.rate.toFixed(0)}%</strong><small>${occupancy.helper}</small></article>
      <article class="metric-card"><span class="metric-label">Pagamentos pendentes</span><strong>${unpaid}</strong><small>Atendimentos ainda sem baixa financeira</small></article>
      <article class="metric-card"><span class="metric-label">Check-in</span><strong>${checkin}</strong><small>Agendamentos em andamento na visão atual</small></article>
      <article class="metric-card"><span class="metric-label">Concluídos</span><strong>${completed}</strong><small>Atendimentos já encerrados</small></article>
    `;
  }

  function filteredItems() {
    const ignoreStatusFilter = state.currentView === 'cards';
    return state.items.filter((item) => {
      const searchTerm = normalize(state.filters.search);
      const searchOk = !searchTerm || [item.tutor, item.pet, item.phone, item.service].some((value) => normalize(value).includes(searchTerm));
      const staffOk = !state.filters.staff || (item.staff || '') === state.filters.staff;
      const statusOk = ignoreStatusFilter || !state.filters.status || normalize(item.status) === state.filters.status;
      return searchOk && statusOk && staffOk;
    });
  }

  function renderCurrentPeriod() {
    const current = state.currentDate;
    const label = state.currentView === 'month'
      ? current.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      : state.currentView === 'week'
        ? `Semana de ${formatDateBr(dateToYMD(getWeekDates(current)[0]))}`
        : state.currentView === 'cards'
          ? `Cards de ${formatDateBr(dateToYMD(current))}`
          : formatDateBr(dateToYMD(current));
    el('current-period').textContent = label;
    if (agendaDatePicker) agendaDatePicker.value = dateToYMD(current);
  }


  function hourOnly(value = '') {
    return canonicalHourLabel(value).slice(0, 2);
  }

  const DEFAULT_OPERATING_CAPACITY = 10;

  function getOperatingHourRow(dateYmd) {
    const match = String(dateYmd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const [, year, month, day] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
    const dow = date.getDay();
    return (state.operatingHours || []).find((row) => Number(row.dow) === Number(dow)) || null;
  }

  function slotCapacity(dateYmd) {
    const row = getOperatingHourRow(dateYmd);
    if (!row) return DEFAULT_OPERATING_CAPACITY;
    if (row.is_closed) return 0;
    const configured = Number(row.slot_capacity ?? row.max_per_half_hour ?? DEFAULT_OPERATING_CAPACITY);
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_OPERATING_CAPACITY;
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
    const row = getOperatingHourRow(dateYmd);
    if (row?.is_closed) return '<span class="slot-capacity-badge is-closed">Fechado</span>';
    const remaining = slotRemaining(dateYmd, hour);
    const label = remaining === 1 ? '1 slot livre' : `${remaining} slots livres`;
    return `<span class="slot-capacity-badge ${remaining === 0 ? 'is-full' : ''}">${label}</span>`;
  }

  function slotAddButtonMarkup(dateYmd, hour) {
    if (isPastSlot(dateYmd, hour)) return '';
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
    const currentStatusColor = item.status_color || statusColor(item.status);
    return `
      <div class="appointment-block status-${normalize(item.status)}" draggable="true" data-id="${item.id}" data-open-id="${item.id}" style="border-left-color:${currentStatusColor};background:${statusBackgroundFromColor(currentStatusColor)}">
        <div class="appointment-top-row">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="status-pill-inline" style="--pill:${currentStatusColor}">${item.status_label || labelStatus(item.status)}</span>${isPackageAppointment(item) ? `<span class="status-pill-inline" style="--pill:${darkenHexColor(currentStatusColor, 0.08)}">📦 ${escapeHtml(packageSessionLabel(item) || 'Pacote')}</span>` : ''}</div>
          <div class="appointment-kebab-shell">
            <button class="appointment-kebab" type="button" data-menu-toggle aria-label="Abrir ações">⋯</button>
            <div class="appointment-menu" data-menu>
              ${menuMarkup(item)}
            </div>
          </div>
        </div>
        <div class="appointment-top">
          <div class="appointment-main">
            <div class="avatar-stack">${appointmentAvatarMarkup(item)}</div>
            <div class="appointment-main-copy">
              <div class="appointment-pet-row">
                <div class="appointment-pet-name">${escapeHtml(item.pet || '-')}</div>
              </div>
              <div class="appointment-meta-list">${appointmentInfoRowsMarkup(item)}</div>
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

  function visibleHoursForDate(dateYmd) {
    const derived = [...new Set(state.items.filter((item) => item.date === dateYmd && item.hour).map((item) => canonicalHourLabel(item.hour)).filter(Boolean))].sort();
    if (isPastDateYmd(dateYmd)) return derived;
    const row = getOperatingHourRow(dateYmd);
    if (!row) {
      return derived;
    }
    if (row.is_closed) return derived;
    const [openHour, openMinute] = String(row.open_time || '08:00').slice(0, 5).split(':').map(Number);
    const [closeHour, closeMinute] = String(row.close_time || '18:00').slice(0, 5).split(':').map(Number);
    const start = localDateFromYmd(dateYmd);
    start.setHours(Number.isFinite(openHour) ? openHour : 8, Number.isFinite(openMinute) ? openMinute : 0, 0, 0);
    const end = localDateFromYmd(dateYmd);
    end.setHours(Number.isFinite(closeHour) ? closeHour : 18, Number.isFinite(closeMinute) ? closeMinute : 0, 0, 0);
    const values = [];
    const cursor = new Date(start);
    while (cursor < end) {
      values.push(`${String(cursor.getHours()).padStart(2, '0')}:${String(cursor.getMinutes()).padStart(2, '0')}`);
      cursor.setHours(cursor.getHours() + 1);
    }
    derived.forEach((hour) => { if (!values.includes(hour)) values.push(hour); });
    return values.sort();
  }

  function timelineHoursForDates(dateYmdList) {
    const unique = [];
    dateYmdList.forEach((dateYmd) => {
      visibleHoursForDate(dateYmd).forEach((hour) => {
        if (!unique.includes(hour)) unique.push(hour);
      });
    });
    return unique.sort();
  }

  function renderDayView() {
    const selectedDate = dateToYMD(state.currentDate);
    const hours = visibleHoursForDate(selectedDate);
    if (!hours.length) {
      viewContainer.innerHTML = '<div class="empty-state">Não há horários configurados para este dia.</div>';
      bindInteractions();
      return;
    }
    let html = `<div class="timeline-shell"><div class="timeline-header" style="--days-count:1"><div class="timeline-header-cell">Hora</div><div class="timeline-header-cell">${formatDateBr(selectedDate)}</div></div><div class="timeline-grid" style="--days-count:1">`;
    hours.forEach((hour) => {
      html += `<div class="timeline-time">${hour}</div><div class="timeline-slot" data-date="${selectedDate}" data-hour="${hour}">${slotContent(selectedDate, hour)}</div>`;
    });
    html += '</div></div>';
    viewContainer.innerHTML = html;
    bindInteractions();
  }

  function renderWeekView() {
    const weekDates = getWeekDates(state.currentDate);
    const weekDateYmds = weekDates.map((date) => dateToYMD(date));
    const hours = timelineHoursForDates(weekDateYmds);
    if (!hours.length) {
      viewContainer.innerHTML = '<div class="empty-state">Não há horários configurados nesta semana.</div>';
      bindInteractions();
      return;
    }
    let html = `<div class="timeline-shell"><div class="timeline-header" style="--days-count:7"><div class="timeline-header-cell">Hora</div>${weekDates.map((date) => `<div class="timeline-header-cell">${formatDateBr(dateToYMD(date))}</div>`).join('')}</div><div class="timeline-grid" style="--days-count:7">`;
    hours.forEach((hour) => {
      html += `<div class="timeline-time">${hour}</div>`;
      weekDates.forEach((date) => {
        const ymd = dateToYMD(date);
        const isVisible = visibleHoursForDate(ymd).includes(hour);
        html += isVisible
          ? `<div class="timeline-slot" data-date="${ymd}" data-hour="${hour}">${slotContent(ymd, hour)}</div>`
          : `<div class="timeline-slot timeline-slot--inactive"><div class="timeline-slot-inner"><div class="slot-empty-state">Fora do horário</div></div></div>`;
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
      html += `<div class="month-day" data-month-date="${ymd}"><div class="month-day-number">${date.getDate()}</div>${items.map((item) => `<div class="month-mini-card" data-month-date="${ymd}" style="border-left-color:${item.status_color || statusColor(item.status)};background:${statusBackgroundFromColor(item.status_color || statusColor(item.status))}"><div class="month-mini-card__head"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="status-pill-inline" style="--pill:${item.status_color || statusColor(item.status)}">${item.status_label || labelStatus(item.status)}</span>${isPackageAppointment(item) ? `<span class="status-pill-inline" style="--pill:${darkenHexColor(item.status_color || statusColor(item.status), 0.08)}">📦 ${escapeHtml(packageSessionLabel(item) || 'Pacote')}</span>` : ''}</div>${isPackageAppointment(item) ? `<span class="status-pill-inline" style="--pill:${darkenHexColor(item.status_color || statusColor(item.status), 0.08)}">📦 ${escapeHtml(packageSessionLabel(item) || 'Pacote')}</span>` : ''}</div><div class="month-mini-card__menu-shell"><button class="month-mini-card__menu" type="button" data-menu-toggle aria-label="Abrir ações">⋯</button><div class="appointment-menu" data-menu>${menuMarkup(item)}</div></div></div><div class="month-mini-card__pet-row"><div class="card-avatar-group">${appointmentAvatarMarkup(item)}</div><div class="month-mini-card__pet-name">${escapeHtml(item.pet || '-')}</div></div><div class="month-mini-card__hour">⏰ ${canonicalHourLabel(item.hour || '')}</div><div class="appointment-meta-list appointment-meta-list--compact">${appointmentInfoRowsMarkup(item, { compact: true })}</div></div>`).join('')}</div>`;
    }
    html += '</div></div>';
    viewContainer.innerHTML = html;
    bindInteractions();
  }

  function cardsVisibleItems() {
    const selectedDate = dateToYMD(state.currentDate);
    return filteredItems().filter((item) => item.date === selectedDate);
  }

  function renderCardsView() {
    const statuses = (state.meta.session_statuses || []).length ? state.meta.session_statuses : [{ name: 'Agendado', code: 'agendado', color: '#1F8560' }];
    const items = cardsVisibleItems();
    viewContainer.innerHTML = `<div class="cards-board">${statuses.map((status) => {
      const code = normalize(status.code || status.name);
      const columnItems = items.filter((item) => normalize(item.status) === code);
      return `
        <section class="cards-column" data-status-column="${code}" data-status-value="${status.name}">
          <header class="cards-column-header" style="--column-color:${status.color || '#8F8866'}">
            <div>
              <strong>${status.name}</strong>
              <span>${columnItems.length} item(ns)</span>
            </div>
          </header>
          <div class="cards-column-body">
            ${columnItems.length ? columnItems.map((item) => `
              <article class="appointment-card" draggable="true" data-card-id="${item.id}" data-open-id="${item.id}" style="border-color:${item.status_color || statusColor(item.status)}33;background:${statusBackgroundFromColor(item.status_color || statusColor(item.status))}">
                <div class="card-top-row">
                  <span class="status-pill-inline" style="--pill:${item.status_color || statusColor(item.status)}">${item.status_label || labelStatus(item.status)}</span>
                  <div class="card-menu-shell">
                    <button class="card-menu-toggle" type="button" data-menu-toggle aria-label="Abrir ações">⋯</button>
                    <div class="appointment-menu" data-menu>
                      ${menuMarkup(item)}
                    </div>
                  </div>
                </div>
                <div class="card-pet-row">
                  <div class="card-avatar-group">${appointmentAvatarMarkup(item)}</div>
                  <div class="card-title">${escapeHtml(item.pet || '-')}</div>
                </div>
                <div class="card-meta">
                  <div><span class="appointment-meta-icon" aria-hidden="true">✂️</span><span>${escapeHtml(item.service || '-')}</span></div>
                  <div><span class="appointment-meta-icon" aria-hidden="true">👤</span><span>${escapeHtml(item.tutor || '-')}</span></div>
                  <div><span class="appointment-meta-icon" aria-hidden="true">💬</span><span>${escapeHtml(item.phone_display || formatPhoneDisplay(item.phone) || '-')}</span></div>
                  <div><span class="appointment-meta-icon" aria-hidden="true">💳</span><span>${escapeHtml(paymentLabel(item.payment_status, item.payment_method))}</span></div>
                </div>
              </article>`).join('') : '<div class="cards-column-empty">Arraste agendamentos para esta sessão.</div>'}
          </div>
        </section>`;
    }).join('')}</div>`;
    bindInteractions();
  }

  function render() {
    renderCurrentPeriod();
    toggleNewAppointmentAvailability();
    if (state.currentView === 'day') renderDayView();
    else if (state.currentView === 'week') renderWeekView();
    else if (state.currentView === 'month') renderMonthView();
    else renderCardsView();
  }

  function groupNodes() {
    return [...appointmentGroups.querySelectorAll('.appointment-group-card')];
  }

  function selectedPetsFromGroups() {
    return groupNodes().map((group) => {
      const petId = group.querySelector('.pet-select')?.value || '';
      return (state.tutorPets.length ? state.tutorPets : state.meta.pets || []).find((item) => String(item.id) === String(petId));
    }).filter(Boolean);
  }

  function allowedServicesForPet(petId = '') {
    const pet = (state.tutorPets.length ? state.tutorPets : state.meta.pets || []).find((item) => String(item.id) === String(petId));
    if (!pet) return [];
    const sizeId = pet.size_id ? String(pet.size_id) : '';
    const sizeLabel = normalize(pet.size || '');
    return (state.meta.services || []).filter((service) => {
      const serviceSizeId = service.pet_size_id ? String(service.pet_size_id) : '';
      const serviceSizeLabel = normalize(service.pet_size_label || service.pet_size_name || service.size || '');
      if (serviceSizeId && sizeId && serviceSizeId === sizeId) return true;
      if (serviceSizeLabel && sizeLabel && serviceSizeLabel === sizeLabel) return true;
      return false;
    });
  }

  function buildPetOptions(selectedId = '') {
    const selectedTutorId = tutorIdInput.value;
    const source = state.tutorPets.length ? state.tutorPets : (state.meta.pets || []);
    const pets = source.filter((pet) => !selectedTutorId || !pet.tutor_id || pet.tutor_id === selectedTutorId);
    return ['<option value="">Selecione o pet</option>']
      .concat(pets.map((pet) => `<option value="${pet.id}" ${String(selectedId) === String(pet.id) ? 'selected' : ''}>${pet.name}</option>`))
      .join('');
  }

  function buildServiceOptionsForPet(petId = '', selectedId = '') {
    const services = allowedServicesForPet(petId);
    return ['<option value="">Selecione o serviço</option>']
      .concat(services.map((service) => `<option value="${service.id}" ${String(selectedId) === String(service.id) ? 'selected' : ''}>${service.name}</option>`))
      .join('');
  }

  function updatePetMeta(card) {
    const select = card?.querySelector('.pet-select');
    const meta = card?.querySelector('.pet-meta');
    if (!select || !meta) return;
    const pet = (state.tutorPets.length ? state.tutorPets : state.meta.pets || []).find((item) => String(item.id) === String(select.value));
    meta.textContent = pet ? `${pet.breed || 'Raça não informada'} • ${pet.size || 'Porte não informado'}` : 'Selecione um pet para liberar os serviços do porte cadastrado.';
  }

  function updateServiceMeta(card) {
    const select = card?.querySelector('.service-select');
    const meta = card?.querySelector('.service-meta');
    if (!select || !meta) return;
    const service = (state.meta.services || []).find((item) => String(item.id) === String(select.value));
    meta.textContent = service
      ? `${service.category || 'Sem categoria'} • ${money(service.price_cents)} • ${service.duration_minutes || 0} min`
      : 'Selecione um serviço disponível para o porte do pet escolhido.';
  }

  function refreshGroupServices(group) {
    const petId = group.querySelector('.pet-select')?.value || '';
    group.querySelectorAll('.service-select').forEach((select) => {
      const selected = select.value;
      select.innerHTML = buildServiceOptionsForPet(petId, selected);
      if (selected && ![...select.options].some((opt) => opt.value === selected)) select.value = '';
      updateServiceMeta(select.closest('.agenda-row-card'));
    });
  }

  function refreshAppointmentGroups() {
    groupNodes().forEach((group, index) => {
      const petSelect = group.querySelector('.pet-select');
      const currentPet = petSelect?.value || '';
      if (petSelect) {
        petSelect.innerHTML = buildPetOptions(currentPet);
        if (currentPet && [...petSelect.options].some((opt) => opt.value === currentPet)) petSelect.value = currentPet;
      }
      updatePetMeta(group);
      refreshGroupServices(group);
      const title = group.querySelector('.appointment-group-title');
      if (title) title.textContent = `Pet do agendamento ${index + 1}`;
      const removeBtn = group.querySelector('.remove-group');
      if (removeBtn) removeBtn.hidden = groupNodes().length <= 1;
    });
    updateCommandSummary();
  }

  function addServiceRowToGroup(group, service = null) {
    const servicesContainer = group.querySelector('.service-rows');
    const node = serviceTemplate.content.firstElementChild.cloneNode(true);
    const select = node.querySelector('.service-select');
    const petId = group.querySelector('.pet-select')?.value || '';
    select.required = true;
    select.innerHTML = buildServiceOptionsForPet(petId, service?.id);
    if (service?.id) select.value = service.id;
    select.addEventListener('change', () => { updateServiceMeta(node); updateCommandSummary(); });
    node.querySelector('.remove-row').addEventListener('click', () => { node.remove(); updateCommandSummary(); });
    servicesContainer.appendChild(node);
    updateServiceMeta(node);
  }

  function addAppointmentGroup(groupData = null) {
    const node = appointmentGroupTemplate.content.firstElementChild.cloneNode(true);
    const petSelect = node.querySelector('.pet-select');
    petSelect.required = true;
    petSelect.innerHTML = buildPetOptions(groupData?.pet?.id);
    if (groupData?.pet?.id) petSelect.value = groupData.pet.id;
    petSelect.addEventListener('change', () => {
      updatePetMeta(node);
      refreshGroupServices(node);
      updateCommandSummary();
    });
    node.querySelector('.remove-group').addEventListener('click', () => {
      if (groupNodes().length <= 1) return;
      node.remove();
      refreshAppointmentGroups();
    });
    node.querySelector('.add-service-to-group').addEventListener('click', () => {
      addServiceRowToGroup(node);
      updateCommandSummary();
    });
    appointmentGroups.appendChild(node);
    updatePetMeta(node);
    const services = Array.isArray(groupData?.services) && groupData.services.length ? groupData.services : [null];
    services.forEach((service) => addServiceRowToGroup(node, service));
    refreshAppointmentGroups();
  }

  function resetForm() {
    form.hidden = false;
    detailsView.hidden = true;
    state.editing = null;
    modalTitle.textContent = 'Novo agendamento';
    modalSubtitle.textContent = 'Comece pelo WhatsApp, escolha o pet e monte os serviços por porte.';
    tutorIdInput.value = '';
    whatsappInput.value = '';
    clientNameInput.value = '';
    dateInput.value = currentDateYmd();
    timeInput.value = '09:00';
    notesInput.value = '';
    paymentStatusInput.value = 'pendente';
    paymentMethodInput.value = '';
    feedback.textContent = 'Digite o WhatsApp ou nome para buscar cliente e pets já cadastrados.';
    feedback.className = 'agenda-inline-help';
    state.tutorPets = [];
    appointmentStatus.value = normalize((state.meta.session_statuses[0] || {}).name || 'Agendado');
    appointmentStaff.value = '';
    appointmentGroups.innerHTML = '';
    addAppointmentGroup();
    deleteBtn.style.display = 'none';
    printBtn.style.display = 'none';
    applyPastAppointmentEditingRules(null);
    updateCommandSummary();
  }

  async function lookupCustomerByPhone() {
    clearFormAlert();
    const phone = whatsappInput.value.trim();
    const customerName = clientNameInput.value.trim();
    const searchTerm = phone || customerName;
    if (!searchTerm) {
      feedback.textContent = 'Informe o WhatsApp ou nome para buscar o cliente.';
      feedback.className = 'agenda-inline-help agenda-inline-help--warning';
      return;
    }
    try {
      openLoadingModal('Buscando cliente cadastrado...');
      const result = await api.get(`/api/tenant/tutors?search=${encodeURIComponent(searchTerm)}`);
      const items = result.items || [];
      const normalizedPhone = normalize(phone);
      const normalizedName = normalize(customerName);
      const exact = items.find((item) => normalizedPhone && (normalize(item.phone) === normalizedPhone || normalize(item.phone_secondary) === normalizedPhone))
        || items.find((item) => normalizedName && normalize(item.full_name) === normalizedName)
        || items.find((item) => normalizedName && normalize(item.full_name).includes(normalizedName))
        || items[0];
      if (!exact) {
        tutorIdInput.value = '';
        state.tutorPets = [];
        refreshAppointmentGroups();
        feedback.textContent = 'Cliente não encontrado. Cadastre o cliente primeiro para continuar o agendamento.';
        feedback.className = 'agenda-inline-help agenda-inline-help--warning';
        showAgendaLookupModal({
          title: 'Cliente não encontrado',
          message: 'Não localizamos esse cliente no cadastro. Você será direcionado para Clientes para fazer o cadastro.',
          type: 'error',
          buttonText: 'Ir para Clientes',
          onClose: () => { window.location.href = '/tenant/tutores'; }
        });
        return;
      }
      const details = await api.get(`/api/tenant/tutors/${exact.id}`);
      tutorIdInput.value = exact.id;
      clientNameInput.value = exact.full_name || customerName;
      whatsappInput.value = applyPhoneMask(exact.phone || phone);
      state.tutorPets = (details.pets || []).map((pet) => ({ ...pet, tutor_id: exact.id }));
      refreshAppointmentGroups();
      feedback.textContent = `${exact.full_name} encontrado. ${state.tutorPets.length} pet(s) carregado(s) do cadastro.`;
      feedback.className = 'agenda-inline-help agenda-inline-help--success';
      showAgendaLookupModal({
        title: 'Cliente encontrado',
        message: `${exact.full_name} foi localizado e os dados do cadastro foram preenchidos automaticamente.`,
        type: 'success',
        buttonText: 'Continuar'
      });
    } catch (error) {
      closeFeedbackModal();
      feedback.textContent = friendlyErrorMessage(error, 'Não foi possível buscar o cliente agora.');
      feedback.className = 'agenda-inline-help agenda-inline-help--warning';
      showFormAlert(friendlyErrorMessage(error, 'Não foi possível buscar o cliente agora.'));
    }
  }

  function gatherFormPayload() {
    const appointmentItems = groupNodes().map((group) => {
      const petId = group.querySelector('.pet-select')?.value || '';
      const pet = (state.tutorPets.length ? state.tutorPets : state.meta.pets || []).find((item) => String(item.id) === String(petId));
      const services = [...group.querySelectorAll('.service-select')]
        .map((select) => (state.meta.services || []).find((item) => String(item.id) === String(select.value)) || null)
        .filter(Boolean)
        .map((service) => ({ id: service.id, name: service.name, category: service.category, price_cents: service.price_cents, duration_minutes: service.duration_minutes, pet_size_id: service.pet_size_id, pet_size_label: service.pet_size_label || service.pet_size_name }));
      if (!pet) return null;
      return {
        pet_id: pet.id,
        pet_name: pet.name,
        breed: pet.breed || '',
        size: pet.size || '',
        pets: [{ id: pet.id, name: pet.name, breed: pet.breed, size: pet.size, size_id: pet.size_id }],
        service_id: services[0]?.id,
        service_name: services.map((item) => item.name).join(' • '),
        services
      };
    }).filter(Boolean);

    const firstItem = appointmentItems[0] || {};
    return {
      tutor_id: tutorIdInput.value || undefined,
      tutor_name: clientNameInput.value,
      phone: whatsappInput.value,
      pet_id: firstItem.pet_id,
      pet_name: firstItem.pet_name || '',
      service_id: firstItem.service_id,
      service_name: firstItem.service_name || '',
      staff_name: appointmentStaff.value,
      staff_user_id: appointmentStaff.selectedOptions[0]?.dataset?.id || undefined,
      scheduled_at: currentSlotString(),
      status: appointmentStatus.value,
      notes: notesInput.value,
      payment_status: paymentStatusInput.value || 'pendente',
      payment_method: normalize(paymentMethodInput.value || ''),
      breed: firstItem.breed || '',
      size: firstItem.size || '',
      pets: firstItem.pets || [],
      services: firstItem.services || [],
      appointment_items: appointmentItems
    };
  }

  function updateCommandSummary() {
    const payload = gatherFormPayload();
    const groups = payload.appointment_items || [];
    if (!groups.length) {
      commandSummary.textContent = `Selecione ao menos um pet e os serviços desejados • ${paymentLabel(paymentStatusInput.value, paymentMethodInput.value)}`;
      return;
    }
    const total = groups.reduce((sum, group) => sum + (group.services || []).reduce((acc, service) => acc + Number(service.price_cents || 0), 0), 0);
    const label = groups.map((group) => `${group.pet_name || 'Pet'}: ${(group.services || []).map((service) => service.name).join(', ') || 'sem serviço'}`).join(' • ');
    commandSummary.textContent = `${label} • total ${money(total)} • ${paymentLabel(paymentStatusInput.value, paymentMethodInput.value)}`;
  }

  function applyPastAppointmentEditingRules(item = null) {
    const pastAppointment = !!item && isPastAppointment(item);
    const lockTargets = [
      whatsappInput,
      clientNameInput,
      dateInput,
      timeInput,
      notesInput,
      appointmentStaff,
      tutorIdInput
    ].filter(Boolean);
    lockTargets.forEach((field) => { field.disabled = pastAppointment; });
    groupNodes().forEach((group) => {
      group.querySelectorAll('.pet-select, .service-select, .remove-group, .add-service-to-group').forEach((field) => {
        field.disabled = pastAppointment;
      });
    });
    const addGroupBtn = el('btn-add-appointment-group');
    if (addGroupBtn) addGroupBtn.disabled = pastAppointment;
  }

  function openModal(item = null) {
    modal.style.display = 'flex';
    clearFormAlert();
    if (!item || item.scheduled_at_prefill) {
      resetForm();
      if (item?.scheduled_at_prefill) {
        const [prefillDate, prefillHour] = String(item.scheduled_at_prefill).split('T');
        if (prefillDate) dateInput.value = prefillDate;
        if (prefillHour) timeInput.value = prefillHour.slice(0, 5);
      }
      printBtn.textContent = 'Exibir comanda';
      updateCommandSummary();
      return;
    }
    state.editing = item;
    modalTitle.textContent = `Agendamento • ${item.pet}`;
    modalSubtitle.textContent = `${formatDateTimeLabel(item.date, item.hour) || '-'} • ${item.ticket_code || 'Comanda automática'}`;
    tutorIdInput.value = item.tutor_id || '';
    whatsappInput.value = item.phone || '';
    clientNameInput.value = item.tutor || '';
    dateInput.value = item.date;
    timeInput.value = canonicalHourLabel(item.hour) || '09:00';
    notesInput.value = item.notes || '';
    paymentStatusInput.value = item.payment_status || 'pendente';

    appointmentStatus.value = normalize(item.status);
    const staffOption = [...appointmentStaff.options].find((option) => String(option.dataset.id || '') === String(item.staff_user_id || ''))
      || [...appointmentStaff.options].find((option) => normalize(option.value) === normalize(item.staff || ''));
    appointmentStaff.value = staffOption?.value || '';
    paymentMethodInput.value = normalize(item.payment_method || '');
    state.tutorPets = item.tutor_id ? (state.meta.pets || []).filter((pet) => pet.tutor_id === item.tutor_id) : [];
    appointmentGroups.innerHTML = '';
    addAppointmentGroup({
      pet: (item.pets?.length ? item.pets[0] : { id: item.pet_id, name: item.pet, breed: item.breed, size: item.size }),
      services: item.services?.length ? item.services : [{ id: item.service_id, name: item.service }]
    });
    deleteBtn.style.display = isPastAppointment(item) ? 'none' : '';
    printBtn.style.display = '';
    printBtn.textContent = isPaidAppointment(item) ? 'Exibir recibo' : 'Exibir comanda';
    feedback.textContent = isPastAppointment(item) ? 'Agendamento passado: status, pagamento e forma de pagamento podem ser alterados.' : 'Edite os dados do atendimento e salve para atualizar a agenda.';
    feedback.className = isPastAppointment(item) ? 'agenda-inline-help agenda-inline-help--warning' : 'agenda-inline-help';
    applyPastAppointmentEditingRules(item);
    updateCommandSummary();
  }

  function closeModal() { clearFormAlert(); modal.style.display = 'none'; state.editing = null; }

  function sameNormalizedValue(left, right) {
    return normalize(left) === normalize(right);
  }

  function sameArraySignature(left, right, key = 'id') {
    const leftSignature = (Array.isArray(left) ? left : []).map((item) => String(item?.[key] || item?.name || '')).filter(Boolean).sort().join('|');
    const rightSignature = (Array.isArray(right) ? right : []).map((item) => String(item?.[key] || item?.name || '')).filter(Boolean).sort().join('|');
    return leftSignature === rightSignature;
  }

  function buildEditDiff(currentItem, payload) {
    const currentDate = String(currentItem?.date || '');
    const currentHour = canonicalHourLabel(currentItem?.hour || '');
    const nextDate = String(dateInput.value || currentDate);
    const nextHour = canonicalHourLabel(timeInput.value || currentHour);
    const coreChanged = [
      !sameNormalizedValue(payload.tutor_name, currentItem?.tutor),
      !sameNormalizedValue(payload.phone, currentItem?.phone),
      !sameNormalizedValue(payload.staff_name, currentItem?.staff),
      !sameNormalizedValue(payload.notes, currentItem?.notes),
      !sameNormalizedValue(payload.payment_status, currentItem?.payment_status),
      !sameNormalizedValue(payload.payment_method, currentItem?.payment_method),
      !sameArraySignature(payload.pets, currentItem?.pets),
      !sameArraySignature(payload.services, currentItem?.services)
    ].some(Boolean);
    return {
      statusChanged: !sameNormalizedValue(payload.status, currentItem?.status),
      scheduleChanged: nextDate !== currentDate || nextHour !== currentHour,
      coreChanged
    };
  }

  async function saveAppointment() {
    clearFormAlert();
    whatsappInput.value = applyPhoneMask(whatsappInput.value);
    const payload = gatherFormPayload();
    if (!form.reportValidity()) {
      showFormAlert('Preencha os campos obrigatórios destacados para salvar o agendamento.');
      focusFirstInvalidField();
      return;
    }
    if (!(payload.appointment_items || []).length || (payload.appointment_items || []).some((item) => !item.pet_id || !(item.services || []).length)) {
      showFormAlert('Selecione um pet e ao menos um serviço em cada bloco para salvar o agendamento.');
      return;
    }
    if (payload.payment_status === 'pago' && !payload.payment_method) {
      showFormAlert('Selecione a forma de pagamento quando o agendamento estiver marcado como pago.');
      paymentMethodInput.focus();
      return;
    }

    const previousStatus = state.editing ? normalize(state.editing.status) : '';
    const nextStatus = normalize(payload.status);

    if (state.editing) {
      if ((payload.appointment_items || []).length !== 1) {
        showFormAlert('Ao editar um agendamento existente, mantenha apenas um pet neste atendimento. Para outro pet, crie um novo agendamento.');
        return;
      }
      const sameDate = String(dateInput.value || '') === String(state.editing.date || '');
      const sameTime = canonicalHourLabel(timeInput.value || '') === canonicalHourLabel(state.editing.hour || '');
      if (sameDate && sameTime && state.editing.scheduled_at) {
        payload.scheduled_at = state.editing.scheduled_at;
      }
      if (!payload.tutor_id && state.editing.tutor_id) payload.tutor_id = state.editing.tutor_id;
      if (!payload.pet_id && state.editing.pet_id) payload.pet_id = state.editing.pet_id;
      if (!payload.service_id && state.editing.service_id) payload.service_id = state.editing.service_id;
      if (!payload.tutor_name && state.editing.tutor) payload.tutor_name = state.editing.tutor;
      if (!payload.pet_name && state.editing.pet) payload.pet_name = state.editing.pet;
      if (!payload.service_name && state.editing.service) payload.service_name = state.editing.service;
      if (!payload.phone && state.editing.phone) payload.phone = state.editing.phone;
      if ((!payload.pets || !payload.pets.length) && Array.isArray(state.editing.pets) && state.editing.pets.length) payload.pets = state.editing.pets;
      if ((!payload.services || !payload.services.length) && Array.isArray(state.editing.services) && state.editing.services.length) payload.services = state.editing.services;
      if (isPastAppointment(state.editing)) {
        payload.tutor_id = state.editing.tutor_id;
        payload.tutor_name = state.editing.tutor || payload.tutor_name;
        payload.phone = state.editing.phone || payload.phone;
        payload.pet_id = state.editing.pet_id;
        payload.pet_name = state.editing.pet || payload.pet_name;
        payload.service_id = state.editing.service_id;
        payload.service_name = state.editing.service || payload.service_name;
        payload.staff_name = state.editing.staff || payload.staff_name;
        payload.staff_user_id = state.editing.staff_user_id || payload.staff_user_id;
        payload.status = payload.status || state.editing.status;
        payload.notes = state.editing.notes || '';
        payload.breed = state.editing.breed || payload.breed;
        payload.size = state.editing.size || payload.size;
        payload.pets = Array.isArray(state.editing.pets) && state.editing.pets.length ? state.editing.pets : payload.pets;
        payload.services = Array.isArray(state.editing.services) && state.editing.services.length ? state.editing.services : payload.services;
        payload.appointment_items = [{
          pet_id: payload.pet_id,
          pet_name: payload.pet_name,
          breed: payload.breed || '',
          size: payload.size || '',
          pets: payload.pets || [],
          service_id: payload.service_id,
          service_name: payload.service_name || '',
          services: payload.services || []
        }];
        payload.scheduled_at = state.editing.scheduled_at || payload.scheduled_at;
      }
    }

    try {
      const editingId = state.editing?.id || null;
      let response = null;
      let savedItem = null;
      let shouldReloadAfterSave = !editingId;

      if (editingId) {
        const diff = buildEditDiff(state.editing, payload);
        shouldReloadAfterSave = false;
        const updatePayload = { ...payload };
        const localItem = state.items.find((entry) => String(entry.id) === String(editingId)) || state.editing;
        const onlyStatusChanged = diff.statusChanged && !diff.scheduleChanged && !diff.coreChanged;

        if (onlyStatusChanged) {
          shouldReloadAfterSave = false;
          const moveResponse = await api.patch(`/api/tenant/manage/agenda/${editingId}/move`, { status: payload.status });
          savedItem = mapAgendaApiItem({
            ...localItem,
            status: moveResponse?.status || payload.status,
            status_label: moveResponse?.status_label || labelStatus(payload.status),
            status_color: moveResponse?.status_color || statusColor(payload.status)
          });
        } else {
          if (diff.statusChanged) {
            await api.patch(`/api/tenant/manage/agenda/${editingId}/move`, { status: payload.status });
            upsertAgendaItemLocally({ ...state.editing, status: payload.status, status_label: labelStatus(payload.status), status_color: statusColor(payload.status) });
            delete updatePayload.status;
          }

          if (diff.scheduleChanged) {
            await api.patch(`/api/tenant/manage/agenda/${editingId}/move`, { scheduled_at: currentSlotString() });
            upsertAgendaItemLocally({ ...state.editing, date: dateInput.value, hour: canonicalHourLabel(timeInput.value), scheduled_at: currentSlotString() });
            delete updatePayload.scheduled_at;
          }

          if (diff.coreChanged) {
            response = await api.put(`/api/tenant/manage/agenda/${editingId}`, updatePayload);
            savedItem = mapAgendaApiItem(response?.item);
          } else {
            savedItem = mapAgendaApiItem({
              ...localItem,
              ...payload,
              date: dateInput.value || localItem?.date,
              hour: canonicalHourLabel(timeInput.value || localItem?.hour),
              scheduled_at: diff.scheduleChanged ? currentSlotString() : (localItem?.scheduled_at || payload.scheduled_at),
              status: diff.statusChanged ? payload.status : (localItem?.status || payload.status)
            });
          }
        }
      } else {
        response = await api.post('/api/tenant/manage/agenda', payload);
        const createdItems = Array.isArray(response?.items) ? response.items.map(mapAgendaApiItem).filter(Boolean) : [mapAgendaApiItem(response?.item)].filter(Boolean);
        createdItems.forEach((item) => upsertAgendaItemLocally(item));
        savedItem = createdItems[0] || null;
        shouldReloadAfterSave = true;
      }

      if (savedItem && editingId) upsertAgendaItemLocally(savedItem);

      if (state.filters.status && state.filters.status !== normalize(savedItem?.status || nextStatus)) {
        state.filters.status = '';
        if (statusFilter) statusFilter.value = '';
      }

      const targetDate = savedItem?.date
        || state.editing?.date
        || dateInput.value
        || currentDateYmd();

      if (targetDate && state.currentView !== 'month') {
        state.currentDate = localDateFromYmd(targetDate);
      }

      closeModal();

      if (shouldReloadAfterSave) {
        await loadAgenda({ keepCurrentDate: true });
        if (editingId) {
          const existsAfterReload = state.items.some((entry) => String(entry.id) === String(editingId));
          if (!existsAfterReload) {
            throw new Error('O agendamento foi salvo, mas não voltou na agenda. A atualização foi bloqueada para evitar sumiço visual. Reabra a agenda e confirme o registro.');
          }
        }
      } else {
        renderSummary();
        render();
        loadAgenda({ keepCurrentDate: true, silent: true }).catch(() => {});
      }
    } catch (error) {
      withFriendlyError(error, 'Não foi possível salvar o agendamento.');
    }
  }

  async function removeAppointment() {
    if (!state.editing || !confirm('Deseja cancelar este agendamento?')) return;
    try {
      await api.put(`/api/tenant/manage/agenda/${state.editing.id}`, { status: 'cancelado' });
      closeModal();
      await loadAgenda();
    } catch (error) {
      withFriendlyError(error, 'Não foi possível cancelar o agendamento.');
    }
  }


  function buildDocumentHtml(item) {
    const tenant = getTenantDocumentInfo();
    const rows = serviceRowsForDocument(item);
    const totals = serviceTotalsForItem(item);
    const packageInfo = packageFinancials(item);
    const paid = isPaidAppointment(item);
    const documentLabel = paid ? 'Recibo' : 'Comanda';
    const dateLabel = formatDateTimeLabel(item.date, item.hour) || '-';
    return `
      <div class="agenda-document-header">
        <div class="agenda-document-brand">
          <img src="${escapeHtml(tenant.logo)}" alt="${escapeHtml(tenant.brand)}" />
          <div>
            <h4>${escapeHtml(tenant.brand)}</h4>
            <p>${escapeHtml([tenant.addressLine, tenant.addressLine2, tenant.addressZip, tenant.addressComplement].filter(Boolean).join(' • ') || 'Endereço do pet shop não informado.')}</p>
            <p>${escapeHtml([tenant.whatsapp, tenant.support].filter(Boolean).join(' • '))}</p>
          </div>
        </div>
        <span class="agenda-document-type">${documentLabel}</span>
      </div>
      <div class="agenda-document-summary">
        <div class="agenda-document-pill"><span>Documento</span><strong>${documentLabel}${item.ticket_code ? ` • #${escapeHtml(item.ticket_code)}` : ''}</strong></div>
        <div class="agenda-document-pill"><span>Data do atendimento</span><strong>${escapeHtml(dateLabel || '-')}</strong></div>
        <div class="agenda-document-pill"><span>Pagamento</span><strong>${escapeHtml(paymentLabel(item.payment_status, item.payment_method))}</strong></div>
        <div class="agenda-document-pill"><span>${isPackageAppointment(item) ? 'Valor com desconto' : 'Total dos serviços'}</span><strong>${money(isPackageAppointment(item) ? packageInfo.totalWith || totals.totalCents : totals.totalCents)}</strong></div>
        ${isPackageAppointment(item) ? `<div class="agenda-document-pill"><span>Pacote</span><strong>${escapeHtml(packageSessionLabel(item) || 'Pacote ativo')}</strong></div>` : ''}
      </div>
      <div class="agenda-document-grid">
        <div class="agenda-document-card">
          <strong>Dados do atendimento</strong>
          <p><b>Código:</b> ${escapeHtml(item.ticket_code || 'Comanda automática')}</p>
          <p><b>Data:</b> ${escapeHtml(dateLabel || '-')}</p>
          <p><b>Status:</b> ${escapeHtml(item.status_label || labelStatus(item.status))}</p>
          <p><b>Pagamento:</b> ${escapeHtml(paymentLabel(item.payment_status, item.payment_method))}</p>
          <p><b>Colaborador:</b> ${escapeHtml(item.staff || 'Sem colaborador')}</p>
        </div>
        <div class="agenda-document-card">
          <strong>Dados do cliente</strong>
          <p><b>Cliente:</b> ${escapeHtml(item.tutor || item.tutor_name || '-')}</p>
          <p><b>WhatsApp:</b> ${escapeHtml(item.phone_display || formatPhoneDisplay(item.phone) || '-')}</p>
          <p><b>Total de pets:</b> ${petsFromItem(item).length}</p>
          <p><b>Quantidade de serviços:</b> ${rows.length}</p>${isPackageAppointment(item) ? `<p><b>Pacote:</b> ${escapeHtml(item.package_name || 'Pacote')} • ${escapeHtml(packageSessionLabel(item) || 'Sessão')}</p>` : ''}
        </div>
      </div>
      <table class="agenda-document-table">
        <thead>
          <tr>
            <th>Pet</th>
            <th>Dados do pet</th>
            <th>Serviço</th>
            <th>Tempo</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td><strong>${escapeHtml(row.pet?.name || 'Pet')}</strong></td>
              <td>${escapeHtml([row.pet?.breed || item.breed || 'Raça não informada', row.pet?.size || item.size || 'Porte não informado'].join(' • '))}</td>
              <td>${escapeHtml(row.service?.name || item.service || 'Serviço')}<br><small>${escapeHtml(row.service?.category || '')}</small></td>
              <td>${Number(row.service?.duration_minutes || 0) ? `${Number(row.service?.duration_minutes || 0)} min` : '-'}</td>
              <td>${money(row.service?.price_cents || 0)}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">Totais sem desconto</td>
            <td>${totals.totalMinutes ? `${totals.totalMinutes} min` : '-'}</td>
            <td>${money(isPackageAppointment(item) ? packageInfo.totalWithout || totals.totalCents : totals.totalCents)}</td>
          </tr>
          ${isPackageAppointment(item) ? `<tr><td colspan="4">Desconto do pacote (${Number(packageInfo.discountPercent || 0).toFixed(2).replace('.', ',')}%)</td><td>- ${money(packageInfo.discountValue)}</td></tr><tr><td colspan="4">Valor real do pacote (${rows.length} serviço(s))</td><td>${money(packageInfo.totalWith || totals.totalCents)}</td></tr>` : ''}
        </tfoot>
      </table>
      <div class="agenda-document-notes">
        <strong>Observações</strong>
        <p>${escapeHtml(item.notes || 'Sem observações registradas.')}</p>${isPackageAppointment(item) && item.is_last_package_session ? '<p><b>Renovação:</b> confirmar com o cliente se deseja renovar o pacote automaticamente ao concluir esta última sessão.</p>' : ''}
      </div>`;
  }

  function openDocumentModal(item) {
    const paid = isPaidAppointment(item);
    documentModalTitle.textContent = paid ? 'Recibo do atendimento' : 'Comanda do atendimento';
    documentModalSubtitle.textContent = `${item.pet || 'Pet'} • ${item.tutor || item.tutor_name || 'Cliente'} • ${formatDateTimeLabel(item.date, item.hour)}`.trim();
    documentContent.innerHTML = buildDocumentHtml(item);
    documentPdfBtn.textContent = paid ? 'Abrir PDF do recibo' : 'Abrir PDF da comanda';
    documentWhatsappBtn.textContent = paid ? 'Enviar recibo por WhatsApp' : 'Enviar comanda por WhatsApp';
    documentModal.dataset.itemId = item.id || '';
    documentModal.style.display = 'flex';
  }

  function closeDocumentModal() {
    if (documentModal) documentModal.style.display = 'none';
  }

  function printReceipt() {
    const payload = state.editing || gatherFormPayload();
    const item = state.editing ? payload : mapAgendaApiItem({
      ...payload,
      date: dateInput.value,
      hour: canonicalHourLabel(timeInput.value),
      ticket_code: payload.ticket_code || 'Comanda automática',
      tutor: payload.tutor_name,
      pet: payload.pet_name,
      service: payload.service_name,
      staff: payload.staff_name,
      status_label: labelStatus(payload.status),
      status_color: statusColor(payload.status)
    });
    openDocumentModal(item);
  }

  function openDocumentPdf() {
    const itemId = documentModal?.dataset?.itemId || state.editing?.id || '';
    const item = state.items.find((entry) => String(entry.id) === String(itemId)) || state.editing;
    if (!item) return;
    const paid = isPaidAppointment(item);
    const tenant = getTenantDocumentInfo();
    const totals = serviceTotalsForItem(item);
    const packageInfo = packageFinancials(item);
    const rows = serviceRowsForDocument(item);
    const statusBg = statusBackground(item.status || 'agendado');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${paid ? 'Recibo' : 'Comanda'}</title><style>
      body{font-family:Inter,Arial,sans-serif;padding:30px;color:#0f172a;background:#eef2f7;margin:0}*{box-sizing:border-box}
      .sheet{max-width:980px;margin:0 auto;background:#fff;border-radius:28px;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.12)}
      .hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:28px 32px;background:linear-gradient(135deg,#ffffff 0%,#f8fafc 50%,${statusBg} 100%);border-bottom:1px solid #e2e8f0}
      .brand{display:flex;gap:16px;align-items:flex-start}.brand img{width:84px;height:84px;object-fit:contain;background:#fff;border:1px solid #dbe4ee;border-radius:22px;padding:10px;box-shadow:0 10px 30px rgba(15,23,42,.08)}
      .brand h1{margin:0;font-size:28px}.brand p{margin:6px 0 0;color:#475569;line-height:1.55}
      .doc-type{display:inline-flex;align-self:flex-start;padding:10px 16px;border-radius:999px;background:${statusBg};color:#0f172a;font-weight:800;letter-spacing:.02em}
      .content{padding:28px 32px 32px}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}.pill{border:1px solid #e2e8f0;border-radius:20px;padding:16px 18px;background:linear-gradient(180deg,#ffffff 0%,#f8fbfa 100%);box-shadow:0 10px 28px rgba(15,23,42,.04)}.pill span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:8px}.pill strong{display:block;font-size:16px;line-height:1.35;color:#0f172a}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px}
      .card{border:1px solid #e2e8f0;border-radius:22px;padding:18px 20px;background:#fff;box-shadow:0 10px 28px rgba(15,23,42,.04)}
      .card strong{display:block;font-size:14px;color:#0f172a;margin-bottom:10px}.card p{margin:7px 0;color:#334155;line-height:1.5}
      .total{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-radius:22px;background:linear-gradient(135deg,#f8fafc 0%,#ffffff 100%);border:1px solid #e2e8f0;margin:0 0 18px}.total span{color:#475569}.total b{font-size:26px;color:#0f172a}
      table{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid #e2e8f0;border-radius:22px;margin-top:6px}
      th,td{padding:14px 12px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top} th{background:#f8fafc;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#64748b}
      tbody tr:nth-child(even) td{background:#fcfdff} tfoot td{font-weight:800;background:#f8fafc}
      .notes{margin-top:18px;border:1px dashed #cbd5e1;border-radius:22px;padding:18px;background:#fafafa;color:#334155}
      .footer{padding:0 32px 28px;color:#64748b;font-size:13px}
      @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0;max-width:none}}@media (max-width:900px){.summary{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:640px){.summary,.grid{grid-template-columns:1fr}}
    </style></head><body><div class="sheet">
      <div class="hero">
        <div class="brand">
          <img src="${escapeHtml(tenant.logo)}" alt="${escapeHtml(tenant.brand)}" />
          <div>
            <h1>${escapeHtml(tenant.brand)}</h1>
            <p>${escapeHtml([tenant.addressLine, tenant.addressLine2, tenant.addressZip, tenant.addressComplement].filter(Boolean).join(' • ') || 'Endereço do pet shop não informado.')}</p>
            <p>${escapeHtml([tenant.whatsapp, tenant.support].filter(Boolean).join(' • '))}</p>
          </div>
        </div>
        <span class="doc-type">${paid ? 'Recibo' : 'Comanda'}</span>
      </div>
      <div class="content">
        <div class="summary">
          <div class="pill"><span>Documento</span><strong>${paid ? 'Recibo' : 'Comanda'}${item.ticket_code ? ` • #${escapeHtml(item.ticket_code)}` : ''}</strong></div>
          <div class="pill"><span>Data do atendimento</span><strong>${escapeHtml(formatDateTimeLabel(item.date, item.hour) || '-')}</strong></div>
          <div class="pill"><span>Pagamento</span><strong>${escapeHtml(paymentLabel(item.payment_status, item.payment_method))}</strong></div>
          <div class="pill"><span>${isPackageAppointment(item) ? 'Valor com desconto' : 'Total dos serviços'}</span><strong>${money(isPackageAppointment(item) ? packageInfo.totalWith || totals.totalCents : totals.totalCents)}</strong></div>${isPackageAppointment(item) ? `<div class="pill"><span>Pacote</span><strong>${escapeHtml(packageSessionLabel(item) || 'Pacote ativo')}</strong></div>` : ''}
        </div>
        <div class="grid">
          <div class="card">
            <strong>Dados do atendimento</strong>
            <p><b>Código:</b> ${escapeHtml(item.ticket_code || 'Comanda automática')}</p>
            <p><b>Data:</b> ${escapeHtml(formatDateTimeLabel(item.date, item.hour) || '-')}</p>
            <p><b>Status:</b> ${escapeHtml(item.status_label || labelStatus(item.status))}</p>
            <p><b>Pagamento:</b> ${escapeHtml(paymentLabel(item.payment_status, item.payment_method))}</p>
            <p><b>Colaborador:</b> ${escapeHtml(item.staff || 'Sem colaborador')}</p>
          </div>
          <div class="card">
            <strong>Dados do cliente</strong>
            <p><b>Cliente:</b> ${escapeHtml(item.tutor || item.tutor_name || '-')}</p>
            <p><b>WhatsApp:</b> ${escapeHtml(item.phone_display || formatPhoneDisplay(item.phone) || '-')}</p>
            <p><b>Total de pets:</b> ${petsFromItem(item).length}</p>
            <p><b>Quantidade de serviços:</b> ${rows.length}</p>${isPackageAppointment(item) ? `<p><b>Pacote:</b> ${escapeHtml(item.package_name || 'Pacote')} • ${escapeHtml(packageSessionLabel(item) || 'Sessão')}</p>` : ''}${isPackageAppointment(item) ? `<p><b>Pacote:</b> ${escapeHtml(item.package_name || 'Pacote')} • ${escapeHtml(packageSessionLabel(item) || 'Sessão')}</p>` : ''}
          </div>
        </div>
        <div class="total"><span>${isPackageAppointment(item) ? 'Valor com desconto' : 'Total dos serviços'}</span><b>${money(isPackageAppointment(item) ? packageInfo.totalWith || totals.totalCents : totals.totalCents)}</b></div>
        <table>
          <thead><tr><th>Pet</th><th>Dados do pet</th><th>Serviço</th><th>Tempo</th><th>Valor</th></tr></thead>
          <tbody>${rows.map((row) => `
            <tr>
              <td><strong>${escapeHtml(row.pet?.name || 'Pet')}</strong></td>
              <td>${escapeHtml([row.pet?.breed || item.breed || 'Raça não informada', row.pet?.size || item.size || 'Porte não informado'].join(' • '))}</td>
              <td>${escapeHtml(row.service?.name || item.service || 'Serviço')}<br><small>${escapeHtml(row.service?.category || '')}</small></td>
              <td>${Number(row.service?.duration_minutes || 0) ? `${Number(row.service?.duration_minutes || 0)} min` : '-'}</td>
              <td>${money(row.service?.price_cents || 0)}</td>
            </tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="3">Totais sem desconto</td><td>${totals.totalMinutes ? `${totals.totalMinutes} min` : '-'}</td><td>${money(isPackageAppointment(item) ? packageInfo.totalWithout || totals.totalCents : totals.totalCents)}</td></tr>${isPackageAppointment(item) ? `<tr><td colspan="4">Desconto do pacote (${Number(packageInfo.discountPercent || 0).toFixed(2).replace('.', ',')}%)</td><td>- ${money(packageInfo.discountValue)}</td></tr><tr><td colspan="4">Valor real do pacote (${rows.length} serviço(s))</td><td>${money(packageInfo.totalWith || totals.totalCents)}</td></tr>` : ''}</tfoot>
        </table>
        <div class="notes"><strong>Observações</strong><p>${escapeHtml(item.notes || 'Sem observações registradas.')}</p>${isPackageAppointment(item) && item.is_last_package_session ? '<p><b>Renovação:</b> confirmar com o cliente se deseja renovar o pacote automaticamente ao concluir esta última sessão.</p>' : ''}</div>
      </div>
      <div class="footer">Documento gerado automaticamente pela plataforma LoopinPet para o pet shop assinante.</div>
    </div></body></html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  function sendDocumentToWhatsapp() {
    const itemId = documentModal?.dataset?.itemId || state.editing?.id || '';
    const item = state.items.find((entry) => String(entry.id) === String(itemId)) || state.editing;
    if (!item?.phone) return;
    const totals = serviceTotalsForItem(item);
    const label = isPaidAppointment(item) ? 'recibo' : 'comanda';
    const tenant = getTenantDocumentInfo();
    const petNames = petsFromItem(item).map((pet) => pet.name).filter(Boolean).join(', ');
    const serviceNames = servicesFromItem(item).map((service) => service.name).filter(Boolean).join(', ');
    const whenLabel = formatDateTimeLabel(item.date, item.hour) || '-';
    const message = `Olá, ${item.tutor || 'cliente'}! 🐾

Aqui é da ${tenant.brand}. Seguem os detalhes da ${label} do atendimento${item.ticket_code ? ` #${item.ticket_code}` : ''}.

• Pet(s): ${petNames || '-'}
• Serviço(s): ${serviceNames || '-'}
• Data: ${whenLabel || '-'}
• Pagamento: ${paymentLabel(item.payment_status, item.payment_method)}
• Total: ${money(totals.totalCents)}

Qualquer dúvida, estamos à disposição. 💚`;
    const digits = String(item.phone || '').replace(/\D+/g, '');
    window.open(`https://wa.me/55${digits}?text=${encodeURIComponent(message)}`, '_blank');
  }

  function appendAiAssistantMessage(title, text, meta = 'Agora', role = 'assistant') {
    if (!aiWidgetMessages) return;
    const bubble = document.createElement('div');
    bubble.className = `agenda-ai-bubble agenda-ai-bubble--${role === 'user' ? 'user' : 'assistant'}`;
    bubble.innerHTML = `<strong>${escapeHtml(title || (role === 'user' ? 'Você' : 'Assistente IA'))}</strong><div>${escapeHtml(text || '')}</div><span class="agenda-ai-bubble--meta">${escapeHtml(meta)}</span>`;
    aiWidgetMessages.appendChild(bubble);
    aiWidgetMessages.scrollTop = aiWidgetMessages.scrollHeight;
  }

  function agendaOperationalSnapshot() {
    const visible = filteredItems();
    const total = visible.length;
    const unpaid = visible.filter((item) => !isPaidAppointment(item)).length;
    const byStatus = new Map();
    visible.forEach((item) => {
      const key = labelStatus(item.status);
      byStatus.set(key, (byStatus.get(key) || 0) + 1);
    });
    const topStatus = [...byStatus.entries()].sort((a, b) => b[1] - a[1])[0];
    return { total, unpaid, topStatus: topStatus ? `${topStatus[0]} (${topStatus[1]})` : 'Nenhum status relevante' };
  }

  function aiPromptResponse(kind = 'slots') {
    const dashboard = state.ai.dashboard || {};
    const summary = dashboard.summary || {};
    const snapshot = agendaOperationalSnapshot();
    if (kind === 'reativacao') {
      return {
        title: 'Recuperação de clientes',
        text: `Priorize clientes inativos com pet de porte pequeno e ticket recorrente. Hoje a agenda filtrada tem ${snapshot.total} agendamentos e ${snapshot.unpaid} ainda sem pagamento. Sugestão: disparar oferta de terça/quarta com mimo e mensagem curta no WhatsApp.`
      };
    }
    if (kind === 'receita') {
      return {
        title: 'Aumentar ticket médio',
        text: `Use a comanda para oferecer complementos no checkout. O Gerente IA aponta ${summary.faturado ? `faturamento atual de R$ ${Number(summary.faturado).toFixed(2).replace('.', ',')}` : 'potencial de aumento de receita'} e recomenda empurrar pacotes recorrentes para quem já finalizou banho e tosa.`
      };
    }
    return {
      title: 'Preencher slots ociosos',
      text: `A leitura atual mostra ${snapshot.total} agendamentos na visão filtrada e o status dominante é ${snapshot.topStatus}. Foque nos próximos horários vazios com campanha relâmpago para base ativa e confirmação rápida dos ${snapshot.unpaid} pagamentos pendentes.`
    };
  }

  function setAiWidgetLoading(loading) {
    state.ai.loading = Boolean(loading);
    if (aiWidgetSend) {
      aiWidgetSend.disabled = state.ai.loading;
      aiWidgetSend.textContent = state.ai.loading ? 'Pensando...' : 'Enviar';
    }
    if (aiWidgetInput) aiWidgetInput.disabled = state.ai.loading;
  }

  async function sendAiChatMessage(message, meta = 'Chat da agenda') {
    const content = String(message || '').trim();
    if (!content || state.ai.loading) return;
    appendAiAssistantMessage('Você', content, meta, 'user');
    state.ai.history.push({ role: 'user', content });
    state.ai.history = state.ai.history.slice(-12);
    setAiWidgetLoading(true);
    setAiWidgetOpen(true);
    try {
      const token = getAuth()?.token || '';
      const http = await fetch('/api/tenant/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ message: content, history: state.ai.history })
      });
      const response = await http.json().catch(() => ({}));
      if (!http.ok) throw new Error(response?.error || 'Não consegui conversar com a IA agora.');
      const answer = response?.answer || 'Não consegui montar uma recomendação agora.';
      appendAiAssistantMessage(response?.provider === 'openai' ? 'Gerente IA' : 'Assistente da agenda', answer, response?.provider === 'openai' ? 'OpenAI' : 'Insight local', 'assistant');
      state.ai.history.push({ role: 'assistant', content: answer });
      state.ai.history = state.ai.history.slice(-12);
    } catch (error) {
      appendAiAssistantMessage('Assistente IA indisponível', error?.message || 'Não consegui responder agora.', 'Erro', 'assistant');
    } finally {
      if (aiWidgetInput) aiWidgetInput.value = '';
      setAiWidgetLoading(false);
    }
  }

  function rotateAiInsight() {
    const insights = state.ai.dashboard?.insights || [];
    if (!insights.length) return;
    const item = insights[Math.floor(Math.random() * insights.length)];
    appendAiAssistantMessage(item.title || 'Insight da IA', item.description || item.headline || 'A IA encontrou uma oportunidade de operação.', 'Insight automático');
  }

  async function initAiAssistantWidget() {
    if (!aiWidget || !aiWidgetMessages) return;
    appendAiAssistantMessage('Assistente IA pronto', 'Agora eu também posso conversar com você sobre slots vazios, clientes inativos, agenda dos próximos dias e ações práticas para o pet shop.', 'Inicialização');
    try {
      const dashboard = await api.get('/api/tenant/ai');
      state.ai.dashboard = dashboard || null;
      const firstInsight = dashboard?.insights?.[0];
      renderNotifications();
      if (firstInsight) appendAiAssistantMessage(firstInsight.title || 'Insight da IA', firstInsight.description || firstInsight.headline || '', 'Gerente IA');
      clearInterval(state.ai.rotationTimer);
      state.ai.rotationTimer = setInterval(rotateAiInsight, 45000);
    } catch (error) {
      renderNotifications();
      appendAiAssistantMessage('Assistente IA indisponível', 'Não consegui carregar os insights automáticos agora, mas continuo disponível com sugestões locais da agenda.', 'Fallback');
    }
  }

  function setAiWidgetOpen(open) {
    if (!aiWidgetPanel || !aiWidgetToggle) return;
    aiWidgetPanel.hidden = !open;
    aiWidgetToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function bindInteractions() {

    document.querySelectorAll('[data-open-id]').forEach((node) => node.addEventListener('click', (event) => {
      if (event.target.closest('[data-menu-toggle], [data-menu], .appointment-kebab')) return;
      const item = state.items.find((entry) => entry.id === node.dataset.openId);
      if (item) openModal(item);
    }));
    document.querySelectorAll('[data-month-date]').forEach((node) => node.addEventListener('click', (event) => {
      if (event.target.closest('[data-menu-toggle], [data-menu], .appointment-kebab')) return;
      const monthDate = node.dataset.monthDate;
      if (!monthDate) return;
      state.currentDate = localDateFromYmd(monthDate);
      state.currentView = 'day';
      document.querySelectorAll('.view-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === 'day'));
      renderSummary();
      render();
    }));
    document.querySelectorAll('.appointment-block').forEach((node) => node.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', node.dataset.id);
      event.dataTransfer.setData('application/x-drag-type', 'move-slot');
    }));
    document.querySelectorAll('.appointment-card').forEach((node) => node.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', node.dataset.cardId);
      event.dataTransfer.setData('application/x-drag-type', 'move-status');
    }));
    document.querySelectorAll('[data-new-slot-date][data-new-slot-hour]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation();
      openModal({ scheduled_at_prefill: `${button.dataset.newSlotDate}T${button.dataset.newSlotHour}` });
    }));
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
      if (button.dataset.action === 'document') openDocumentModal(item);
      if (button.dataset.action === 'delete' && confirm('Deseja cancelar este agendamento?')) {
        try { await api.put(`/api/tenant/manage/agenda/${item.id}`, { status: 'cancelado' }); await loadAgenda(); }
        catch (error) { openModal(item); showFormAlert(friendlyErrorMessage(error, 'Não foi possível cancelar o agendamento.')); }
      }
    }));
    document.querySelectorAll('[data-status-column]').forEach((column) => {
      const dropTargets = [column, column.querySelector('.cards-column-body')].filter(Boolean);
      const setHover = (active) => column.classList.toggle('drop-hover', active);
      dropTargets.forEach((target) => {
        target.addEventListener('dragover', (event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setHover(true);
        });
        target.addEventListener('dragleave', (event) => {
          if (!column.contains(event.relatedTarget)) setHover(false);
        });
        target.addEventListener('drop', async (event) => {
          event.preventDefault();
          setHover(false);
          const id = event.dataTransfer.getData('text/plain');
          const dragType = event.dataTransfer.getData('application/x-drag-type');
          if (dragType !== 'move-status' || !id) return;
          const item = state.items.find((entry) => String(entry.id) === String(id));
          if (!item) return;
          const targetStatus = column.dataset.statusValue || column.dataset.statusColumn;
          if (normalize(item.status) === normalize(targetStatus)) return;
          try {
            const response = await api.patch(`/api/tenant/manage/agenda/${id}/move`, { status: targetStatus });
            const currentItem = state.items.find((entry) => String(entry.id) === String(id));
            if (currentItem) {
              currentItem.status = normalize(response?.status || targetStatus);
              currentItem.status_label = response?.status_label || labelStatus(currentItem.status);
              currentItem.status_color = response?.status_color || statusColor(currentItem.status);
            }
            if (state.currentView === 'cards') {
              renderCardsView();
            } else {
              await loadAgenda();
            }
          } catch (error) {
            if (state.currentView !== 'cards') await loadAgenda();
            withFriendlyError(error, 'Não foi possível mover o agendamento para esta sessão.');
          }
        });
      });
    });
    document.querySelectorAll('.timeline-slot').forEach((slot) => {
      slot.addEventListener('dragover', (event) => {
        if (slot.classList.contains('timeline-slot--inactive') || isPastSlot(slot.dataset.date, slot.dataset.hour)) return;
        event.preventDefault();
        slot.classList.add('drop-hover');
      });
      slot.addEventListener('dragleave', () => slot.classList.remove('drop-hover'));
      slot.addEventListener('drop', async (event) => {
        event.preventDefault();
        slot.classList.remove('drop-hover');
        if (slot.classList.contains('timeline-slot--inactive') || isPastSlot(slot.dataset.date, slot.dataset.hour)) return;
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
    openDocumentModal(item);
  }

  document.querySelectorAll('.view-btn').forEach((btn) => btn.addEventListener('click', () => {
    document.querySelectorAll('.view-btn').forEach((item) => item.classList.remove('active'));
    btn.classList.add('active');
    state.currentView = btn.dataset.view;
    renderSummary();
    render();
  }));
  el('search-input').addEventListener('input', (event) => { state.filters.search = event.target.value; renderSummary(); render(); });
  statusFilter.addEventListener('change', (event) => { state.filters.status = event.target.value; renderSummary(); render(); });
  staffFilter.addEventListener('change', (event) => { state.filters.staff = event.target.value; renderSummary(); render(); });
  el('prev-period').addEventListener('click', () => {
    if (state.currentView === 'week') state.currentDate = addDays(state.currentDate, -7);
    else if (state.currentView === 'month') state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() - 1, 1, 12, 0, 0, 0);
    else state.currentDate = addDays(state.currentDate, -1);
    renderSummary();
    render();
  });
  el('next-period').addEventListener('click', () => {
    if (state.currentView === 'week') state.currentDate = addDays(state.currentDate, 7);
    else if (state.currentView === 'month') state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 1, 12, 0, 0, 0);
    else state.currentDate = addDays(state.currentDate, 1);
    renderSummary();
    render();
  });
  todayBtn?.addEventListener('click', () => { state.currentDate = todayLocalDate(); renderSummary(); render(); });
  agendaDatePickerBtn?.addEventListener('click', () => {
    if (!agendaDatePicker) return;
    if (typeof agendaDatePicker.showPicker === 'function') agendaDatePicker.showPicker();
    else agendaDatePicker.click();
  });
  agendaDatePicker?.addEventListener('change', (event) => { if (!event.target.value) return; state.currentDate = localDateFromYmd(event.target.value); renderSummary(); render(); });
  el('btn-new-appointment').addEventListener('click', () => { if (isPastDateYmd(currentDateYmd())) return; openModal(); });
  el('btn-find-customer').addEventListener('click', lookupCustomerByPhone);
  el('btn-add-appointment-group').addEventListener('click', () => { addAppointmentGroup(); updateCommandSummary(); });
  whatsappInput.addEventListener('input', () => { whatsappInput.value = applyPhoneMask(whatsappInput.value); });
  el('modal-close-btn').addEventListener('click', closeModal);
  el('modal-cancel-btn').addEventListener('click', closeModal);
  form?.addEventListener('submit', (event) => { event.preventDefault(); saveAppointment(); });
  saveBtn.addEventListener('click', saveAppointment);
  deleteBtn.addEventListener('click', removeAppointment);
  printBtn.addEventListener('click', printReceipt);
  documentCloseBtn?.addEventListener('click', closeDocumentModal);
  documentCloseFooterBtn?.addEventListener('click', closeDocumentModal);
  documentPdfBtn?.addEventListener('click', openDocumentPdf);
  documentWhatsappBtn?.addEventListener('click', sendDocumentToWhatsapp);
  paymentStatusInput.addEventListener('change', () => {
    updateCommandSummary();
    if (printBtn && state.editing) printBtn.textContent = normalize(paymentStatusInput.value) === 'pago' ? 'Exibir recibo' : 'Exibir comanda';
  });
  paymentMethodInput.addEventListener('change', updateCommandSummary);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  documentModal?.addEventListener('click', (event) => { if (event.target === documentModal) closeDocumentModal(); });
  aiWidgetToggle?.addEventListener('click', () => setAiWidgetOpen(aiWidgetPanel?.hidden));
  aiWidgetClose?.addEventListener('click', () => setAiWidgetOpen(false));
  document.querySelectorAll('[data-ai-prompt]').forEach((button) => button.addEventListener('click', () => {
    const local = aiPromptResponse(button.dataset.aiPrompt);
    appendAiAssistantMessage(local.title, local.text, 'Sugestão da agenda');
    sendAiChatMessage(local.title + ': ' + local.text, 'Ação rápida');
  }));
  aiWidgetForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    sendAiChatMessage(aiWidgetInput?.value || '', 'Pergunta');
  });

  openLoadingModal('Carregando agenda do pet shop...');
  Promise.all([loadMeta(), loadAgenda({ silent: true }), initAiAssistantWidget()])
    .catch((error) => {
      console.error(error);
      viewContainer.innerHTML = `<div class="empty-state">${error.message || 'Não foi possível carregar a agenda.'}</div>`;
    })
    .finally(() => {
      closeFeedbackModal();
    });
})();
