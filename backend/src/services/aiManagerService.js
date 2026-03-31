import { query } from '../config/db.js';
import { ensureBaseSchema } from '../scripts/bootstrapDb.js';
import { ensureTutorSchema } from './tutorService.js';
import { ensureManagementSchema } from './managementService.js';
import { ensureAttendanceSchema } from './attendanceService.js';
import { env } from '../config/env.js';

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function money(cents) {
  return Math.round((toNumber(cents) / 100) * 100) / 100;
}

export async function ensureAiManagerSchema() {
  await ensureBaseSchema();
  await ensureTutorSchema();
  await ensureManagementSchema();
  await ensureAttendanceSchema();

  await query(`
    create table if not exists tenant_ai_actions (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      code varchar(80) not null,
      title varchar(180) not null,
      description text,
      status varchar(20) not null default 'novo',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, code)
    );

    create index if not exists idx_tenant_ai_actions_tenant on tenant_ai_actions(tenant_id);
  `);
}

async function seedAiActions(tenantId) {
  const count = await query('select count(*)::int as total from tenant_ai_actions where tenant_id = $1', [tenantId]);
  if (Number(count.rows[0]?.total || 0) > 0) return;

  const items = [
    ['reativar-clientes', 'Reativar clientes inativos', 'Disparar campanha com incentivo para clientes sem atendimento recente.'],
    ['pacotes-recorrentes', 'Ofertar pacotes recorrentes', 'Converter clientes avulsos em receita previsível com pacote mensal.'],
    ['ocupar-agenda-vazia', 'Ocupar janelas ociosas', 'Criar ação para terça e quarta-feira, onde a agenda tende a ficar mais vazia.']
  ];

  for (const [code, title, description] of items) {
    await query(
      'insert into tenant_ai_actions (tenant_id, code, title, description) values ($1,$2,$3,$4) on conflict (tenant_id, code) do nothing',
      [tenantId, code, title, description]
    );
  }
}

async function collectMetrics(tenantId) {
  const [agenda, attendance, tutors, pets, services] = await Promise.all([
    query(`
      select
        count(*)::int as total,
        count(*) filter (where scheduled_at >= now() and scheduled_at < now() + interval '7 day')::int as proximos_7_dias,
        count(*) filter (where status in ('pendente','confirmado'))::int as abertos
      from tenant_agenda_items
      where tenant_id = $1
    `, [tenantId]).catch(() => ({ rows: [{}] })),
    query(`
      select
        count(*)::int as total,
        count(*) filter (where status = 'finalizado')::int as finalizados,
        count(*) filter (where status = 'pendente')::int as pendentes,
        coalesce(sum(amount_cents) filter (where status = 'finalizado'), 0)::int as faturado_cents
      from tenant_attendances
      where tenant_id = $1
    `, [tenantId]).catch(() => ({ rows: [{}] })),
    query('select count(*)::int as total from tenant_tutors where tenant_id = $1', [tenantId]).catch(() => ({ rows: [{}] })),
    query('select count(*)::int as total from tenant_pets where tenant_id = $1', [tenantId]).catch(() => ({ rows: [{}] })),
    query('select count(*)::int as total from tenant_services where tenant_id = $1', [tenantId]).catch(() => ({ rows: [{}] }))
  ]);

  return {
    agenda: agenda.rows[0] || {},
    attendance: attendance.rows[0] || {},
    tutors: tutors.rows[0] || {},
    pets: pets.rows[0] || {},
    services: services.rows[0] || {}
  };
}

