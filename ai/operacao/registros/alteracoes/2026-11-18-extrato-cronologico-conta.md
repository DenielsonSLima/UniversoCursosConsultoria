# Extrato: ordem, cores e conta completa

## Escopo
PDF cronológico, entrada verde e saída vermelha. Gestor global pode selecionar a conta completa com todos os polos; gestor local permanece restrito. Origem diferenciada por cidade/UF; transferência identifica polo relacionado. Nenhuma transação criada ou modificada.

## Aceite
Ordem data/id ASC exclusivamente no PDF, saldos e autorização canônicos preservados. Migrações antes do frontend. Produção autorizada explicitamente pelo usuário em 18/11/2026.

## Manifesto explícito
- `modules/gestor/components/GestorModuleContent.tsx`
- `modules/gestor/relatorios/RelatoriosPage.tsx`
- `modules/gestor/relatorios/components/RelatorioMovimentacaoFinanceira.tsx`
- `modules/gestor/relatorios/components/movimentacao-financeira.presentation.ts`
- `modules/gestor/relatorios/components/ExtratoContaScope.tsx`
- `modules/gestor/relatorios/extrato-conta-scope.ts`
- `modules/gestor/relatorios/extrato-conta-scope.test.ts`
- `modules/gestor/relatorios/extrato-financeiro-pdf.service.ts`
- `modules/gestor/relatorios/relatorios.financeiro-separado.contract.test.ts`
- `modules/gestor/financeiro/components/FinancialReportPreview.tsx`
- `modules/gestor/financeiro/components/financial-report.vector-pdf.types.ts`
- `modules/gestor/financeiro/components/financial-report.vector-pdf.layout.ts`
- `modules/gestor/financeiro/components/financial-report.vector-pdf.test.ts`
- `supabase/migrations/20261118000100_extrato_pdf_chronological.sql`
- `supabase/migrations/20261118000200_extrato_polo_origin_labels.sql`
- `scripts/test-extrato-pdf-sql.mjs`
- `ai/operacao/registros/alteracoes/2026-11-18-extrato-cronologico-conta.md`
- `ai/operacao/LOTE_ATIVO.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/changelog/2026-11-11-versao-4-8-293.md`
Total: 22 arquivos.

## Validação
PDF vetorial10/10, escopo7/7, contrato2/2, PGlite wrapper e rótulos aprovados. Render, texto e RGB inspecionados. TypeScript/build e CI/Preview no fechamento. Sem smoke autenticado real disponível; simulação usa dados fictícios.

## Publicação
Lote isolado do ajuste NFS-e paralelo. Wrapper SECURITY INVOKER reutiliza autorização existente; patch de rótulos exige hashes exatos de entrada/saída e preserva restante da função. Nenhuma política RLS ou acesso novo concedido.
