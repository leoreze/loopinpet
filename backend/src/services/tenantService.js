import { query } from '../config/db.js';
import { ensureBaseSchema } from '../scripts/bootstrapDb.js';

function sanitize(value) {
  return String(value || '').trim();
}

function normalizeColor(value, fallback) {
  const color = sanitize(value);
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color) ? color : fallback;
}


async function ensureTenantBrandingColumns() {
  await query(`
    alter table tenants add column if not exists address_line text;
    alter table tenants add column if not exists address_number varchar(40);
    alter table tenants add column if not exists address_district varchar(120);
    alter table tenants add column if not exists address_city varchar(120);
    alter table tenants add column if not exists address_state varchar(40);
    alter table tenants add column if not exists address_zip varchar(20);
    alter table tenants add column if not exists address_complement text;
  `);
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
      booking_url: row.booking_url || '',
      address_line: row.address_line || '',
      address_number: row.address_number || '',
      address_district: row.address_district || '',
      address_city: row.address_city || '',
      address_state: row.address_state || '',
      address_zip: row.address_zip || '',
      address_complement: row.address_complement || ''
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
  await ensureTenantBrandingColumns();

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
      t.address_line,
      t.address_number,
      t.address_district,
      t.address_city,
      t.address_state,
      t.address_zip,
      t.address_complement,
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
  await ensureTenantBrandingColumns();

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
  const addressLine = sanitize(payload.addressLine);
  const addressNumber = sanitize(payload.addressNumber);
  const addressDistrict = sanitize(payload.addressDistrict);
  const addressCity = sanitize(payload.addressCity);
  const addressState = sanitize(payload.addressState);
  const addressZip = sanitize(payload.addressZip);
  const addressComplement = sanitize(payload.addressComplement);
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
            address_line = $13,
            address_number = $14,
            address_district = $15,
            address_city = $16,
            address_state = $17,
            address_zip = $18,
            address_complement = $19,
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
      bookingUrl,
      addressLine,
      addressNumber,
      addressDistrict,
      addressCity,
      addressState,
      addressZip,
      addressComplement
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


function centsToMoney(cents) {
  return Math.round((Number(cents || 0) / 100) * 100) / 100;
}

function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatHourMinute(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function sumServiceSnapshotCents(payload) {
  let total = 0;
  for (const item of Array.isArray(payload) ? payload : []) {
    total += Number(item?.price_cents || item?.priceCents || 0) || 0;
  }
  return total;
}

function moneyLabel(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function computeAgendaValueCents(row) {
  let totalCents = Number(row?.package_total_with_discount_cents || 0);
  if (String(row?.booking_origin || '').toLowerCase() === 'pacote' && totalCents > 0) {
    totalCents = Math.round(totalCents / Math.max(Number(row?.package_session_total || 1), 1));
  } else {
    totalCents = sumServiceSnapshotCents(Array.isArray(row?.services_json) ? row.services_json : row?.services_json || []);
  }
  return Number.isFinite(totalCents) ? totalCents : 0;
}

function startOfMonthIso(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

async function optionalQuery(sql, params = [], fallbackRows = []) {
  try {
    return await query(sql, params);
  } catch {
    return { rows: fallbackRows };
  }
}

export async function getTenantSummary(tenantId) {
  const branding = await getTenantBranding(tenantId);
  await ensureBaseSchema();
  const today = new Date();
  const todayIso = formatIsoDate(today);

  const [agendaToday, revenue7d, counts, base, packages, pendingPayments, topServices, recentAgenda] = await Promise.all([
    optionalQuery(`
      select id, scheduled_at, pet_name, tutor_name, service_name, status, payment_status, payment_method,
             booking_origin, package_name, package_total_with_discount_cents, package_session_number, package_session_total,
             services_json
      from tenant_agenda_items
      where tenant_id = $1 and scheduled_at::date = current_date
      order by scheduled_at asc
    `, [tenantId], []),
    optionalQuery(`
      select scheduled_at::date as ref_date,
             coalesce(sum(
               case
                 when booking_origin = 'pacote' and coalesce(package_total_with_discount_cents, 0) > 0
                   then greatest(package_total_with_discount_cents / greatest(package_session_total, 1), 0)
                 else coalesce((
                   select sum(coalesce((item->>'price_cents')::int, 0))
                   from jsonb_array_elements(coalesce(services_json, '[]'::jsonb)) item
                 ), 0)
               end
             ), 0)::int as total_cents
      from tenant_agenda_items
      where tenant_id = $1 and scheduled_at::date >= current_date - interval '6 day'
      group by scheduled_at::date
      order by ref_date asc
    `, [tenantId], []),
    optionalQuery(`
      select
        count(*) filter (where scheduled_at::date = current_date)::int as appointments_today,
        count(*) filter (where lower(coalesce(status,'')) in ('check_in','em_execucao','pronto_para_retirada'))::int as active_checkins,
        count(*) filter (where lower(coalesce(payment_status,'')) <> 'pago')::int as pending_payments,
        count(*) filter (where scheduled_at::date = current_date and lower(coalesce(service_name,'')) like '%day care%')::int as daycare_today
      from tenant_agenda_items
      where tenant_id = $1
    `, [tenantId], [{}]),
    Promise.all([
      optionalQuery('select count(*)::int as total from tenant_tutors where tenant_id = $1 and is_active = true', [tenantId], [{ total: 0 }]),
      optionalQuery('select count(*)::int as total from tenant_pets where tenant_id = $1 and is_active = true', [tenantId], [{ total: 0 }]),
      optionalQuery('select count(*)::int as total from tenant_services where tenant_id = $1 and status = $2', [tenantId, 'ativo'], [{ total: 0 }])
    ]),
    optionalQuery("select count(*)::int as total from tenant_customer_packages where tenant_id = $1 and status in ('ativo','active')", [tenantId], [{ total: 0 }]),
    optionalQuery(`
      select count(*)::int as total
      from tenant_agenda_items
      where tenant_id = $1
        and lower(coalesce(payment_status,'')) <> 'pago'
        and scheduled_at >= now() - interval '30 day'
    `, [tenantId], [{ total: 0 }]),
    optionalQuery(`
      select service_name, count(*)::int as total
      from tenant_agenda_items
      where tenant_id = $1 and scheduled_at >= now() - interval '30 day'
      group by service_name
      order by total desc, service_name asc
      limit 5
    `, [tenantId], []),
    optionalQuery(`
      select scheduled_at, pet_name, tutor_name, service_name, status, payment_status
      from tenant_agenda_items
      where tenant_id = $1
      order by scheduled_at desc
      limit 8
    `, [tenantId], [])
  ]);

  const todayItems = (agendaToday.rows || []).map((row) => {
    const totalCents = computeAgendaValueCents(row);
    return {
      id: row.id,
      hour: formatHourMinute(new Date(row.scheduled_at)),
      pet: row.pet_name || 'Pet',
      tutor: row.tutor_name || 'Tutor',
      service: row.package_name || row.service_name || 'Serviço',
      status: row.status || 'agendado',
      payment_status: row.payment_status || 'pendente',
      payment_method: row.payment_method || '',
      booking_origin: row.booking_origin || 'avulso',
      package_session_label: row.package_name ? `${Number(row.package_session_number || 0)} de ${Number(row.package_session_total || 0)}` : '',
      total_cents: totalCents
    };
  });

  const revenueSeries = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const ref = new Date(today);
    ref.setDate(today.getDate() - offset);
    const key = formatIsoDate(ref);
    const found = (revenue7d.rows || []).find((item) => String(item.ref_date).slice(0, 10) === key);
    revenueSeries.push({
      date: key,
      label: key.slice(8, 10) + '/' + key.slice(5, 7),
      total_cents: Number(found?.total_cents || 0),
      total: centsToMoney(found?.total_cents || 0)
    });
  }

  const appointmentsToday = Number(counts.rows?.[0]?.appointments_today || 0);
  const activeCheckins = Number(counts.rows?.[0]?.active_checkins || 0);
  const pendingPaymentsTotal = Number(pendingPayments.rows?.[0]?.total || counts.rows?.[0]?.pending_payments || 0);
  const tutorsTotal = Number(base[0].rows?.[0]?.total || 0);
  const petsTotal = Number(base[1].rows?.[0]?.total || 0);
  const servicesTotal = Number(base[2].rows?.[0]?.total || 0);
  const activePackages = Number(packages.rows?.[0]?.total || 0);
  const revenueTodayCents = todayItems.reduce((sum, item) => sum + Number(item.total_cents || 0), 0);
  const revenueWeekCents = revenueSeries.reduce((sum, item) => sum + Number(item.total_cents || 0), 0);
  const occupiedToday = Math.round(Math.max(0, Math.min(100, appointmentsToday * 12)));
  const averageTicketTodayCents = appointmentsToday ? Math.round(revenueTodayCents / Math.max(appointmentsToday, 1)) : 0;

  const alerts = [
    pendingPaymentsTotal > 0 ? {
      tone: 'warning',
      title: 'Pagamentos pendentes pedem ação rápida',
      text: `${pendingPaymentsTotal} agendamento(s) ainda estão sem baixa financeira. Priorize cobrança e ajuste de forma de pagamento.`
    } : null,
    activePackages > 0 ? {
      tone: 'good',
      title: 'Base recorrente já ativa',
      text: `${activePackages} pacote(s) ativo(s) ajudam a previsibilidade da agenda e do caixa.`
    } : {
      tone: 'neutral',
      title: 'Pacotes ainda podem crescer',
      text: 'Ative ofertas recorrentes para clientes com boa frequência e ticket médio.'
    },
    appointmentsToday > 0 ? {
      tone: 'good',
      title: 'Agenda do dia já populada',
      text: `${appointmentsToday} agendamento(s) planejados para hoje, com ${activeCheckins} em execução ou check-in.`
    } : {
      tone: 'warning',
      title: 'Agenda do dia vazia',
      text: 'Use campanhas de reativação e mimos para preencher a operação ainda hoje.'
    }
  ].filter(Boolean);

  return {
    tenantId,
    date: todayIso,
    metrics: {
      appointmentsToday,
      revenueToday: centsToMoney(revenueTodayCents),
      revenueTodayLabel: moneyLabel(centsToMoney(revenueTodayCents)),
      activeCheckins,
      averageTicketToday: centsToMoney(averageTicketTodayCents),
      averageTicketTodayLabel: moneyLabel(centsToMoney(averageTicketTodayCents)),
      pendingPayments: pendingPaymentsTotal,
      activePackages,
      occupiedToday,
      tutorsTotal,
      petsTotal,
      servicesTotal,
      revenueWeek: centsToMoney(revenueWeekCents),
      revenueWeekLabel: moneyLabel(centsToMoney(revenueWeekCents))
    },
    todayAgenda: todayItems,
    revenueSeries,
    topServices: (topServices.rows || []).map((row) => ({ name: row.service_name || 'Serviço', total: Number(row.total || 0) })),
    recentAgenda: (recentAgenda.rows || []).map((row) => ({
      date: formatIsoDate(new Date(row.scheduled_at)),
      hour: formatHourMinute(new Date(row.scheduled_at)),
      pet: row.pet_name || 'Pet',
      tutor: row.tutor_name || 'Tutor',
      service: row.service_name || 'Serviço',
      status: row.status || 'agendado',
      payment_status: row.payment_status || 'pendente'
    })),
    alerts,
    chatbot: {
      welcome: `Posso analisar a agenda, o caixa previsto, pagamentos pendentes, pacotes ativos e base cadastrada de ${branding.tenant.brand_name || branding.tenant.name || 'seu pet shop'}.`
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



export async function getTenantFinanceSummary(tenantId) {
  await ensureBaseSchema();
  const today = new Date();
  const monthStart = startOfMonthIso(today);

  const [agendaRows, packagePaymentsRows, packageCustomersRows] = await Promise.all([
    optionalQuery(`
      select id, scheduled_at, tutor_name, pet_name, service_name, status, payment_status, payment_method,
             booking_origin, package_name, package_session_number, package_session_total,
             package_total_with_discount_cents, package_total_without_discount_cents, package_discount_percent,
             services_json, ticket_code
      from tenant_agenda_items
      where tenant_id = $1
        and scheduled_at >= current_date - interval '90 day'
      order by scheduled_at desc
    `, [tenantId], []),
    optionalQuery(`
      select p.id, p.customer_package_id, p.amount_cents, p.status, p.payment_method, p.due_date, p.paid_at, p.created_at,
             cp.package_name, cp.tutor_name, cp.pet_name, cp.status as package_status
      from tenant_package_payments p
      join tenant_customer_packages cp on cp.id = p.customer_package_id and cp.tenant_id = p.tenant_id
      where p.tenant_id = $1
      order by coalesce(p.paid_at, p.due_date, p.created_at) desc
    `, [tenantId], []),
    optionalQuery(`
      select cp.id, cp.package_name, cp.tutor_name, cp.pet_name, cp.status,
             cp.total_with_discount_cents, cp.next_charge_date,
             coalesce((select status from tenant_package_payments p where p.customer_package_id = cp.id order by p.created_at desc limit 1), 'pending') as payment_status,
             coalesce((select payment_method from tenant_package_payments p where p.customer_package_id = cp.id order by p.created_at desc limit 1), '') as payment_method
      from tenant_customer_packages cp
      where cp.tenant_id = $1
      order by cp.created_at desc
      limit 12
    `, [tenantId], [])
  ]);

  const agendaItems = (agendaRows.rows || []).map((row) => {
    const amountCents = computeAgendaValueCents(row);
    return {
      id: row.id,
      type: 'agenda',
      ref: row.ticket_code || `CMD-${String(row.id || '').slice(0, 8)}`,
      title: row.package_name || row.service_name || 'Agendamento',
      tutor: row.tutor_name || 'Tutor',
      pet: row.pet_name || 'Pet',
      date: row.scheduled_at,
      status: row.status || 'agendado',
      payment_status: row.payment_status || 'pendente',
      payment_method: row.payment_method || '',
      amount_cents: amountCents,
      booking_origin: row.booking_origin || 'avulso'
    };
  });

  const packagePayments = (packagePaymentsRows.rows || []).map((row) => ({
    id: row.id,
    type: 'pacote',
    ref: `PCT-${String(row.customer_package_id || '').slice(0, 8)}`,
    title: row.package_name || 'Pacote',
    tutor: row.tutor_name || 'Tutor',
    pet: row.pet_name || 'Pet',
    date: row.paid_at || row.due_date || row.created_at,
    status: row.package_status || 'ativo',
    payment_status: row.status === 'paid' ? 'pago' : row.status === 'failed' ? 'falhou' : 'pendente',
    payment_method: row.payment_method || '',
    amount_cents: Number(row.amount_cents || 0)
  }));

  const allTransactions = [...agendaItems, ...packagePayments]
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  const receivedMonthCents = allTransactions
    .filter((item) => String(item.payment_status || '').toLowerCase() === 'pago' && String(item.date || '').slice(0, 10) >= monthStart)
    .reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);

  const agendaOpenCents = agendaItems
    .filter((item) => !['cancelado'].includes(String(item.status || '').toLowerCase()) && String(item.payment_status || '').toLowerCase() !== 'pago')
    .reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);
  const packageOpenCents = packagePayments
    .filter((item) => String(item.payment_status || '').toLowerCase() !== 'pago')
    .reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);
  const openReceivablesCents = agendaOpenCents + packageOpenCents;

  const upcomingForecastCents = agendaItems
    .filter((item) => {
      const d = new Date(item.date || 0).getTime();
      const now = today.getTime();
      const limit = now + (7 * 24 * 60 * 60 * 1000);
      return d >= now && d <= limit && !['cancelado'].includes(String(item.status || '').toLowerCase());
    })
    .reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);

  const past30Agenda = agendaItems.filter((item) => {
    const d = new Date(item.date || 0).getTime();
    return d >= (today.getTime() - (30 * 24 * 60 * 60 * 1000)) && !['cancelado'].includes(String(item.status || '').toLowerCase());
  });
  const averageTicketCents = past30Agenda.length ? Math.round(past30Agenda.reduce((sum, item) => sum + Number(item.amount_cents || 0), 0) / past30Agenda.length) : 0;
  const packagesReceivedMonthCents = packagePayments
    .filter((item) => String(item.payment_status || '').toLowerCase() === 'pago' && String(item.date || '').slice(0, 10) >= monthStart)
    .reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);

  const flowSeries = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const ref = new Date(today);
    ref.setDate(today.getDate() - offset);
    const key = formatIsoDate(ref);
    const totalCents = allTransactions
      .filter((item) => String(item.date || '').slice(0, 10) === key && String(item.payment_status || '').toLowerCase() === 'pago')
      .reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);
    flowSeries.push({ label: key.slice(8, 10) + '/' + key.slice(5, 7), total_cents: totalCents, total_label: moneyLabel(centsToMoney(totalCents)) });
  }

  const methodsMap = new Map();
  for (const item of allTransactions) {
    if (String(item.payment_status || '').toLowerCase() !== 'pago') continue;
    const key = String(item.payment_method || 'não informado').trim() || 'não informado';
    const current = methodsMap.get(key) || { method: key, total_cents: 0, count: 0 };
    current.total_cents += Number(item.amount_cents || 0);
    current.count += 1;
    methodsMap.set(key, current);
  }
  const paymentMethods = [...methodsMap.values()].sort((a, b) => b.total_cents - a.total_cents).map((item) => ({
    ...item,
    total_label: moneyLabel(centsToMoney(item.total_cents))
  }));

  const receivablesByStatus = [
    {
      status: 'Pendente',
      total_cents: allTransactions.filter((item) => String(item.payment_status || '').toLowerCase() === 'pendente').reduce((sum, item) => sum + Number(item.amount_cents || 0), 0),
      count: allTransactions.filter((item) => String(item.payment_status || '').toLowerCase() === 'pendente').length
    },
    {
      status: 'Pago',
      total_cents: allTransactions.filter((item) => String(item.payment_status || '').toLowerCase() === 'pago').reduce((sum, item) => sum + Number(item.amount_cents || 0), 0),
      count: allTransactions.filter((item) => String(item.payment_status || '').toLowerCase() === 'pago').length
    },
    {
      status: 'Falhou/recusado',
      total_cents: allTransactions.filter((item) => ['falhou','failed','recusado'].includes(String(item.payment_status || '').toLowerCase())).reduce((sum, item) => sum + Number(item.amount_cents || 0), 0),
      count: allTransactions.filter((item) => ['falhou','failed','recusado'].includes(String(item.payment_status || '').toLowerCase())).length
    }
  ].map((item) => ({ ...item, total_label: moneyLabel(centsToMoney(item.total_cents)) }));

  const packageCharges = (packageCustomersRows.rows || []).map((row) => ({
    id: row.id,
    package_name: row.package_name || 'Pacote',
    tutor_name: row.tutor_name || 'Tutor',
    pet_name: row.pet_name || 'Pet',
    status: row.status || 'ativo',
    payment_status: row.payment_status || 'pending',
    payment_method: row.payment_method || '',
    next_charge_date: row.next_charge_date,
    total_with_discount_cents: Number(row.total_with_discount_cents || 0),
    total_with_discount_label: moneyLabel(centsToMoney(row.total_with_discount_cents || 0))
  }));

  return {
    generated_at: today.toISOString(),
    metrics: {
      openReceivables: centsToMoney(openReceivablesCents),
      openReceivablesLabel: moneyLabel(centsToMoney(openReceivablesCents)),
      receivedMonth: centsToMoney(receivedMonthCents),
      receivedMonthLabel: moneyLabel(centsToMoney(receivedMonthCents)),
      upcomingForecast: centsToMoney(upcomingForecastCents),
      upcomingForecastLabel: moneyLabel(centsToMoney(upcomingForecastCents)),
      averageTicket: centsToMoney(averageTicketCents),
      averageTicketLabel: moneyLabel(centsToMoney(averageTicketCents)),
      packagesReceivedMonth: centsToMoney(packagesReceivedMonthCents),
      packagesReceivedMonthLabel: moneyLabel(centsToMoney(packagesReceivedMonthCents)),
      pendingItems: allTransactions.filter((item) => String(item.payment_status || '').toLowerCase() === 'pendente').length
    },
    flowSeries,
    paymentMethods,
    receivablesByStatus,
    recentTransactions: allTransactions.slice(0, 18).map((item) => ({
      ...item,
      amount_label: moneyLabel(centsToMoney(item.amount_cents || 0)),
      date_label: item.date ? `${formatIsoDate(new Date(item.date))} ${formatHourMinute(new Date(item.date))}` : '—'
    })),
    packageCharges
  };
}


