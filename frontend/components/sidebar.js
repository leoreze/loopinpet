const STORAGE_KEY = 'loopinpet.sidebar.collapsed';
const AUTH_STORAGE_KEY = 'loopinpet.auth';
const MENU_LOADING_OVERLAY_ID = 'menu-loading-overlay';
const ROUTE_LOADING_SESSION_KEY = 'loopinpet.route.loading';
const MENU_LOADING_MIN_VISIBLE_MS = 450;
const ROUTE_LOADING_TTL_MS = 20000;
const PAGE_LOCAL_LOADING_SELECTOR = '#loading-overlay.loading-overlay, .loading-overlay[data-page-loading], .page-loading-overlay, [data-page-loading-overlay]';
const MOBILE_BREAKPOINT = 920;
const SECTION_STATE_KEY = 'loopinpet.sidebar.sections';
let navigationLoadingBound = false;
let isNavigatingWithOverlay = false;
let routeLoadingActive = false;
let pageLoadSettled = false;
let hideOverlayTimer = null;
let pendingApiRequests = 0;
let overlayVisibleSince = 0;
let lastFetchFinishedAt = 0;

function setPendingRequests(value) {
  pendingApiRequests = Math.max(0, Number(value || 0));
  window.__loopinpetPendingRequests = pendingApiRequests;
}

function suppressPageLocalLoaders() {
  document.querySelectorAll(PAGE_LOCAL_LOADING_SELECTOR).forEach((node) => {
    if (!node || node.id === MENU_LOADING_OVERLAY_ID) return;
    node.setAttribute('hidden', 'hidden');
    node.setAttribute('aria-hidden', 'true');
    node.style.setProperty('display', 'none', 'important');
    node.style.setProperty('visibility', 'hidden', 'important');
    node.style.setProperty('opacity', '0', 'important');
    node.style.setProperty('pointer-events', 'none', 'important');
  });
}

