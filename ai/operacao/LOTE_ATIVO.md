# Lote ativo

Estado: `PUBLICADO_PRODUCAO_4_8_7`

## Lote: 2026-08-26-bolepix-e-notificacoes-financeiras-seguras

- Pedido: revisar todas as alterações com três agentes e publicar GitHub, Supabase, Edge Functions e sistema web em Produção.
- Registro: `ai/operacao/registros/alteracoes/2026-08-26-bolepix-e-notificacoes-financeiras-seguras.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-26-bolepix-e-notificacoes-financeiras-seguras.md`.
- Autorização: Produção solicitada explicitamente pelo titular em 2026-08-26, condicionada à revisão e aos gates.
- Base remota: `main` `6bbadbeb4eeee8758e33467dd0c8600a46f84534` (`4.8.5`). O HEAD Git local histórico não é base de publicação.
- Versão funcional publicada: `4.8.6`; fechamento operacional: `4.8.7`.

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
- Lint global, versão, operação, teto de linhas, TypeScript e build local foram aprovados; CI, Vercel Preview, preflight Supabase e smokes fail-closed também concluíram.

### Ordem remota concluída

1. Branch criada exclusivamente da `main` remota e manifesto atômico publicado. `CONCLUIDO`.
2. PR, Controle de versão, Qualidade e Vercel Preview aprovados. `CONCLUIDO_PR_97`.
3. Migrations `20260826213000`, `20260826213050` e `20260826213100` aplicadas em ordem via MCP Supabase. `CONCLUIDO_3_DE_3`.
4. `push-notification-dispatcher` e `whatsapp-automation-agent` publicados com `verify_jwt=false` e autenticação interna preservada. `CONCLUIDO`.
5. Roteador compartilhado publicado nas quatro consumidoras, preservando o `verify_jwt` de cada função. `CONCLUIDO_4_DE_4`.
6. Smokes sem cobrança, destinatário ou dado artificial, merge e Vercel Production concluídos. `CONCLUIDO_PRODUCAO_4_8_6`.

### Evidências de publicação

- A PR `#97` partiu da `main` `6bbadbeb4eeee8758e33467dd0c8600a46f84534`; o head `1eeb9f8f03c332cea104185d1d1ee2e5a05a5741` alterou exatamente os 53 arquivos declarados, sem extras ou ausências.
- Workflows `32975291726` e `32975291777` e Vercel Preview `Jo4BSYaxaYEJvh2fpN17KSWSn2as` aprovados; merge squash `f3e5ffb3a69a575c227bf74af66b3ffa970a94bc`.
- Migrations remotas `20260826134030`, `20260826134110` e `20260826134202`; SHAs locais `23116678`, `d0738ad2` e `24ddab35` preservados no registro.
- Edge Functions ativas: `payment-checkout` v21, `checkout-api` v16, `asaas-api` v81, `dependencia-banese-checkout` v8, `push-notification-dispatcher` v15 e `whatsapp-automation-agent` v12. Fontes runtime remotas idênticas ao workspace e `verify_jwt` preservado.
- Vercel Production `HhtcN2UxPbybTwkNKQRuyQu5NmwQ` pronta; `/`, `/login` e `/sistema/login` responderam `200`; `main-aZE9Pt1f.js` confirmou `4.8.6` e os chunks públicos confirmaram o fallback BolePix.
- Push v15 respondeu `200` pelo cron restaurado. WhatsApp v12 recusou com segurança o modo de teste incompleto, sem destinatário efetivo nem mensagem enviada.
- Safari carregou início e login. O smoke autenticado parou no Turnstile da Cloudflare, pois CAPTCHA exige intervenção humana.
- Nenhum usuário, recebível, cobrança, matrícula ou mensagem artificial foi criado; as filas permaneceram vazias.

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

### Manifesto do fechamento operacional — 7 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/ALTERACOES.md`
- `ai/operacao/registros/alteracoes/2026-08-26-bolepix-e-notificacoes-financeiras-seguras.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-08-05-parte-1.md`
- `internal/versioning/system-version.json`

Histórico: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
