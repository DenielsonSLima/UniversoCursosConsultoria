# Identidade canônica do acesso Google

Objetivo: eliminar falso negativo após corrigir contato de aluno/professor.

Causa confirmada: RPC legada buscava Auth pelo contato, enquanto a conta institucional existe por UID/login canônico. Sem alteração de contas, senhas, contatos ou envio de e-mails.

Critérios: usar UID e fallback somente login institucional; negar identidade ausente e polo não autorizado; preservar proteção do último método; separar cache por contato atualizado.

Validação: 7 testes SQL isolados, 13 testes UI/cache, TypeScript e lint focados aprovados. Migration20261112143359 aplicada via MCP após autorização; RPC real com gestor encontra conta canônica, aluno e anônimo negados. CI/deploy pendentes; smoke Safari autenticado pendente.

## Manifesto explícito

- `modules/gestor/parceiros/components/viewparceiros/shared/ParceiroAcesso.tsx`
- `modules/gestor/parceiros/components/viewparceiros/shared/partner-google-status.test.ts`
- `modules/gestor/parceiros/components/viewparceiros/shared/partner-google-status.ts`
- `modules/gestor/parceiros/components/viewparceiros/shared/student-access-refresh.test.ts`
- `supabase/migrations/20261112143359_partner_google_canonical_identity.sql`
- `supabase/tests/partner-google-canonical-identity.isolated.test.mjs`
- `ai/operacao/registros/alteracoes/2026-11-12-partner-google-canonical.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-27-versao-4-8-239.md`

- `.github/workflows/partner-google-identity.yml`

Total: 14 arquivos