function ensureMenuLoadingOverlay() {
  let overlay = document.getElementById(MENU_LOADING_OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = MENU_LOADING_OVERLAY_ID;
  overlay.className = 'menu-loading-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="menu-loading-backdrop"></div>
    <div class="menu-loading-content" role="status" aria-live="polite">
      <div class="menu-loading-pet" aria-hidden="true">
        <span class="paw paw-1">🐾</span>
        <span class="paw paw-2">🐾</span>
        <span class="paw paw-3">🐾</span>
      </div>
      <div class="menu-loading-title">LoopinPet</div>
      <div class="menu-loading-text">Carregando a próxima página e os dados do pet shop...</div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function showMenuLoadingOverlay() {
  const overlay = ensureMenuLoadingOverlay();
  overlay.classList.add('is-visible');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('is-route-loading');
  suppressPageLocalLoaders();
  if (!overlayVisibleSince) overlayVisibleSince = Date.now();
}

function hideMenuLoadingOverlay() {
  const overlay = document.getElementById(MENU_LOADING_OVERLAY_ID);
  if (overlay) {
    overlay.classList.remove('is-visible');
    overlay.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('is-route-loading');
  isNavigatingWithOverlay = false;
  overlayVisibleSince = 0;
}

function persistRouteLoadingState(url) {
  try {
    sessionStorage.setItem(ROUTE_LOADING_SESSION_KEY, JSON.stringify({ url, timestamp: Date.now() }));
  } catch (_) {}
}

function readRouteLoadingState() {
  try {
    const raw = sessionStorage.getItem(ROUTE_LOADING_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp || Date.now() - parsed.timestamp > ROUTE_LOADING_TTL_MS) {
      sessionStorage.removeItem(ROUTE_LOADING_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

function clearRouteLoadingState() {
  try {
    sessionStorage.removeItem(ROUTE_LOADING_SESSION_KEY);
  } catch (_) {}
}

function syncPendingApiRequests() {
  setPendingRequests(window.__loopinpetPendingRequests || 0);
}

function installGlobalFetchTracking() {
  if (window.__loopinpetFetchPatched || typeof window.fetch !== 'function') return;
  const nativeFetch = window.fetch.bind(window);
  window.__loopinpetFetchPatched = true;
  window.fetch = async (...args) => {
    const nextPending = Number(window.__loopinpetPendingRequests || 0) + 1;
    setPendingRequests(nextPending);
    document.dispatchEvent(new CustomEvent('loopinpet:api-start', { detail: { pending: nextPending, input: args[0] } }));
    try {
      return await nativeFetch(...args);
    } finally {
      const remaining = Math.max(0, Number(window.__loopinpetPendingRequests || 0) - 1);
      lastFetchFinishedAt = Date.now();
      setPendingRequests(remaining);
      document.dispatchEvent(new CustomEvent('loopinpet:api-end', { detail: { pending: remaining, input: args[0] } }));
    }
  };
}

function maybeHideRouteLoadingOverlay() {
  syncPendingApiRequests();
  if (!routeLoadingActive) {
    hideMenuLoadingOverlay();
    return;
  }

  if (!pageLoadSettled || pendingApiRequests > 0) return;

  if (hideOverlayTimer) window.clearTimeout(hideOverlayTimer);

  const visibleWaitMs = Math.max(0, MENU_LOADING_MIN_VISIBLE_MS - (Date.now() - overlayVisibleSince));
  const fetchQuietMs = pendingApiRequests > 0 ? 180 : Math.max(0, 180 - (Date.now() - lastFetchFinishedAt));
  const waitMs = Math.max(visibleWaitMs, fetchQuietMs);

  hideOverlayTimer = window.setTimeout(() => {
    syncPendingApiRequests();
    if (!pageLoadSettled || pendingApiRequests > 0) return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        routeLoadingActive = false;
        clearRouteLoadingState();
        hideMenuLoadingOverlay();
      });
    });
  }, waitMs);
}

function hydrateRouteLoadingFromSession() {
  const routeState = readRouteLoadingState();
  if (!routeState) return;

  routeLoadingActive = true;
  isNavigatingWithOverlay = true;
  pageLoadSettled = document.readyState === 'complete';
  syncPendingApiRequests();
  showMenuLoadingOverlay();
}

function isModifiedEvent(event) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function shouldHandleNavigation(anchor) {
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#')) return false;
  if (anchor.hasAttribute('download')) return false;
  if ((anchor.getAttribute('target') || '').toLowerCase() === '_blank') return false;
  if (anchor.dataset.skipLoading === 'true') return false;

  const url = new URL(anchor.href, window.location.origin);
  if (url.origin !== window.location.origin) return false;
  if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return false;
  return true;
}

function navigateWithOverlay(url) {
  if (!url || isNavigatingWithOverlay) return;
  isNavigatingWithOverlay = true;
  routeLoadingActive = true;
  pageLoadSettled = false;
  persistRouteLoadingState(url);
  showMenuLoadingOverlay();

  window.setTimeout(() => {
    window.location.href = url;
  }, 40);
}

function isMobileViewport() {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

function closeMobileSidebar() {
  document.querySelector('.app')?.classList.remove('sidebar-mobile-open');
}

function bindMenuLoadingOnLinks() {
  ensureMenuLoadingOverlay();
  if (navigationLoadingBound) return;
  navigationLoadingBound = true;

  const handleNavigationClick = (event) => {
    if (event.defaultPrevented || isModifiedEvent(event)) return;

    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    if (!shouldHandleNavigation(anchor)) return;

    event.preventDefault();
    event.stopPropagation();
    closeMobileSidebar();
    navigateWithOverlay(anchor.href);
  };

  document.addEventListener('click', handleNavigationClick, true);
  document.addEventListener('loopinpet:api-start', () => {
    syncPendingApiRequests();
    if (routeLoadingActive) showMenuLoadingOverlay();
  });

  document.addEventListener('loopinpet:api-end', () => {
    maybeHideRouteLoadingOverlay();
  });

  document.addEventListener('loopinpet:page-data-ready', () => {
    pageLoadSettled = true;
    maybeHideRouteLoadingOverlay();
  });

  window.addEventListener('pageshow', () => {
    suppressPageLocalLoaders();
    pageLoadSettled = true;
    maybeHideRouteLoadingOverlay();
  });

  window.addEventListener('load', () => {
    suppressPageLocalLoaders();
    pageLoadSettled = true;
    maybeHideRouteLoadingOverlay();
  });

  if (document.readyState === 'complete') {
    pageLoadSettled = true;
    maybeHideRouteLoadingOverlay();
  }
}


installGlobalFetchTracking();
if (typeof document !== 'undefined') {
  suppressPageLocalLoaders();
  if (document.body) ensureMenuLoadingOverlay();
  hydrateRouteLoadingFromSession();
}

function createSidebarLink(item, level = 'default') {
  const el = document.createElement(item.disabled ? 'button' : 'a');
  const isActive = item.route && window.location.pathname === item.route;

  el.className = `sidebar-item sidebar-item--${level}${isActive ? ' active' : ''}${item.disabled ? ' is-disabled' : ''}`;
  el.title = item.label;
  el.setAttribute('aria-label', item.label);

  if (item.disabled) {
    el.type = 'button';
    el.disabled = true;
    el.setAttribute('aria-disabled', 'true');
  } else {
    el.href = item.route;
  }

  el.innerHTML = `
    <span class="sidebar-item-icon" aria-hidden="true">${item.icon || '•'}</span>
    <span class="sidebar-item-label-wrap">
      <span class="sidebar-item-label">${item.label}</span>
      ${item.disabled ? '<span class="sidebar-item-badge">em breve</span>' : ''}
    </span>
  `;

  return el;
}

function readSectionState() {
  try {
    return JSON.parse(localStorage.getItem(SECTION_STATE_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

function writeSectionState(nextState) {
  try {
    localStorage.setItem(SECTION_STATE_KEY, JSON.stringify(nextState));
  } catch (_) {}
}

function hasActiveRoute(items = []) {
  return items.some((entry) => entry?.route && window.location.pathname === entry.route);
}

export function buildSidebar(menu) {
  const container = document.querySelector('.sidebar-menu');
  if (!container) return;

  const sectionState = readSectionState();
  container.innerHTML = '';

  menu.forEach((item, index) => {
    if (item?.type === 'section') {
      const section = document.createElement('section');
      section.className = 'sidebar-section';
      section.dataset.sectionKey = item.key || `section-${index}`;

      const activeSection = hasActiveRoute(item.items || []);
      const isExpanded = sectionState[section.dataset.sectionKey] ?? activeSection ?? index < 3;
      section.classList.toggle('is-collapsed', !isExpanded);

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'sidebar-section-header';
      header.setAttribute('aria-expanded', String(!!isExpanded));
      header.innerHTML = `
        <span class="sidebar-section-heading">
          <span class="sidebar-section-title">${item.title || 'Módulo'}</span>
          ${item.description ? `<span class="sidebar-section-description">${item.description}</span>` : ''}
        </span>
        <span class="sidebar-section-chevron" aria-hidden="true">▾</span>
      `;

      header.addEventListener('click', () => {
        const nextExpanded = section.classList.contains('is-collapsed');
        section.classList.toggle('is-collapsed', !nextExpanded);
        header.setAttribute('aria-expanded', String(nextExpanded));
        sectionState[section.dataset.sectionKey] = nextExpanded;
        writeSectionState(sectionState);
      });

      section.appendChild(header);

      const group = document.createElement('div');
      group.className = 'sidebar-section-items';
      (item.items || []).forEach((subItem) => group.appendChild(createSidebarLink(subItem, 'nested')));
      section.appendChild(group);
      container.appendChild(section);
      return;
    }

    container.appendChild(createSidebarLink(item));
  });
}

function initSidebarToggle(app) {
  const button = document.querySelector('[data-sidebar-toggle]');
  if (!button || !app) return;

  const applyState = (collapsed) => {
    app.classList.toggle('sidebar-collapsed', collapsed);
    button.setAttribute('aria-expanded', String(!collapsed));
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  };

  const syncResponsiveSidebar = () => {
    if (isMobileViewport()) {
      app.classList.remove('sidebar-collapsed');
      button.setAttribute('aria-expanded', String(app.classList.contains('sidebar-mobile-open')));
    } else {
      app.classList.remove('sidebar-mobile-open');
      const savedState = localStorage.getItem(STORAGE_KEY);
      applyState(savedState === '1');
    }
  };

  button.addEventListener('click', () => {
    if (isMobileViewport()) {
      app.classList.toggle('sidebar-mobile-open');
      button.setAttribute('aria-expanded', String(app.classList.contains('sidebar-mobile-open')));
      return;
    }
    applyState(!app.classList.contains('sidebar-collapsed'));
  });

  window.addEventListener('resize', syncResponsiveSidebar);
  syncResponsiveSidebar();
}

function initNotificationMenu() {
  const menu = document.querySelector('[data-notification-menu]');
  const toggle = document.querySelector('[data-notification-toggle]');
  const dropdown = document.querySelector('[data-notification-dropdown]');
  if (!menu || !toggle || !dropdown) return;

  const closeMenu = () => {
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  const openMenu = () => {
    menu.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
  };

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (menu.classList.contains('is-open')) closeMenu();
    else openMenu();
  });

  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target)) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
}

function initUserMenu() {
  const menu = document.querySelector('[data-user-menu]');
  const toggle = document.querySelector('[data-user-menu-toggle]');
  const dropdown = document.querySelector('[data-user-dropdown]');
  if (!menu || !toggle || !dropdown) return;

  const closeMenu = () => {
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  const openMenu = () => {
    menu.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
  };

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (menu.classList.contains('is-open')) closeMenu();
    else openMenu();
  });

  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target)) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  dropdown.querySelectorAll('a, button').forEach((item) => {
    item.addEventListener('click', (event) => {
      const action = item.getAttribute('data-action');
      if (action === 'logout') {
        event.preventDefault();
        localStorage.removeItem(AUTH_STORAGE_KEY);
        closeMobileSidebar();
        navigateWithOverlay('/tenant/login');
        return;
      }
      closeMenu();
      closeMobileSidebar();
    });
  });
}

function initMobileSidebarBackdrop() {
  document.addEventListener('click', (event) => {
    const app = document.querySelector('.app');
    if (!app?.classList.contains('sidebar-mobile-open')) return;
    const sidebar = document.querySelector('.sidebar');
    const toggle = document.querySelector('[data-sidebar-toggle]');
    if (sidebar?.contains(event.target) || toggle?.contains(event.target)) return;
    closeMobileSidebar();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMobileSidebar();
  });
}

export function initSidebarShell() {
  const app = document.querySelector('.app');
  const sidebar = document.querySelector('.sidebar');
  if (!app || !sidebar) return;

  installGlobalFetchTracking();
  
  const topbarLeft = document.querySelector('.topbar-left');
  const topbarRight = document.querySelector('.topbar-right');

  if (topbarLeft && !topbarLeft.querySelector('.mobile-logo')) {
    const logo = document.createElement('img');
    logo.src = '../../assets/logo-loopinpet.png';
    logo.className = 'mobile-logo';
    topbarLeft.prepend(logo);
  }

  if (topbarRight && !topbarRight.querySelector('.hamburger-btn')) {
    const btn = document.createElement('button');
    btn.className = 'hamburger-btn';
    btn.innerHTML = '<span></span><span></span><span></span>';
    btn.setAttribute('data-sidebar-toggle', 'true');
    topbarRight.appendChild(btn);
  }

  initSidebarToggle(app);
  initNotificationMenu();
  initUserMenu();
  initMobileSidebarBackdrop();
  suppressPageLocalLoaders();
  ensureMenuLoadingOverlay();
  hydrateRouteLoadingFromSession();
  bindMenuLoadingOnLinks();
  if (!routeLoadingActive) hideMenuLoadingOverlay();
  else maybeHideRouteLoadingOverlay();
}
