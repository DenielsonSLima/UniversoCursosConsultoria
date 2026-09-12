# Conciliação e consulta automática do legado Proesc T42

Data: 12/09/2026. Mudança crítica financeira. Versão: 4.8.46, revisão 55.
Estado: BANCO E EDGE APLICADOS; AUTOMAÇÃO ATIVADA E TRÊS LOTES VALIDADOS; PUBLICAÇÃO GITHUB/FRONTEND EM PREPARAÇÃO.

## Pedido e aceite

- Conferir o legado individualmente, importar somente obrigações comprovadas e
  registrar pagamentos com o valor recebido e a data efetiva informados pelo Proesc.
- Associar o histórico à Conta Proesc compartilhada; não criar saldo inicial
  adicional que duplique os recebimentos já registrados nas cobranças.
- Consultar automaticamente somente vínculos conferidos da T42, preservando
  títulos Banese, ciclos manuais e a cobertura externa individual já comprovada.
- Nove turmas seguintes somente depois da conclusão da T42; não recriar T42/Radiologia.

## Resultado definitivo

- 346 obrigações vinculadas: 204 pagas e 142 abertas; recebido total R$ 53.813,57.
- Quinze baixas confirmadas, total R$ 4.099,00; um recebimento parcial corrigido
  para R$ 50,00 e uma obrigação residual aberta incluída por R$ 229,90.
- Os 78 títulos Banese foram preservados. Nenhum novo boleto foi emitido.
- Conta Proesc recebe os vínculos financeiros; valores pagos são os recebimentos
  do provedor, sem transformar diferença de principal em desconto presumido.
- Datas efetivas de pagamento alimentam o período de recebimentos. Nenhum
  lançamento adicional de abertura de saldo foi criado.

## Contrato e automação

- V1 usa GETs oficiais limitados a configuração e contabilidade, com segredo em
  memória, timeout, limites de resposta e rejeição de erro semântico HTTP 200.
- Identidade externa e CPF normalizado são confrontados antes do snapshot;
  hashes e registros de auditoria permanecem privados, sem dados pessoais no retorno Edge.
- Blocos de recebimento são somados com multiplicidade preservada. Cópias fora
  do mês do próprio pagamento e recebimentos em datas diferentes exigem revisão.
- Juros, multas, descontos e acréscimos permanecem desconhecidos (`null`) quando
  não comprovados. Linhas contábeis ficam no snapshot privado; esta entrega não
  afirma possuir composição integral dos encargos nem a expõe em nova interface.
- RPCs internas exigem gestor global ativo autorizado, service role, intenção
  idempotente, CAS e locks. Correções usam fonte mais recente; ausência de linha
  de pagamento nunca reabre uma cobrança paga.
- Baixas históricas/correções não disparam aviso. Automação mantém somente a
  notificação da primeira confirmação, protegida por idempotência.
- Cron a cada dois minutos; até seis vínculos por execução e lease de três
  minutos. 346 vínculos exigem cerca de 116 minutos por varredura nominal;
  falhas e reprocessamentos podem ampliar esse prazo.
- Runtime e os 346 vínculos foram habilitados explicitamente após conferência.
  Consulta lê mês do vencimento, pagamento local, mês atual e anterior; não é
  uma releitura irrestrita de todos os meses a cada execução.

## Validação e operação

- Build de produção aprovado; o texto do teste de token foi ajustado para não prometer acesso acadêmico na V1.
- 49 testes Deno aprovados, incluindo cliente V1, normalização, teste de token,
  autorização do handler e automação sintética.
- Cinco migrations aplicadas; permanecem imutáveis. Ensaio transacional com
  rollback e negativos de autorização, CAS, replay, proteção e notificações aprovado.
- Aplicação definitiva das 346 obrigações e conferência dos totais realizadas via MCP Supabase.
- Edge `proesc-api` versão 4 implantada, estado ACTIVE. Token V1 salvo e probe
  real HTTP 200 com `ok: true`; uma tentativa anterior expirou e a retomada teve sucesso.
