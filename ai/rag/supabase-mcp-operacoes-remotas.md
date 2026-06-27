# Supabase MCP — Operações Remotas Obrigatórias

## Decisão operacional

Neste projeto, operações remotas do Supabase devem ser feitas pelo MCP Supabase, não pela Supabase CLI.

Isso inclui:

- aplicar migrations remotas;
- executar SQL remoto;
- ajustar RLS e policies;
- consultar estrutura/dados remotos;
- configurar Storage remoto;
- fazer deploy de Edge Functions;
- listar Edge Functions;
- ler conteúdo remoto de Edge Functions.

## Motivo

A Supabase CLI já retornou `401 Unauthorized` neste projeto durante operações remotas, mesmo quando o MCP Supabase estava autenticado e autorizado. Portanto, falha da CLI não deve ser tratada como bloqueio quando o MCP estiver disponível.

## Regra para agentes

- Antes de qualquer operação Supabase neste projeto, leia esta regra e priorize MCP.
- Use `apply_migration`, `deploy_edge_function`, `list_edge_functions`, `get_edge_function` ou ferramenta MCP equivalente.
- Não use `supabase link`, `supabase db push`, `supabase migration`, `supabase functions deploy` ou comandos equivalentes de CLI para remoto.
- Não peça token, login ou autenticação da CLI para executar tarefa remota que o MCP já consegue fazer.
- Só reporte bloqueio ao usuário se a operação falhar também pelo MCP.

## Incidente registrado

Em 2026-06-27, uma operação de publicação do catálogo de Ensino Superior tentou usar Supabase CLI antes do MCP, apesar desta regra já existir. Isso não deve se repetir: para este projeto, Supabase remoto é MCP primeiro.

## Exceção permitida

A Supabase CLI pode ser usada apenas para ambiente local, testes locais e comandos explicitamente solicitados pelo usuário.

## Migrations aplicadas/validadas por MCP

Antes de reaplicar ou dizer que uma migration esta pendente, conferir esta lista e validar no remoto via MCP `list_migrations`.

| Migration | Status | Confirmado em | Evidencia curta | Observacao |
| --- | --- | --- | --- | --- |
| `delete_unstarted_class_enrollments` | validada no remoto | 2026-06-27 | registrada como `20260627024936` | nao reaplicar por arquivo local duplicado |
| `allow_delete_unstarted_class_with_planned_lessons` | validada no remoto | 2026-06-27 | registrada como `20260627031715` | nao reaplicar por arquivo local duplicado |
| `delete_unstarted_class_with_validation_documents` | validada no remoto | 2026-06-27 | registrada como `20260627034250` | nao reaplicar por arquivo local duplicado |
| `restore_gestao_resumo_kpis_rpc` | validada no remoto | 2026-06-27 | registrada como `20260627034738` | nao reaplicar por arquivo local duplicado |
| `harden_academic_launch_helper_functions` | aplicada via MCP | 2026-06-27 | registrada como `20260627045913` | CLI local nao autorizada; MCP foi usado |
| `financeiro_receivables_summary_rpcs` | aplicada via MCP | 2026-06-27 | registrada como `20260627045953` | resumos por RPC, sem calculo no front |
| `financeiro_transferencias_contas_rpcs` | aplicada via MCP | 2026-06-27 | registrada como `20260627050405` | RPCs de transferencias e saldos no banco |
| `create_library_storage_bucket` | aplicada via MCP | 2026-06-27 | registrada como `20260627050929` | bucket `biblioteca` criado sem recriar policies publicas antigas |

Validacoes da rodada:

- `npm run lint`: passou.
- `npm run build`: passou.
- `git diff --check`: passou nos arquivos alterados.
- RPCs de transferencias: `anon` sem `EXECUTE`; `authenticated` com `EXECUTE` e validacao interna por polo.
- Bucket `biblioteca`: existe no remoto com limite de 10MB e policies autenticadas.
