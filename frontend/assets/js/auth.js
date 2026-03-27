const STORAGE_KEY = 'loopinpet.auth';

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

  document.documentElement.style.setProperty('--accent', primary);
  document.documentElement.style.setProperty('--accent-dark', secondary);
  document.documentElement.style.setProperty('--accent-soft', `${primary}1A`);
  document.documentElement.style.setProperty('--brand-highlight', accent);
  document.documentElement.style.setProperty('--sidebar-bg-start', accent);
  document.documentElement.style.setProperty('--sidebar-bg-end', secondary);

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
