
import { getAuth, getToken, hydrateTenantUi, saveAuth } from './auth.js';

const form = document.querySelector('#branding-form');
const feedback = document.querySelector('#branding-feedback');
const previewLogo = document.querySelector('[data-preview-logo]');
const previewBrand = document.querySelector('[data-preview-brand]');
const previewDomain = document.querySelector('[data-preview-domain]');
const previewLoginTitle = document.querySelector('[data-preview-login-title]');
const previewLoginSubtitle = document.querySelector('[data-preview-login-subtitle]');
const previewMetaTitle = document.querySelector('[data-preview-meta-title]');
const previewMetaDesc = document.querySelector('[data-preview-meta-description]');
const previewWhatsapp = document.querySelector('[data-preview-whatsapp]');
const previewSupportEmail = document.querySelector('[data-preview-support-email]');
const previewSurface = document.querySelector('[data-preview-surface]');
const summaryPills = document.querySelector('[data-preview-colors]');
const logoFileInput = form?.querySelector('input[name="logoFile"]');
const faviconFileInput = form?.querySelector('input[name="faviconFile"]');
const logoHiddenInput = form?.querySelector('input[name="logoUrl"]');
const faviconHiddenInput = form?.querySelector('input[name="faviconUrl"]');

function setFeedback(message, type = 'info') {
  if (!feedback) return;
  feedback.textContent = message;
  feedback.className = `auth-feedback ${type}`;
}

function currentBranding() {
  const auth = getAuth() || {};
  return {
    tenantName: auth.tenant?.name || '',
    brandName: auth.tenant?.brand_name || auth.tenant?.name || '',
    logoUrl: auth.tenant?.logo_url || '',
    faviconUrl: auth.tenant?.favicon_url || '',
    primaryColor: auth.tenant?.primary_color || '#1F8560',
    secondaryColor: auth.tenant?.secondary_color || '#E67315',
    accentColor: auth.tenant?.accent_color || '#8F8866',
    customDomain: auth.tenant?.custom_domain || '',
    supportEmail: auth.tenant?.support_email || '',
    whatsappNumber: auth.tenant?.whatsapp_number || '',
    bookingUrl: auth.tenant?.booking_url || '',
    metaTitle: auth.settings?.meta_title || '',
    metaDescription: auth.settings?.meta_description || '',
    loginTitle: auth.settings?.login_title || '',
    loginSubtitle: auth.settings?.login_subtitle || '',
    sidebarTitle: auth.settings?.sidebar_title || '',
    sidebarSubtitle: auth.settings?.sidebar_subtitle || '',
    surfaceMode: auth.settings?.surface_mode || 'light'
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
    reader.readAsDataURL(file);
  });
}

async function handleFileSelection(input, hiddenField, maxSizeMb = 3) {
  const file = input?.files?.[0];
  if (!file || !hiddenField) return;
  if (file.size > maxSizeMb * 1024 * 1024) {
    input.value = '';
    throw new Error(`O arquivo excede ${maxSizeMb}MB.`);
  }
  const dataUrl = await fileToDataUrl(file);
  hiddenField.value = dataUrl;
  renderPreview();
}

function fillForm() {
  if (!form) return;
  const branding = currentBranding();
  Object.entries(branding).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field) field.value = value;
  });
  renderPreview();
}

