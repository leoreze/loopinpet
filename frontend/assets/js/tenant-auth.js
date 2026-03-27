import { saveAuth } from './auth.js';

const loginForm = document.querySelector('#login-form');
const signupForm = document.querySelector('#signup-form');
const feedback = document.querySelector('#auth-feedback');
const healthBadge = document.querySelector('[data-health-badge]');
const healthDetail = document.querySelector('[data-health-detail]');
const modals = Array.from(document.querySelectorAll('.tenant-modal'));
const openButtons = Array.from(document.querySelectorAll('[data-open-modal]'));
const closeButtons = Array.from(document.querySelectorAll('[data-close-modal]'));
const copyrightYear = document.querySelector('#copyright-year');

function showMessage(message, type = 'info') {
  if (!feedback) return;
  feedback.textContent = message;
  feedback.className = `auth-feedback ${type}`;
}

function setSubmitting(form, isSubmitting) {
  if (!form) return;
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  button.disabled = isSubmitting;
  button.dataset.originalLabel = button.dataset.originalLabel || button.textContent;
  button.textContent = isSubmitting ? 'Processando...' : button.dataset.originalLabel;
}

async function loadHealth() {
  try {
    const response = await fetch('/api/health');
    const data = await response.json();
    const connected = Boolean(data?.database?.connected);

    if (healthBadge) {
      healthBadge.textContent = connected ? 'Banco conectado' : 'Banco pendente';
      healthBadge.className = `pill ${connected ? 'success' : 'warning'}`;
    }

    if (healthDetail) {
      healthDetail.textContent = connected
        ? `Ambiente pronto para criar e acessar o assinante.`
        : `Ajuste o backend/.env e reinicie o servidor. ${data?.database?.reason || ''}`.trim();
    }
  } catch {
    if (healthBadge) {
      healthBadge.textContent = 'API offline';
      healthBadge.className = 'pill danger';
    }
    if (healthDetail) {
      healthDetail.textContent = 'Não foi possível consultar /api/health.';
    }
  }
}

async function submitForm(form, url, payload, successRedirect = '/tenant/dashboard') {
  setSubmitting(form, true);
  showMessage('Processando acesso...');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      showMessage(data.error || 'Não foi possível concluir a ação.', 'error');
      return;
    }

    saveAuth(data);
    showMessage('Acesso liberado com sucesso.', 'success');
    closeAllModals();
    window.location.href = successRedirect;
  } catch (error) {
    showMessage(error.message || 'Falha de comunicação com a API.', 'error');
  } finally {
    setSubmitting(form, false);
  }
}

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);

  await submitForm(loginForm, '/api/auth/login', {
    email: formData.get('email'),
    password: formData.get('password')
  });
});

signupForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(signupForm);

  await submitForm(signupForm, '/api/auth/signup', {
    tenantName: formData.get('tenantName'),
    brandName: formData.get('brandName'),
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password')
  });
});

loadHealth();


function closeAllModals() {
  modals.forEach((modal) => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  });
  document.body.style.overflow = '';
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  closeAllModals();
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const firstInput = modal.querySelector('input');
  firstInput?.focus();
}

openButtons.forEach((button) => {
  button.addEventListener('click', () => openModal(button.dataset.openModal));
});

closeButtons.forEach((button) => {
  button.addEventListener('click', closeAllModals);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeAllModals();
});

if (copyrightYear) {
  copyrightYear.textContent = new Date().getFullYear();
}

