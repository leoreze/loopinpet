import { api } from './api.js';

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR', { sensitivity: 'base', numeric: true });
}

export async function initPetsPage() {
  const root = document.querySelector('[data-pets-page]');
  if (!root) return;
  const state = {
    items: [],
    meta: { tutors: [], pet_types: [], pet_sizes: [], pet_breeds: [], pet_preferences: [] },
    viewItems: [],
    sortKey: 'name',
    sortDir: 'asc',
    openMenuId: null,
    metaKind: 'pet_types',
    metaItems: [],
    editingMeta: null,
  };

  const toastEl = document.querySelector('[data-toast]');
  const summary = root.querySelector('[data-summary]');
  const tbody = root.querySelector('[data-tbody]');
  const search = root.querySelector('[data-search]');
  const headers = Array.from(root.querySelectorAll('th[data-sort]'));
  const modal = root.querySelector('[data-modal]');
  const form = root.querySelector('[data-form]');
  const modalTitle = root.querySelector('[data-modal-title]');
  const metaModal = root.querySelector('[data-meta-modal]');
  const metaTableBody = root.querySelector('[data-meta-tbody]');
  const metaForm = root.querySelector('[data-meta-form]');
  const metaModalTitle = root.querySelector('[data-meta-title]');
  const metaKindSelect = root.querySelector('[data-meta-kind]');
  const preferenceGrid = root.querySelector('[data-preferences-grid]');
  const breedSelect = form.querySelector('[name="breed_id"]');
  const typeSelect = form.querySelector('[name="pet_type_id"]');
  const sizeSelect = form.querySelector('[name="size_id"]');
  const tutorSelect = form.querySelector('[name="tutor_id"]');

  const toast = (message) => {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-open');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => toastEl.classList.remove('is-open'), 2400);
  };

  function populateSelect(select, items, placeholder, mapper = (item) => item.name) {
    select.innerHTML = `<option value="">${placeholder}</option>` + items.map((item) => `<option value="${item.id}">${esc(mapper(item))}</option>`).join('');
  }

  function renderPreferences(selected = []) {
    preferenceGrid.innerHTML = state.meta.pet_preferences.map((item) => `
      <label class="check-item">
        <input type="checkbox" name="preference_ids" value="${item.id}" ${selected.includes(item.id) ? 'checked' : ''} />
        <span>
          <strong>${esc(item.name)}</strong>
          <small>${esc(item.description || '')}</small>
        </span>
      </label>
    `).join('');
  }

  function refreshMetaControls() {
    populateSelect(tutorSelect, state.meta.tutors, 'Selecione o tutor', (item) => item.full_name);
    populateSelect(typeSelect, state.meta.pet_types, 'Selecione o tipo');
    populateSelect(sizeSelect, state.meta.pet_sizes, 'Selecione o porte');
    filterBreedOptions(typeSelect.value || '');
    renderPreferences();
  }

  function filterBreedOptions(typeId = '') {
    const items = typeId ? state.meta.pet_breeds.filter((item) => !item.pet_type_id || item.pet_type_id === typeId) : state.meta.pet_breeds;
    const current = breedSelect.value;
    populateSelect(breedSelect, items, 'Selecione a raça');
    if (items.some((item) => item.id === current)) breedSelect.value = current;
  }

  function renderSummary() {
    const active = state.items.filter((item) => item.is_active).length;
    const withPhoto = state.items.filter((item) => item.photo_url).length;
    summary.innerHTML = `
      <article class="summary-card"><span class="label">Pets</span><strong>${state.items.length}</strong><small>Total cadastrado no ambiente.</small></article>
      <article class="summary-card"><span class="label">Ativos</span><strong>${active}</strong><small>Pets disponíveis para operação.</small></article>
      <article class="summary-card"><span class="label">Com foto</span><strong>${withPhoto}</strong><small>Cadastros mais completos para identificação.</small></article>
    `;
  }

  function applySortIndicators() {
    headers.forEach((header) => {
      const active = state.sortKey === header.dataset.sort;
      header.classList.toggle('is-asc', active && state.sortDir === 'asc');
      header.classList.toggle('is-desc', active && state.sortDir === 'desc');
      header.classList.add('sortable');
    });
  }

  const sortAccessors = {
    name: (item) => item.name || '',
    tutor_name: (item) => item.tutor_name || '',
    pet_type_name: (item) => item.pet_type_name || item.species || '',
    breed_name: (item) => item.breed_name || item.breed || '',
    size_name: (item) => item.size_name || item.size || '',
    birth_date: (item) => item.birth_date || '',
    status: (item) => item.is_active ? 'Ativo' : 'Inativo',
  };

  function applyView() {
    const items = [...state.items];
    const accessor = sortAccessors[state.sortKey];
    if (accessor) {
      items.sort((a, b) => {
        const result = compareValues(accessor(a), accessor(b));
        return state.sortDir === 'asc' ? result : -result;
      });
    }
    state.viewItems = items;
    applySortIndicators();
  }

  function rowMenu(item) {
    return `<div class="row-menu-wrap"><button class="row-menu-toggle" type="button" data-menu-toggle="${item.id}" aria-label="Abrir ações">⋮</button><div class="row-menu ${state.openMenuId === item.id ? 'is-open' : ''}"><button class="row-menu-item" type="button" data-edit="${item.id}"><span class="icon">✎</span><span>Editar</span></button><button class="row-menu-item danger" type="button" data-delete="${item.id}"><span class="icon">⊘</span><span>Excluir</span></button></div></div>`;
  }

  function renderTable() {
    if (!state.viewItems.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhum registro encontrado.</td></tr>';
      return;
    }
    tbody.innerHTML = state.viewItems.map((item) => {
      const prefs = (item.preference_names || []).slice(0, 2).map((name) => `<span class="tag-pill">${esc(name)}</span>`).join(' ');
      return `
        <tr>
          <td>
            <div class="pet-avatar-cell">
              <img src="${esc(item.photo_url || '../../assets/icon_loopinpet.png')}" alt="${esc(item.name)}" class="pet-avatar" onerror="this.src='../../assets/icon_loopinpet.png'" />
            </div>
          </td>
          <td><strong>${esc(item.name)}</strong><span class="mini-muted">${prefs || 'Sem preferências'}</span></td>
          <td>${esc(item.tutor_name || '—')}</td>
          <td>${esc(item.pet_type_name || item.species || '—')}</td>
          <td>${esc(item.breed_name || item.breed || '—')}</td>
          <td>${esc(item.size_name || item.size || '—')}</td>
          <td>${esc(item.birth_date || '—')}</td>
          <td><span class="status-pill ${item.is_active ? 'ativo' : 'inativo'}">${item.is_active ? 'Ativo' : 'Inativo'}</span></td>
          <td><div class="row-actions">${rowMenu(item)}</div></td>
        </tr>`;
    }).join('');
  }

  async function loadMeta() {
    state.meta = await api.get('/api/tenant/manage/meta');
    refreshMetaControls();
  }

  async function loadPets() {
    const query = new URLSearchParams();
    if (search.value.trim()) query.set('search', search.value.trim());
    state.items = (await api.get(`/api/tenant/manage/pets?${query.toString()}`)).items || [];
    state.openMenuId = null;
    renderSummary();
    applyView();
    renderTable();
  }

  function openPetModal(item = null) {
    modalTitle.textContent = item ? 'Editar pet' : 'Novo pet';
    form.reset();
    form.elements.id.value = item?.id || '';
    refreshMetaControls();
    form.elements.name.value = item?.name || '';
    form.elements.tutor_id.value = item?.tutor_id || '';
    form.elements.pet_type_id.value = item?.pet_type_id || '';
    filterBreedOptions(form.elements.pet_type_id.value);
    form.elements.breed_id.value = item?.breed_id || '';
    form.elements.size_id.value = item?.size_id || '';
    form.elements.gender.value = item?.gender || '';
    form.elements.birth_date.value = item?.birth_date || '';
    form.elements.temperament.value = item?.temperament || '';
    form.elements.photo_url.value = item?.photo_url || '';
    form.elements.is_active.checked = item?.is_active ?? true;
    renderPreferences(Array.isArray(item?.preference_ids) ? item.preference_ids : []);
    modal.classList.add('is-open');
  }

  function closePetModal() { modal.classList.remove('is-open'); }

  async function submitPet(event) {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      id: formData.get('id'),
      name: formData.get('name'),
      tutor_id: formData.get('tutor_id'),
      pet_type_id: formData.get('pet_type_id'),
      breed_id: formData.get('breed_id'),
      size_id: formData.get('size_id'),
      gender: formData.get('gender'),
      birth_date: formData.get('birth_date'),
      temperament: formData.get('temperament'),
      photo_url: formData.get('photo_url'),
      is_active: form.elements.is_active.checked,
      preference_ids: formData.getAll('preference_ids'),
    };
    payload.pet_type_name = state.meta.pet_types.find((item) => item.id === payload.pet_type_id)?.name || '';
    payload.breed_name = state.meta.pet_breeds.find((item) => item.id === payload.breed_id)?.name || '';
    payload.size_name = state.meta.pet_sizes.find((item) => item.id === payload.size_id)?.name || '';
    if (payload.id) {
      await api.put(`/api/tenant/manage/pets/${payload.id}`, payload);
      toast('Pet atualizado com sucesso.');
    } else {
      await api.post('/api/tenant/manage/pets', payload);
      toast('Pet criado com sucesso.');
    }
    closePetModal();
    await loadPets();
  }

  async function loadMetaItems() {
    state.metaItems = (await api.get(`/api/tenant/manage/pet-meta/${state.metaKind}`)).items || [];
    const showTypeField = state.metaKind === 'pet_breeds';
    metaForm.querySelector('[data-meta-type-wrap]').style.display = showTypeField ? '' : 'none';
    const typeField = metaForm.querySelector('[name="pet_type_id"]');
    populateSelect(typeField, state.meta.pet_types, 'Tipo relacionado');
    metaTableBody.innerHTML = state.metaItems.map((item) => `
      <tr>
        <td><strong>${esc(item.name)}</strong></td>
        <td>${esc(item.description || '—')}</td>
        <td>${state.metaKind === 'pet_breeds' ? esc(state.meta.pet_types.find((type) => type.id === item.pet_type_id)?.name || '—') : '—'}</td>
        <td><span class="status-pill ${item.is_active ? 'ativo' : 'inativo'}">${item.is_active ? 'Ativo' : 'Inativo'}</span></td>
        <td><div class="row-actions"><div class="row-menu-wrap"><button class="row-menu-toggle" type="button" data-meta-edit="${item.id}">✎</button><button class="row-menu-toggle" type="button" data-meta-delete="${item.id}">⊘</button></div></div></td>
      </tr>`).join('') || '<tr><td colspan="5" class="empty-state">Nenhum item cadastrado.</td></tr>';
    metaModalTitle.textContent = ({ pet_types: 'Tipo de Pet', pet_sizes: 'Porte', pet_breeds: 'Raça', pet_preferences: 'Preferências' })[state.metaKind];
  }

  function openMetaModal(kind) {
    state.metaKind = kind;
    state.editingMeta = null;
    metaForm.reset();
    metaKindSelect.value = kind;
    loadMetaItems();
    metaModal.classList.add('is-open');
  }
  function closeMetaModal() { metaModal.classList.remove('is-open'); state.editingMeta = null; }

  async function submitMeta(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(metaForm).entries());
    data.is_active = metaForm.elements.is_active.checked;
    if (state.editingMeta) {
      await api.put(`/api/tenant/manage/pet-meta/${state.metaKind}/${state.editingMeta.id}`, data);
      toast('Cadastro auxiliar atualizado.');
    } else {
      await api.post(`/api/tenant/manage/pet-meta/${state.metaKind}`, data);
      toast('Cadastro auxiliar criado.');
    }
    await loadMeta();
    metaForm.reset();
    state.editingMeta = null;
    await loadMetaItems();
  }

  tbody.addEventListener('click', async (event) => {
    const menuToggle = event.target.closest('[data-menu-toggle]')?.dataset.menuToggle;
    const edit = event.target.closest('[data-edit]')?.dataset.edit;
    const del = event.target.closest('[data-delete]')?.dataset.delete;
    if (menuToggle) {
      state.openMenuId = state.openMenuId === menuToggle ? null : menuToggle;
      renderTable();
      return;
    }
    if (edit) return openPetModal(state.items.find((item) => item.id === edit));
    if (del) {
      if (!window.confirm('Deseja remover este pet?')) return;
      await api.delete(`/api/tenant/manage/pets/${del}`);
      toast('Pet removido com sucesso.');
      await loadPets();
    }
  });

  metaTableBody.addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-meta-edit]')?.dataset.metaEdit;
    const del = event.target.closest('[data-meta-delete]')?.dataset.metaDelete;
    if (edit) {
      const item = state.metaItems.find((entry) => entry.id === edit);
      state.editingMeta = item;
      metaForm.elements.name.value = item?.name || '';
      metaForm.elements.description.value = item?.description || '';
      metaForm.elements.pet_type_id.value = item?.pet_type_id || '';
      metaForm.elements.is_active.checked = item?.is_active ?? true;
      return;
    }
    if (del) {
      if (!window.confirm('Deseja remover este item auxiliar?')) return;
      await api.delete(`/api/tenant/manage/pet-meta/${state.metaKind}/${del}`);
      toast('Cadastro auxiliar removido.');
      await loadMeta();
      await loadMetaItems();
    }
  });

  headers.forEach((header) => {
    header.addEventListener('click', () => {
      const key = header.dataset.sort;
      if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      else { state.sortKey = key; state.sortDir = 'asc'; }
      applyView();
      renderTable();
    });
  });

  search.addEventListener('input', loadPets);
  typeSelect.addEventListener('change', () => filterBreedOptions(typeSelect.value));
  root.querySelector('[data-new]').addEventListener('click', () => openPetModal());
  root.querySelectorAll('[data-open-meta]').forEach((button) => button.addEventListener('click', () => openMetaModal(button.dataset.openMeta)));
  root.querySelector('[data-close]').addEventListener('click', closePetModal);
  root.querySelector('[data-cancel]').addEventListener('click', closePetModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closePetModal(); });
  form.addEventListener('submit', submitPet);
  metaKindSelect.addEventListener('change', () => { state.metaKind = metaKindSelect.value; state.editingMeta = null; metaForm.reset(); loadMetaItems(); });
  root.querySelector('[data-meta-close]').addEventListener('click', closeMetaModal);
  root.querySelector('[data-meta-cancel]').addEventListener('click', closeMetaModal);
  metaModal.addEventListener('click', (event) => { if (event.target === metaModal) closeMetaModal(); });
  metaForm.addEventListener('submit', submitMeta);

  await loadMeta();
  await loadPets();
}
