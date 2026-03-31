const STORAGE_KEY = 'loopinpet.auth';


function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function normalizeHex(color, fallback = '#1F8560') {
  const raw = String(color || '').trim();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return '#' + raw.slice(1).split('').map((part) => part + part).join('');
  }
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback;
}

function hexToRgb(color) {
  const hex = normalizeHex(color).slice(1);
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function rgbToHex(rgb) {
  return `#${[rgb.r, rgb.g, rgb.b].map((value) => clamp(Math.round(value)).toString(16).padStart(2, '0')).join('')}`;
}

function mixHex(color, mixWith = '#000000', ratio = 0.2) {
  const base = hexToRgb(color);
  const target = hexToRgb(mixWith);
  const clamped = Math.max(0, Math.min(1, Number(ratio) || 0));
  return rgbToHex({
    r: base.r + (target.r - base.r) * clamped,
    g: base.g + (target.g - base.g) * clamped,
    b: base.b + (target.b - base.b) * clamped
  });
}

function deriveSurfacePalette(primary, secondary, accent, surfaceMode = 'light') {
  const normalizedPrimary = normalizeHex(primary, '#1F8560');
  const normalizedSecondary = normalizeHex(secondary, '#E67315');
  const normalizedAccent = normalizeHex(accent, '#8F8866');
  if (surfaceMode !== 'dark') {
    return {
      accent: normalizedPrimary,
      accentDark: mixHex(normalizedSecondary, '#0f172a', 0.14),
      accentSoft: `${normalizedPrimary}1A`,
      brandHighlight: normalizedAccent,
      sidebarStart: normalizedAccent,
      sidebarEnd: normalizedSecondary,
      shell: '#f4f7fb',
      surface: '#ffffff',
      surfaceAlt: '#eef4f8',
      text: '#0f172a',
      textSoft: '#64748b',
      border: 'rgba(148,163,184,.18)',
      cardShadow: '0 24px 60px rgba(15,23,42,.08)',
      topbar: 'rgba(255,255,255,.92)'
    };
  }
  return {
    accent: mixHex(normalizedPrimary, '#ffffff', 0.1),
    accentDark: mixHex(normalizedSecondary, '#000000', 0.42),
    accentSoft: `${mixHex(normalizedPrimary, '#000000', 0.55)}33`,
    brandHighlight: mixHex(normalizedAccent, '#000000', 0.28),
    sidebarStart: mixHex(normalizedAccent, '#020617', 0.62),
    sidebarEnd: mixHex(normalizedSecondary, '#020617', 0.7),
    shell: mixHex(normalizedAccent, '#020617', 0.92),
    surface: mixHex(normalizedPrimary, '#020617', 0.82),
    surfaceAlt: mixHex(normalizedSecondary, '#020617', 0.86),
    text: '#f8fafc',
    textSoft: '#cbd5e1',
    border: 'rgba(148,163,184,.22)',
    cardShadow: '0 28px 80px rgba(2,6,23,.45)',
    topbar: 'rgba(9,14,28,.92)'
  };
}

function applyPaletteTokens(palette) {
  if (!palette || typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--accent', palette.accent);
  root.style.setProperty('--accent-dark', palette.accentDark);
  root.style.setProperty('--accent-soft', palette.accentSoft);
  root.style.setProperty('--brand-highlight', palette.brandHighlight);
  root.style.setProperty('--sidebar-bg-start', palette.sidebarStart);
  root.style.setProperty('--sidebar-bg-end', palette.sidebarEnd);
  root.style.setProperty('--shell-bg', palette.shell);
  root.style.setProperty('--surface-card', palette.surface);
  root.style.setProperty('--surface-card-alt', palette.surfaceAlt);
  root.style.setProperty('--text-strong', palette.text);
  root.style.setProperty('--text-soft', palette.textSoft);
  root.style.setProperty('--border-strong', palette.border);
  root.style.setProperty('--card-shadow-strong', palette.cardShadow);
  root.style.setProperty('--topbar-bg', palette.topbar);
}


export function saveAuth(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getAuth() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function getToken() {
  return getAuth()?.token || '';
}

export function logout() {
  localStorage.removeItem(STORAGE_KEY);
  window.location.href = '/tenant/login';
}

export async function fetchMe() {
  const token = getToken();
  if (!token) return null;

  const response = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    logout();
    return null;
  }

  const data = await response.json();
  const current = getAuth() || {};
  const merged = {
    ...current,
    ...data,
    user: { ...(current.user || {}), ...(data.user || {}) },
    tenant: { ...(current.tenant || {}), ...(data.tenant || {}) },
    settings: { ...(current.settings || {}), ...(data.settings || {}) },
    subscription: { ...(current.subscription || {}), ...(data.subscription || {}) },
    token
  };
  saveAuth(merged);
  return merged;
}

export async function fetchBranding() {
  const token = getToken();
  if (!token) return null;

  const response = await fetch('/api/tenant/branding', {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const current = getAuth() || {};
  const merged = {
    ...current,
    tenant: { ...(current.tenant || {}), ...(data.tenant || {}) },
    settings: { ...(current.settings || {}), ...(data.settings || {}) },
    token
  };
  saveAuth(merged);
  return data;
}

export async function requireTenantAuth() {
  const auth = getAuth();
  if (!auth?.token) {
    window.location.href = '/tenant/login';
    return null;
  }

  await fetchMe();
  await fetchBranding();
  return getAuth();
}


function hasCompletedBranding(auth) {
  const tenant = auth?.tenant || {};
  const settings = auth?.settings || {};
  const brand = String(tenant.brand_name || tenant.name || '').trim();
  const defaultBrand = 'LoopinPet';
  const hasCustomBrand = Boolean(brand) && brand.toLowerCase() !== defaultBrand.toLowerCase();
  const hasLogo = Boolean(String(tenant.logo_url || '').trim());
  const hasDomain = Boolean(String(tenant.custom_domain || '').trim());
  const hasSupport = Boolean(String(tenant.support_email || '').trim() || String(tenant.whatsapp_number || '').trim());
  const hasCustomText = Boolean(String(settings.login_title || '').trim() || String(settings.meta_title || '').trim());
  return hasCustomBrand || hasLogo || hasDomain || hasSupport || hasCustomText;
}

function initialsFromName(name = '') {
  return String(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'AD';
}

export function applyBrandingTheme() {
  const auth = getAuth();
  const tenant = auth?.tenant || {};
  const settings = auth?.settings || {};
  const brand = tenant.brand_name || tenant.name || 'LoopinPet';
  const primary = tenant.primary_color || '#1F8560';
  const secondary = tenant.secondary_color || '#E67315';
  const accent = tenant.accent_color || '#8F8866';
  const logo = tenant.logo_url || '../../assets/logo-loopinpet.png';
  const logoIcon = tenant.favicon_url || tenant.logo_url || '../../assets/icon_loopinpet.png';

  const palette = deriveSurfacePalette(primary, secondary, accent, settings.surface_mode || 'light');
  applyPaletteTokens(palette);

  if (settings.surface_mode === 'dark') {
    document.body.classList.add('theme-dark');
  } else {
    document.body.classList.remove('theme-dark');
  }

  document.querySelectorAll('[data-tenant-logo]').forEach((node) => {
    node.src = logo;
    node.alt = brand;
  });

  document.querySelectorAll('[data-tenant-logo-icon]').forEach((node) => {
    node.src = logoIcon;
    node.alt = brand;
  });

  if (tenant.favicon_url) {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = tenant.favicon_url;
  }

  const title = settings.meta_title || `${brand} • LoopinPet`;
  document.title = title;
}

export function hydrateTenantUi() {
  const auth = getAuth();
  if (!auth) return;

  applyBrandingTheme();

  const brand = auth.tenant?.brand_name || auth.tenant?.name || 'LoopinPet';
  const userName = auth.user?.full_name || 'Administrador';
  const tenantId = auth.tenant?.id || '—';
  const planName = auth.tenant?.plan_name || auth.subscription?.plan_name || 'Plano Pro';
  const supportEmail = auth.tenant?.support_email || '—';
  const whatsapp = auth.tenant?.whatsapp_number || '—';
  const customDomain = auth.tenant?.custom_domain || '—';
  const brandingCompleted = hasCompletedBranding(auth);

  document.querySelectorAll('[data-tenant-brand]').forEach((node) => {
    node.textContent = brand;
  });

  document.querySelectorAll('[data-user-name]').forEach((node) => {
    node.textContent = userName;
  });

  document.querySelectorAll('[data-user-initials]').forEach((node) => {
    node.textContent = initialsFromName(userName);
  });

  document.querySelectorAll('[data-tenant-id]').forEach((node) => {
    node.textContent = tenantId;
  });

  document.querySelectorAll('[data-tenant-plan]').forEach((node) => {
    node.textContent = planName;
  });

  document.querySelectorAll('[data-tenant-slug]').forEach((node) => {
    node.textContent = auth.tenant?.slug || '—';
  });

  document.querySelectorAll('[data-tenant-domain]').forEach((node) => {
    node.textContent = customDomain;
  });

  document.querySelectorAll('[data-tenant-support-email]').forEach((node) => {
    node.textContent = supportEmail;
  });

  document.querySelectorAll('[data-tenant-whatsapp]').forEach((node) => {
    node.textContent = whatsapp;
  });

  document.querySelectorAll('[data-onboarding-banner]').forEach((node) => {
    node.style.display = brandingCompleted ? 'none' : '';
  });
}



function bootstrapCachedBrandingUi() {
  const run = () => {
    const auth = getAuth();
    if (!auth) return;
    try {
      hydrateTenantUi();
    } catch {
      // ignore cached bootstrap issues
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}

bootstrapCachedBrandingUi();
