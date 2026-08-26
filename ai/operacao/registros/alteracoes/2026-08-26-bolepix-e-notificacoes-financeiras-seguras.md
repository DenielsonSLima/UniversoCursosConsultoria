# BolePix e notificações financeiras seguras — 4.8.6

Data: 2026-08-26  
Estado: `PUBLICADO_PRODUCAO_4_8_7`

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

Total: 53 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-08-26-bolepix-e-notificacoes-financeiras-seguras.md`
- `internal/versioning/CHANGELOG.md`
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
- Lint global, controle de versão, contrato operacional, teto incremental, TypeScript e build Vite de produção aprovados localmente.
- Arquivos manuais do manifesto com até 500 linhas; migrations futuras divididas em `213000`, `213050` e `213100` antes da aplicação.
- Guarda central validada em sandbox/produção, preservando o payload Pix do método `BOLETO`.
- Nenhuma migration, Edge Function, configuração ou dado foi alterado remotamente.
- Projeto Supabase confirmado: `kfekgwyqozhicpfuunpo`; ledger remoto acompanha a `main` até `20260825204543` e ainda não contém as três migrations do lote.
- Produção explicitamente autorizada pelo titular após revisão e gates.

## Evidências de publicação

- Branch baseada em `6bbadbeb4eeee8758e33467dd0c8600a46f84534`; PR `#97`, head `1eeb9f8f03c332cea104185d1d1ee2e5a05a5741`, 53/53 arquivos do manifesto, zero extras e zero ausentes.
- Controle de versão `32975291726`, Qualidade `32975291777` e Vercel Preview `Jo4BSYaxaYEJvh2fpN17KSWSn2as` aprovados antes da operação de Produção.
- Migrations aplicadas em ordem: `20260826134030` (`231166783b18fb743b64834139b81a316cfdaa68c3f32a58269ae0561f0df148`), `20260826134110` (`d0738ad21e7c1ffd246d8f7003b4bce0adfd7f9d5a84afa5664d37b976ebbaeb`) e `20260826134202` (`24ddab3550b624fdfdb0301884e9a24b4e0f019b85ef52803d8ac5c00d5dece1`).
- Objetos, triggers, índice, ACLs e predicados remotos aprovados. Advisors de segurança ficaram idênticos ao baseline; performance ganhou apenas o aviso esperado de índice recém-criado e ainda sem uso, com tabelas vazias.
- Edge Functions ativas e com fontes runtime remotas idênticas ao workspace: `payment-checkout` v21, `checkout-api` v16, `asaas-api` v81, `dependencia-banese-checkout` v8, `push-notification-dispatcher` v15 e `whatsapp-automation-agent` v12.
- Os três schedulers afetados foram pausados durante a janela e restaurados. Push v15 respondeu `200`; WhatsApp v12 respondeu `400` fail-closed porque o modo de teste ainda não possui Aluno configurado, sem envio de mensagem.
- Merge squash `f3e5ffb3a69a575c227bf74af66b3ffa970a94bc`; Vercel Production `HhtcN2UxPbybTwkNKQRuyQu5NmwQ` pronta.
- `/`, `/login` e `/sistema/login` responderam `200`. O bundle `main-aZE9Pt1f.js` contém `4.8.6`; `CursosPage-BB13SnNm.js` contém `PIX_UNAVAILABLE_USE_BOLETO` e `presentationFallbackReason`; `FinanceiroPage-04Y99uvz.js` preserva o boleto oficial.
- Safari carregou o início e o login. O smoke autenticado não avançou pelo Turnstile da Cloudflare, que exige ação humana.
- Nenhum usuário, recebível, cobrança, matrícula, destinatário ou mensagem artificial foi criado.

## Limites pós-publicação

- O WhatsApp permanece em modo de teste sem Aluno configurado; a recusa fail-closed é intencional até definição operacional de uma identidade de teste.
- Fluxos que criariam cobrança real não foram executados; foram cobertos por testes de corrida, contratos, fontes remotas e fallback publicado.
