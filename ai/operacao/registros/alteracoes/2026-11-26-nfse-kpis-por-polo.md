# Indicadores do Emissor NFS-e

Data: 2026-11-26
Versão: 4.8.373

## Entrega

- Agrupa contagens de emitidas e pendentes; preserva recebido no mês e erros.
- Mostra consolidado mensal e valores por polo na Matriz, no ambiente selecionado. Filiais mantêm apenas seu valor local. O total dos resultados filtrados permanece como texto na aba Emitidas.
- Soma autorizações por data fiscal em America/Maceio, exclui canceladas confirmadas e retorna somente agregados. Preserva escopo de empresa, acesso a polos, emissão e cancelamento.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-26-nfse-kpis-por-polo.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-12-versao-4-8-303.md`
- `internal/versioning/system-version.json`
- `modules/gestor/emissor-nfse/EmissorNfsePage.tsx`
- `modules/gestor/emissor-nfse/components/NfseDocumentsList.tsx`
- `modules/gestor/emissor-nfse/components/NfseEnvironmentStatus.interaction.test.mjs`
- `modules/gestor/emissor-nfse/dashboard/NfseDashboardCards.tsx`
- `modules/gestor/emissor-nfse/dashboard/nfse-dashboard-totals.ts`
- `modules/gestor/emissor-nfse/dashboard/nfse-dashboard.css`
- `modules/gestor/emissor-nfse/dashboard/useNfseDashboardTotals.ts`
- `modules/gestor/emissor-nfse/emissao/NfseDailyFlow.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseServicePostIssue.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emitidas/NfseIssuedTotalMetric.tsx`
- `supabase/migrations/20261126120333_nfse_issued_dashboard_totals.sql`

Total: 17 arquivos.

## Validação

- Prévia do fluxo com fixtures em desktop e celular; status, abas, Realtime e ausência de vazamento de outro escopo.
- SQL em PostgreSQL sintético: somas, 30+ notas, permissões, datas-limite, canceladas, erro, ambiente, zero e valor desconhecido.
- Build, TypeScript, quatro testes de interação e teto de linhas conferidos. A migração read-only registrada no Supabase como 20261126120333 tem execução concedida somente a authenticated e valida contexto, matriz e cada polo. Smoke autenticado no Safari depende de sessão disponível; nenhum teste emite ou cancela notas.
