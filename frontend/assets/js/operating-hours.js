import { getToken } from "./auth.js";

const DEFAULT_ITEMS = [
  { dow: 1, day_label: 'Segunda', is_closed: false, open_time: '08:30', close_time: '17:30', slot_capacity: 10 },
  { dow: 2, day_label: 'Terça', is_closed: false, open_time: '08:30', close_time: '17:30', slot_capacity: 10 },
  { dow: 3, day_label: 'Quarta', is_closed: false, open_time: '08:30', close_time: '17:30', slot_capacity: 10 },
  { dow: 4, day_label: 'Quinta', is_closed: false, open_time: '08:30', close_time: '17:30', slot_capacity: 10 },
  { dow: 5, day_label: 'Sexta', is_closed: false, open_time: '08:30', close_time: '17:30', slot_capacity: 10 },
  { dow: 6, day_label: 'Sábado', is_closed: false, open_time: '08:30', close_time: '17:00', slot_capacity: 10 },
  { dow: 0, day_label: 'Domingo', is_closed: true, open_time: '07:30', close_time: '17:30', slot_capacity: 0 }
];

function toast(message, type='success') {
  const node = document.querySelector('[data-toast]');
  if (!node) return;
  node.textContent = message;
  node.className = `toast is-open ${type}`;
  clearTimeout(window.__ohToast);
  window.__ohToast = setTimeout(() => node.className = 'toast', 2200);
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}

export function initOperatingHoursPage() {
  const tbody = document.querySelector('[data-hours-body]');
  const reloadBtn = document.querySelector('[data-reload]');
  const resetBtn = document.querySelector('[data-reset]');
  const saveBtn = document.querySelector('[data-save]');
  const state = { items: [] };

  function render() {
    if (!tbody) return;
    tbody.innerHTML = state.items.map((item, index) => `
      <tr>
        <td><strong>${item.day_label}</strong></td>
        <td><label class="oh-checkbox"><input type="checkbox" data-field="is_closed" data-index="${index}" ${item.is_closed ? 'checked' : ''} /><span></span></label></td>
        <td><div class="oh-input-wrap"><input type="time" data-field="open_time" data-index="${index}" value="${item.open_time || '08:30'}" ${item.is_closed ? 'disabled' : ''} /></div></td>
        <td><div class="oh-input-wrap"><input type="time" data-field="close_time" data-index="${index}" value="${item.close_time || '17:30'}" ${item.is_closed ? 'disabled' : ''} /></div></td>
        <td><div class="oh-input-wrap"><input type="number" min="0" max="999" data-field="slot_capacity" data-index="${index}" value="${Number(item.slot_capacity || 0)}" ${item.is_closed ? 'disabled' : ''} /></div></td>
        <td>${fmtDate(item.updated_at)}</td>
      </tr>
    `).join('');
  }

  async function load() {
    const response = await fetch('/api/tenant/operating-hours', { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os horários.');
    state.items = Array.isArray(data.items) ? data.items : [];
    render();
  }

  async function save() {
    const payload = { items: state.items.map((item) => ({
      dow: item.dow,
      is_closed: !!item.is_closed,
      open_time: item.open_time,
      close_time: item.close_time,
      slot_capacity: Number(item.slot_capacity || 0)
    }))};
    saveBtn.disabled = true;
    try {
      const response = await fetch('/api/tenant/operating-hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar os horários.');
      state.items = Array.isArray(data.items) ? data.items : state.items;
      render();
      toast(data.message || 'Horários salvos com sucesso.');
    } catch (error) {
      toast(error.message || 'Falha ao salvar.', 'error');
    } finally {
      saveBtn.disabled = false;
    }
  }

  tbody?.addEventListener('input', (event) => {
    const target = event.target;
    const index = Number(target.dataset.index);
    const field = target.dataset.field;
    if (!Number.isInteger(index) || !field || !state.items[index]) return;
    state.items[index][field] = target.type === 'number' ? Number(target.value || 0) : target.value;
  });

  tbody?.addEventListener('change', (event) => {
    const target = event.target;
    const index = Number(target.dataset.index);
    const field = target.dataset.field;
    if (!Number.isInteger(index) || !field || !state.items[index]) return;
    if (field === 'is_closed') {
      state.items[index].is_closed = target.checked;
      if (target.checked) state.items[index].slot_capacity = 0;
      render();
    }
  });

  reloadBtn?.addEventListener('click', () => load().catch((error) => toast(error.message, 'error')));
  resetBtn?.addEventListener('click', () => { state.items = DEFAULT_ITEMS.map((item) => ({ ...item })); render(); });
  saveBtn?.addEventListener('click', save);

  load().catch((error) => toast(error.message, 'error'));
}
