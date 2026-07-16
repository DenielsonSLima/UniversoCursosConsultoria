# Instrucoes Do Agente

## Regra Critica De Git E GitHub

Neste projeto, operacoes de Git e GitHub devem ser realizadas pelo terminal.

- Use `git` para status, diff, branch, staging, commit, fetch e push.
- Use `gh` pelo terminal somente quando uma operacao especifica do GitHub exigir a CLI.
- Nao substitua o fluxo solicitado no terminal por conectores ou aplicativos GitHub.
- Antes de publicar, preserve alteracoes paralelas e adicione ao commit somente os arquivos do escopo solicitado.

## Regra Critica De Supabase

Neste projeto, Supabase e somente via MCP.

- Nao execute nenhum comando `supabase ...`, nem para consulta, listagem, ambiente local, migrations, status, link, db push/start/reset ou deploy de Edge Functions.
- Use MCP Supabase para banco, migrations, logs, Auth, Storage, RLS e Edge Functions.
- Se a CLI aparecer como caminho possivel, descarte e procure a ferramenta MCP equivalente.
- Erro `401 Unauthorized` da Supabase CLI nao e bloqueio quando o MCP estiver disponivel.
