# Expiração segura e recompra EAD — versão 4.8.168

## Estado e autorização

O responsável autorizou implementar e aplicar em produção: “blz divida em ertapas
e pode aplicar isso entao”. Determinou execução interna, sem navegador.
O outro chat ficou parado na preparação anterior; alterações compatíveis foram
reaproveitadas. A classificação financeira 4.8.167 já estava publicada.

Esta entrega publica o ciclo completo com configuração de novas baixas desligada
durante a implantação. A ativação operacional ocorre após CI, promoção do frontend
e conferência bancária, limitada à Matriz de Japoatã/SE. A configuração no banco
e o evento “Ativou expiração EAD opcional” são a evidência de ativação efetiva.

## Critérios de aceite

- Compra inicial opcional permanece fora da inadimplência.
- Três dias bancários completos após vencimento útil, com calendário/polo verificados.
- Consultas estritas de título e pagamentos; identidade e termos financeiros iguais.
- Intenção persistida antes de PUT; confirmação bancária antes de cancelamento local.
- Processamento ou mutação ambígua ficam GET-only, sem novo PUT automático.
- Matrícula e histórico preservados; nova compra usa tentativa, título e inscrição próprios.
- Pagamento antigo retorna ao título original e bloqueia a tentativa concorrente.
- Dois pagamentos reais permanecem duas receitas e um acesso; revisão financeira visível.
- Resolução vincula devolução já paga, mesmo aluno/polo, comprovante e trilha de auditoria.
- Falhas de consulta entram em revisão visível sem inventar recebimento.
- Receitas, obrigações manuais/técnicas e arquivos paralelos preservados.

## Manifesto explícito

