import bcrypt from 'bcrypt';
import { query } from '../config/db.js';
import { ensureBaseSchema } from '../scripts/bootstrapDb.js';
import { ensureTutorSchema } from './tutorService.js';

function clean(value) {
  return String(value ?? '').trim();
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true' || value === 1 || value === '1' || value === 'on';
}

function toMoneyCents(value) {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function toIsoOrNull(value) {
  const raw = clean(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const [, year, month, day, hour, minute, second = '00'] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), 0);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeStatus(value, allowed, fallback) {
  const status = clean(value).toLowerCase();
  return allowed.includes(status) ? status : fallback;
}

function normalizeSlug(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}


function normalizeStatusCode(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const CANONICAL_SESSION_FLOW = [
  'agendado',
  'confirmado',
  'check_in',
  'em_execucao',
  'pronto_para_retirada',
  'concluido'
];

const SESSION_STATUS_ALIASES = {
  checkin: 'check_in',
  check_in: 'check_in',
  em_andamento: 'em_execucao',
  em_execucao: 'em_execucao',
  pronto_retirada: 'pronto_para_retirada',
  pronto_para_retirada: 'pronto_para_retirada',
  concluido: 'concluido'
};

function canonicalStatusCode(value) {
  const code = normalizeStatusCode(value);
  return SESSION_STATUS_ALIASES[code] || code || 'agendado';
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
}

function makeTicketCode() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `CMD-${stamp}-${rand}`;
}

async function getSessionStatusMap(tenantId) {
  await seedSessionStatuses(tenantId);
  const result = await query('select name, color, position from tenant_session_statuses where tenant_id = $1 and is_active = true order by position asc, name asc', [tenantId]);
  const map = new Map();
  for (const row of result.rows) {
    map.set(canonicalStatusCode(row.name), { name: row.name, color: row.color, position: Number(row.position || 0) });
  }
  return map;
}

function formatAgendaRow(row, statusMap = new Map()) {
  if (!row) return null;
  const statusInfo = statusMap.get(canonicalStatusCode(row.status)) || null;
  return {
    ...row,
    pets: parseJsonArray(row.pets_json),
    services: parseJsonArray(row.services_json),
    ticket_code: row.ticket_code || '',
    hour: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date(row.scheduled_at)),
    date: new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(row.scheduled_at)),
    staff: row.staff_name,
    pet: row.pet_name,
    tutor: row.tutor_name,
    phone: row.phone || '',
    service: row.service_name,
    unit: row.unit_name || 'Unidade Centro',
    breed: row.breed || '',
    size: row.size || '',
    notes: row.notes || '',
    payment_status: row.payment_status || 'pendente',
    payment_method: row.payment_method || '',
    status_label: statusInfo?.name || row.status,
    status_color: statusInfo?.color || null,
    receipt_ready: Boolean(statusInfo && statusInfo.position >= 6) || canonicalStatusCode(row.status) === 'concluido',
    booking_origin: row.booking_origin || 'avulso',
    customer_package_id: row.customer_package_id || null,
    package_name: row.package_name || '',
    package_session_number: Number(row.package_session_number || 0),
    package_session_total: Number(row.package_session_total || 0),
    is_last_package_session: Boolean(row.is_last_package_session),
    package_discount_percent: Number(row.package_discount_percent || 0),
    package_total_without_discount_cents: Number(row.package_total_without_discount_cents || 0),
    package_total_with_discount_cents: Number(row.package_total_with_discount_cents || 0),
    package_snapshot_json: row.package_snapshot_json || {}
  };
}

async function validateAgendaScheduling(tenantId, scheduledAt, excludeAgendaId = null) {
  const raw = clean(scheduledAt);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  const when = new Date(raw);
  if (!match || Number.isNaN(when.getTime())) throw new Error('Data do agendamento inválida.');
  const [, year, month, day, hour, minute] = match;
  const localDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
  const dow = localDate.getDay();
  const time = `${hour}:${minute}`;
  const hourKey = `${hour}:00`;
  const hourStart = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), 0, 0, 0);
  const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

  const hoursResult = await query(
    `select dow, is_closed, open_time, close_time, slot_capacity
       from tenant_operating_hours
      where tenant_id = $1 and dow = $2
      limit 1`,
    [tenantId, dow]
  );
  const row = hoursResult.rows[0];
  if (!row) throw new Error('Configure o horário de funcionamento antes de agendar.');
  if (row.is_closed) throw new Error('O estabelecimento está fechado neste dia.');
  const openTime = String(row.open_time || '00:00').slice(0,5);
  const closeTime = String(row.close_time || '23:59').slice(0,5);
  if (time < openTime || time >= closeTime) {
    throw new Error('O agendamento precisa respeitar o horário de funcionamento configurado.');
  }
  const params = [tenantId, hourStart.toISOString(), hourEnd.toISOString()];
  let sql = `select count(*)::int as total from tenant_agenda_items where tenant_id = $1 and scheduled_at >= $2 and scheduled_at < $3`;
  if (excludeAgendaId) {
    params.push(excludeAgendaId);
    sql += ` and id <> $4`;
  }
  const count = await query(sql, params);
  const capacity = Number(row.slot_capacity || 0);
  if (capacity > 0 && Number(count.rows[0]?.total || 0) >= capacity) {
    throw new Error('O slot máximo de agendamentos por hora já foi atingido para este horário.');
  }
}

function normalizeAgendaPayload(payload) {
  const pets = parseJsonArray(payload.pets || payload.pet_items || payload.petItems).map((item) => ({
    id: clean(item.id || item.pet_id || item.petId),
    name: clean(item.name || item.pet_name || item.petName),
    breed: clean(item.breed),
    size: clean(item.size),
    size_id: clean(item.size_id || item.sizeId)
  })).filter((item) => item.name);

  const services = parseJsonArray(payload.services || payload.service_items || payload.serviceItems).map((item) => ({
    id: clean(item.id || item.service_id || item.serviceId),
    name: clean(item.name || item.service_name || item.serviceName),
    category: clean(item.category),
    pet_size_id: clean(item.pet_size_id || item.petSizeId),
    pet_size_label: clean(item.pet_size_label || item.petSizeLabel),
    price_cents: Number(item.price_cents || item.priceCents || 0),
    duration_minutes: Number(item.duration_minutes || item.durationMinutes || 0)
  })).filter((item) => item.name);

  const tutorName = clean(payload.tutor_name || payload.tutorName || payload.client_name || payload.clientName);
  const petName = clean(payload.pet_name || payload.petName || pets[0]?.name);
  const serviceName = clean(payload.service_name || payload.serviceName || services.map((item) => item.name).join(' • '));
  const scheduledAt = toIsoOrNull(payload.scheduled_at || payload.scheduledAt);
  const statusCode = canonicalStatusCode(payload.status || 'agendado') || 'agendado';
  return {
    tutor_id: clean(payload.tutor_id || payload.tutorId) || null,
    staff_user_id: clean(payload.staff_user_id || payload.staffUserId) || null,
    pet_id: clean(payload.pet_id || payload.petId || pets[0]?.id) || null,
    service_id: clean(payload.service_id || payload.serviceId || services[0]?.id) || null,
    tutor_name: tutorName,
    pet_name: petName,
    service_name: serviceName,
    staff_name: clean(payload.staff_name || payload.staffName),
    phone: clean(payload.phone || payload.whatsapp),
    scheduled_at: scheduledAt,
    scheduled_at_input: clean(payload.scheduled_at || payload.scheduledAt),
    status: statusCode,
    notes: clean(payload.notes),
    breed: clean(payload.breed || pets[0]?.breed),
    size: clean(payload.size || pets[0]?.size),
    unit_name: clean(payload.unit_name || payload.unitName) || 'Unidade Centro',
    payment_status: normalizeStatus(clean(payload.payment_status || payload.paymentStatus), ['pendente','pago'], 'pendente'),
    payment_method: clean(payload.payment_method || payload.paymentMethod),
    booking_origin: clean(payload.booking_origin || payload.bookingOrigin) || 'avulso',
    customer_package_id: clean(payload.customer_package_id || payload.customerPackageId) || null,
    package_name: clean(payload.package_name || payload.packageName),
    package_session_number: Math.max(0, Number(payload.package_session_number || payload.packageSessionNumber || 0) || 0),
    package_session_total: Math.max(0, Number(payload.package_session_total || payload.packageSessionTotal || 0) || 0),
    is_last_package_session: Boolean(payload.is_last_package_session || payload.isLastPackageSession),
    package_discount_percent: Number(payload.package_discount_percent || payload.packageDiscountPercent || 0) || 0,
    package_total_without_discount_cents: Number(payload.package_total_without_discount_cents || payload.packageTotalWithoutDiscountCents || 0) || 0,
    package_total_with_discount_cents: Number(payload.package_total_with_discount_cents || payload.packageTotalWithDiscountCents || 0) || 0,
    package_snapshot_json: JSON.stringify(payload.package_snapshot_json || payload.packageSnapshotJson || {}),
    pets_json: JSON.stringify(pets),
    services_json: JSON.stringify(services)
  };
}

const SERVICE_META_KINDS = {
  service_categories: { table: 'tenant_service_categories', label: 'categoria' }
};

function resolveServiceMetaKind(kind) {
  const meta = SERVICE_META_KINDS[String(kind || '')];
  if (!meta) throw new Error('Cadastro auxiliar de serviço inválido.');
  return meta;
}

