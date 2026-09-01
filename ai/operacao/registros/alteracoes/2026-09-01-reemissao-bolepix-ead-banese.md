# BolePix EAD Banese — captura persistente e substituição segura

Data: 2026-09-01  
Estado: backend produtivo concluído; PR final e smoke autenticado em fechamento

## Pedido e diagnóstico

O usuário autorizou corrigir o contrato BolePix, publicar o projeto e tratar
exclusivamente os títulos EAD `000097299` e `000097302`. Eles já estavam
registrados no Banese, mas não possuíam payload/imagem Pix local. Não é
permitido copiar QR de outro título nem alterar Técnico.

As seis capturas do teste autenticado formam uma sequência coerente:

1. um curso com título ativo mostra `Continuar pagamento`;
2. ao tentar emitir novamente esse curso, a guarda bloqueia duplicidade;
3. outro curso EAD permite selecionar Pix;
4. a emissão nova mostra QR e copia-e-cola oficiais;
5. o PDF abre com banco 047, o mesmo Nosso Número, valor e vencimento da tela e
   um QR visível.

Isso demonstra que a emissão EAD atual consegue produzir BolePix completo; o
incidente restante está nos dois títulos anteriores cujo retorno Pix não foi
persistido.

## Contrato implementado

- A resposta oficial do POST é validada e persistida atomicamente, incluindo
  linha, código de barras, Nosso Número, payload e imagem Pix.
- Normalização de CPF é usada somente na comparação; nunca descarta a resposta
  bancária inteira.
- A recuperação consulta
  `GET /convenios/{convenio}/boletos/{nossoNumero}` e
  `GET /convenios/{convenio}/boletos/{nossoNumero}/pagamentos/efetivados`.
- O campo `QrCode` é procurado no corpo e em envelopes aninhados; linha
  digitável e código de barras nunca são tratados como Pix.
- A primeira prova Pix válida é gravada com CAS sem apagar um par anterior.
- Ausência temporária de Pix mantém o boleto pagável e usa cooldown; não envia
  um novo POST.

## Substituição excepcional dos dois EAD

O workflow dedicado exige modalidade EAD, identidade bancária completa, uma
única transação, ausência de pagamento e situação pendente. Ele:

1. faz GET do título e pagamentos;
2. recupera o Pix e encerra sem baixa se o banco finalmente o expuser;
3. registra intenção durável antes de qualquer PUT;
4. executa a baixa oficial apenas quando o título continuar pendente e sem Pix;
5. confirma situação 5 e ausência de pagamentos;
6. arquiva a identidade antiga e reserva um novo Nosso Número;
7. usa o checkout canônico para um único POST;
8. em resposta ambígua, retoma somente por GET;
9. conclui apenas com identidade, Pix ou pagamento integralmente comprovados.

Locks transacionais, leases e CAS impedem consultas/baixas concorrentes. Uma
falha cercada permanece em revisão e não libera outra rotina para sobrescrever
o recebível.

## Escopo preservado

- Nenhuma cobrança Técnica entra na allowlist ou na elegibilidade SQL.
- CNAB, históricos importados, PDFs compartilhados e o worker genérico de
  cancelamento não recebem regra específica dos dois títulos.
- O PDF continua consumindo o snapshot bancário persistido; não fabrica QR.
- Logs e auditoria guardam somente códigos/fingerprints, nunca Pix, CPF,
  resposta bruta, linha digitável ou código de barras.

## Validação antes da operação remota

- 8/8 `deno check` aprovados nos runtimes afetados.
- 152/152 testes integrados Banese/EAD/Técnico aprovados.
- `npx tsc --noEmit` e build Vite de produção aprovados.
- Controle de versão 4.8.20 aprovado.
- Manifesto explícito auditado, com todos os arquivos manuais dentro do teto de
  500 linhas e migrations aplicadas registradas por hash.
- Baseline produtivo: os dois alvos pendentes, sem Pix e sem pagamento; uma
  transação local cada.
- Checksum Técnico capturado antes do rollout para comparação posterior.

## Manifesto explícito

