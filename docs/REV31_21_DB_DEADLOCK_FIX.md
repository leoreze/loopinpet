# REV31.21 — Correção defensiva para deadlock na Agenda

## O que foi ajustado

### 1. Retry automático para falhas transitórias de banco
No arquivo `backend/src/config/db.js` foi adicionada uma camada de retry para queries com códigos de erro:

- `40P01` — deadlock detected
- `40001` — serialization failure
- `55P03` — lock not available

A lógica faz novas tentativas curtas com pequeno atraso e jitter, reduzindo falhas intermitentes sem alterar os contratos atuais de services e rotas.

### 2. Redução de disputa no consumo de pacotes
No arquivo `backend/src/services/packageService.js` o consumo de saldo do pacote passou a:

- ordenar as seleções em ordem determinística
- fazer o incremento de `used_quantity` com update atômico e cláusula de proteção
- evitar janela entre leitura do saldo e atualização

## Objetivo
Reduzir a incidência de deadlock e conflito de concorrência na Agenda, especialmente em cenários com:

- alteração de status
- atualização de pagamento
- consumo de serviços de pacote
- geração e uso de agendamentos automáticos

## Observação
A correção foi aplicada de forma incremental e defensiva, sem reescrever o fluxo principal da agenda para evitar regressão.
