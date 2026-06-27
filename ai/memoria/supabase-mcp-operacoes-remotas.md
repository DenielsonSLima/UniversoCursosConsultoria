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