- Primeiro lote real: request 62430, HTTP 200, seis consultados, seis inalterados,
  zero revisões e zero falhas; início 18:06:07 e término 18:06:17 UTC em 12/09/2026.
- Revisões independentes de SQL, cliente e worker concluídas. O fluxo conserva
  recebimentos parciais; uma redução legítima não é convertida em desconto.
- Cron real confirmado também às 18:10:16–18:10:25 UTC e a partir de
  18:12:13 UTC, com seis snapshots por execução e sem erros. Três lotes
  observaram 18 vínculos desde 18:06 UTC.
- Smoke Safari autenticado em 4.8.45 confirmado após recarga: Caixa/Conta
  Proesc e recebido da T42 exibem R$ 53.813,57, iguais ao backend; cobertura
  individual protegida, duas matrículas trancadas bloqueadas, Banese 13/13
  preservado e geração manual mantida para as demais matrículas.
- Publicação GitHub/Vercel 4.8.46 permanece em preparação. Smoke das telas
  de histórico e teste de token aprovado, conforme fechamento abaixo.
- Segredos, CPFs, respostas brutas e planos individuais de execução ficam somente
  em armazenamento temporário privado e não pertencem a este manifesto.

## Manifesto explícito

- `modules/gestor/configuracoes/proesc/ProescConfig.tsx`
- `supabase/migrations/20260912200000_create_proesc_reconciliation_records.sql`
- `supabase/migrations/20260912200010_link_and_observe_proesc_obligations.sql`
- `supabase/migrations/20260912200020_apply_verified_proesc_payments.sql`
- `supabase/migrations/20260912200030_import_confirmed_proesc_residual.sql`
- `supabase/migrations/20260912210000_proesc_sync_runtime.sql`
- `supabase/tests/proesc_reconciliation.readonly.sql`
- `supabase/tests/proesc_reconciliation.transaction.sql`
- `supabase/functions/proesc-api/handler.ts`
- `supabase/functions/proesc-api/handler.test.ts`
- `supabase/functions/proesc-api/test-token.ts`
- `supabase/functions/proesc-api/test-token-v1.test.ts`
- `supabase/functions/proesc-api/v1-client.ts`
- `supabase/functions/proesc-api/v1-client.test.ts`
- `supabase/functions/proesc-api/v1-accounting.ts`
- `supabase/functions/proesc-api/v1-accounting.test.ts`
- `supabase/functions/proesc-api/sync-observation.ts`
- `supabase/functions/proesc-api/sync-observation.test.ts`
- `supabase/functions/proesc-api/sync-worker.ts`
- `supabase/functions/proesc-api/sync-worker.test.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/registros/alteracoes/2026-09-12-proesc-conciliacao-automatica.md`
- `ai/operacao/registros/alteracoes/2026-09-12-proesc-cobertura-individual.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/LOTE_ATIVO.md`

Total: 26 arquivos.

## Continuidade e limites

- PR 139 publicou a cobertura individual em 4.8.45, SHA abreviado `3d8c14`, com
  Vercel concluída; smoke visual autenticado confirmado no registro anterior.
- Publicação deste lote inclui somente o manifesto acima, sem arquivos do PR 134.
- Documentação e skill da integração têm lote próprio; não são alteradas aqui.
- Composição detalhada de encargos e novas turmas continuam fora desta entrega.
- Controle de versão 4.8.46 e teto de linhas aprovados; manifesto com 26 arquivos,
  nenhum ausente, máximo local de 401 linhas. Reindexação RAG no fechamento
  documental; o smoke não é substituído por testes sintéticos.

## Fechamento visual

- Testar token pela tela retornou conexão V1 validada, sem revelar a credencial.
- Histórico agrupado exibiu importação de 346 obrigações e ativação automática.
- Conta Proesc exibiu R$ 53.813,57 no Caixa; T42 exibiu o mesmo recebido.
- Agendamento repetido em produção confirmou novos lotes sem duplicações ou falhas.
