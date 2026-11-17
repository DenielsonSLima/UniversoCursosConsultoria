# Relatório NFS-e: CBS/IBS informativos

## Objetivo e autorização
Remover tributação nacional do PDF e mostrar CBS/IBS na terceira coluna, conforme prévia aprovada e autorização explícita de produção em 17/11/2026. Não inclui correções da piscada, emissão, reconciliação ou HTTP429.

## Manifesto explícito
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-17-nfse-resumo-cbs-ibs.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/relatorios/RelatoriosPage.tsx`
- `modules/gestor/relatorios/nfse/RelatorioNfse.tsx`
- `modules/gestor/relatorios/nfse/nfse-accounting.fixture.ts`
- `modules/gestor/relatorios/nfse/nfse-accounting.pdf.test.mjs`
- `modules/gestor/relatorios/nfse/nfse-accounting.pdf.ts`
- `modules/gestor/relatorios/nfse/nfse-accounting.service.ts`
- `modules/gestor/relatorios/nfse/nfse-accounting.types.ts`
- `supabase/migrations/20261117133452_nfse_accounting_tax_summary.sql`
- `supabase/tests/nfse_accounting_tax_summary.contract.test.mjs`
- `supabase/tests/nfse_accounting_tax_summary.isolated.test.mjs`

Total: 15 arquivos.

## Segurança e validação
RPC v3 somente leitura, autorização idêntica à v2 em todas as unidades, XML autorizado sem dados brutos no cliente. Cancelamentos confirmados fora dos totais. Valores ausentes ficam nulos; zero somente quando explícito. Não calcula alíquotas nem apura imposto. v2 preservada para rollback de frontend.
Testes PDF 9/9, contrato SQL 2/2, TypeScript e limite de linhas passaram. PGlite SQL funcional 6/6 passou; CI/Preview antes do merge. Migração 20261117133452 aplicada, permissões reais anon=false/auth=true/helper privado e extração XML sintética verificadas. Prévia rasterizada conferida com dados fictícios, sem substituir PDF vetorial. Safari indisponível (computadores offline): smoke visual autenticado não realizado.

## Base
Main 51c3dc2707c170b9906b57605db30ff4019c19a4. Versão 4.8.360 reservada para este lote isolado.
