import { getToken, logout } from './auth.js';

const GLOBAL_FEEDBACK_ID = 'global-crud-feedback';
const GLOBAL_FEEDBACK_STYLE_ID = 'global-crud-feedback-style';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureFeedbackUi() {
  if (!document || document.getElementById(GLOBAL_FEEDBACK_ID)) return;

  if (!document.getElementById(GLOBAL_FEEDBACK_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = GLOBAL_FEEDBACK_STYLE_ID;
    style.textContent = `
      .crud-feedback-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.45);backdrop-filter:blur(10px);z-index:99999}
      .crud-feedback-overlay[hidden]{display:none !important}
      .crud-feedback-card{width:min(92vw,420px);background:#fff;border-radius:24px;padding:26px 24px;box-shadow:0 24px 80px rgba(15,23,42,.28);text-align:center;border:1px solid rgba(148,163,184,.18)}
      .crud-feedback-media{width:84px;height:84px;border-radius:999px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg, rgba(31,133,96,.12), rgba(230,115,21,.12));overflow:hidden}
      .crud-feedback-media img{max-width:72px;max-height:72px;object-fit:contain}
      .crud-feedback-icon{font-size:34px;line-height:1}
      .crud-feedback-title{margin:0;font-size:1.2rem;font-weight:800;color:#0f172a}
      .crud-feedback-message{margin:10px 0 0;color:#475569;line-height:1.5;font-size:.98rem}
      .crud-feedback-actions{display:flex;justify-content:center;margin-top:18px}
      .crud-feedback-button{border:none;border-radius:14px;padding:12px 20px;font-weight:700;cursor:pointer;background:#1F8560;color:#fff;box-shadow:0 10px 26px rgba(31,133,96,.24)}
      .crud-feedback-button.is-error{background:#b91c1c;box-shadow:0 10px 26px rgba(185,28,28,.18)}
      .crud-feedback-spinner{width:34px;height:34px;border-radius:999px;border:3px solid rgba(31,133,96,.15);border-top-color:#1F8560;animation:crud-spin .85s linear infinite}
      @keyframes crud-spin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(style);
  }

  const overlay = document.createElement('div');
  overlay.id = GLOBAL_FEEDBACK_ID;
  overlay.className = 'crud-feedback-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="crud-feedback-card" role="alertdialog" aria-modal="true" aria-live="assertive">
      <div class="crud-feedback-media" data-feedback-media>
        <img src="/assets/img/loading-dog.gif" alt="Carregando" data-feedback-gif>
      </div>
      <h3 class="crud-feedback-title" data-feedback-title>Processando...</h3>
      <p class="crud-feedback-message" data-feedback-message>Aguarde enquanto concluímos a ação.</p>
      <div class="crud-feedback-actions" data-feedback-actions hidden>
        <button type="button" class="crud-feedback-button" data-feedback-close>OK</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-feedback-close]')?.addEventListener('click', () => {
    overlay.hidden = true;
  });
}

function feedbackNodes() {
  ensureFeedbackUi();
  const overlay = document.getElementById(GLOBAL_FEEDBACK_ID);
  return {
    overlay,
    media: overlay?.querySelector('[data-feedback-media]'),
    gif: overlay?.querySelector('[data-feedback-gif]'),
    title: overlay?.querySelector('[data-feedback-title]'),
    message: overlay?.querySelector('[data-feedback-message]'),
    actions: overlay?.querySelector('[data-feedback-actions]'),
    close: overlay?.querySelector('[data-feedback-close]')
  };
}

function openLoadingModal(message = 'Aguarde enquanto concluímos a ação.') {
  const ui = feedbackNodes();
  if (!ui.overlay) return;
  ui.overlay.hidden = false;
  if (ui.media) {
    ui.media.innerHTML = '<img src="/assets/img/loading-dog.gif" alt="Carregando" style="max-width:72px;max-height:72px;object-fit:contain">';
  }
  if (ui.title) ui.title.textContent = 'Carregando...';
  if (ui.message) ui.message.textContent = message;
  if (ui.actions) ui.actions.hidden = true;
}

function closeFeedbackModal() {
  const ui = feedbackNodes();
  if (ui.overlay) ui.overlay.hidden = true;
}


async function runWithLoading(message, handler) {
  openLoadingModal(message || 'Carregando dados do pet shop...');
  try {
    return await handler();
  } finally {
    closeFeedbackModal();
  }
}


function showResultModal({ type = 'success', title, message }) {
  const ui = feedbackNodes();
  if (!ui.overlay) return;
  ui.overlay.hidden = false;
  if (ui.media) {
    ui.media.innerHTML = `<span class="crud-feedback-icon">${type === 'error' ? '⚠️' : '✅'}</span>`;
  }
  if (ui.title) ui.title.textContent = title;
  if (ui.message) ui.message.innerHTML = escapeHtml(message);
  if (ui.actions) ui.actions.hidden = false;
  if (ui.close) {
    ui.close.className = `crud-feedback-button${type === 'error' ? ' is-error' : ''}`;
    ui.close.textContent = 'OK';
  }
}

function friendlyApiError(message = 'Não foi possível concluir a ação.') {
  const text = String(message || '').trim();
  if (!text) return 'Não foi possível concluir a ação.';
  if (text.includes('duplicate key value')) return 'Já existe um cadastro com essas informações. Revise os dados e tente novamente.';
  if (text.includes('violates unique constraint')) return 'Já existe um cadastro com essas informações. Revise os dados e tente novamente.';
  if (text.includes('horário de funcionamento')) return 'Esse horário está fora do horário de funcionamento configurado. Ajuste a data ou a hora e tente novamente.';
  if (text.includes('slot máximo')) return 'Esse horário já atingiu o limite de agendamentos por hora configurado para o sistema.';
  if (text.includes('Sessão expirada')) return 'Sua sessão expirou. Entre novamente para continuar.';
  return text;
}


let pageLoadInitialized = false;
let pendingRequestCount = 0;
let pageLoadFinished = false;
let closeTimer = null;

function schedulePageLoadingClose() {
  if (!pageLoadFinished || pendingRequestCount > 0) return;
  window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!pageLoadFinished || pendingRequestCount > 0) return;
        closeFeedbackModal();
      });
    });
  }, 260);
}

function installGlobalPageLoading() {
  if (pageLoadInitialized || typeof document === 'undefined' || typeof window === 'undefined') return;
  pageLoadInitialized = true;
  ensureFeedbackUi();
  openLoadingModal('Carregando experiência do pet shop...');
  if (document.readyState !== 'complete') {
    window.addEventListener('load', () => {
      pageLoadFinished = true;
      schedulePageLoadingClose();
    }, { once: true });
  } else {
    pageLoadFinished = true;
    schedulePageLoadingClose();
  }

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return;
    openLoadingModal('Abrindo página do pet shop...');
  }, true);

  window.addEventListener('beforeunload', () => {
    openLoadingModal('Carregando experiência do pet shop...');
  });
}

function shouldUseCrudFeedback(url = '', method = 'GET') {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  if (normalizedMethod === 'GET') return false;
  return !/\/api\/auth\/(login|signup|register)/.test(url);
}

function successTitleFor(method = 'POST') {
  const normalized = String(method || 'POST').toUpperCase();
  if (normalized === 'POST') return 'Cadastro realizado';
  if (normalized === 'PUT' || normalized === 'PATCH') return 'Atualização concluída';
  if (normalized === 'DELETE') return 'Exclusão concluída';
  return 'Ação concluída';
}

async function request(url, options = {}) {
  const token = getToken();
  const method = String(options.method || 'GET').toUpperCase();
  const shouldFeedback = shouldUseCrudFeedback(url, method);
  const isBackgroundGet = method === 'GET' && pageLoadFinished;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  if (shouldFeedback) {
    openLoadingModal(method === 'DELETE' ? 'Excluindo registro...' : 'Processando sua solicitação...');
  } else if (!pageLoadFinished || !isBackgroundGet) {
    openLoadingModal('Carregando experiência do pet shop...');
  }

  pendingRequestCount += 1;
  try {
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      if (shouldFeedback) {
        showResultModal({ type: 'error', title: 'Sessão expirada', message: 'Sua sessão expirou. Entre novamente para continuar.' });
      }
      logout();
      throw new Error('Sessão expirada.');
    }

    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : null;

    if (!response.ok) {
      const message = friendlyApiError(body?.error || body?.message || 'Erro na requisição.');
      if (shouldFeedback) {
        showResultModal({ type: 'error', title: 'Não foi possível concluir', message });
      }
      throw new Error(message);
    }

    if (shouldFeedback) {
      showResultModal({ type: 'success', title: successTitleFor(method), message: body?.message || 'Ação concluída com sucesso.' });
    }

    return body;
  } catch (error) {
    if (shouldFeedback && !(error instanceof Error && /Sessão expirada/.test(error.message))) {
      showResultModal({ type: 'error', title: 'Não foi possível concluir', message: friendlyApiError(error?.message) });
    }
    throw error;
  } finally {
    pendingRequestCount = Math.max(0, pendingRequestCount - 1);
    if (shouldFeedback) {
      // result modal is handled separately
    } else {
      schedulePageLoadingClose();
    }
  }
}

export { openLoadingModal, closeFeedbackModal, runWithLoading };

installGlobalPageLoading();

export const api = {
  get: (url) => request(url),
  post: (url, data) => request(url, { method: 'POST', body: JSON.stringify(data || {}) }),
  put: (url, data) => request(url, { method: 'PUT', body: JSON.stringify(data || {}) }),
  patch: (url, data) => request(url, { method: 'PATCH', body: JSON.stringify(data || {}) }),
  delete: (url) => request(url, { method: 'DELETE' })
};