const DEFAULT_OPERATING_HOURS = [
  { dow: 1, day_label: 'Segunda', is_closed: false, open_time: '08:30', close_time: '17:30', slot_capacity: 10 },
  { dow: 2, day_label: 'Terça', is_closed: false, open_time: '08:30', close_time: '17:30', slot_capacity: 10 },
  { dow: 3, day_label: 'Quarta', is_closed: false, open_time: '08:30', close_time: '17:30', slot_capacity: 10 },
  { dow: 4, day_label: 'Quinta', is_closed: false, open_time: '08:30', close_time: '17:30', slot_capacity: 10 },
  { dow: 5, day_label: 'Sexta', is_closed: false, open_time: '08:30', close_time: '17:30', slot_capacity: 10 },
  { dow: 6, day_label: 'Sábado', is_closed: false, open_time: '08:30', close_time: '17:00', slot_capacity: 10 },
  { dow: 0, day_label: 'Domingo', is_closed: true, open_time: '07:30', close_time: '17:30', slot_capacity: 0 }
];

function sanitizeTime(value, fallback) {
  const time = sanitize(value);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : fallback;
}

function normalizeCapacity(value, fallback = 10) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(999, Math.round(n)));
}

async function ensureTenantOperatingHours(tenantId) {
  await ensureBaseSchema();
  for (const item of DEFAULT_OPERATING_HOURS) {
    await query(
      `insert into tenant_operating_hours (tenant_id, dow, day_label, is_closed, open_time, close_time, slot_capacity)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (tenant_id, dow) do nothing`,
      [tenantId, item.dow, item.day_label, item.is_closed, item.open_time, item.close_time, item.slot_capacity]
    );
  }
}

