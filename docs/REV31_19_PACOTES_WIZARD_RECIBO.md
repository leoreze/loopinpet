# REV31.19 — Pacotes com wizard de contratação

## O que mudou
- A venda de pacote virou um fluxo em 4 etapas:
  1. Dados iniciais até observações
  2. Contrato e aceite
  3. Pagamento
  4. Resumo final em formato de recibo
- O resumo final mostra:
  - tutor
  - pet
  - data inicial e horário base
  - forma/status do pagamento
  - serviços do pacote
  - total sem desconto
  - desconto do pacote
  - valor real do pagamento
  - agenda prevista das sessões automáticas
  - observações e renovação automática

## Regras mantidas
- Sem regressão no fluxo de templates
- Sem regressão na venda efetiva do pacote
- O submit continua enviando o payload do pacote vendido para o backend
