# Instrucoes Do Agente

## Regra Critica De Supabase

Neste projeto, Supabase e somente via MCP.

- Nao execute nenhum comando `supabase ...`, nem para consulta, listagem, ambiente local, migrations, status, link, db push/start/reset ou deploy de Edge Functions.
- Use MCP Supabase para banco, migrations, logs, Auth, Storage, RLS e Edge Functions.
- Se a CLI aparecer como caminho possivel, descarte e procure a ferramenta MCP equivalente.
- Erro `401 Unauthorized` da Supabase CLI nao e bloqueio quando o MCP estiver disponivel.