function buildInsights(metrics) {
  const upcoming = toNumber(metrics.agenda.proximos_7_dias);
  const openAgenda = toNumber(metrics.agenda.abertos);
  const pendentes = toNumber(metrics.attendance.pendentes);
  const finalizados = toNumber(metrics.attendance.finalizados);
  const totalTutors = toNumber(metrics.tutors.total);
  const totalPets = toNumber(metrics.pets.total);
  const totalServices = toNumber(metrics.services.total);
  const faturado = money(metrics.attendance.faturado_cents);

  const healthScore = Math.max(35, Math.min(98,
    45 + Math.min(upcoming * 2, 20) + Math.min(finalizados * 3, 18) + Math.min(totalTutors, 10) - Math.min(pendentes * 2, 12)
  ));

  return {
    healthScore,
    insights: [
      {
        code: 'agenda',
        title: 'Agenda operacional',
        tone: upcoming >= 8 ? 'good' : 'warning',
        headline: upcoming >= 8 ? 'Agenda com tração saudável para os próximos 7 dias.' : 'Agenda com espaço para acelerar ocupação.',
        description: upcoming >= 8
          ? `Existem ${upcoming} agendamentos previstos para os próximos 7 dias e ${openAgenda} registros em aberto na operação.`
          : `Existem ${upcoming} agendamentos previstos para os próximos 7 dias. Vale ativar campanhas para preencher horários vagos.`
      },
      {
        code: 'receita',
        title: 'Receita capturada',
        tone: finalizados >= 3 ? 'good' : 'neutral',
        headline: finalizados >= 3 ? 'Atendimentos finalizados já estão convertendo em faturamento.' : 'Há potencial para converter mais atendimentos em receita.',
        description: `Foram ${finalizados} atendimentos finalizados, com faturamento consolidado de R$ ${faturado.toFixed(2).replace('.', ',')}.`
      },
      {
        code: 'base',
        title: 'Base ativa',
        tone: totalTutors >= 5 && totalPets >= 5 ? 'good' : 'neutral',
        headline: 'Sua base cadastrada já permite ações de CRM e retenção.',
        description: `Hoje o sistema possui ${totalTutors} tutores, ${totalPets} pets e ${totalServices} serviços cadastrados para apoiar as automações futuras.`
      }
    ],
    opportunities: [
      {
        title: 'Clientes aptos para pacote recorrente',
        value: Math.max(3, Math.ceil((finalizados + upcoming) / 2)),
        description: 'Clientes com perfil para conversão em recorrência mensal.'
      },
      {
        title: 'Agendamentos que precisam confirmação',
        value: Math.max(0, pendentes),
        description: 'Atendimentos pendentes que merecem ação rápida via WhatsApp.'
      },
      {
        title: 'Score operacional do Gerente IA',
        value: `${healthScore}%`,
        description: 'Indicador sintético baseado em agenda, atendimento e base cadastrada.'
      }
    ],
    recommendations: [
      {
        title: 'Criar campanha para terça e quarta',
        description: 'Use desconto inteligente ou mimo para preencher janelas historicamente mais ociosas.',
        impact: 'Alto impacto'
      },
      {
        title: 'Ativar oferta de pacote recorrente',
        description: 'Aborde clientes avulsos com ticket médio bom e convide para plano mensal.',
        impact: 'Receita previsível'
      },
      {
        title: 'Padronizar follow-up dos pendentes',
        description: 'Todo atendimento pendente deve gerar mensagem de confirmação em até 15 minutos.',
        impact: 'Conversão rápida'
      }
    ]
  };
}


function formatDateBrShort(value) {
  if (!value) return '';
  const [y, m, d] = String(value).split('-');
  if (y && m && d) return `${d}/${m}`;
  return String(value);
}