export async function getTenantOperatingHours(tenantId) {
  await ensureTenantOperatingHours(tenantId);
  const result = await query(
    `select id, dow, day_label, is_closed, open_time, close_time, slot_capacity, updated_at
       from tenant_operating_hours
      where tenant_id = $1
      order by case dow when 1 then 1 when 2 then 2 when 3 then 3 when 4 then 4 when 5 then 5 when 6 then 6 else 7 end`,
    [tenantId]
  );
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      dow: Number(row.dow),
      day_label: row.day_label,
      is_closed: row.is_closed,
      open_time: row.open_time,
      close_time: row.close_time,
      slot_capacity: Number(row.slot_capacity || 0),
      updated_at: row.updated_at
    }))
  };
}

export async function updateTenantOperatingHours(tenantId, payload) {
  await ensureTenantOperatingHours(tenantId);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!items.length) {
    throw new Error('Informe os horários de funcionamento.');
  }
  for (const raw of items) {
    const dow = Number(raw?.dow);
    const base = DEFAULT_OPERATING_HOURS.find((item) => item.dow === dow);
    if (!base) continue;
    const isClosed = Boolean(raw?.is_closed);
    const openTime = sanitizeTime(raw?.open_time, base.open_time);
    const closeTime = sanitizeTime(raw?.close_time, base.close_time);
    const slotCapacity = normalizeCapacity(raw?.slot_capacity, base.slot_capacity);
    await query(
      `update tenant_operating_hours
          set is_closed = $3,
              open_time = $4,
              close_time = $5,
              slot_capacity = $6,
              updated_at = now()
        where tenant_id = $1 and dow = $2`,
      [tenantId, dow, isClosed, openTime, closeTime, isClosed ? 0 : slotCapacity]
    );
  }
  return getTenantOperatingHours(tenantId);
}
