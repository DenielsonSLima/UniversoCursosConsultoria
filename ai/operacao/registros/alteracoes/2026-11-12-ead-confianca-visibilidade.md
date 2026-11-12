# EAD: visibilidade de acesso por confiança

## Escopo e aceite
Início e Meus Cursos devem reconhecer o prazo canônico de acesso temporário sem converter PENDENTE em ATIVO ou registrar pagamento. Acesso expirado/cancelado permanece bloqueado. Primeiro acesso permite estudo, não prova ou certificado sem confirmação financeira.

## Validação e limitações
Helper, contrato real do portal e SQL isolado aprovados. Revisão independente aprovada, expiração visual por timer sem depender de structuralSharing. Início extraído para respeitar teto de 500 linhas. CI e publicação em fechamento. Smoke autenticado Safari pendente. Nenhuma migration, pagamento ou nota real.

## Manifesto explícito
- `.github/workflows/ead-trust-access.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-12-ead-confianca-visibilidade.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-28-versao-4-8-243.md`
- `internal/versioning/system-version.json`
- `modules/aluno/inicio/InicioPage.tsx`
- `modules/aluno/shared/ead-temporary-access.ts`
- `modules/aluno/shared/ead-temporary-access.test.ts`
- `modules/aluno/turmas/hooks/useAlunoTurmasData.ts`
- `modules/aluno/turmas/turmas.types.ts`
- `modules/aluno/turmas/turmas.utils.ts`
- `supabase/tests/ead_trust_access.isolated.test.mjs`

- `modules/aluno/inicio/useAlunoHomeData.ts`
- `modules/aluno/shared/ead-portal-trust.contract.test.mjs`

- `modules/aluno/turmas/ead-trust-visibility.test.mjs`

Total: 17 arquivos
