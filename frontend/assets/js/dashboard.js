
import { api } from './api.js';
import { getAuth } from './auth.js';

const el = {
  appointmentsToday: document.querySelector('[data-dashboard-appointments-today]'),
  revenueToday: document.querySelector('[data-dashboard-revenue-today]'),
  pendingPayments: document.querySelector('[data-dashboard-pending-payments]'),
  activePackages: document.querySelector('[data-dashboard-active-packages]'),
  occupiedToday: document.querySelector('[data-dashboard-occupied-today]'),
  tutorsTotal: document.querySelector('[data-dashboard-tutors-total]'),
  petsTotal: document.querySelector('[data-dashboard-pets-total]'),
  servicesTotal: document.querySelector('[data-dashboard-services-total]'),
  revenueWeek: document.querySelector('[data-dashboard-revenue-week]'),
  averageTicket: document.querySelector('[data-dashboard-average-ticket]'),
  agendaBody: document.querySelector('[data-dashboard-agenda-body]'),
  alertsList: document.querySelector('[data-dashboard-alerts]'),
  servicesList: document.querySelector('[data-dashboard-top-services]'),
  recentBody: document.querySelector('[data-dashboard-recent-body]'),
  revenueBars: document.querySelector('[data-dashboard-revenue-bars]'),
  revenueCaption: document.querySelector('[data-dashboard-revenue-caption]'),
  chatbotMessages: document.querySelector('[data-dashboard-chat-messages]'),
  chatbotForm: document.querySelector('[data-dashboard-chat-form]'),
  chatbotInput: document.querySelector('[data-dashboard-chat-input]'),
  chatbotSend: document.querySelector('[data-dashboard-chat-send]'),
  chatbotSuggestions: document.querySelectorAll('[data-dashboard-chat-suggestion]')
};

