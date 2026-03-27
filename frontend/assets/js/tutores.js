import { api } from './api.js';

const state = {
  items: [],
  status: 'active',
  search: '',
  selectedId: null,
  detail: null,
  openMenuId: null,
  editingId: null,
  photoUrl: ''
};

const elements = {};

function initials(name = '') {
  return String(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'CL';
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function maskPhone(value = '') {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function maskCpf(value = '') {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function maskCep(value = '') {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.replace(/(\d{5})(\d)/, '$1-$2');
}

function fmtDate(value = '') {
  if (!value) return '—';
  const pure = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(pure)) {
    const [y, m, d] = pure.split('-');
    return `${d}/${m}/${y}`;
  }
  return pure;
}

function phoneHref(value = '') {
  return value.replace(/\D/g, '');
}

function openToast(message) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.add('is-open');
  clearTimeout(elements.toastTimer);
  elements.toastTimer = setTimeout(() => elements.toast.classList.remove('is-open'), 2800);
}

function rowAvatar(photo, name) {
  return photo
    ? `<span class="tutor-avatar"><img src="${photo}" alt="${escapeHtml(name)}" /></span>`
    : `<span class="tutor-avatar">${escapeHtml(initials(name))}</span>`;
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

  target.innerHTML = `
    <div class="clients-table-card">
      <div class="clients-table-header">
        <div>Foto</div>
        <div>Nome</div>
        <div>WhatsApp</div>
        <div>Status</div>
        <div>Qtd de pets</div>
        <div class="clients-table-actions-label">Ações</div>
      </div>
      <div class="clients-table-body">
        ${state.items.map((item) => {
          const summaryName = item.full_name || 'Sem nome';
          const whatsapp = item.phone || item.phone_secondary;
          return `
            <article class="tutor-row tutor-row--table" data-row-id="${item.id}">
              <div class="clients-cell clients-cell--photo">
                ${rowAvatar(item.photo_url, item.full_name)}
              </div>
              <div class="clients-cell clients-cell--name">
                <div class="tutor-name">${escapeHtml(summaryName)}</div>
                <div class="tutor-meta">
                  <span>${item.primary_pet_name ? escapeHtml(item.primary_pet_name) : 'Sem pet principal'}</span>
                </div>
              </div>
              <div class="clients-cell clients-cell--whatsapp">
                ${whatsapp
                  ? `<a class="tutor-phone-link" href="https://wa.me/55${phoneHref(whatsapp)}" target="_blank" rel="noreferrer" title="Enviar mensagem no WhatsApp">${escapeHtml(maskPhone(whatsapp))}</a>`
                  : '<span class="muted">—</span>'}
              </div>
              <div class="clients-cell clients-cell--status">
                <span class="status-badge ${item.is_active ? 'is-active' : 'is-inactive'}">${item.is_active ? 'Ativo' : 'Inativo'}</span>
              </div>
              <div class="clients-cell clients-cell--pets">
                <strong>${item.pet_count || 0}</strong>
              </div>
              <div class="clients-cell clients-cell--actions">
                <div class="row-menu-wrap">
                  <button class="row-menu-toggle" type="button" data-menu-toggle="${item.id}" aria-label="Abrir ações">⋮</button>
                  <div class="row-menu ${state.openMenuId === item.id ? 'is-open' : ''}">
                    <button class="row-menu-item" type="button" data-action="edit" data-id="${item.id}"><span class="icon">✎</span><span>Editar cliente</span></button>
                    <button class="row-menu-item" type="button" data-action="new-bath" data-id="${item.id}"><span class="icon">＋</span><span>Novo banho</span></button>
                    <button class="row-menu-item" type="button" data-action="new-package" data-id="${item.id}"><span class="icon">＋</span><span>Novo pacote</span></button>
                    <button class="row-menu-item" type="button" data-action="details" data-id="${item.id}"><span class="icon">▣</span><span>Ficha financeira</span></button>
                    <button class="row-menu-item" type="button" data-action="payments" data-id="${item.id}"><span class="icon">▤</span><span>Pagamentos</span></button>
                    <button class="row-menu-item" type="button" data-action="whatsapp" data-id="${item.id}"><span class="icon">◔</span><span>WhatsApp</span></button>
                    <button class="row-menu-item danger" type="button" data-action="toggle-status" data-id="${item.id}"><span class="icon">⊘</span><span>${item.is_active ? 'Inativar' : 'Ativar'}</span></button>
                  </div>
                </div>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderDetail() {
  const { tutor, pets } = state.detail || {};
  if (!tutor || !elements.detailBody) return;

  elements.detailBody.innerHTML = `
    <div class="detail-tabs">
      <button class="detail-tab is-active" type="button">Detalhes do cliente</button>
      <button class="detail-tab" type="button">Pagamentos</button>
      <button class="detail-tab" type="button">Histórico financeiro</button>
    </div>

    <div class="detail-grid">
      <section class="section-block">
        <h3>Informações pessoais</h3>
        <div class="info-card">
          <div class="info-top">
            ${rowAvatar(tutor.photo_url, tutor.full_name)}
            <div>
              <div class="info-title">${escapeHtml(tutor.full_name)}${tutor.primary_pet_name ? `//*** ${escapeHtml(tutor.primary_pet_name)}` : ''}</div>
              <div class="info-balance">Saldo: -R$ 160,00</div>
              <div class="info-columns">
                <div><div class="label">Nacionalidade</div><div class="value">${escapeHtml(tutor.nationality || 'Brasil')}</div></div>
                <div><div class="label">Gênero</div><div class="value">${escapeHtml(tutor.gender || '—')}</div></div>
              </div>
              <div class="history-line"><strong>Histórico</strong>Cliente criado ${fmtDate(tutor.created_at)} - Banho e Tosa Pet Funny</div>
            </div>
          </div>
        </div>

        <h3>Contato</h3>
        <div class="info-card">
          <div class="label">Celular</div>
          <div class="contact-line">
            <span>${escapeHtml(maskPhone(tutor.phone))}</span>
            ${tutor.phone ? `<a class="wa" href="https://wa.me/55${phoneHref(tutor.phone)}" target="_blank" rel="noreferrer">◔</a>` : ''}
          </div>
        </div>

        <button class="whatsapp-log-btn" type="button">WHATSAPP LOGS</button>
      </section>

      <section class="section-block">
        <h3>Pets</h3>
        ${pets?.length ? pets.map((pet) => `
          <div class="info-card pet-card">
            <div class="pet-card-avatar">${pet.photo_url ? `<img src="${pet.photo_url}" alt="${escapeHtml(pet.name)}" />` : '🐶'}</div>
            <div>
              <div class="pet-card-name">${escapeHtml(pet.name)}</div>
              <div class="pet-tags">
                <span class="tag success">${pet.is_active ? 'Ativo' : 'Inativo'}</span>
                <span class="tag neutral">${escapeHtml(pet.species || 'Canina')}</span>
                <span class="tag neutral">${escapeHtml(pet.gender || 'Fêmea')}</span>
                <span class="tag warning">${escapeHtml(pet.temperament || 'Dócil')}</span>
                <span class="tag warning">${escapeHtml(pet.size || 'Pequeno')}</span>
              </div>
              <div class="pet-meta-stack">
                <div><strong>Raça</strong><br />${escapeHtml(pet.breed || 'Não informada')}</div>
                <div><strong>Histórico</strong><br />Pet criado ${fmtDate(pet.created_at)} - Banho e Tosa Pet Funny</div>
              </div>
            </div>
          </div>
        `).join('') : '<div class="info-card">Nenhum pet cadastrado.</div>'}

        <button class="add-card" type="button" data-add-pet><span class="plus">＋</span><span>NOVO PET</span></button>

        <h3>Dependentes</h3>
        <button class="add-card" type="button"><span class="plus">＋</span><span>NOVO DEPENDENTE</span></button>
      </section>
    </div>
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
  elements.photoPreview.innerHTML = state.photoUrl
    ? `<img src="${state.photoUrl}" alt="Preview da foto" />`
    : 'Enviar imagem';
}

function openForm(mode = 'create', tutor = null) {
  state.editingId = tutor?.id || null;
  elements.formModal.classList.add('is-open');
  elements.formBreadcrumb.textContent = mode === 'edit' ? 'Clientes → Alterar' : 'Clientes → Cadastrar';
  fillForm(tutor || {});
}

function closeForm() {
  elements.formModal.classList.remove('is-open');
}

function openDetail() {
  if (!state.detail) return;
  renderDetail();
  elements.detailModal.classList.add('is-open');
}

function closeDetail() {
  elements.detailModal.classList.remove('is-open');
}

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

async function loadTutorDetail(id) {
  const data = await api.get(`/api/tenant/tutors/${id}`);
  state.selectedId = id;
  state.detail = data;
  openDetail();
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
  if (state.selectedId === state.editingId) {
    await loadTutorDetail(state.editingId);
  }
}

async function toggleStatus(id) {
  await api.patch(`/api/tenant/tutors/${id}/toggle-status`);
  openToast('Status do cliente atualizado.');
  if (state.selectedId === id && state.detail) {
    state.detail.tutor.is_active = !state.detail.tutor.is_active;
  }
  await loadTutors();
}

async function addPet() {
  if (!state.selectedId) return;
  const name = window.prompt('Nome do pet:');
  if (!name) return;
  const breed = window.prompt('Raça do pet:') || '';
  await api.post(`/api/tenant/tutors/${state.selectedId}/pets`, { name, breed });
  openToast('Pet adicionado com sucesso.');
  await loadTutors();
  await loadTutorDetail(state.selectedId);
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
  } catch {
    // silently ignore
  }
}

function bindMasks() {
  ['phone', 'phone_secondary'].forEach((name) => {
    const input = elements.form.elements[name];
    input.addEventListener('input', () => { input.value = maskPhone(input.value); });
  });

  elements.form.elements.cpf.addEventListener('input', () => {
    elements.form.elements.cpf.value = maskCpf(elements.form.elements.cpf.value);
  });

  elements.form.elements.cep.addEventListener('input', () => {
    elements.form.elements.cep.value = maskCep(elements.form.elements.cep.value);
  });

  elements.form.elements.cep.addEventListener('blur', lookupCep);
}

function bindEvents() {
  elements.newButton.addEventListener('click', () => openForm('create'));
  elements.searchInput.addEventListener('input', async (event) => {
    state.search = event.target.value.trim();
    await loadTutors();
  });

  elements.statusButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      state.status = button.dataset.status;
      elements.statusButtons.forEach((node) => node.classList.toggle('is-active', node === button));
      await loadTutors();
    });
  });

  document.addEventListener('click', async (event) => {
    const toggle = event.target.closest('[data-menu-toggle]');
    const actionButton = event.target.closest('[data-action]');
    const isMenuArea = event.target.closest('.row-menu-wrap');

    if (toggle) {
      const id = toggle.dataset.menuToggle;
      state.openMenuId = state.openMenuId === id ? null : id;
      renderList();
      return;
    }

    if (actionButton) {
      const { action, id } = actionButton.dataset;
      state.openMenuId = null;
      renderList();
      if (action === 'details') await loadTutorDetail(id);
      if (action === 'edit') {
        const data = await api.get(`/api/tenant/tutors/${id}`);
        openForm('edit', data.tutor);
      }
      if (action === 'toggle-status') await toggleStatus(id);
      if (action === 'whatsapp') {
        const item = state.items.find((entry) => entry.id === id);
        const phone = item?.phone || item?.phone_secondary;
        if (phone) window.open(`https://wa.me/55${phoneHref(phone)}`, '_blank');
      }
      if (action === 'new-bath') openToast('Fluxo de novo banho será conectado na agenda.');
      if (action === 'new-package') openToast('Fluxo de novo pacote será conectado em breve.');
      if (action === 'payments') openToast('Ficha de pagamentos em preparação.');
      return;
    }

    if (!isMenuArea && state.openMenuId) {
      state.openMenuId = null;
      renderList();
    }
  });

  elements.detailClose.addEventListener('click', closeDetail);
  elements.formClose.addEventListener('click', closeForm);
  elements.detailModal.addEventListener('click', (event) => { if (event.target === elements.detailModal) closeDetail(); });
  elements.formModal.addEventListener('click', (event) => { if (event.target === elements.formModal) closeForm(); });
  elements.detailAction.addEventListener('click', () => {
    if (state.detail?.tutor) openForm('edit', state.detail.tutor);
  });
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

  elements.detailBody.addEventListener('click', (event) => {
    if (event.target.closest('[data-add-pet]')) addPet();
  });

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
  await loadTutors();
}
