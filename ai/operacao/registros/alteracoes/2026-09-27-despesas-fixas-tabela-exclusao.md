# Despesas Fixas: tabela e exclusão em lote — 2026-09-27

## Objetivo

Tornar a operação de despesas fixas mais legível e direta, mantendo todas as ações visíveis, corrigindo modais presos e permitindo excluir lançamentos ainda não pagos sem exigir uma justificativa manual.

## Manifesto explícito

Total: 25 arquivos

- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-09-27-despesas-fixas-tabela-exclusao.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `scripts/test-despesas-contas-pagar-contract.mjs`
- `supabase/migrations/20260927150000_excluir_despesas_pendentes_lote.sql`
- `modules/gestor/financeiro/despesas/components/DespesaBaixaModal.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaCancelModal.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaCard.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaDeleteModal.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaEditModal.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaGroupedView.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaListWorkspace.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaModalPortal.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaSelectionBar.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaTable.tsx`
- `modules/gestor/financeiro/despesas/despesas-lancamentos.service.ts`
- `modules/gestor/financeiro/despesas/despesas.service.ts`
- `modules/gestor/financeiro/despesas/despesas.types.ts`
- `modules/gestor/financeiro/despesas/fixas/DespesasFixasTab.tsx`
- `modules/gestor/financeiro/despesas/fixas/useDespesasFixasReport.tsx`
- `modules/gestor/financeiro/despesas/hooks/useDespesaPendingDeletion.ts`

## Contrato entregue

- A tabela usa cinco colunas responsivas, quebra de texto e faixas alternadas; não depende mais de uma barra horizontal para acessar ações.
- Descrição, categoria, fornecedor, datas, valores, situação e ações permanecem identificáveis em duas faixas visuais por registro.
- Pendentes e vencidas têm `Excluir`; pagas conservam `Estornar e cancelar` e seu fluxo auditado com justificativa.
- Seleção em lote aceita até 100 lançamentos do mesmo polo e tipo, com uma única confirmação e sem textarea de motivo.
- A exclusão é lógica, atômica e idempotente: o registro fica auditável, mas deixa listas e totais econômicos.
- Modais usam portal no `document.body`, bloqueiam o scroll do fundo e respeitam Escape, foco e viewport.

## Validação

- Reunião técnica com três agentes independentes: UX, arquitetura de modais e risco/publicação.
- 6 contratos focados aprovados.
- TypeScript, lint focado e build de produção aprovados.
- Migração aplicada por MCP Supabase; RPC disponível somente a autenticados e nenhum lançamento foi excluído durante a implantação.
- Smoke autenticado de produção deve confirmar tabela, seleção, confirmação e modais após a publicação.