async function collectOperationalAlerts(tenantId, metrics = null) {
  const currentMetrics = metrics || await collectMetrics(tenantId);
  const [upcomingDays, inactiveTutors, openSlots] = await Promise.all([
    collectUpcomingAgendaDetails(tenantId),
    collectInactiveTutors(tenantId),
    collectOpenSlotSignals(tenantId)
  ]);

  const alerts = [];
  const unpaidCompleted = await query(`
    select count(*)::int as total
    from tenant_agenda_items
    where tenant_id = $1
      and lower(coalesce(status, '')) in ('concluido', 'finalizado')
      and lower(coalesce(payment_status, 'pendente')) <> 'pago'
  `, [tenantId]).catch(() => ({ rows: [{ total: 0 }] }));
  const unpaidCompletedTotal = Number(unpaidCompleted.rows?.[0]?.total || 0);
  if (unpaidCompletedTotal > 0) {
    alerts.push({
      code: 'pagamento_pendente_conclusao',
      source: 'ai',
      priority: 'high',
      icon: '💳',
      title: 'Não conclua sem revisar o pagamento',
      text: `${unpaidCompletedTotal} agendamento(s) já concluído(s) ainda estão com pagamento pendente. Antes de fechar o atendimento, confirme pagamento e forma de pagamento.`,
      cta: 'Revisar pagamentos pendentes',
      category: 'financeiro'
    });
  }

  const pendingAgenda = Number(currentMetrics?.agenda?.abertos || 0);
  if (pendingAgenda > 0) {
    alerts.push({
      code: 'agenda_aberta',
      source: 'ai',
      priority: pendingAgenda >= 5 ? 'high' : 'medium',
      icon: '🔔',
      title: 'Existem agendamentos que pedem ação rápida',
      text: `${pendingAgenda} agendamento(s) seguem em aberto. Vale confirmar status, pagamento e presença para evitar buracos na operação.`,
      cta: 'Priorizar confirmações',
      category: 'operacao'
    });
  }

  if (openSlots.length) {
    const best = openSlots[0];
    alerts.push({
      code: 'slots_ociosos',
      source: 'ai',
      priority: best.open >= 3 ? 'medium' : 'low',
      icon: '📆',
      title: 'Existem slots ociosos com oportunidade imediata',
      text: `${formatDateBrShort(best.date)} às ${best.hour} tem ${best.open} vaga(s) livre(s). Use reativação ou oferta relâmpago para ocupar esse horário.`,
      cta: 'Preencher slots vazios',
      category: 'agenda'
    });
  }

  if (inactiveTutors.length) {
    const topNames = inactiveTutors.slice(0, 2).map((item) => item.full_name).filter(Boolean).join(' e ');
    alerts.push({
      code: 'reativacao_clientes',
      source: 'ai',
      priority: 'medium',
      icon: '🤖',
      title: 'Clientes com forte chance de reativação',
      text: topNames
        ? `${topNames} e outros clientes estão há mais de 45 dias sem retorno. Uma mensagem personalizada no WhatsApp pode recuperar receita rápido.`
        : 'Há clientes inativos com sinal de reativação. Dispare uma campanha amigável com mimo ou oferta estratégica.',
      cta: 'Criar ação de reativação',
      category: 'crm'
    });
  }

  const recurringOpportunity = Math.max(3, Math.ceil((Number(currentMetrics?.attendance?.finalizados || 0) + Number(currentMetrics?.agenda?.proximos_7_dias || 0)) / 2));
  alerts.push({
    code: 'pacote_recorrente',
    source: 'ai',
    priority: 'low',
    icon: '📦',
    title: 'Oportunidade de pacote recorrente',
    text: `${recurringOpportunity} cliente(s) têm perfil para conversão em pacote recorrente. Esse é o melhor atalho para previsibilidade de agenda e receita.`,
    cta: 'Ofertar pacote recorrente',
    category: 'crm'
  });

  if (upcomingDays.length) {
    const weakDay = [...upcomingDays].sort((a, b) => a.total - b.total)[0];
    if (weakDay && weakDay.total <= 2) {
      alerts.push({
        code: 'dia_fraco',
        source: 'ai',
        priority: 'low',
        icon: '📉',
        title: 'Próximo dia com baixa ocupação',
        text: `${formatDateBrShort(weakDay.date)} tem só ${weakDay.total} agendamento(s) previsto(s). Vale ativar oferta tática e confirmar clientes com maior chance de retorno.`,
        cta: 'Montar campanha para o dia',
        category: 'agenda'
      });
    }
  }

  const weight = { high: 3, medium: 2, low: 1 };
  return alerts.sort((a, b) => (weight[b.priority] || 0) - (weight[a.priority] || 0)).slice(0, 6);
}

