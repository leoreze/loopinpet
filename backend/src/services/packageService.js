import { query } from '../config/db.js';
import { createAgendaItem, ensureManagementSchema } from './managementService.js';

function clean(v){return String(v ?? '').trim();}
function toMoneyCents(v){const n=Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n)?Math.round(n*100):0;}
function toDate(value){const raw=clean(value); if(!raw) return null; if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw; const d=new Date(raw); if(Number.isNaN(d.getTime())) return null; return d.toISOString().slice(0,10);} 
function toBool(v){return v===true || v==='true' || v===1 || v==='1' || v==='on';}
function parseArray(v){ if(Array.isArray(v)) return v; if(!v) return []; if(typeof v==='string'){ try{const p=JSON.parse(v); return Array.isArray(p)?p:[];}catch{return [];} } return []; }
function normalizeName(v){ return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }

export async function ensurePackageSchema(){
  await ensureManagementSchema();
  await query(`
    create table if not exists tenant_package_templates (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name varchar(160) not null,
      description text,
      price_cents integer not null default 0,
      price_without_discount_cents integer not null default 0,
      discount_percent numeric(6,2) not null default 0,
      pet_size_id uuid references tenant_pet_sizes(id) on delete set null,
      pet_size_label varchar(120),
      appointments_per_period integer not null default 0,
      validity_days integer not null default 30,
      recurrence_type varchar(20) not null default 'none',
      status varchar(20) not null default 'ativo',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, name)
    );
    create table if not exists tenant_package_template_items (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      template_id uuid not null references tenant_package_templates(id) on delete cascade,
      service_id uuid references tenant_services(id) on delete set null,
      service_name varchar(160) not null,
      quantity integer not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists tenant_customer_packages (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      tutor_id uuid references tenant_tutors(id) on delete set null,
      pet_id uuid references tenant_pets(id) on delete set null,
      template_id uuid references tenant_package_templates(id) on delete set null,
      package_name varchar(160) not null,
      tutor_name varchar(180) not null,
      pet_name varchar(140) not null,
      start_date date not null,
      end_date date not null,
      recurrence_type varchar(20) not null default 'none',
      total_without_discount_cents integer not null default 0,
      total_with_discount_cents integer not null default 0,
      discount_percent numeric(6,2) not null default 0,
      appointments_per_period integer not null default 0,
      schedule_time varchar(5),
      auto_appointments_generated integer not null default 0,
      auto_renew boolean not null default false,
      contract_accepted boolean not null default false,
      contract_accepted_at timestamptz,
      contract_acceptance_name varchar(180),
      contract_snapshot_html text,
      status varchar(20) not null default 'ativo',
      notes text,
      next_charge_date date,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists tenant_customer_package_items (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      customer_package_id uuid not null references tenant_customer_packages(id) on delete cascade,
      service_id uuid references tenant_services(id) on delete set null,
      service_name varchar(160) not null,
      total_quantity integer not null default 1,
      used_quantity integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists tenant_package_payments (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      customer_package_id uuid not null references tenant_customer_packages(id) on delete cascade,
      amount_cents integer not null default 0,
      status varchar(20) not null default 'paid',
      payment_method varchar(30),
      due_date date,
      paid_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists tenant_package_usages (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      customer_package_id uuid not null references tenant_customer_packages(id) on delete cascade,
      customer_package_item_id uuid not null references tenant_customer_package_items(id) on delete cascade,
      appointment_id uuid references tenant_agenda_items(id) on delete set null,
      service_id uuid references tenant_services(id) on delete set null,
      service_name varchar(160) not null,
      used_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );
    alter table tenant_package_templates add column if not exists price_without_discount_cents integer not null default 0;
    alter table tenant_package_templates add column if not exists discount_percent numeric(6,2) not null default 0;
    alter table tenant_package_templates add column if not exists pet_size_id uuid references tenant_pet_sizes(id) on delete set null;
    alter table tenant_package_templates add column if not exists pet_size_label varchar(120);
    alter table tenant_package_templates add column if not exists appointments_per_period integer not null default 0;
    alter table tenant_customer_packages add column if not exists total_without_discount_cents integer not null default 0;
    alter table tenant_customer_packages add column if not exists appointments_per_period integer not null default 0;
    alter table tenant_customer_packages add column if not exists schedule_time varchar(5);
    alter table tenant_customer_packages add column if not exists auto_appointments_generated integer not null default 0;
    alter table tenant_customer_packages add column if not exists total_with_discount_cents integer not null default 0;
    alter table tenant_customer_packages add column if not exists discount_percent numeric(6,2) not null default 0;
    alter table tenant_customer_packages add column if not exists auto_renew boolean not null default false;
    alter table tenant_customer_packages add column if not exists contract_accepted boolean not null default false;
    alter table tenant_customer_packages add column if not exists contract_accepted_at timestamptz;
    alter table tenant_customer_packages add column if not exists contract_acceptance_name varchar(180);
    alter table tenant_customer_packages add column if not exists contract_snapshot_html text;
    alter table tenant_agenda_items add column if not exists package_usage_json jsonb not null default '[]'::jsonb;
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
    create index if not exists idx_package_templates_tenant on tenant_package_templates(tenant_id, status);
    create index if not exists idx_customer_packages_tenant on tenant_customer_packages(tenant_id, status, end_date);
    create index if not exists idx_customer_package_items_tenant on tenant_customer_package_items(tenant_id, customer_package_id);
    create index if not exists idx_package_usages_tenant on tenant_package_usages(tenant_id, customer_package_id, used_at desc);
  `);
}

