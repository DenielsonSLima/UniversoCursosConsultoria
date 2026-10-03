# Exclusão segura de Convênios — 4.8.162

## Escopo e autorização

Pedido: disponibilizar Excluir nos cartões, tabela e detalhe de Convênios.
Usuário autorizou aplicar no banco e publicar após testes em 03/10/2026,
sem excluir convênio real durante a implantação. Base main:
`f78f21a3b7cbee8a127a6ac6f613bcb3eec405d4`. Revisão 171.
Lote independente da efetivação bancária bloqueada no PR 249.

## Critérios de aceite

- Confirmação explícita antes da exclusão, com trava durante processamento.
- Somente convênio inicial, aberto, sem saldo, movimentações ou fechamento.
- Histórico de créditos, despesas estornadas, sucessoras ou outras operações bloqueia.
- Arquivamento lógico preserva parceiro, competência e auditoria.
- Autorização Financeiro/Convênios/polo fail-closed e request idempotente.
- Listagens e Caixa ocultam arquivados; detalhe e novas movimentações rejeitam.
- Mudança de polo desmonta o estado anterior; retorno tardio não afeta outro polo.

## Manifesto explícito

Total: 20 arquivos.

- `modules/gestor/financeiro/convenios/ConveniosTab.tsx`
- `modules/gestor/financeiro/convenios/convenios.types.ts`
- `modules/gestor/financeiro/convenios/convenios.service.ts`
- `modules/gestor/financeiro/convenios/convenios.mapper.ts`
- `modules/gestor/financeiro/convenios/components/ConvenioMonthCard.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioMonthsTable.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioMonthDetailsPage.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioDeleteModal.tsx`
- `modules/gestor/financeiro/convenios/convenios-exclusao.test.ts`
- `modules/gestor/financeiro/convenios/convenios-exclusao.behavior.test.mjs`
- `supabase/migrations/20261003160000_convenios_financeiros_exclusao_logica.sql`
- `supabase/migrations/20261003160001_convenios_financeiros_leituras_ativas.sql`
- `supabase/tests/convenios_financeiros_exclusao_logica_pglite.sql`
- `supabase/tests/convenios_financeiros_exclusao_logica.contract.test.ts`
- `scripts/test-convenios-exclusao-logica-sql.mjs`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-03-convenios-exclusao-segura.md`

## Validação

- Suite Convênios: 23 testes aprovados; contratos SQL legado + novo: 16/16.
- Interface sintética JSDOM: 2 cenários aprovados, incluindo confirmação,
  pendência, erro/retry, cache e troca de polo com retorno tardio.
- PGlite isolado: 8 grupos de cenários aprovados; nenhum dado real utilizado.
- Revisão independente: sem achados críticos/importantes remanescentes.
  Concorrência revisada estaticamente, sem ensaio real de duas sessões.
- ESLint focado e whitespace aprovados; manifesto manual abaixo de 500 linhas.
- Check global local registra 14 pendências preexistentes de arquivos ausentes.
  Typecheck local registra apenas 2 erros preexistentes em TransferenciaFormModal.
  CI sobre base main limpa é o gate obrigatório antes da publicação.
- Smoke visual autenticado não realizado: usuário optou por continuar sem navegador.
  JSDOM não substitui conferência visual real.
- Preview, CI e produção terão evidências registradas no PR de publicação.

## Banco

Migrations aplicadas via MCP Supabase no projeto `kfekgwyqozhicpfuunpo`:

- Local `20261003160000` → ledger `20261003180754`.
- Local `20261003160001` → ledger `20261003180809`.

Catálogo confirma RPC com search_path vazio, SECURITY DEFINER,
sem EXECUTE para anon, e três triggers de proteção de arquivados.
Teste remoto com identidade ausente foi negado antes de consultar convênios.
Nenhum convênio real foi excluído ou arquivado na implantação.

## Preservação de trabalho paralelo

Somente o manifesto é publicado. Campos locais logoUrl não relacionados,
código de efetivação bancária e demais alterações locais permanecem fora.
Histórico do changelog e workflow remoto preservados, adicionando apenas este gate.

Rebase sobre a atualização paralela de Transferências 4.8.161; seus arquivos,
registro, changelog e gates foram preservados integralmente.
