# Cobrança EAD, estorno local e seleção de créditos avulsos

Data: 2026-11-05. Versão candidata: 4.8.245, revisão 254.

## Objetivo e autorização

Corrigir os três fluxos relatados pelo responsável e atualizar o GitHub. Três agentes convocados explicitamente; integração e publicação centralizadas. Produção, migrations e deploy de Edges não autorizados neste pedido. Não operar lançamentos reais das capturas.

## Diagnóstico e etapas

1. A matrícula EAD manual ativa sem cobrança. Confirmar intenção antes do checkout canônico, conservar pendência até pagamento e fechar atalhos legados.
2. Recebidos não oferecem estorno. Para recebimento avulso local comprovado, exigir motivo e confirmação, preservar valores e evidências e auditar a reversão. Não apresentar estorno local como devolução bancária.
3. O seletor exige classificação OUTRO_CREDITO, ausente em cobranças avulsas criadas por uma rota vigente. Corrigir a criação e reconhecer os casos legados por prova de origem sem enfraquecer as guardas de cancelamento.

## Critérios de aceite

- Escolher aluno não cria matrícula nem cobrança; confirmação inicia uma única tentativa reaproveitável.
- Acesso EAD exige pagamento confirmado; autorização por gestor e polo permanece válida inclusive para curso privado.
- Estorno local exige permissão financeira, motivo, idempotência e trilha; cobrança bancária liquidada não é revertida por alteração local.
- Crédito avulso legítimo é selecionável por linha, grupo e página, respeitando estado financeiro e proteção bancária.
- Manifesto exclusivo, arquivos manuais até 500 linhas, testes reais dos contratos com dados sintéticos, tipagem/build de integração e smoke visual proporcional.

## Manifesto explícito

- `modules/gestor/financeiro/outros-creditos/OutrosCreditosTab.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditRow.tsx`
- `supabase/functions/asaas/api/other-credit.service.ts`
- `supabase/migrations/20261105193000_other_credit_untyped_cancellation.sql`
- `modules/gestor/financeiro/outros-creditos/other-credit-standalone-selection.test.ts`
- `supabase/functions/asaas/api/other-credit-standalone-kind.test.ts`
- `supabase/tests/other_credit_untyped_cancellation.contract.sql`
- `supabase/tests/other_credit_untyped_cancellation.fixture.sql`
- `supabase/tests/other_credit_untyped_cancellation.test.mjs`
- `modules/gestor/financeiro/outros-creditos/other-credit-actions.test.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditReversalModal.tsx`
- `modules/gestor/financeiro/outros-creditos/other-credit-reversal.model.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-reversal.service.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-reversal.test.ts`
- `supabase/migrations/20261105223000_reverse_local_other_credit.sql`
- `supabase/tests/other_credit_reversal.sql.test.mjs`
- `modules/gestor/gestao/ead/detalhes/TurmaEadDetalhes.tsx`
- `modules/gestor/gestao/ead/detalhes/components/AdicionarAlunoEadModal.tsx`
- `modules/gestor/gestao/ead/detalhes/ead-turma.service.ts`
- `modules/gestor/gestao/ead/detalhes/hooks/useTurmaEadMutations.ts`
- `modules/gestor/gestao/ead/detalhes/ead-turma.presentation.ts`
- `modules/gestor/gestao/ead/detalhes/components/EadStatCard.tsx`
- `modules/gestor/gestao/ead/detalhes/hooks/useDebouncedValue.ts`
- `modules/gestor/gestao/ead/detalhes/ead-enrollment.smoke.test.mjs`
- `supabase/functions/gateways/checkout/ead-context.ts`
- `supabase/functions/gateways/checkout/ead-manager.ts`
- `supabase/functions/gateways/checkout/ead-manager.test.ts`
- `supabase/functions/gateways/checkout/ead-checkout-attempt.ts`
- `supabase/functions/gateways/checkout/types.ts`
- `supabase/migrations/20261105230000_require_ead_checkout_before_access.sql`
- `supabase/migrations/20261105230100_allow_manager_ead_private_course_checkout.sql`
- `supabase/tests/ead_manager_enrollment.isolated.test.mjs`
- `scripts/test-ead-credit-corrections-ui.mjs`
- `.github/workflows/ead-credit-corrections.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-05-ead-cobranca-estorno-creditos.md`

- `supabase/tests/other_credit_cancellation.isolated.test.mjs`

- `supabase/tests/ead_checkout_attempts.isolated.test.mjs`

Total: 41 arquivos

## Validação e implantação

