import { query } from '../config/db.js';
import { ensureBaseSchema } from '../scripts/bootstrapDb.js';
import { ensureTutorSchema } from './tutorService.js';
import { ensureManagementSchema } from './managementService.js';
import { ensureAttendanceSchema } from './attendanceService.js';

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

export async function getAiManagerDashboard(tenantId) {
  await ensureAiManagerSchema();
  await seedAiActions(tenantId);
  const metrics = await collectMetrics(tenantId);
  const generated = buildInsights(metrics);
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