- `supabase/migrations/20261005015448_ead_checkout_expiration_schema.sql`
- `supabase/migrations/20261005015524_ead_checkout_expiration_claim.sql`
- `supabase/migrations/20261005015526_ead_checkout_expiration_finish.sql`
- `supabase/migrations/20261005015528_ead_checkout_expiration_guards.sql`
- `supabase/migrations/20261005015530_ead_checkout_expiration_release_gate.sql`
- `supabase/migrations/20261005015533_ead_checkout_attempt_model.sql`
- `supabase/migrations/20261005015535_ead_checkout_attempt_reservation.sql`
- `supabase/migrations/20261005015539_ead_checkout_attempt_projection.sql`
- `supabase/migrations/20261005015541_ead_verified_settlement_range.sql`
- `supabase/migrations/20261005015543_recover_optional_ead_payment.sql`
- `supabase/migrations/20261005015545_ead_student_states_payment_reviews.sql`
- `supabase/migrations/20261005020046_ead_attempt_release_legacy_singletons.sql`
- `supabase/migrations/20261005020048_schedule_ead_checkout_expiration.sql`
- `supabase/migrations/20261005020051_release_ead_checkout_lifecycle.sql`
- `supabase/migrations/20261005021410_cache_optional_ead_financial_classifiers.sql`
- `supabase/migrations/20261005022413_cache_optional_ead_expiration_eligibility.sql`
- `supabase/migrations/20261005023342_preserve_ead_expiration_review_recovery.sql`
- `supabase/tests/ead_checkout_expiration.fixture.sql`
- `supabase/tests/ead_checkout_expiration_test_setup.mjs`
- `supabase/tests/ead_checkout_expiration.isolated.test.mjs`
- `supabase/tests/ead_checkout_expiration_release_gate.isolated.test.mjs`
- `supabase/tests/ead_checkout_attempts.fixture.sql`
- `supabase/tests/ead_checkout_attempts.isolated.test.mjs`
- `supabase/tests/ead_expiration_schedule.isolated.test.mjs`
- `supabase/tests/ead_financial_classifier_cache.isolated.test.mjs`
- `supabase/tests/ead_expiration_recovery_review.isolated.test.mjs`
- `supabase/functions/banese-ead-checkout-expiration-worker/index.ts`
- `supabase/functions/banese-reconciliation-worker/ead-checkout-expiration-handler.ts`
- `supabase/functions/banese-reconciliation-worker/ead-checkout-expiration-handler.test.ts`
- `supabase/functions/banese-reconciliation-worker/ead-checkout-expiration.ts`
- `supabase/functions/banese-reconciliation-worker/ead-checkout-expiration.test.ts`
- `supabase/functions/banese-reconciliation-worker/ead-checkout-expiration-lifecycle.test.ts`
- `supabase/functions/banese-reconciliation-worker/ead-checkout-payment-recovery.ts`
- `supabase/functions/banese-reconciliation-worker/ead-checkout-payment-recovery.test.ts`
- `supabase/functions/banese-reconciliation-worker/diagnostic.ts`
- `supabase/functions/banese-reconciliation-worker/diagnostic.test.ts`
- `supabase/functions/banese/core/adapter/utils.ts`
- `supabase/functions/banese/core/adapter/boleto-cancellation.ts`
- `supabase/functions/banese/core/adapter/boleto-query-receipt-deadline.test.ts`
- `supabase/functions/banese/core/adapter/boleto-query.ts`
- `supabase/functions/banese/core/adapter/boleto-payment-query.ts`
- `supabase/functions/banese/core/adapter/boleto-cancellation-processing.ts`
- `supabase/functions/banese/core/adapter/boleto-cancellation-processing.test.ts`
- `supabase/functions/banese/core/adapter/boleto-payment-query-strict.test.ts`
- `supabase/functions/banese/internal/receipt-deadline.ts`
- `supabase/functions/banese/internal/receipt-deadline.test.ts`
- `supabase/functions/gateways/checkout/ead-context.ts`
- `supabase/functions/gateways/checkout/types.ts`
- `supabase/functions/gateways/checkout/ead-checkout-attempt.ts`
- `supabase/functions/gateways/checkout/ead-checkout-attempt.test.ts`
- `supabase/functions/gateways/checkout/ead-context.test.ts`
- `supabase/functions/gateways/checkout/providers/gateway.ts`
- `supabase/functions/gateways/checkout/providers/gateway-receivable.ts`
- `supabase/functions/gateways/checkout/providers/gateway-created-response.ts`
- `supabase/functions/gateways/online-inscription.ts`
- `supabase/functions/gateways/online-inscription-identity.ts`
- `supabase/functions/gateways/online-inscription.test.ts`
- `supabase/functions/gateways/online-inscription-attempts.test.ts`
- `supabase/functions/gateways/online-inscription.fixture.ts`
- `supabase/functions/gateways/webhook/domain/ead-enrollment.ts`
- `modules/asaas/asaas.service.ts`
- `modules/aluno/cursos/hooks/useAlunoCoursesCatalog.ts`
- `modules/aluno/cursos/hooks/useCourseCheckout.ts`
- `modules/aluno/cursos/components/CourseCatalogGrid.tsx`
- `modules/aluno/cursos/eadPurchaseState.ts`
- `modules/aluno/cursos/eadPurchaseState.test.ts`
- `modules/gestor/gestao/ead/GestaoEad.tsx`
- `modules/gestor/gestao/ead/ead-payment-review.service.ts`
- `modules/gestor/gestao/ead/ead-payment-review.model.ts`
- `modules/gestor/gestao/ead/components/EadPaymentReviewPanel.tsx`
- `modules/asaas/checkout-result.ts`
- `modules/gestor/gestao/ead/components/EadRefundResolutionForm.tsx`
- `modules/gestor/gestao/ead/components/EadRefundPicker.tsx`
- `docs/contracts/ead-compra-opcional-expiracao.md`
- `docs/contracts/ead-expiracao-calendario-2026.md`
- `.github/workflows/ead-checkout-lifecycle.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-04-ead-expiracao-recompra-publicacao.md`

Total: 80 arquivos.

## Sequência de implantação

1. Schema/RPCs aditivos, configuração e readiness desligados; unicidades antigas mantidas.
2. Redeploy dos consumidores do helper de inscrições usando identidade exata e CAS.
3. Remoção das unicidades globais; índices de legado, unicidade acadêmica e tentativa corrente permanecem.
4. Worker próprio e cron autenticado, com segredo lido em Vault somente na execução.
5. Readiness de código com pré-requisitos; configuração operacional continua desligada.
6. Publicação isolada, CI e Preview; promoção para produção.
7. Ativação apenas da Matriz com calendário de 2026; observação posterior independente.

