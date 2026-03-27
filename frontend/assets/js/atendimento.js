import { api } from './api.js';

const state = {
  items: [],
  summary: null,
  search: '',
  status: 'all',
  editingId: null
};

const el = {};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmtDateTime(value) {
  if (!value) return 'Sem horário';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem horário';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function fmtMoney(value = 0) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function statusLabel(status) {
  return ({ pendente: 'Pendente', em_andamento: 'Em andamento', finalizado: 'Finalizado', cancelado: 'Cancelado' })[status] || 'Pendente';
}

function priorityLabel(priority) {
  return ({ baixa: 'Baixa', normal: 'Normal', alta: 'Alta' })[priority] || 'Normal';
}

function channelLabel(channel) {
  return ({ presencial: 'Presencial', whatsapp: 'WhatsApp', telefone: 'Telefone', site: 'Site' })[channel] || 'Presencial';
}

function toast(message) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.classList.add('is-open');
  clearTimeout(el.timer);
  el.timer = setTimeout(() => el.toast.classList.remove('is-open'), 2600);
}

function renderSummary() {
  const summary = state.summary || { total: 0, pendente: 0, em_andamento: 0, finalizado: 0, faturado_cents: 0 };
  el.summary.innerHTML = `
    <article class="summary-card"><span class="label">Total de atendimentos</span><strong>${summary.total || 0}</strong><small>Visão operacional do dia e histórico.</small></article>
    <article class="summary-card"><span class="label">Pendentes</span><strong>${summary.pendente || 0}</strong><small>Clientes aguardando ação inicial.</small></article>
    <article class="summary-card"><span class="label">Em andamento</span><strong>${summary.em_andamento || 0}</strong><small>Fluxos sendo tratados pela equipe.</small></article>
    <article class="summary-card"><span class="label">Faturado finalizado</span><strong>${fmtMoney((summary.faturado_cents || 0) / 100)}</strong><small>Total associado aos atendimentos concluídos.</small></article>
  `;
}

function renderTable() {
  if (!state.items.length) {
    el.tableWrap.innerHTML = '<div class="empty-state">Nenhum atendimento encontrado para o filtro atual.</div>';
    return;
  }

  el.tableWrap.innerHTML = `
    <table class="attendance-table">
      <thead>
        <tr>
          <th>Cliente / Pet</th>
          <th>Serviço</th>
          <th>Canal</th>
          <th>Prioridade</th>
          <th>Status</th>
          <th>Responsável</th>
          <th>Agendamento</th>
          <th>Valor</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${state.items.map((item) => `
          <tr>
            <td><div class="person-stack"><strong>${escapeHtml(item.tutor_name)}</strong><span>${escapeHtml(item.pet_name || 'Sem pet informado')}</span></div></td>
            <td>${escapeHtml(item.service_name)}</td>
            <td><span class="channel-pill">${channelLabel(item.channel)}</span></td>
            <td><span class="priority-pill ${item.priority}">${priorityLabel(item.priority)}</span></td>
            <td><span class="status-pill ${item.status}">${statusLabel(item.status)}</span></td>
            <td>${escapeHtml(item.assigned_to || '—')}</td>
            <td>${fmtDateTime(item.scheduled_at)}</td>
            <td>${fmtMoney(item.amount)}</td>
            <td>
              <div class="row-actions">
                <button class="row-action" type="button" data-edit="${item.id}">Editar</button>
                <button class="row-action danger" type="button" data-delete="${item.id}">Excluir</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function loadAttendances() {
  const params = new URLSearchParams();
  if (state.search) params.set('search', state.search);
  if (state.status) params.set('status', state.status);
  const data = await api.get(`/api/tenant/attendance?${params.toString()}`);
  state.items = data.items || [];
  state.summary = data.summary || null;
  renderSummary();
  renderTable();
}

function fillForm(item = {}) {
  el.form.reset();
  el.form.elements.id.value = item.id || '';
  el.form.elements.tutor_name.value = item.tutor_name || '';
  el.form.elements.pet_name.value = item.pet_name || '';
  el.form.elements.service_name.value = item.service_name || '';
  el.form.elements.channel.value = item.channel || 'presencial';
  el.form.elements.priority.value = item.priority || 'normal';
  el.form.elements.status.value = item.status || 'pendente';
  el.form.elements.assigned_to.value = item.assigned_to || '';
  el.form.elements.amount.value = item.amount != null ? String(item.amount).replace('.', ',') : '';
  el.form.elements.scheduled_at.value = item.scheduled_at ? new Date(item.scheduled_at).toISOString().slice(0, 16) : '';
  el.form.elements.notes.value = item.notes || '';
}

function openModal(item = null) {
  state.editingId = item?.id || null;
  el.breadcrumb.textContent = item ? 'Atendimento → Editar' : 'Atendimento → Novo atendimento';
  fillForm(item || {});
  el.modal.classList.add('is-open');
}

function closeModal() {
  el.modal.classList.remove('is-open');
}

async function onSubmit(event) {
  event.preventDefault();
  const form = new FormData(el.form);
  const payload = Object.fromEntries(form.entries());
  payload.amount = String(payload.amount || '').replace(',', '.');
  const id = payload.id;
  delete payload.id;

  if (id) {
    await api.put(`/api/tenant/attendance/${id}`, payload);
    toast('Atendimento atualizado com sucesso.');
  } else {
    await api.post('/api/tenant/attendance', payload);
    toast('Atendimento criado com sucesso.');
  }

  closeModal();
  await loadAttendances();
}

async function onTableClick(event) {
  const editId = event.target.closest('[data-edit]')?.dataset.edit;
  const deleteId = event.target.closest('[data-delete]')?.dataset.delete;

  if (editId) {
    const item = state.items.find((entry) => entry.id === editId);
    if (item) openModal(item);
    return;
  }

  if (deleteId) {
    if (!window.confirm('Deseja excluir este atendimento?')) return;
    await api.delete(`/api/tenant/attendance/${deleteId}`);
    toast('Atendimento removido com sucesso.');
    await loadAttendances();
  }
}

export async function initAttendancePage() {
  el.summary = document.querySelector('[data-attendance-summary]');
  el.tableWrap = document.querySelector('[data-attendance-table-wrap]');
  el.search = document.querySelector('[data-attendance-search]');
  el.status = document.querySelector('[data-attendance-status]');
  el.newButton = document.querySelector('[data-attendance-new]');
  el.modal = document.querySelector('[data-attendance-modal]');
  el.form = document.querySelector('[data-attendance-form]');
  el.breadcrumb = document.querySelector('[data-attendance-breadcrumb]');
  el.close = document.querySelector('[data-attendance-close]');
  el.cancel = document.querySelector('[data-attendance-cancel]');
  el.toast = document.querySelector('[data-attendance-toast]');

  el.search?.addEventListener('input', async (event) => {
    state.search = event.target.value.trim();
    await loadAttendances();
  });

  el.status?.addEventListener('change', async (event) => {
    state.status = event.target.value;
    await loadAttendances();
  });

  el.newButton?.addEventListener('click', () => openModal());
  el.close?.addEventListener('click', closeModal);
  el.cancel?.addEventListener('click', closeModal);
  el.modal?.addEventListener('click', (event) => {
    if (event.target === el.modal) closeModal();
  });
  el.form?.addEventListener('submit', onSubmit);
  el.tableWrap?.addEventListener('click', onTableClick);

  await loadAttendances();
}