const chatState = { history: [], loading: false, summary: null };

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function labelStatus(value = '') {
  const normalized = String(value || '').toLowerCase();
  return ({
    agendado: 'Agendado',
    confirmado: 'Confirmado',
    check_in: 'Check-in',
    em_execucao: 'Em execução',
    pronto_para_retirada: 'Pronto para retirada',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
    pendente: 'Pendente',
    pago: 'Pago'
  })[normalized] || (value || '—');
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fillMetric(node, value) {
  if (node) node.textContent = value;
}

function renderMetrics(summary) {
  const metrics = summary?.metrics || {};
  fillMetric(el.appointmentsToday, String(metrics.appointmentsToday ?? 0));
  fillMetric(el.revenueToday, metrics.revenueTodayLabel || money(metrics.revenueToday || 0));
  fillMetric(el.pendingPayments, String(metrics.pendingPayments ?? 0));
  fillMetric(el.activePackages, String(metrics.activePackages ?? 0));
  fillMetric(el.occupiedToday, `${metrics.occupiedToday ?? 0}% ocupação do dia`);
  fillMetric(el.tutorsTotal, String(metrics.tutorsTotal ?? 0));
  fillMetric(el.petsTotal, String(metrics.petsTotal ?? 0));
  fillMetric(el.servicesTotal, String(metrics.servicesTotal ?? 0));
  fillMetric(el.revenueWeek, metrics.revenueWeekLabel || money(metrics.revenueWeek || 0));
  fillMetric(el.averageTicket, metrics.averageTicketTodayLabel || money(metrics.averageTicketToday || 0));
}

function renderAgenda(summary) {
  const rows = summary?.todayAgenda || [];
  if (!el.agendaBody) return;
  el.agendaBody.innerHTML = rows.length ? rows.map((item) => `
    <tr>
      <td>${escapeHtml(item.hour || '-')}</td>
      <td><strong>${escapeHtml(item.pet || '-')}</strong><div class="soft-line">${escapeHtml(item.tutor || '-')}</div></td>
      <td>${escapeHtml(item.service || '-')}</td>
      <td><span class="status ${String(item.status || '').toLowerCase()}">${escapeHtml(labelStatus(item.status))}</span></td>
      <td>${escapeHtml(item.booking_origin === 'pacote' ? (item.package_session_label ? `📦 ${item.package_session_label}` : '📦 Pacote') : 'Avulso')}</td>
    </tr>`).join('') : '<tr><td colspan="5" class="table-empty">Nenhum agendamento para hoje ainda.</td></tr>';
}

function renderAlerts(summary) {
  const items = summary?.alerts || [];
  if (!el.alertsList) return;
  el.alertsList.innerHTML = items.map((item) => `
    <div class="dashboard-alert dashboard-alert--${escapeHtml(item.tone || 'neutral')}">
      <strong>${escapeHtml(item.title || 'Alerta')}</strong>
      <p>${escapeHtml(item.text || '')}</p>
    </div>`).join('');
}

function renderTopServices(summary) {
  const items = summary?.topServices || [];
  if (!el.servicesList) return;
  el.servicesList.innerHTML = items.length ? items.map((item) => `
    <div class="list-item compact">
      <div><strong>${escapeHtml(item.name || 'Serviço')}</strong><span>${Number(item.total || 0)} agendamento(s) nos últimos 30 dias</span></div>
      <span class="pill-qty">${Number(item.total || 0)}</span>
    </div>`).join('') : '<div class="empty-state">Ainda não há serviços suficientes para ranquear.</div>';
}

function renderRecent(summary) {
  const items = summary?.recentAgenda || [];
  if (!el.recentBody) return;
  el.recentBody.innerHTML = items.length ? items.map((item) => `
    <tr>
      <td>${escapeHtml(item.date || '-')}<div class="soft-line">${escapeHtml(item.hour || '-')}</div></td>
      <td>${escapeHtml(item.pet || '-')}</td>
      <td>${escapeHtml(item.service || '-')}</td>
      <td>${escapeHtml(labelStatus(item.status))}</td>
      <td>${escapeHtml(labelStatus(item.payment_status))}</td>
    </tr>`).join('') : '<tr><td colspan="5" class="table-empty">Sem histórico suficiente ainda.</td></tr>';
}

function renderRevenue(summary) {
  const items = summary?.revenueSeries || [];
  if (!el.revenueBars) return;
  const max = Math.max(...items.map((item) => Number(item.total || 0)), 1);
  el.revenueBars.innerHTML = items.map((item) => {
    const pct = Math.max(10, Math.round((Number(item.total || 0) / max) * 100));
    return `<div class="revenue-bar-item"><div class="revenue-bar" style="height:${pct}%"></div><span>${escapeHtml(item.label || '')}</span></div>`;
  }).join('');
  if (el.revenueCaption) {
    const best = [...items].sort((a, b) => Number(b.total || 0) - Number(a.total || 0))[0];
    el.revenueCaption.textContent = best ? `Melhor dia recente: ${best.label} com ${money(best.total || 0)}.` : 'Sem série de receita disponível.';
  }
}

function addChatMessage(role, title, text, meta = '') {
  if (!el.chatbotMessages) return;
  const bubble = document.createElement('div');
  bubble.className = `dashboard-chat-bubble dashboard-chat-bubble--${role}`;
  bubble.innerHTML = `<strong>${escapeHtml(title)}</strong><div>${escapeHtml(text)}</div>${meta ? `<span>${escapeHtml(meta)}</span>` : ''}`;
  el.chatbotMessages.appendChild(bubble);
  el.chatbotMessages.scrollTop = el.chatbotMessages.scrollHeight;
}

function setChatLoading(loading) {
  chatState.loading = Boolean(loading);
  if (el.chatbotSend) {
    el.chatbotSend.disabled = chatState.loading;
    el.chatbotSend.textContent = chatState.loading ? 'Analisando...' : 'Enviar';
  }
  if (el.chatbotInput) el.chatbotInput.disabled = chatState.loading;
}

async function sendDashboardChat(message, source = 'Dashboard') {
  const content = String(message || '').trim();
  if (!content || chatState.loading) return;
  addChatMessage('user', 'Você', content, source);
  chatState.history.push({ role: 'user', content });
  chatState.history = chatState.history.slice(-12);
  setChatLoading(true);
  try {
    const response = await api.post('/api/tenant/ai/chat', { message: content, history: chatState.history });
    const answer = response?.answer || 'Não consegui responder agora.';
    addChatMessage('assistant', 'Assistente do dashboard', answer, response?.provider === 'openai' ? 'OpenAI' : 'Insight local');
    chatState.history.push({ role: 'assistant', content: answer });
    chatState.history = chatState.history.slice(-12);
  } catch (error) {
    addChatMessage('assistant', 'Assistente do dashboard', error.message || 'Não consegui responder agora.', 'Erro');
  } finally {
    if (el.chatbotInput) el.chatbotInput.value = '';
    setChatLoading(false);
  }
}

function bindChat() {
  el.chatbotForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await sendDashboardChat(el.chatbotInput?.value || '', 'Chat do dashboard');
  });
  el.chatbotSuggestions.forEach((button) => button.addEventListener('click', async () => {
    await sendDashboardChat(button.dataset.dashboardChatSuggestion || button.textContent || '', 'Atalho');
  }));
}

async function bootstrapDashboard() {
  const summary = await api.get('/api/tenant/summary');
  chatState.summary = summary;
  renderMetrics(summary);
  renderAgenda(summary);
  renderAlerts(summary);
  renderTopServices(summary);
  renderRecent(summary);
  renderRevenue(summary);
  addChatMessage('assistant', 'Assistente do dashboard', summary?.chatbot?.welcome || 'Posso explicar os números do dashboard, caixa previsto, agenda e oportunidades.', 'Inicialização');
  const auth = getAuth() || {};
  const brand = auth.tenant?.brand_name || auth.tenant?.name || 'seu pet shop';
  addChatMessage('assistant', 'Radar inicial', `Hoje ${brand} tem ${summary?.metrics?.appointmentsToday || 0} agendamento(s), ${summary?.metrics?.pendingPayments || 0} pagamento(s) pendente(s) e ${summary?.metrics?.activePackages || 0} pacote(s) ativo(s).`, 'Leitura rápida');
}

bindChat();
bootstrapDashboard().catch((error) => {
  addChatMessage('assistant', 'Dashboard indisponível', error.message || 'Não consegui carregar o dashboard agora.', 'Erro');
});
