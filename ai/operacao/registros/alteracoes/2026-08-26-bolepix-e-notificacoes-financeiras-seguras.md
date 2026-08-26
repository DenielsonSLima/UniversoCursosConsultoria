# BolePix e notificações financeiras seguras — 4.8.6

Data: 2026-08-26  
Estado: `PRONTO_PARA_PREVIEW_E_ROLLOUT_AUTORIZADO`

## Objetivo

Corrigir três contratos financeiros relacionados: impedir aviso de cobrança para título suspenso pelo trancamento, reapresentar somente o título EAD ainda cobrável, apresentar apenas opções roteáveis e manter PIX Banese direto bloqueado sem afetar o BolePix.

## Decisões da reunião técnica

1. O trancamento continua reversível: títulos posteriores à data efetiva ficam `SUSPENSO`; dívidas anteriores ou do mesmo dia permanecem cobradas se não pagas.
2. Elegibilidade de aviso é um predicado de backend sobre o recebível, não sobre o status geral da matrícula.
3. Pix e boleto do Banese são apresentações do mesmo título BolePix registrado como `BOLETO`.
4. O backend devolve opções públicas efetivas; o frontend apenas apresenta a escolha e envia o contrato recebido.
5. A guarda final rejeita `banese_card + PIX` em qualquer ambiente. QR e copia-e-cola dentro de uma resposta `BOLETO` continuam válidos.
6. WhatsApp permanece aguardando a liberação da Meta; este lote não ativa automações nem altera credenciais ou destinatário de teste.
7. O commit da revalidação é o ponto de linearização do envio; no checkout, o re-read final sem `await` posterior é o ponto de linearização da reapresentação.
8. Pix inline exige payload ou imagem oficial. Ausência de dados Pix rebaixa a resposta para `BOLETO`, preservando o PDF autenticado do mesmo título.

## Findings da revisão de três agentes

1. `P1` — a revalidação Push invertia locks em relação ao trigger do recebível. A migration foi separada e passou a usar `contas_receber → job → delivery`, com teste de contrato e índice parcial para jobs financeiros abertos.
2. `P1` — os checkouts novo e legado podiam devolver URL a partir de snapshot anterior aos reparos assíncronos. Ambos agora revalidam status, pagamento, identidade, termos e referência remota antes, entre e depois dos reparos.
3. `P1` — o backend podia ecoar `presentation=PIX` sem QR/payload Banese e a UI abria um painel Pix vazio. Backend, Curso EAD e Financeiro do Aluno agora fazem downgrade para o boleto oficial.
4. `P2` — o checkout legado tinha 544 linhas. O reuso foi extraído para `provider-reuse.ts`, deixando o arquivo principal com 427 linhas.
5. `P2` — o modal confirmava cópia do Pix mesmo quando a Clipboard API falhava. O sucesso só aparece após `writeText`; falha recebe aviso explícito.

## Manifesto explícito

Total: 58 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-08-26-bolepix-e-notificacoes-financeiras-seguras.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-07-14-a-2026-07-26.md`
- `internal/versioning/changelog/2026-07-26-a-2026-07-31.md`
- `internal/versioning/changelog/2026-07-31-a-2026-08-02.md`
- `internal/versioning/changelog/2026-08-02-parte-2.md`
- `internal/versioning/changelog/2026-08-03.md`
- `internal/versioning/changelog/2026-08-04.md`
- `internal/versioning/changelog/2026-08-05-parte-1.md`
- `internal/versioning/system-version.json`
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

Todos os caminhos foram comparados por blob contra a `main` remota `6bbadbeb`; cada arquivo está diferente da base ou é novo. Arquivos não listados permanecem preservados.

## Evidências antes do rollout

- Reunião cruzada concluída pelas três frentes: trancamento/notificações, EAD/BolePix e segurança/release.
- Veredito inicial `NO-GO`; todos os P1 identificados foram corrigidos localmente antes de operação remota.
- Produção permanece sem contas a receber e sem trancamentos atuais; o risco de aviso é determinístico, mas não há incidente ativo observado.
- Suíte financeira/BolePix/notificações `80/80`; TypeScript global e ESLint focado aprovados.
- `deno check` aprovado para `payment-checkout`, `checkout-api`, `asaas-api`, `dependencia-banese-checkout`, `push-notification-dispatcher` e `whatsapp-automation-agent`.
- Arquivos manuais do manifesto com até 500 linhas; migrations futuras divididas em `213000`, `213050` e `213100` antes da aplicação.
- Guarda central validada em sandbox/produção, preservando o payload Pix do método `BOLETO`.
- Nenhuma migration, Edge Function, configuração ou dado foi alterado remotamente.
- Projeto Supabase confirmado: `kfekgwyqozhicpfuunpo`; ledger remoto acompanha a `main` até `20260825204543` e ainda não contém as três migrations do lote.
- Produção explicitamente autorizada pelo titular após revisão e gates.

## Pendências

- Concluir lint global, controle de versão, operação, build e CI/Preview.
- Revalidar o preflight Supabase, aplicar as três migrations e publicar seis Edge Functions/bundles pela ordem registrada no lote.
- Fazer smoke fail-closed sem cobrança ou destinatário artificial, mesclar a PR, aguardar Vercel Production e registrar evidências imutáveis no fechamento operacional.