const PET_META_KINDS = {
  pet_types: { table: 'tenant_pet_types', label: 'tipo de pet' },
  pet_sizes: { table: 'tenant_pet_sizes', label: 'porte' },
  pet_breeds: { table: 'tenant_pet_breeds', label: 'raça' },
  pet_preferences: { table: 'tenant_pet_preferences', label: 'preferência' }
};

function resolvePetMetaKind(kind) {
  const meta = PET_META_KINDS[String(kind || '')];
  if (!meta) throw new Error('Cadastro auxiliar inválido.');
  return meta;
}

export async function ensureManagementSchema() {
  await ensureBaseSchema();
  await ensureTutorSchema();

  await query(`
    create table if not exists tenant_roles (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name varchar(120) not null,
      description text,
      permissions jsonb not null default '[]'::jsonb,
      is_active boolean not null default true,
      is_system boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, name)
    );

    create table if not exists tenant_permissions (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name varchar(120) not null,
      code varchar(140) not null,
      description text,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, name),
      unique (tenant_id, code)
    );

    create table if not exists tenant_services (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name varchar(160) not null,
      category varchar(120),
      duration_minutes integer not null default 60,
      price_cents integer not null default 0,
      status varchar(20) not null default 'ativo',
      description text,
      pet_size_id uuid references tenant_pet_sizes(id) on delete set null,
      pet_size_label varchar(120),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, name)
    );

    create table if not exists tenant_agenda_items (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      tutor_id uuid references tenant_tutors(id) on delete set null,
      pet_id uuid references tenant_pets(id) on delete set null,
      service_id uuid references tenant_services(id) on delete set null,
      tutor_name varchar(180) not null,
      pet_name varchar(140) not null,
      service_name varchar(160) not null,
      staff_name varchar(140),
      phone varchar(40),
      scheduled_at timestamptz not null,
      status varchar(30) not null default 'pendente',
      notes text,
      breed varchar(120),
      size varchar(40),
      unit_name varchar(120),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists tenant_pet_types (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name varchar(120) not null,
      slug varchar(140),
      description text,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, name)
    );

    create table if not exists tenant_pet_sizes (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name varchar(120) not null,
      slug varchar(140),
      description text,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, name)
    );

    create table if not exists tenant_pet_breeds (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      pet_type_id uuid references tenant_pet_types(id) on delete set null,
      name varchar(120) not null,
      slug varchar(140),
      description text,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, name)
    );

    create table if not exists tenant_pet_preferences (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name varchar(120) not null,
      slug varchar(140),
      description text,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, name)
    );

    create table if not exists tenant_service_categories (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name varchar(120) not null,
      slug varchar(140),
      description text,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, name)
    );

    create table if not exists tenant_session_statuses (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name varchar(120) not null,
      description text,
      color varchar(20) not null default '#1F8560',
      position integer not null default 0,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, name)
    );

    alter table tenant_roles add column if not exists is_active boolean not null default true;

    alter table tenant_pets add column if not exists pet_type_id uuid references tenant_pet_types(id) on delete set null;
    alter table tenant_pets add column if not exists breed_id uuid references tenant_pet_breeds(id) on delete set null;
    alter table tenant_pets add column if not exists size_id uuid references tenant_pet_sizes(id) on delete set null;
    alter table tenant_pets add column if not exists birth_date varchar(20);
    alter table tenant_pets add column if not exists preference_ids jsonb not null default '[]'::jsonb;

    alter table tenant_services add column if not exists pet_size_id uuid references tenant_pet_sizes(id) on delete set null;
    alter table tenant_services add column if not exists pet_size_label varchar(120);
    alter table tenant_users add column if not exists photo_url text;

    create index if not exists idx_roles_tenant on tenant_roles(tenant_id);
    create index if not exists idx_permissions_tenant on tenant_permissions(tenant_id);
    create index if not exists idx_services_tenant on tenant_services(tenant_id);
    create index if not exists idx_agenda_tenant_time on tenant_agenda_items(tenant_id, scheduled_at);


    alter table tenant_agenda_items add column if not exists pets_json jsonb not null default '[]'::jsonb;
    alter table tenant_agenda_items add column if not exists services_json jsonb not null default '[]'::jsonb;
    alter table tenant_agenda_items add column if not exists ticket_code varchar(40);
    alter table tenant_agenda_items add column if not exists receipt_generated_at timestamptz;
    alter table tenant_agenda_items add column if not exists payment_status varchar(20) not null default 'pendente';
    alter table tenant_agenda_items add column if not exists payment_method varchar(30);
    alter table tenant_agenda_items add column if not exists staff_user_id uuid references tenant_users(id) on delete set null;
    alter table tenant_agenda_items add column if not exists booking_origin varchar(20) not null default 'avulso';
    alter table tenant_agenda_items add column if not exists customer_package_id uuid references tenant_customer_packages(id) on delete set null;
    alter table tenant_agenda_items add column if not exists package_name varchar(160);
    alter table tenant_agenda_items add column if not exists package_session_number integer not null default 0;
    alter table tenant_agenda_items add column if not exists package_session_total integer not null default 0;
    alter table tenant_agenda_items add column if not exists is_last_package_session boolean not null default false;
    alter table tenant_agenda_items add column if not exists package_discount_percent numeric(6,2) not null default 0;
    alter table tenant_agenda_items add column if not exists package_total_without_discount_cents integer not null default 0;
    alter table tenant_agenda_items add column if not exists package_total_with_discount_cents integer not null default 0;
    alter table tenant_agenda_items add column if not exists package_snapshot_json jsonb not null default '{}'::jsonb;
    create index if not exists idx_pet_types_tenant on tenant_pet_types(tenant_id);
    create index if not exists idx_pet_sizes_tenant on tenant_pet_sizes(tenant_id);
    create index if not exists idx_pet_breeds_tenant on tenant_pet_breeds(tenant_id);
    create index if not exists idx_pet_preferences_tenant on tenant_pet_preferences(tenant_id);
    create index if not exists idx_service_categories_tenant on tenant_service_categories(tenant_id);
    create index if not exists idx_session_statuses_tenant on tenant_session_statuses(tenant_id, position);
  `);
}


async function seedRoles(tenantId) {
  await seedPermissions(tenantId);
  const count = await query('select count(*)::int as total from tenant_roles where tenant_id = $1', [tenantId]);
  if (Number(count.rows[0]?.total || 0) > 0) return;
  const roles = [
    ['Administrador', 'Acesso completo ao ambiente.', ['dashboard','agenda','atendimento','clientes','pets','services','financeiro','configuracoes','usuarios','roles']],
    ['Operação', 'Equipe operacional da unidade.', ['dashboard','agenda','atendimento','clientes','pets','services']],
    ['Financeiro', 'Controle financeiro e assinatura.', ['dashboard','financeiro','configuracoes']]
  ];
  for (const [name, description, permissions] of roles) {
    await query(
      'insert into tenant_roles (tenant_id, name, description, permissions, is_system) values ($1,$2,$3,$4,true) on conflict do nothing',
      [tenantId, name, description, JSON.stringify(permissions)]
    );
  }
}


async function seedPermissions(tenantId) {
  const count = await query('select count(*)::int as total from tenant_permissions where tenant_id = $1', [tenantId]);
  if (Number(count.rows[0]?.total || 0) > 0) return;
  const items = [
    ['Dashboard', 'dashboard', 'Acesso à visão geral e indicadores.'],
    ['Agenda', 'agenda', 'Gerenciar agenda, check-in e agendamentos.'],
    ['Atendimento', 'atendimento', 'Operar atendimentos e fila operacional.'],
    ['Clientes', 'clientes', 'Gerenciar clientes e histórico.'],
    ['Pets', 'pets', 'Gerenciar pets e cadastros auxiliares.'],
    ['Serviços', 'services', 'Gerenciar catálogo de serviços e categorias.'],
    ['Financeiro', 'financeiro', 'Acesso ao financeiro e cobranças.'],
    ['Configurações', 'configuracoes', 'Configurações gerais do ambiente.'],
    ['Usuários', 'usuarios', 'Gerenciar usuários do sistema.'],
    ['Cargos e Permissões', 'roles', 'Gerenciar cargos e permissões.'],
    ['Gerente IA', 'ai', 'Acesso ao módulo de inteligência.']
  ];
  for (const [name, code, description] of items) {
    await query(
      'insert into tenant_permissions (tenant_id, name, code, description, is_active, updated_at) values ($1,$2,$3,$4,true, now()) on conflict do nothing',
      [tenantId, name, code, description]
    );
  }
}


export async function restoreDefaultPermissions(tenantId) {
  await ensureManagementSchema();
  const items = [
    ['Dashboard', 'dashboard', 'Acesso à visão geral e indicadores.'],
    ['Agenda', 'agenda', 'Gerenciar agenda, check-in e agendamentos.'],
    ['Atendimento', 'atendimento', 'Operar atendimentos e fila operacional.'],
    ['Clientes', 'clientes', 'Gerenciar clientes e histórico.'],
    ['Pets', 'pets', 'Gerenciar pets e cadastros auxiliares.'],
    ['Serviços', 'services', 'Gerenciar catálogo de serviços e categorias.'],
    ['Financeiro', 'financeiro', 'Acesso ao financeiro e cobranças.'],
    ['Configurações', 'configuracoes', 'Configurações gerais do ambiente.'],
    ['Usuários', 'usuarios', 'Gerenciar usuários do sistema.'],
    ['Cargos e Permissões', 'roles', 'Gerenciar cargos e permissões.'],
    ['Gerente IA', 'ai', 'Acesso ao módulo de inteligência.']
  ];
  for (const [name, code, description] of items) {
    await query(
      `insert into tenant_permissions (tenant_id, name, code, description, is_active, updated_at)
       values ($1,$2,$3,$4,true, now())
       on conflict (tenant_id, code)
       do update set name = excluded.name,
                     description = excluded.description,
                     is_active = true,
                     updated_at = now()`,
      [tenantId, name, code, description]
    );
  }
  const result = await query('select * from tenant_permissions where tenant_id = $1 order by name asc', [tenantId]);
  return result.rows.map((row) => ({ ...row, is_active: Boolean(row.is_active) }));
}