function renderPreview() {
  if (!form) return;

  const data = new FormData(form);
  const brandName = String(data.get('brandName') || 'LoopinPet').trim() || 'LoopinPet';
  const logoUrl = String(data.get('logoUrl') || '').trim() || '../../assets/logo-loopinpet.png';
  const customDomain = String(data.get('customDomain') || 'seudominio.com.br').trim() || 'seudominio.com.br';
  const loginTitle = String(data.get('loginTitle') || `Bem-vindo ao ${brandName}`).trim() || `Bem-vindo ao ${brandName}`;
  const loginSubtitle = String(data.get('loginSubtitle') || 'Seu painel white-label está pronto para receber agenda, CRM e financeiro.').trim() || 'Seu painel white-label está pronto para receber agenda, CRM e financeiro.';
  const metaTitle = String(data.get('metaTitle') || `${brandName} • LoopinPet`).trim() || `${brandName} • LoopinPet`;
  const metaDescription = String(data.get('metaDescription') || 'Experiência white-label para o assinante LoopinPet.').trim() || 'Experiência white-label para o assinante LoopinPet.';
  const whatsapp = String(data.get('whatsappNumber') || 'Não configurado').trim() || 'Não configurado';
  const supportEmail = String(data.get('supportEmail') || 'Não configurado').trim() || 'Não configurado';
  const primary = String(data.get('primaryColor') || '#1F8560').trim() || '#1F8560';
  const secondary = String(data.get('secondaryColor') || '#E67315').trim() || '#E67315';
  const accent = String(data.get('accentColor') || '#8F8866').trim() || '#8F8866';
  const surfaceMode = String(data.get('surfaceMode') || 'light');

  if (previewLogo) previewLogo.src = logoUrl;
  if (previewBrand) previewBrand.textContent = brandName;
  if (previewDomain) previewDomain.textContent = customDomain;
  if (previewLoginTitle) previewLoginTitle.textContent = loginTitle;
  if (previewLoginSubtitle) previewLoginSubtitle.textContent = loginSubtitle;
  if (previewMetaTitle) previewMetaTitle.textContent = metaTitle;
  if (previewMetaDesc) previewMetaDesc.textContent = metaDescription;
  if (previewWhatsapp) previewWhatsapp.textContent = whatsapp;
  if (previewSupportEmail) previewSupportEmail.textContent = supportEmail;
  if (previewSurface) previewSurface.textContent = surfaceMode === 'dark' ? 'Dark Mode' : 'Light Mode';
  if (summaryPills) {
    summaryPills.innerHTML = `
      <span class="color-pill"><i style="background:${primary}"></i><b>Primária</b><small>${primary}</small></span>
      <span class="color-pill"><i style="background:${secondary}"></i><b>Secundária</b><small>${secondary}</small></span>
      <span class="color-pill"><i style="background:${accent}"></i><b>Destaque</b><small>${accent}</small></span>
    `;
  }

  document.documentElement.style.setProperty('--accent', primary);
  document.documentElement.style.setProperty('--accent-dark', secondary);
  document.documentElement.style.setProperty('--brand-highlight', accent);
  document.documentElement.style.setProperty('--accent-soft', `${primary}1A`);
  document.documentElement.style.setProperty('--sidebar-bg-start', accent);
  document.documentElement.style.setProperty('--sidebar-bg-end', secondary);
  document.body.classList.toggle('theme-dark', surfaceMode === 'dark');
}

async function saveBranding(event) {
  event.preventDefault();
  setFeedback('Salvando white-label...');

  const payload = Object.fromEntries(new FormData(form).entries());
  delete payload.logoFile;
  delete payload.faviconFile;

  try {
    const response = await fetch('/api/tenant/branding', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setFeedback(data.error || 'Não foi possível salvar o white-label.', 'error');
      return;
    }

    const auth = getAuth() || {};
    const mergedAuth = {
      ...auth,
      tenant: { ...(auth.tenant || {}), ...(data.tenant || {}) },
      settings: { ...(auth.settings || {}), ...(data.settings || {}) },
      token: auth.token
    };

    saveAuth(mergedAuth);
    hydrateTenantUi();
    fillForm();
    setFeedback(data.message || 'White-label atualizado com sucesso.', 'success');
  } catch (error) {
    setFeedback(error.message || 'Falha ao salvar white-label.', 'error');
  }
}

logoFileInput?.addEventListener('change', async () => {
  try {
    await handleFileSelection(logoFileInput, logoHiddenInput, 4);
    setFeedback('Logo carregada com sucesso. Salve para aplicar no ambiente.', 'success');
  } catch (error) {
    setFeedback(error.message, 'error');
  }
});

faviconFileInput?.addEventListener('change', async () => {
  try {
    await handleFileSelection(faviconFileInput, faviconHiddenInput, 2);
    setFeedback('Ícone carregado com sucesso. Salve para aplicar no ambiente.', 'success');
  } catch (error) {
    setFeedback(error.message, 'error');
  }
});

form?.addEventListener('input', renderPreview);
form?.addEventListener('submit', saveBranding);

hydrateTenantUi();
fillForm();
