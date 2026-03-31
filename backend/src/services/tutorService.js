import { query } from '../config/db.js';
import { ensureBaseSchema } from '../scripts/bootstrapDb.js';

function clean(value) {
  return String(value ?? '').trim();
}

function normalizeBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function mapTutorRow(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    full_name: row.full_name,
    email: row.email || '',
    phone: row.phone || '',
    phone_secondary: row.phone_secondary || '',
    cpf: row.cpf || '',
    birth_date: row.birth_date || '',
    nationality: row.nationality || 'Brasil',
    gender: row.gender || '',
    whatsapp_opt_out: Boolean(row.whatsapp_opt_out),
    notes_internal: row.notes_internal || '',
    restrictions: row.restrictions || '',
    address_line: row.address_line || '',
    cep: row.cep || '',
    number: row.number || '',
    district: row.district || '',
    complement: row.complement || '',
    city: row.city || '',
    state: row.state || '',
    photo_url: row.photo_url || '',
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
    pet_count: Number(row.pet_count || 0),
    primary_pet_name: row.primary_pet_name || '',
    appointment_count: Number(row.appointment_count || 0),
    total_pending_cents: Number(row.total_pending_cents || 0),
    total_paid_cents: Number(row.total_paid_cents || 0)
  };
}

function mapPetRow(row) {
  return {
    id: row.id,
    tutor_id: row.tutor_id,
    name: row.name,
    species: row.species || 'Canina',
    gender: row.gender || '',
    size: row.size || '',
    size_id: row.size_id || '',
    temperament: row.temperament || '',
    breed: row.breed || '',
    photo_url: row.photo_url || '',
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    notes: row.notes || ''
  };
}

