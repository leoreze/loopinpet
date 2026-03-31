import { api } from './api.js';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || '').concat(parts[1]?.[0] || '').toUpperCase() || 'CL';
}

function maskPhone(value = '') {
  const digits = String(value || '').replace(/\D/g, '').slice(-11);
  if (!digits) return '';
  if (digits.length <= 10) return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim();
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim();
}

function phoneHref(value = '') {
  return String(value || '').replace(/\D/g, '');
}

export async function initCollaboratorsCrud() {
  const elements = {
    search: document.querySelector('[data-collab-search]'),
    statusButtons: Array.from(document.querySelectorAll('[data-status-button]')),
    summary: document.querySelector('[data-collab-summary]'),
    list: document.querySelector('[data-collab-list]'),
    newButton: document.querySelector('[data-new-collab]'),
    formModal: document.querySelector('[data-form-modal]'),
    form: document.querySelector('[data-collab-form]'),
    formClose: document.querySelector('[data-form-close]'),
    breadcrumb: document.querySelector('[data-form-breadcrumb]'),
    roleSelect: document.querySelector('[name="role_label"]'),
    photoPreview: document.querySelector('[data-photo-preview]'),
    photoFile: document.querySelector('[data-photo-file]'),
    toast: document.querySelector('[data-toast]')
  };

  const state = { items: [], roles: [], status: 'active', search: '', editing: null, openMenuId: null, toastTimer: null };

  function openToast(message) {
    if (!elements.toast) return;
    elements.toast.textContent = message;
    elements.toast.classList.add('is-open');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => elements.toast.classList.remove('is-open'), 2600);
  }

  function avatarHtml(name = '', photoUrl = '') {
    if (photoUrl) return `<span class="tutor-avatar tutor-avatar--image"><img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(name || 'Colaborador')}" /></span>`;
    return `<span class="tutor-avatar">${escapeHtml(initials(name))}</span>`;
  }

  function filteredItems() {
    return state.items.filter((item) => {
      const text = `${item.full_name || ''} ${item.email || ''} ${item.role_label || item.role || ''} ${item.phone || ''}`.toLowerCase();
      const matchesSearch = !state.search || text.includes(state.search);
      const matchesStatus = state.status === 'all' || (state.status === 'active' ? item.is_active : !item.is_active);
      return matchesSearch && matchesStatus;
    });
  }

  function renderSummary() {
    const items = filteredItems();
    const active = state.items.filter((item) => item.is_active).length;
    const roles = new Set(state.items.map((item) => item.role_label || item.role).filter(Boolean)).size;
    elements.summary.innerHTML = `
      <article class="client-summary-card"><span class="label">Colaboradores</span><strong>${items.length}</strong><small>Total retornado para o filtro atual.</small></article>
      <article class="client-summary-card"><span class="label">Ativos</span><strong>${active}</strong><small>Equipe disponível para operação.</small></article>
      <article class="client-summary-card"><span class="label">Cargos</span><strong>${roles}</strong><small>Funções cadastradas para seleção.</small></article>
    `;
  }

  function renderRolesOptions(selected = '') {
    if (!elements.roleSelect) return;
    elements.roleSelect.innerHTML = `<option value="">Selecione o cargo</option>${state.roles.map((role) => `<option value="${escapeHtml(role.name)}" ${role.name === selected ? 'selected' : ''}>${escapeHtml(role.name)}</option>`).join('')}`;
  }

  function renderList() {
    const items = filteredItems();
    if (!items.length) {
      elements.list.innerHTML = '<div class="empty-state">Nenhum colaborador encontrado para este filtro.</div>';
      return;
    }
    elements.list.innerHTML = `
      <div class="clients-table-card">
        <div class="clients-table-header">
          <div>Foto</div><div>Nome</div><div>WhatsApp</div><div>Cargo</div><div>Status</div><div class="clients-table-actions-label">Ações</div>
        </div>
        <div class="clients-table-body">
          ${items.map((item) => `
            <article class="tutor-row tutor-row--table" data-row-id="${item.id}">
              <div class="clients-cell clients-cell--photo">${avatarHtml(item.full_name, item.photo_url)}</div>
              <div class="clients-cell clients-cell--name"><div class="tutor-name">${escapeHtml(item.full_name || 'Sem nome')}</div><div class="tutor-meta"><span>${escapeHtml(item.email || 'Sem e-mail')}</span></div></div>
              <div class="clients-cell clients-cell--whatsapp">${item.phone ? `<a class="tutor-phone-link" href="https://wa.me/55${phoneHref(item.phone)}" target="_blank" rel="noreferrer">${escapeHtml(maskPhone(item.phone))}</a>` : '<span class="muted">—</span>'}</div>
              <div class="clients-cell clients-cell--pets"><span>${escapeHtml(item.role_label || item.role || '—')}</span></div>
              <div class="clients-cell clients-cell--status"><span class="status-badge ${item.is_active ? 'is-active' : 'is-inactive'}">${item.is_active ? 'Ativo' : 'Inativo'}</span></div>
              <div class="clients-cell clients-cell--actions"><div class="row-menu-wrap"><button class="row-menu-toggle" type="button" data-menu-toggle="${item.id}" aria-label="Abrir ações">⋮</button><div class="row-menu ${state.openMenuId === item.id ? 'is-open' : ''}"><button class="row-menu-item" type="button" data-action="edit" data-id="${item.id}"><span class="icon">✎</span><span>Editar colaborador</span></button><button class="row-menu-item danger" type="button" data-action="toggle-status" data-id="${item.id}"><span class="icon">⊘</span><span>${item.is_active ? 'Desativar' : 'Ativar'}</span></button></div></div></div>
            </article>
          `).join('')}
        </div>
      </div>`;
  }

  function renderPhotoPreview(name = '', photoUrl = '') {
    if (!elements.photoPreview) return;
    elements.photoPreview.innerHTML = photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(name || 'Colaborador')}" />` : `<span>${escapeHtml(initials(name || 'Equipe'))}</span>`;
  }

  function openForm(item = null) {
    state.editing = item;
    elements.form.reset();
    elements.breadcrumb.textContent = item ? 'Colaboradores → Editar' : 'Colaboradores → Cadastrar';
    elements.form.elements.id.value = item?.id || '';
    elements.form.elements.full_name.value = item?.full_name || '';
    elements.form.elements.email.value = item?.email || '';
    elements.form.elements.phone.value = maskPhone(item?.phone || '');
    renderRolesOptions(item?.role_label || item?.role || '');
    elements.form.elements.role_label.value = item?.role_label || item?.role || '';
    elements.form.elements.password.value = '';
    elements.form.elements.photo_url.value = item?.photo_url || '';
    if (elements.photoFile) elements.photoFile.value = '';
    elements.form.elements.is_active.value = String(item?.is_active ?? true);
    elements.form.elements.notes.value = item?.notes || '';
    renderPhotoPreview(item?.full_name || 'Equipe', item?.photo_url || '');
    elements.formModal.classList.add('is-open');
  }

  function closeForm() {
    state.editing = null;
    state.openMenuId = null;
    elements.formModal.classList.remove('is-open');
  }

  async function load() {
    const [itemsResponse, rolesResponse, metaResponse] = await Promise.all([
      api.get('/api/tenant/manage/users'),
      api.get('/api/tenant/manage/roles').catch(() => ({ items: [] })),
      api.get('/api/tenant/manage/meta').catch(() => ({ roles: [] }))
    ]);

    state.items = itemsResponse.items || [];

    const roleMap = new Map();
    const sourceRoles = [
      ...(rolesResponse.items || rolesResponse.roles || []),
      ...(metaResponse.roles || [])
    ];

    sourceRoles.forEach((role) => {
      const name = String(role?.name || role?.role_label || role?.label || '').trim();
      if (!name) return;
      if (role?.is_active === false) return;
      if (!roleMap.has(name)) {
        roleMap.set(name, {
          id: role?.id || name,
          name,
          is_active: role?.is_active !== false
        });
      }
    });

    state.roles = Array.from(roleMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    renderRolesOptions();
    renderSummary();
    renderList();
  }

  elements.search?.addEventListener('input', (event) => {
    state.search = String(event.target.value || '').trim().toLowerCase();
    renderSummary();
    renderList();
  });

  elements.statusButtons.forEach((button) => button.addEventListener('click', () => {
    state.status = button.dataset.status || 'active';
    elements.statusButtons.forEach((item) => item.classList.toggle('is-active', item === button));
    renderSummary();
    renderList();
  }));

  elements.newButton?.addEventListener('click', () => openForm());
  elements.formClose?.addEventListener('click', closeForm);
  elements.formModal?.addEventListener('click', (event) => { if (event.target === elements.formModal) closeForm(); });
  elements.form.elements.full_name?.addEventListener('input', (event) => renderPhotoPreview(event.target.value, elements.form.elements.photo_url.value));
  elements.photoFile?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    elements.form.elements.photo_url.value = dataUrl;
    renderPhotoPreview(elements.form.elements.full_name.value, dataUrl);
  });

  elements.list?.addEventListener('click', async (event) => {
    const toggleButton = event.target.closest('[data-menu-toggle]');
    if (toggleButton) {
      const id = toggleButton.dataset.menuToggle;
      state.openMenuId = state.openMenuId === id ? null : id;
      renderList();
      return;
    }
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const { action, id } = actionButton.dataset;
    const item = state.items.find((entry) => String(entry.id) === String(id));
    if (!item) return;
    if (action === 'edit') {
      openForm(item);
      return;
    }
    if (action === 'toggle-status') {
      await api.patch(`/api/tenant/manage/users/${id}/toggle-status`);
      openToast(item.is_active ? 'Colaborador desativado com sucesso.' : 'Colaborador ativado com sucesso.');
      await load();
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.row-menu-wrap')) {
      if (state.openMenuId) {
        state.openMenuId = null;
        renderList();
      }
    }
  });

  elements.form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      full_name: elements.form.elements.full_name.value.trim(),
      email: elements.form.elements.email.value.trim(),
      phone: elements.form.elements.phone.value.trim(),
      role_label: elements.form.elements.role_label.value,
      photo_url: elements.form.elements.photo_url.value,
      password: elements.form.elements.password.value,
      is_active: elements.form.elements.is_active.value === 'true'
    };
    if (!payload.full_name || !payload.email || !payload.role_label) {
      openToast('Preencha nome, e-mail e cargo.');
      return;
    }
    if (state.editing?.id) {
      await api.put(`/api/tenant/manage/users/${state.editing.id}`, payload);
      openToast('Colaborador atualizado com sucesso.');
    } else {
      await api.post('/api/tenant/manage/users', payload);
      openToast('Colaborador criado com sucesso.');
    }
    closeForm();
    await load();
  });

  await load();
}
