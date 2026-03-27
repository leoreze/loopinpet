import { api } from './api.js';

function money(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function setFeedback(message = '', type = '') {
  const node = document.querySelector('[data-ai-feedback]');
  if (!node) return;
  node.textContent = message;
  node.dataset.state = type || '';
}

function renderSummary(summary) {
  document.querySelector('[data-summary-agenda]').textContent = String(summary?.agenda_proximos_7_dias ?? 0);
  document.querySelector('[data-summary-pendentes]').textContent = String(summary?.atendimentos_pendentes ?? 0);
  document.querySelector('[data-summary-faturado]').textContent = money(summary?.faturado ?? 0);
  const score = Number(summary?.health_score || 0);
  const ring = document.querySelector('[data-health-ring]');
  if (ring) ring.style.setProperty('--score-deg', `${Math.max(0, Math.min(360, Math.round(score * 3.6)))}deg`);
  document.querySelector('[data-health-score]').textContent = `${score}%`;
  document.querySelector('[data-health-caption]').textContent =
    score >= 80 ? 'Operação com excelente tração.' :
    score >= 60 ? 'Operação saudável, com pontos de otimização.' :
    'Operação pedindo atenção imediata.';
}

function renderInsights(items = []) {
  const node = document.querySelector('[data-insights-list]');
  if (!node) return;
  node.innerHTML = items.map((item) => `
    <div class="ai-item" data-tone="${item.tone || 'neutral'}">
      <div class="ai-item-header">
        <strong>${item.title || 'Insight'}</strong>
        <span class="ai-pill">${item.tone === 'good' ? 'Bom sinal' : item.tone === 'warning' ? 'Atenção' : 'Monitorar'}</span>
      </div>
      <div>${item.headline || ''}</div>
      <p>${item.description || ''}</p>
    </div>
  `).join('');
}

function renderOpportunities(items = []) {
  const node = document.querySelector('[data-opportunities-list]');
  if (!node) return;
  node.innerHTML = items.map((item) => `
    <div class="ai-item" data-tone="neutral">
      <div class="ai-item-header">
        <strong>${item.title || 'Oportunidade'}</strong>
        <span class="ai-opportunity-value">${item.value ?? 0}</span>
      </div>
      <p>${item.description || ''}</p>
    </div>
  `).join('');
}

function renderRecommendations(items = []) {
  const node = document.querySelector('[data-recommendations-list]');
  if (!node) return;
  node.innerHTML = items.map((item) => `
    <div class="ai-item" data-tone="good">
      <div class="ai-item-header">
        <strong>${item.title || 'Recomendação'}</strong>
        <span class="ai-pill">${item.impact || 'Ação'}</span>
      </div>
      <p>${item.description || ''}</p>
    </div>
  `).join('');
}

function statusLabel(value) {
  return ({
    novo: 'Novo',
    em_execucao: 'Em execução',
    concluido: 'Concluído',
    dispensado: 'Dispensado'
  })[value] || 'Novo';
}

function renderActions(items = []) {
  const node = document.querySelector('[data-actions-body]');
  if (!node) return;
  node.innerHTML = items.map((item) => `
    <tr>
      <td>
        <strong>${item.title || 'Ação'}</strong>
        <div style="color:var(--color-text-soft,#64748b);margin-top:6px;">${item.description || ''}</div>
      </td>
      <td><span class="ai-status ai-status--${item.status || 'novo'}">${statusLabel(item.status)}</span></td>
      <td>
        <select class="ai-action-select" data-action-status="${item.id}">
          <option value="novo" ${item.status === 'novo' ? 'selected' : ''}>Novo</option>
          <option value="em_execucao" ${item.status === 'em_execucao' ? 'selected' : ''}>Em execução</option>
          <option value="concluido" ${item.status === 'concluido' ? 'selected' : ''}>Concluído</option>
          <option value="dispensado" ${item.status === 'dispensado' ? 'selected' : ''}>Dispensado</option>
        </select>
      </td>
    </tr>
  `).join('');

  node.querySelectorAll('[data-action-status]').forEach((select) => {
    select.addEventListener('change', async (event) => {
      const actionId = event.currentTarget.getAttribute('data-action-status');
      const status = event.currentTarget.value;
      setFeedback('');
      try {
        await api.patch(`/api/tenant/ai/actions/${actionId}`, { status });
        setFeedback('Plano de ação atualizado com sucesso.', 'success');
        await bootstrapAiManager();
      } catch (error) {
        setFeedback(error.message || 'Não foi possível atualizar a ação.', 'error');
      }
    });
  });
}

export async function bootstrapAiManager() {
  try {
    const data = await api.get('/api/tenant/ai');
    renderSummary(data.summary || {});
    renderInsights(data.insights || []);
    renderOpportunities(data.opportunities || []);
    renderRecommendations(data.recommendations || []);
    renderActions(data.actions || []);
  } catch (error) {
    setFeedback(error.message || 'Não foi possível carregar o Gerente IA.', 'error');
  }
}

bootstrapAiManager();
