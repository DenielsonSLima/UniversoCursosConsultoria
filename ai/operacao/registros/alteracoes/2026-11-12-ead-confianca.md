# EAD: acesso por confiança

## Escopo
Liberação temporária única de 24 horas por matrícula EAD pendente, autorizada por gestão e turma. Sem baixar título, alterar status da matrícula, prova ou certificado. O horário definitivo vem do servidor; repetição preserva o prazo e vencimento nega reativação.

## Validação
Testes de prazo, contexto, cancelamento, aluno alheio, auditoria e finanças preservadas; TypeScript e lint focado. CI SQL e build no fechamento. Migrations revisadas e aplicadas antes do frontend. Smoke Safari autenticado pendente.

## Manifesto explícito
- `.github/workflows/ead-trust-access.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-12-ead-confianca.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-27-versoes-4-8-236-a-237.md`
- `internal/versioning/system-version.json`
- `modules/aluno/cursos/cursosPage.utils.ts`
- `modules/aluno/cursos/eadTrustAccess.test.mjs`
- `modules/aluno/cursos/hooks/useAlunoCoursesCatalog.ts`
- `modules/aluno/cursos/hooks/useEadLearning.ts`
- `modules/gestor/gestao/ead/detalhes/TurmaEadDetalhes.tsx`
- `modules/gestor/gestao/ead/detalhes/components/EadTrustAccessAction.tsx`
- `modules/gestor/gestao/ead/detalhes/ead-turma.types.ts`
- `supabase/migrations/20261112141935_ead_temporary_trust_access.sql`
- `supabase/migrations/20261112141950_trust_ead_get_aluno_progress_core_20260822.sql`
- `supabase/migrations/20261112141956_trust_ead_update_aluno_progress.sql`
- `supabase/migrations/20261112142059_trust_ead_get_turma_alunos.sql`
- `supabase/tests/ead_trust_access.isolated.test.mjs`

Total: 20 arquivos
