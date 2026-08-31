# Filtro por turmas ativas em Contas a Receber

Data: 2026-08-31  
Estado: em validação para publicação

## Pedido e decisão

Nas abas de recebíveis por modalidade, substituir o seletor de agrupamento por
um filtro de turmas em andamento. A listagem continua agrupada por aluno, pois
a modalidade já é definida pela aba atual e não deve ser escolhida de novo.

## Contrato entregue

- O seletor mostra `Todas as turmas` e, como opções, somente turmas com status
  `EM_ANDAMENTO` da modalidade e polo atuais.
- Trocar a turma reinicia a página e fecha os grupos expandidos, evitando que
  itens da seleção anterior permaneçam visíveis.
- Página, grupos, totais, indicadores e extrato usam o mesmo `turmaId`.
- Sem turma selecionada, a visão mantém todos os recebíveis autorizados; a
  restrição a ativas vale para as opções do filtro, não para apagar histórico.

## Segurança e dados

- As RPCs v3 validam o polo antes de acessar dados e aplicam simultaneamente
  polo, modalidade e turma no banco.
- A turma de outro polo ou modalidade não retorna títulos, mesmo que um ID seja
  enviado fora da interface.
- As funções novas são `SECURITY DEFINER` com `search_path` vazio; helper
  interno não é executável diretamente. Página, grupos e resumo são liberados
  apenas para `authenticated` e `service_role`.
- Nenhum título, valor, vencimento ou regra financeira foi criado, alterado ou
  removido por este lote.

## Validação

- Contract test Deno: 2/2 aprovados.
- ESLint focal e TypeScript: aprovados.
- Produção: uma turma ativa retornou 353 títulos na contagem bruta, na página,
  nos grupos e no resumo v3.
- Catálogo remoto: quatro funções com `SECURITY DEFINER` e `search_path` vazio;
  permissões mínimas confirmadas.
- O serviço financeiro foi modularizado por responsabilidade; todos os arquivos
  manuais novos ou alterados ficam abaixo de 500 linhas. A migration aplicada
  foi registrada no ledger com ID remoto e SHA-256 local.

## Manifesto explícito

Total: 20 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/migrations-aplicadas.json`
- `ai/operacao/registros/alteracoes/2026-08-31-filtro-turmas-ativas-recebiveis.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-08-11-a-2026-08-20.md`
- `internal/versioning/system-version.json`
- `modules/gestor/financeiro/financeiro.service.ts`
- `modules/gestor/financeiro/financeiro.types.ts`
- `modules/gestor/financeiro/financeiro.shared.service.ts`
- `modules/gestor/financeiro/financeiro.payables.service.ts`
- `modules/gestor/financeiro/financeiro.receivables.service.ts`
- `modules/gestor/financeiro/financeiro.receivables-page.service.ts`
- `modules/gestor/financeiro/financeiro.queryKeys.ts`
- `modules/gestor/financeiro/receber/hooks/useModalidadeReceberQueries.ts`
- `modules/gestor/financeiro/receber/components/ModalidadeReceberTab.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ModalidadeReceberToolbar.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/useModalidadeReceberReport.tsx`
- `supabase/migrations/20260831133000_add_active_class_filter_to_receivables.sql`
- `supabase/tests/receivables_active_class_filter.contract.test.ts`
