# Caixa: conferência Proesc

## Pedido e aceite

Investigar os 83 recebíveis em conferência, R$ 23.330,90 nominais, no Caixa de setembro. Resolver estados com evidência real do provedor, mantendo a separação entre obrigação, pagamento e boleto. Não esconder pendências nem inferir inadimplência pela ausência de pagamento.

Aceite: comprovar origem do agregado; incorporar pagamentos confirmados com identidade e valor consistentes; reduzir recusas por concorrência; explicitar a dependência externa quando o provedor não devolve estado suficiente. Nenhuma emissão ou baixa bancária faz parte deste lote.

## Evidência inicial

- Os 83 casos são Proesc, PENDENTE local e snapshot UNKNOWN/REVIEW por NO_PAYMENT_IN_OBSERVED_PERIODS. Não possuem identificador bancário, Nosso Número ou linha digitável para consulta Banese.
- O coletor V1 atual confirma pagamentos, mas nunca produz OPEN. O Caixa exige estado aberto explícito verificado; o aviso não é provocado por erro de soma ou cache de competência.
- Dois diagnósticos V2 invoices de setembro (unidade e todas as unidades) retornaram HTTP200, zero registros e última página1. Isso não comprova quitação, cancelamento nem ausência de dívida.
- Leitura V1 atual: 1.111 linhas. Cruzamento do conjunto: cinco títulos com bloco de pagamento, um com registro cancelado, 77 sem pagamento/status aberto explícito.
- Três execuções recentes do sincronizador falharam em FETCH/HTTP429, com consultas irmãs abortadas. Backoff existente de até30min permaneceu ativo. Diagnóstico sequencial pontual respondeu200; isso não comprova que todo429 decorra de concorrência.

## Manifesto explícito

Total: 19 arquivos, versão preparada 4.8.92.

- `supabase/functions/proesc-api/sync-worker.ts`
- `supabase/functions/proesc-api/sync-worker-rate-limit.test.ts`
- `supabase/functions/proesc-api/sync-worker-period-budget.test.ts`
- `supabase/functions/proesc-api/handler.ts`
- `supabase/functions/proesc-api/cycle-review.ts`
- `supabase/functions/proesc-api/v1-paced-transport.ts`
- `supabase/functions/proesc-api/v1-paced-transport.test.ts`
- `supabase/functions/proesc-api/handler-sync-coordination.test.ts`
- `supabase/functions/proesc-api/cycle-review-abort.test.ts`
- `supabase/functions/proesc-api/diagnostic-invoices.ts`
- `supabase/functions/proesc-api/diagnostic-invoices.test.ts`
- `supabase/migrations/20260926013605_bound_proesc_claim_monthly_periods.sql`
- `supabase/tests/proesc_sync_period_budget.readonly.mjs`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-25-caixa-conferencia-proesc.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Artefatos temporários sanitizados em `tmp/caixa-proesc` não integram a publicação. Não alterar migrations aplicadas nem registros financeiros diretamente.

## Validação e limites

Cinco pagamentos conciliados pelas RPCs existentes após transação de ensaio com ROLLBACK aprovada. Provas de CPF normalizado, matrícula/turma/unidade, vencimento, principal, valor e data de recebimento coincidiram. Principal de R$ 1.399,50 preservado e R$ 1.300,00 recebidos registrados; diferença não foi inventada como desconto. Guardas confirmaram exatamente cinco alterações, outros 78 títulos íntegros, nenhuma nova cobrança ou notificação push. Histórico de reconciliação persistido pelo contrato existente. Fonte e SQL sanitizado temporário: requisição interna130203 e `tmp/caixa-proesc/02-reconciliar-cinco.rollback.sql`.

O claim agora contém um prefixo contínuo de até 60 vínculos e quatro períodos unidade/mês, preservando todos os períodos de cada vínculo. Referência UTC do claim evita divergência na virada do mês; respostas antigas continuam aceitas. GETs mensais passaram de três leitores para um; RPCs financeiras continuam limitadas a três. Prazo de 95s, interrupção sem aplicação de consulta incompleta, lease, cursor e guardas permanecem preservados.