async function seedServices(tenantId) {
  const count = await query('select count(*)::int as total from tenant_services where tenant_id = $1', [tenantId]);
  if (Number(count.rows[0]?.total || 0) > 0) return;
  const services = [
    ['Banho', 'Banho & Tosa', 60, 55],
    ['Banho e Tosa', 'Banho & Tosa', 90, 85],
    ['Hidratação', 'Estética', 40, 35],
    ['Day Care', 'Hospedagem', 480, 120]
  ];
  for (const [name, category, minutes, price] of services) {
    await query(
      'insert into tenant_services (tenant_id, name, category, duration_minutes, price_cents, status) values ($1,$2,$3,$4,$5,$6) on conflict do nothing',
      [tenantId, name, category, minutes, price * 100, 'ativo']
    );
  }
}

async function seedServiceCategories(tenantId) {
  const count = await query('select count(*)::int as total from tenant_service_categories where tenant_id = $1', [tenantId]);
  if (Number(count.rows[0]?.total || 0) > 0) return;
  const items = [
    ['Banho & Tosa', 'Serviços de banho, tosa e higiene.'],
    ['Estética', 'Hidratação, desembolo e embelezamento.'],
    ['Hospedagem', 'Serviços recorrentes, day care e estadia.'],
    ['Veterinária', 'Consultas, vacinação e exames.']
  ];
  for (const [name, description] of items) {
    await query(
      'insert into tenant_service_categories (tenant_id, name, slug, description, is_active, updated_at) values ($1,$2,$3,$4,true, now()) on conflict do nothing',
      [tenantId, name, normalizeSlug(name), description]
    );
  }
}

async function seedSessionStatuses(tenantId) {
  const count = await query('select count(*)::int as total from tenant_session_statuses where tenant_id = $1', [tenantId]);
  if (Number(count.rows[0]?.total || 0) > 0) return;
  const items = [
    ['Agendado', 'Sessão criada e aguardando confirmação.', '#8F8866'],
    ['Confirmado', 'Sessão confirmada com o tutor.', '#1F8560'],
    ['Check-in', 'Pet recebido pela operação.', '#0EA5E9'],
    ['Em execução', 'Serviço em andamento.', '#E67315'],
    ['Pronto para retirada', 'Serviço finalizado aguardando retirada.', '#A855F7'],
    ['Concluído', 'Sessão concluída com sucesso.', '#16A34A']
  ];
  for (const [index, [name, description, color]] of items.entries()) {
    await query(
      'insert into tenant_session_statuses (tenant_id, name, description, color, position, is_active, updated_at) values ($1,$2,$3,$4,$5,true, now()) on conflict do nothing',
      [tenantId, name, description, color, index + 1]
    );
  }
}

async function syncTenantSessionStatusesToDefaultFlow(tenantId) {
  await seedSessionStatuses(tenantId);
  const defaults = [
    ['Agendado', 'Sessão criada e aguardando confirmação.', '#8F8866'],
    ['Confirmado', 'Sessão confirmada com o tutor.', '#1F8560'],
    ['Check-in', 'Pet recebido pela operação.', '#0EA5E9'],
    ['Em execução', 'Serviço em andamento.', '#E67315'],
    ['Pronto para retirada', 'Serviço finalizado aguardando retirada.', '#A855F7'],
    ['Concluído', 'Sessão concluída com sucesso.', '#16A34A']
  ];
  for (const [index, [name, description, color]] of defaults.entries()) {
    await query(
      `insert into tenant_session_statuses (tenant_id, name, description, color, position, is_active, updated_at)
       values ($1,$2,$3,$4,$5,true, now())
       on conflict (tenant_id, name)
       do update set description = excluded.description,
                     color = excluded.color,
                     position = excluded.position,
                     is_active = true,
                     updated_at = now()`,
      [tenantId, name, description, color, index + 1]
    );
  }
}

async function seedAgenda(tenantId) {
  const count = await query('select count(*)::int as total from tenant_agenda_items where tenant_id = $1', [tenantId]);
  if (Number(count.rows[0]?.total || 0) > 0) return;
  await seedServices(tenantId);
  const tutors = await query(
    `select t.id as tutor_id, t.full_name, t.phone, p.id as pet_id, p.name as pet_name, p.breed, p.size
       from tenant_tutors t
       left join lateral (
         select * from tenant_pets p
          where p.tenant_id = t.tenant_id and p.tutor_id = t.id
          order by p.created_at asc
          limit 1
       ) p on true
      where t.tenant_id = $1
      order by t.created_at asc
      limit 4`,
    [tenantId]
  );
  const services = await query('select * from tenant_services where tenant_id = $1 order by created_at asc limit 4', [tenantId]);
  const base = new Date();
  base.setMinutes(0, 0, 0);
  if (base.getHours() < 8) base.setHours(8);
  const seeds = Array.from({ length: 4 }, (_, index) => {
    const tutor = tutors.rows[index] || tutors.rows[0] || {};
    const service = services.rows[index] || services.rows[0] || {};
    const scheduled = new Date(base.getTime() + (index + 1) * 60 * 60 * 1000);
    return {
      tutor_id: tutor.tutor_id || null,
      pet_id: tutor.pet_id || null,
      tutor_name: tutor.full_name || `Tutor ${index + 1}`,
      pet_name: tutor.pet_name || `Pet ${index + 1}`,
      service_id: service.id || null,
      service_name: service.name || 'Banho',
      staff_name: ['João', 'Maria', 'Patrícia', 'Equipe'][index] || 'Equipe',
      phone: tutor.phone || '',
      scheduled_at: scheduled.toISOString(),
      status: ['confirmado', 'pendente', 'checkin', 'concluido'][index] || 'pendente',
      notes: 'Atendimento gerado para inicializar a agenda do ambiente.',
      breed: tutor.breed || '',
      size: tutor.size || '',
      unit_name: 'Unidade Centro'
    };
  });
  for (const item of seeds) {
    await query(
      `insert into tenant_agenda_items (
        tenant_id, tutor_id, pet_id, service_id, tutor_name, pet_name, service_name, staff_name,
        phone, scheduled_at, status, notes, breed, size, unit_name
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [tenantId, item.tutor_id, item.pet_id, item.service_id, item.tutor_name, item.pet_name, item.service_name, item.staff_name, item.phone, item.scheduled_at, item.status, item.notes, item.breed, item.size, item.unit_name]
    );
  }
}


async function seedPetMeta(tenantId) {
  const groups = [
    { table: 'tenant_pet_types', items: [['Canino', 'Cães'], ['Felino', 'Gatos'], ['Ave', 'Pássaros']] },
    { table: 'tenant_pet_sizes', items: [['Pequeno', 'Até 10kg'], ['Médio', '11kg até 25kg'], ['Grande', 'Acima de 25kg']] },
    { table: 'tenant_pet_preferences', items: [['Banho calmo', 'Prefere atendimento tranquilo'], ['Sem secador forte', 'Sensível a barulho'], ['Petisco permitido', 'Pode receber petiscos']] }
  ];
  for (const group of groups) {
    const count = await query(`select count(*)::int as total from ${group.table} where tenant_id = $1`, [tenantId]);
    if (Number(count.rows[0]?.total || 0) > 0) continue;
    for (const [name, description] of group.items) {
      await query(`insert into ${group.table} (tenant_id, name, slug, description, is_active, updated_at) values ($1,$2,$3,$4,true, now()) on conflict do nothing`, [tenantId, name, normalizeSlug(name), description]);
    }
  }
  const breedCount = await query('select count(*)::int as total from tenant_pet_breeds where tenant_id = $1', [tenantId]);
  if (Number(breedCount.rows[0]?.total || 0) === 0) {
    const types = await query('select id, name from tenant_pet_types where tenant_id = $1 order by name asc', [tenantId]);
    const typeMap = { canino: null, felino: null, ave: null };
    for (const row of types.rows) {
      const slug = normalizeSlug(row.name);
      if (Object.prototype.hasOwnProperty.call(typeMap, slug)) typeMap[slug] = row.id;
    }
    const breeds = [
      ['Shih Tzu', 'canino'], ['Lhasa Apso', 'canino'], ['Golden Retriever', 'canino'],
      ['Vira-lata', 'canino'], ['Persa', 'felino'], ['Siamês', 'felino'], ['SRD Felino', 'felino'],
      ['Calopsita', 'ave']
    ];
    for (const [name, kind] of breeds) {
      await query(
        'insert into tenant_pet_breeds (tenant_id, pet_type_id, name, slug, is_active, updated_at) values ($1,$2,$3,$4,true, now()) on conflict do nothing',
        [tenantId, typeMap[kind] || null, name, normalizeSlug(name)]
      );
    }
  }
}

export async function listPets(tenantId, filters = {}) {
  await ensureManagementSchema();
  await seedPetMeta(tenantId);
  const search = clean(filters.search);
  const values = [tenantId];
  const conditions = ['p.tenant_id = $1'];
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(
      p.name ilike $${values.length}
      or coalesce(pb.name, p.breed, '') ilike $${values.length}
      or coalesce(t.full_name, '') ilike $${values.length}
      or coalesce(pt.name, p.species, '') ilike $${values.length}
      or coalesce(ps.name, p.size, '') ilike $${values.length}
    )`);
  }
  const result = await query(
    `select p.*, t.full_name as tutor_name, t.phone as tutor_phone,
            pt.name as pet_type_name,
            pb.name as breed_name,
            ps.name as size_name,
            coalesce(pref.preference_names, ARRAY[]::text[]) as preference_names
       from tenant_pets p
       join tenant_tutors t on t.id = p.tutor_id and t.tenant_id = p.tenant_id
       left join tenant_pet_types pt on pt.id = p.pet_type_id and pt.tenant_id = p.tenant_id
       left join tenant_pet_breeds pb on pb.id = p.breed_id and pb.tenant_id = p.tenant_id
       left join tenant_pet_sizes ps on ps.id = p.size_id and ps.tenant_id = p.tenant_id
       left join lateral (
         select array_agg(tp.name order by tp.name) as preference_names
           from tenant_pet_preferences tp
          where tp.tenant_id = p.tenant_id
            and tp.id in (
              select jsonb_array_elements_text(coalesce(p.preference_ids, '[]'::jsonb))::uuid
            )
       ) pref on true
      where ${conditions.join(' and ')}
      order by p.created_at desc`,
    values
  );
  return result.rows.map((row) => ({ ...row, is_active: Boolean(row.is_active), preference_ids: Array.isArray(row.preference_ids) ? row.preference_ids : row.preference_ids || [] }));
}