function mapDependentRow(row) {
  return {
    id: row.id,
    tutor_id: row.tutor_id,
    full_name: row.full_name || '',
    relation: row.relation || '',
    phone: row.phone || '',
    notes: row.notes || '',
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function ensureTutorSchema() {
  await ensureBaseSchema();

  await query(`
    create table if not exists tenant_tutors (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      full_name varchar(180) not null,
      email varchar(180),
      phone varchar(40),
      phone_secondary varchar(40),
      cpf varchar(20),
      birth_date varchar(20),
      nationality varchar(80),
      gender varchar(40),
      whatsapp_opt_out boolean not null default false,
      notes_internal text,
      restrictions text,
      address_line text,
      cep varchar(12),
      number varchar(20),
      district varchar(120),
      complement varchar(160),
      city varchar(120),
      state varchar(40),
      photo_url text,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_tenant_tutors_tenant_id on tenant_tutors(tenant_id);
    create index if not exists idx_tenant_tutors_full_name on tenant_tutors(tenant_id, full_name);

    create table if not exists tenant_pets (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      tutor_id uuid not null references tenant_tutors(id) on delete cascade,
      name varchar(140) not null,
      species varchar(60),
      gender varchar(40),
      size varchar(40),
      temperament varchar(60),
      breed varchar(120),
      photo_url text,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_tenant_pets_tenant_id on tenant_pets(tenant_id);
    create index if not exists idx_tenant_pets_tutor_id on tenant_pets(tutor_id);

    alter table tenant_pets add column if not exists notes text;

    create table if not exists tenant_tutor_dependents (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      tutor_id uuid not null references tenant_tutors(id) on delete cascade,
      full_name varchar(180) not null,
      relation varchar(80),
      phone varchar(40),
      notes text,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_tenant_tutor_dependents_tenant_id on tenant_tutor_dependents(tenant_id);
    create index if not exists idx_tenant_tutor_dependents_tutor_id on tenant_tutor_dependents(tutor_id);

  `);
}

export async function listTutors(tenantId, filters = {}) {
  await ensureTutorSchema();

  const search = clean(filters.search);
  const status = clean(filters.status || 'active');
  const values = [tenantId];
  const conditions = ['t.tenant_id = $1'];

  if (status === 'active') conditions.push('t.is_active = true');
  if (status === 'inactive') conditions.push('t.is_active = false');
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(
      t.full_name ilike $${values.length}
      or coalesce(t.phone, '') ilike $${values.length}
      or coalesce(t.email, '') ilike $${values.length}
      or exists (
        select 1 from tenant_pets p
        where p.tutor_id = t.id
          and p.tenant_id = t.tenant_id
          and p.name ilike $${values.length}
      )
    )`);
  }

  const result = await query(
    `select
      t.*,
      count(p.id)::int as pet_count,
      min(p.name) filter (where p.is_active = true) as primary_pet_name,
      coalesce(agenda_metrics.appointment_count, 0)::int as appointment_count,
      coalesce(agenda_metrics.total_pending_cents, 0)::bigint as total_pending_cents,
      coalesce(agenda_metrics.total_paid_cents, 0)::bigint as total_paid_cents
     from tenant_tutors t
     left join tenant_pets p on p.tutor_id = t.id and p.tenant_id = t.tenant_id
     left join lateral (
       select
         count(a.id)::int as appointment_count,
         coalesce(sum(case when lower(coalesce(a.payment_status, '')) = 'pago' then service_totals.total_cents else 0 end), 0)::bigint as total_paid_cents,
         coalesce(sum(case when lower(coalesce(a.payment_status, '')) = 'pago' then 0 else service_totals.total_cents end), 0)::bigint as total_pending_cents
       from tenant_agenda_items a
       left join lateral (
         select coalesce(sum(coalesce(nullif(service->>'price_cents', '')::bigint, nullif(service->>'unit_price_cents', '')::bigint, 0)), 0)::bigint as total_cents
         from jsonb_array_elements(coalesce(a.services_json, '[]'::jsonb)) service
       ) service_totals on true
       where a.tenant_id = t.tenant_id
         and a.tutor_id = t.id
     ) agenda_metrics on true
     where ${conditions.join(' and ')}
     group by t.id, agenda_metrics.appointment_count, agenda_metrics.total_pending_cents, agenda_metrics.total_paid_cents
     order by t.full_name asc`,
    values
  );

  return result.rows.map(mapTutorRow);
}

export async function getTutorById(tenantId, tutorId) {
  await ensureTutorSchema();

  const tutorResult = await query(
    `select t.*, count(p.id)::int as pet_count, min(p.name) filter (where p.is_active = true) as primary_pet_name
       from tenant_tutors t
       left join tenant_pets p on p.tutor_id = t.id and p.tenant_id = t.tenant_id
      where t.tenant_id = $1 and t.id = $2
      group by t.id
      limit 1`,
    [tenantId, tutorId]
  );

  if (!tutorResult.rows.length) {
    throw new Error('Tutor não encontrado.');
  }

  const [petsResult, dependentsResult, paymentsResult] = await Promise.all([
    query(`select * from tenant_pets where tenant_id = $1 and tutor_id = $2 order by created_at asc`, [tenantId, tutorId]),
    query(`select * from tenant_tutor_dependents where tenant_id = $1 and tutor_id = $2 order by created_at asc`, [tenantId, tutorId]),
    query(
      `select id, tutor_id, tutor_name, pet_id, pet_name, service_name, staff_name, phone, scheduled_at, status, notes,
              payment_status, payment_method, ticket_code, services_json, pets_json, booking_origin, customer_package_id, package_name,
              package_session_number, package_session_total, is_last_package_session, package_discount_percent,
              package_total_without_discount_cents, package_total_with_discount_cents, package_snapshot_json
         from tenant_agenda_items
        where tenant_id = $1 and tutor_id = $2
        order by scheduled_at desc`,
      [tenantId, tutorId]
    ).catch(() => ({ rows: [] }))
  ]);

  const paymentRows = paymentsResult.rows.map((row) => {
    const services = Array.isArray(row.services_json)
      ? row.services_json
      : (() => { try { return JSON.parse(row.services_json || '[]'); } catch { return []; } })();
    const pets = Array.isArray(row.pets_json)
      ? row.pets_json
      : (() => { try { return JSON.parse(row.pets_json || '[]'); } catch { return []; } })();
    const packageSnapshot = row.package_snapshot_json && typeof row.package_snapshot_json === 'object'
      ? row.package_snapshot_json
      : (() => { try { return JSON.parse(row.package_snapshot_json || '{}'); } catch { return {}; } })();
    const isPackage = String(row.booking_origin || '').toLowerCase() === 'pacote' || !!row.customer_package_id;
    const packageServices = Array.isArray(packageSnapshot?.services) ? packageSnapshot.services : [];
    const normalizedServices = isPackage && packageServices.length
      ? packageServices.map((service) => ({
          ...service,
          name: service.service_name || service.name || row.package_name || row.service_name || 'Pacote',
          service_name: service.service_name || service.name || row.package_name || row.service_name || 'Pacote'
        }))
      : services;
    const totalCents = isPackage
      ? Number(row.package_total_with_discount_cents || 0)
      : normalizedServices.reduce((sum, service) => sum + Number(service?.price_cents || service?.unit_price_cents || 0), 0);
    return {
      id: row.id,
      tutor_id: row.tutor_id,
      tutor_name: row.tutor_name || '',
      pet_id: row.pet_id || null,
      pet_name: row.pet_name || '',
      service_name: isPackage ? (row.package_name || row.service_name || 'Pacote') : (row.service_name || ''),
      staff_name: row.staff_name || '',
      phone: row.phone || '',
      scheduled_at: row.scheduled_at,
      status: row.status || '',
      notes: row.notes || '',
      payment_status: row.payment_status || 'pendente',
      payment_method: row.payment_method || '',
      ticket_code: row.ticket_code || '',
      services: normalizedServices,
      pets,
      total_cents: totalCents,
      booking_origin: row.booking_origin || 'avulso',
      customer_package_id: row.customer_package_id || null,
      package_name: row.package_name || '',
      package_session_number: Number(row.package_session_number || 0),
      package_session_total: Number(row.package_session_total || 0),
      is_last_package_session: Boolean(row.is_last_package_session),
      package_discount_percent: Number(row.package_discount_percent || 0),
      package_total_without_discount_cents: Number(row.package_total_without_discount_cents || 0),
      package_total_with_discount_cents: Number(row.package_total_with_discount_cents || 0),
      document_type: String(row.payment_status || '').toLowerCase() === 'pago' ? 'recibo' : 'comanda'
    };
  });

  return {
    tutor: mapTutorRow(tutorResult.rows[0]),
    pets: petsResult.rows.map(mapPetRow),
    dependents: dependentsResult.rows.map(mapDependentRow),
    payments: paymentRows,
    payment_history: paymentRows
  };
}

export async function createTutor(tenantId, payload) {
  await ensureTutorSchema();

  const fullName = clean(payload.full_name || payload.fullName);
  if (!fullName) throw new Error('Informe o nome do cliente.');

  const insertResult = await query(
    `insert into tenant_tutors (
      tenant_id, full_name, email, phone, phone_secondary, cpf, birth_date, nationality, gender,
      whatsapp_opt_out, notes_internal, restrictions, address_line, cep, number, district,
      complement, city, state, photo_url, is_active
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,
      $10,$11,$12,$13,$14,$15,$16,
      $17,$18,$19,$20,$21
    ) returning id`,
    [
      tenantId,
      fullName,
      clean(payload.email).toLowerCase(),
      clean(payload.phone),
      clean(payload.phone_secondary || payload.phoneSecondary),
      clean(payload.cpf),
      clean(payload.birth_date || payload.birthDate),
      clean(payload.nationality) || 'Brasil',
      clean(payload.gender),
      normalizeBool(payload.whatsapp_opt_out ?? payload.whatsappOptOut),
      clean(payload.notes_internal || payload.notesInternal),
      clean(payload.restrictions),
      clean(payload.address_line || payload.addressLine),
      clean(payload.cep),
      clean(payload.number),
      clean(payload.district),
      clean(payload.complement),
      clean(payload.city),
      clean(payload.state),
      clean(payload.photo_url || payload.photoUrl),
      payload.is_active === undefined ? true : normalizeBool(payload.is_active)
    ]
  );

  const tutorId = insertResult.rows[0].id;

  if (Array.isArray(payload.pets)) {
    for (const pet of payload.pets) {
      const name = clean(pet.name);
      if (!name) continue;
      await query(
        `insert into tenant_pets (tenant_id, tutor_id, name, species, gender, size, temperament, breed, photo_url, is_active, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          tenantId,
          tutorId,
          name,
          clean(pet.species) || 'Canina',
          clean(pet.gender),
          clean(pet.size),
          clean(pet.temperament),
          clean(pet.breed),
          clean(pet.photo_url || pet.photoUrl),
          pet.is_active === undefined ? true : normalizeBool(pet.is_active),
          clean(pet.notes)
        ]
      );
    }
  }

  return getTutorById(tenantId, tutorId);
}

