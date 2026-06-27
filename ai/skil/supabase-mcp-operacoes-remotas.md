# Skill local: Supabase remoto via MCP

## Gatilho

Use esta regra sempre que a tarefa envolver Supabase remoto, banco remoto, migration, RLS, policies, Edge Functions remotas, Storage remoto ou consulta de dados remotos neste projeto.

## Procedimento obrigatório

1. Usar o MCP Supabase disponível na sessão.
2. Consultar dados com `mcp__supabase.execute_sql`.
3. Aplicar migrations ou SQL versionado com `mcp__supabase.apply_migration`.
4. Não usar Supabase CLI para operações remotas.
5. Não pedir login/token/link da CLI quando MCP estiver autorizado.
6. Registrar no resumo final que a operação foi feita via MCP.

## Exceção

Supabase CLI só pode ser usada para ambiente local ou se o usuário pedir explicitamente CLI.