async function seedPackageTemplates(tenantId){
  const count = await query('select count(*)::int as total from tenant_package_templates where tenant_id = $1',[tenantId]);
  if(Number(count.rows[0]?.total||0)>0) return;
  const serviceRows = await query('select id, name from tenant_services where tenant_id = $1 order by created_at asc limit 6',[tenantId]);
  const byName = new Map(serviceRows.rows.map(r=>[r.name.toLowerCase(), r]));
  const banho = byName.get('banho') || serviceRows.rows[0];
  const tosa = byName.get('banho e tosa') || serviceRows.rows[1] || serviceRows.rows[0];
  const hidrat = byName.get('hidratação') || serviceRows.rows[2] || serviceRows.rows[0];
  const packs = [
    {name:'Banho Essencial 4x', description:'Pacote mensal com 4 banhos para reforçar recorrência.', price:19900, validity:30, recurrence:'monthly', appointments:4, items:[{service:banho, qty:4}]},
    {name:'Spa & Cuidado', description:'Banhos recorrentes com hidratação inclusa.', price:25900, validity:30, recurrence:'monthly', appointments:4, items:[{service:banho, qty:4},{service:hidrat, qty:1}]},
    {name:'Banho + Tosa Premium', description:'Combinação para pets que precisam de manutenção completa.', price:32900, validity:45, recurrence:'none', appointments:4, items:[{service:tosa, qty:2},{service:banho, qty:2}]}
  ];
  for(const pack of packs){
    const insert = await query(`insert into tenant_package_templates (tenant_id,name,description,price_cents,price_without_discount_cents,discount_percent,appointments_per_period,validity_days,recurrence_type,status,updated_at)
      values ($1,$2,$3,$4,$4,0,$5,$6,$7,'ativo',now()) on conflict (tenant_id,name) do update set description=excluded.description returning id`,
      [tenantId, pack.name, pack.description, pack.price, Number(pack.appointments || 0), pack.validity, pack.recurrence]);
    const templateId = insert.rows[0].id;
    await query('delete from tenant_package_template_items where tenant_id = $1 and template_id = $2',[tenantId, templateId]);
    for(const item of pack.items.filter(i=>i.service)){
      await query(`insert into tenant_package_template_items (tenant_id, template_id, service_id, service_name, quantity, updated_at)
        values ($1,$2,$3,$4,$5,now())`, [tenantId, templateId, item.service.id, item.service.name, item.qty]);
    }
  }
}

function normalizeTemplatePayload(payload, serviceCatalog = []){
  const items = parseArray(payload.items).map(item=>({
    service_id: clean(item.service_id || item.serviceId),
    service_name: clean(item.service_name || item.serviceName || item.name),
    quantity: Math.max(1, Number(item.quantity || 1) || 1)
  })).filter(item=>item.service_id || item.service_name);
  const discountPercentRaw = Number(payload.discount_percent ?? payload.discountPercent ?? 0);
  const discount_percent = Number.isFinite(discountPercentRaw) ? Math.min(100, Math.max(0, discountPercentRaw)) : 0;
  const catalog = Array.isArray(serviceCatalog) ? serviceCatalog : [];
  const subtotal_cents = items.reduce((acc, item) => {
    const service = catalog.find(entry => String(entry.id) === String(item.service_id));
    return acc + (Number(service?.price_cents || 0) * Number(item.quantity || 1));
  }, 0);
  const discounted_cents = Math.max(0, Math.round(subtotal_cents * (1 - (discount_percent / 100))));
  return {
    name: clean(payload.name),
    description: clean(payload.description),
    price_cents: discounted_cents,
    price_without_discount_cents: subtotal_cents,
    discount_percent,
    pet_size_id: clean(payload.pet_size_id || payload.petSizeId) || null,
    pet_size_label: clean(payload.pet_size_label || payload.petSizeLabel || payload.pet_size || payload.petSize) || null,
    appointments_per_period: Math.max(0, Number(payload.appointments_per_period || payload.appointmentsPerPeriod || 0) || 0),
    validity_days: Math.max(1, Number(payload.validity_days || payload.validityDays || 30) || 30),
    recurrence_type: ['none','monthly'].includes(clean(payload.recurrence_type || payload.recurrenceType).toLowerCase()) ? clean(payload.recurrence_type || payload.recurrenceType).toLowerCase() : 'none',
    status: ['ativo','inativo'].includes(clean(payload.status).toLowerCase()) ? clean(payload.status).toLowerCase() : 'ativo',
    items
  };
}

