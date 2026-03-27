import { query } from '../config/db.js';
import { ensureBaseSchema } from '../scripts/bootstrapDb.js';

function clean(value) {
  return String(value ?? '').trim();
}

function mapRow(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    favorite_part: row.favorite_part || '',
    improvement_suggestions: row.improvement_suggestions || '',
    created_by_user_id: row.created_by_user_id || '',
    created_by_name: row.created_by_name || '',
    created_by_email: row.created_by_email || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function ensureSupportSchema() {
  await ensureBaseSchema();
  await query(`
    create table if not exists tenant_support_feedback (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      created_by_user_id uuid references tenant_users(id) on delete set null,
      created_by_name varchar(160),
      created_by_email varchar(160),
      favorite_part text not null default '',
      improvement_suggestions text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_tenant_support_feedback_tenant on tenant_support_feedback(tenant_id, created_at desc);
  `);
}

export async function getSupportPageData(tenantId) {
  await ensureSupportSchema();

  const [feedbackResult, tenantResult] = await Promise.all([
    query(
      `select *
         from tenant_support_feedback
        where tenant_id = $1
        order by created_at desc
        limit 1`,
      [tenantId]
    ),
    query(
      `select support_email, whatsapp_number, brand_name, name
         from tenants
        where id = $1
        limit 1`,
      [tenantId]
    )
  ]);

  return {
    feedback: feedbackResult.rows[0] ? mapRow(feedbackResult.rows[0]) : null,
    channels: {
      email: tenantResult.rows[0]?.support_email || '',
      whatsapp: tenantResult.rows[0]?.whatsapp_number || '',
      youtube: 'https://www.youtube.com/'
    },
    brand_name: tenantResult.rows[0]?.brand_name || tenantResult.rows[0]?.name || 'LoopinPet',
    version: 'Versão 1.51.3251'
  };
}

export async function saveSupportFeedback(tenantId, user, payload) {
  await ensureSupportSchema();

  const favoritePart = clean(payload.favorite_part || payload.favoritePart);
  const improvementSuggestions = clean(payload.improvement_suggestions || payload.improvementSuggestions);

  if (!favoritePart) {
    throw new Error('Conte-nos o que você mais gosta no sistema.');
  }

  if (!improvementSuggestions) {
    throw new Error('Descreva suas sugestões para melhorar o sistema.');
  }

  const existing = await query(
    `select id from tenant_support_feedback
      where tenant_id = $1 and created_by_user_id = $2
      order by created_at desc
      limit 1`,
    [tenantId, user.sub]
  );

  if (existing.rows[0]?.id) {
    const updated = await query(
      `update tenant_support_feedback
          set favorite_part = $3,
              improvement_suggestions = $4,
              created_by_name = $5,
              created_by_email = $6,
              updated_at = now()
        where tenant_id = $1
          and created_by_user_id = $2
      returning *`,
      [tenantId, user.sub, favoritePart, improvementSuggestions, user.fullName || '', user.email || '']
    );
    return mapRow(updated.rows[0]);
  }

  const inserted = await query(
    `insert into tenant_support_feedback (
      tenant_id, created_by_user_id, created_by_name, created_by_email, favorite_part, improvement_suggestions
    ) values ($1,$2,$3,$4,$5,$6)
    returning *`,
    [tenantId, user.sub, user.fullName || '', user.email || '', favoritePart, improvementSuggestions]
  );

  return mapRow(inserted.rows[0]);
}
