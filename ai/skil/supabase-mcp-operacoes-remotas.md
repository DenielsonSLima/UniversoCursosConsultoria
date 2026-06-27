# Skill local: Supabase remoto via MCP

## Gatilho

Use esta regra sempre que a tarefa envolver Supabase remoto, banco remoto, migration, RLS, policies, Edge Functions remotas, Storage remoto ou consulta de dados remotos neste projeto.

## Procedimento obrigatório

1. Usar o MCP Supabase disponível na sessão.
2. Consultar dados com `mcp__supabase.execute_sql`.
3. Aplicar migrations ou SQL versionado com `mcp__supabase.apply_migration`.
4. Antes de aplicar ou reportar migration pendente, consultar `mcp__supabase.list_migrations`.
5. Comparar pelo nome da migration remota; nao reaplicar arquivo local duplicado com timestamp diferente.
6. Não usar Supabase CLI para operações remotas.
7. Não pedir login/token/link da CLI quando MCP estiver autorizado.
8. Registrar no resumo final que a operação foi feita via MCP.

## Ledger financeiro/biblioteca 2026-06-27

Estas migrations ja foram validadas/aplicadas no remoto via MCP e nao devem ser tratadas como pendentes sem nova consulta MCP:

- `delete_unstarted_class_enrollments`
- `allow_delete_unstarted_class_with_planned_lessons`
- `delete_unstarted_class_with_validation_documents`
- `restore_gestao_resumo_kpis_rpc`
- `harden_academic_launch_helper_functions`
- `financeiro_receivables_summary_rpcs`
- `financeiro_transferencias_contas_rpcs`
- `create_library_storage_bucket`

## Exceção

Supabase CLI só pode ser usada para ambiente local ou se o usuário pedir explicitamente CLI.
