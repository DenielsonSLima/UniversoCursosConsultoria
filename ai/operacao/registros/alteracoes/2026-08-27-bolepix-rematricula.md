# Recuperação BolePix e rematrícula Banese

Data de abertura: 2026-08-27  
Atualização de produção: 2026-08-28  
Estado: hotfix concluído em produção e publicado pelo manifesto atômico deste registro

## Objetivo

Restabelecer a emissão e a recuperação segura do Pix oficial dos boletos Banese, corrigir a apresentação da rematrícula e esclarecer os 13 recebíveis emitidos localmente sem prova do POST bancário, sem fabricar, trocar ou reaproveitar identidade de outro título.

## Conclusão da reunião técnica em três frentes

### 1. Contrato bancário e evidência

- O usuário está correto sobre o funcionamento em princípio: a consulta oficial por convênio e Nosso Número pode retornar linha digitável, código de barras e o `QrCode` fixo do próprio boleto.
- A consulta individual dos 13 Nossos Números atribuídos localmente não confirmou os recebíveis atuais. O Banese devolveu títulos de 2018 no valor de R$ 200,00, enquanto o conjunto local é de 2026/27 e contém 12 parcelas de R$ 279,90 e uma rematrícula de R$ 100,00.
- Portanto, os 13 conteúdos bancários retornados não foram associados. Fazer isso colocaria Pix, linha e código de barras de terceiros nos recebíveis atuais.
- Não foi encontrada prova de POST, identificador de pagamento, token, transação, liquidação ou Pix que ligasse as 13 identidades locais aos títulos atuais.
- O atendimento do banco informou três QR Codes gerados no dia, mas a API e os manuais disponíveis não oferecem busca segura por data ou número de documento. É necessária a identificação dos três Nossos Números reais pelo banco.

### 2. Emissão, recuperação e conciliação

- Toda reserva passa por preflight GET. Se o Nosso Número já existir, nenhum POST é feito; em produção, uma resposta 404 só autoriza nova emissão quando uma faixa exclusiva estiver formalmente confirmada.
- O POST novo aceita a resposta mínima oficial e preserva o `QrCode` devolvido pelo Banese.
- O GET de recuperação só persiste o Pix depois de confirmar proveniência, banco 047, Nosso Número, pagador/título, valor, vencimento/fator, código de barras e linha digitável compatíveis.
- A gravação de Pix, snapshot e conciliação é atômica, com locks e CAS. Mudança concorrente ou identidade divergente falha fechada.
- `TipoJuroMora = 3` é válido como juros isentos quando o valor é nulo ou zero; conteúdo positivo continua sendo divergência.
- O worker voltou a executar sob autenticação própria. A versão 49 registrou resposta HTTP 200 e mantém falhas de um título isoladas das demais.

### 3. Rematrícula e interface

- A rematrícula existia e carregava como recebível, mas a apresentação priorizava `parcela_numero = 0` antes de `tipo_lancamento`.
- Tela, relatório e fração agora priorizam `MATRICULA`, `REMATRICULA` e `DEPENDENCIA` antes da numeração mensal.
- A quarentena bancária removeu somente a identidade não comprovada. Foram preservados os 13 recebíveis, incluindo matrícula, turma, tipo, valor, emissão/vencimento e status acadêmico-financeiro.
- A sincronização apresenta retorno ao operador e uma falha de montagem segura do PDF não encerra silenciosamente a aba preparada.

## Correção dos 13 recebíveis

- As 13 identidades locais sem prova bancária foram removidas por comparação exata e colocadas em quarentena.
- Permaneceram intactas 12 parcelas de R$ 279,90 e uma rematrícula de R$ 100,00, com seus vínculos acadêmicos, turmas, vencimentos e status.
- As filas correspondentes foram encerradas com diagnóstico seguro de identidade bancária quarentenada.
- Nenhuma baixa, transação, liquidação, linha digitável, código de barras ou Pix de 2018 foi copiado para esses recebíveis.
- A migration local `20260827172000_register_banese_boletos_adenize_cycle2.sql`, que havia atribuído 12 identidades sem prova do POST, foi excluída do lote, adicionada ao `.gitignore` e nunca será publicada no GitHub.

## Guardas mantidas

