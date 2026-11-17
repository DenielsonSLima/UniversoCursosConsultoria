# Relatório NFS-e: indicadores e situação por polo

## Autorização e escopo
Prévia aprovada e produção explicitamente autorizada em 17/11/2026. Faixa de oito indicadores e resumos NBS, polo e situação por polo. Sem emissão, numeração, escrita em notas ou apuração de impostos.

## Manifesto explícito
- `modules/gestor/relatorios/RelatoriosPage.tsx`
- `modules/gestor/relatorios/nfse/RelatorioNfse.tsx`
- `modules/gestor/relatorios/nfse/nfse-accounting.fixture.ts`
- `modules/gestor/relatorios/nfse/nfse-accounting.pdf.test.mjs`
- `modules/gestor/relatorios/nfse/nfse-accounting.pdf.ts`
- `modules/gestor/relatorios/nfse/nfse-accounting.service.ts`
- `modules/gestor/relatorios/nfse/nfse-accounting.types.ts`
- `modules/gestor/relatorios/nfse/nfse-accounting.indicators.ts`
- `supabase/migrations/20261117144426_nfse_tax_indicators_status_by_polo.sql`
- `supabase/tests/nfse_accounting_tax_indicators_status.isolated.test.mjs`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-17-nfse-indicadores-situacao-polo.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `internal/versioning/changelog/2026-11-17-historico-relatorio-v4.md`

Total: 16 arquivos.

## Segurança e validação
RPC v4 somente leitura, mesmas autorizações por unidade; helper XML privado. Valores ausentes não viram zero; totais incompletos não são apresentados como completos. Grupo social retido permanece combinado conforme NT008v1.02. Cancelamento somente confirmado; pendente/rejeitado preserva validade fiscal.
10/10 testes PDF e 8/8 SQL real PGlite com parser TS passaram; revisão independente concluída. Preview fictícia renderizada e aprovada. Safari autenticado indisponível: smoke visual real pendente. CI/build e produção verificados no fluxo de publicação.

## Base
Main 7d99653dd8669b08e2a0cdfa9ad6094db5b7c8fc, preservando emissor 4.8.361. Versão 4.8.362.
