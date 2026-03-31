# REV31.10 — Correção cadastro de cliente

- corrigido erro SQL no cadastro de novo cliente/tutor
- removido parâmetro excedente no INSERT de `tenant_tutors`
- removido parâmetro excedente no UPDATE de `tenant_tutors`
- elimina o erro: `bind message supplies 22 parameters, but prepared statement requires 21`
- ajuste pontual sem alterar layout, rotas ou fluxos fora do módulo de clientes