1. Nenhum QR Code, payload EMV, linha digitável, código de barras ou Nosso Número é inventado.
2. O GET nunca cria, reemite ou troca boleto; ele só completa o mesmo título depois da validação integral.
3. Uma colisão no preflight impede o POST e qualquer atualização financeira.
4. Produção exige faixa exclusiva confirmada antes de consumir um Nosso Número ainda não encontrado no banco.
5. Proveniência ambígua só é recuperável sob as condições servidoras restritas, identidade completa e valor/fator compatíveis.
6. A rematrícula continua sendo rematrícula; a quarentena bancária não modifica sua natureza acadêmica.
7. Dados pessoais, payloads Pix, tokens e números bancários completos não são registrados em logs ou neste documento.

## Publicação em produção

### Edge Functions

- `asaas-api` v88: `ACTIVE`, `verify_jwt=true`, SHA-256 `b2ca242bbbbe322edebf7d1f22b27340972e63bcda619e4c823c8ca78c2d439a`.
- `banese-reconciliation-worker` v49: `ACTIVE`, autenticação por segredo próprio, SHA-256 `f6124a5f4b3fca1cb32ee18a98c4f512fae227d64b887a6eea70edb0ec9d71fc`.
- Os logs do worker v49 confirmaram execução HTTP 200 depois da publicação.

### Migrations

- `20260827224500_persist_banese_recovered_pix_atomically.sql` → `20260828024316`.
- `20260827224600_persist_banese_reconciliation_atomically.sql` → `20260828024319`.
- `20260827224610_requeue_banese_post_settlement.sql` → `20260828024321`.
- `20260827224620_trust_banese_official_bank_numbers.sql` → `20260828030305`.
- `20260827224630_trust_banese_query_financial_fields.sql` → `20260828031759`.
- `20260827224640_quarantine_unproven_banese_titles_and_gate_sequence.sql` → `20260828050448`.
- `20260827224641_quarantine_unproven_banese_titles.sql` → `20260828050650`.
- `20260827224642_harden_banese_reconciliation_provenance.sql` → `20260828050800`.
- `20260827224643_finalize_banese_recovered_pix_provenance.sql` → `20260828050808`.
- A migration anterior `20260827222743_repair_banese_automatic_profile_floor` permanece aplicada e registrada no ledger, totalizando dez migrations remotas auditadas no ciclo.

## Estado operacional obrigatório

- Emissão Banese: `PAUSED`.
- Reconciliador Banese: `PAUSED`.
- Não emitir, reemitir, reservar nem enviar novo POST enquanto o Banese não confirmar formalmente uma faixa exclusiva de Nosso Número.
- Solicitar ao banco os três Nossos Números que correspondem aos três QR Codes informados no atendimento; consultar cada um e associar somente se a identidade integral dos recebíveis conferir.

## Validação

- 151 testes de adaptador/gateway aprovados.
- 16 testes do worker aprovados.
- 35 testes de `test:banese-ui` aprovados.
- 11 testes adicionais de `modalidade-receber` aprovados, focados na apresentação da rematrícula.
- TypeScript `--noEmit` aprovado.
- Dois `deno check` aprovados: gateway `asaas-api` e worker de reconciliação.
- Revisão independente concluída com parecer `APPROVE`, sem achados P0, P1 ou P2 restantes.
- Build Vite de produção e teto de 500 linhas aprovados antes da publicação do manifesto no GitHub.

## Manifesto explícito

Total: 64 arquivos

