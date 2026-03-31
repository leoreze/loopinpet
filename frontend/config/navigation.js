export const navigation = {
  core_saas: [
    { label: 'Visão Geral', route: '/core/dashboard', icon: '📊' },
    { label: 'Tenants', route: '/core/tenants', icon: '🏢' },
    { label: 'Planos', route: '/core/plans', icon: '🧩' },
    { label: 'Billing SaaS', route: '/core/billing', icon: '💳' },
    { label: 'Observability', route: '/core/observability', icon: '📡' },
    { label: 'API Contracts', route: '/core/api', icon: '🔌' }
  ],

  tenant_admin: [
    {
      type: 'section',
      key: 'dashboard',
      title: '🏠 MÓDULO: DASHBOARD',
      description: 'sempre ativo (core do sistema)',
      items: [
        { label: 'Visão geral', route: '/tenant/dashboard', icon: '🏠' },
        { label: 'Agenda do dia', route: '/tenant/agenda', icon: '🗓️' },
        { label: 'Faturamento', route: '/tenant/dashboard', icon: '💰' },
        { label: 'Ocupação', route: '/tenant/dashboard', icon: '📈' },
        { label: 'Alertas', route: '/tenant/dashboard', icon: '🚨' },
        { label: 'Insights IA', route: '/tenant/ai', icon: '🤖' }
      ]
    },
    {
      type: 'section',
      key: 'operacao',
      title: '📅 MÓDULO: OPERAÇÃO CORE',
      description: 'módulo obrigatório (base do sistema)',
      items: [
        { label: 'Agenda', route: '/tenant/agenda', icon: '📅' },
        { label: 'Agenda (lista / cards / calendário)', route: '/tenant/agenda', icon: '🗂️' },
        { label: 'Novo agendamento', route: '/tenant/agenda', icon: '➕' },
        { label: 'Check-in / Check-out', route: '/tenant/agenda', icon: '✅' },
        { label: 'Serviços', route: '/tenant/services', icon: '✂️' },
        { label: 'Categorias', route: '/tenant/services', icon: '🏷️' },
        { label: 'Preço por porte', route: '/tenant/services', icon: '📏' },
        { label: 'Pacotes', route: '/tenant/pacotes', icon: '📦' },
        { label: 'Criar pacote', route: '/tenant/pacotes', icon: '🧩' },
        { label: 'Serviços inclusos', route: '/tenant/pacotes', icon: '📋' },
        { label: 'Assinaturas (clientes)', route: '/tenant/assinatura', icon: '🧾', disabled: true },
        { label: 'Planos ativos', route: '/tenant/assinatura', icon: '🟢', disabled: true },
        { label: 'Sessões', route: '/tenant/status-das-sessoes', icon: '🔁', disabled: true },
        { label: 'Status', route: '/tenant/status-das-sessoes', icon: '📍', disabled: true }
      ]
    },
    {
      type: 'section',
      key: 'clientes',
      title: '👥 MÓDULO: CLIENTES & PETS',
      items: [
        { label: 'Clientes', route: '/tenant/tutores', icon: '👤' },
        { label: 'Lista', route: '/tenant/tutores', icon: '📄' },
        { label: 'Histórico', route: '/tenant/tutores', icon: '🕘' },
        { label: 'Tags', route: '/tenant/tutores', icon: '🏷️' },
        { label: 'CRM rápido', route: '/tenant/tutores', icon: '⚡' },
        { label: 'Pets', route: '/tenant/pets', icon: '🐾' },
        { label: 'Cadastro', route: '/tenant/pets', icon: '📝' },
        { label: 'Porte', route: '/tenant/pets', icon: '📏' },
        { label: 'Raça', route: '/tenant/pets', icon: '🐶' },
        { label: 'Preferências', route: '/tenant/pets', icon: '⭐' }
      ]
    },
    {
      type: 'section',
      key: 'financeiro',
      title: '💰 MÓDULO: FINANCEIRO',
      items: [
        { label: 'Caixa', route: '/tenant/financeiro', icon: '💵' },
        { label: 'Entradas / saídas', route: '/tenant/financeiro', icon: '↕️' },
        { label: 'Recebimentos', route: '/tenant/financeiro', icon: '💸' },
        { label: 'Pagamentos', route: '/tenant/formas-de-pagamento', icon: '💳', disabled: true },
        { label: 'Pix / cartão', route: '/tenant/formas-de-pagamento', icon: '🏦', disabled: true },
        { label: 'Assinaturas', route: '/tenant/assinatura', icon: '🧾', disabled: true },
        { label: 'Cobranças recorrentes', route: '/tenant/financeiro', icon: '🔄' },
        { label: 'Inadimplência', route: '/tenant/financeiro', icon: '🚫' },
        { label: 'Transações', route: '/tenant/financeiro', icon: '📑' },
        { label: 'Histórico', route: '/tenant/financeiro', icon: '🕘' },
        { label: 'Webhooks', route: '/tenant/financeiro', icon: '🔌' }
      ]
    },
    {
      type: 'section',
      key: 'crm',
      title: '📈 MÓDULO: CRM & MARKETING',
      items: [
        { label: 'Pipeline', icon: '🧭', disabled: true },
        { label: 'Lead', icon: '🎯', disabled: true },
        { label: 'Diagnóstico', icon: '🩺', disabled: true },
        { label: 'Proposta', icon: '📄', disabled: true },
        { label: 'Fechado', icon: '🤝', disabled: true },
        { label: 'Leads', icon: '📥', disabled: true },
        { label: 'Origem', icon: '🧲', disabled: true },
        { label: 'Dados', icon: '🗃️', disabled: true },
        { label: 'Campanhas', icon: '📣', disabled: true },
        { label: 'Criar', icon: '➕', disabled: true },
        { label: 'Segmentos', icon: '🧩', disabled: true },
        { label: 'Automações', icon: '⚙️', disabled: true },
        { label: 'Regras', icon: '📐', disabled: true },
        { label: 'Execuções', icon: '▶️', disabled: true }
      ]
    },
    {
      type: 'section',
      key: 'fidelizacao',
      title: '🎯 MÓDULO: FIDELIZAÇÃO',
      items: [
        { label: 'Roleta de Mimos', icon: '🎁', disabled: true },
        { label: 'Criar mimo', icon: '✨', disabled: true },
        { label: 'Vigência', icon: '📅', disabled: true },
        { label: 'Ativação', icon: '🟢', disabled: true },
        { label: 'Histórico', icon: '🕘', disabled: true },
        { label: 'Giros', icon: '🎡', disabled: true },
        { label: 'Conversão', icon: '📊', disabled: true },
        { label: 'Fidelidade (futuro)', icon: '⭐', disabled: true },
        { label: 'Pontos', icon: '🏅', disabled: true },
        { label: 'Benefícios', icon: '🎉', disabled: true }
      ]
    },
    {
      type: 'section',
      key: 'ia',
      title: '🤖 MÓDULO: INTELIGÊNCIA (IA)',
      description: '“Gerente Virtual”',
      items: [
        { label: 'Insights', route: '/tenant/ai', icon: '🤖' },
        { label: 'Churn', route: '/tenant/ai', icon: '📉' },
        { label: 'Reativação', route: '/tenant/ai', icon: '🔁' },
        { label: 'Previsões', route: '/tenant/ai', icon: '🔮' },
        { label: 'Faturamento', route: '/tenant/ai', icon: '💰' },
        { label: 'Ocupação', route: '/tenant/ai', icon: '📈' },
        { label: 'Recomendações', route: '/tenant/ai', icon: '💡' },
        { label: 'Upsell', route: '/tenant/ai', icon: '🚀' },
        { label: 'Ações comerciais', route: '/tenant/ai', icon: '📌' }
      ]
    },
    {
      type: 'section',
      key: 'automacao',
      title: '📲 MÓDULO: AUTOMAÇÃO & WHATSAPP',
      items: [
        { label: 'Templates', icon: '💬', disabled: true },
        { label: 'Mensagens', icon: '✉️', disabled: true },
        { label: 'Disparos', icon: '📤', disabled: true },
        { label: 'Campanhas', icon: '📣', disabled: true },
        { label: 'Fluxos', icon: '🔄', disabled: true },
        { label: 'Lembretes', icon: '⏰', disabled: true },
        { label: 'Cobrança', icon: '💸', disabled: true },
        { label: 'Reativação', icon: '♻️', disabled: true }
      ]
    },
    {
      type: 'section',
      key: 'growth',
      title: '🌐 MÓDULO: LANDING & CAPTAÇÃO',
      items: [
        { label: 'Landing Pages', icon: '🛬', disabled: true },
        { label: 'Editor', icon: '🖊️', disabled: true },
        { label: 'Roleta pública', icon: '🎡', disabled: true },
        { label: 'Leads', icon: '📥', disabled: true },
        { label: 'Capturados', icon: '🧲', disabled: true }
      ]
    },
    {
      type: 'section',
      key: 'taxi-pet',
      title: '🚗 MÓDULO: TAXI PET (NOVO)',
      description: 'diferencial competitivo forte',
      items: [
        { label: 'Corridas', icon: '🚕', disabled: true },
        { label: 'Solicitações', icon: '📨', disabled: true },
        { label: 'Em andamento', icon: '🟡', disabled: true },
        { label: 'Finalizadas', icon: '✅', disabled: true },
        { label: 'Agendamento', icon: '📅', disabled: true },
        { label: 'Buscar pet', icon: '🐾', disabled: true },
        { label: 'Levar pet', icon: '🏁', disabled: true },
        { label: 'Rotas', icon: '🗺️', disabled: true },
        { label: 'Endereço tutor', icon: '🏠', disabled: true },
        { label: 'Endereço pet shop', icon: '📍', disabled: true },
        { label: 'Motoristas', icon: '🧑‍✈️', disabled: true },
        { label: 'Cadastro', icon: '📝', disabled: true },
        { label: 'Status', icon: '📌', disabled: true },
        { label: 'Financeiro Taxi', icon: '💰', disabled: true },
        { label: 'Valor por corrida', icon: '💵', disabled: true },
        { label: 'Controle', icon: '🎛️', disabled: true }
      ]
    },
    {
      type: 'section',
      key: 'daycare',
      title: '🐾 MÓDULO: DAY CARE (NOVO)',
      description: 'forte uso com recorrência',
      items: [
        { label: 'Check-in / Check-out', icon: '✅', disabled: true },
        { label: 'Entrada', icon: '⬅️', disabled: true },
        { label: 'Saída', icon: '➡️', disabled: true },
        { label: 'Pets presentes', icon: '🐶', disabled: true },
        { label: 'Lista em tempo real', icon: '🕒', disabled: true },
        { label: 'Planos Day Care', icon: '📦', disabled: true },
        { label: 'Mensal', icon: '🗓️', disabled: true },
        { label: 'Avulso', icon: '1️⃣', disabled: true },
        { label: 'Atividades', icon: '🎾', disabled: true },
        { label: 'Registro diário', icon: '📔', disabled: true },
        { label: 'Capacidade', icon: '📊', disabled: true },
        { label: 'Limite por dia', icon: '🚧', disabled: true }
      ]
    },
    {
      type: 'section',
      key: 'hospedagem',
      title: '🏨 MÓDULO: HOSPEDAGEM (NOVO)',
      description: 'semelhante a hotel (lógica de calendário + ocupação)',
      items: [
        { label: 'Reservas', icon: '📘', disabled: true },
        { label: 'Nova hospedagem', icon: '➕', disabled: true },
        { label: 'Datas', icon: '📅', disabled: true },
        { label: 'Ocupação', icon: '📈', disabled: true },
        { label: 'Vagas disponíveis', icon: '🟢', disabled: true },
        { label: 'Pets hospedados', icon: '🐾', disabled: true },
        { label: 'Status', icon: '📍', disabled: true },
        { label: 'Tempo restante', icon: '⏳', disabled: true },
        { label: 'Check-in / Check-out', icon: '✅', disabled: true },
        { label: 'Valores', icon: '💵', disabled: true },
        { label: 'Diária', icon: '🌙', disabled: true },
        { label: 'Pacotes', icon: '📦', disabled: true }
      ]
    },
    {
      type: 'section',
      key: 'veterinaria',
      title: '🩺 MÓDULO: VETERINÁRIA (NOVO)',
      description: 'esse módulo vira outro SaaS dentro do SaaS',
      items: [
        { label: 'Consultas', icon: '🩺', disabled: true },
        { label: 'Agenda clínica', icon: '📅', disabled: true },
        { label: 'Prontuário', icon: '📂', disabled: true },
        { label: 'Histórico médico', icon: '🧾', disabled: true },
        { label: 'Vacinas', icon: '💉', disabled: true },
        { label: 'Observações', icon: '📝', disabled: true },
        { label: 'Procedimentos', icon: '🧪', disabled: true },
        { label: 'Vacinação', icon: '💉', disabled: true },
        { label: 'Exames', icon: '🔬', disabled: true },
        { label: 'Receitas', icon: '📜', disabled: true },
        { label: 'Emissão', icon: '🖨️', disabled: true },
        { label: 'Profissionais', icon: '👨‍⚕️', disabled: true },
        { label: 'Veterinários', icon: '🐕', disabled: true }
      ]
    },
    {
      type: 'section',
      key: 'multiunidade',
      title: '🏢 MÓDULO: MULTIUNIDADE',
      items: [
        { label: 'Unidades', icon: '🏢', disabled: true },
        { label: 'Comparativo', icon: '⚖️', disabled: true },
        { label: 'Performance', icon: '📊', disabled: true }
      ]
    },
    {
      type: 'section',
      key: 'billing',
      title: '💳 MÓDULO: ASSINATURA SaaS',
      items: [
        { label: 'Plano atual', icon: '📌', disabled: true },
        { label: 'Essencial / Pro / Premium', icon: '🧩', disabled: true },
        { label: 'Faturas', icon: '🧾', disabled: true },
        { label: 'Histórico', icon: '🕘', disabled: true },
        { label: 'Pagamento', icon: '💳', disabled: true },
        { label: 'Atualizar', icon: '♻️', disabled: true },
        { label: 'Upgrade', icon: '🚀', disabled: true },
        { label: 'Trocar plano', icon: '🔁', disabled: true }
      ]
    },
    {
      type: 'section',
      key: 'config',
      title: '⚙️ MÓDULO: CONFIGURAÇÕES',
      items: [
        { label: 'Meu Perfil', route: '/tenant/meu-perfil', icon: '🙍' },
        { label: 'Dados', route: '/tenant/meu-perfil', icon: '📝' },
        { label: 'Senha', route: '/tenant/meu-perfil', icon: '🔒' },
        { label: 'MFA', route: '/tenant/meu-perfil', icon: '🛡️' },
        { label: 'Empresa', route: '/tenant/configuracoes-gerais', icon: '🏢' },
        { label: 'Logo', route: '/tenant/configuracoes-gerais', icon: '🎨' },
        { label: 'Horário funcionamento', route: '/tenant/horario-de-funcionamento', icon: '🕒' },
        { label: 'Usuários', route: '/tenant/usuarios', icon: '👥' },
        { label: 'Colaboradores', route: '/tenant/colaboradores', icon: '🧑‍🤝‍🧑' },
        { label: 'Permissões', route: '/tenant/cargos-e-permissoes', icon: '🔐' },
        { label: 'Integrações', route: '/tenant/configuracoes', icon: '🔌' },
        { label: 'WhatsApp', route: '/tenant/appetzap', icon: '📲' },
        { label: 'Mercado Pago', route: '/tenant/configuracoes', icon: '💳' },
        { label: 'Suporte', route: '/tenant/suporte', icon: '🆘' }
      ]
    }
  ],

  tutor_portal: [
    { label: 'Home', route: '/tutor/home', icon: '🏠' },
    { label: 'Agendar', route: '/tutor/agendar', icon: '📅' },
    { label: 'Meus Pets', route: '/tutor/pets', icon: '🐾' },
    { label: 'Benefícios', route: '/tutor/beneficios', icon: '🎁' },
    { label: 'Pagamentos', route: '/tutor/pagamentos', icon: '💳' }
  ]
};
