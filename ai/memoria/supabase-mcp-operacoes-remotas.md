# Supabase remoto neste projeto: usar MCP, nunca CLI

## Memória operacional

Neste repositório, qualquer operação remota do Supabase deve ser feita pelo MCP Supabase autorizado.

## Regra

- Para SQL remoto, usar `mcp__supabase.execute_sql`.
- Para migrations remotas, usar `mcp__supabase.apply_migration`.
- Para checagens remotas, usar ferramentas MCP Supabase.
- Não tentar `supabase link`, `supabase db push`, `supabase migration`, `supabase functions deploy` ou autenticação da Supabase CLI para remoto.
- Se o MCP estiver disponível, falha ou falta de auth da CLI não é bloqueio e não deve ser apresentada ao usuário como impedimento.

## Contexto

O usuário já autorizou e pediu explicitamente o uso do MCP Supabase para executar tudo no Supabase remoto. Em 2026-06-27 houve reincidência de tentativa via CLI antes de usar MCP; tratar este arquivo como prioridade antes de qualquer operação Supabase neste projeto.

## Migrations ja validadas no remoto em 2026-06-27

Nao dizer que estas migrations estao pendentes sem antes consultar `list_migrations` pelo MCP:

- `delete_unstarted_class_enrollments` (`20260627024936`): ja existia no remoto.
- `allow_delete_unstarted_class_with_planned_lessons` (`20260627031715`): ja existia no remoto.
- `delete_unstarted_class_with_validation_documents` (`20260627034250`): ja existia no remoto.
- `restore_gestao_resumo_kpis_rpc` (`20260627034738`): ja existia no remoto.
- `harden_academic_launch_helper_functions` (`20260627045913`): aplicada via MCP.
- `financeiro_receivables_summary_rpcs` (`20260627045953`): aplicada via MCP.
- `financeiro_transferencias_contas_rpcs` (`20260627050405`): aplicada via MCP.
- `create_library_storage_bucket` (`20260627050929`): aplicada via MCP.

Para o modulo financeiro, o frontend nao calcula saldos, patrimonio, recebiveis ou transferencias. Usar RPCs no banco e TanStack Query apenas para estado/cache.
