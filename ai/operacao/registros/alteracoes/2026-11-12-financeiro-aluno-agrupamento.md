# Financeiro do aluno recolhido por tipo e curso

Usuário autorizou publicar o agrupamento após solicitar lista recolhida por padrão. Fotos confirmam Parceiros > Aluno > Financeiro.

## Escopo e aceite
- Tipo (Técnico, EAD, Livres e demais modalidades existentes) > curso > matrícula.
- Detalhes nativos acessíveis, recolhidos por padrão; troca de aluno/contexto reinicia estado.
- Identidade do curso vem do banco, não do nome; cursos homônimos e matrículas preservados.
- Totais, documentos, autorizações e dados financeiros não alterados.
- Migration read-only inclui ID/modalidade no payload dos dois readers existentes; sem alterar RLS/grants de tabelas.

## Manifesto explícito

Total: 15 arquivos

- `.github/workflows/student-banese-finance.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-12-financeiro-aluno-agrupamento.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-21-versao-4-8-231.md`
- `internal/versioning/system-version.json`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoFinanceiro.test.mjs`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoFinanceiro.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/parceiro-aluno-financeiro.groups.test.ts`
- `modules/gestor/parceiros/components/viewparceiros/aluno/parceiro-aluno-financeiro.groups.ts`
- `modules/gestor/parceiros/components/viewparceiros/aluno/parceiro-aluno-financeiro.service.ts`
- `supabase/migrations/20261112131518_partner_finance_course_groups.sql`
- `supabase/tests/partner_finance_course_groups.pglite.mjs`

## Validação
Nove testes UI/helper, PostgreSQL isolado com preservação de escopo e resumo, TypeScript e ESLint passaram. Build final e CI são gates de publicação. Migration aplicada via MCP em versão20261112131518 e grants/definições verificados remotamente. Nenhuma cobrança emitida, cancelada, baixada ou modificada. Smoke autenticado Safari pendente por Mac indisponível; não foi substituído por navegador alternativo.