export async function listPackageDashboard(tenantId){
  await ensurePackageSchema();
  await seedPackageTemplates(tenantId);
  const [templates, sold, services, tutors, pets, petSizes, staffUsers] = await Promise.all([
    query(`select t.*, coalesce((select count(*) from tenant_customer_packages cp where cp.tenant_id=t.tenant_id and cp.template_id=t.id and cp.status='ativo'),0)::int as active_customers,
                 coalesce((select json_agg(json_build_object('id',i.id,'service_id',i.service_id,'service_name',i.service_name,'quantity',i.quantity) order by i.created_at asc) from tenant_package_template_items i where i.template_id=t.id), '[]'::json) as items
            from tenant_package_templates t where tenant_id = $1 order by created_at desc`, [tenantId]),
    query(`select cp.*,
                 coalesce((select json_agg(json_build_object('id',i.id,'service_id',i.service_id,'service_name',i.service_name,'total_quantity',i.total_quantity,'used_quantity',i.used_quantity) order by i.created_at asc) from tenant_customer_package_items i where i.customer_package_id=cp.id), '[]'::json) as items,
                 coalesce((select json_agg(json_build_object('id',p.id,'amount_cents',p.amount_cents,'status',p.status,'payment_method',p.payment_method,'due_date',p.due_date,'paid_at',p.paid_at) order by p.created_at desc) from tenant_package_payments p where p.customer_package_id=cp.id), '[]'::json) as payments
            from tenant_customer_packages cp where tenant_id = $1 order by created_at desc`, [tenantId]),
    query(`select s.id, s.name, s.category, s.price_cents, s.duration_minutes, s.pet_size_id, s.pet_size_label, ps.name as pet_size_name
      from tenant_services s
      left join tenant_pet_sizes ps on ps.id = s.pet_size_id and ps.tenant_id = s.tenant_id
      where s.tenant_id = $1 and s.status = $2
      order by s.name asc`,[tenantId,'ativo']),
    query('select id, full_name, phone from tenant_tutors where tenant_id = $1 and is_active = true order by full_name asc',[tenantId]),
    query('select id, tutor_id, name, breed, size, size_id from tenant_pets where tenant_id = $1 and is_active = true order by name asc',[tenantId]),
    query('select id, name, description from tenant_pet_sizes where tenant_id = $1 and is_active = true order by name asc',[tenantId]),
    query("select id, full_name, email from tenant_users where tenant_id = $1 and is_active = true order by full_name asc", [tenantId])
  ]);
  const soldRows = sold.rows.map(row=>({
    ...row,
    items: row.items || [],
    payments: row.payments || [],
    balance_total: (row.items || []).reduce((acc,i)=>acc + Math.max(0, Number(i.total_quantity||0)-Number(i.used_quantity||0)),0),
    balance_used: (row.items || []).reduce((acc,i)=>acc + Number(i.used_quantity||0),0)
  }));
  return {
    templates: templates.rows,
    customer_packages: soldRows,
    services: services.rows,
    tutors: tutors.rows,
    pets: pets.rows,
    pet_sizes: petSizes.rows,
    staff_users: staffUsers.rows,
    metrics: {
      templates_total: templates.rows.length,
      active_packages: soldRows.filter(r=>r.status === 'ativo').length,
      recurring_packages: soldRows.filter(r=>r.recurrence_type === 'monthly' && r.status === 'ativo').length,
      receivable_cents: soldRows.reduce((acc,row)=> acc + (row.payments || []).filter(p=>p.status !== 'paid').reduce((sum,p)=>sum + Number(p.amount_cents||0),0),0)
    }
  };
}