export async function updateTutor(tenantId, tutorId, payload) {
  await ensureTutorSchema();

  const fullName = clean(payload.full_name || payload.fullName);
  if (!fullName) throw new Error('Informe o nome do cliente.');

  const result = await query(
    `update tenant_tutors
        set full_name = $3,
            email = $4,
            phone = $5,
            phone_secondary = $6,
            cpf = $7,
            birth_date = $8,
            nationality = $9,
            gender = $10,
            whatsapp_opt_out = $11,
            notes_internal = $12,
            restrictions = $13,
            address_line = $14,
            cep = $15,
            number = $16,
            district = $17,
            complement = $18,
            city = $19,
            state = $20,
            photo_url = $21,
            is_active = $22,
            updated_at = now()
      where tenant_id = $1 and id = $2
      returning id`,
    [
      tenantId,
      tutorId,
      fullName,
      clean(payload.email).toLowerCase(),
      clean(payload.phone),
      clean(payload.phone_secondary || payload.phoneSecondary),
      clean(payload.cpf),
      clean(payload.birth_date || payload.birthDate),
      clean(payload.nationality) || 'Brasil',
      clean(payload.gender),
      normalizeBool(payload.whatsapp_opt_out ?? payload.whatsappOptOut),
      clean(payload.notes_internal || payload.notesInternal),
      clean(payload.restrictions),
      clean(payload.address_line || payload.addressLine),
      clean(payload.cep),
      clean(payload.number),
      clean(payload.district),
      clean(payload.complement),
      clean(payload.city),
      clean(payload.state),
      clean(payload.photo_url || payload.photoUrl),
      payload.is_active === undefined ? true : normalizeBool(payload.is_active)
    ]
  );

  if (!result.rows.length) throw new Error('Tutor não encontrado para atualização.');

  return getTutorById(tenantId, tutorId);
}

