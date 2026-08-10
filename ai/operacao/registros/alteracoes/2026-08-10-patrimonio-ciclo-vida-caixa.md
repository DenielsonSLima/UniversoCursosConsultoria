# Alteração — Patrimônio, catálogo e posição isolada no Caixa

- Lotes: `2026-08-10-patrimonio-catalogo-tipos-produto` e `2026-08-10-patrimonio-ciclo-vida-caixa`
- Estado no fechamento: `PRONTO_PARA_PUBLICACAO`
- Projeto Supabase: `kfekgwyqozhicpfuunpo`

## Resultado

- Patrimônio recebeu catálogo empresarial de tipos, valores em real brasileiro, total estimado e cadastro rápido no mesmo padrão visual do Financeiro.
- O ciclo de vida agora permite edição com concorrência otimista, baixa parcial ou integral por perda e exclusão lógica auditável somente antes de qualquer movimentação.
- Cards e tabela preservam as ações; a grade usa até quatro colunas e não repete o polo já selecionado.
- O Caixa mostra posição ativa, aquisições e perdas da competência em painel próprio. Esses valores não alteram receitas, despesas, saldo ou resultado operacional.

## Banco e segurança

- Migrations remotas: `create_patrimonio_product_type_catalog`, `create_patrimonio_lifecycle` e `fix_gestor_global_allowed_polos`.
- RPCs usam autorização por módulo/polo, idempotência, `expected_updated_at`, auditoria e `search_path` vazio; tabelas de escrita permanecem RPC-only.
- Smoke transacional com rollback cobriu criar, editar, baixar parcialmente, baixar integralmente e excluir logicamente; zero resíduo foi deixado no banco.

## Validações

- Patrimônio frontend e SQL: 40/40.
- Caixa e escopo de cache: 14/14.
- TypeScript global e build de produção aprovados.
- Revisão cruzada sem achado Critical/Important pendente.

## Riscos conhecidos

- Advisors mantêm avisos informativos de catálogo RPC-only e índices gerais do projeto; nenhum aviso bloqueante foi introduzido no fluxo.
- O smoke visual autenticado final integra a validação da publicação `4.2.0-beta.1`.
