# Caixa: primeira abertura e conciliação comprovada

Estado: BACKEND_APLICADO_EM_PUBLICACAO. Versão4.8.229/revisão238. Mudança crítica financeira.
Pedido: resolver falha inicial seguida de sucesso no retry e conciliar quatro
parcelas com comprovantes do portal Proesc enviados pelo usuário. Aplicação e
publicação autorizadas; revisão final com três agentes. Sem navegador.

## Evidência

- Versão4.8.228 eliminou lookup lento de observações, mas não todos os timeouts.
- Logs da API em21/10/2026 02:31–02:32UTC confirmam SQL57014 em composição
  mensal e na base da listagem; retry da listagem respondeu em2,018s upstream.
- Primeira montagem dispara dez consultas financeiras; foco pode revalidar oito.
- Guarda autenticada medida em11,893ms na primeira execução e abaixo de3ms
  nas seguintes. JIT desativado, orçamento da API8s. Não é a causa medida.
- Contexto dos timeouts da composição aponta validação de composição Proesc
  e regras financeiras. Listagem aponta caixa_receivables_position_rows.
- Comprovantes de quatro pagamentos totalizamR$1.143,94 para nominalR$1.119,60.
  Valores exibidos de encargos não fecham exatamente com os totais pagos;
  não serão inventados componentes para completar diferenças.

## Aceite

- Consultas diretamente afetadas executam dentro do orçamento de8s.
- Contratos, cortes, autorização e valores preservados na otimização.
- Conciliação individual usa prova, identidade exata, guardas e idempotência.
- Nenhum recebimento duplicado ou ausência convertida em cancelamento.
- Revisões SQL, conciliação e regressão antes de aplicar/publicar.
- Teste visual reservado ao usuário por sua instrução expressa.

## Manifesto explícito

- `supabase/migrations/20261021003000_proesc_portal_superior_payment_confirmation.sql`
- `supabase/migrations/20261021004000_index_caixa_early_composition_history.sql`
- `supabase/migrations/20261021005000_index_caixa_snapshot_latest_order.sql`
- `supabase/tests/proesc_portal_payment_confirmation.isolated.test.mjs`
- `supabase/tests/caixa_early_history_index.isolated.test.mjs`
- `supabase/tests/caixa_snapshot_latest_order.isolated.test.mjs`
- `ai/operacao/registros/alteracoes/2026-10-20-caixa-primeira-abertura-conciliacao.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

- `modules/gestor/caixa/caixa-read-queue.ts`
- `modules/gestor/caixa/caixa-read-queue.test.ts`
- `modules/gestor/caixa/caixa.service.ts`
- `modules/gestor/caixa/caixa-composicao.queries.ts`
- `modules/gestor/caixa/review-pending/caixa-receivables-position.service.ts`
- `modules/gestor/caixa/review-pending/caixa-review-pending.service.ts`
- `scripts/test-caixa-report.mjs`

Total: 18 arquivos.

## Correção revisada

- Confirmação do portal passa a aceitar também pagamento superior, com motivo
  correspondente e mesmas guardas de identidade, valor, data, operador e replay.
- Guarda da composição mantém predicado completo e acrescenta pré-filtro
  indexável dos históricos relevantes, incluindo PORTAL_CONFIRMED com linhas vazias.
- Índice de última evidência inclui os dois desempates já existentes.
- PG17: 44 negativas da regra líquida e 22 de antecipação aprovadas; históricos
  relevantes62→2 e862→2buffers; latest7143vínculos/100002snapshots57006→35577buffers.
- Recibos: teste parcial/superior, motivo incompatível, replay, dupla baixa,
  preservação na sincronização e componentes desconhecidos aprovado.
- Burst MCP de três RPCs autenticadas antes do patch: prestação4,897s,
  posição3,833s, composição5,125s. Não reproduziu timeout naquele momento;
  a falha da API permanece comprovada pelos logs. Não é teste do pool HTTP.
- DDL limitado a30s e espera de lock2s; índice pode bloquear escritas durante
  construção, com rollback em erro. Orçamento da API8s preservado.
- Provas pessoais e payload de manutenção ficam privados, fora do versionamento.

## Verificação após índices

- Duas estruturas válidas/prontas: histórico relevante434176bytes e ordenação
  completa42991616bytes. Extensão de confirmação superior também aplicada.
- Payloads completos da listagem, excluído geradoEm, permanecem idênticos ao
  baseline: mensal4/R$1.119,60 e carteira10/R$2.799,00.
- Burst pós-índice: prestação6,107s, posição5,147s, composição6,041s.
  Margem ainda pequena sob concorrência; a otimização não é apresentada como
  prova de resolução da primeira abertura. Fila das leituras pesadas em preparação.
- Primeira conciliação conjunta abortou na guarda40001 de prova/identidade.
  A transação impede baixa parcial; divergência sendo investigada sem relaxar guarda.

## Resultado e validação final

- Revisões finais independentes dos três agentes aprovaram migrations, fila,
  recibos e respectivos testes. Nenhuma guarda foi relaxada para executar baixa.
- Falha40001: duas observações STAGED ainda não vinculadas foram substituídas
  no manifesto privado pelas últimas observações vinculadas e canonicamente
  idênticas. Mesmos requestIds, operador, provas, valores e datas; original preservado.
- Transação concluída: quatro confirmações APPLIED, total114394centavos.
  Composição não discriminada preservada, sem inferir centavos de diferença.
- Fila limita as quatro consultas pesadas a uma execução por aba e prioriza
  conferência sobre resumos aguardando. Cancelamento na espera não gera RPC;
  consulta em execução retém vaga até o transporte encerrar. Sem retry novo.
- Outras abas, cron e getters diretos do PDF permanecem independentes; fila
  não é apresentada como eliminação de toda concorrência do servidor.
- RPCs autenticadas sequenciais após índices: prestação4,456s, posição1,869s,
  composição2,867s. Orçamento8s mantido.
- Runner Caixa:159 testes aprovados, dois testes já marcados como skip;
  TypeScript sem erros. Smoke DOM do ajuste PJ é lote independente.
- Versão/changelog/registro de manifestos preparados sobre mainf84aca6;
  workspace paralelo não integra entrega. Build e checks serão conferidos no CI.

- Readback final: mensal0/R$0,00; carteira6/R$1.679,40. As quatro parcelas
  saíram da conferência após a confirmação auditada; demais seis preservadas.
- Ledgers Supabase: 20261021024854, 20261021024918, 20261021024949.
- Checagem global de linhas encontra23 arquivos preexistentes ausentes no
  workspace; os18 arquivos deste manifesto respeitam500linhas. CI remoto
  avaliará a árvore completa sobre main sem essas ausências locais.
