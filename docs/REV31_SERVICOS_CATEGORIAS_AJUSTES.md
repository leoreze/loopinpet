# REV31.1 — Serviços / Categorias

Ajustes aplicados sem regressão estrutural:

- tela de Serviços com carregamento contínuo em modal tema pet durante a hidratação inicial da página
- botão Categorias agora abre primeiro o modal de loading tema pet e depois o formulário
- edição de categoria também passa pelo loading de preparação
- modal de categorias com título e subtítulo em linhas separadas
- remoção do campo bloqueado "Cadastro"
- CRUD de categorias simplificado para:
  - Nome
  - Descrição
  - Ativo no sistema
- listagem de categorias reduzida para:
  - Nome
  - Descrição
  - Status
  - Ações
- respostas das ações continuam usando modal de feedback/loading global do sistema

Arquivos alterados:
- frontend/pages/tenant/services.html
- frontend/assets/js/management-pages.js
