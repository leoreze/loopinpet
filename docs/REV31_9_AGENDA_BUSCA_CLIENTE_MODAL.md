# REV31.9 — Agenda: busca de cliente com modal e redirecionamento

Ajustes aplicados no fluxo de Novo Agendamento:

- busca de cliente aceita WhatsApp ou nome
- ao encontrar cliente, exibe modal de confirmação e preenche os dados automaticamente
- ao não encontrar cliente, exibe modal e redireciona para `/tenant/tutores`
- removida a busca automática no blur do campo para evitar modais inesperados
- mantida a estrutura atual da agenda sem alterar o restante do fluxo