export async function toggleTutorStatus(tenantId, tutorId) {
  await ensureTutorSchema();
  const result = await query(
    `update tenant_tutors
        set is_active = not is_active,
            updated_at = now()
      where tenant_id = $1 and id = $2
      returning is_active`,
    [tenantId, tutorId]
  );
  if (!result.rows.length) throw new Error('Tutor não encontrado.');
  return { is_active: Boolean(result.rows[0].is_active) };
}


export async function updatePetForTutor(tenantId, tutorId, petId, payload) {
  await ensureTutorSchema();
  const name = clean(payload.name);
  if (!name) throw new Error('Informe o nome do pet.');
  const result = await query(
    `update tenant_pets
        set name = $4,
            species = $5,
            gender = $6,
            size = $7,
            temperament = $8,
            breed = $9,
            photo_url = $10,
            is_active = $11,
            notes = $12,
            updated_at = now()
      where tenant_id = $1 and tutor_id = $2 and id = $3
      returning id`,
    [tenantId, tutorId, petId, name, clean(payload.species) || 'Canina', clean(payload.gender), clean(payload.size), clean(payload.temperament), clean(payload.breed), clean(payload.photo_url || payload.photoUrl), payload.is_active === undefined ? true : normalizeBool(payload.is_active), clean(payload.notes)]
  );
  if (!result.rows.length) throw new Error('Pet não encontrado.');
  return getTutorById(tenantId, tutorId);
}