- `.gitignore`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/limite-linhas.json`
- `ai/operacao/qualidade/migrations-aplicadas.json`
- `ai/operacao/registros/alteracoes/2026-08-27-bolepix-rematricula.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-08-05-parte-1.md`
- `internal/versioning/system-version.json`
- `modules/gestor/financeiro/receber/banese/gestor-banese-payment.service.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableItemPresentation.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/modalidade-receber.utils.test.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/modalidade-receber.utils.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/useModalidadeReceberOperations.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/useModalidadeReceberReport.tsx`
- `supabase/functions/banese-reconciliation-worker/error-classification.test.ts`
- `supabase/functions/banese-reconciliation-worker/error-classification.ts`
- `supabase/functions/banese-reconciliation-worker/index.ts`
- `supabase/functions/banese-reconciliation-worker/query-token-retry.test.ts`
- `supabase/functions/banese-reconciliation-worker/query-token-retry.ts`
- `supabase/functions/banese/core/adapter-cancellation.test.ts`
- `supabase/functions/banese/core/adapter-create-pix.test.ts`
- `supabase/functions/banese/core/adapter-payload.test.ts`
- `supabase/functions/banese/core/adapter-reservation.test.ts`
- `supabase/functions/banese/core/adapter-response.test.ts`
- `supabase/functions/banese/core/adapter-test-fixtures.ts`
- `supabase/functions/banese/core/adapter.test.ts` (removido)
- `supabase/functions/banese/core/adapter/auth.ts`
- `supabase/functions/banese/core/adapter/boleto-payment-query.ts`
- `supabase/functions/banese/core/adapter/boleto-pix-response.ts`
- `supabase/functions/banese/core/adapter/boleto-query-pix.test.ts`
- `supabase/functions/banese/core/adapter/boleto-query.ts`
- `supabase/functions/banese/core/adapter/boleto-response.ts`
- `supabase/functions/banese/core/adapter/boleto.ts`
- `supabase/functions/banese/core/adapter/utils.ts`
- `supabase/functions/banese/internal/financial-terms-response.test.ts`
- `supabase/functions/banese/internal/financial-terms-response.ts`
- `supabase/functions/gateways/api/banese-bank-numbers.test.ts`
- `supabase/functions/gateways/api/banese-intent-reconciliation.test.ts`
- `supabase/functions/gateways/api/banese-pix-persistence.ts`
- `supabase/functions/gateways/api/banese-pix-reconciliation.test.ts`
- `supabase/functions/gateways/api/banese-pix-recovery.ts`
- `supabase/functions/gateways/api/banese-post-settlement-projection.ts`
- `supabase/functions/gateways/api/banese-post-settlement.test.ts`
- `supabase/functions/gateways/api/banese-post-settlement.ts`
- `supabase/functions/gateways/api/banese-provenance.test.ts`
- `supabase/functions/gateways/api/banese-reconciliation-contract.ts`
- `supabase/functions/gateways/api/banese-reconciliation-persistence.test.ts`
- `supabase/functions/gateways/api/banese-reconciliation-persistence.ts`
- `supabase/functions/gateways/api/banese-settlement.test.ts`
- `supabase/functions/gateways/api/banese-test-harness.ts`
- `supabase/functions/gateways/api/banese-transaction-routing.test.ts`
- `supabase/functions/gateways/api/banese.test.ts` (removido)
- `supabase/functions/gateways/api/banese.ts`
- `supabase/migrations/20260827222743_repair_banese_automatic_profile_floor.sql`
- `supabase/migrations/20260827224500_persist_banese_recovered_pix_atomically.sql`
- `supabase/migrations/20260827224600_persist_banese_reconciliation_atomically.sql`
- `supabase/migrations/20260827224610_requeue_banese_post_settlement.sql`
- `supabase/migrations/20260827224620_trust_banese_official_bank_numbers.sql`
- `supabase/migrations/20260827224630_trust_banese_query_financial_fields.sql`
- `supabase/migrations/20260827224640_quarantine_unproven_banese_titles_and_gate_sequence.sql`
- `supabase/migrations/20260827224641_quarantine_unproven_banese_titles.sql`
- `supabase/migrations/20260827224642_harden_banese_reconciliation_provenance.sql`
- `supabase/migrations/20260827224643_finalize_banese_recovered_pix_provenance.sql`

## Exclusões explícitas

- `supabase/migrations/20260827172000_register_banese_boletos_adenize_cycle2.sql` está ignorada e nunca será publicada.
- As migrations locais `20260827163000`, `20260827170000` e `20260827171000` não pertencem a este lote e permanecem fora do manifesto.
- Os diretórios `FINANCEIRO TURMA 42 IMPORTACAO/` e `turma 42/` não pertencem ao hotfix e não serão publicados.
- O erro CNAB por EDI7 e qualquer decisão de recriação, vencimento, valor ou regra comercial exigem lote financeiro separado.
- O smoke autenticado final dos PDFs permanece pendente por indisponibilidade de sessão controlável; nenhum dado financeiro foi alterado apenas para produzir evidência visual.
