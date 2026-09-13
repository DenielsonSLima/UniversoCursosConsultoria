# Recuperação da leitura de configuração dos workers

## Estado da entrega

Lote crítico 4.8.53 revisado e preparado para publicação pelo manifesto explícito. O usuário autorizou continuar a investigação, corrigir e publicar. Não inclui novas importações ou mudanças nos fatos financeiros.

## Diagnóstico reproduzido

- Janela 12/09/2026, 23:19:51–23:49:51 (Maceió): o getter interno Banese teve 52 respostas HTTP200 e sete HTTP504; Push, 24/6; Automation, 9/3. A recusa ocorre antes da autenticação própria do worker e da consulta bancária.
- Tempos médios na origem: Banese HTTP200 1.940 ms, HTTP504 7.068 ms; Push HTTP200 1.642 ms, HTTP504 6.113 ms. Inicializações observadas entre 140 e 560 ms não explicam sozinhas essa diferença.
- Uma leitura direta do getter Banese, somente leitura, sob service_role e limitada a três segundos, executou em 2,740 ms. O teste retornou apenas o plano, sem conteúdo do segredo. Há índice único de nome no Vault e poucos registros.
- Amostra de conexões abaixo do limite de 60 e sem espera por locks; logs do intervalo não comprovam saturação de pool nem cancelamento SQL. Não atribuir HTTP504 a PGRST003 sem o código correspondente.
- Falhas alternam com execuções saudáveis. A localização precisa da espera na camada de API continua inconclusiva; este lote é uma recuperação limitada, não uma alegação de correção da infraestrutura.

## Mudança e aceite

- Helper exclusivo dos getters de segredo Banese e Push, usado por conciliação Banese, cancelamento Banese e dispatcher Push. Automation permanece diagnóstico, fora do patch.
- Até duas tentativas totais em leitura interna transitória: HTTP502/503/504, PGRST003, falha de transporte ou timeout. Erros de autorização, contrato inválido e demais erros definitivos encerram a leitura.
- Orçamento total de 12 segundos, primeira tentativa até oito segundos e intervalo aleatório de 250–750 ms. AbortSignal e limite do await impedem que resposta tardia autorize processamento.
- Retry nativo desativado somente nessa RPC. SDK fixado em 2.112.3 nos três entrypoints, com teste do comportamento real do builder.
- Telemetria contém somente etapa, número de tentativas, status, código permitido e duração. Falha final devolve 503 antes de adquirir trabalho da fila. Segredos não integram logs ou respostas.
- A recuperação não repete baixas, emissões, cancelamentos bancários ou envios. Filas, autenticação, limites e regras financeiras existentes são preservados.
- O prazo existente de conciliação começa na entrada da requisição e inclui a leitura de configuração. Uma guarda antes da reserva evita pegar lote quando a janela já foi consumida. O tempo perdido não deve aumentar o ritmo bancário.

## Validação e publicação

45 testes Deno aprovados: 11 do helper, quatro de integração, 15 do cancelamento, seis de cadência e nove de regressão Push. Cobrem contagem real do SDK, abort, prazo incluindo intervalo, erro persistente, proteção contra claim/envio após falha e consentimento/revalidação Push. Gate Banese preexistente atualizado apenas nas referências ao handler e ao quarto argumento de cadência: 11 testes adicionais aprovados. ESLint focado sem erros; build 4.8.53 aprovado em 7,78 s. Entrypoints registram Deno.serve incondicionalmente, com handlers separados e testáveis.

Revisão independente aprovada sobre os 13 hashes de fonte/testes. Bundles isolados de conciliação (104 arquivos) e Push (seis) passaram no deno check. Quatro complementos exclusivamente de tipos foram recuperados do commit base e identificados como invariantes, sem mudança de produto.

Cancelamento (27 arquivos): deno check encontrou TS2353 em boleto-incident-recovery.ts:90 (allowDiscountRemoval), reproduzido identicamente no bundle remoto original v5 de 26 arquivos. Os dois arquivos financeiros envolvidos são idênticos ao remoto. O coordenador mantém esses arquivos preservados e aceita esta limitação preexistente para publicar somente a guarda de configuração, validada por 15 testes de cancelamento. Nenhuma correção financeira foi incluída silenciosamente.

