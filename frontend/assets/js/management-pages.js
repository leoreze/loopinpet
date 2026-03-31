import { api, runWithLoading } from './api.js';

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
  const state = { items: [], viewItems: [], meta: { tutors: [], roles: [], permissions: [], services: [], service_categories: [], pet_sizes: [] }, editing: null, openMenuId: null, sortKey: null, sortDir: 'asc', serviceCategoryEditing: null, permissionEditing: null };
  const toastEl = document.querySelector('[data-toast]');
  const modal = root.querySelector('[data-modal]');
  const form = root.querySelector('[data-form]');
  const search = root.querySelector('[data-search]');
  const tbody = root.querySelector('[data-tbody]');
  const summary = root.querySelector('[data-summary]');
  const title = root.querySelector('[data-modal-title]');
  const headers = Array.from(root.querySelectorAll('th[data-sort]'));
  const manageCategoriesBtn = root.querySelector('[data-manage-categories]');
  const categoryModal = document.querySelector('[data-category-modal]');
  const categoryForm = document.querySelector('[data-category-form]');
  const categoryList = document.querySelector('[data-category-list]');
  const managePermissionsBtn = root.querySelector('[data-manage-permissions]');
  const permissionModal = document.querySelector('[data-permission-modal]');
  const permissionForm = document.querySelector('[data-permission-form]');
  const permissionList = document.querySelector('[data-permission-list]');
  const permissionCodeOptions = document.querySelector('[data-permission-code-options]');
  const permissionsGrid = root.querySelector('[data-permissions-grid]');

  const sortAccessors = {
    pets: {
      name: (item) => item.name || '', tutor_name: (item) => item.tutor_name || '', breed: (item) => item.breed || '', size: (item) => item.size || '', status: (item) => item.is_active ? 'Ativo' : 'Inativo'
    },
    services: {
      name: (item) => item.name || '', category: (item) => item.category || '', duration_minutes: (item) => Number(item.duration_minutes || 0), price_cents: (item) => Number(item.price_cents || 0), pet_size: (item) => item.pet_size_name || item.pet_size_label || '', status: (item) => item.status || '', description: (item) => item.description || ''
    },
    users: {
      full_name: (item) => item.full_name || '', role_label: (item) => item.role_label || item.role || '', phone: (item) => item.phone || '', status: (item) => item.is_active ? 'Ativo' : 'Inativo'
    },
    roles: {
      name: (item) => item.name || '', description: (item) => item.description || '', permissions: (item) => (item.permission_names || item.permissions || []).join(', '), status: (item) => item.is_active ? 'Ativo' : 'Inativo'
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

  function renderServiceCategoryOptions(selectedValue = '') {
    if (kind !== 'services') return;
    const select = form?.elements?.category;
    if (!select) return;
    const current = selectedValue || select.value || '';
    select.innerHTML = '<option value="">Selecione</option>' + state.meta.service_categories.filter((item) => item.is_active !== false).map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join('');
    select.value = current;
  }

  function renderServiceSizeOptions(selectedValue = '') {
    if (kind !== 'services') return;
    const select = form?.elements?.pet_size_id;
    if (!select) return;
    const current = selectedValue || select.value || '';
    select.innerHTML = '<option value="">Selecione</option>' + (state.meta.pet_sizes || []).map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
    select.value = current;
  }

  function openCategoryModal(item = null) {
    if (!categoryModal || !categoryForm) return;
    state.serviceCategoryEditing = item;
    categoryForm.reset();
    categoryForm.elements.id.value = item?.id || '';
    categoryForm.elements.name.value = item?.name || '';
    categoryForm.elements.description.value = item?.description || '';
    if (categoryForm.elements.status) categoryForm.elements.status.value = item?.is_active === false ? 'inativo' : 'ativo';
    categoryModal.classList.add('is-open');
  }

  function closeCategoryModal() {
    state.serviceCategoryEditing = null;
    categoryModal?.classList.remove('is-open');
  }

  function renderCategoryList() {
    if (!categoryList || kind !== 'services') return;
    if (!state.meta.service_categories?.length) {
      categoryList.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhuma categoria cadastrada.</td></tr>';
      return;
    }
    categoryList.innerHTML = state.meta.service_categories.map((item) => `
      <tr>
        <td><strong>${esc(item.name)}</strong></td>
        <td>${esc(item.description || '—')}</td>
        <td><span class="status-pill ${item.is_active ? 'ativo' : 'inativo'}">${item.is_active ? 'Ativo' : 'Inativo'}</span></td>
        <td><div class="row-actions"><button class="icon-action" type="button" data-category-edit="${item.id}" title="Editar">✎</button><button class="icon-action danger" type="button" data-category-delete="${item.id}" title="Excluir">⊘</button></div></td>
      </tr>
    `).join('');
  }

  function renderPermissionsGrid(selected = []) {
    if (kind !== 'roles' || !permissionsGrid) return;
    const selectedSet = new Set((selected || []).map(String));
    if (!state.meta.permissions?.length) {
      permissionsGrid.innerHTML = '<div class="empty-state">Nenhuma permissão cadastrada.</div>';
      return;
    }
    permissionsGrid.innerHTML = state.meta.permissions.map((item) => `
      <label class="check-item">
        <input type="checkbox" value="${esc(item.code)}" ${selectedSet.has(String(item.code)) ? 'checked' : ''} ${item.is_active ? '' : 'disabled'} />
        <span><strong>${esc(item.name)}</strong><br><small class="mini-muted">${esc(item.description || item.code)}</small></span>
      </label>
    `).join('');
  }

  function syncPermissionsField() {
    if (kind !== 'roles' || !form?.elements?.permissions || !permissionsGrid) return;
    const values = Array.from(permissionsGrid.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
    form.elements.permissions.value = values.join(',');
  }

  function openPermissionModal(item = null) {
    if (!permissionModal || !permissionForm) return;
    state.permissionEditing = item;
    permissionForm.reset();
    permissionForm.elements.id.value = item?.id || '';
    permissionForm.elements.name.value = item?.name || '';
    permissionForm.elements.code.value = item?.code || '';
    permissionForm.elements.description.value = item?.description || '';
    if (permissionForm.elements.is_active) permissionForm.elements.is_active.checked = item?.is_active ?? true;
    renderPermissionCodeOptions();
    permissionModal.classList.add('is-open');
  }

  function closePermissionModal() {
    state.permissionEditing = null;
    permissionModal?.classList.remove('is-open');
  }

  function renderPermissionList() {
    if (!permissionList || kind !== 'roles') return;
    if (!state.meta.permissions?.length) {
      permissionList.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhuma permissão cadastrada.</td></tr>';
      return;
    }
    permissionList.innerHTML = state.meta.permissions.map((item) => `
      <tr>
        <td><strong>${esc(item.name)}</strong></td>
        <td>${esc(item.description || '—')}</td>
        <td>${esc(item.code || '—')}</td>
        <td><span class="status-pill ${item.is_active ? 'ativo' : 'inativo'}">${item.is_active ? 'Ativo' : 'Inativo'}</span></td>
        <td><div class="row-actions"><button class="icon-action" type="button" data-permission-edit="${item.id}" title="Editar">✎</button><button class="icon-action danger" type="button" data-permission-delete="${item.id}" title="Excluir">⊘</button></div></td>
      </tr>
    `).join('');
  }

  function renderPermissionCodeOptions() {
    if (!permissionCodeOptions || kind !== 'roles') return;
    const codes = [...new Set((state.meta.permissions || []).map((item) => String(item.code || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    permissionCodeOptions.innerHTML = codes.map((code) => `<option value="${esc(code)}"></option>`).join('');
  }


  function openModal(item = null) {
    state.editing = item;
    title.textContent = kind === 'services' ? (item ? 'Editar serviço' : 'Novo serviço') : (item ? 'Editar registro' : 'Novo registro');
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
      renderServiceCategoryOptions(item?.category || '');
      renderServiceSizeOptions(item?.pet_size_id || '');
      form.elements.duration_minutes.value = item?.duration_minutes || 60;
      form.elements.price.value = item?.price_cents ? (Number(item.price_cents) / 100).toFixed(2).replace('.', ',') : '';
      form.elements.status.value = item?.status || 'ativo';
      form.elements.description.value = item?.description || '';
      if (form.elements.pet_size_id) form.elements.pet_size_id.value = item?.pet_size_id || '';
      renderCategoryList();
    } else if (kind === 'users') {
      form.elements.full_name.value = item?.full_name || '';
      form.elements.email.value = item?.email || '';
      form.elements.phone.value = item?.phone || '';
      form.elements.role_label.value = item?.role_label || item?.role || '';
      form.elements.is_active.checked = item?.is_active ?? true;
    } else if (kind === 'roles') {
      form.elements.name.value = item?.name || '';
      form.elements.description.value = item?.description || '';
      if (form.elements.is_active) form.elements.is_active.value = String(item?.is_active ?? true);
      renderPermissionsGrid(item?.permissions || []);
      syncPermissionsField();
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
    if (kind === 'roles') {
      return `<div class="row-menu-wrap"><button class="row-menu-toggle" type="button" data-menu-toggle="${item.id}" aria-label="Abrir ações">⋮</button><div class="row-menu ${state.openMenuId === item.id ? 'is-open' : ''}"><button class="row-menu-item" type="button" data-edit="${item.id}"><span class="icon">✎</span><span>Editar</span></button><button class="row-menu-item" type="button" data-toggle="${item.id}"><span class="icon">⇄</span><span>${item.is_active ? 'Desativar' : 'Ativar'}</span></button>${item.is_system ? '' : `<button class="row-menu-item danger" type="button" data-delete="${item.id}"><span class="icon">⊘</span><span>Excluir</span></button>`}</div></div>`;
    }
    return `<div class="row-menu-wrap"><button class="row-menu-toggle" type="button" data-menu-toggle="${item.id}" aria-label="Abrir ações">⋮</button><div class="row-menu ${state.openMenuId === item.id ? 'is-open' : ''}"><button class="row-menu-item" type="button" data-edit="${item.id}"><span class="icon">✎</span><span>Editar</span></button><button class="row-menu-item danger" type="button" data-delete="${item.id}"><span class="icon">⊘</span><span>Excluir</span></button></div></div>`;
  }

  function rowHtml(item) {
    if (kind === 'pets') {
      return `<tr><td><strong>${esc(item.name)}</strong><span class="mini-muted">${esc(item.species || 'Canina')}</span></td><td>${esc(item.tutor_name || '')}</td><td>${esc(item.breed || '—')}</td><td>${esc(item.size || '—')}</td><td><span class="status-pill ${item.is_active ? 'ativo' : 'inativo'}">${item.is_active ? 'Ativo' : 'Inativo'}</span></td><td><div class="row-actions">${rowMenu(item)}</div></td></tr>`;
    }
    if (kind === 'services') {
      return `<tr><td><strong>${esc(item.name)}</strong></td><td>${esc(item.category || 'Sem categoria')}</td><td>${esc(item.pet_size_name || item.pet_size_label || 'Todos os portes')}</td><td>${item.duration_minutes} min</td><td>${money(item.price_cents)}</td><td><span class="status-pill ${esc(item.status)}">${esc(item.status)}</span></td><td>${esc(item.description || '—')}</td><td><div class="row-actions">${rowMenu(item)}</div></td></tr>`;
    }
    if (kind === 'users') {
      return `<tr><td><strong>${esc(item.full_name)}</strong><span class="mini-muted">${esc(item.email)}</span></td><td>${esc(item.role_label || item.role || '—')}</td><td>${esc(item.phone || '—')}</td><td><span class="status-pill ${item.is_active ? 'ativo' : 'inativo'}">${item.is_active ? 'Ativo' : 'Inativo'}</span></td><td><div class="row-actions">${rowMenu(item)}</div></td></tr>`;
    }
    const permissionLabels = (item.permission_names || item.permissions || []).map((permission) => `<span class="tag-pill">${esc(permission)}</span>`).join(' ') || '—';
    return `<tr><td><strong>${esc(item.name)}</strong><span class="mini-muted">${item.is_system ? 'Cargo do sistema' : 'Personalizado'}</span></td><td>${esc(item.description || '—')}</td><td>${permissionLabels}</td><td><span class="status-pill ${item.is_active ? 'ativo' : 'inativo'}">${item.is_active ? 'Ativo' : 'Inativo'}</span></td><td><div class="row-actions">${rowMenu(item)}</div></td></tr>`;
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
      tbody.innerHTML = `<tr><td colspan="${kind === 'services' ? 8 : (kind === 'users' || kind === 'roles' ? 5 : 6)}" class="empty-state">Nenhum registro encontrado.</td></tr>`;
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
    if (kind === 'roles') { syncPermissionsField(); payload.is_active = payload.is_active === 'true'; payload.permissions = payload.permissions.split(',').map((item) => item.trim()).filter(Boolean); }
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
      return;
    }
    if (toggle && kind === 'roles') {
      await api.patch(`/api/tenant/manage/roles/${toggle}/toggle-status`, {});
      toast('Status do cargo atualizado.');
      await loadMeta();
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
  root.querySelector('[data-new]')?.addEventListener('click', async () => {
    await runWithLoading('Preparando o cadastro do serviço...', async () => {
      if (kind === 'services') {
        await loadMeta();
        renderServiceCategoryOptions(form?.elements?.category?.value || '');
        renderServiceSizeOptions(form?.elements?.pet_size_id?.value || '');
        renderCategoryList();
      }
      openModal();
    });
  });
  manageCategoriesBtn?.addEventListener('click', async () => {
    await runWithLoading('Preparando o cadastro de categorias...', async () => {
      await loadMeta();
      renderServiceCategoryOptions(form?.elements?.category?.value || '');
      renderCategoryList();
      openCategoryModal();
    });
  });
  managePermissionsBtn?.addEventListener('click', () => openPermissionModal());
  permissionsGrid?.addEventListener('change', syncPermissionsField);
  root.querySelector('[data-close]')?.addEventListener('click', closeModal);
  root.querySelector('[data-cancel]')?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  form?.addEventListener('submit', submit);
  categoryModal?.addEventListener('click', (event) => { if (event.target === categoryModal || event.target.closest('[data-category-close]') || event.target.closest('[data-category-cancel]')) closeCategoryModal(); });
  permissionModal?.addEventListener('click', (event) => { if (event.target === permissionModal || event.target.closest('[data-permission-close]') || event.target.closest('[data-permission-cancel]')) closePermissionModal(); });
  categoryForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(categoryForm).entries());
    payload.is_active = (categoryForm.elements.status?.value || 'ativo') === 'ativo';
    delete payload.status;
    const id = payload.id;
    delete payload.id;
    if (id) await api.put(`/api/tenant/manage/service-meta/service_categories/${id}`, payload);
    else await api.post('/api/tenant/manage/service-meta/service_categories', payload);
    toast(id ? 'Categoria atualizada com sucesso.' : 'Categoria criada com sucesso.');
    await loadMeta();
    renderServiceCategoryOptions(form?.elements?.category?.value || '');
    renderCategoryList();
    closeCategoryModal();
  });
  categoryList?.addEventListener('click', async (event) => {
    const editId = event.target.closest('[data-category-edit]')?.dataset.categoryEdit;
    const deleteId = event.target.closest('[data-category-delete]')?.dataset.categoryDelete;
    if (editId) {
      await runWithLoading('Carregando categoria...', async () => {
        await loadMeta();
        renderServiceCategoryOptions(form?.elements?.category?.value || '');
        renderCategoryList();
        openCategoryModal(state.meta.service_categories.find((item) => item.id === editId));
      });
      return;
    }
    if (deleteId) {
      if (!window.confirm('Deseja remover esta categoria?')) return;
      await api.delete(`/api/tenant/manage/service-meta/service_categories/${deleteId}`);
      toast('Categoria removida com sucesso.');
      await loadMeta();
      renderServiceCategoryOptions();
      renderCategoryList();
    }
  });
  permissionForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(permissionForm).entries());
    payload.is_active = permissionForm.elements.is_active?.checked ?? true;
    const id = payload.id;
    delete payload.id;
    if (id) await api.put(`/api/tenant/manage/permissions/${id}`, payload);
    else await api.post('/api/tenant/manage/permissions', payload);
    toast(id ? 'Permissão atualizada com sucesso.' : 'Permissão criada com sucesso.');
    await loadMeta();
    renderPermissionList();
    renderPermissionCodeOptions();
    renderPermissionsGrid((form?.elements?.permissions?.value || '').split(',').map((item) => item.trim()).filter(Boolean));
    syncPermissionsField();
    closePermissionModal();
  });
  root.querySelector('[data-restore-permissions]')?.addEventListener('click', async () => {
    await api.post('/api/tenant/manage/permissions/restore-defaults', {});
    toast('Permissões padrão restauradas com sucesso.');
    await loadMeta();
    renderPermissionList();
    renderPermissionCodeOptions();
    renderPermissionsGrid((form?.elements?.permissions?.value || '').split(',').map((item) => item.trim()).filter(Boolean));
    syncPermissionsField();
  });

  permissionList?.addEventListener('click', async (event) => {
    const editId = event.target.closest('[data-permission-edit]')?.dataset.permissionEdit;
    const deleteId = event.target.closest('[data-permission-delete]')?.dataset.permissionDelete;
    if (editId) {
      openPermissionModal(state.meta.permissions.find((item) => item.id === editId));
      return;
    }
    if (deleteId) {
      if (!window.confirm('Deseja remover esta permissão?')) return;
      await api.delete(`/api/tenant/manage/permissions/${deleteId}`);
      toast('Permissão removida com sucesso.');
      await loadMeta();
      renderPermissionList();
      renderPermissionCodeOptions();
      renderPermissionsGrid((form?.elements?.permissions?.value || '').split(',').map((item) => item.trim()).filter(Boolean));
      syncPermissionsField();
    }
  });

  await loadMeta();

  if (kind === 'pets') {
    const options = state.meta.tutors.map((item) => `<option value="${item.id}">${esc(item.full_name)}</option>`).join('');
    form.querySelector('[name="tutor_id"]').insertAdjacentHTML('beforeend', options);
  } else if (kind === 'services') {
    renderServiceCategoryOptions();
    renderServiceSizeOptions();
    renderCategoryList();
  } else if (kind === 'users') {
    const options = state.meta.roles.map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join('');
    form.querySelector('[name="role_label"]').insertAdjacentHTML('beforeend', options);
  } else if (kind === 'roles') {
    renderPermissionsGrid();
    renderPermissionList();
    renderPermissionCodeOptions();
    syncPermissionsField();
  }

  await load();
}
