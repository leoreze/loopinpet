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
      is_system boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, name)
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

    alter table tenant_pets add column if not exists pet_type_id uuid references tenant_pet_types(id) on delete set null;
    alter table tenant_pets add column if not exists breed_id uuid references tenant_pet_breeds(id) on delete set null;
    alter table tenant_pets add column if not exists size_id uuid references tenant_pet_sizes(id) on delete set null;
    alter table tenant_pets add column if not exists birth_date varchar(20);
    alter table tenant_pets add column if not exists preference_ids jsonb not null default '[]'::jsonb;

    create index if not exists idx_roles_tenant on tenant_roles(tenant_id);
    create index if not exists idx_services_tenant on tenant_services(tenant_id);
    create index if not exists idx_agenda_tenant_time on tenant_agenda_items(tenant_id, scheduled_at);
    create index if not exists idx_pet_types_tenant on tenant_pet_types(tenant_id);
    create index if not exists idx_pet_sizes_tenant on tenant_pet_sizes(tenant_id);
    create index if not exists idx_pet_breeds_tenant on tenant_pet_breeds(tenant_id);
    create index if not exists idx_pet_preferences_tenant on tenant_pet_preferences(tenant_id);
  `);
}

async function seedRoles(tenantId) {
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
  const search = clean(filters.search);
  const values = [tenantId];
  const conditions = ['tenant_id = $1'];
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(name ilike $${values.length} or coalesce(category, '') ilike $${values.length})`);
  }
  const result = await query(`select * from tenant_services where ${conditions.join(' and ')} order by created_at desc`, values);
  return result.rows;
}

export async function createService(tenantId, payload) {
  await ensureManagementSchema();
  const name = clean(payload.name);
  if (!name) throw new Error('Informe o nome do serviço.');
  const result = await query(
    `insert into tenant_services (tenant_id, name, category, duration_minutes, price_cents, status, description, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7, now()) returning *`,
    [tenantId, name, clean(payload.category), Math.max(15, Number(payload.duration_minutes || payload.durationMinutes || 60)), toMoneyCents(payload.price), normalizeStatus(payload.status, ['ativo','inativo'], 'ativo'), clean(payload.description)]
  );
  return result.rows[0];
}

