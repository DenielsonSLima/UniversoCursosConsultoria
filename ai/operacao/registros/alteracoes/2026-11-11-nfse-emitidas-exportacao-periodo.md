# NFS-e: relatório interno e total por período

## Pedido e aceite

- Exportar alinhado à direita da linha de abas quando Emitidas está selecionada.
- Modal no padrão NFS-e com pasta Modelos e Modelo interno, prévia do PDF e download do mesmo Blob.
- PDF vetorial A4 retrato, duas linhas por nota, cabeçalho/marca configurados da unidade, resumo de período, quantidade e valor no topo.
- Datas iniciam no mês atual de America/Maceio; alterar o mês reinicia o intervalo. Busca, origem e tipo de curso também são compartilhados com o KPI e o relatório.
- Total calculado no servidor sobre todos os resultados, não apenas a página. Canceladas confirmadas ficam fora do conjunto ACTIVE.
- Exportação usa snapshot único com até 10.000 notas. Excesso e dados incompatíveis falham explicitamente, sem truncar o relatório.
- Datas explícitas filtram a emissão real, inclusive preparação de outro mês. Ambas datas vazias preservam o mês de referência legado e o PDF identifica esse escopo.
- Nenhuma emissão, cancelamento ou alteração de conta, XML, certificado, serviço ou situação fiscal.

## Validação e limites

- Serviço/modal: 8 testes passaram, cobrindo snapshot completo de 501 linhas, escopo, duplicidade, datas, limite, null/zero, retry, close/Escape, foco e resultado tardio.
- Rascunhos de data inválidos ou ainda não aplicados bloqueiam Exportar e suspendem o KPI; correção e desmontagem limpam o estado.
- Período: calendário/fuso e teste DOM de sincronização dos filtros e KPI aprovados.
- Banco isolado: 7 testes passaram, cobrindo total antes da página, mês cruzado, limites de data em America/Maceio, canceladas, filtros, grants e limite do relatório.
- PDF: 6 testes passaram; fixture de 37 notas produziu 3 páginas A4 retrato com duas linhas físicas por nota. Texto nativo, cabeçalho canônico, logo/marca isolados e render inspecionados.
- Revisão independente do modal, transporte e exportador concluída sem falha bloqueante. Ajustado rótulo de datas vazias após revisão.
- Preview inicial aprovado; CI identificou tipagem de key no provider e mock antigo de consultas no teste de ambiente. Ambos corrigidos para nova execução dos gates. Migration ainda não aplicada. Publicação no GitHub e em produção autorizada especificamente pelo usuário, condicionada aos testes finais.
- Smoke Safari autenticado pendente: Mac offline. Testes DOM não substituem inspeção real do iframe nem layout no navegador.

## Manifesto explícito

Total: 30 arquivos

- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-11-nfse-emitidas-exportacao-periodo.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/emissor-nfse/EmissorNfsePage.tsx`
- `modules/gestor/emissor-nfse/components/NfseDocumentsList.tsx`
- `modules/gestor/emissor-nfse/components/NfseEnvironmentStatus.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emitidas/NfseIssuedFilters.tsx`
- `modules/gestor/emissor-nfse/emitidas/NfseIssuedPeriod.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emitidas/NfseIssuedPeriodContext.tsx`
- `modules/gestor/emissor-nfse/emitidas/NfseIssuedTotalMetric.tsx`
- `modules/gestor/emissor-nfse/emitidas/exportacao/NfseIssuedExportAction.tsx`
- `modules/gestor/emissor-nfse/emitidas/exportacao/NfseIssuedExportModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emitidas/exportacao/NfseIssuedExportModal.tsx`
- `modules/gestor/emissor-nfse/emitidas/exportacao/nfse-issued-export.css`
- `modules/gestor/emissor-nfse/emitidas/exportacao/nfse-issued-export.service-core.ts`
- `modules/gestor/emissor-nfse/emitidas/exportacao/nfse-issued-export.service.test.mjs`
- `modules/gestor/emissor-nfse/emitidas/exportacao/nfse-issued-export.service.ts`
- `modules/gestor/emissor-nfse/emitidas/nfse-issued-period.test.ts`
- `modules/gestor/emissor-nfse/emitidas/nfse-issued-period.ts`
- `modules/gestor/emissor-nfse/exportacao/interno/nfse-issued-export.pdf.test.mjs`
- `modules/gestor/emissor-nfse/exportacao/interno/nfse-issued-export.pdf.ts`
- `modules/gestor/emissor-nfse/exportacao/interno/nfse-issued-export.resources.ts`
- `modules/gestor/emissor-nfse/exportacao/interno/nfse-issued-export.types.ts`
- `modules/gestor/emissor-nfse/services/nfse.service-core.ts`
- `supabase/migrations/20261111120000_nfse_issued_period_report.sql`
- `supabase/tests/nfse_issued_period.fixture.sql`
- `supabase/tests/nfse_issued_period.isolated.test.mjs`
