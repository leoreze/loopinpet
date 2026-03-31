# REV31.11 — Pacotes integrados à agenda

## Entregas aplicadas
- vínculo de agendamento com origem `avulso` ou `pacote`
- persistência de snapshot do pacote no agendamento
- seleção de pacote por serviço no modal de Novo Agendamento
- selo visual `Pacote` nos cards da agenda
- consumo automático do saldo ao concluir o atendimento
- campos de agenda preparados para próximas fases de automação e inteligência

## Campos adicionados em `tenant_agenda_items`
- `booking_origin`
- `customer_package_id`
- `package_snapshot_json`
- `package_usage_json`
- `package_consumed_at`

## Regra operacional
- o pacote é escolhido no agendamento
- o consumo do saldo acontece apenas quando o status vai para `concluido`
- o status operacional da agenda continua separado do status comercial do pacote