Os bundles publicados anteriormente são a base dos artefatos. Somente arquivos
do manifesto e seus novos imports são sobrepostos. Três arquivos de tipos já
versionados complementam dependências que o empacotamento antigo omitiu.
O handler normal 102 não recebe o hook de expiração preparado no outro chat.
Sua conciliação conserva o cron e o orçamento anteriores.

## Reprodução e validação

Diagnóstico interno Banese, somente GET, confirmou o título de R$99,90 pendente,
sem pagamento efetivado na consulta anterior à implantação.
Vencimento 03/10/2026, sábado: vencimento útil 05/10, margem completa 06–08/10,
primeiro cancelamento possível 09/10. O calendário não é prova de ausência de pagamento.

92 testes Deno do workflow específico e quatro testes Node passaram.
Build, TypeScript e lint focado passaram. Ensaios PostgreSQL/WASM cobrem emissão,
replay, margem, processamento, intenção/timeout, recuperação, recompra, corrida entre
emissão e pagamento antigo, duas receitas/um acesso, devolução e autorização por polo.
Comparação independente de 1.029 combinações SQL/TypeScript: zero divergências.

A implantação revelou timeout de oito segundos na prestação mensal: os wrappers
SQL planejavam a prova legada para 1.546 lançamentos, embora apenas quatro fossem
candidatos. A migration corretiva preserva os OIDs e critérios e usa statements
PL/pgSQL reutilizados, com filtros equivalentes antes da prova legada.
Regressão independente: 129 combinações, histórico, natureza durável e receitas
preservados; 2.000 cobranças comuns não consultam a prova legada pesada.
As migrations anteriores já aplicadas permanecem imutáveis.
Aceite real interno após a corretiva: RPC mensal completa com o perfil do gestor,
Matriz, outubro e três meses de histórico, sob statement_timeout de oito segundos.
Execução PostgreSQL: 486,688 ms; payload v2 no polo correto, três competências,
R$ 2.847,02 recebidos em 11 registros, base R$ 41.994,50 e atraso R$ 0,00.
O aumento de recebimentos corresponde aos dados atuais, sem fixture financeira.

A mesma causa foi reproduzida na seleção do worker habilitado, sob limite de dez
segundos. Corretiva separada preserva a elegibilidade estrita e a prova da compra
canônica paga para limpar uma tentativa concorrente. SELECT exato da seleção,
com configuração virtual da Matriz, executado em transação somente leitura:
221,555 ms, planejamento 34,565 ms, três candidatas após todos os vetos.
O ensaio completo de tentativas também passou com as duas corretivas carregadas.

Recuperação e cron preservam consultas GET de intenções, pagamentos em processamento
e títulos cancelados em revisão, mesmo com configuração desligada, calendário
ausente ou mudança de ano. Ensaio com seis falhas adicionais de lease: VERIFY ou
OBSERVE, novo PUT bloqueado e pagamento confirmado posteriormente concluído no
título original. Revisões sem marcador bancário permanecem paradas.

Regressões executadas nos pacotes efetivos, com banco simulado: worker 47,
checkout 40, gateway API 24, Asaas 24, checkout API 22, webhook 17 e novo worker 24.
Integridade dos 597 arquivos dos sete artefatos conferida.
Nenhum aluno, pagamento ou cancelamento real serviu de fixture.

## Limites e evidência operacional

Quatro bundles antigos já possuem diagnósticos de tipo em contratos não alterados:
allowDiscountRemoval em recuperação/desconto e signal na projeção Banese.
Baseline e artefato têm os mesmos diagnósticos, sem novos erros. As regressões de
execução desses quatro pacotes usaram no-check; worker, webhook e novo worker
têm validação de tipos aprovada. O CI do código publicado verifica a integração.

Smoke visual e abertura autenticada do comprovante não foram executados, conforme
instrução do responsável. Consultas internas não são descritas como smoke visual.

Novos cancelamentos fora da Matriz ou em 2027 permanecem bloqueados até conferir
calendário correspondente. Consultas de intenções iniciadas e pagamentos tardios
continuam disponíveis mesmo quando novas baixas estão desligadas.
O limite de 14 dias existente em metadados não encerra a observação bancária.
A lista adicional do calendário está em docs/contracts/ead-expiracao-calendario-2026.md.
