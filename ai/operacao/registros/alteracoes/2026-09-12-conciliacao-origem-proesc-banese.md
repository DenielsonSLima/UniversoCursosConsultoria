# Conciliação por origem — 4.8.50

Estado: versão 4.8.50 publicada e confirmada por HTTP; smoke autenticado final em andamento.

Base publicada: PR143, squash 58a6675fcc531d4e907987b0d5281698fb6ad7e6, versão 4.8.49/revisão 58. Nova revisão prevista: 4.8.50/59.

## Pedido e classificação

O usuário solicitou remover a ação Atualizar Dados e os textos indevidos de Mercado Pago da Conciliação, além de acrescentar o filtro Proesc/Banese ao lado da busca. Trata-se de mudança crítica por envolver consultas financeiras, RPC e publicação.

O frontend coleta a seleção e apresenta o retorno. Origem, filtro, paginação, contagens e totais pertencem ao backend/RPC; não se fazem cálculos ou filtragem financeira local para produzir os resultados.

## Escopo e preservação

- A Conciliação remove Atualizar Dados e a atualização em lote. O filtro Todas/Proesc/Banese fica junto à busca e encaminha o critério às RPCs.
- Origem, contagem, paginação e estado são projetados pelo servidor. Registros Proesc em REVIEW são identificados como conferência, sem vencimento presumido nem ação de consulta Banese. CANCELADO/SUSPENSO são preservados; vencimento operacional sem prova Proesc passa à projeção PENDENTE e ao filtro correspondente.
- Backend e interface são frentes independentes coordenadas pelo responsável do lote.
- O patch deve preservar autorização, filtro por polo e identidade da origem de cada obrigação.
- A remoção do botão não autoriza desligar os monitores automáticos de Proesc ou Banese.
- Não emitir cobranças, alterar pagamentos ou reimportar alunos/turmas neste lote.
- Alterações locais paralelas continuam preservadas. Publicação parte da base remota, inclusive o registro de manifestos; a alteração local isolada Sistema anterior no utilitário financeiro fica fora do commit.
- Migrations 20260913000000 e 20260913000010 aplicadas com sucesso por MCP: projeção de origem e RPCs de conciliação. As duas fontes aplicadas são imutáveis, assim como as migrations de entregas anteriores.

## Critérios de aceite

- A tela não apresenta a ação Atualizar Dados nem textos indevidos de Mercado Pago.
- O filtro Proesc/Banese aparece junto à busca, encaminha o critério ao backend e mantém a busca e a paginação coerentes com a origem selecionada.
- Resposta, contagens e totais correspondem ao mesmo conjunto autorizado pela RPC, sem cálculos financeiros no frontend.
- Banese e Proesc preservam seus estados e permissões. Casos desconhecidos não recebem origem presumida.
- Testes focados dos contratos alterados, smoke real autenticado e validação proporcional para publicação aprovados e registrados antes do encerramento.

## Validação e publicação

- 14 testes de contrato/modelo e 11 testes de renderização aprovados.
- TypeScript global sem diagnósticos e ESLint das frentes backend de tela/UI aprovado.
- Smoke sintético dos componentes reais aprovado em desktop 1440 e mobile 390.
- Build completo 4.8.50 aprovado em 8,17 segundos.
- Sessão autenticada na base 4.8.49 reproduziu o botão Atualizar Dados, textos Mercado Pago e ausência do filtro de origem. A sessão Safari está disponível para o smoke após a publicação.
- Teste financial_reconciliation_sources.readonly.sql executado no banco real por MCP em 7,85 segundos, incluindo overhead: todos os asserts aprovados. Nove chamadas conferiram negativas de autorização/escopo, paginação, origem, pagos, pendentes, REVIEW/VENCIDO e paridade de valores, datas, composição e conta com a projeção V2.
- Projeção real de pagamentos em todos os polos: 3.821 no total, 3.740 Proesc e 56 Banese (55 pela API e um manual). Outras 25 baixas manuais permanecem na opção Todas; paridade com V2 aprovada.
- PR144 incorporado após autorização explícita do usuário, squash 4b513e085dcb6c0dcf133cf9c0975f28a0023caf. Vercel SUCCESS no deployment J7mkS62Avibmi9AXPuR42EGj3jpE; produção HTTP 200 no asset main-B8U4uhUw.js com versão 4.8.50 confirmada. Smoke autenticado final em andamento pelo coordenador.

Publicação executada pelo coordenador. O RAG da 4.8.50 foi reindexado uma vez por ele, com 11 fontes e 71 chunks; não repetir nesta continuação documental.

## Manifesto explícito

Total: 24 arquivos.

São 24 arquivos: sete de interface, sete de consultas/modelos/contratos, duas migrations, um teste SQL e sete de versão/documentação/registro. A publicação usa somente este manifesto sobre 58a6675fcc531d4e907987b0d5281698fb6ad7e6. O registro de manifestos usa a base remota mais este lote; três referências locais paralelas são preservadas fora da publicação. O utilitário paralelo Sistema anterior não pertence à entrega.

- `modules/gestor/financeiro/conciliacao-bancaria/ConciliacaoBancariaTab.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoOrigemBaixaPanel.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoFilters.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoRows.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoPagination.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoOrigemBaixaPanel.test.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoRows.test.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.fetch.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.utils.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-recebimentos.fetch.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-recebimentos.model.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-recebimentos.model.test.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.filter-state.contract.test.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/hooks/useBaneseConciliacaoQueries.ts`
- `supabase/migrations/20260913000000_reconciliation_source_projection.sql`
- `supabase/migrations/20260913000010_financial_reconciliation_rpc.sql`
- `supabase/tests/financial_reconciliation_sources.readonly.sql`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/MEMORIA_CANONICA.md`
- `ai/operacao/registros/alteracoes/2026-09-12-proesc-importacao-xls.md`
- `ai/operacao/registros/alteracoes/2026-09-12-conciliacao-origem-proesc-banese.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
