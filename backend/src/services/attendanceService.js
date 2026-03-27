import { query } from '../config/db.js';
import { ensureBaseSchema } from '../scripts/bootstrapDb.js';
import { ensureTutorSchema } from './tutorService.js';

function clean(value) {
  return String(value ?? '').trim();
}

function normalizeStatus(value) {
  const status = clean(value).toLowerCase();
  return ['pendente', 'em_andamento', 'finalizado', 'cancelado'].includes(status) ? status : 'pendente';
}

function normalizeChannel(value) {
  const channel = clean(value).toLowerCase();
  return ['presencial', 'whatsapp', 'telefone', 'site'].includes(channel) ? channel : 'presencial';
}

function normalizePriority(value) {
  const priority = clean(value).toLowerCase();
  return ['baixa', 'normal', 'alta'].includes(priority) ? priority : 'normal';
}

function toNumber(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function toIsoOrNull(value) {
  const raw = clean(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatMoney(value) {
  return Number(value || 0) / 100;
}

function mapRow(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    tutor_id: row.tutor_id || '',
    tutor_name: row.tutor_name || '',
    pet_name: row.pet_name || '',
    service_name: row.service_name || '',
    channel: row.channel || 'presencial',
    priority: row.priority || 'normal',
    status: row.status || 'pendente',
    assigned_to: row.assigned_to || '',
    scheduled_at: row.scheduled_at,
    notes: row.notes || '',
    amount_cents: Number(row.amount_cents || 0),
    amount: formatMoney(row.amount_cents),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function ensureAttendanceSchema() {
  await ensureBaseSchema();
  await ensureTutorSchema();

  await query(`
    create table if not exists tenant_attendances (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      tutor_id uuid references tenant_tutors(id) on delete set null,
      tutor_name varchar(180) not null,
      pet_name varchar(140),
      service_name varchar(160) not null,
      channel varchar(30) not null default 'presencial',
      priority varchar(20) not null default 'normal',
      status varchar(30) not null default 'pendente',
      assigned_to varchar(140),
      scheduled_at timestamptz,
      notes text,
      amount_cents integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_tenant_attendances_tenant on tenant_attendances(tenant_id);
    create index if not exists idx_tenant_attendances_status on tenant_attendances(tenant_id, status);
    create index if not exists idx_tenant_attendances_scheduled on tenant_attendances(tenant_id, scheduled_at desc);
  `);
}

async function seedIfEmpty(tenantId) {
  const countResult = await query('select count(*)::int as total from tenant_attendances where tenant_id = $1', [tenantId]);
  if (Number(countResult.rows[0]?.total || 0) > 0) return;

  const tutorsResult = await query(
    'select id, full_name from tenant_tutors where tenant_id = $1 order by created_at asc limit 3',
    [tenantId]
  );

  const seeds = [
    {
      tutor_id: tutorsResult.rows[0]?.id || null,
      tutor_name: tutorsResult.rows[0]?.full_name || 'Cliente balcão',
      pet_name: 'Thor',
      service_name: 'Banho + hidratação',
      channel: 'whatsapp',
      priority: 'alta',
      status: 'pendente',
      assigned_to: 'Recepção',
      scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      notes: 'Confirmar alergias antes do atendimento.',
      amount_cents: 8900
    },
    {
      tutor_id: tutorsResult.rows[1]?.id || null,
      tutor_name: tutorsResult.rows[1]?.full_name || 'Tutor recorrente',
      pet_name: 'Mel',
      service_name: 'Tosa higiênica',
      channel: 'presencial',
      priority: 'normal',
      status: 'em_andamento',
      assigned_to: 'Equipe banho',
      scheduled_at: new Date().toISOString(),
      notes: 'Cliente aguarda retorno até 17h.',
      amount_cents: 6500
    },
    {
      tutor_id: tutorsResult.rows[2]?.id || null,
      tutor_name: tutorsResult.rows[2]?.full_name || 'Lead site',
      pet_name: 'Luna',
      service_name: 'Consulta de avaliação',
      channel: 'site',
      priority: 'baixa',
      status: 'finalizado',
      assigned_to: 'Atendimento',
      scheduled_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      notes: 'Primeiro atendimento concluído com sucesso.',
      amount_cents: 5000
    }
  ];

  for (const item of seeds) {
    await query(
      `insert into tenant_attendances (
        tenant_id, tutor_id, tutor_name, pet_name, service_name, channel, priority, status,
        assigned_to, scheduled_at, notes, amount_cents
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        tenantId,
        item.tutor_id,
        item.tutor_name,
        item.pet_name,
        item.service_name,
        item.channel,
        item.priority,
        item.status,
        item.assigned_to,
        item.scheduled_at,
        item.notes,
        item.amount_cents
      ]
    );
  }
}

export async function listAttendances(tenantId, filters = {}) {
  await ensureAttendanceSchema();
  await seedIfEmpty(tenantId);

  const search = clean(filters.search);
  const status = normalizeStatus(filters.status || 'pendente') === 'pendente' && clean(filters.status) === 'all' ? 'all' : clean(filters.status || 'all');
  const values = [tenantId];
  const conditions = ['tenant_id = $1'];

  if (status && status !== 'all') {
    values.push(normalizeStatus(status));
    conditions.push(`status = $${values.length}`);
  }

  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(
      tutor_name ilike $${values.length}
      or coalesce(pet_name, '') ilike $${values.length}
      or service_name ilike $${values.length}
      or coalesce(assigned_to, '') ilike $${values.length}
    )`);
  }

  const result = await query(
    `select *
       from tenant_attendances
      where ${conditions.join(' and ')}
      order by
        case status
          when 'em_andamento' then 0
          when 'pendente' then 1
          when 'finalizado' then 2
          else 3
        end,
        coalesce(scheduled_at, created_at) desc,
        created_at desc`,
    values
  );

  return result.rows.map(mapRow);
}

export async function getAttendanceSummary(tenantId) {
  await ensureAttendanceSchema();
  await seedIfEmpty(tenantId);
  const result = await query(
    `select
      count(*)::int as total,
      count(*) filter (where status = 'pendente')::int as pendente,
      count(*) filter (where status = 'em_andamento')::int as em_andamento,
      count(*) filter (where status = 'finalizado')::int as finalizado,
      coalesce(sum(amount_cents) filter (where status = 'finalizado'), 0)::int as faturado_cents
     from tenant_attendances
     where tenant_id = $1`,
    [tenantId]
  );
  return result.rows[0];
}

export async function createAttendance(tenantId, payload) {
  await ensureAttendanceSchema();
  const tutorName = clean(payload.tutor_name || payload.tutorName);
  const serviceName = clean(payload.service_name || payload.serviceName);
  if (!tutorName) throw new Error('Informe o nome do cliente no atendimento.');
  if (!serviceName) throw new Error('Informe o serviço do atendimento.');

  const tutorId = clean(payload.tutor_id || payload.tutorId) || null;
  const result = await query(
    `insert into tenant_attendances (
      tenant_id, tutor_id, tutor_name, pet_name, service_name, channel, priority, status,
      assigned_to, scheduled_at, notes, amount_cents
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    returning *`,
    [
      tenantId,
      tutorId,
      tutorName,
      clean(payload.pet_name || payload.petName),
      serviceName,
      normalizeChannel(payload.channel),
      normalizePriority(payload.priority),
      normalizeStatus(payload.status),
      clean(payload.assigned_to || payload.assignedTo),
      toIsoOrNull(payload.scheduled_at || payload.scheduledAt),
      clean(payload.notes),
      Math.round(toNumber(payload.amount) * 100)
    ]
  );
  return mapRow(result.rows[0]);
}

export async function updateAttendance(tenantId, attendanceId, payload) {
  await ensureAttendanceSchema();
  const tutorName = clean(payload.tutor_name || payload.tutorName);
  const serviceName = clean(payload.service_name || payload.serviceName);
  if (!tutorName) throw new Error('Informe o nome do cliente no atendimento.');
  if (!serviceName) throw new Error('Informe o serviço do atendimento.');

  const result = await query(
    `update tenant_attendances
        set tutor_id = $3,
            tutor_name = $4,
            pet_name = $5,
            service_name = $6,
            channel = $7,
            priority = $8,
            status = $9,
            assigned_to = $10,
            scheduled_at = $11,
            notes = $12,
            amount_cents = $13,
            updated_at = now()
      where tenant_id = $1 and id = $2
      returning *`,
    [
      tenantId,
      attendanceId,
      clean(payload.tutor_id || payload.tutorId) || null,
      tutorName,
      clean(payload.pet_name || payload.petName),
      serviceName,
      normalizeChannel(payload.channel),
      normalizePriority(payload.priority),
      normalizeStatus(payload.status),
      clean(payload.assigned_to || payload.assignedTo),
      toIsoOrNull(payload.scheduled_at || payload.scheduledAt),
      clean(payload.notes),
      Math.round(toNumber(payload.amount) * 100)
    ]
  );

  if (!result.rows.length) throw new Error('Atendimento não encontrado.');
  return mapRow(result.rows[0]);
}

export async function deleteAttendance(tenantId, attendanceId) {
  await ensureAttendanceSchema();
  const result = await query('delete from tenant_attendances where tenant_id = $1 and id = $2 returning id', [tenantId, attendanceId]);
  if (!result.rows.length) throw new Error('Atendimento não encontrado.');
  return { id: attendanceId };
}