export async function getAiManagerDashboard(tenantId) {
  await ensureAiManagerSchema();
  await seedAiActions(tenantId);
  const metrics = await collectMetrics(tenantId);
  const generated = buildInsights(metrics);
  const alerts = await collectOperationalAlerts(tenantId, metrics);
  const actionsResult = await query(
    'select id, code, title, description, status, created_at, updated_at from tenant_ai_actions where tenant_id = $1 order by created_at asc',
    [tenantId]
  );

  return {
    summary: {
      health_score: generated.healthScore,
      tutors: toNumber(metrics.tutors.total),
      pets: toNumber(metrics.pets.total),
      services: toNumber(metrics.services.total),
      agenda_proximos_7_dias: toNumber(metrics.agenda.proximos_7_dias),
      atendimentos_pendentes: toNumber(metrics.attendance.pendentes),
      faturado: money(metrics.attendance.faturado_cents)
    },
    insights: generated.insights,
    opportunities: generated.opportunities,
    recommendations: generated.recommendations,
    alerts,
    actions: actionsResult.rows
  };
}

export async function updateAiActionStatus(tenantId, actionId, payload = {}) {
  await ensureAiManagerSchema();
  const status = String(payload.status || '').trim().toLowerCase();
  const allowed = ['novo', 'em_execucao', 'concluido', 'dispensado'];
  if (!allowed.includes(status)) {
    throw new Error('Status inválido para a ação do Gerente IA.');
  }

  const result = await query(
    `update tenant_ai_actions
        set status = $3,
            updated_at = now()
      where tenant_id = $1 and id = $2
      returning id, code, title, description, status, created_at, updated_at`,
    [tenantId, actionId, status]
  );

  if (!result.rows.length) {
    throw new Error('Ação do Gerente IA não encontrada.');
  }

  return result.rows[0];
}


function isoDateOnly(value) {
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function formatHourLabel(hour = 0) {
  return `${String(Number(hour) || 0).padStart(2, '0')}:00`;
}

async function collectUpcomingAgendaDetails(tenantId) {
  const result = await query(`
    select
      scheduled_at,
      status,
      tutor_name,
      pet_name,
      service_name,
      payment_status
    from tenant_agenda_items
    where tenant_id = $1
      and scheduled_at >= now()
      and scheduled_at < now() + interval '7 day'
    order by scheduled_at asc
    limit 80
  `, [tenantId]).catch(() => ({ rows: [] }));

  const byDay = new Map();
  for (const row of result.rows || []) {
    const day = isoDateOnly(row.scheduled_at);
    if (!day) continue;
    const current = byDay.get(day) || { date: day, total: 0, pendentes: 0, pagos: 0, services: new Set() };
    current.total += 1;
    if (['pendente', 'confirmado', 'agendado'].includes(String(row.status || '').toLowerCase())) {
      current.pendentes += 1;
    }
    if (String(row.payment_status || '').toLowerCase() === 'pago') current.pagos += 1;
    if (row.service_name) current.services.add(String(row.service_name));
    byDay.set(day, current);
  }

  return [...byDay.values()].slice(0, 7).map((item) => ({
    date: item.date,
    total: item.total,
    pendentes: item.pendentes,
    pagos: item.pagos,
    services: [...item.services].slice(0, 4)
  }));
}

async function collectInactiveTutors(tenantId) {
  const result = await query(`
    select
      t.id,
      t.full_name,
      coalesce(t.phone, '') as phone,
      max(a.scheduled_at) as last_visit,
      count(a.id)::int as total_visits
    from tenant_tutors t
    left join tenant_agenda_items a
      on a.tenant_id = t.tenant_id
     and (a.tutor_id = t.id or (a.tutor_id is null and coalesce(a.phone, '') <> '' and coalesce(a.phone, '') = coalesce(t.phone, '')))
    where t.tenant_id = $1
      and t.is_active = true
    group by t.id
    having max(a.scheduled_at) is null or max(a.scheduled_at) < now() - interval '45 day'
    order by max(a.scheduled_at) asc nulls first, t.full_name asc
    limit 8
  `, [tenantId]).catch(() => ({ rows: [] }));

  return (result.rows || []).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    phone: row.phone,
    last_visit: row.last_visit,
    total_visits: Number(row.total_visits || 0)
  }));
}

