# Correção da baixa manual após revisão — 2026-09-16

## Objetivo e autorização

Corrigir recebimento bloqueado após tentativa de corrigir a conta de destino, preservando a auditoria e permitindo nova baixa na conta correta. Usuário solicitou três agentes e atualização do GitHub. Depois determinou validação interna, sem navegador. Produção e saneamento do registro real aguardam confirmação do procedimento revisado.

## Diagnóstico comprovado

- Snapshot da Edge inclui `manual_settlement_context`; a RPC compara o JSON inteiro com snapshot financeiro sem essa chave.
- Consulta interna confirmou igualdade integral dos campos financeiros quando excluído somente esse metadado.
- Logs mostraram 11.840 conflitos `40001` em aproximadamente 118 segundos, até expiração da posse da operação. Conflito de negócio passa a `PT409`, sem retentativa de serialização.
- Objeto de erro PostgREST era convertido com `String(error)`, perdendo a mensagem e exibindo `[object Object]`.
- Registro investigado está aberto, sem recebimento consolidado, com uma transação canônica cancelada e uma tentativa retida na conta incorreta. A narrativa de estorno anterior não foi comprovada nesse histórico; não se inventa baixa ou estorno.
- Estado residual da mutation também era mostrado ao abrir outra operação; reset ocorre somente ao abrir nova baixa/estorno.

## Correção e aceite

- Contextos conhecidos e legado sem contexto aceitos; toda divergência financeira restante continua bloqueada.
- Guards de autenticação, polo, conta, título, lease, pagamentos remotos, unicidade e idempotência preservados.
- `CANCELED_AFTER_REVIEW` encerra tentativa não liquidada mediante procedimento administrativo auditado, preservando conta, valores, fingerprint e chave originais.
- Roteiro exige snapshot idêntico, ausência de pagamento local e comprovação do cancelamento canônico. Não gera recebimento nem chama o banco.
- Nova baixa usa nova chave e conta explicitamente escolhida; prévia bancária permanece obrigatória.
- Critério específico preparado: principal R$ 279,90, desconto R$ 19,90, recebido R$ 260,00, Pix, data 12/09/2026, conta Banese do mesmo polo.

## Manifesto explícito

- `.github/workflows/quality-gates.yml`
- `supabase/tests/manual_settlement_review.transaction.sql`
- `supabase/migrations/20260916120000_fix_manual_settlement_audited_snapshot.sql`
- `supabase/migrations/20260916120100_manual_settlement_review_cancellation.sql`
- `supabase/functions/asaas/api/manual-settlement.service.ts`
- `supabase/functions/asaas/api/manual-settlement.types.ts`
- `supabase/functions/asaas/api/manual-settlement-errors.ts`
- `supabase/functions/asaas/api/manual-settlement-errors.test.ts`
- `supabase/functions/asaas/api/manual-settlement-snapshot-migration.test.ts`
- `supabase/functions/asaas/api/manual-settlement-review-cancellation.test.ts`
- `supabase/operations/cancel-manual-settlement-after-review.sql`
- `supabase/tests/manual_settlement_snapshot.transaction.sql`
- `modules/gestor/financeiro/receber/components/modalidade-receber/useModalidadeReceberOperations.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-16-baixa-manual-revisao.md`

Total: 18 arquivos.

## Validação

- Reprodução interna do snapshot e consulta aos logs reais, sem alteração financeira.
- TypeScript e build passaram; aviso preexistente de chunks grandes preservado.
- Harness interno executa hook e MutationObserver reais: reproduz erro herdado antes e confirma reset somente em nova operação depois.
- 43 testes Deno passaram, com tipagem; regressões acrescentadas ao CI.
- 21 cenários SQL da RPC passaram em clone temporário da função com rollback integral; conferência posterior comprovou estado original e função pública intactos.
- 6 cenários adicionais em tabelas temporárias confirmaram encerramento auditado, preservação integral do payload, rejeição de pagamento/identidade divergentes e nova tentativa na conta correta.
- Revisão independente aprovada; teto de 500 linhas e ESLint focado passaram.
- Smoke visual não executado por determinação do usuário; nenhuma baixa real usada como teste.

## Entrega

Base GitHub `0945ca1bea60253915bdfe49d4fa1fa426f1b801`. Publicação exclusivamente via MCP, em commit atômico com manifesto explícito. Edge remota v96 preservada como base de comparação para deploy seletivo posterior. Migrations anteriores imutáveis. Nenhuma credencial, identificação pessoal ou identidade bancária real incluída neste registro.

## Procedimento pendente de produção

1. Aplicar as duas migrations novas, via MCP, conferindo o ledger antes.
2. Atualizar a Edge `asaas-api` preservando os demais arquivos do bundle v96; trocar somente service/types e acrescentar errors.
3. Confirmar o guard terminal antes de encerrar qualquer tentativa.
4. Executar o roteiro administrativo para o único registro autorizado, com reviewer, fingerprint e updated_at capturados na revisão; manter a parcela aberta e a conta original da tentativa no histórico.
5. Abrir nova baixa com Banese/Pix, nova chave e consulta bancária pelo fluxo canônico. Não reaproveitar a chave da tentativa Caixa.
6. Conferir resultado financeiro e auditoria; nenhum título novo deve ser emitido para corrigir a conta.

Branch de entrega: `fix/baixa-manual-revisao-4-8-65`. Preview e CI remotos acompanham o PR. Migrations, Edge e dados reais não foram alterados nesta preparação. RAG reindexado uma vez no fechamento local; artefatos regeneráveis fora do manifesto.
