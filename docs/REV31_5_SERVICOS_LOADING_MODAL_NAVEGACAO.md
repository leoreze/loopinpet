# REV31.5 — Serviços: loading único na navegação e ações locais

## Ajustes aplicados
- removido o segundo loading específico da página de Serviços para evitar dupla abertura de modal
- mantido o loading global tema pet na navegação para /tenant/services e no refresh da página
- o loading global agora é o único responsável por permanecer aberto até a hidratação total da página e conclusão dos GETs
- botão **Categorias** continua usando o mesmo modal global antes da abertura do cadastro
- botão **+ Novo serviço** passa a usar o mesmo modal global antes da abertura do formulário

## Objetivo
Garantir experiência única de loading, sem regressão visual e sem conflito de comportamento no carregamento da tela de Serviços.