async function collectOpenSlotSignals(tenantId) {
  const [hoursRes, appointmentsRes] = await Promise.all([
    query(`
      select dow, day_label, is_closed, open_time, close_time, slot_capacity
      from tenant_operating_hours
      where tenant_id = $1
      order by dow asc
    `, [tenantId]).catch(() => ({ rows: [] })),
    query(`
      select scheduled_at
      from tenant_agenda_items
      where tenant_id = $1
        and scheduled_at >= now()
        and scheduled_at < now() + interval '7 day'
    `, [tenantId]).catch(() => ({ rows: [] }))
  ]);

  const appointmentsBySlot = new Map();
  for (const row of appointmentsRes.rows || []) {
    const when = new Date(row.scheduled_at);
    if (Number.isNaN(when.getTime())) continue;
    const key = `${isoDateOnly(when)} ${formatHourLabel(when.getHours())}`;
    appointmentsBySlot.set(key, (appointmentsBySlot.get(key) || 0) + 1);
  }

  const hoursByDow = new Map((hoursRes.rows || []).map((row) => [Number(row.dow), row]));
  const signals = [];
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  for (let offset = 0; offset < 7; offset += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + offset);
    const dow = current.getDay();
    const rule = hoursByDow.get(dow);
    if (!rule || rule.is_closed) continue;
    const openHour = Number(String(rule.open_time || '08:00').slice(0, 2));
    const closeHour = Number(String(rule.close_time || '18:00').slice(0, 2));
    const capacity = Number(rule.slot_capacity || 0);
    if (!capacity || closeHour <= openHour) continue;
    for (let hour = openHour; hour < closeHour; hour += 1) {
      const date = isoDateOnly(current);
      const hourLabel = formatHourLabel(hour);
      const used = Number(appointmentsBySlot.get(`${date} ${hourLabel}`) || 0);
      const open = Math.max(capacity - used, 0);
      signals.push({ date, day_label: rule.day_label, hour: hourLabel, capacity, used, open });
    }
  }

  signals.sort((a, b) => b.open - a.open || a.date.localeCompare(b.date) || a.hour.localeCompare(b.hour));
  return signals.slice(0, 10);
}

async function collectTenantBrand(tenantId) {
  const result = await query(`
    select
      coalesce(nullif(ts.brand_name, ''), nullif(t.name, ''), 'seu pet shop') as brand_name,
      coalesce(nullif(ts.whatsapp_phone, ''), nullif(ts.phone, ''), '') as phone,
      coalesce(nullif(ts.city, ''), '') as city,
      coalesce(nullif(ts.state, ''), '') as state
    from tenants t
    left join tenant_settings ts on ts.tenant_id = t.id
    where t.id = $1
    limit 1
  `, [tenantId]).catch(() => ({ rows: [] }));

  return result.rows?.[0] || { brand_name: 'seu pet shop', phone: '', city: '', state: '' };
}

async function buildChatContext(tenantId) {
  const [metrics, upcomingDays, inactiveTutors, openSlots, tenant] = await Promise.all([
    collectMetrics(tenantId),
    collectUpcomingAgendaDetails(tenantId),
    collectInactiveTutors(tenantId),
    collectOpenSlotSignals(tenantId),
    collectTenantBrand(tenantId)
  ]);

  return {
    tenant,
    metrics: {
      agenda_total: toNumber(metrics.agenda.total),
      agenda_proximos_7_dias: toNumber(metrics.agenda.proximos_7_dias),
      agenda_aberta: toNumber(metrics.agenda.abertos),
      atendimentos_pendentes: toNumber(metrics.attendance.pendentes),
      atendimentos_finalizados: toNumber(metrics.attendance.finalizados),
      faturado: money(metrics.attendance.faturado_cents),
      tutores: toNumber(metrics.tutors.total),
      pets: toNumber(metrics.pets.total),
      servicos: toNumber(metrics.services.total)
    },
    upcoming_days: upcomingDays,
    inactive_tutors: inactiveTutors,
    open_slots: openSlots
  };
}

function extractResponseText(responseJson = {}) {
  if (typeof responseJson.output_text === 'string' && responseJson.output_text.trim()) return responseJson.output_text.trim();
  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  const texts = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string' && part.text.trim()) texts.push(part.text.trim());
      if (typeof part?.content === 'string' && part.content.trim()) texts.push(part.content.trim());
    }
  }
  return texts.join('\n\n').trim();
}