Base remota obtida exclusivamente via MCP GitHub, main 834cb2508b455513622ca618f1475ccfb8a558ae. Todos os 6597 blobs da cópia isolada foram conferidos contra a árvore remota. Nenhum estado Git amplo usado como lista de trabalho.


- Reproduzido na sessão autenticada Safari: crédito avulso pendente com seleção desabilitada; crédito local recebido sem ação de estorno. Causa EAD confirmada no RPC remoto e nas capturas fornecidas.
- 23 testes Edge passaram, incluindo nove negativos/positivos do novo modo gestor. Os alunos comuns não ganham privilégios pela flag; a turma e o polo permanecem vinculados ao pedido.
- Oito testes Node passaram: seleção/validação do motivo, RPC de estorno com guards reais, contrato de avulsos sem tipo, matrícula privada service-only, ativação exclusivamente após pagamento e interação React DOM EAD (selecionar/voltar, duplo clique, erro e retomada).
- Um teste React DOM da linha confirmou seleção avulsa e ação de estorno somente para recebido local. A regressão completa existente de cancelamento passou com a quinta migration adicionada ao harness: ACL, replay, lease único, conclusão LOCAL/Banese, imutabilidade, ambiguidade, pagamentos, drift e reconciliação.
- Tipagem global, lint focado e `deno check` dos grafos `gateways/checkout/index.ts` e `asaas/api/index.ts` aprovados.
- Build integral aprovado em Node 24.22.1, binário oficial temporário com SHA-256 conferido. Node 24.19.0 da sessão foi corretamente rejeitado; nenhuma guarda de segurança foi alterada.
- `npm run check:file-lines` aprovado no candidato; os 41 arquivos deste manifesto também foram contados diretamente e todos respeitam 500 linhas.
- Safari nativo, componentes reais e I/O exclusivamente sintéticos: zero cobranças antes da confirmação; uma tentativa pendente após confirmar; seleção avulsa habilitada; estorno desabilitado sem motivo/confirmação e finalizado como ESTORNADO com histórico preservado. Não constitui smoke do backend novo implantado.
- Revisão cruzada de EAD e estorno pelos agentes, além da integração pelo principal. Não houve mutação de cobrança, aluno ou recebimento real.
- CI/Preview são evidências vinculadas à PR; os resultados locais acima são independentes da implantação.

## Sequência de implantação e limites

1. Antes de produção, confirmar autorização e aceite e conferir o ledger remoto. As quatro migrations deste lote não estavam aplicadas na leitura de 05/11/2026.
2. Aplicar as migrations novas em ordem: `20261105193000`, `20261105223000`, `20261105230000`, `20261105230100`, preservando as antigas. A migration de estorno falha fechado se o hash da proteção compartilhada divergir; o hash remoto foi conferido nesta sessão.
3. Implantar `asaas-api` (classificação de novas cobranças) e `payment-checkout` (matrícula EAD autorizada, inclusive curso privado). Não há novo gateway nem alteração de parser/PDF Banese.
4. Implantar frontend correspondente e executar smoke autenticado, com título controlado e confirmação financeira canônica. Produção não foi autorizada no pedido atual.
5. O estorno desta entrega corrige somente o recebimento avulso local comprovado. Recebimentos compostos, bancários, importados ou com vínculos financeiros/acadêmicos continuam exigindo o fluxo próprio de revisão. Não há exclusão física de histórico pago nem devolução bancária automática.
6. O lançamento das capturas foi apenas inspecionado para comprovar elegibilidade; não foi estornado, cancelado ou excluído. Matrículas já liberadas anteriormente não foram alteradas em massa.

## Preservação e operação

Fontes locais divergentes foram preservadas em cópias temporárias antes da integração sobre main. `useTurmaEadRealtime.ts`, alterações paralelas e arquivos idênticos à base não integram o manifesto. Artefatos de build, harness do Safari, dependências de teste, binário Node e índice RAG gerado são regeneráveis e não pertencem ao commit. Índice RAG regenerado no fechamento após compactação do resumo ativo.


## Ajustes após CI

A verificação específica das correções e a Preview passaram no primeiro candidato. O CI geral revelou dois problemas de validação: o resumo ativo havia ampliado o RAG de 80 para 82 trechos, e um cenário negativo antigo usava 01/11/2026 como pagamento futuro, que deixou de ser futuro. O resumo voltou a dois parágrafos com detalhes neste registro, sem alterar limites ou regras. O cenário agora consulta `current_date + 1` no PostgreSQL; a falha foi reproduzida na base main intacta e o teste completo passou com PGlite 0.5.8 após a correção. Nenhuma regra de produto, migration aplicada ou guarda de segurança foi modificada para acomodar os testes.