export async function updateService(tenantId, serviceId, payload) {
  await ensureManagementSchema();
  const name = clean(payload.name);
  if (!name) throw new Error('Informe o nome do serviço.');
  const result = await query(
    `update tenant_services
        set name = $3,
            category = $4,
            duration_minutes = $5,
            price_cents = $6,
            status = $7,
            description = $8,
            updated_at = now()
      where tenant_id = $1 and id = $2
      returning *`,
    [tenantId, serviceId, name, clean(payload.category), Math.max(15, Number(payload.duration_minutes || payload.durationMinutes || 60)), toMoneyCents(payload.price), normalizeStatus(payload.status, ['ativo','inativo'], 'ativo'), clean(payload.description)]
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
  const result = await query(`select id, tenant_id, full_name, email, role, role_label, phone, is_active, created_at from tenant_users where ${conditions.join(' and ')} order by created_at desc`, values);
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
    `insert into tenant_users (tenant_id, full_name, email, password_hash, role, role_label, phone, is_active, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8, now()) returning id, tenant_id, full_name, email, role, role_label, phone, is_active, created_at`,
    [tenantId, fullName, email, hash, role, roleLabel, clean(payload.phone), toBool(payload.is_active, true)]
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
            is_active = $8,
            updated_at = now()
      where tenant_id = $1 and id = $2
      returning id, tenant_id, full_name, email, role, role_label, phone, is_active, created_at`,
    [tenantId, userId, fullName, email, role, roleLabel, clean(payload.phone), toBool(payload.is_active, true)]
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
  await seedRoles(tenantId);
  const result = await query('select * from tenant_roles where tenant_id = $1 order by is_system desc, name asc', [tenantId]);
  return result.rows.map((row) => ({ ...row, permissions: Array.isArray(row.permissions) ? row.permissions : [] }));
}

export async function createRole(tenantId, payload) {
  await ensureManagementSchema();
  const name = clean(payload.name);
  if (!name) throw new Error('Informe o nome do cargo.');
  const permissions = Array.isArray(payload.permissions) ? payload.permissions : String(payload.permissions || '').split(',').map((item) => item.trim()).filter(Boolean);
  const result = await query(
    'insert into tenant_roles (tenant_id, name, description, permissions, updated_at) values ($1,$2,$3,$4, now()) returning *',
    [tenantId, name, clean(payload.description), JSON.stringify(permissions)]
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
            updated_at = now()
      where tenant_id = $1 and id = $2
      returning *`,
    [tenantId, roleId, name, clean(payload.description), JSON.stringify(permissions)]
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

export async function listAgenda(tenantId, filters = {}) {
  await ensureManagementSchema();
  await seedAgenda(tenantId);
  const search = clean(filters.search);
  const status = clean(filters.status);
  const service = clean(filters.service);
  const staff = clean(filters.staff);
  const values = [tenantId];
  const conditions = ['tenant_id = $1'];
  if (status) { values.push(status); conditions.push(`status = $${values.length}`); }
  if (service) { values.push(service); conditions.push(`service_name = $${values.length}`); }
  if (staff) { values.push(staff); conditions.push(`staff_name = $${values.length}`); }
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(pet_name ilike $${values.length} or tutor_name ilike $${values.length} or coalesce(phone,'') ilike $${values.length} or service_name ilike $${values.length})`);
  }
  const result = await query(`select * from tenant_agenda_items where ${conditions.join(' and ')} order by scheduled_at asc`, values);
  return result.rows.map((row) => ({
    ...row,
    hour: new Date(row.scheduled_at).toISOString().slice(11,16),
    date: new Date(row.scheduled_at).toISOString().slice(0,10),
    staff: row.staff_name,
    pet: row.pet_name,
    tutor: row.tutor_name,
    phone: row.phone || '',
    service: row.service_name,
    unit: row.unit_name || 'Unidade Centro',
    breed: row.breed || '',
    size: row.size || '',
    notes: row.notes || ''
  }));
}

export async function createAgendaItem(tenantId, payload) {
  await ensureManagementSchema();
  const tutorName = clean(payload.tutor_name || payload.tutorName);
  const petName = clean(payload.pet_name || payload.petName);
  const serviceName = clean(payload.service_name || payload.serviceName);
  const scheduledAt = toIsoOrNull(payload.scheduled_at || payload.scheduledAt);
  if (!tutorName || !petName || !serviceName || !scheduledAt) throw new Error('Informe tutor, pet, serviço e data do agendamento.');
  const result = await query(
    `insert into tenant_agenda_items (tenant_id, tutor_name, pet_name, service_name, staff_name, phone, scheduled_at, status, notes, breed, size, unit_name, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now()) returning *`,
    [tenantId, tutorName, petName, serviceName, clean(payload.staff_name || payload.staffName), clean(payload.phone), scheduledAt, normalizeStatus(payload.status, ['confirmado','pendente','checkin','concluido'], 'pendente'), clean(payload.notes), clean(payload.breed), clean(payload.size), clean(payload.unit_name || payload.unitName) || 'Unidade Centro']
  );
  return result.rows[0];
}

export async function updateAgendaItem(tenantId, agendaId, payload) {
  await ensureManagementSchema();
  const tutorName = clean(payload.tutor_name || payload.tutorName);
  const petName = clean(payload.pet_name || payload.petName);
  const serviceName = clean(payload.service_name || payload.serviceName);
  const scheduledAt = toIsoOrNull(payload.scheduled_at || payload.scheduledAt);
  if (!tutorName || !petName || !serviceName || !scheduledAt) throw new Error('Informe tutor, pet, serviço e data do agendamento.');
  const result = await query(
    `update tenant_agenda_items
        set tutor_name = $3,
            pet_name = $4,
            service_name = $5,
            staff_name = $6,
            phone = $7,
            scheduled_at = $8,
            status = $9,
            notes = $10,
            breed = $11,
            size = $12,
            unit_name = $13,
            updated_at = now()
      where tenant_id = $1 and id = $2
      returning *`,
    [tenantId, agendaId, tutorName, petName, serviceName, clean(payload.staff_name || payload.staffName), clean(payload.phone), scheduledAt, normalizeStatus(payload.status, ['confirmado','pendente','checkin','concluido'], 'pendente'), clean(payload.notes), clean(payload.breed), clean(payload.size), clean(payload.unit_name || payload.unitName) || 'Unidade Centro']
  );
  if (!result.rows.length) throw new Error('Agendamento não encontrado.');
  return result.rows[0];
}

export async function moveAgendaItem(tenantId, agendaId, payload) {
  await ensureManagementSchema();
  const scheduledAt = toIsoOrNull(payload.scheduled_at || payload.scheduledAt);
  if (!scheduledAt) throw new Error('Informe a nova data do agendamento.');
  const result = await query('update tenant_agenda_items set scheduled_at = $3, updated_at = now() where tenant_id = $1 and id = $2 returning id', [tenantId, agendaId, scheduledAt]);
  if (!result.rows.length) throw new Error('Agendamento não encontrado.');
  return { id: agendaId };
}

export async function checkinAgendaItem(tenantId, agendaId) {
  await ensureManagementSchema();
  const result = await query("update tenant_agenda_items set status = 'checkin', updated_at = now() where tenant_id = $1 and id = $2 returning id", [tenantId, agendaId]);
  if (!result.rows.length) throw new Error('Agendamento não encontrado.');
  return { id: agendaId };
}

export async function deleteAgendaItem(tenantId, agendaId) {
  await ensureManagementSchema();
  const result = await query('delete from tenant_agenda_items where tenant_id = $1 and id = $2 returning id', [tenantId, agendaId]);
  if (!result.rows.length) throw new Error('Agendamento não encontrado.');
  return { id: agendaId };
}

export async function getManagementMeta(tenantId) {
  await ensureManagementSchema();
  await seedRoles(tenantId);
  await seedServices(tenantId);
  await seedPetMeta(tenantId);
  const [tutors, roles, services, petTypes, petSizes, petBreeds, petPreferences] = await Promise.all([
    query('select id, full_name from tenant_tutors where tenant_id = $1 and is_active = true order by full_name asc', [tenantId]),
    query('select id, name from tenant_roles where tenant_id = $1 order by name asc', [tenantId]),
    query('select id, name from tenant_services where tenant_id = $1 order by name asc', [tenantId]),
    query('select id, name, description from tenant_pet_types where tenant_id = $1 and is_active = true order by name asc', [tenantId]),
    query('select id, name, description from tenant_pet_sizes where tenant_id = $1 and is_active = true order by name asc', [tenantId]),
    query('select id, pet_type_id, name, description from tenant_pet_breeds where tenant_id = $1 and is_active = true order by name asc', [tenantId]),
    query('select id, name, description from tenant_pet_preferences where tenant_id = $1 and is_active = true order by name asc', [tenantId])
  ]);
  return { tutors: tutors.rows, roles: roles.rows, services: services.rows, pet_types: petTypes.rows, pet_sizes: petSizes.rows, pet_breeds: petBreeds.rows, pet_preferences: petPreferences.rows };
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