Publicação Edge por MCP concluída em 13/09/2026: conciliação v101 (03:18:16 UTC), Push v16 (03:18:28) e cancelamento v6 (03:18:43), todas ACTIVE. Smoke natural entre 03:18:45 e 03:23:30 UTC: 14 invocações das versões novas, todas HTTP200 (quatro conciliação, cinco Push e cinco cancelamento). Dois HTTP504 internos reais foram recuperados na segunda tentativa: Push terminou a leitura em 9.359 ms e cancelamento em 6.080 ms. A instabilidade da API persistiu nesses eventos, mas os workers concluíram. Nenhuma invocação manual, alteração de fila ou envio de teste foi realizada.

Conferência adicional contra as cinco fontes preexistentes do commit base comprovou ausência de alterações paralelas. Os 13 hashes permaneceram idênticos aos revisados.

Limite residual: rotinas especiais anteriores (diagnóstico, recuperação e substituição) e RPCs de finalização preservam seus contratos; o patch não cria um limite global de 55 segundos para todos esses caminhos. A espera na infraestrutura pode persistir e será distinguida da recuperação do getter.

Snapshots remotos anteriores: conciliação v100, Push v15 e cancelamento v5. Publicação deve preservar integralmente os demais arquivos remotos e verify_jwt=false já existente, com autenticação própria inalterada.

## Manifesto explícito

Total: 21 arquivos.

Base: b2b11a5cbd5fba8e4fd8fdea8d76b537e9add785. Publicar somente estes caminhos; registro remoto recebe apenas este lote, preservando referências locais paralelas fora da publicação.

- `supabase/functions/_shared/worker-secret-read.ts`
- `supabase/functions/_shared/worker-secret-read.test.ts`
- `supabase/functions/_shared/worker-secret-read.integration.test.ts`
- `supabase/functions/banese-reconciliation-worker/index.ts`
- `supabase/functions/banese-reconciliation-worker/pacing.ts`
- `supabase/functions/banese-reconciliation-worker/pacing.test.ts`
- `supabase/functions/push-notification-dispatcher/index.ts`
- `supabase/functions/banese-cancellation-worker/index.ts`
- `supabase/functions/banese-cancellation-worker/worker.ts`
- `supabase/functions/banese-cancellation-worker/worker.test.ts`
- `supabase/functions/banese-reconciliation-worker/handler.ts`
- `supabase/functions/push-notification-dispatcher/handler.ts`
- `supabase/functions/push-notification-dispatcher/index.test.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/MEMORIA_CANONICA.md`
- `ai/operacao/registros/alteracoes/2026-09-13-workers-configuracao-resiliente.md`
- `ai/operacao/registros/alteracoes/2026-09-12-consulta-api-proesc-banese.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `scripts/test-banese-reconciliation-control.mjs`

## Referências oficiais

- [Erros PostgREST](https://supabase.com/docs/guides/api/rest/postgrest-error-codes): PGRST003 identifica espera pelo pool; HTTP504 isolado não comprova esse diagnóstico.
- [Timeouts PostgreSQL](https://supabase.com/docs/guides/database/postgres/timeouts): limites por papel não devem ser aumentados sem evidência de consulta lenta.
- [Retries do SDK](https://supabase.com/docs/guides/api/automatic-retries-in-supabase-js): o código instalado 2.112.3 foi conferido diretamente, pois o texto atual diverge quanto a POST RPC e HTTP504. O helper controla explicitamente as tentativas.

## Entrega anterior confirmada

4.8.52 publicada no PR146, squash b2b11a5cbd5fba8e4fd8fdea8d76b537e9add785, CI e Vercel aprovados. Safari autenticado em produção confirmou Configurações, cinco abas Proesc, Caixa mensal/linha laranja, Recebíveis e filtros Proesc/Banese. As 56/110 cobranças em conferência permanecem corretamente fora da margem até existir prova financeira suficiente.