function buildFallbackChatReply(message, context) {
  const text = String(message || '').toLowerCase();
  const bestSlots = (context.open_slots || []).slice(0, 3);
  const inactive = (context.inactive_tutors || []).slice(0, 3);
  const upcoming = (context.upcoming_days || []).slice(0, 3);

  if (text.includes('reativ') || text.includes('inativ')) {
    const names = inactive.map((item) => item.full_name).filter(Boolean).join(', ');
    return names
      ? `Os clientes com maior sinal de reativação agora são: ${names}. Eu sugiro uma campanha curta no WhatsApp com mimo para terça/quarta, reforçando horário disponível e benefício imediato.`
      : 'Não encontrei uma lista forte de clientes inativos neste momento. Vale revisar quem não voltou nos últimos 45 dias e disparar uma campanha com mimo + urgência leve.';
  }

  if (text.includes('slot') || text.includes('agenda') || text.includes('horario')) {
    const slotText = bestSlots.map((item) => `${item.date} às ${item.hour} (${item.open} vaga(s) livre(s))`).join('; ');
    return slotText
      ? `Os melhores slots para preencher agora são ${slotText}. Minha recomendação é priorizar oferta relâmpago para terça/quarta, confirmação rápida dos pendentes e campanha para clientes recorrentes.`
      : 'A agenda está sem slots livres mapeados para os próximos dias. Vale revisar horário de funcionamento e capacidade por hora.';
  }

  if (text.includes('proxim') || text.includes('semana')) {
    const upcomingText = upcoming.map((item) => `${item.date}: ${item.total} agendamento(s)`).join('; ');
    return upcomingText
      ? `Resumo dos próximos dias: ${upcomingText}. Posso te ajudar a decidir onde empurrar campanhas, reforçar confirmação ou puxar reativação.`
      : 'Ainda não encontrei agendamentos suficientes para resumir os próximos dias. Use este momento para puxar campanhas e preencher a semana.';
  }

  return `Eu já estou lendo sua operação. Hoje você tem ${context.metrics.agenda_proximos_7_dias} agendamento(s) nos próximos 7 dias, ${context.metrics.atendimentos_pendentes} atendimento(s) pendente(s) e ${context.inactive_tutors.length} cliente(s) com sinal de reativação. Pergunte sobre slots vazios, clientes inativos, próximos dias ou ações práticas para vender mais.`;
}

async function requestOpenAiChat(message, history, context) {
  const systemPrompt = `Você é o Gerente IA do LoopinPet. Responda em português do Brasil, com linguagem clara, prática e acionável para um pet shop brasileiro. Seja direto, útil e comercial. Sempre use o contexto operacional fornecido. Priorize sugestões sobre: preencher slots vazios, recuperar clientes inativos, aumentar recorrência, melhorar ocupação da agenda, confirmar pendências e vender complementos. Não invente números fora do contexto.`;
  const contextBlock = JSON.stringify(context, null, 2);
  const trimmedHistory = Array.isArray(history) ? history.slice(-8) : [];
  const input = [
    { role: 'system', content: systemPrompt },
    { role: 'developer', content: `Contexto operacional do pet shop:
${contextBlock}` },
    ...trimmedHistory.map((item) => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: String(item.content || '') })),
    { role: 'user', content: String(message || '') }
  ];

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.openAiApiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-5.4',
      input,
      store: false,
      truncation: 'auto'
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || 'Falha ao consultar a IA.');
  }

  const answer = extractResponseText(data);
  if (!answer) throw new Error('A IA não retornou texto utilizável.');
  return answer;
}

export async function chatWithAiManager(tenantId, payload = {}) {
  await ensureAiManagerSchema();
  const message = String(payload.message || '').trim();
  if (!message) throw new Error('Envie uma pergunta para o assistente.');
  const history = Array.isArray(payload.history) ? payload.history : [];
  const context = await buildChatContext(tenantId);

  let answer = '';
  let provider = 'fallback';
  if (env.openAiApiKey) {
    try {
      answer = await requestOpenAiChat(message, history, context);
      provider = 'openai';
    } catch (error) {
      answer = buildFallbackChatReply(message, context);
      provider = 'fallback';
    }
  } else {
    answer = buildFallbackChatReply(message, context);
  }

  return { answer, provider, context };
}