export async function createPackageTemplate(tenantId,payload){
  await ensurePackageSchema();
  const servicesCatalog = (await query('select id, price_cents from tenant_services where tenant_id=$1',[tenantId])).rows;
  const item = normalizeTemplatePayload(payload, servicesCatalog);
  if(!item.name) throw new Error('Informe o nome do pacote.');
  if(!item.items.length) throw new Error('Adicione ao menos um serviço no pacote.');
  const duplicate = await query('select id from tenant_package_templates where tenant_id=$1 and lower(name)=lower($2) limit 1',[tenantId,item.name]);
  if(duplicate.rows[0]) throw new Error('Já existe um pacote com esse nome.');
  const result = await query(`insert into tenant_package_templates (tenant_id,name,description,price_cents,price_without_discount_cents,discount_percent,pet_size_id,pet_size_label,appointments_per_period,validity_days,recurrence_type,status,updated_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()) returning *`, [tenantId,item.name,item.description,item.price_cents,item.price_without_discount_cents,item.discount_percent,item.pet_size_id,item.pet_size_label,item.appointments_per_period,item.validity_days,item.recurrence_type,item.status]);
  const template = result.rows[0];
  for(const entry of item.items){
    const service = entry.service_id ? await query('select id, name from tenant_services where tenant_id=$1 and id=$2 limit 1',[tenantId,entry.service_id]) : {rows:[]};
    await query(`insert into tenant_package_template_items (tenant_id,template_id,service_id,service_name,quantity,updated_at)
      values ($1,$2,$3,$4,$5,now())`, [tenantId,template.id,service.rows[0]?.id || null, service.rows[0]?.name || entry.service_name, entry.quantity]);
  }
  return (await listPackageDashboard(tenantId)).templates.find(t=>t.id===template.id);
}

export async function updatePackageTemplate(tenantId, templateId, payload){
  await ensurePackageSchema();
  const servicesCatalog = (await query('select id, price_cents from tenant_services where tenant_id=$1',[tenantId])).rows;
  const item = normalizeTemplatePayload(payload, servicesCatalog);
  if(!item.name) throw new Error('Informe o nome do pacote.');
  if(!item.items.length) throw new Error('Adicione ao menos um serviço no pacote.');
  const duplicate = await query('select id from tenant_package_templates where tenant_id=$1 and lower(name)=lower($2) and id<>$3 limit 1',[tenantId,item.name,templateId]);
  if(duplicate.rows[0]) throw new Error('Já existe um pacote com esse nome.');
  const result = await query(`update tenant_package_templates set name=$3, description=$4, price_cents=$5, price_without_discount_cents=$6, discount_percent=$7, pet_size_id=$8, pet_size_label=$9, appointments_per_period=$10, validity_days=$11, recurrence_type=$12, status=$13, updated_at=now()
     where tenant_id=$1 and id=$2 returning *`, [tenantId, templateId, item.name, item.description, item.price_cents, item.price_without_discount_cents, item.discount_percent, item.pet_size_id, item.pet_size_label, item.appointments_per_period, item.validity_days, item.recurrence_type, item.status]);
  if(!result.rows[0]) throw new Error('Pacote não encontrado.');
  await query('delete from tenant_package_template_items where tenant_id=$1 and template_id=$2',[tenantId, templateId]);
  for(const entry of item.items){
    const service = entry.service_id ? await query('select id, name from tenant_services where tenant_id=$1 and id=$2 limit 1',[tenantId,entry.service_id]) : {rows:[]};
    await query(`insert into tenant_package_template_items (tenant_id,template_id,service_id,service_name,quantity,updated_at)
      values ($1,$2,$3,$4,$5,now())`, [tenantId,templateId,service.rows[0]?.id || null, service.rows[0]?.name || entry.service_name, entry.quantity]);
  }
  return (await listPackageDashboard(tenantId)).templates.find(t=>t.id===templateId);
}


