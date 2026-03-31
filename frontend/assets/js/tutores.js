import { api, openLoadingModal, closeFeedbackModal, runWithLoading } from './api.js';

const state = {
  items: [],
  status: 'active',
  search: '',
  selectedId: null,
  detail: null,
  openMenuId: null,
  editingId: null,
  photoUrl: '',
  detailTab: 'about',
  docPreview: null,
  openPaymentMenuId: null,
  paymentEditEntry: null,
  tenantBranding: null,
  paymentSort: { payments: { key: 'scheduled_at', dir: 'desc' }, history: { key: 'scheduled_at', dir: 'desc' } },
  clientSort: { key: 'full_name', dir: 'asc' }
};

const elements = {};

function initials(name = '') {
  return String(name).split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'CL';
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function digitsOnly(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function maskPhone(value = '') {
  const digits = digitsOnly(value).replace(/^55/, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function maskCpf(value = '') {
  const digits = digitsOnly(value).slice(0, 11);
  return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function maskCep(value = '') {
  const digits = digitsOnly(value).slice(0, 8);
  return digits.replace(/(\d{5})(\d)/, '$1-$2');
}

function money(value = 0) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(value = '') {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('invalid');
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
  } catch {
    const pure = String(value).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(pure)) {
      const [y, m, d] = pure.split('-');
      return `${d}/${m}/${y}`;
    }
    return pure;
  }
}

function fmtDateTime(value = '') {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('invalid');
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  } catch {
    return String(value);
  }
}

function phoneHref(value = '') {
  const digits = digitsOnly(value);
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function maskedPhoneIntl(value = '') {
  const masked = maskPhone(value);
  return masked ? `+55 ${masked}` : '—';
}

function rowAvatar(photo, name) {
  return photo
    ? `<span class="tutor-avatar"><img src="${photo}" alt="${escapeHtml(name)}" /></span>`
    : `<span class="tutor-avatar">${escapeHtml(initials(name))}</span>`;
}


function petAvatar(photo, name) {
  return photo
    ? `<span class="pet-card-avatar"><img src="${photo}" alt="${escapeHtml(name)}" /></span>`
    : `<span class="pet-card-avatar pet-card-avatar--initials">${escapeHtml(initials(name || 'Pet'))}</span>`;
}


function sortEntries(entries = [], tab = 'payments') {
  const sort = state.paymentSort?.[tab] || { key: 'scheduled_at', dir: 'desc' };
  const direction = sort.dir === 'asc' ? 1 : -1;
  const key = sort.key;
  const clone = [...entries];
  clone.sort((a, b) => {
    const servicesA = (a.services || []).map((service) => service.name || service.service_name).filter(Boolean).join(', ') || a.service_name || '';
    const servicesB = (b.services || []).map((service) => service.name || service.service_name).filter(Boolean).join(', ') || b.service_name || '';
    const mapValue = (entry) => {
      if (key === 'pet_name') return String(entry.pet_name || '').toLowerCase();
      if (key === 'services') return String((entry.services || []).map((service) => service.name || service.service_name).filter(Boolean).join(', ') || entry.service_name || '').toLowerCase();
      if (key === 'payment_status') return normalizePaymentStatus(entry.payment_status || '');
      if (key === 'status') return String(entry.status || '').toLowerCase();
      if (key === 'total_cents') return Number(entry.total_cents || 0);
      if (key === 'ticket_code') return String(entry.ticket_code || '').toLowerCase();
      return new Date(entry.scheduled_at || 0).getTime() || 0;
    };
    const av = mapValue(a);
    const bv = mapValue(b);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;
    return String(av).localeCompare(String(bv), 'pt-BR', { sensitivity: 'base' }) * direction;
  });
  return clone;
}

function sortLink(label, tab, key) {
  const current = state.paymentSort?.[tab] || {};
  const active = current.key === key;
  const dir = active ? current.dir : '';
  const icon = active ? (dir === 'asc' ? '↑' : '↓') : '↕';
  return `<button class="table-sort-link ${active ? 'is-active' : ''}" type="button" data-sort-tab="${tab}" data-sort-key="${key}" aria-label="Ordenar por ${label}">`
    + `<span class="table-sort-link__label">${label}</span>`
    + `<span class="table-sort-link__icon" aria-hidden="true">${icon}</span>`
    + `</button>`;
}

function sortClients(items = []) {
  const sort = state.clientSort || { key: 'full_name', dir: 'asc' };
  const direction = sort.dir === 'asc' ? 1 : -1;
  const key = sort.key;
  return [...items].sort((a, b) => {
    const mapValue = (entry) => {
      if (key === 'appointment_count') return Number(entry.appointment_count || 0);
      if (key === 'total_pending_cents') return Number(entry.total_pending_cents || 0);
      if (key === 'total_paid_cents') return Number(entry.total_paid_cents || 0);
      return String(entry.full_name || '').toLowerCase();
    };
    const av = mapValue(a);
    const bv = mapValue(b);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;
    return String(av).localeCompare(String(bv), 'pt-BR', { sensitivity: 'base' }) * direction;
  });
}

function clientSortLink(label, key) {
  const current = state.clientSort || {};
  const active = current.key === key;
  const dir = active ? current.dir : '';
  const icon = active ? (dir === 'asc' ? '↑' : '↓') : '↕';
  return `<button class="table-sort-link table-sort-link--compact ${active ? 'is-active' : ''}" type="button" data-client-sort-key="${key}" aria-label="Ordenar clientes por ${label}">`
    + `<span class="table-sort-link__label">${label}</span>`
    + `<span class="table-sort-link__icon" aria-hidden="true">${icon}</span>`
    + `</button>`;
}

function normalizePaymentStatus(value = '') {
  return String(value || '').trim().toLowerCase() === 'pago' ? 'pago' : 'pendente';
}

function ensureDocumentEntry(entry, forcedType = '') {
  if (!entry) return null;
  const paymentStatus = normalizePaymentStatus(entry.payment_status);
  const documentType = forcedType || (paymentStatus === 'pago' ? 'recibo' : 'comanda');
  return { ...entry, payment_status: paymentStatus, document_type: documentType };
}

function groupPackageEntries(entries = []) {
  const packageMap = new Map();
  const singles = [];
  entries.forEach((entry) => {
    const key = String(entry.customer_package_id || '').trim();
    const isPackage = (String(entry.booking_origin || '').toLowerCase() === 'pacote' || key) && key;
    if (!isPackage) {
      singles.push(entry);
      return;
    }
    const current = packageMap.get(key);
    const currentSession = Number(current?.package_session_number || 0);
    const nextSession = Number(entry?.package_session_number || 0);
    const currentTime = new Date(current?.scheduled_at || 0).getTime() || 0;
    const nextTime = new Date(entry?.scheduled_at || 0).getTime() || 0;
    const shouldReplace = !current
      || (nextSession > 0 && (currentSession === 0 || nextSession < currentSession))
      || (nextSession === currentSession && nextTime < currentTime)
      || (currentSession === 0 && nextSession === 0 && nextTime < currentTime);
    if (shouldReplace) packageMap.set(key, entry);
  });
  return [...singles, ...packageMap.values()];
}

function tenantDocumentInfo() {
  try {
    const auth = JSON.parse(localStorage.getItem('loopinpet.auth') || 'null') || {};
    const tenant = auth.tenant || {};
    const branding = state.tenantBranding?.tenant || {};
    const merged = {
      ...tenant,
      ...branding,
      logo_url: branding.logo_url || tenant.logo_url || tenant.logo,
      whatsapp_number: branding.whatsapp_number || tenant.whatsapp_number || tenant.whatsapp || tenant.phone,
      support_email: branding.support_email || tenant.support_email,
      address_line: branding.address_line || tenant.address_line || tenant.addressLine,
      address_number: branding.address_number || tenant.address_number || tenant.number,
      address_district: branding.address_district || tenant.address_district || tenant.district,
      address_city: branding.address_city || tenant.address_city || tenant.city,
      address_state: branding.address_state || tenant.address_state || tenant.state,
      address_zip: branding.address_zip || tenant.address_zip || tenant.cep || tenant.addressZip,
      address_complement: branding.address_complement || tenant.address_complement || tenant.complement
    };
    const address = [merged.address_line, merged.address_number, merged.address_district, merged.address_city, merged.address_state, merged.address_zip, merged.address_complement].filter(Boolean).join(' • ');
    return {
      brand: merged.business_name || merged.brand_name || merged.name || 'Pet Shop',
      logo: merged.logo_url || '../../assets/logo-loopinpet.png',
      whatsapp: maskedPhoneIntl(merged.whatsapp_number || merged.phone || ''),
      support: sanitizeContact(merged.support_email || merged.support_phone || merged.phone_secondary || ''),
      address
    };
  } catch {
    return { brand: 'Pet Shop', logo: '../../assets/logo-loopinpet.png', whatsapp: '—', support: '—', address: '' };
  }
}

function sanitizeContact(value = '') {
  const text = String(value || '').trim();
  if (!text) return '—';
  return text.includes('@') ? text : maskedPhoneIntl(text);
}

function openToast(message) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.add('is-open');
  clearTimeout(elements.toastTimer);
  elements.toastTimer = setTimeout(() => elements.toast.classList.remove('is-open'), 2800);
}

function positionOpenMenu() {
  if (!state.openMenuId) return;
  const toggle = document.querySelector(`[data-menu-toggle="${state.openMenuId}"]`);
  const menu = document.querySelector(`[data-row-menu="${state.openMenuId}"]`);
  if (!toggle || !menu) return;
  const rect = toggle.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const menuWidth = 252;
  const estimatedHeight = Math.max(menu.offsetHeight || 0, 300);
  const left = Math.min(Math.max(16, rect.right - menuWidth), viewportWidth - menuWidth - 16);
  const openUp = viewportHeight - rect.bottom < estimatedHeight + 24;
  menu.classList.toggle('row-menu--upward', openUp);
  menu.style.left = `${left}px`;
  menu.style.top = openUp ? `${Math.max(12, rect.top - estimatedHeight - 10)}px` : `${Math.min(viewportHeight - estimatedHeight - 12, rect.bottom + 10)}px`;
}


function positionOpenPaymentMenu() {
  if (!state.openPaymentMenuId) return;
  const toggle = document.querySelector(`[data-payment-menu-toggle="${state.openPaymentMenuId}"]`);
  const menu = document.querySelector(`[data-payment-row-menu="${state.openPaymentMenuId}"]`);
  if (!toggle || !menu) return;
  const rect = toggle.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const menuWidth = 220;
  const estimatedHeight = Math.max(menu.offsetHeight || 0, 196);
  const left = Math.min(Math.max(16, rect.right - menuWidth), viewportWidth - menuWidth - 16);
  const openUp = viewportHeight - rect.bottom < estimatedHeight + 24;
  menu.classList.toggle('row-menu--upward', openUp);
  menu.style.left = `${left}px`;
  menu.style.top = openUp ? `${Math.max(12, rect.top - estimatedHeight - 10)}px` : `${Math.min(viewportHeight - estimatedHeight - 12, rect.bottom + 10)}px`;
}

function renderSummary() {
  if (!elements.summary) return;
  const total = state.items.length;
  const active = state.items.filter((item) => item.is_active).length;
  const pets = state.items.reduce((acc, item) => acc + Number(item.pet_count || 0), 0);
  elements.summary.innerHTML = `
    <article class="client-summary-card"><span class="label">Clientes</span><strong>${total}</strong><small>Total retornado para o filtro atual.</small></article>
    <article class="client-summary-card"><span class="label">Ativos</span><strong>${active}</strong><small>Clientes disponíveis para operação.</small></article>
    <article class="client-summary-card"><span class="label">Pets vinculados</span><strong>${pets}</strong><small>Base atual associada aos clientes.</small></article>
  `;
}

function renderList() {
  const target = elements.list;
  if (!target) return;
  if (!state.items.length) {
    target.innerHTML = `<div class="empty-state">Nenhum cliente encontrado para este filtro.</div>`;
    return;
  }
  const sortedItems = sortClients(state.items);
  target.innerHTML = `
    <div class="clients-table-card clients-table-card--expanded">
      <div class="clients-table-header clients-table-header--metrics">
        <div>Foto</div>
        <div>Nome</div>
        <div>WhatsApp</div>
        <div>Status</div>
        <div>Qtd de pets</div>
        <div>${clientSortLink('Número de agendamentos', 'appointment_count')}</div>
        <div>${clientSortLink('Total pendentes', 'total_pending_cents')}</div>
        <div>${clientSortLink('Total pagos', 'total_paid_cents')}</div>
        <div class="clients-table-actions-label">Ações</div>
      </div>
      <div class="clients-table-body">
        ${sortedItems.map((item) => {
          const whatsapp = item.phone || item.phone_secondary;
          return `
            <article class="tutor-row tutor-row--table tutor-row--table-metrics" data-row-id="${item.id}">
              <div class="clients-cell clients-cell--photo">${rowAvatar(item.photo_url, item.full_name)}</div>
              <div class="clients-cell clients-cell--name">
                <div class="tutor-name">${escapeHtml(item.full_name || 'Sem nome')}</div>
                <div class="tutor-meta"><span>${item.primary_pet_name ? escapeHtml(item.primary_pet_name) : 'Sem pet principal'}</span></div>
              </div>
              <div class="clients-cell clients-cell--whatsapp">
                ${whatsapp ? `<a class="tutor-phone-link" href="https://wa.me/${phoneHref(whatsapp)}" target="_blank" rel="noreferrer">${escapeHtml(maskedPhoneIntl(whatsapp))}</a>` : '<span class="muted">—</span>'}
              </div>
              <div class="clients-cell clients-cell--status"><span class="status-badge ${item.is_active ? 'is-active' : 'is-inactive'}">${item.is_active ? 'Ativo' : 'Inativo'}</span></div>
              <div class="clients-cell clients-cell--pets"><strong>${item.pet_count || 0}</strong></div>
              <div class="clients-cell clients-cell--metric"><strong>${item.appointment_count || 0}</strong></div>
              <div class="clients-cell clients-cell--money"><strong>${money(Number(item.total_pending_cents || 0) / 100)}</strong></div>
              <div class="clients-cell clients-cell--money"><strong>${money(Number(item.total_paid_cents || 0) / 100)}</strong></div>
              <div class="clients-cell clients-cell--actions">
                <div class="row-menu-wrap">
                  <button class="row-menu-toggle" type="button" data-menu-toggle="${item.id}" aria-label="Abrir ações">⋮</button>
                  <div class="row-menu ${state.openMenuId === item.id ? 'is-open' : ''}" data-row-menu="${item.id}">
                    <button class="row-menu-item" type="button" data-action="edit" data-id="${item.id}"><span class="icon">✎</span><span>Editar cadastro</span></button>
                    <button class="row-menu-item" type="button" data-action="about" data-id="${item.id}"><span class="icon">☰</span><span>Sobre cliente</span></button>
                    <button class="row-menu-item" type="button" data-action="payments" data-id="${item.id}"><span class="icon">▤</span><span>Pagamentos</span></button>
                    <button class="row-menu-item" type="button" data-action="whatsapp" data-id="${item.id}"><span class="icon">◔</span><span>WhatsApp</span></button>
                    <button class="row-menu-item danger" type="button" data-action="toggle-status" data-id="${item.id}"><span class="icon">⊘</span><span>${item.is_active ? 'Inativar' : 'Ativar'}</span></button>
                  </div>
                </div>
              </div>
            </article>`;
        }).join('')}
      </div>
    </div>`;
  requestAnimationFrame(positionOpenMenu);
}

function renderDetail() {
  const { tutor, pets = [], dependents = [], payments = [], payment_history = [] } = state.detail || {};
  if (!tutor || !elements.detailBody) return;
  const unpaidCount = payments.filter((item) => normalizePaymentStatus(item.payment_status) !== 'pago').length;
  const unpaidTotal = payments.filter((item) => normalizePaymentStatus(item.payment_status) !== 'pago').reduce((sum, item) => sum + Number(item.total_cents || 0), 0) / 100;
  const totalPaid = payments.filter((item) => normalizePaymentStatus(item.payment_status) === 'pago').reduce((sum, item) => sum + Number(item.total_cents || 0), 0) / 100;
  const currentTab = state.detailTab;
  const sortedPayments = sortEntries(groupPackageEntries(payments), 'payments');
  const sortedHistory = sortEntries(groupPackageEntries(payment_history), 'history');
  const renderPaymentMenu = (entry, options = {}) => {
    const normalizedEntry = ensureDocumentEntry(entry, options.forceDocumentType || '');
    const actions = [
      `<button class="row-menu-item" type="button" data-payment-action="document" data-id="${normalizedEntry.id}" data-document-type="${normalizedEntry.document_type}"><span class="icon">☰</span><span>${normalizedEntry.document_type === 'recibo' ? 'Recibo' : 'Comanda'}</span></button>`
    ];
    if (options.allowEdit) {
      actions.push(`<button class="row-menu-item" type="button" data-payment-action="edit" data-id="${normalizedEntry.id}"><span class="icon">✎</span><span>Editar</span></button>`);
    }
    actions.push(`<button class="row-menu-item" type="button" data-payment-action="pdf" data-id="${normalizedEntry.id}" data-document-type="${normalizedEntry.document_type}"><span class="icon">🖨</span><span>PDF</span></button>`);
    actions.push(`<button class="row-menu-item" type="button" data-payment-action="whatsapp" data-id="${normalizedEntry.id}" data-document-type="${normalizedEntry.document_type}"><span class="icon">◔</span><span>WhatsApp</span></button>`);
    return `
      <div class="row-menu-wrap finance-menu-wrap">
        <button class="row-menu-toggle finance-menu-toggle" type="button" data-payment-menu-toggle="${normalizedEntry.id}" aria-label="Abrir ações">⋮</button>
        <div class="row-menu finance-row-menu ${state.openPaymentMenuId === normalizedEntry.id ? 'is-open' : ''}" data-payment-row-menu="${normalizedEntry.id}">
          ${actions.join('')}
        </div>
      </div>`;
  };
  elements.detailBody.innerHTML = `
    <div class="detail-tabs">
      <button class="detail-tab ${currentTab === 'about' ? 'is-active' : ''}" type="button" data-detail-tab="about">Sobre cliente</button>
      <button class="detail-tab ${currentTab === 'payments' ? 'is-active' : ''}" type="button" data-detail-tab="payments">Pagamentos</button>
      <button class="detail-tab ${currentTab === 'history' ? 'is-active' : ''}" type="button" data-detail-tab="history">Histórico de agendamentos</button>
    </div>

    <div class="detail-summary-strip detail-summary-strip--single-line">
      <article class="mini-kpi"><span>Pets</span><strong>${pets.length}</strong></article>
      <article class="mini-kpi"><span>Dependentes</span><strong>${dependents.length}</strong></article>
      <article class="mini-kpi"><span>Pendências</span><strong>${unpaidCount}</strong></article>
      <article class="mini-kpi"><span>Valor devido</span><strong>${money(unpaidTotal)}</strong></article>
      <article class="mini-kpi"><span>Total pago</span><strong>${money(totalPaid)}</strong></article>
    </div>

    ${currentTab === 'about' ? `
    <div class="detail-grid">
      <section class="section-block">
        <h3>Informações pessoais</h3>
        <div class="info-card">
          <div class="info-top">
            ${rowAvatar(tutor.photo_url, tutor.full_name)}
            <div>
              <div class="info-title">${escapeHtml(tutor.full_name)}</div>
              <div class="info-columns">
                <div><div class="label">WhatsApp</div><div class="value">${escapeHtml(maskedPhoneIntl(tutor.phone))}</div></div>
                <div><div class="label">E-mail</div><div class="value">${escapeHtml(tutor.email || '—')}</div></div>
                <div><div class="label">Nascimento</div><div class="value">${escapeHtml(tutor.birth_date || '—')}</div></div>
                <div><div class="label">Cidade</div><div class="value">${escapeHtml(tutor.city || '—')}</div></div>
              </div>
              <div class="history-line"><strong>Cadastro:</strong> ${fmtDate(tutor.created_at)} • ${tutor.is_active ? 'Ativo' : 'Inativo'}</div>
            </div>
          </div>
        </div>
        <h3>Contato e endereço</h3>
        <div class="info-card">
          <div class="info-columns">
            <div><div class="label">Celular</div><div class="value">${escapeHtml(maskedPhoneIntl(tutor.phone))}</div></div>
            <div><div class="label">Telefone extra</div><div class="value">${escapeHtml(maskedPhoneIntl(tutor.phone_secondary))}</div></div>
            <div><div class="label">CPF</div><div class="value">${escapeHtml(maskCpf(tutor.cpf || '')) || '—'}</div></div>
            <div><div class="label">CEP</div><div class="value">${escapeHtml(maskCep(tutor.cep || '')) || '—'}</div></div>
          </div>
          <div class="history-line"><strong>Endereço:</strong> ${escapeHtml([tutor.address_line, tutor.number, tutor.district, tutor.city, tutor.state].filter(Boolean).join(', ') || 'Não informado')}</div>
        </div>
      </section>
      <section class="section-block">
        <div class="section-block-head"><h3>Pets</h3><button class="add-card" type="button" data-add-pet><span class="plus">＋</span><span>Novo pet</span></button></div>
        ${pets.length ? pets.map((pet) => `
          <div class="info-card pet-card">
            ${petAvatar(pet.photo_url, pet.name)}
            <div>
              <div class="pet-card-head"><div class="pet-card-name">${escapeHtml(pet.name)}</div><div class="pet-inline-actions"><button class="mini-action" type="button" data-pet-action="edit" data-id="${pet.id}">Editar</button><button class="mini-action danger" type="button" data-pet-action="delete" data-id="${pet.id}">Excluir</button></div></div>
              <div class="pet-tags"><span class="tag success">${pet.is_active ? 'Ativo' : 'Inativo'}</span><span class="tag neutral">${escapeHtml(pet.species || 'Canina')}</span><span class="tag neutral">${escapeHtml(pet.gender || '—')}</span><span class="tag warning">${escapeHtml(pet.size || '—')}</span></div>
              <div class="pet-meta-stack"><div><strong>Raça</strong><br>${escapeHtml(pet.breed || 'Não informada')}</div><div><strong>Observações</strong><br>${escapeHtml(pet.notes || '—')}</div></div>
            </div>
          </div>`).join('') : '<div class="info-card">Nenhum pet cadastrado.</div>'}
        <div class="section-block-head"><h3>Dependentes</h3><button class="add-card" type="button" data-add-dependent><span class="plus">＋</span><span>Novo dependente</span></button></div>
        ${dependents.length ? dependents.map((dependent) => `
          <div class="info-card dependent-card">
            <div><strong>${escapeHtml(dependent.full_name)}</strong><div class="tutor-meta"><span>${escapeHtml(dependent.relation || 'Dependente')}</span><span>${escapeHtml(maskedPhoneIntl(dependent.phone))}</span></div><div class="history-line">${escapeHtml(dependent.notes || 'Sem observações.')}</div></div>
            <div class="pet-inline-actions"><button class="mini-action" type="button" data-dependent-action="edit" data-id="${dependent.id}">Editar</button><button class="mini-action danger" type="button" data-dependent-action="delete" data-id="${dependent.id}">Excluir</button></div>
          </div>`).join('') : '<div class="info-card">Nenhum dependente cadastrado.</div>'}
      </section>
    </div>` : ''}

    ${currentTab === 'payments' ? `
      <div class="finance-table-card">
        <div class="finance-table-head"><div>${sortLink('Data', 'payments', 'scheduled_at')}</div><div>${sortLink('Pet', 'payments', 'pet_name')}</div><div>${sortLink('Serviços', 'payments', 'services')}</div><div>${sortLink('Pagamento', 'payments', 'payment_status')}</div><div>${sortLink('Total', 'payments', 'total_cents')}</div><div>Ações</div></div>
        <div class="finance-table-body">
          ${sortedPayments.length ? sortedPayments.map((entry) => `
            <div class="finance-row">
              <div>${fmtDateTime(entry.scheduled_at)}</div>
              <div>${escapeHtml(entry.pet_name || '—')}</div>
              <div>${escapeHtml((String(entry.booking_origin || '').toLowerCase() === 'pacote' || entry.customer_package_id) ? (entry.package_name || entry.service_name || 'Pacote') : ((entry.services || []).map((service) => service.name || service.service_name).filter(Boolean).join(', ') || entry.service_name || '—'))}</div>
              <div><span class="status-badge ${normalizePaymentStatus(entry.payment_status) === 'pago' ? 'is-active' : 'is-pending'}">${escapeHtml(entry.payment_status || 'Pendente')}</span></div>
              <div>${money(Number(entry.total_cents || 0) / 100)}</div>
              <div class="finance-actions">${renderPaymentMenu(entry, { allowEdit: true })}</div>
            </div>`).join('') : '<div class="info-card">Nenhum pagamento encontrado.</div>'}
        </div>
      </div>` : ''}

    ${currentTab === 'history' ? `
      <div class="finance-table-card">
        <div class="finance-table-head"><div>${sortLink('Comanda', 'history', 'ticket_code')}</div><div>${sortLink('Data', 'history', 'scheduled_at')}</div><div>${sortLink('Status', 'history', 'status')}</div><div>${sortLink('Serviços', 'history', 'services')}</div><div>${sortLink('Total', 'history', 'total_cents')}</div><div>Ações</div></div>
        <div class="finance-table-body">
          ${sortedHistory.length ? sortedHistory.map((entry) => `
            <div class="finance-row">
              <div>Comanda${entry.ticket_code ? ` #${escapeHtml(entry.ticket_code)}` : ''}</div>
              <div>${fmtDateTime(entry.scheduled_at)}</div>
              <div>${escapeHtml(entry.status || '—')}</div>
              <div>${escapeHtml((String(entry.booking_origin || '').toLowerCase() === 'pacote' || entry.customer_package_id) ? (entry.package_name || entry.service_name || 'Pacote') : ((entry.services || []).map((service) => service.name || service.service_name).filter(Boolean).join(', ') || entry.service_name || '—'))}</div>
              <div>${money(Number(entry.total_cents || 0) / 100)}</div>
              <div class="finance-actions">${renderPaymentMenu(entry, { allowEdit: false, forceDocumentType: 'comanda' })}</div>
            </div>`).join('') : '<div class="info-card">Nenhum histórico disponível.</div>'}
        </div>
      </div>` : ''}
  `;
}

function fillForm(tutor = {}) {
  elements.form.reset();
  elements.form.elements.id.value = tutor.id || '';
  elements.form.elements.full_name.value = tutor.full_name || '';
  elements.form.elements.phone.value = maskPhone(tutor.phone || '');
  elements.form.elements.phone_secondary.value = maskPhone(tutor.phone_secondary || '');
  elements.form.elements.cpf.value = maskCpf(tutor.cpf || '');
  elements.form.elements.birth_date.value = tutor.birth_date || '';
  elements.form.elements.nationality.value = tutor.nationality || 'Brasil';
  elements.form.elements.gender.value = tutor.gender || '';
  elements.form.elements.email.value = tutor.email || '';
  elements.form.elements.whatsapp_opt_out.value = tutor.whatsapp_opt_out ? 'Sim' : 'Não';
  elements.form.elements.notes_internal.value = tutor.notes_internal || '';
  elements.form.elements.restrictions.value = tutor.restrictions || '';
  elements.form.elements.address_line.value = tutor.address_line || '';
  elements.form.elements.cep.value = maskCep(tutor.cep || '');
  elements.form.elements.number.value = tutor.number || '';
  elements.form.elements.district.value = tutor.district || '';
  elements.form.elements.complement.value = tutor.complement || '';
  elements.form.elements.city.value = tutor.city || '';
  elements.form.elements.state.value = tutor.state || '';
  state.photoUrl = tutor.photo_url || '';
  renderPhotoPreview();
}

function renderPhotoPreview() {
  if (!elements.photoPreview) return;
  elements.photoPreview.innerHTML = state.photoUrl ? `<img src="${state.photoUrl}" alt="Preview da foto" />` : 'Enviar imagem';
}

function openForm(mode = 'create', tutor = null) {
  state.editingId = tutor?.id || null;
  elements.formModal.classList.add('is-open');
  elements.formBreadcrumb.textContent = mode === 'edit' ? 'Clientes → Alterar' : 'Clientes → Cadastrar';
  fillForm(tutor || {});
}

function closeForm() { elements.formModal.classList.remove('is-open'); }
function openDetail(tab = 'about') { if (!state.detail) return; state.detailTab = tab; renderDetail(); elements.detailModal.classList.add('is-open'); }
function closeDetail() { state.openPaymentMenuId = null; closePaymentEditModal(); elements.detailModal.classList.remove('is-open'); }

async function loadTutors() {
  const params = new URLSearchParams();
  if (state.status) params.set('status', state.status);
  if (state.search) params.set('search', state.search);
  const data = await api.get(`/api/tenant/tutors?${params.toString()}`);
  state.items = data.items || [];
  state.openMenuId = null;
  renderSummary();
  renderList();
}

async function loadTutorDetail(id, tab = 'about') {
  openLoadingModal('Carregando perfil completo do cliente...');
  try {
    const data = await api.get(`/api/tenant/tutors/${id}`);
    state.selectedId = id;
    state.detail = data;
    state.openPaymentMenuId = null;
    openDetail(tab);
  } finally {
    closeFeedbackModal();
  }
}

async function saveTutor(event) {
  event.preventDefault();
  const form = new FormData(elements.form);
  const payload = Object.fromEntries(form.entries());
  payload.phone = maskPhone(payload.phone);
  payload.phone_secondary = maskPhone(payload.phone_secondary);
  payload.cpf = maskCpf(payload.cpf);
  payload.cep = maskCep(payload.cep);
  payload.photo_url = state.photoUrl;
  payload.whatsapp_opt_out = payload.whatsapp_opt_out === 'Sim';
  const url = state.editingId ? `/api/tenant/tutors/${state.editingId}` : '/api/tenant/tutors';
  const method = state.editingId ? api.put : api.post;
  await method(url, payload);
  closeForm();
  openToast(state.editingId ? 'Cliente atualizado com sucesso.' : 'Cliente criado com sucesso.');
  await loadTutors();
  if (state.selectedId === state.editingId) await loadTutorDetail(state.editingId, state.detailTab);
}

async function toggleStatus(id) {
  await api.patch(`/api/tenant/tutors/${id}/toggle-status`);
  openToast('Status do cliente atualizado.');
  await loadTutors();
  if (state.selectedId === id) await loadTutorDetail(id, state.detailTab);
}

async function addOrEditPet(pet = null) {
  if (!state.selectedId) return;
  const name = window.prompt('Nome do pet:', pet?.name || '');
  if (!name) return;
  const breed = window.prompt('Raça do pet:', pet?.breed || '') || '';
  const size = window.prompt('Porte do pet:', pet?.size || '') || '';
  const notes = window.prompt('Observações do pet:', pet?.notes || '') || '';
  if (pet?.id) {
    await api.put(`/api/tenant/tutors/${state.selectedId}/pets/${pet.id}`, { ...pet, name, breed, size, notes });
    openToast('Pet atualizado com sucesso.');
  } else {
    await api.post(`/api/tenant/tutors/${state.selectedId}/pets`, { name, breed, size, notes });
    openToast('Pet adicionado com sucesso.');
  }
  await loadTutors();
  await loadTutorDetail(state.selectedId, 'about');
}

async function deletePet(id) {
  if (!state.selectedId || !window.confirm('Excluir este pet?')) return;
  await api.delete(`/api/tenant/tutors/${state.selectedId}/pets/${id}`);
  openToast('Pet excluído com sucesso.');
  await loadTutors();
  await loadTutorDetail(state.selectedId, 'about');
}

async function addOrEditDependent(dependent = null) {
  if (!state.selectedId) return;
  const full_name = window.prompt('Nome do dependente:', dependent?.full_name || '');
  if (!full_name) return;
  const relation = window.prompt('Parentesco ou relação:', dependent?.relation || '') || '';
  const phone = window.prompt('Telefone:', dependent?.phone || '') || '';
  const notes = window.prompt('Observações:', dependent?.notes || '') || '';
  if (dependent?.id) {
    await api.put(`/api/tenant/tutors/${state.selectedId}/dependents/${dependent.id}`, { ...dependent, full_name, relation, phone, notes });
    openToast('Dependente atualizado com sucesso.');
  } else {
    await api.post(`/api/tenant/tutors/${state.selectedId}/dependents`, { full_name, relation, phone, notes });
    openToast('Dependente criado com sucesso.');
  }
  await loadTutorDetail(state.selectedId, 'about');
}

async function deleteDependent(id) {
  if (!state.selectedId || !window.confirm('Excluir este dependente?')) return;
  await api.delete(`/api/tenant/tutors/${state.selectedId}/dependents/${id}`);
  openToast('Dependente excluído com sucesso.');
  await loadTutorDetail(state.selectedId, 'about');
}

function paymentMessage(entry) {
  const doc = ensureDocumentEntry(entry);
  const tenant = tenantDocumentInfo();
  const services = (doc.services || []).map((item) => item.name || item.service_name).filter(Boolean).join(', ') || doc.service_name || 'serviços';
  return `Olá, ${doc.tutor_name || 'cliente'}! 🐾

Aqui é da equipe ${tenant.brand}. ${doc.document_type === 'recibo' ? 'Segue o seu recibo' : 'Segue a sua comanda'} do atendimento de ${doc.pet_name || 'seu pet'} realizado em ${fmtDateTime(doc.scheduled_at)}.

Serviços: ${services}
Total: ${money(Number(doc.total_cents || 0) / 100)}
Pagamento: ${doc.payment_status || 'Pendente'}${doc.payment_method ? ` (${doc.payment_method})` : ''}

${tenant.whatsapp !== '—' ? `Precisando de ajuda, fale com a nossa equipe em ${tenant.whatsapp}.

` : ''}Com carinho,
${tenant.brand} 💚`;
}

function renderDocumentPreview(entry) {
  const doc = ensureDocumentEntry(entry);
  const tenant = tenantDocumentInfo();
  const isPackage = String(doc.booking_origin || '').toLowerCase() === 'pacote' || !!doc.customer_package_id;
  const packageTitle = doc.package_name || doc.service_name || 'Pacote';
  const services = (doc.services || []).map((service) => `
    <tr>
      <td><strong>${escapeHtml(service.pet_name || doc.pet_name || 'Pet')}</strong></td>
      <td>${escapeHtml([service.breed || doc.breed || 'Raça não informada', service.size || doc.size || 'Porte não informado'].filter(Boolean).join(' • '))}</td>
      <td>${escapeHtml(isPackage ? packageTitle : (service.name || service.service_name || doc.service_name || 'Serviço'))}<br><small>${escapeHtml(service.category || '')}</small></td>
      <td>${escapeHtml(service.duration || service.duration_minutes ? `${service.duration || service.duration_minutes} min` : '—')}</td>
      <td>${money(Number(service.price_cents || service.unit_price_cents || 0) / 100)}</td>
    </tr>`).join('');
  const total = money(Number(doc.total_cents || 0) / 100);
  return `
    <div class="document-preview-card document-preview-card--premium">
      <div class="document-preview-hero">
        <div class="document-preview-brand">
          <img class="document-preview-logo" src="${escapeHtml(tenant.logo)}" alt="${escapeHtml(tenant.brand)}" />
          <div>
            <div class="document-eyebrow">${doc.document_type === 'recibo' ? 'Recibo' : 'Comanda'}</div>
            <h3>${escapeHtml(doc.ticket_code || doc.id || 'Documento')}</h3>
            <p>${escapeHtml(tenant.brand)}</p>
            <p>${escapeHtml(tenant.address || 'Endereço do pet shop não informado.')}</p>
            <p>${escapeHtml([tenant.whatsapp, tenant.support].filter((item) => item && item !== '—').join(' • ') || tenant.support || tenant.whatsapp || 'Contato do pet shop indisponível.')}</p>
          </div>
        </div>
        <div class="status-badge ${doc.document_type === 'recibo' ? 'is-active' : 'is-pending'}">${doc.document_type === 'recibo' ? 'Pago' : 'Pendente'}</div>
      </div>
      <div class="document-preview-grid document-preview-grid--premium">
        <div><span>Data do atendimento</span><strong>${fmtDateTime(doc.scheduled_at)}</strong></div>
        <div><span>Cliente</span><strong>${escapeHtml(doc.tutor_name || '—')}</strong></div>
        <div><span>Pet</span><strong>${escapeHtml(doc.pet_name || '—')}</strong></div>
        <div><span>Pagamento</span><strong>${escapeHtml(doc.payment_status || 'Pendente')}${doc.payment_method ? ` • ${escapeHtml(doc.payment_method)}` : ''}</strong></div>
      </div>
      <div class="document-preview-grid document-preview-grid--info">
        <div><span>${isPackage ? 'Pacote' : 'Colaborador'}</span><strong>${escapeHtml(isPackage ? packageTitle : (doc.staff_name || 'Sem colaborador'))}</strong></div>
        <div><span>Status do agendamento</span><strong>${escapeHtml(doc.status || '—')}</strong></div>
        <div><span>Quantidade de serviços</span><strong>${Array.isArray(doc.services) && doc.services.length ? doc.services.length : 1}</strong></div>
        <div class="document-preview-total-cell"><span>${isPackage ? 'Valor com desconto' : 'Total dos serviços'}</span><strong>${total}</strong></div>
      </div>
      <table class="document-preview-table document-preview-table--premium">
        <thead><tr><th>Pet</th><th>Dados do pet</th><th>Serviço</th><th>Tempo</th><th>Valor</th></tr></thead>
        <tbody>${services || `<tr><td><strong>${escapeHtml(doc.pet_name || 'Pet')}</strong></td><td>${escapeHtml([doc.breed || 'Raça não informada', doc.size || 'Porte não informado'].join(' • '))}</td><td>${escapeHtml(doc.service_name || 'Serviço')}</td><td>—</td><td>${total}</td></tr>`}</tbody>
      </table>
      <div class="document-preview-total"><span>${isPackage ? 'Valor real do pacote' : 'Total dos serviços'}</span><strong>${total}</strong></div>
      <div class="document-preview-notes"><strong>Observações</strong><p>${escapeHtml(doc.notes || 'Sem observações registradas.')}</p></div>
      <div class="document-preview-actions">
        <button type="button" class="footer-cta" data-doc-action="close">Fechar</button>
        <button type="button" class="footer-cta" data-doc-action="print">Imprimir / PDF</button>
        <button type="button" class="footer-cta" data-doc-action="whatsapp">Enviar WhatsApp</button>
      </div>
    </div>`;
}

function openDocument(entry, forcedType = '') {
  state.docPreview = ensureDocumentEntry(entry, forcedType);
  const shell = document.querySelector('[data-doc-modal]');
  const body = document.querySelector('[data-doc-body]');
  if (!shell || !body || !state.docPreview) return;
  body.innerHTML = renderDocumentPreview(state.docPreview);
  shell.classList.add('is-open');
}

function closeDocument() {
  const shell = document.querySelector('[data-doc-modal]');
  if (shell) shell.classList.remove('is-open');
  state.docPreview = null;
}

function printDocument(entry, forcedType = '') {
  const doc = ensureDocumentEntry(entry, forcedType);
  const html = renderDocumentPreview(doc);
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${doc.document_type}</title><style>body{font-family:Inter,Arial,sans-serif;padding:30px;color:#0f172a;background:#eef2f7;margin:0}*{box-sizing:border-box}.document-preview-card--premium{max-width:980px;margin:0 auto;background:#fff;border-radius:28px;padding:28px;box-shadow:0 24px 70px rgba(15,23,42,.12)}.document-preview-hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:0 0 22px;border-bottom:1px solid #e2e8f0}.document-preview-brand{display:flex;gap:16px;align-items:flex-start}.document-preview-logo{width:84px;height:84px;object-fit:contain;background:#fff;border:1px solid #dbe4ee;border-radius:22px;padding:10px;box-shadow:0 10px 30px rgba(15,23,42,.08)}.document-preview-brand h3{margin:4px 0 6px;font-size:28px}.document-preview-brand p{margin:4px 0;color:#475569;line-height:1.55}.document-preview-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:18px 0}.document-preview-grid div{border:1px solid #e2e8f0;border-radius:20px;padding:16px 18px;background:linear-gradient(180deg,#fff 0%,#f8fbfa 100%)}.document-preview-grid span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:8px}.document-preview-grid strong{display:block;font-size:16px;line-height:1.35;color:#0f172a}.document-preview-total-cell strong{font-size:14px;line-height:1.25;word-break:break-word}.status-badge{display:inline-flex;padding:10px 16px;border-radius:999px;font-weight:800}.status-badge.is-active{background:#dcfce7;color:#166534}.status-badge.is-pending{background:#fef3c7;color:#92400e}table{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid #e2e8f0;border-radius:22px;margin-top:10px}th,td{padding:14px 12px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}th{background:#f8fafc;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#64748b}.document-preview-total{display:flex;justify-content:space-between;align-items:center;margin-top:18px;padding:16px 20px;border-radius:22px;background:linear-gradient(135deg,#f8fafc 0%,#ffffff 100%);border:1px solid #e2e8f0}.document-preview-total strong{font-size:26px}.document-preview-notes{margin-top:18px;border:1px dashed #cbd5e1;border-radius:22px;padding:18px;background:#fafafa;color:#334155}.document-preview-actions{display:none}@media print{body{background:#fff;padding:0}.document-preview-card--premium{box-shadow:none;border-radius:0;max-width:none}}@media (max-width:900px){.document-preview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:640px){.document-preview-grid{grid-template-columns:1fr}}</style></head><body>${html}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

function sendPaymentWhatsApp(entry, forcedType = '') {
  const doc = ensureDocumentEntry(entry, forcedType);
  const href = `https://wa.me/${phoneHref(doc.phone || state.detail?.tutor?.phone || '')}?text=${encodeURIComponent(paymentMessage(doc))}`;
  window.open(href, '_blank');
}

function openPaymentEditModal(entry) {
  state.paymentEditEntry = ensureDocumentEntry(entry);
  const shell = document.querySelector('[data-payment-edit-modal]');
  const form = document.querySelector('[data-payment-edit-form]');
  if (!shell || !form || !state.paymentEditEntry) return;
  form.elements.id.value = state.paymentEditEntry.id || '';
  form.elements.payment_status.value = normalizePaymentStatus(state.paymentEditEntry.payment_status);
  const paymentMethod = String(state.paymentEditEntry.payment_method || '').trim().toLowerCase();
  form.elements.payment_method.value = paymentMethod;
  shell.classList.add('is-open');
}

function closePaymentEditModal() {
  document.querySelector('[data-payment-edit-modal]')?.classList.remove('is-open');
  state.paymentEditEntry = null;
}

async function savePaymentEdit(event) {
  event.preventDefault();
  if (!state.paymentEditEntry?.id) return;
  const form = event.currentTarget;
  const payload = {
    payment_status: normalizePaymentStatus(form.elements.payment_status.value),
    payment_method: String(form.elements.payment_method.value || '').trim()
  };
  const response = await runWithLoading('Salvando pagamento do atendimento...', async () => api.put(`/api/tenant/manage/agenda/${state.paymentEditEntry.id}`, payload));
  if (response?.item?.id) state.paymentEditEntry.id = response.item.id;
  closePaymentEditModal();
  openToast(payload.payment_status === 'pago' ? 'Pagamento atualizado. Recibo liberado.' : 'Pagamento atualizado. Comanda mantida.');
  await loadTutorDetail(state.selectedId, 'payments');
}


async function lookupCep() {
  const cep = elements.form.elements.cep.value.replace(/\D/g, '');
  if (cep.length !== 8) return;
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json();
    if (data.erro) return;
    elements.form.elements.address_line.value = [data.logradouro, data.localidade].filter(Boolean).join(', ');
    elements.form.elements.district.value = data.bairro || '';
    elements.form.elements.city.value = data.localidade || '';
    elements.form.elements.state.value = data.uf || '';
  } catch {}
}

function bindMasks() {
  ['phone', 'phone_secondary'].forEach((name) => {
    const input = elements.form.elements[name];
    input.addEventListener('input', () => { input.value = maskPhone(input.value); });
  });
  elements.form.elements.cpf.addEventListener('input', () => { elements.form.elements.cpf.value = maskCpf(elements.form.elements.cpf.value); });
  elements.form.elements.cep.addEventListener('input', () => { elements.form.elements.cep.value = maskCep(elements.form.elements.cep.value); });
  elements.form.elements.cep.addEventListener('blur', lookupCep);
}

function bindEvents() {
  elements.newButton.addEventListener('click', () => openForm('create'));
  elements.searchInput.addEventListener('input', async (event) => { state.search = event.target.value.trim(); await loadTutors(); });
  elements.statusButtons.forEach((button) => button.addEventListener('click', async () => { state.status = button.dataset.status; elements.statusButtons.forEach((node) => node.classList.toggle('is-active', node === button)); await loadTutors(); }));

  document.addEventListener('click', async (event) => {
    const toggle = event.target.closest('[data-menu-toggle]');
    const actionButton = event.target.closest('[data-action]');
    const isMenuArea = event.target.closest('.row-menu-wrap, .row-menu, .finance-menu-wrap, .finance-row-menu');
    if (toggle) {
      const id = toggle.dataset.menuToggle;
      state.openMenuId = state.openMenuId === id ? null : id;
      renderList();
      return;
    }
    const clientSortButton = event.target.closest('[data-client-sort-key]');
    if (clientSortButton) {
      const key = clientSortButton.dataset.clientSortKey;
      const current = state.clientSort || { key: 'full_name', dir: 'asc' };
      state.clientSort = current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'appointment_count' ? 'desc' : 'desc' };
      renderList();
      return;
    }
    if (actionButton) {
      const { action, id } = actionButton.dataset;
      state.openMenuId = null;
      renderList();
      if (action === 'about') await loadTutorDetail(id, 'about');
      if (action === 'payments') await loadTutorDetail(id, 'payments');
      if (action === 'edit') {
        await runWithLoading('Carregando cadastro completo do cliente...', async () => {
          const data = await api.get(`/api/tenant/tutors/${id}`);
          openForm('edit', data.tutor);
        });
      }
      if (action === 'toggle-status') await toggleStatus(id);
      if (action === 'whatsapp') {
        const item = state.items.find((entry) => entry.id === id);
        const phone = item?.phone || item?.phone_secondary;
        if (phone) window.open(`https://wa.me/${phoneHref(phone)}`, '_blank');
      }
      return;
    }
    if (!isMenuArea && state.openMenuId) { state.openMenuId = null; renderList(); }
  });

  elements.detailClose.addEventListener('click', closeDetail);
  elements.formClose.addEventListener('click', closeForm);
  elements.detailModal.addEventListener('click', (event) => { if (event.target === elements.detailModal) closeDetail(); });
  elements.formModal.addEventListener('click', (event) => { if (event.target === elements.formModal) closeForm(); });
  elements.detailAction.addEventListener('click', () => { if (state.detail?.tutor) openForm('edit', state.detail.tutor); });
  elements.form.addEventListener('submit', saveTutor);
  elements.photoInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.photoUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    renderPhotoPreview();
  });

  elements.detailBody.addEventListener('click', async (event) => {
    const tab = event.target.closest('[data-detail-tab]');
    if (tab) { state.detailTab = tab.dataset.detailTab; renderDetail(); return; }
    if (event.target.closest('[data-add-pet]')) return addOrEditPet();
    if (event.target.closest('[data-add-dependent]')) return addOrEditDependent();
    const petButton = event.target.closest('[data-pet-action]');
    if (petButton) {
      const pet = state.detail?.pets?.find((item) => item.id === petButton.dataset.id);
      if (petButton.dataset.petAction === 'edit') return addOrEditPet(pet);
      if (petButton.dataset.petAction === 'delete') return deletePet(petButton.dataset.id);
    }
    const dependentButton = event.target.closest('[data-dependent-action]');
    if (dependentButton) {
      const dependent = state.detail?.dependents?.find((item) => item.id === dependentButton.dataset.id);
      if (dependentButton.dataset.dependentAction === 'edit') return addOrEditDependent(dependent);
      if (dependentButton.dataset.dependentAction === 'delete') return deleteDependent(dependentButton.dataset.id);
    }
    const sortButton = event.target.closest('[data-sort-tab][data-sort-key]');
    if (sortButton) {
      const tab = sortButton.dataset.sortTab;
      const key = sortButton.dataset.sortKey;
      const current = state.paymentSort[tab] || { key, dir: 'desc' };
      state.paymentSort[tab] = current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'scheduled_at' || key === 'total_cents' ? 'desc' : 'asc' };
      renderDetail();
      return;
    }
    const paymentMenuToggle = event.target.closest('[data-payment-menu-toggle]');
    if (paymentMenuToggle) {
      const id = paymentMenuToggle.dataset.paymentMenuToggle;
      state.openPaymentMenuId = state.openPaymentMenuId === id ? null : id;
      renderDetail();
      requestAnimationFrame(positionOpenPaymentMenu);
      return;
    }
    const paymentButton = event.target.closest('[data-payment-action]');
    if (paymentButton) {
      const entry = [...(state.detail?.payments || []), ...(state.detail?.payment_history || [])].find((item) => item.id === paymentButton.dataset.id);
      if (!entry) return;
      state.openPaymentMenuId = null;
      renderDetail();
      const forcedType = paymentButton.dataset.documentType || '';
      if (paymentButton.dataset.paymentAction === 'document') openDocument(entry, forcedType);
      if (paymentButton.dataset.paymentAction === 'pdf') printDocument(entry, forcedType);
      if (paymentButton.dataset.paymentAction === 'whatsapp') sendPaymentWhatsApp(entry, forcedType);
      if (paymentButton.dataset.paymentAction === 'edit') openPaymentEditModal(entry);
    }
  });

  document.querySelector('[data-doc-close]')?.addEventListener('click', closeDocument);
  document.querySelector('[data-payment-edit-close]')?.addEventListener('click', closePaymentEditModal);
  document.querySelector('[data-payment-edit-modal]')?.addEventListener('click', (event) => { if (event.target === document.querySelector('[data-payment-edit-modal]')) closePaymentEditModal(); });
  document.querySelector('[data-payment-edit-form]')?.addEventListener('submit', savePaymentEdit);
  document.querySelector('[data-payment-edit-print]')?.addEventListener('click', () => {
    if (!state.paymentEditEntry) return;
    printDocument(state.paymentEditEntry, state.paymentEditEntry.document_type);
  });
  document.querySelector('[data-doc-modal]')?.addEventListener('click', (event) => { if (event.target === document.querySelector('[data-doc-modal]')) closeDocument(); });
  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-doc-action]');
    if (!action || !state.docPreview) return;
    if (action.dataset.docAction === 'close') closeDocument();
    if (action.dataset.docAction === 'print') printDocument(state.docPreview);
    if (action.dataset.docAction === 'whatsapp') sendPaymentWhatsApp(state.docPreview);
  });

  window.addEventListener('resize', () => { positionOpenMenu(); positionOpenPaymentMenu(); });
  window.addEventListener('scroll', () => { positionOpenMenu(); positionOpenPaymentMenu(); }, true);
  document.addEventListener('click', (event) => {
    if (state.openPaymentMenuId && !event.target.closest('.finance-menu-wrap, .finance-row-menu')) {
      state.openPaymentMenuId = null;
      renderDetail();
    }
  }, true);
  bindMasks();
}

export async function initTutorCrud() {
  elements.newButton = document.querySelector('[data-new-client]');
  elements.searchInput = document.querySelector('[data-tutor-search]');
  elements.statusButtons = Array.from(document.querySelectorAll('[data-status-button]'));
  elements.list = document.querySelector('[data-tutors-list]');
  elements.summary = document.querySelector('[data-clients-summary]');
  elements.detailModal = document.querySelector('[data-detail-modal]');
  elements.formModal = document.querySelector('[data-form-modal]');
  elements.detailBody = document.querySelector('[data-detail-body]');
  elements.detailClose = document.querySelector('[data-detail-close]');
  elements.formClose = document.querySelector('[data-form-close]');
  elements.formBreadcrumb = document.querySelector('[data-form-breadcrumb]');
  elements.form = document.querySelector('[data-tutor-form]');
  elements.detailAction = document.querySelector('[data-detail-edit]');
  elements.photoInput = document.querySelector('[data-photo-input]');
  elements.photoPreview = document.querySelector('[data-photo-preview]');
  elements.toast = document.querySelector('[data-toast]');
  bindEvents();
  try {
    state.tenantBranding = await api.get('/api/tenant/branding');
  } catch {}
  await loadTutors();
}
