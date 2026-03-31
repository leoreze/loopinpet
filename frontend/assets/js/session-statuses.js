import { api } from './api.js';

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function initSessionStatusesPage() {
  const root = document.querySelector('[data-session-status-page]');
  if (!root) return;

  const state = { items: [], filtered: [], editing: null, dragId: null };
  const listEl = root.querySelector('[data-session-list]');
  const summaryEl = root.querySelector('[data-summary]');
  const searchEl = root.querySelector('[data-search]');
  const modal = document.querySelector('[data-modal]');
  const form = document.querySelector('[data-form]');
  const titleEl = document.querySelector('[data-modal-title]');
  const newBtn = root.querySelector('[data-new]');
  const toastEl = document.querySelector('[data-toast]');

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-open');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => toastEl.classList.remove('is-open'), 2200);
  }

  function applyFilter() {
    const term = String(searchEl?.value || '').trim().toLowerCase();
    state.filtered = state.items.filter((item) => {
      if (!term) return true;
      return [item.name, item.description, item.color].some((value) => String(value || '').toLowerCase().includes(term));
    });
  }

  function renderSummary() {
    if (!summaryEl) return;
    const active = state.items.filter((item) => item.is_active).length;
    summaryEl.innerHTML = `
      <article class="metric-card"><span class="metric-label">Sessões</span><strong>${state.items.length}</strong><small>Fluxo configurado no ambiente.</small></article>
      <article class="metric-card"><span class="metric-label">Ativas</span><strong>${active}</strong><small>Disponíveis para a operação.</small></article>
      <article class="metric-card"><span class="metric-label">Fluxo</span><strong>${state.items.length ? state.items.map((item) => item.name).slice(0, 3).join(' • ') : '—'}</strong><small>Arraste para atualizar a ordem.</small></article>
    `;
  }

  function renderList() {
    if (!listEl) return;
    if (!state.filtered.length) {
      listEl.innerHTML = '<div class="empty-state-card">Nenhum status de sessão encontrado.</div>';
      return;
    }
    listEl.innerHTML = state.filtered.map((item, index) => `
      <article class="session-item" draggable="true" data-id="${esc(item.id)}" style="--session-color:${esc(item.color || '#1F8560')}">
        <div class="session-item__drag">⋮⋮</div>
        <div class="session-item__order">${index + 1}</div>
        <div class="session-item__content">
          <div class="session-item__title-row">
            <span class="session-color"></span>
            <strong>${esc(item.name)}</strong>
            <span class="status-pill ${item.is_active ? 'ativo' : 'inativo'}">${item.is_active ? 'Ativo' : 'Inativo'}</span>
          </div>
          <p>${esc(item.description || 'Sem descrição cadastrada.')}</p>
        </div>
        <div class="session-item__actions">
          <button type="button" class="icon-action" data-edit="${esc(item.id)}">✎</button>
          <button type="button" class="icon-action danger" data-delete="${esc(item.id)}">⊘</button>
        </div>
      </article>
    `).join('');
  }

  function render() {
    applyFilter();
    renderSummary();
    renderList();
  }

  async function load() {
    const response = await api.get('/api/tenant/manage/session-statuses');
    state.items = (response.items || []).sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
    render();
  }

  function openModal(item = null) {
    if (!modal || !form || !titleEl) return;
    state.editing = item;
    titleEl.textContent = item ? 'Editar status da sessão' : 'Novo status da sessão';
    form.reset();
    form.elements.id.value = item?.id || '';
    form.elements.name.value = item?.name || '';
    form.elements.description.value = item?.description || '';
    form.elements.color.value = item?.color || '#1F8560';
    form.elements.is_active.checked = item?.is_active ?? true;
    modal.classList.add('is-open');
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    state.editing = null;
  }

  async function persistOrder() {
    await api.patch('/api/tenant/manage/session-statuses/reorder', { orderedIds: state.items.map((item) => item.id) });
  }

  listEl?.addEventListener('click', async (event) => {
    const editId = event.target.closest('[data-edit]')?.dataset.edit;
    const deleteId = event.target.closest('[data-delete]')?.dataset.delete;
    if (editId) {
      openModal(state.items.find((item) => item.id === editId) || null);
      return;
    }
    if (deleteId) {
      if (!confirm('Excluir este status da sessão?')) return;
      await api.delete(`/api/tenant/manage/session-statuses/${deleteId}`);
      toast('Status excluído com sucesso.');
      await load();
    }
  });

  listEl?.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.session-item');
    if (!card) return;
    state.dragId = card.dataset.id;
    card.classList.add('is-dragging');
  });

  listEl?.addEventListener('dragend', (event) => {
    event.target.closest('.session-item')?.classList.remove('is-dragging');
  });

  listEl?.addEventListener('dragover', (event) => {
    event.preventDefault();
    const target = event.target.closest('.session-item');
    if (!target || !state.dragId || target.dataset.id === state.dragId) return;
    const draggedIndex = state.items.findIndex((item) => item.id === state.dragId);
    const targetIndex = state.items.findIndex((item) => item.id === target.dataset.id);
    if (draggedIndex === -1 || targetIndex === -1) return;
    const [moved] = state.items.splice(draggedIndex, 1);
    state.items.splice(targetIndex, 0, moved);
    render();
  });

  listEl?.addEventListener('drop', async (event) => {
    event.preventDefault();
    if (!state.dragId) return;
    await persistOrder();
    toast('Fluxo atualizado com sucesso.');
    state.dragId = null;
    await load();
  });

  searchEl?.addEventListener('input', render);
  newBtn?.addEventListener('click', () => openModal());
  document.querySelectorAll('[data-close-modal]').forEach((btn) => btn.addEventListener('click', closeModal));
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      name: form.elements.name.value,
      description: form.elements.description.value,
      color: form.elements.color.value,
      is_active: form.elements.is_active.checked
    };
    if (state.editing?.id) {
      await api.put(`/api/tenant/manage/session-statuses/${state.editing.id}`, payload);
      toast('Status atualizado com sucesso.');
    } else {
      await api.post('/api/tenant/manage/session-statuses', payload);
      toast('Status criado com sucesso.');
    }
    closeModal();
    await load();
  });

  await load();
}
