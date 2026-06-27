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
