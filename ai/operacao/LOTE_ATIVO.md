# Lote ativo

Estado: `PRONTO_PARA_PREVIEW_E_ROLLOUT_AUTORIZADO`

## Lote: 2026-08-26-bolepix-e-notificacoes-financeiras-seguras

- Pedido: revisar todas as alterações com três agentes e publicar GitHub, Supabase, Edge Functions e sistema web em Produção.
- Registro: `ai/operacao/registros/alteracoes/2026-08-26-bolepix-e-notificacoes-financeiras-seguras.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-26-bolepix-e-notificacoes-financeiras-seguras.md`.
- Autorização: Produção solicitada explicitamente pelo titular em 2026-08-26, condicionada à revisão e aos gates.
- Base remota: `main` `6bbadbeb4eeee8758e33467dd0c8600a46f84534` (`4.8.5`). O HEAD Git local histórico não é base de publicação.

### Contratos do lote

1. Trancamento preserva dívidas vencidas na data efetiva e suspende somente títulos futuros; aviso de cobrança exige `data_pagamento IS NULL` e status `PENDENTE` ou `VENCIDO`.
2. WhatsApp, Push e inbox revalidam título e identidade antes do efeito externo. A ordem de locks é `contas_receber → job → delivery`.
3. Financeiro do Aluno e jornada Cursos recebem somente opções EAD roteáveis, sem credenciais nem composição de rota no frontend.
4. BolePix usa um título Banese `BOLETO`. A apresentação Pix só abre com payload ou imagem oficial; sem isso, backend e UI rebaixam para o PDF do mesmo boleto.
5. Reuso de checkout exige o mesmo recebível, aluno, matrícula, turma, descrição, valor, vencimento, status local cobrável, ausência de pagamento e identidade remota válida; a revalidação ocorre antes, entre e depois dos reparos assíncronos.
6. PIX Banese direto permanece bloqueado em sandbox e produção antes de qualquer leitura de configuração; o bloqueio não alcança o Pix devolvido dentro do BolePix.

### Reunião e aceite técnico

- Três frentes independentes revisaram notificações, EAD/BolePix e segurança/release.
- O veredito inicial foi `NO-GO` por inversão de locks, reapresentação de título não cobrável e painel Pix sem payload.
- Os P1 foram corrigidos antes de qualquer alteração remota: migration de runtime separada, revalidação fail-closed nos dois checkouts e downgrade canônico para boleto.
- Suíte focada: `80/80`; TypeScript global, ESLint focado e `deno check` dos seis entrypoints Edge aprovados.
- Todos os 53 arquivos do manifesto têm no máximo 500 linhas; `provider-checkout.ts` foi dividido de 544 para 427 linhas.
- Lint global, versão, operação, teto de linhas, TypeScript e build local foram aprovados. Permanecem obrigatórios: CI, Vercel Preview, preflight Supabase e smoke fail-closed.

### Ordem remota autorizada

1. Criar branch exclusivamente da `main` remota e publicar o manifesto atômico.
2. Abrir PR e exigir Controle de versão, Qualidade e Vercel Preview verdes.
3. Aplicar migrations `20260826213000`, `20260826213050` e `20260826213100`, nesta ordem, via MCP Supabase.
4. Publicar `push-notification-dispatcher` e `whatsapp-automation-agent`, preservando `verify_jwt=false` e autenticação interna.
5. Publicar o roteador compartilhado nas quatro consumidoras: `payment-checkout`, `checkout-api`, `asaas-api` e `dependencia-banese-checkout`, preservando o `verify_jwt` atual de cada função.
6. Executar smokes sem cobrança, destinatário ou dado artificial; então mesclar, aguardar Vercel Production e validar rotas/bundles.

### Manifesto explícito — 53 arquivos

#### Operação e versão

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-08-26-bolepix-e-notificacoes-financeiras-seguras.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-08-05-parte-1.md`
- `internal/versioning/system-version.json`

#### Portais do aluno

- `modules/aluno/cursos/hooks/useCourseCheckout.ts`
- `modules/aluno/cursos/eadCheckoutOptions.test.ts`
- `modules/aluno/financeiro/AlunoEadPaymentChoiceModal.tsx`
- `modules/aluno/financeiro/FinanceiroPage.tsx`
- `modules/aluno/financeiro/alunoEadPaymentOptions.ts`
- `modules/aluno/financeiro/alunoEadPaymentOptions.test.ts`
- `modules/aluno/financeiro/useAlunoEadPayment.ts`
- `modules/ead/components/EadPaymentModal.tsx`
- `modules/asaas/asaas.service.ts`
- `modules/gestor/comunicacao/automacoes-multicanal/multichannel-automation.test.ts`
- `scripts/test-banese-payment-ui.mjs`

#### Checkout e roteamento

- `supabase/functions/gateways/router-adapter-runtime.ts`
- `supabase/functions/gateways/router.test.ts`
- `supabase/functions/gateways/checkout-api/provider-checkout.ts`
- `supabase/functions/gateways/checkout-api/provider-reuse.ts`
- `supabase/functions/gateways/checkout-api/provider-reuse.test.ts`
- `supabase/functions/gateways/checkout/ead-context.ts`
- `supabase/functions/gateways/checkout/ead-context.test.ts`
- `supabase/functions/gateways/checkout/ead-enrollment.ts`
- `supabase/functions/gateways/checkout/ead-finance.ts`
- `supabase/functions/gateways/checkout/ead-finance.test.ts`
- `supabase/functions/gateways/checkout/gateway-creation-fence.ts`
- `supabase/functions/gateways/checkout/gateway-creation-fence.test.ts`
- `supabase/functions/gateways/checkout/index.ts`
- `supabase/functions/gateways/checkout/payment-options.ts`
- `supabase/functions/gateways/checkout/payment-options.test.ts`
- `supabase/functions/gateways/checkout/types.ts`
- `supabase/functions/gateways/checkout/providers/gateway-charge-input.ts`
- `supabase/functions/gateways/checkout/providers/gateway-receivable.ts`
- `supabase/functions/gateways/checkout/providers/gateway-receivable.test.ts`
- `supabase/functions/gateways/checkout/providers/gateway-reuse.ts`
- `supabase/functions/gateways/checkout/providers/gateway-reuse.test.ts`
- `supabase/functions/gateways/checkout/providers/gateway-view.ts`
- `supabase/functions/gateways/checkout/providers/gateway-view.test.ts`
- `supabase/functions/gateways/checkout/providers/gateway.ts`

#### Notificações e banco

- `supabase/functions/push-notification-dispatcher/firebase.ts`
- `supabase/functions/push-notification-dispatcher/index.ts`
- `supabase/functions/push-notification-dispatcher/index.test.ts`
- `supabase/functions/push-notification-dispatcher/push-assets.ts`
- `supabase/functions/push-notification-dispatcher/types.ts`
- `supabase/functions/whatsapp-automation-agent/index.ts`
- `supabase/migrations/20260826213000_harden_push_financial_notification_eligibility.sql`
- `supabase/migrations/20260826213050_harden_push_financial_notification_runtime.sql`
- `supabase/migrations/20260826213100_harden_whatsapp_financial_notification_claim.sql`
- `supabase/tests/financial_notification_eligibility.contract.test.ts`
- `supabase/tests/push_rich_backend_hardening.contract.test.ts`

Todo arquivo não listado, inclusive caches, build, temporários, lockfiles e alterações paralelas, permanece fora da publicação. Migrations aplicadas se tornam imutáveis.

Histórico: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