Total: 72 arquivos — 30 de implementação, 22 testes, 12 migrations e 8
documentos/versionamento. Mudanças paralelas de recuperação T42, CNAB e PDF
são excluídas.

- `eslint.config.js`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/migrations-aplicadas.json`
- `ai/operacao/registros/COMMITS_E_DEPLOYS.md`
- `ai/operacao/registros/alteracoes/2026-09-01-reemissao-bolepix-ead-banese.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-08-11-a-2026-08-20.md`
- `internal/versioning/system-version.json`
- `supabase/functions/banese-reconciliation-worker/ead-ambiguous-recovery.test.ts`
- `supabase/functions/banese-reconciliation-worker/ead-ambiguous-recovery.ts`
- `supabase/functions/banese-reconciliation-worker/ead-title-replacement-contract.test.ts`
- `supabase/functions/banese-reconciliation-worker/ead-title-replacement-state.test.ts`
- `supabase/functions/banese-reconciliation-worker/ead-title-replacement-state.ts`
- `supabase/functions/banese-reconciliation-worker/ead-title-replacement.ts`
- `supabase/functions/banese-reconciliation-worker/index.ts`
- `supabase/functions/banese-reconciliation-worker/response.ts`
- `supabase/functions/banese-student-payment/index.ts`
- `supabase/functions/banese-student-payment/payment-dto.test.ts`
- `supabase/functions/banese-student-payment/types.ts`
- `supabase/functions/banese/core/adapter-boleto-collision.test.ts`
- `supabase/functions/banese/core/adapter-incident-recovery.test.ts`
- `supabase/functions/banese/core/adapter-payload.test.ts`
- `supabase/functions/banese/core/adapter-pending-bolepix.test.ts`
- `supabase/functions/banese/core/adapter-post-fence.test.ts`
- `supabase/functions/banese/core/adapter-reservation.test.ts`
- `supabase/functions/banese/core/adapter-response.test.ts`
- `supabase/functions/banese/core/adapter.ts`
- `supabase/functions/banese/core/adapter/auth.ts`
- `supabase/functions/banese/core/adapter/boleto-cancellation.test.ts`
- `supabase/functions/banese/core/adapter/boleto-cancellation.ts`
- `supabase/functions/banese/core/adapter/boleto-collision.ts`
- `supabase/functions/banese/core/adapter/boleto-incident-recovery.ts`
- `supabase/functions/banese/core/adapter/boleto-payload.ts`
- `supabase/functions/banese/core/adapter/boleto-pix-recovery-eligibility.test.ts`
- `supabase/functions/banese/core/adapter/boleto-pix-recovery-eligibility.ts`
- `supabase/functions/banese/core/adapter/boleto-pix-response.ts`
- `supabase/functions/banese/core/adapter/boleto-query-pix.test.ts`
- `supabase/functions/banese/core/adapter/boleto-response.ts`
- `supabase/functions/banese/core/adapter/boleto.ts`
- `supabase/functions/banese/core/adapter/types.ts`
- `supabase/functions/gateways/api/banese-intent-reconciliation.test.ts`
- `supabase/functions/gateways/api/banese-pix-only-migration-contract.test.ts`
- `supabase/functions/gateways/api/banese-pix-only-recovery.test.ts`
- `supabase/functions/gateways/api/banese-pix-only-recovery.ts`
- `supabase/functions/gateways/api/banese-pix-persistence-cas.test.ts`
- `supabase/functions/gateways/api/banese-pix-persistence.ts`
- `supabase/functions/gateways/api/banese-pix-recovery.ts`
- `supabase/functions/gateways/api/banese.ts`
- `supabase/functions/gateways/boleto/banese.ts`
- `supabase/functions/gateways/checkout/providers/ead-banese-checkout-persistence.test.ts`
- `supabase/functions/gateways/checkout/providers/ead-banese-checkout-persistence.ts`
- `supabase/functions/gateways/checkout/providers/gateway-charge-input.test.ts`
- `supabase/functions/gateways/checkout/providers/gateway-charge-input.ts`
- `supabase/functions/gateways/checkout/providers/gateway-reuse.test.ts`
- `supabase/functions/gateways/checkout/providers/gateway-reuse.ts`
- `supabase/functions/gateways/checkout/providers/gateway.ts`
- `supabase/functions/gateways/ead-banese-pix-recovery.test.ts`
- `supabase/functions/gateways/ead-banese-pix-recovery.ts`
- `supabase/functions/gateways/router-adapter-runtime.ts`
- `supabase/migrations/20260831174500_claim_banese_api_submission_before_post.sql`
- `supabase/migrations/20260831182500_reconcile_ead_ambiguous_banese_once.sql`
- `supabase/migrations/20260831210000_harden_banese_pix_only_persistence_cas.sql`
- `supabase/migrations/20260831231500_create_ead_banese_title_replacement_schema.sql`
- `supabase/migrations/20260831231600_fence_ead_banese_title_replacement.sql`
- `supabase/migrations/20260831231700_claim_ead_banese_title_replacement.sql`
- `supabase/migrations/20260831231800_fence_ead_banese_remote_cancel.sql`
- `supabase/migrations/20260901000400_guard_and_persist_ead_banese_replacement_pix.sql`
- `supabase/migrations/20260901000500_prepare_ead_banese_title_reissue.sql`
- `supabase/migrations/20260901000550_validate_ead_banese_reissued_paid.sql`
- `supabase/migrations/20260901000600_finish_ead_banese_title_replacement.sql`
- `supabase/migrations/20260901000700_harden_banese_ead_replacement_advisors.sql`

## Evidência de produção

- `000097299`: a conciliação oficial registrou pagamento integral via API, com
  uma evidência de pagamento e estados canônicos `PAGO`/`PAID`. O fluxo de
  substituição falhou fechado antes do enqueue; nenhuma baixa ou reemissão foi
  permitida e o título permaneceu sem Pix, como exige a regra para pago.
- `000097302`: permaneceu pendente, sem pagamento e sem Pix. O dry-run
  transacional percorreu enqueue, claim, fence, intenção, arquivo e preparação
  e terminou em `ROLLBACK`. Em seguida, o worker consultou título/pagamentos,
  confirmou a ausência de Pix e pagamento, baixou o título com situação 5 e o
  arquivou com fingerprint sanitizado.
- A única reemissão criou o Nosso Número `000097329`. O POST oficial trouxe o
  campo `QrCode` no corpo de criação; o diagnóstico persistido registra o
  caminho normalizado `qrcode:string`, origem `creation`, payload válido e
  imagem `generated_from_official_emv`, sem armazenar resposta bruta em logs.
- A prova pós-operação confirmou banco 047, convênio/agência, valor, vencimento,
  linha/código, beneficiário, vínculo EAD, uma transação e uma inscrição. O EMV
  passou estrutura, moeda BRL, país BR, GUI Pix, valor e CRC; a imagem possui
  assinatura PNG e é idêntica no recebível e na transação.
- Migrations produtivas novas: `20260901041425`, `20260901041427`,
  `20260901041431`, `20260901041434`, `20260901041437`, `20260901041441`,
  `20260901041443`, `20260901041445` e `20260901041838`.
- Edge Functions ativas: `payment-checkout` v27, `checkout-api` v21,
  `payment-gateway-api` v29, `asaas-api` v93,
  `dependencia-banese-checkout` v13, `banese-student-payment` v12,
  `banese-reconciliation-worker` v98 e `banese-cancellation-worker` v5.
- Segurança retornou ao baseline de 489 avisos, sem novo item. Performance
  mantém dois informativos esperados de índices recém-criados ainda sem uso.
- Técnico permaneceu com 691 recebíveis e 325 transações; zero linhas foram
  atualizadas desde o início do rollout.
- PR #106 teve lint, TypeScript, contratos, testes, build e Preview Vercel
  aprovados antes da operação. O smoke visual do título exato ficou pendente
  porque a sessão aberta no Safari é de Gestor e redireciona a rota do Aluno;
  nenhum segredo de sessão foi extraído. A integridade do PDF/QR foi comprovada
  pelo contrato persistido e pelo mesmo compositor EAD já validado nas imagens
  fornecidas pelo usuário.
