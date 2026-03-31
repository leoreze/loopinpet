# REV31.16 — Pacotes com agendamentos automáticos por período

## O que entrou
- novo campo **Agendamentos por período** no modal de criação/edição de pacote
- persistência desse número no template do pacote
- na contratação do pacote, distribuição automática dos agendamentos a partir da data inicial
- novo campo **Horário base** na contratação para definir o horário dos agendamentos automáticos
- resumo de distribuição automática no modal de venda e nos detalhes do pacote

## Regra aplicada
- o sistema distribui os agendamentos ao longo da validade do pacote
- a quantidade distribuída vem do campo **Agendamentos por período** do template
- os serviços do pacote são espalhados entre as sessões em round-robin
- cada agendamento automático recebe nota com identificação de pacote e sessão

## Compatibilidade
- sem remoção de estrutura existente
- quando o campo estiver zerado, nada muda no fluxo atual da venda do pacote
