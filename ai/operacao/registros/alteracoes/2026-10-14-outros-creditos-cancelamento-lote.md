# Cancelamento em lote de Outros Créditos — 14/10/2026

## Objetivo e aceite

Permitir selecionar parcelas, grupos ou a página em Outros Créditos e cancelar até 25 créditos por operação, com confirmação e resultado individual. Remover a consulta manual repetida por boleto e recuperar a listagem ao reconectar o Realtime.

- Capability específica do backend delimita crédito avulso LOCAL ou Banese/API nativo pendente.
- Pagamentos, vínculos acadêmicos, Proesc, convênios, empréstimos, CNAB e identidades ambíguas são recusados.
- Banese usa GET fresco, identidade/termos/pagamentos completos, intenção durável, cancelamento e GET terminal antes de atualizar o financeiro.
- Repetições preservam a operação; intenção remota anterior permite somente consultar o mesmo título.
- Histórico, referências, carnê original e pagamentos são preservados; não há reemissão ou comunicação ao pagador.
- Realtime limita invalidação ao polo visível e recupera eventos perdidos durante reconexão.

## Revisão conjunta

Três agentes revisaram seleção e interface, banco e API, Realtime e contratos SQL. A ação antiga de cancelamento era específica de outro gateway; os fluxos acadêmicos existentes não foram reutilizados. A rota dedicada mantém seleção canônica, autorização atual de aba/polo, lease e comparação do snapshot. A revisão independente também tornou negação explícita para permissões e horários malformados.

## Validação e limitações

- Reproduzida ausência de seleção/cancelamento na tela e confirmada origem da consulta manual no código vigente.
- Consulta somente leitura confirmou três títulos nativos API pendentes compatíveis com os prints; nenhum ato bancário foi executado.
- Migrations exercitadas em PostgreSQL/WASM isolado com dados sintéticos: ACL, replay, identidade, pagamento concorrente, prova bancária, lease, retomada, preservação e revogação.
- O ensaio PGlite verifica a exclusão por lease, mas não representa duas sessões PostgreSQL independentes.
- Testes da API, identidade bancária, processador, seleção, apresentação e Realtime executados sem acesso financeiro real.
- TypeScript, build e limites de arquivos conferidos; gates e resultados finais constam no PR deste lote.
- Safari autenticado não está disponível neste ambiente. Smoke autenticado e validação pós-implantação permanecem pendentes.

## Estado de entrega

BACKEND_APLICADO. Produção autorizada expressamente no pedido de 14/10/2026 às 14:56 (America/Maceio), mantendo a conclusão do cancelamento e incluindo um lote separado de pagamentos parciais/split.

Migrations aplicadas via MCP: 20261014175840, 20261014175848, 20261014175857 e 20261014175919. Edge gestor-other-credit-cancellation v1 ACTIVE com verify_jwt=true. Readback confirmou ACL mínima, search_path vazio, três títulos elegíveis ainda PENDENTE e zero operações financeiras iniciadas. Nenhum boleto foi cancelado pelo agente.

Versão candidata 4.8.220/revisão229. Frontend aguarda os gates do PR/Preview antes da publicação. Smoke autenticado Safari permanece pendente; smoke React/JSDOM sintético validou cliques, clique duplicado, resultado parcial, novo lote disjunto e retomada após desmontagem.

## Manifesto explícito

- `.github/workflows/other-credit-cancellation.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-14-outros-creditos-cancelamento-lote.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/financeiro/financeiro.composition-presentation.ts`
- `modules/gestor/financeiro/financeiro.types.ts`
- `modules/gestor/financeiro/hooks/useFinanceiroRealtime.test.mjs`
- `modules/gestor/financeiro/hooks/useFinanceiroRealtime.ts`
- `modules/gestor/financeiro/outros-creditos/OtherCreditCancellationModal.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditRow.test.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditRow.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditSelectionCheckbox.tsx`
- `modules/gestor/financeiro/outros-creditos/OutrosCreditosTab.tsx`
- `modules/gestor/financeiro/outros-creditos/other-credit-cancellation.attempt.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-cancellation.selection.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-cancellation.service.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-cancellation.smoke.test.mjs`
- `modules/gestor/financeiro/outros-creditos/other-credit-cancellation.test.tsx`
- `modules/gestor/financeiro/outros-creditos/useOtherCreditCancellation.ts`
- `modules/gestor/financeiro/outros-creditos/useOutrosCreditos.ts`
- `scripts/test-other-credit-cancellation-ui.mjs`
- `supabase/functions/gestor-other-credit-cancellation/bank.test.ts`
- `supabase/functions/gestor-other-credit-cancellation/bank.ts`
- `supabase/functions/gestor-other-credit-cancellation/contract.ts`
- `supabase/functions/gestor-other-credit-cancellation/handler.test.ts`
- `supabase/functions/gestor-other-credit-cancellation/handler.ts`
- `supabase/functions/gestor-other-credit-cancellation/index.ts`
- `supabase/functions/gestor-other-credit-cancellation/processor.test.ts`
- `supabase/functions/gestor-other-credit-cancellation/processor.ts`
- `supabase/functions/gestor-other-credit-cancellation/store.ts`
- `supabase/migrations/20261014175840_other_credit_cancellation_storage.sql`
- `supabase/migrations/20261014175848_other_credit_cancellation_commands.sql`
- `supabase/migrations/20261014175857_other_credit_cancellation_completion.sql`
- `supabase/migrations/20261014175919_other_credit_cancellation_capability.sql`
- `supabase/tests/other_credit_cancellation.fixture.sql`
- `supabase/tests/other_credit_cancellation.isolated.test.mjs`

Total: 38 arquivos.