export async function createPet(tenantId, payload) {
  await ensureManagementSchema();
  await seedPetMeta(tenantId);
  const name = clean(payload.name);
  const tutorId = clean(payload.tutor_id || payload.tutorId);
  if (!name) throw new Error('Informe o nome do pet.');
  if (!tutorId) throw new Error('Selecione o tutor do pet.');
  const preferenceIds = Array.isArray(payload.preference_ids)
    ? payload.preference_ids.filter(Boolean)
    : String(payload.preference_ids || payload.preferenceIds || '').split(',').map((item) => item.trim()).filter(Boolean);
  const result = await query(
    `insert into tenant_pets (tenant_id, tutor_id, name, species, gender, size, temperament, breed, photo_url, is_active, updated_at, pet_type_id, breed_id, size_id, birth_date, preference_ids)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now(), $11, $12, $13, $14, $15) returning *`,
    [
      tenantId,
      tutorId,
      name,
      clean(payload.species || payload.pet_type_name || payload.petTypeName) || 'Canina',
      clean(payload.gender),
      clean(payload.size || payload.size_name || payload.sizeName),
      clean(payload.temperament),
      clean(payload.breed || payload.breed_name || payload.breedName),
      clean(payload.photo_url || payload.photoUrl),
      toBool(payload.is_active, true),
      clean(payload.pet_type_id || payload.petTypeId) || null,
      clean(payload.breed_id || payload.breedId) || null,
      clean(payload.size_id || payload.sizeId) || null,
      clean(payload.birth_date || payload.birthDate),
      JSON.stringify(preferenceIds)
    ]
  );
  return result.rows[0];
}

export async function updatePet(tenantId, petId, payload) {
  await ensureManagementSchema();
  await seedPetMeta(tenantId);
  const name = clean(payload.name);
  const tutorId = clean(payload.tutor_id || payload.tutorId);
  if (!name) throw new Error('Informe o nome do pet.');
  if (!tutorId) throw new Error('Selecione o tutor do pet.');
  const preferenceIds = Array.isArray(payload.preference_ids)
    ? payload.preference_ids.filter(Boolean)
    : String(payload.preference_ids || payload.preferenceIds || '').split(',').map((item) => item.trim()).filter(Boolean);
  const result = await query(
    `update tenant_pets
        set tutor_id = $3,
            name = $4,
            species = $5,
            gender = $6,
            size = $7,
            temperament = $8,
            breed = $9,
            photo_url = $10,
            is_active = $11,
            pet_type_id = $12,
            breed_id = $13,
            size_id = $14,
            birth_date = $15,
            preference_ids = $16,
            updated_at = now()
      where tenant_id = $1 and id = $2
      returning *`,
    [tenantId, petId, tutorId, name, clean(payload.species || payload.pet_type_name || payload.petTypeName) || 'Canina', clean(payload.gender), clean(payload.size || payload.size_name || payload.sizeName), clean(payload.temperament), clean(payload.breed || payload.breed_name || payload.breedName), clean(payload.photo_url || payload.photoUrl), toBool(payload.is_active, true), clean(payload.pet_type_id || payload.petTypeId) || null, clean(payload.breed_id || payload.breedId) || null, clean(payload.size_id || payload.sizeId) || null, clean(payload.birth_date || payload.birthDate), JSON.stringify(preferenceIds)]
  );
  if (!result.rows.length) throw new Error('Pet não encontrado.');
  return result.rows[0];
}

export async function deletePet(tenantId, petId) {
  await ensureManagementSchema();
  const result = await query('delete from tenant_pets where tenant_id = $1 and id = $2 returning id', [tenantId, petId]);
  if (!result.rows.length) throw new Error('Pet não encontrado.');
  return { id: petId };
}

export async function listServices(tenantId, filters = {}) {
  await ensureManagementSchema();
  await seedServices(tenantId);
  await seedServiceCategories(tenantId);
  const search = clean(filters.search);
  const values = [tenantId];
  const conditions = ['tenant_id = $1'];
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(name ilike $${values.length} or coalesce(category, '') ilike $${values.length})`);
  }
  const result = await query(`select s.*, ps.name as pet_size_name from tenant_services s left join tenant_pet_sizes ps on ps.id = s.pet_size_id and ps.tenant_id = s.tenant_id where ${conditions.join(' and ').replace('tenant_id','s.tenant_id')} order by s.created_at desc`, values);
  return result.rows;
}

export async function createService(tenantId, payload) {
  await ensureManagementSchema();
  await seedServiceCategories(tenantId);
  const name = clean(payload.name);
  if (!name) throw new Error('Informe o nome do serviço.');
  const duplicate = await query('select id from tenant_services where tenant_id = $1 and lower(name) = lower($2) limit 1', [tenantId, name]);
  if (duplicate.rows.length) throw new Error('Já existe um serviço com este nome.');
  const petSizeId = clean(payload.pet_size_id || payload.petSizeId) || null;
  const petSizeLabel = clean(payload.pet_size_label || payload.petSizeLabel || payload.pet_size || payload.petSize) || null;
  const result = await query(
    `insert into tenant_services (tenant_id, name, category, duration_minutes, price_cents, status, description, pet_size_id, pet_size_label, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now()) returning *`,
    [tenantId, name, clean(payload.category), Math.max(15, Number(payload.duration_minutes || payload.durationMinutes || 60)), toMoneyCents(payload.price), normalizeStatus(payload.status, ['ativo','inativo'], 'ativo'), clean(payload.description), petSizeId, petSizeLabel]
  );
  return result.rows[0];
}

export async function updateService(tenantId, serviceId, payload) {
  await ensureManagementSchema();
  await seedServiceCategories(tenantId);
  const name = clean(payload.name);
  if (!name) throw new Error('Informe o nome do serviço.');
  const duplicate = await query('select id from tenant_services where tenant_id = $1 and lower(name) = lower($2) and id <> $3 limit 1', [tenantId, name, serviceId]);
  if (duplicate.rows.length) throw new Error('Já existe um serviço com este nome.');
  const petSizeId = clean(payload.pet_size_id || payload.petSizeId) || null;
  const petSizeLabel = clean(payload.pet_size_label || payload.petSizeLabel || payload.pet_size || payload.petSize) || null;
  const result = await query(
    `update tenant_services
        set name = $3,
            category = $4,
            duration_minutes = $5,
            price_cents = $6,
            status = $7,
            description = $8,
            pet_size_id = $9,
            pet_size_label = $10,
            updated_at = now()
      where tenant_id = $1 and id = $2
      returning *`,
    [tenantId, serviceId, name, clean(payload.category), Math.max(15, Number(payload.duration_minutes || payload.durationMinutes || 60)), toMoneyCents(payload.price), normalizeStatus(payload.status, ['ativo','inativo'], 'ativo'), clean(payload.description), petSizeId, petSizeLabel]
  );
  if (!result.rows.length) throw new Error('Serviço não encontrado.');
  return result.rows[0];
}

export async function deleteService(tenantId, serviceId) {
  await ensureManagementSchema();
  const result = await query('delete from tenant_services where tenant_id = $1 and id = $2 returning id', [tenantId, serviceId]);
  if (!result.rows.length) throw new Error('Serviço não encontrado.');
  return { id: serviceId };
}

export async function listUsers(tenantId, filters = {}) {
  await ensureManagementSchema();
  await seedRoles(tenantId);
  const search = clean(filters.search);
  const values = [tenantId];
  const conditions = ['tenant_id = $1'];
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(full_name ilike $${values.length} or email ilike $${values.length} or coalesce(role_label, role, '') ilike $${values.length})`);
  }
  const result = await query(`select id, tenant_id, full_name, email, role, role_label, phone, photo_url, is_active, created_at from tenant_users where ${conditions.join(' and ')} order by created_at desc`, values);
  return result.rows.map((row) => ({ ...row, is_active: Boolean(row.is_active) }));
}

