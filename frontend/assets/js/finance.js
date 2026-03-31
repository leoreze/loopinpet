import { api } from './api.js';

const el = {
  open: document.querySelector('[data-finance-open]'),
  openFoot: document.querySelector('[data-finance-open-foot]'),
  receivedMonth: document.querySelector('[data-finance-received-month]'),
  forecast: document.querySelector('[data-finance-forecast]'),
  ticket: document.querySelector('[data-finance-ticket]'),
  packagesMonth: document.querySelector('[data-finance-packages-month]'),
  bars: document.querySelector('[data-finance-bars]'),
  transactions: document.querySelector('[data-finance-transactions]'),
  methods: document.querySelector('[data-finance-methods]'),
  statuses: document.querySelector('[data-finance-statuses]'),
  packages: document.querySelector('[data-finance-packages]')
};

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paymentLabel(value = '') {
  const normalized = String(value || '').toLowerCase();
  return ({ pago: 'Pago', pendente: 'Pendente', failed: 'Falhou', falhou: 'Falhou', recusado: 'Recusado' })[normalized] || (value || '—');
}

function fill(node, value) {
  if (node) node.textContent = value;
}

function renderBars(items = []) {
  if (!el.bars) return;
  const max = Math.max(...items.map((item) => Number(item.total_cents || 0)), 1);
  el.bars.innerHTML = items.length ? items.map((item) => {
    const pct = Math.max(10, Math.round((Number(item.total_cents || 0) / max) * 100));
    return `<div class="finance-bar-item"><div class="finance-bar" style="height:${pct}%"></div><span>${escapeHtml(item.label || '')}</span><strong>${escapeHtml(item.total_label || 'R$ 0,00')}</strong></div>`;
  }).join('') : '<div class="finance-empty">Ainda não há recebimentos suficientes para desenhar o fluxo.</div>';
}

function renderList(node, items = [], emptyText = 'Sem dados ainda.') {
  if (!node) return;
  node.innerHTML = items.length ? items.map((item) => `
    <div class="finance-list-item">
      <div><strong>${escapeHtml(item.title || item.method || item.status || 'Item')}</strong><span>${escapeHtml(item.subtitle || `${item.count || 0} registro(s)`)}</span></div>
      <div class="finance-amount">${escapeHtml(item.total_label || item.total_with_discount_label || 'R$ 0,00')}</div>
    </div>`).join('') : `<div class="finance-empty">${escapeHtml(emptyText)}</div>`;
}

function renderTransactions(items = []) {
  if (!el.transactions) return;
  el.transactions.innerHTML = items.length ? items.map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.ref || '—')}</strong><small>${escapeHtml(item.type === 'pacote' ? 'Pacote' : 'Agenda')} • ${escapeHtml(item.date_label || '—')}</small></td>
      <td><strong>${escapeHtml(item.tutor || 'Tutor')}</strong><small>${escapeHtml(item.pet || 'Pet')} • ${escapeHtml(item.title || '—')}</small></td>
      <td>${escapeHtml(paymentLabel(item.payment_status))}<small>${escapeHtml(item.payment_method || 'Não informado')}</small></td>
      <td><strong>${escapeHtml(item.amount_label || 'R$ 0,00')}</strong></td>
    </tr>`).join('') : '<tr><td colspan="4" class="table-empty">Nenhuma transação encontrada.</td></tr>';
}

function renderPackages(items = []) {
  if (!el.packages) return;
  el.packages.innerHTML = items.length ? items.map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.package_name || 'Pacote')}</strong><small>${escapeHtml(item.status || 'ativo')}</small></td>
      <td><strong>${escapeHtml(item.tutor_name || 'Tutor')}</strong><small>${escapeHtml(item.pet_name || 'Pet')}</small></td>
      <td>${escapeHtml(paymentLabel(item.payment_status))}<small>${escapeHtml(item.payment_method || 'Não informado')}${item.next_charge_date ? ` • Próx. ${escapeHtml(String(item.next_charge_date).slice(0,10))}` : ''}</small></td>
      <td><strong>${escapeHtml(item.total_with_discount_label || 'R$ 0,00')}</strong></td>
    </tr>`).join('') : '<tr><td colspan="4" class="table-empty">Nenhum pacote vendido ainda.</td></tr>';
}

async function bootstrap() {
  const data = await api.get('/api/tenant/finance/summary');
  fill(el.open, data?.metrics?.openReceivablesLabel || 'R$ 0,00');
  fill(el.openFoot, `${Number(data?.metrics?.pendingItems || 0)} item(ns) pendente(s)`);
  fill(el.receivedMonth, data?.metrics?.receivedMonthLabel || 'R$ 0,00');
  fill(el.forecast, data?.metrics?.upcomingForecastLabel || 'R$ 0,00');
  fill(el.ticket, data?.metrics?.averageTicketLabel || 'R$ 0,00');
  fill(el.packagesMonth, data?.metrics?.packagesReceivedMonthLabel || 'R$ 0,00');
  renderBars(data?.flowSeries || []);
  renderTransactions(data?.recentTransactions || []);
  renderList(el.methods, (data?.paymentMethods || []).map((item) => ({ title: item.method, subtitle: `${item.count || 0} recebimento(s)`, total_label: item.total_label })), 'Nenhum pagamento confirmado por método ainda.');
  renderList(el.statuses, (data?.receivablesByStatus || []).map((item) => ({ title: item.status, subtitle: `${item.count || 0} lançamento(s)`, total_label: item.total_label })), 'Sem recebíveis lançados ainda.');
  renderPackages(data?.packageCharges || []);
}

bootstrap().catch((error) => {
  renderBars([]);
  renderTransactions([]);
  renderList(el.methods, [], error.message || 'Não foi possível carregar o financeiro.');
  renderList(el.statuses, [], '');
  renderPackages([]);
});
