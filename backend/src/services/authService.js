import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { env } from '../config/env.js';
import { ensureBaseSchema } from '../scripts/bootstrapDb.js';

function buildSlug(input) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function sanitizeText(value) {
  return String(value || '').trim();
}

async function ensureUniqueSlug(baseSlug) {
  let slug = baseSlug || `tenant-${Date.now()}`;
  let counter = 1;

  while (true) {
    const { rows } = await query('select id from tenants where slug = $1 limit 1', [slug]);
    if (!rows.length) return slug;
    slug = `${baseSlug}-${counter++}`;
  }
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role
    },
    env.jwtSecret,
    { expiresIn: '7d' }
  );
}

function normalizePublicError(message) {
  if (!message) return 'Não foi possível concluir a ação.';
  if (/duplicate key value/i.test(message) || /já existe/i.test(message)) {
    return 'Já existe um assinante com este e-mail.';
  }
  if (/DATABASE_URL/i.test(message)) {
    return 'Banco de dados não configurado. Crie o arquivo backend/.env e reinicie o backend.';
  }
  if (/relation .* does not exist/i.test(message)) {
    return 'Estrutura do banco ainda não existe. Rode npm run db:setup no backend.';
  }
  return message;
}

export async function registerTenantAdmin(payload) {
  await ensureBaseSchema();

  const tenantName = sanitizeText(payload.tenantName);
  const brandName = sanitizeText(payload.brandName);
  const fullName = sanitizeText(payload.fullName);
  const email = sanitizeText(payload.email).toLowerCase();
  const password = String(payload.password || '').trim();

  if (!tenantName || !fullName || !email || !password) {
    throw new Error('Preencha nome do pet shop, nome do responsável, e-mail e senha.');
  }

  if (password.length < 6) {
    throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  }

  const existingUser = await query('select id from tenant_users where email = $1 limit 1', [email]);
  if (existingUser.rows.length) {
    throw new Error('Já existe um assinante com este e-mail.');
  }

  const slug = await ensureUniqueSlug(buildSlug(brandName || tenantName));
  const passwordHash = await bcrypt.hash(password, 10);

  const tenantResult = await query(
    `insert into tenants (name, slug, brand_name)
     values ($1, $2, $3)
     returning id, name, slug, brand_name, status, created_at`,
    [tenantName, slug, brandName || tenantName]
  );

  const tenant = tenantResult.rows[0];

  const userResult = await query(
    `insert into tenant_users (tenant_id, full_name, email, password_hash, role)
     values ($1, $2, $3, $4, 'owner')
     returning id, tenant_id, full_name, email, role`,
    [tenant.id, fullName, email, passwordHash]
  );

  const user = userResult.rows[0];
  const token = signToken(user);

  return { token, tenant, user };
}

export async function loginTenantAdmin({ email, password }) {
  await ensureBaseSchema();

  const normalizedEmail = sanitizeText(email).toLowerCase();
  const normalizedPassword = String(password || '').trim();

  if (!normalizedEmail || !normalizedPassword) {
    throw new Error('Informe e-mail e senha.');
  }

  const result = await query(
    `select u.id, u.tenant_id, u.full_name, u.email, u.role, u.password_hash, u.is_active,
            t.name as tenant_name, t.slug, t.brand_name, t.status,
            t.logo_url, t.favicon_url, t.primary_color, t.secondary_color, t.accent_color,
            t.custom_domain, t.support_email, t.whatsapp_number, t.booking_url,
            s.meta_title, s.meta_description, s.login_title, s.login_subtitle,
            s.sidebar_title, s.sidebar_subtitle, s.surface_mode
     from tenant_users u
     join tenants t on t.id = u.tenant_id
     left join tenant_settings s on s.tenant_id = t.id
     where u.email = $1
     limit 1`,
    [normalizedEmail]
  );

  const user = result.rows[0];
  if (!user || !user.is_active) {
    throw new Error('E-mail ou senha inválidos.');
  }

  const passwordMatches = await bcrypt.compare(normalizedPassword, user.password_hash);
  if (!passwordMatches) {
    throw new Error('E-mail ou senha inválidos.');
  }

  const token = signToken(user);

  return {
    token,
    tenant: {
      id: user.tenant_id,
      name: user.tenant_name,
      slug: user.slug,
      brand_name: user.brand_name,
      status: user.status,
      logo_url: user.logo_url || '',
      favicon_url: user.favicon_url || '',
      primary_color: user.primary_color || '#1F8560',
      secondary_color: user.secondary_color || '#E67315',
      accent_color: user.accent_color || '#8F8866',
      custom_domain: user.custom_domain || '',
      support_email: user.support_email || '',
      whatsapp_number: user.whatsapp_number || '',
      booking_url: user.booking_url || ''
    },
    settings: {
      meta_title: user.meta_title || '',
      meta_description: user.meta_description || '',
      login_title: user.login_title || '',
      login_subtitle: user.login_subtitle || '',
      sidebar_title: user.sidebar_title || '',
      sidebar_subtitle: user.sidebar_subtitle || '',
      surface_mode: user.surface_mode || 'light'
    },
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role
    }
  };
}

export async function getCurrentTenantUser(userId) {
  await ensureBaseSchema();

  const result = await query(
    `select u.id, u.tenant_id, u.full_name, u.email, u.role,
            t.name as tenant_name, t.slug, t.brand_name, t.status,
            t.logo_url, t.favicon_url, t.primary_color, t.secondary_color, t.accent_color,
            t.custom_domain, t.support_email, t.whatsapp_number, t.booking_url,
            s.meta_title, s.meta_description, s.login_title, s.login_subtitle,
            s.sidebar_title, s.sidebar_subtitle, s.surface_mode
     from tenant_users u
     join tenants t on t.id = u.tenant_id
     left join tenant_settings s on s.tenant_id = t.id
     where u.id = $1
     limit 1`,
    [userId]
  );

  const user = result.rows[0];
  if (!user) {
    throw new Error('Usuário não encontrado.');
  }

  return {
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role
    },
    tenant: {
      id: user.tenant_id,
      name: user.tenant_name,
      slug: user.slug,
      brand_name: user.brand_name,
      status: user.status,
      logo_url: user.logo_url || '',
      favicon_url: user.favicon_url || '',
      primary_color: user.primary_color || '#1F8560',
      secondary_color: user.secondary_color || '#E67315',
      accent_color: user.accent_color || '#8F8866',
      custom_domain: user.custom_domain || '',
      support_email: user.support_email || '',
      whatsapp_number: user.whatsapp_number || '',
      booking_url: user.booking_url || ''
    },
    settings: {
      meta_title: user.meta_title || '',
      meta_description: user.meta_description || '',
      login_title: user.login_title || '',
      login_subtitle: user.login_subtitle || '',
      sidebar_title: user.sidebar_title || '',
      sidebar_subtitle: user.sidebar_subtitle || '',
      surface_mode: user.surface_mode || 'light'
    }
  };
}

export { normalizePublicError };