export async function deletePetForTutor(tenantId, tutorId, petId) {
  await ensureTutorSchema();
  const result = await query('delete from tenant_pets where tenant_id = $1 and tutor_id = $2 and id = $3 returning id', [tenantId, tutorId, petId]);
  if (!result.rows.length) throw new Error('Pet não encontrado.');
  return getTutorById(tenantId, tutorId);
}

export async function createDependentForTutor(tenantId, tutorId, payload) {
  await ensureTutorSchema();
  const fullName = clean(payload.full_name || payload.fullName || payload.name);
  if (!fullName) throw new Error('Informe o nome do dependente.');
  const tutorExists = await query('select 1 from tenant_tutors where tenant_id = $1 and id = $2 limit 1', [tenantId, tutorId]);
  if (!tutorExists.rows.length) throw new Error('Tutor não encontrado.');
  await query(
    `insert into tenant_tutor_dependents (tenant_id, tutor_id, full_name, relation, phone, notes, is_active)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [tenantId, tutorId, fullName, clean(payload.relation), clean(payload.phone), clean(payload.notes), payload.is_active === undefined ? true : normalizeBool(payload.is_active)]
  );
  return getTutorById(tenantId, tutorId);
}

export async function updateDependentForTutor(tenantId, tutorId, dependentId, payload) {
  await ensureTutorSchema();
  const fullName = clean(payload.full_name || payload.fullName || payload.name);
  if (!fullName) throw new Error('Informe o nome do dependente.');
  const result = await query(
    `update tenant_tutor_dependents
        set full_name = $4,
            relation = $5,
            phone = $6,
            notes = $7,
            is_active = $8,
            updated_at = now()
      where tenant_id = $1 and tutor_id = $2 and id = $3
      returning id`,
    [tenantId, tutorId, dependentId, fullName, clean(payload.relation), clean(payload.phone), clean(payload.notes), payload.is_active === undefined ? true : normalizeBool(payload.is_active)]
  );
  if (!result.rows.length) throw new Error('Dependente não encontrado.');
  return getTutorById(tenantId, tutorId);
}

export async function deleteDependentForTutor(tenantId, tutorId, dependentId) {
  await ensureTutorSchema();
  const result = await query('delete from tenant_tutor_dependents where tenant_id = $1 and tutor_id = $2 and id = $3 returning id', [tenantId, tutorId, dependentId]);
  if (!result.rows.length) throw new Error('Dependente não encontrado.');
  return getTutorById(tenantId, tutorId);
}

export async function addPetToTutor(tenantId, tutorId, payload) {
  await ensureTutorSchema();
  const name = clean(payload.name);
  if (!name) throw new Error('Informe o nome do pet.');

  const tutorExists = await query('select 1 from tenant_tutors where tenant_id = $1 and id = $2 limit 1', [tenantId, tutorId]);
  if (!tutorExists.rows.length) throw new Error('Tutor não encontrado.');

  const result = await query(
    `insert into tenant_pets (tenant_id, tutor_id, name, species, gender, size, temperament, breed, photo_url, is_active, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     returning id`,
    [
      tenantId,
      tutorId,
      name,
      clean(payload.species) || 'Canina',
      clean(payload.gender) || 'Fêmea',
      clean(payload.size) || 'Pequeno',
      clean(payload.temperament) || 'Dócil',
      clean(payload.breed),
      clean(payload.photo_url || payload.photoUrl),
      payload.is_active === undefined ? true : normalizeBool(payload.is_active),
      clean(payload.notes)
    ]
  );

  return getTutorById(tenantId, tutorId);
}
