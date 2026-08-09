# Supabase, Auth e segurança

Carregue esta política somente para banco, migrations, Auth, Storage, RLS, Realtime, logs ou Edge Functions.

- Toda operação Supabase é feita exclusivamente pelo MCP Supabase; nunca use a CLI.
- Consulte migrations remotas antes de aplicar ou declarar pendência.
- Aplique mudança de schema por migration versionada e mantenha o arquivo local depois da aplicação.
- Não reescreva, apague ou compacte migrations aplicadas sem um plano formal de baseline para todos os ambientes.
- Use SECURITY DEFINER somente com search_path vazio, grants mínimos e guarda interna de identidade/empresa/polo.
- Em RPC idempotente, autorize antes de consultar request_id e aceite replay somente quando o payload imutável coincidir.
- Não registre segredos nem dados pessoais em logs, fixtures, RAG ou documentação.
- TanStack Query e Realtime invalidam somente o escopo realmente afetado.
- Uma mudança remota exige teste contratual focado; build completo não substitui validação da RPC real.