export async function createUser(tenantId, payload) {
  await ensureManagementSchema();
  await seedRoles(tenantId);
  const fullName = clean(payload.full_name || payload.fullName);
  const email = clean(payload.email).toLowerCase();
  const password = clean(payload.password) || '123456a';
  if (!fullName || !email) throw new Error('Informe nome e e-mail do usuário.');
  if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  const exists = await query('select id from tenant_users where email = $1 limit 1', [email]);
  if (exists.rows.length) throw new Error('Já existe um usuário com este e-mail.');
  const roleLabel = clean(payload.role_label || payload.roleLabel || payload.role || 'Operação');
  const role = roleLabel.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'operacao';
  const hash = await bcrypt.hash(password, 10);
  const result = await query(
    `insert into tenant_users (tenant_id, full_name, email, password_hash, role, role_label, phone, photo_url, is_active, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now()) returning id, tenant_id, full_name, email, role, role_label, phone, photo_url, is_active, created_at`,
    [tenantId, fullName, email, hash, role, roleLabel, clean(payload.phone), clean(payload.photo_url || payload.photoUrl), toBool(payload.is_active, true)]
  );
  return result.rows[0];
}

export async function updateUser(tenantId, userId, payload) {
  await ensureManagementSchema();
  const fullName = clean(payload.full_name || payload.fullName);
  const email = clean(payload.email).toLowerCase();
  if (!fullName || !email) throw new Error('Informe nome e e-mail do usuário.');
  const roleLabel = clean(payload.role_label || payload.roleLabel || payload.role || 'Operação');
  const role = roleLabel.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'operacao';
  const result = await query(
    `update tenant_users
        set full_name = $3,
            email = $4,
            role = $5,
            role_label = $6,
            phone = $7,
            photo_url = $8,
            is_active = $9,
            updated_at = now()
      where tenant_id = $1 and id = $2
      returning id, tenant_id, full_name, email, role, role_label, phone, photo_url, is_active, created_at`,
    [tenantId, userId, fullName, email, role, roleLabel, clean(payload.phone), clean(payload.photo_url || payload.photoUrl), toBool(payload.is_active, true)]
  );
  if (!result.rows.length) throw new Error('Usuário não encontrado.');
  if (clean(payload.password)) {
    if (clean(payload.password).length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
    const hash = await bcrypt.hash(clean(payload.password), 10);
    await query('update tenant_users set password_hash = $3, updated_at = now() where tenant_id = $1 and id = $2', [tenantId, userId, hash]);
  }
  return result.rows[0];
}

export async function toggleUserStatus(tenantId, userId) {
  await ensureManagementSchema();
  const result = await query('update tenant_users set is_active = not is_active, updated_at = now() where tenant_id = $1 and id = $2 returning is_active', [tenantId, userId]);
  if (!result.rows.length) throw new Error('Usuário não encontrado.');
  return { is_active: Boolean(result.rows[0].is_active) };
}

export async function listRoles(tenantId) {
  await ensureManagementSchema();
  await syncTenantSessionStatusesToDefaultFlow(tenantId);
  await seedRoles(tenantId);
  await seedPermissions(tenantId);
  const [result, permissionResult] = await Promise.all([
    query('select * from tenant_roles where tenant_id = $1 order by is_system desc, name asc', [tenantId]),
    query('select code, name from tenant_permissions where tenant_id = $1', [tenantId])
  ]);
  const permissionMap = new Map(permissionResult.rows.map((row) => [row.code, row.name]));
  return result.rows.map((row) => {
    const permissions = Array.isArray(row.permissions) ? row.permissions : [];
    return { ...row, is_active: Boolean(row.is_active), permissions, permission_names: permissions.map((code) => permissionMap.get(code) || code) };
  });
}

export async function createRole(tenantId, payload) {
  await ensureManagementSchema();
  const name = clean(payload.name);
  if (!name) throw new Error('Informe o nome do cargo.');
  const permissions = Array.isArray(payload.permissions) ? payload.permissions : String(payload.permissions || '').split(',').map((item) => item.trim()).filter(Boolean);
  const result = await query(
    'insert into tenant_roles (tenant_id, name, description, permissions, is_active, updated_at) values ($1,$2,$3,$4,$5, now()) returning *',
    [tenantId, name, clean(payload.description), JSON.stringify(permissions), toBool(payload.is_active, true)]
  );
  return result.rows[0];
}

export async function updateRole(tenantId, roleId, payload) {
  await ensureManagementSchema();
  const name = clean(payload.name);
  if (!name) throw new Error('Informe o nome do cargo.');
  const permissions = Array.isArray(payload.permissions) ? payload.permissions : String(payload.permissions || '').split(',').map((item) => item.trim()).filter(Boolean);
  const result = await query(
    `update tenant_roles
        set name = $3,
            description = $4,
            permissions = $5,
            is_active = $6,
            updated_at = now()
      where tenant_id = $1 and id = $2
      returning *`,
    [tenantId, roleId, name, clean(payload.description), JSON.stringify(permissions), toBool(payload.is_active, true)]
  );
  if (!result.rows.length) throw new Error('Cargo não encontrado.');
  return result.rows[0];
}

export async function deleteRole(tenantId, roleId) {
  await ensureManagementSchema();
  const result = await query('delete from tenant_roles where tenant_id = $1 and id = $2 and is_system = false returning id', [tenantId, roleId]);
  if (!result.rows.length) throw new Error('Cargo não encontrado ou é um cargo protegido do sistema.');
  return { id: roleId };
}

export async function toggleRoleStatus(tenantId, roleId) {
  await ensureManagementSchema();
  const result = await query('update tenant_roles set is_active = not is_active, updated_at = now() where tenant_id = $1 and id = $2 returning id, is_active', [tenantId, roleId]);
  if (!result.rows.length) throw new Error('Cargo não encontrado.');
  return { id: roleId, is_active: Boolean(result.rows[0].is_active) };
}

export async function listPermissions(tenantId) {
  await ensureManagementSchema();
  await seedPermissions(tenantId);
  const result = await query('select * from tenant_permissions where tenant_id = $1 order by name asc', [tenantId]);
  return result.rows.map((row) => ({ ...row, is_active: Boolean(row.is_active) }));
}

export async function createPermission(tenantId, payload) {
  await ensureManagementSchema();
  const name = clean(payload.name);
  if (!name) throw new Error('Informe o nome da permissão.');
  const code = normalizeSlug(clean(payload.code) || name).replace(/-/g, '_');

  const duplicate = await query(
    `select id, name, code
       from tenant_permissions
      where tenant_id = $1
        and (lower(name) = lower($2) or code = $3)
      limit 1`,
    [tenantId, name, code]
  );
  if (duplicate.rows.length) {
    throw new Error('Já existe uma permissão cadastrada com este nome ou código.');
  }

  try {
    const result = await query(
      'insert into tenant_permissions (tenant_id, name, code, description, is_active, updated_at) values ($1,$2,$3,$4,$5, now()) returning *',
      [tenantId, name, code, clean(payload.description), toBool(payload.is_active, true)]
    );
    return result.rows[0];
  } catch (error) {
    if (error?.code === '23505') {
      throw new Error('Já existe uma permissão cadastrada com este nome ou código.');
    }
    throw error;
  }
}

export async function updatePermission(tenantId, permissionId, payload) {
  await ensureManagementSchema();
  const name = clean(payload.name);
  if (!name) throw new Error('Informe o nome da permissão.');
  const code = normalizeSlug(clean(payload.code) || name).replace(/-/g, '_');
  const current = await query('select code from tenant_permissions where tenant_id = $1 and id = $2', [tenantId, permissionId]);
  if (!current.rows.length) throw new Error('Permissão não encontrada.');
  const previousCode = current.rows[0].code;

  const duplicate = await query(
    `select id, name, code
       from tenant_permissions
      where tenant_id = $1
        and id <> $2
        and (lower(name) = lower($3) or code = $4)
      limit 1`,
    [tenantId, permissionId, name, code]
  );
  if (duplicate.rows.length) {
    throw new Error('Já existe outra permissão cadastrada com este nome ou código.');
  }

  let result;
  try {
    result = await query(
      `update tenant_permissions
          set name = $3,
              code = $4,
              description = $5,
              is_active = $6,
              updated_at = now()
        where tenant_id = $1 and id = $2
        returning *`,
      [tenantId, permissionId, name, code, clean(payload.description), toBool(payload.is_active, true)]
    );
  } catch (error) {
    if (error?.code === '23505') {
      throw new Error('Já existe outra permissão cadastrada com este nome ou código.');
    }
    throw error;
  }
  if (previousCode !== code) {
    await query(
      `update tenant_roles
          set permissions = (
            select coalesce(jsonb_agg(case when value = $3 then $4 else value end), '[]'::jsonb)
            from jsonb_array_elements_text(coalesce(permissions, '[]'::jsonb)) as value
          ),
          updated_at = now()
        where tenant_id = $1 and permissions ? $2`,
      [tenantId, previousCode, previousCode, code]
    );
  }
  return result.rows[0];
}

export async function deletePermission(tenantId, permissionId) {
  await ensureManagementSchema();
  const current = await query('select code from tenant_permissions where tenant_id = $1 and id = $2', [tenantId, permissionId]);
  if (!current.rows.length) throw new Error('Permissão não encontrada.');
  const code = current.rows[0].code;
  await query('delete from tenant_permissions where tenant_id = $1 and id = $2', [tenantId, permissionId]);
  await query(
    `update tenant_roles
        set permissions = (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from jsonb_array_elements_text(coalesce(permissions, '[]'::jsonb)) as value
          where value <> $2
        ),
        updated_at = now()
      where tenant_id = $1 and permissions ? $2`,
    [tenantId, code]
  );
  return { id: permissionId };
}

export async function listAgenda(tenantId, filters = {}) {
  await ensureManagementSchema();
  await syncTenantSessionStatusesToDefaultFlow(tenantId);
  await seedAgenda(tenantId);
  const search = clean(filters.search);
  const rawStatus = clean(filters.status);
  const status = rawStatus ? canonicalStatusCode(rawStatus) : '';
  const service = clean(filters.service);
  const staff = clean(filters.staff);
  const values = [tenantId];
  const conditions = ['a.tenant_id = $1'];
  if (rawStatus && status) { values.push(status); conditions.push(`a.status = $${values.length}`); }
  if (service) { values.push(service); conditions.push(`a.service_name = $${values.length}`); }
  if (staff) { values.push(staff); conditions.push(`coalesce(a.staff_name,'') = $${values.length}`); }
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(a.pet_name ilike $${values.length} or a.tutor_name ilike $${values.length} or coalesce(a.phone,'') ilike $${values.length} or a.service_name ilike $${values.length})`);
  }
  const [result, statusMap] = await Promise.all([
    query(`select a.* from tenant_agenda_items a where ${conditions.join(' and ')} order by a.scheduled_at asc`, values),
    getSessionStatusMap(tenantId)
  ]);
  return result.rows.map((row) => formatAgendaRow(row, statusMap));
}

async function insertAgendaItemRecord(tenantId, payload, statusMap = null) {
  const item = normalizeAgendaPayload(payload);
  if (!item.tutor_name || !item.pet_name || !item.service_name || !item.scheduled_at) throw new Error('Informe WhatsApp, cliente, pet, serviço e data do agendamento.');
  await validateAgendaScheduling(tenantId, item.scheduled_at_input || item.scheduled_at);
  const ticketCode = clean(payload.ticket_code || payload.ticketCode) || makeTicketCode();
  const result = await query(
    `insert into tenant_agenda_items (tenant_id, tutor_id, pet_id, service_id, tutor_name, pet_name, service_name, staff_name, staff_user_id, phone, scheduled_at, status, notes, breed, size, unit_name, payment_status, payment_method, booking_origin, customer_package_id, package_name, package_session_number, package_session_total, is_last_package_session, package_discount_percent, package_total_without_discount_cents, package_total_with_discount_cents, package_snapshot_json, pets_json, services_json, ticket_code, updated_at)
     values (
       $1::uuid,
       $2::uuid,
       $3::uuid,
       $4::uuid,
       $5::text,
       $6::text,
       $7::text,
       $8::text,
       $9::uuid,
       $10::text,
       $11::timestamptz,
       $12::text,
       $13::text,
       $14::text,
       $15::text,
       $16::text,
       $17::text,
       $18::text,
       $19::text,
       $20::uuid,
       $21::text,
       $22::integer,
       $23::integer,
       $24::boolean,
       $25::numeric,
       $26::integer,
       $27::integer,
       $28::jsonb,
       $29::jsonb,
       $30::jsonb,
       $31::text,
       now()
     ) returning *`,
    [tenantId, item.tutor_id, item.pet_id, item.service_id, item.tutor_name, item.pet_name, item.service_name, item.staff_name, item.staff_user_id, item.phone, item.scheduled_at, item.status, item.notes, item.breed, item.size, item.unit_name, item.payment_status, item.payment_method, item.booking_origin, item.customer_package_id, item.package_name, item.package_session_number, item.package_session_total, item.is_last_package_session, item.package_discount_percent, item.package_total_without_discount_cents, item.package_total_with_discount_cents, item.package_snapshot_json, item.pets_json, item.services_json, ticketCode]
  );
  const resolvedStatusMap = statusMap || await getSessionStatusMap(tenantId);
  return formatAgendaRow(result.rows[0], resolvedStatusMap);
}

export async function createAgendaItem(tenantId, payload) {
  await ensureManagementSchema();
  try {
    const statusMap = await getSessionStatusMap(tenantId);
    const batchItems = parseJsonArray(payload.appointment_items || payload.appointmentItems);
    if (batchItems.length) {
      const createdItems = [];
      for (const entry of batchItems) {
        createdItems.push(await insertAgendaItemRecord(tenantId, {
          ...payload,
          ...entry,
          pets: entry.pets || payload.pets,
          services: entry.services || payload.services,
          pet_id: entry.pet_id || entry.petId,
          pet_name: entry.pet_name || entry.petName,
          service_id: entry.service_id || entry.serviceId,
          service_name: entry.service_name || entry.serviceName,
          breed: entry.breed,
          size: entry.size
        }, statusMap));
      }
      return { item: createdItems[0] || null, items: createdItems };
    }
    return await insertAgendaItemRecord(tenantId, payload, statusMap);
  } catch (error) {
    if (error?.code === '23505') throw new Error('Já existe um agendamento muito parecido salvo. Revise cliente, pets, serviços e horário.');
    throw error;
  }
}

function ensureJsonbValue(value, fallback = []) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string') {
    const parsed = safeJsonParse(value, fallback);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') return parsed;
    return fallback;
  }
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return value;
  return fallback;
}

export async function updateAgendaItem(tenantId, agendaId, payload) {
  await ensureManagementSchema();
  const currentResult = await query('select * from tenant_agenda_items where tenant_id = $1 and id = $2 limit 1', [tenantId, agendaId]);
  const current = currentResult.rows[0];
  if (!current) throw new Error('Agendamento não encontrado.');

  const payloadKeys = Object.keys(payload || {}).filter((key) => payload[key] !== undefined);
  const paymentOnlyKeys = new Set(['payment_status', 'paymentStatus', 'payment_method', 'paymentMethod']);
  const isPaymentOnlyUpdate = payloadKeys.length > 0 && payloadKeys.every((key) => paymentOnlyKeys.has(key));

  if (isPaymentOnlyUpdate) {
    try {
      const normalizedPaymentStatus = normalizeStatus(clean(payload.payment_status || payload.paymentStatus), ['pendente', 'pago'], current.payment_status || 'pendente');
      const normalizedPaymentMethod = clean(payload.payment_method || payload.paymentMethod || current.payment_method);
      const updateParams = [tenantId, agendaId, normalizedPaymentStatus, normalizedPaymentMethod];
      const isPackageSeries = String(current.booking_origin || '').toLowerCase() === 'pacote' && current.customer_package_id;
      const result = isPackageSeries
        ? await query(
            `update tenant_agenda_items
                set payment_status = $3::text,
                    payment_method = $4::text,
                    receipt_generated_at = case when $3::text = 'pago' then now() else receipt_generated_at end,
                    updated_at = now()
              where tenant_id = $1::uuid and customer_package_id = (select customer_package_id from tenant_agenda_items where tenant_id = $1::uuid and id = $2::uuid limit 1)
              returning *`,
            updateParams
          )
        : await query(
            `update tenant_agenda_items
                set payment_status = $3::text,
                    payment_method = $4::text,
                    receipt_generated_at = case when $3::text = 'pago' then now() else receipt_generated_at end,
                    updated_at = now()
              where tenant_id = $1::uuid and id = $2::uuid
              returning *`,
            updateParams
          );
      if (!result.rows.length) throw new Error('Agendamento não encontrado.');
      if (isPackageSeries) {
        await query(
          `update tenant_package_payments
              set status = case when $3::text = 'pago' then 'paid' else 'pending' end,
                  payment_method = nullif($4::text, ''),
                  paid_at = case when $3::text = 'pago' then coalesce(paid_at, now()) else null end,
                  updated_at = now()
            where tenant_id = $1::uuid and customer_package_id = (select customer_package_id from tenant_agenda_items where tenant_id = $1::uuid and id = $2::uuid limit 1)`,
          updateParams
        );
      }
      const updatedTarget = isPackageSeries ? (result.rows.find((row) => String(row.id) === String(agendaId)) || result.rows[0]) : result.rows[0];
      const statusMap = await getSessionStatusMap(tenantId);
      return formatAgendaRow(updatedTarget, statusMap);
    } catch (error) {
      if (error?.code === '42P08') throw new Error('Não foi possível atualizar o pagamento por um conflito de tipos. Reabra o cliente e tente novamente.');
      throw error;
    }
  }

  const item = normalizeAgendaPayload({
        tutor_id: payload.tutor_id ?? current.tutor_id,
        staff_user_id: payload.staff_user_id ?? current.staff_user_id,
        pet_id: payload.pet_id ?? current.pet_id,
        service_id: payload.service_id ?? current.service_id,
        tutor_name: payload.tutor_name ?? payload.client_name ?? current.tutor_name,
        pet_name: payload.pet_name ?? current.pet_name,
        service_name: payload.service_name ?? current.service_name,
        staff_name: payload.staff_name ?? current.staff_name,
        phone: payload.phone ?? payload.whatsapp ?? current.phone,
        scheduled_at: payload.scheduled_at ?? payload.scheduledAt ?? current.scheduled_at,
        status: payload.status ?? current.status,
        notes: payload.notes ?? current.notes,
        breed: payload.breed ?? current.breed,
        size: payload.size ?? current.size,
        unit_name: payload.unit_name ?? current.unit_name,
        payment_status: payload.payment_status ?? current.payment_status,
        payment_method: payload.payment_method ?? current.payment_method,
        booking_origin: payload.booking_origin ?? current.booking_origin,
        customer_package_id: payload.customer_package_id ?? current.customer_package_id,
        package_name: payload.package_name ?? current.package_name,
        package_session_number: payload.package_session_number ?? current.package_session_number,
        package_session_total: payload.package_session_total ?? current.package_session_total,
        is_last_package_session: payload.is_last_package_session ?? current.is_last_package_session,
        package_discount_percent: payload.package_discount_percent ?? current.package_discount_percent,
        package_total_without_discount_cents: payload.package_total_without_discount_cents ?? current.package_total_without_discount_cents,
        package_total_with_discount_cents: payload.package_total_with_discount_cents ?? current.package_total_with_discount_cents,
        package_snapshot_json: payload.package_snapshot_json ?? current.package_snapshot_json,
        pets: payload.pets ?? current.pets_json,
        services: payload.services ?? current.services_json
      });

  if (!item.tutor_name || !item.pet_name || !item.service_name || !item.scheduled_at) throw new Error('Informe WhatsApp, cliente, pet, serviço e data do agendamento.');
  if (!isPaymentOnlyUpdate) {
    await validateAgendaScheduling(tenantId, item.scheduled_at_input || item.scheduled_at, agendaId);
  }
  try {
    const result = await query(
      `update tenant_agenda_items
          set tutor_id = $3::uuid,
              pet_id = $4::uuid,
              service_id = $5::uuid,
              tutor_name = $6::text,
              pet_name = $7::text,
              service_name = $8::text,
              staff_name = $9::text,
              staff_user_id = $10::uuid,
              phone = $11::text,
              scheduled_at = $12::timestamptz,
              status = $13::text,
              notes = $14::text,
              breed = $15::text,
              size = $16::text,
              unit_name = $17::text,
              payment_status = $18::text,
              payment_method = $19::text,
              booking_origin = $20::text,
              customer_package_id = $21::uuid,
              package_name = $22::text,
              package_session_number = $23::integer,
              package_session_total = $24::integer,
              is_last_package_session = $25::boolean,
              package_discount_percent = $26::numeric,
              package_total_without_discount_cents = $27::integer,
              package_total_with_discount_cents = $28::integer,
              package_snapshot_json = $29::jsonb,
              pets_json = $30::jsonb,
              services_json = $31::jsonb,
              receipt_generated_at = case when $18::text = 'pago' or $32::boolean then now() else receipt_generated_at end,
              updated_at = now()
        where tenant_id = $1::uuid and id = $2::uuid
        returning *`,
      [tenantId, agendaId, item.tutor_id, item.pet_id, item.service_id, item.tutor_name, item.pet_name, item.service_name, item.staff_name, item.staff_user_id, item.phone, item.scheduled_at, item.status, item.notes, item.breed, item.size, item.unit_name, item.payment_status, item.payment_method, item.booking_origin, item.customer_package_id, item.package_name, item.package_session_number, item.package_session_total, item.is_last_package_session, item.package_discount_percent, item.package_total_without_discount_cents, item.package_total_with_discount_cents, ensureJsonbValue(item.package_snapshot_json, {}), ensureJsonbValue(item.pets_json, []), ensureJsonbValue(item.services_json, []), canonicalStatusCode(item.status) === 'concluido']
    );
    if (!result.rows.length) throw new Error('Agendamento não encontrado.');

    const confirmResult = await query('select * from tenant_agenda_items where tenant_id = $1 and id = $2 limit 1', [tenantId, agendaId]);
    if (!confirmResult.rows.length) {
      throw new Error('O agendamento não foi encontrado após a atualização. A operação foi bloqueada para evitar exclusão indevida.');
    }

    const statusMap = await getSessionStatusMap(tenantId);
    return formatAgendaRow(confirmResult.rows[0], statusMap);
  } catch (error) {
    if (error?.code === '42P08') throw new Error('Não foi possível atualizar o agendamento por um conflito de tipos. Reabra o agendamento e tente novamente.');
    if (error?.code === '23505') throw new Error('Já existe um agendamento muito parecido salvo. Revise cliente, pets, serviços e horário.');
    throw error;
  }
}

export async function moveAgendaItem(tenantId, agendaId, payload) {
  await ensureManagementSchema();
  const currentResult = await query(
    'select id, scheduled_at, status from tenant_agenda_items where tenant_id = $1 and id = $2 limit 1',
    [tenantId, agendaId]
  );
  const current = currentResult.rows[0];
  if (!current) throw new Error('Agendamento não encontrado.');

  const hasScheduledInput = clean(payload.scheduled_at || payload.scheduledAt);
  const hasStatusInput = clean(payload.status);
  const nextStatus = hasStatusInput ? canonicalStatusCode(payload.status) : canonicalStatusCode(current.status);
  const shouldGenerateReceipt = nextStatus === 'concluido';

  if (hasScheduledInput) {
    const scheduledInput = clean(payload.scheduled_at || payload.scheduledAt);
    const scheduledAt = toIsoOrNull(scheduledInput);
    if (!scheduledAt) throw new Error('Informe a nova data do agendamento.');
    await validateAgendaScheduling(tenantId, scheduledInput, agendaId);
    const result = await query(
      `update tenant_agenda_items
          set scheduled_at = $3::timestamptz,
              status = $4::text,
              updated_at = now(),
              receipt_generated_at = case when $5 then now() else receipt_generated_at end
        where tenant_id = $1::uuid and id = $2::uuid
        returning id, status, scheduled_at`,
      [tenantId, agendaId, scheduledAt, nextStatus, shouldGenerateReceipt]
    );
    if (!result.rows.length) throw new Error('Agendamento não encontrado.');
    return { id: agendaId, status: result.rows[0].status, scheduled_at: result.rows[0].scheduled_at };
  }

  if (hasStatusInput) {
    const statusMap = await getSessionStatusMap(tenantId);
    const result = await query(
      `update tenant_agenda_items
          set status = $3::text,
              updated_at = now(),
              receipt_generated_at = case when $4::boolean then now() else receipt_generated_at end
        where tenant_id = $1::uuid and id = $2::uuid
        returning id, status, scheduled_at`,
      [tenantId, agendaId, nextStatus, shouldGenerateReceipt]
    );
    if (!result.rows.length) throw new Error('Agendamento não encontrado.');
    const statusInfo = statusMap.get(canonicalStatusCode(result.rows[0].status)) || null;
    return {
      id: agendaId,
      status: canonicalStatusCode(result.rows[0].status),
      status_label: statusInfo?.name || result.rows[0].status,
      status_color: statusInfo?.color || null,
      scheduled_at: result.rows[0].scheduled_at
    };
  }

  throw new Error('Informe a data/horário ou o status para mover o agendamento.');
}

export async function checkinAgendaItem(tenantId, agendaId) {
  await ensureManagementSchema();
  const result = await query("update tenant_agenda_items set status = 'check_in', updated_at = now() where tenant_id = $1 and id = $2 returning id", [tenantId, agendaId]);
  if (!result.rows.length) throw new Error('Agendamento não encontrado.');
  return { id: agendaId };
}

export async function deleteAgendaItem(tenantId, agendaId) {
  await ensureManagementSchema();
  const currentResult = await query('select id, scheduled_at from tenant_agenda_items where tenant_id = $1 and id = $2 limit 1', [tenantId, agendaId]);
  const current = currentResult.rows[0];
  if (!current) throw new Error('Agendamento não encontrado.');
  if (new Date(current.scheduled_at).getTime() >= Date.now()) {
    throw new Error('Somente agendamentos que já passaram podem ser excluídos.');
  }
  const result = await query('delete from tenant_agenda_items where tenant_id = $1 and id = $2 returning id', [tenantId, agendaId]);
  if (!result.rows.length) throw new Error('Agendamento não encontrado.');
  return { id: agendaId };
}

export async function getManagementMeta(tenantId) {

  await ensureManagementSchema();
  await syncTenantSessionStatusesToDefaultFlow(tenantId);
  await seedRoles(tenantId);
  await seedPermissions(tenantId);
  await seedServices(tenantId);
  await seedPetMeta(tenantId);
  await seedServiceCategories(tenantId);
  const [tutors, roles, permissions, services, petTypes, petSizes, petBreeds, petPreferences, serviceCategories, sessionStatuses, collaborators, pets] = await Promise.all([
    query('select id, full_name, phone, phone_secondary from tenant_tutors where tenant_id = $1 and is_active = true order by full_name asc', [tenantId]),
    query('select id, name, is_active from tenant_roles where tenant_id = $1 order by name asc', [tenantId]),
    query('select id, name, code, description, is_active from tenant_permissions where tenant_id = $1 order by name asc', [tenantId]),
    query('select id, name, category, price_cents, duration_minutes, pet_size_id, pet_size_label from tenant_services where tenant_id = $1 order by name asc', [tenantId]),
    query('select id, name, description from tenant_pet_types where tenant_id = $1 and is_active = true order by name asc', [tenantId]),
    query('select id, name, description from tenant_pet_sizes where tenant_id = $1 and is_active = true order by name asc', [tenantId]),
    query('select id, pet_type_id, name, description from tenant_pet_breeds where tenant_id = $1 and is_active = true order by name asc', [tenantId]),
    query('select id, name, description from tenant_pet_preferences where tenant_id = $1 and is_active = true order by name asc', [tenantId]),
    query('select id, name, description, is_active from tenant_service_categories where tenant_id = $1 order by name asc', [tenantId]),
    query('select id, name, description, color, position, is_active from tenant_session_statuses where tenant_id = $1 order by position asc, name asc', [tenantId]),
    query("select id, full_name, phone, email, role_label, is_active from tenant_users where tenant_id = $1 and is_active = true order by full_name asc", [tenantId]),
    query("select id, tutor_id, name, size, size_id, breed, photo_url, is_active from tenant_pets where tenant_id = $1 and is_active = true order by name asc", [tenantId])
  ]);
  return { tutors: tutors.rows, roles: roles.rows, permissions: permissions.rows, services: services.rows, pet_types: petTypes.rows, pet_sizes: petSizes.rows, pet_breeds: petBreeds.rows, pet_preferences: petPreferences.rows, service_categories: serviceCategories.rows, session_statuses: sessionStatuses.rows, collaborators: collaborators.rows, pets: pets.rows };
}


export async function listSessionStatuses(tenantId) {
  await ensureManagementSchema();
  await seedSessionStatuses(tenantId);
  const result = await query('select * from tenant_session_statuses where tenant_id = $1 order by position asc, name asc', [tenantId]);
  return result.rows.map((row) => ({ ...row, is_active: Boolean(row.is_active) }));
}

export async function createSessionStatus(tenantId, payload) {
  await ensureManagementSchema();
  const name = clean(payload.name);
  if (!name) throw new Error('Informe o nome da sessão.');
  const description = clean(payload.description);
  const color = clean(payload.color) || '#1F8560';
  const next = await query('select coalesce(max(position), 0)::int + 1 as next_position from tenant_session_statuses where tenant_id = $1', [tenantId]);
  const position = Number(next.rows[0]?.next_position || 1);
  const result = await query(`insert into tenant_session_statuses (tenant_id, name, description, color, position, is_active, updated_at)
    values ($1,$2,$3,$4,$5,$6, now()) returning *`, [tenantId, name, description, color, position, toBool(payload.is_active, true)]);
  return { ...result.rows[0], is_active: Boolean(result.rows[0]?.is_active) };
}

export async function updateSessionStatus(tenantId, itemId, payload) {
  await ensureManagementSchema();
  const name = clean(payload.name);
  if (!name) throw new Error('Informe o nome da sessão.');
  const description = clean(payload.description);
  const color = clean(payload.color) || '#1F8560';
  const result = await query(`update tenant_session_statuses
      set name = $3, description = $4, color = $5, is_active = $6, updated_at = now()
    where tenant_id = $1 and id = $2
    returning *`, [tenantId, itemId, name, description, color, toBool(payload.is_active, true)]);
  if (!result.rows.length) throw new Error('Sessão não encontrada.');
  return { ...result.rows[0], is_active: Boolean(result.rows[0]?.is_active) };
}

export async function deleteSessionStatus(tenantId, itemId) {
  await ensureManagementSchema();
  const current = await query('delete from tenant_session_statuses where tenant_id = $1 and id = $2 returning id, position', [tenantId, itemId]);
  if (!current.rows.length) throw new Error('Sessão não encontrada.');
  await query(`with ordered as (
      select id, row_number() over (order by position asc, created_at asc) as seq
      from tenant_session_statuses
      where tenant_id = $1
    )
    update tenant_session_statuses s
       set position = ordered.seq, updated_at = now()
      from ordered
     where s.id = ordered.id`, [tenantId]);
  return { id: itemId };
}

export async function reorderSessionStatuses(tenantId, orderedIds = []) {
  await ensureManagementSchema();
  const ids = Array.isArray(orderedIds) ? orderedIds.map(clean).filter(Boolean) : [];
  if (!ids.length) return { ok: true };
  for (const [index, id] of ids.entries()) {
    await query('update tenant_session_statuses set position = $3, updated_at = now() where tenant_id = $1 and id = $2', [tenantId, id, index + 1]);
  }
  return { ok: true };
}

export async function listServiceMetaItems(tenantId, kind) {
  await ensureManagementSchema();
  await seedServiceCategories(tenantId);
  const meta = resolveServiceMetaKind(kind);
  const result = await query(`select * from ${meta.table} where tenant_id = $1 order by name asc`, [tenantId]);
  return result.rows.map((row) => ({ ...row, is_active: Boolean(row.is_active) }));
}

export async function createServiceMetaItem(tenantId, kind, payload) {
  await ensureManagementSchema();
  const meta = resolveServiceMetaKind(kind);
  const name = clean(payload.name);
  if (!name) throw new Error(`Informe o nome da ${meta.label}.`);
  const duplicate = await query(`select id from ${meta.table} where tenant_id = $1 and lower(name) = lower($2) limit 1`, [tenantId, name]);
  if (duplicate.rows.length) throw new Error(`Já existe uma ${meta.label} com este nome.`);
  const result = await query(`insert into ${meta.table} (tenant_id, name, slug, description, is_active, updated_at) values ($1,$2,$3,$4,$5, now()) returning *`, [tenantId, name, normalizeSlug(name), clean(payload.description), toBool(payload.is_active, true)]);
  return result.rows[0];
}

export async function updateServiceMetaItem(tenantId, kind, itemId, payload) {
  await ensureManagementSchema();
  const meta = resolveServiceMetaKind(kind);
  const name = clean(payload.name);
  if (!name) throw new Error(`Informe o nome da ${meta.label}.`);
  const duplicate = await query(`select id from ${meta.table} where tenant_id = $1 and lower(name) = lower($2) and id <> $3 limit 1`, [tenantId, name, itemId]);
  if (duplicate.rows.length) throw new Error(`Já existe uma ${meta.label} com este nome.`);
  const result = await query(`update ${meta.table} set name = $3, slug = $4, description = $5, is_active = $6, updated_at = now() where tenant_id = $1 and id = $2 returning *`, [tenantId, itemId, name, normalizeSlug(name), clean(payload.description), toBool(payload.is_active, true)]);
  if (!result.rows.length) throw new Error('Categoria não encontrada.');
  return result.rows[0];
}

export async function deleteServiceMetaItem(tenantId, kind, itemId) {
  await ensureManagementSchema();
  const meta = resolveServiceMetaKind(kind);
  const current = await query(`select name from ${meta.table} where tenant_id = $1 and id = $2 limit 1`, [tenantId, itemId]);
  const result = await query(`delete from ${meta.table} where tenant_id = $1 and id = $2 returning id`, [tenantId, itemId]);
  if (!result.rows.length) throw new Error('Categoria não encontrada.');
  if (current.rows[0]?.name) {
    await query('update tenant_services set category = null, updated_at = now() where tenant_id = $1 and category = $2', [tenantId, current.rows[0].name]);
  }
  return { id: itemId };
}

export async function listPetMetaItems(tenantId, kind) {
  await ensureManagementSchema();
  await seedPetMeta(tenantId);
  const meta = resolvePetMetaKind(kind);
  const result = await query(`select * from ${meta.table} where tenant_id = $1 order by name asc`, [tenantId]);
  return result.rows.map((row) => ({ ...row, is_active: Boolean(row.is_active) }));
}

export async function createPetMetaItem(tenantId, kind, payload) {
  await ensureManagementSchema();
  const meta = resolvePetMetaKind(kind);
  const name = clean(payload.name);
  if (!name) throw new Error(`Informe o nome do ${meta.label}.`);
  const typeId = kind === 'pet_breeds' ? clean(payload.pet_type_id || payload.petTypeId) || null : null;
  const columns = kind === 'pet_breeds'
    ? '(tenant_id, pet_type_id, name, slug, description, is_active, updated_at)'
    : '(tenant_id, name, slug, description, is_active, updated_at)';
  const placeholders = kind === 'pet_breeds'
    ? '($1,$2,$3,$4,$5,$6, now())'
    : '($1,$2,$3,$4,$5, now())';
  const params = kind === 'pet_breeds'
    ? [tenantId, typeId, name, normalizeSlug(name), clean(payload.description), toBool(payload.is_active, true)]
    : [tenantId, name, normalizeSlug(name), clean(payload.description), toBool(payload.is_active, true)];
  const result = await query(`insert into ${meta.table} ${columns} values ${placeholders} returning *`, params);
  return result.rows[0];
}

export async function updatePetMetaItem(tenantId, kind, itemId, payload) {
  await ensureManagementSchema();
  const meta = resolvePetMetaKind(kind);
  const name = clean(payload.name);
  if (!name) throw new Error(`Informe o nome do ${meta.label}.`);
  const typeId = kind === 'pet_breeds' ? clean(payload.pet_type_id || payload.petTypeId) || null : null;
  const sql = kind === 'pet_breeds'
    ? `update ${meta.table}
          set pet_type_id = $3,
              name = $4,
              slug = $5,
              description = $6,
              is_active = $7,
              updated_at = now()
        where tenant_id = $1 and id = $2
        returning *`
    : `update ${meta.table}
          set name = $3,
              slug = $4,
              description = $5,
              is_active = $6,
              updated_at = now()
        where tenant_id = $1 and id = $2
        returning *`;
  const params = kind === 'pet_breeds'
    ? [tenantId, itemId, typeId, name, normalizeSlug(name), clean(payload.description), toBool(payload.is_active, true)]
    : [tenantId, itemId, name, normalizeSlug(name), clean(payload.description), toBool(payload.is_active, true)];
  const result = await query(sql, params);
  if (!result.rows.length) throw new Error(`${meta.label[0].toUpperCase()}${meta.label.slice(1)} não encontrado.`);
  return result.rows[0];
}

export async function deletePetMetaItem(tenantId, kind, itemId) {
  await ensureManagementSchema();
  const meta = resolvePetMetaKind(kind);
  const result = await query(`delete from ${meta.table} where tenant_id = $1 and id = $2 returning id`, [tenantId, itemId]);
  if (!result.rows.length) throw new Error(`${meta.label[0].toUpperCase()}${meta.label.slice(1)} não encontrado.`);
  return { id: itemId };
}
