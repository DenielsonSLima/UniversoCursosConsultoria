# Convênios vinculados a faculdades parceiras — 2026-09-27

## Objetivo

Substituir o nome livre e o vínculo genérico do cadastro de Convênios por uma única seleção obrigatória de PJ classificada como `FACULDADE PARCEIRA / AFILIADO`.

## Manifesto explícito

Total: 16 arquivos

- `modules/gestor/financeiro/convenios/ConveniosTab.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioFormModal.tsx`
- `modules/gestor/financeiro/convenios/convenios.queryKeys.ts`
- `modules/gestor/financeiro/convenios/convenios.service.ts`
- `modules/gestor/financeiro/convenios/convenios.types.ts`
- `modules/gestor/financeiro/convenios/hooks/useConveniosQueries.ts`
- `modules/gestor/financeiro/convenios/convenios-ui.contract.test.ts`
- `supabase/migrations/20260927133000_convenios_faculdades_parceiras.sql`
- `supabase/migrations/20260927134000_convenios_faculdades_parceiras_scope_global.sql`
- `supabase/tests/convenios_financeiros.contract.test.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-09-27-convenios-faculdades-parceiras.md`

## Contrato entregue

- A Matriz recebe Anhanguera, vinculada ao polo, e Unopar, cadastrada como global.
- PF, alunos, professores, fornecedores e outras categorias PJ não aparecem no seletor.
- O navegador não coleta nome do convênio; o banco usa o nome canônico da PJ escolhida.
- A criação exige permissão da aba Convênios e escopo financeiro do polo.
- O texto “Polo: ... O primeiro aporte...” não aparece mais no modal.

## Validação

- 23 contratos de Convênios aprovados.
- TypeScript sem erros.
- Migrations aplicadas no projeto de produção e registradas no ledger.
- RPC real da Matriz retornou somente Anhanguera e Unopar.
- Advisors não apontaram achado novo fora do uso intencional das RPCs `SECURITY DEFINER`, ambas com grants mínimos e guarda interna.
