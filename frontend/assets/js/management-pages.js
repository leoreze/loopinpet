import { api } from './api.js';

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(cents = 0) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
}

function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR', { sensitivity: 'base', numeric: true });
}

export async function initManagementPage(kind) {
  const root = document.querySelector('[data-management-page]');
  if (!root) return;
  const state = { items: [], viewItems: [], meta: { tutors: [], roles: [], services: [] }, editing: null, openMenuId: null, sortKey: null, sortDir: 'asc' };
  const toastEl = document.querySelector('[data-toast]');
  const modal = root.querySelector('[data-modal]');
  const form = root.querySelector('[data-form]');
  const search = root.querySelector('[data-search]');
  const tbody = root.querySelector('[data-tbody]');
  const summary = root.querySelector('[data-summary]');
  const title = root.querySelector('[data-modal-title]');
  const headers = Array.from(root.querySelectorAll('th[data-sort]'));

  const sortAccessors = {
    pets: {
      name: (item) => item.name || '', tutor_name: (item) => item.tutor_name || '', breed: (item) => item.breed || '', size: (item) => item.size || '', status: (item) => item.is_active ? 'Ativo' : 'Inativo'
    },
    services: {
      name: (item) => item.name || '', duration_minutes: (item) => Number(item.duration_minutes || 0), price_cents: (item) => Number(item.price_cents || 0), status: (item) => item.status || '', description: (item) => item.description || ''
    },
    users: {
      full_name: (item) => item.full_name || '', role_label: (item) => item.role_label || item.role || '', phone: (item) => item.phone || '', status: (item) => item.is_active ? 'Ativo' : 'Inativo'
    },
    roles: {
      name: (item) => item.name || '', description: (item) => item.description || '', permissions: (item) => (item.permissions || []).join(', ')
    }
  };

  const toast = (message) => {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-open');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => toastEl.classList.remove('is-open'), 2400);
  };

  async function loadMeta() {
    state.meta = await api.get('/api/tenant/manage/meta');
  }

  function openModal(item = null) {
    state.editing = item;
    title.textContent = item ? 'Editar registro' : 'Novo registro';
    form.reset();
    form.elements.id.value = item?.id || '';
    if (kind === 'pets') {
      form.elements.name.value = item?.name || '';
      form.elements.tutor_id.value = item?.tutor_id || '';
      form.elements.species.value = item?.species || 'Canina';
      form.elements.breed.value = item?.breed || '';
      form.elements.size.value = item?.size || '';
      form.elements.gender.value = item?.gender || '';
      form.elements.is_active.checked = item?.is_active ?? true;
    } else if (kind === 'services') {
      form.elements.name.value = item?.name || '';
      form.elements.category.value = item?.category || '';
      form.elements.duration_minutes.value = item?.duration_minutes || 60;
      form.elements.price.value = item?.price_cents ? (Number(item.price_cents) / 100).toFixed(2).replace('.', ',') : '';
      form.elements.status.value = item?.status || 'ativo';
      form.elements.description.value = item?.description || '';
    } else if (kind === 'users') {
      form.elements.full_name.value = item?.full_name || '';
      form.elements.email.value = item?.email || '';
      form.elements.phone.value = item?.phone || '';
      form.elements.role_label.value = item?.role_label || item?.role || '';
      form.elements.is_active.checked = item?.is_active ?? true;
    } else if (kind === 'roles') {
      form.elements.name.value = item?.name || '';
      form.elements.description.value = item?.description || '';
      form.elements.permissions.value = (item?.permissions || []).join(', ');
    }
    modal?.classList.add('is-open');
  }

  function closeModal() {
    state.editing = null;
    modal?.classList.remove('is-open');
  }

  function renderSummary() {
    if (!summary) return;
    if (kind === 'pets') {
      const active = state.items.filter((item) => item.is_active).length;
      summary.innerHTML = `<article class="summary-card"><span class="label">Pets</span><strong>${state.items.length}</strong><small>Total cadastrado no ambiente.</small></article><article class="summary-card"><span class="label">Ativos</span><strong>${active}</strong><small>Pets disponíveis para operação.</small></article><article class="summary-card"><span class="label">Inativos</span><strong>${state.items.length - active}</strong><small>Registros pausados ou arquivados.</small></article>`;
      return;
    }
    if (kind === 'services') {
      const active = state.items.filter((item) => item.status === 'ativo').length;
      const avg = state.items.length ? Math.round(state.items.reduce((acc, item) => acc + Number(item.duration_minutes || 0), 0) / state.items.length) : 0;
      summary.innerHTML = `<article class="summary-card"><span class="label">Serviços</span><strong>${state.items.length}</strong><small>Catálogo ativo do pet shop.</small></article><article class="summary-card"><span class="label">Ativos</span><strong>${active}</strong><small>Prontos para venda na agenda.</small></article><article class="summary-card"><span class="label">Duração média</span><strong>${avg} min</strong><small>Base para organização operacional.</small></article>`;
      return;
    }
    if (kind === 'users') {
      const active = state.items.filter((item) => item.is_active).length;
      summary.innerHTML = `<article class="summary-card"><span class="label">Usuários</span><strong>${state.items.length}</strong><small>Equipe com acesso ao sistema.</small></article><article class="summary-card"><span class="label">Ativos</span><strong>${active}</strong><small>Usuários habilitados para operar.</small></article><article class="summary-card"><span class="label">Perfis</span><strong>${new Set(state.items.map((item) => item.role_label || item.role).filter(Boolean)).size}</strong><small>Perfis disponíveis para atribuição.</small></article>`;
      return;
    }
    const system = state.items.filter((item) => item.is_system).length;
    summary.innerHTML = `<article class="summary-card"><span class="label">Cargos</span><strong>${state.items.length}</strong><small>Estrutura de acesso do ambiente.</small></article><article class="summary-card"><span class="label">Do sistema</span><strong>${system}</strong><small>Cargos protegidos para a base.</small></article><article class="summary-card"><span class="label">Personalizados</span><strong>${state.items.length - system}</strong><small>Cargos criados pelo assinante.</small></article>`;
  }

  function rowMenu(item) {
    if (kind === 'users') {
      return `<div class="row-menu-wrap"><button class="row-menu-toggle" type="button" data-menu-toggle="${item.id}" aria-label="Abrir ações">⋮</button><div class="row-menu ${state.openMenuId === item.id ? 'is-open' : ''}"><button class="row-menu-item" type="button" data-edit="${item.id}"><span class="icon">✎</span><span>Editar</span></button><button class="row-menu-item" type="button" data-toggle="${item.id}"><span class="icon">⇄</span><span>${item.is_active ? 'Desativar' : 'Ativar'}</span></button></div></div>`;
    }
    return `<div class="row-menu-wrap"><button class="row-menu-toggle" type="button" data-menu-toggle="${item.id}" aria-label="Abrir ações">⋮</button><div class="row-menu ${state.openMenuId === item.id ? 'is-open' : ''}"><button class="row-menu-item" type="button" data-edit="${item.id}"><span class="icon">✎</span><span>Editar</span></button>${kind === 'roles' && item.is_system ? '' : `<button class="row-menu-item danger" type="button" data-delete="${item.id}"><span class="icon">⊘</span><span>Excluir</span></button>`}</div></div>`;
  }

  function rowHtml(item) {
    if (kind === 'pets') {
      return `<tr><td><strong>${esc(item.name)}</strong><span class="mini-muted">${esc(item.species || 'Canina')}</span></td><td>${esc(item.tutor_name || '')}</td><td>${esc(item.breed || '—')}</td><td>${esc(item.size || '—')}</td><td><span class="status-pill ${item.is_active ? 'ativo' : 'inativo'}">${item.is_active ? 'Ativo' : 'Inativo'}</span></td><td><div class="row-actions">${rowMenu(item)}</div></td></tr>`;
    }
    if (kind === 'services') {
      return `<tr><td><strong>${esc(item.name)}</strong><span class="mini-muted">${esc(item.category || 'Sem categoria')}</span></td><td>${item.duration_minutes} min</td><td>${money(item.price_cents)}</td><td><span class="status-pill ${esc(item.status)}">${esc(item.status)}</span></td><td>${esc(item.description || '—')}</td><td><div class="row-actions">${rowMenu(item)}</div></td></tr>`;
    }
    if (kind === 'users') {
      return `<tr><td><strong>${esc(item.full_name)}</strong><span class="mini-muted">${esc(item.email)}</span></td><td>${esc(item.role_label || item.role || '—')}</td><td>${esc(item.phone || '—')}</td><td><span class="status-pill ${item.is_active ? 'ativo' : 'inativo'}">${item.is_active ? 'Ativo' : 'Inativo'}</span></td><td><div class="row-actions">${rowMenu(item)}</div></td></tr>`;
    }
    return `<tr><td><strong>${esc(item.name)}</strong><span class="mini-muted">${item.is_system ? 'Cargo do sistema' : 'Personalizado'}</span></td><td>${esc(item.description || '—')}</td><td>${(item.permissions || []).map((permission) => `<span class="tag-pill">${esc(permission)}</span>`).join(' ') || '—'}</td><td><div class="row-actions">${rowMenu(item)}</div></td></tr>`;
  }

  function applySortIndicators() {
    headers.forEach((header) => {
      const active = state.sortKey === header.dataset.sort;
      header.classList.toggle('is-asc', active && state.sortDir === 'asc');
      header.classList.toggle('is-desc', active && state.sortDir === 'desc');
    });
  }

  function applyView() {
    let items = [...state.items];
    if (state.sortKey) {
      const accessor = sortAccessors[kind]?.[state.sortKey];
      if (accessor) {
        items.sort((a, b) => {
          const result = compareValues(accessor(a), accessor(b));
          return state.sortDir === 'asc' ? result : -result;
        });
      }
    }
    state.viewItems = items;
    applySortIndicators();
  }

  function renderTable() {
    if (!state.viewItems.length) {
      tbody.innerHTML = `<tr><td colspan="${kind === 'users' || kind === 'roles' ? 5 : 6}" class="empty-state">Nenhum registro encontrado.</td></tr>`;
      return;
    }
    tbody.innerHTML = state.viewItems.map(rowHtml).join('');
  }

  async function load() {
    const query = new URLSearchParams();
    if (search?.value.trim()) query.set('search', search.value.trim());
    state.items = (await api.get(`/api/tenant/manage/${kind}?${query.toString()}`)).items || [];
    state.openMenuId = null;
    renderSummary();
    applyView();
    renderTable();
  }

  async function submit(event) {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    if (kind === 'pets') payload.is_active = form.elements.is_active.checked;
    if (kind === 'users') payload.is_active = form.elements.is_active.checked;
    if (kind === 'roles') payload.permissions = payload.permissions.split(',').map((item) => item.trim()).filter(Boolean);
    const id = payload.id;
    delete payload.id;
    if (id) {
      await api.put(`/api/tenant/manage/${kind}/${id}`, payload);
      toast('Registro atualizado com sucesso.');
    } else {
      await api.post(`/api/tenant/manage/${kind}`, payload);
      toast('Registro criado com sucesso.');
    }
    closeModal();
    await loadMeta();
    await load();
  }

  tbody.addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit]')?.dataset.edit;
    const del = event.target.closest('[data-delete]')?.dataset.delete;
    const toggle = event.target.closest('[data-toggle]')?.dataset.toggle;
    const menuToggle = event.target.closest('[data-menu-toggle]')?.dataset.menuToggle;
    if (menuToggle) {
      state.openMenuId = state.openMenuId === menuToggle ? null : menuToggle;
      renderTable();
      return;
    }
    if (edit) { openModal(state.items.find((item) => item.id === edit)); return; }
    if (del) {
      if (!window.confirm('Deseja remover este registro?')) return;
      await api.delete(`/api/tenant/manage/${kind}/${del}`);
      toast('Registro removido com sucesso.');
      await load();
      return;
    }
    if (toggle && kind === 'users') {
      await api.patch(`/api/tenant/manage/users/${toggle}/toggle-status`, {});
      toast('Status do usuário atualizado.');
      await load();
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.row-menu-wrap') && state.openMenuId) {
      state.openMenuId = null;
      renderTable();
    }
  });

  headers.forEach((header) => {
    header.classList.add('sortable');
    header.addEventListener('click', () => {
      const key = header.dataset.sort;
      if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      else { state.sortKey = key; state.sortDir = 'asc'; }
      applyView();
      renderTable();
    });
  });

  search?.addEventListener('input', load);
  root.querySelector('[data-new]')?.addEventListener('click', () => openModal());
  root.querySelector('[data-close]')?.addEventListener('click', closeModal);
  root.querySelector('[data-cancel]')?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  form?.addEventListener('submit', submit);

  await loadMeta();

  if (kind === 'pets') {
    const options = state.meta.tutors.map((item) => `<option value="${item.id}">${esc(item.full_name)}</option>`).join('');
    form.querySelector('[name="tutor_id"]').insertAdjacentHTML('beforeend', options);
  } else if (kind === 'users') {
    const options = state.meta.roles.map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join('');
    form.querySelector('[name="role_label"]').insertAdjacentHTML('beforeend', options);
  }

  await load();
}
