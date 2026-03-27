import { query } from '../config/db.js';
import { ensureBaseSchema } from '../scripts/bootstrapDb.js';

function sanitize(value) {
  return String(value || '').trim();
}

function normalizeColor(value, fallback) {
  const color = sanitize(value);
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color) ? color : fallback;
}

function buildBrandingPayload(row) {
  return {
    tenant: {
      id: row.tenant_id,
      name: row.name,
      slug: row.slug,
      brand_name: row.brand_name || row.name,
      status: row.status,
      logo_url: row.logo_url || '',
      favicon_url: row.favicon_url || '',
      primary_color: row.primary_color || '#1F8560',
      secondary_color: row.secondary_color || '#E67315',
      accent_color: row.accent_color || '#8F8866',
      custom_domain: row.custom_domain || '',
      support_email: row.support_email || '',
      whatsapp_number: row.whatsapp_number || '',
      booking_url: row.booking_url || ''
    },
    settings: {
      meta_title: row.meta_title || '',
      meta_description: row.meta_description || '',
      login_title: row.login_title || '',
      login_subtitle: row.login_subtitle || '',
      sidebar_title: row.sidebar_title || '',
      sidebar_subtitle: row.sidebar_subtitle || '',
      surface_mode: row.surface_mode || 'light'
    }
  };
}

export async function getTenantBranding(tenantId) {
  await ensureBaseSchema();

  await query(
    `insert into tenant_settings (tenant_id)
     values ($1)
     on conflict (tenant_id) do nothing`,
    [tenantId]
  );

  const result = await query(
    `select
      t.id as tenant_id,
      t.name,
      t.slug,
      t.brand_name,
      t.status,
      t.logo_url,
      t.favicon_url,
      t.primary_color,
      t.secondary_color,
      t.accent_color,
      t.custom_domain,
      t.support_email,
      t.whatsapp_number,
      t.booking_url,
      s.meta_title,
      s.meta_description,
      s.login_title,
      s.login_subtitle,
      s.sidebar_title,
      s.sidebar_subtitle,
      s.surface_mode
     from tenants t
     left join tenant_settings s on s.tenant_id = t.id
     where t.id = $1
     limit 1`,
    [tenantId]
  );

  if (!result.rows.length) {
    throw new Error('Tenant não encontrado.');
  }

  return buildBrandingPayload(result.rows[0]);
}

export async function updateTenantBranding(tenantId, payload) {
  await ensureBaseSchema();

  const tenantName = sanitize(payload.tenantName);
  const brandName = sanitize(payload.brandName);
  const logoUrl = sanitize(payload.logoUrl);
  const faviconUrl = sanitize(payload.faviconUrl);
  const primaryColor = normalizeColor(payload.primaryColor, '#1F8560');
  const secondaryColor = normalizeColor(payload.secondaryColor, '#E67315');
  const accentColor = normalizeColor(payload.accentColor, '#8F8866');
  const customDomain = sanitize(payload.customDomain);
  const supportEmail = sanitize(payload.supportEmail).toLowerCase();
  const whatsappNumber = sanitize(payload.whatsappNumber);
  const bookingUrl = sanitize(payload.bookingUrl);
  const metaTitle = sanitize(payload.metaTitle);
  const metaDescription = sanitize(payload.metaDescription);
  const loginTitle = sanitize(payload.loginTitle);
  const loginSubtitle = sanitize(payload.loginSubtitle);
  const sidebarTitle = sanitize(payload.sidebarTitle);
  const sidebarSubtitle = sanitize(payload.sidebarSubtitle);
  const surfaceMode = ['light', 'dark'].includes(sanitize(payload.surfaceMode)) ? sanitize(payload.surfaceMode) : 'light';

  await query(
    `update tenants
        set name = coalesce(nullif($2, ''), name),
            brand_name = coalesce(nullif($3, ''), brand_name, name),
            logo_url = $4,
            favicon_url = $5,
            primary_color = $6,
            secondary_color = $7,
            accent_color = $8,
            custom_domain = $9,
            support_email = $10,
            whatsapp_number = $11,
            booking_url = $12,
            updated_at = now()
      where id = $1`,
    [
      tenantId,
      tenantName,
      brandName,
      logoUrl,
      faviconUrl,
      primaryColor,
      secondaryColor,
      accentColor,
      customDomain,
      supportEmail,
      whatsappNumber,
      bookingUrl
    ]
  );

  await query(
    `insert into tenant_settings (
        tenant_id,
        meta_title,
        meta_description,
        login_title,
        login_subtitle,
        sidebar_title,
        sidebar_subtitle,
        surface_mode,
        updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8, now())
      on conflict (tenant_id)
      do update set
        meta_title = excluded.meta_title,
        meta_description = excluded.meta_description,
        login_title = excluded.login_title,
        login_subtitle = excluded.login_subtitle,
        sidebar_title = excluded.sidebar_title,
        sidebar_subtitle = excluded.sidebar_subtitle,
        surface_mode = excluded.surface_mode,
        updated_at = now()`,
    [tenantId, metaTitle, metaDescription, loginTitle, loginSubtitle, sidebarTitle, sidebarSubtitle, surfaceMode]
  );

  return getTenantBranding(tenantId);
}

export async function getTenantSummary(tenantId) {
  const branding = await getTenantBranding(tenantId);

  return {
    tenantId,
    metrics: {
      appointmentsToday: 34,
      revenueToday: 2800,
      activeCheckins: 9,
      petsInDayCare: 5
    },
    integrations: {
      postgres: true,
      openai: 'ready',
      whatsapp: 'ready',
      mercadopago: 'ready'
    },
    branding
  };
}
