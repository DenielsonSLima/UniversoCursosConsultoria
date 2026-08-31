# Conta integral e desconto Banese em recebíveis

Data: 2026-08-31  
Estado: migrations aplicadas; publicação autorizada e em andamento

## Pedido e decisão

Na visão do gestor, a conta recebedora deixa de ser mascarada para permitir a
conferência operacional da baixa. A repetição `Empresa / polo` sai do detalhe,
pois o seletor superior já define esse contexto. Em Contas a Receber, o
desconto confirmado do boleto passa a aparecer logo abaixo do valor nominal.

O desconto ofertado no boleto não é tratado como baixa: o sistema diferencia
`Desconto do boleto`, `Desconto expirado` e `Desconto aplicado`.

## Contrato entregue

- A conciliação chama uma RPC v2 que reaproveita o feed seguro anterior e
  enriquece apenas os itens já autorizados.
- Banco, agência e conta são apresentados sem máscara; CPF e demais dados
  sensíveis permanecem como estavam.
- A conta da baixa manual tem precedência sobre a conta do título somente
  quando a baixa pertence ao mesmo recebível e não foi revertida.
- A conta também precisa estar vinculada, em `contas_bancarias_polos`, ao polo
  do recebível. Falha de vínculo devolve o rótulo seguro anterior, sem expor a
  identificação integral.
- O helper compartilhado das RPCs v3 exige usuário autenticado, módulo
  Financeiro, aba Receber e escopo de polo. A exceção `service_role` permanece
  restrita à integração; o helper não é executável diretamente por clientes.
- A linha `Empresa / polo` foi removida apenas da apresentação; empresa, polo,
  filtros e autorizações continuam preservados.
- O desconto configurado exige boleto Banese, forma `BOLETO`, nosso número
  canônico de nove dígitos, snapshot confirmado e coerente com valor nominal e
  vencimento, além de ausência de quarentena de identidade.
- Desconto fixo e percentual são convertidos em valor monetário na RPC. A
  validade considera a data de Maceió.
- Títulos pendentes, vencidos ou suspensos mostram a oferta vigente/expirada.
  Títulos pagos mostram apenas o desconto efetivamente aplicado pela composição
  financeira canônica. Cancelados, estornados e devolvidos não mostram oferta.
- A baixa manual, os totalizadores e os dados financeiros existentes não são
  modificados por esse lote.

## Evidência e validação

- Leitura remota sem mutação: 325 títulos Banese com nosso número canônico, 324
  com desconto confirmado, 218 pendentes com desconto vigente e 17 vencidos
  com desconto expirado; 29 pagamentos têm desconto efetivamente aplicado.
- Testes focados da conta, desconto, mapeamento, tela e relatório: aprovados.
- `npm run test:financeiro-rpc`: aprovado.
- ESLint focal, `npx tsc --noEmit` e `npm run build`: aprovados.
- `npm run check:file-lines`: aprovado.
- Revisão independente: vínculo conta/polo, baixa/recebível e RBAC funcional
  reforçados; status do desconto ofertado usa allowlist explícita.
- Reunião com três agentes: as frentes financeira, segurança/RBAC e integração
  aprovaram o lote depois da correção que impede desconto aplicado sem nosso
  número.
- Produção remota: a RPC técnica retornou 691 recebíveis; na primeira página,
  137 tinham desconto configurado e 28 desconto aplicado, sem qualquer desconto
  configurado ou aplicado quando faltava nosso número.
- O feed seguro retornou 100 itens no smoke, 48 com agência e conta integrais e
  nenhum valor mascarado. A chamada sem permissão foi bloqueada com `42501`.
- Smoke visual autenticado: pendente para o preview/produção desta publicação.

## Operações remotas

- `20260831043316`: `add_secure_full_receiving_account_feed_v2`.
- `20260831043336`: `harden_receivables_filter_scope_rbac`.
- `20260831043524`: `expose_banese_boleto_discount_receivables`.
- As três funções usam `SECURITY DEFINER` com `search_path` vazio e ACLs
  explícitas. Os avisos do advisor sobre execução por `authenticated` são
  intencionais para as duas RPCs públicas; ambas fazem autorização interna.
- GitHub, preview, merge e deploy: em andamento após autorização explícita.

## Manifesto explícito

Total: 24 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/migrations-aplicadas.json`
- `ai/operacao/registros/COMMITS_E_DEPLOYS.md`
- `ai/operacao/registros/alteracoes/2026-08-31-conta-integral-e-desconto-banese-recebiveis.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/financeiro/financeiro.types.ts`
- `modules/gestor/financeiro/financeiro.receivables-page.service.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoRows.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-recebimentos.fetch.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-recebimentos.model.test.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.filter-state.contract.test.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/modalidade-receber.utils.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/modalidade-receber.utils.test.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableItemPresentation.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/useModalidadeReceberReport.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/receivable-boleto-discount.contract.test.ts`
- `supabase/migrations/20260831134000_add_secure_full_receiving_account_feed_v2.sql`
- `supabase/migrations/20260831134030_harden_receivables_filter_scope_rbac.sql`
- `supabase/migrations/20260831134100_expose_banese_boleto_discount_receivables.sql`
- `supabase/tests/secure_financial_receipts_v2.contract.test.ts`
- `supabase/tests/receivables_filter_scope_rbac.contract.test.ts`
- `supabase/tests/receivables_banese_discount.contract.test.ts`