function normalizeScheduleTime(value) {
  const raw = clean(value);
  if (!raw) return '09:00';
  const match = raw.match(/^(\d{2}):(\d{2})/);
  if (!match) return '09:00';
  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const minute = Math.max(0, Math.min(59, Number(match[2])));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function buildPackageAppointmentGroups(template) {
  const totalAppointments = Math.max(0, Number(template?.appointments_per_period || 0));
  if (!totalAppointments) return [];
  const groups = Array.from({ length: totalAppointments }, (_, index) => ({
    index,
    items: []
  }));
  let cursor = 0;
  for (const item of template?.items || []) {
    const qty = Math.max(1, Number(item.quantity || 1) || 1);
    for (let i = 0; i < qty; i += 1) {
      groups[cursor % totalAppointments].items.push({
        service_id: item.service_id || null,
        service_name: item.service_name || 'Serviço do pacote'
      });
      cursor += 1;
    }
  }
  return groups.filter((group) => group.items.length);
}

function buildDistributedScheduleDates(startDate, totalAppointments) {
  const start = new Date(`${startDate}T12:00:00`);
  const safeAppointments = Math.max(1, Number(totalAppointments || 1));
  return Array.from({ length: safeAppointments }, (_, index) => {
    const current = new Date(start);
    current.setDate(current.getDate() + (index * 7));
    return current.toISOString().slice(0, 10);
  });
}

async function createAutomaticPackageAppointments(tenantId, context) {
  const { template, tutor, pet, customerPackageId, startDate, scheduleTime, paymentStatus, paymentMethod, staffUserId, staffName } = context;
  const groups = buildPackageAppointmentGroups(template);
  if (!groups.length) return [];
  const scheduleDates = buildDistributedScheduleDates(startDate, groups.length);
  const created = [];
  for (const group of groups) {
    const date = scheduleDates[group.index] || startDate;
    const templateItems = Array.isArray(template.items) ? template.items : [];
    const serviceMap = new Map(templateItems.map((entry) => [String(entry.service_id || entry.service_name || Math.random()), entry]));
    const services = group.items.map((item) => {
      const ref = serviceMap.get(String(item.service_id || item.service_name)) || templateItems.find((entry) => String(entry.service_name) === String(item.service_name)) || {};
      return {
        id: item.service_id || null,
        service_id: item.service_id || null,
        name: item.service_name,
        service_name: item.service_name,
        price_cents: Number(ref.price_cents || 0),
        duration_minutes: Number(ref.duration_minutes || 0),
        category: ref.category || ''
      };
    });
    const serviceNames = services.map((item) => item.name || item.service_name).filter(Boolean);
    const sessionNumber = group.index + 1;
    const notes = [`📦 Pacote ${template.name}`, `Sessão ${sessionNumber} de ${groups.length}`, sessionNumber === groups.length ? '🔁 Última sessão • confirmar renovação automática?' : ''].filter(Boolean).join(' • ');
    const agendaItem = await createAgendaItem(tenantId, {
      tutor_id: tutor.id,
      pet_id: pet.id,
      tutor_name: tutor.full_name,
      pet_name: pet.name,
      phone: tutor.phone || '',
      scheduled_at: `${date}T${scheduleTime}:00`,
      status: 'agendado',
      notes,
      breed: pet.breed || '',
      size: pet.size || '',
      payment_status: paymentStatus === 'paid' ? 'pago' : 'pendente',
      payment_method: paymentMethod || '',
      services,
      service_name: serviceNames.join(' • '),
      staff_user_id: staffUserId || null,
      staff_name: staffName || '',
      booking_origin: 'pacote',
      customer_package_id: customerPackageId,
      package_name: template.name,
      package_session_number: sessionNumber,
      package_session_total: groups.length,
      is_last_package_session: sessionNumber === groups.length,
      package_discount_percent: Number(template.discount_percent || 0),
      package_total_without_discount_cents: Number(template.price_without_discount_cents || template.price_cents || 0),
      package_total_with_discount_cents: Number(template.price_cents || 0),
      package_snapshot_json: {
        template_id: template.id,
        package_name: template.name,
        discount_percent: Number(template.discount_percent || 0),
        total_without_discount_cents: Number(template.price_without_discount_cents || template.price_cents || 0),
        total_with_discount_cents: Number(template.price_cents || 0),
        session_number: sessionNumber,
        session_total: groups.length,
        services: templateItems.map((entry) => ({ service_id: entry.service_id || null, service_name: entry.service_name || 'Serviço', quantity: Number(entry.quantity || 1), price_cents: Number(entry.price_cents || 0), duration_minutes: Number(entry.duration_minutes || 0), category: entry.category || '' })),
        session_services: services
      }
    });
    created.push({ id: agendaItem?.id || null, scheduled_at: agendaItem?.scheduled_at || `${date}T${scheduleTime}:00`, services: serviceNames });
  }
  await query(`update tenant_customer_packages set auto_appointments_generated = $3, updated_at = now() where tenant_id=$1 and id=$2`, [tenantId, customerPackageId, created.length]);
  return created;
}

export async function createCustomerPackage(tenantId, payload){
  await ensurePackageSchema();
  const templateId = clean(payload.template_id || payload.templateId);
  const tutorId = clean(payload.tutor_id || payload.tutorId);
  const petId = clean(payload.pet_id || payload.petId);
  const startDate = toDate(payload.start_date || payload.startDate) || new Date().toISOString().slice(0,10);
  const paymentMethod = clean(payload.payment_method || payload.paymentMethod);
  const paymentStatus = ['pending','paid','failed'].includes(clean(payload.payment_status || payload.paymentStatus).toLowerCase()) ? clean(payload.payment_status || payload.paymentStatus).toLowerCase() : 'paid';
  const staffUserId = clean(payload.staff_user_id || payload.staffUserId) || null;
  const scheduleTime = normalizeScheduleTime(payload.schedule_time || payload.scheduleTime || payload.start_time || payload.startTime);
  const notes = clean(payload.notes);
  const autoRenew = toBool(payload.auto_renew || payload.autoRenew);
  const contractAccepted = toBool(payload.contract_accepted || payload.contractAccepted);
  const contractAcceptanceName = clean(payload.contract_acceptance_name || payload.contractAcceptanceName) || clean(payload.client_name || payload.clientName);
  const contractSnapshotHtml = clean(payload.contract_snapshot_html || payload.contractSnapshotHtml || payload.contract_html || payload.contractHtml);
  if(!templateId || !tutorId || !petId) throw new Error('Selecione pacote, tutor e pet para vender o pacote.');
  if(!contractAccepted) throw new Error('É preciso dar aceite no termo do contrato antes de fechar o pacote.');
  const templateResult = await query(`select t.*, coalesce((select json_agg(json_build_object('service_id',i.service_id,'service_name',i.service_name,'quantity',i.quantity,'price_cents',coalesce(s.price_cents,0),'duration_minutes',coalesce(s.duration_minutes,0),'category',coalesce(s.category,'')) order by i.created_at asc) from tenant_package_template_items i left join tenant_services s on s.id = i.service_id and s.tenant_id = i.tenant_id where i.template_id=t.id), '[]'::json) as items
    from tenant_package_templates t where tenant_id=$1 and id=$2 limit 1`, [tenantId, templateId]);
  const template = templateResult.rows[0];
  if(!template) throw new Error('Pacote não encontrado.');
  const tutor = (await query('select id, full_name, phone from tenant_tutors where tenant_id=$1 and id=$2 limit 1',[tenantId,tutorId])).rows[0];
  const pet = (await query('select id, name, breed, size, size_id from tenant_pets where tenant_id=$1 and id=$2 limit 1',[tenantId,petId])).rows[0];
  const staff = staffUserId ? (await query('select id, full_name from tenant_users where tenant_id=$1 and id=$2 and is_active = true limit 1', [tenantId, staffUserId])).rows[0] : null;
  if(!tutor || !pet) throw new Error('Tutor ou pet não encontrado para a venda do pacote.');
  if (template.pet_size_id && String(pet.size_id || '') !== String(template.pet_size_id)) throw new Error('O pet selecionado não corresponde ao porte configurado neste pacote.');
  if (!template.pet_size_id && template.pet_size_label && normalizeName(pet.size || '') !== normalizeName(template.pet_size_label || '')) throw new Error('O pet selecionado não corresponde ao porte configurado neste pacote.');
  const endDate = new Date(startDate+'T12:00:00'); endDate.setDate(endDate.getDate() + Number(template.validity_days || 30));
  const end = endDate.toISOString().slice(0,10);
  const nextCharge = String(template.recurrence_type) === 'monthly' ? end : null;
  const insert = await query(`insert into tenant_customer_packages (tenant_id,tutor_id,pet_id,template_id,package_name,tutor_name,pet_name,start_date,end_date,recurrence_type,total_without_discount_cents,total_with_discount_cents,discount_percent,appointments_per_period,schedule_time,auto_renew,contract_accepted,contract_accepted_at,contract_acceptance_name,contract_snapshot_html,status,notes,next_charge_date,updated_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now(),$18,$19,'ativo',$20,$21,now()) returning *`, [tenantId,tutorId,petId,templateId,template.name,tutor.full_name,pet.name,startDate,end,template.recurrence_type,Number(template.price_without_discount_cents || template.price_cents || 0),Number(template.price_cents || 0),Number(template.discount_percent || 0),Number(template.appointments_per_period || 0),scheduleTime,autoRenew,contractAccepted,contractAcceptanceName,contractSnapshotHtml,notes,nextCharge]);
  const customerPackage = insert.rows[0];
  for(const entry of template.items || []){
    await query(`insert into tenant_customer_package_items (tenant_id, customer_package_id, service_id, service_name, total_quantity, used_quantity, updated_at)
      values ($1,$2,$3,$4,$5,0,now())`, [tenantId, customerPackage.id, entry.service_id, entry.service_name, Number(entry.quantity || 1)]);
  }
  await query(`insert into tenant_package_payments (tenant_id, customer_package_id, amount_cents, status, payment_method, due_date, paid_at, updated_at)
    values ($1,$2,$3,$4,$5,$6,${paymentStatus === 'paid' ? 'now()' : 'null'},now())`, [tenantId, customerPackage.id, Number(template.price_cents || 0), paymentStatus, paymentMethod || null, startDate]);
  try {
    if (Number(template.appointments_per_period || 0) > 0) {
      await createAutomaticPackageAppointments(tenantId, {
        template,
        tutor,
        pet,
        customerPackageId: customerPackage.id,
        startDate,
        scheduleTime,
        paymentStatus,
        paymentMethod,
        staffUserId: staff?.id || null,
        staffName: staff?.full_name || ''
      });
    }
  } catch (error) {
    await query(`update tenant_customer_packages set notes = trim(coalesce(notes,'') || E'\nAgendamentos automáticos pendentes: ' || $3), updated_at = now() where tenant_id=$1 and id=$2`, [tenantId, customerPackage.id, clean(error.message || 'Não foi possível gerar automaticamente os agendamentos do pacote.')]);
  }
  return (await getCustomerPackageById(tenantId, customerPackage.id));
}

export async function getCustomerPackageById(tenantId,id){
  await ensurePackageSchema();
  const result = await query(`select cp.*,
      coalesce((select json_agg(json_build_object('id',i.id,'service_id',i.service_id,'service_name',i.service_name,'total_quantity',i.total_quantity,'used_quantity',i.used_quantity) order by i.created_at asc) from tenant_customer_package_items i where i.customer_package_id=cp.id), '[]'::json) as items,
      coalesce((select json_agg(json_build_object('id',p.id,'amount_cents',p.amount_cents,'status',p.status,'payment_method',p.payment_method,'due_date',p.due_date,'paid_at',p.paid_at) order by p.created_at desc) from tenant_package_payments p where p.customer_package_id=cp.id), '[]'::json) as payments,
      coalesce((select json_agg(json_build_object('id',u.id,'appointment_id',u.appointment_id,'service_id',u.service_id,'service_name',u.service_name,'used_at',u.used_at) order by u.used_at desc) from tenant_package_usages u where u.customer_package_id=cp.id), '[]'::json) as usages,
      coalesce((select json_agg(json_build_object('id',a.id,'scheduled_at',a.scheduled_at,'service_name',a.service_name,'status',a.status,'payment_status',a.payment_status,'payment_method',a.payment_method,'package_session_number',a.package_session_number,'package_session_total',a.package_session_total,'is_last_package_session',a.is_last_package_session,'services_json',a.services_json,'package_total_without_discount_cents',a.package_total_without_discount_cents,'package_total_with_discount_cents',a.package_total_with_discount_cents,'package_discount_percent',a.package_discount_percent) order by a.scheduled_at asc) from tenant_agenda_items a where a.tenant_id=cp.tenant_id and a.customer_package_id=cp.id), '[]'::json) as appointments
      from tenant_customer_packages cp where tenant_id=$1 and id=$2 limit 1`, [tenantId,id]);
  const row = result.rows[0];
  if(!row) throw new Error('Pacote vendido não encontrado.');
  return {
    ...row,
    items: row.items || [],
    payments: row.payments || [],
    usages: row.usages || [],
    appointments: row.appointments || [],
    balance_total: (row.items || []).reduce((acc,i)=>acc + Math.max(0, Number(i.total_quantity||0)-Number(i.used_quantity||0)),0)
  };
}

export async function updateCustomerPackage(tenantId,id,payload){
  await ensurePackageSchema();
  const status = clean(payload.status).toLowerCase();
  const notes = payload.notes !== undefined ? clean(payload.notes) : undefined;
  const nextChargeDate = payload.next_charge_date !== undefined ? toDate(payload.next_charge_date) : undefined;
  const current = await getCustomerPackageById(tenantId,id);
  const result = await query(`update tenant_customer_packages set status=$3, notes=$4, next_charge_date=$5, updated_at=now() where tenant_id=$1 and id=$2 returning id`,
    [tenantId, id, ['ativo','cancelado','vencido'].includes(status)?status:current.status, notes ?? current.notes, nextChargeDate ?? current.next_charge_date]);
  if(!result.rows[0]) throw new Error('Pacote vendido não encontrado.');
  return getCustomerPackageById(tenantId,id);
}

export async function listAvailablePackagesForPet(tenantId, petId){
  await ensurePackageSchema();
  const today = new Date().toISOString().slice(0,10);
  const result = await query(`select cp.id, cp.package_name, cp.end_date, cp.recurrence_type,
      coalesce((select json_agg(json_build_object('id',i.id,'service_id',i.service_id,'service_name',i.service_name,'remaining_quantity', greatest(i.total_quantity - i.used_quantity,0)) order by i.created_at asc) from tenant_customer_package_items i where i.customer_package_id=cp.id and (i.total_quantity - i.used_quantity) > 0), '[]'::json) as items
      from tenant_customer_packages cp
      where cp.tenant_id=$1 and cp.pet_id=$2 and cp.status='ativo' and cp.end_date >= $3
      order by cp.end_date asc, cp.created_at desc`, [tenantId, petId, today]);
  return result.rows.map(row=>({...row, items: row.items || []})).filter(row=>(row.items || []).length);
}

export async function consumePackageUsageForAppointment(tenantId, appointmentId, packageUsagePayload){
  await ensurePackageSchema();
  const selections = parseArray(packageUsagePayload).map(item=>({
    customer_package_id: clean(item.customer_package_id || item.package_id),
    service_id: clean(item.service_id),
    service_name: clean(item.service_name)
  })).filter(item=>item.customer_package_id && (item.service_id || item.service_name));
  if(!selections.length) return [];

  selections.sort((a, b) => {
    const left = `${a.customer_package_id || ''}:${a.service_id || a.service_name || ''}`.toLowerCase();
    const right = `${b.customer_package_id || ''}:${b.service_id || b.service_name || ''}`.toLowerCase();
    return left.localeCompare(right);
  });

  const results = [];
  for(const item of selections){
    const current = await query(`select cp.id, cp.end_date, cp.status, cpi.id as customer_package_item_id, cpi.service_id, cpi.service_name, cpi.total_quantity, cpi.used_quantity
      from tenant_customer_packages cp
      join tenant_customer_package_items cpi on cpi.customer_package_id = cp.id and cpi.tenant_id = cp.tenant_id
      where cp.tenant_id=$1 and cp.id=$2 and cp.status='ativo' and cp.end_date >= current_date
        and (($3::uuid is not null and cpi.service_id = $3::uuid) or (coalesce($4::text,'') <> '' and lower(cpi.service_name)=lower($4::text)))
      order by cpi.created_at asc limit 1`, [tenantId, item.customer_package_id || null, item.service_id || null, item.service_name || null]);
    const row = current.rows[0];
    if(!row) throw new Error('Pacote selecionado não está mais disponível para este serviço.');

    const decrement = await query(`update tenant_customer_package_items
      set used_quantity = used_quantity + 1,
          updated_at = now()
      where tenant_id=$1
        and id=$2
        and used_quantity < total_quantity
      returning id, service_id, service_name, used_quantity, total_quantity`, [tenantId, row.customer_package_item_id]);
    const updatedRow = decrement.rows[0];
    if(!updatedRow) throw new Error('O pacote selecionado não possui mais saldo disponível.');

    const usage = await query(`insert into tenant_package_usages (tenant_id, customer_package_id, customer_package_item_id, appointment_id, service_id, service_name)
      values ($1,$2,$3,$4,$5,$6) returning id, customer_package_id, customer_package_item_id, service_id, service_name, used_at`, [tenantId, row.id, row.customer_package_item_id, appointmentId, row.service_id, row.service_name]);
    results.push(usage.rows[0]);
  }
  await query(`update tenant_agenda_items set package_usage_json = coalesce(package_usage_json,'[]'::jsonb) || $3::jsonb, updated_at=now() where tenant_id=$1 and id=$2`, [tenantId, appointmentId, JSON.stringify(results)]);
  return results;
}


export async function deletePackageTemplate(tenantId, id){
  await ensurePackageSchema();
  const active = await query(`select count(*)::int as total from tenant_customer_packages where tenant_id=$1 and template_id=$2 and status='ativo'`, [tenantId, id]);
  if (Number(active.rows[0]?.total || 0) > 0) throw new Error('Existem vendas ativas vinculadas a este pacote. Cancele ou exclua as vendas antes.');
  await query(`delete from tenant_package_templates where tenant_id=$1 and id=$2`, [tenantId, id]);
  return true;
}

export async function deleteCustomerPackage(tenantId, id){
  await ensurePackageSchema();
  await query(`delete from tenant_customer_packages where tenant_id=$1 and id=$2`, [tenantId, id]);
  return true;
}
