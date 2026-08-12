# Alteração — Autorização remota de publicação

- Lote operacional: `2026-08-11-autorizacao-remota-publicacao`
- Estado: `CONCLUIDO`
- Escopo: skill local `pasta sem título/Acesso`, usada para operações remotas do projeto Universo Cursos.

## Registro

- A autorização explícita do titular para aplicar migrations revisadas e promover entregas solicitadas foi registrada na skill operacional, evitando uma confirmação rotineira repetida.
- A regra preserva as guardas: GitHub e Supabase somente por MCP, migrations versionadas/testadas e ausentes do histórico, manifesto explícito, CI/Preview e confirmação de Produção quando a solicitação a incluir.
- A autorização não alcança reset/force-push, exclusões amplas, alteração de dados financeiros históricos, cobrança real, segredos, usuários ou integrações externas sem pedido específico.

## Validação

- Frontmatter YAML validado pelo parser Ruby.
- O validador auxiliar da skill não foi executado porque o ambiente não possui o módulo `PyYAML`; não houve alteração de produto ou de banco por este lote operacional.