O smoke da Edge v22, em 26/09 às 01:37:31 UTC, reivindicou dois vínculos: fevereiro/2026 respondeu HTTP 200 em 2.195ms e setembro/2026 respondeu HTTP 429 em 526ms. A execução durou 3.506ms, consultou/aplicou zero recebíveis e não avançou o cursor. O backoff permaneceu ativo. Portanto, serializar somente o sincronizador não normalizou as consultas.

O handler também iniciava a revisão de ciclos em paralelo, com quatro leitores V1 próprios. A v23 compartilha uma fila entre as duas rotinas de cada `internal_sync`, com uma resposta em andamento até consumo/cancelamento do corpo. A revisão de ciclos usa um leitor. HTTP diferente de 200, erro de transporte/stream ou cancelamento prematuro sem abort do chamador impedem novas saídas na mesma execução, inclusive nos grupos seguintes. Espera e corpo respeitam o cancelamento do chamador; abort durante espera de outro dono do cache ou normalização impede confirmar a revisão. Não há retry automático nem pausa arbitrária: intervalo padrão zero, preservando os prazos existentes.

Validação final local: 76 testes focados aprovados, incluindo worker, escala, orçamento de períodos, coordenação das duas rotinas, HTTP 429, cancelamento e diagnóstico V2 sanitizado. Três regressões de concorrência, quatro de referência temporal e cinco de coordenação/cancelamento falharam sem suas correções. Vinte cenários SQL somente leitura executaram o corpo puro exato da migration, todos aprovados. Revisão independente aprovou prefixo, progresso mínimo, ACL, UTC, fila e preservação das guardas. Pós-checagens da migration aplicada confirmaram helper privado, permissões e contrato original do runtime preservados.

## Produção e pendências

Usuário autorizou produção. Migration registrada como `20260926013605_bound_proesc_claim_monthly_periods` aplicada e conferida; SQL aplicado permanece imutável. Edge `proesc-api` v23 ACTIVE, com leitura posterior dos 27 arquivos coincidente com o pacote implantado: SHA-256 `9cbb2b99dc37ca498ae9fc684a0c529961240386415b6812bfe6584da93b5afe`. A versão 4.8.92 e o manifesto estão preparados; publicação GitHub ainda pendente.

O backoff termina em 26/09 às 02:07:35 UTC, 23:07:35 de 25/09 no horário local. A execução cron das 02:08 UTC está aguardada; não antecipar nova consulta nem declarar normalização antes do smoke da v23. A fila é por invocação, sem garantia distribuída entre instâncias ou ações manuais. Janelas de ciclo de 36–60 meses ainda podem exceder o prazo de 105s; a janela permanece incompleta nesse caso, sem confirmar elegibilidade parcial. Um lease antigo em andamento não é alterado pela migration.

Permanecem 78 recebíveis em conferência, R$ 21.931,40 nominais, após os cinco pagamentos comprovados. O patch de transporte não constitui prova de abertura, quitação ou cancelamento desses títulos.

Decisão do usuário: manter V1 financeiro e V2 dados dos alunos, sem contato com suporte Proesc. O contrato oficial V1 define os filtros como competência de vencimento e não documenta saldo ou estado explícito da obrigação. Registro contábil marcado como cancelado não autoriza cancelar automaticamente a obrigação; os 78 casos restantes ainda exigem evidência suficiente. A V2 vazia fica registrada como diagnóstico, não como requisito da correção do sincronizador.

Alternativa V1 conferida em leitura única: `financial_statement` da unidade e exercício atuais retornou HTTP 302/HTML, bloqueado pelo diagnóstico existente sem seguir redirecionamento. Requisição interna 130246, resumo sem dados pessoais. Nenhum novo estado financeiro foi comprovado. Teto de linhas e diff-check do manifesto aprovados.
