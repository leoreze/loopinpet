# REV31.26 — Dashboard ativo + dark mode por paleta + chatbot do dashboard

## Entrega
- dashboard do assinante passou a consumir `/api/tenant/summary` com dados reais da operação
- KPIs priorizados para a fase atual: agenda do dia, receita prevista, pagamentos pendentes, pacotes ativos, base ativa e day care
- gráfico simples de receita dos últimos 7 dias
- lista de alertas operacionais e ranking de serviços
- chatbot do dashboard usando o endpoint já existente de IA (`/api/tenant/ai/chat`)
- modo dark do white-label agora deriva da paleta escolhida pelo assinante, escurecendo a mesma identidade visual

## Arquivos alterados
- `backend/src/services/tenantService.js`
- `frontend/assets/js/auth.js`
- `frontend/assets/js/configuracoes.js`
- `frontend/assets/js/dashboard.js`
- `frontend/pages/tenant/dashboard.html`
