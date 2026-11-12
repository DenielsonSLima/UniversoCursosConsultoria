# NFS-e: retorno automático de emissão e cancelamento

## Objetivo e autorização
Usuário solicitou correção por etapas para acompanhar automaticamente envio e cancelamento, com atualização imediata por Realtime/TanStack Query quando houver retorno, sem botão de consulta manual. Versão publicada: 4.8.319. Usuário autorizou explicitamente a produção após a preparação e revisão. Não realizar emissão ou cancelamento real como teste.

## Etapas e aceite
1. Modal de lote recebe eventos fiscais do polo/ambiente/mês correto; eventos tardios e durante uma leitura não se perdem.
2. Worker central mantém continuação curta da fila após conclusão rápida, com lease, backoff e limitação fiscal preservados.
3. Modal individual observa snapshots canônicos via TanStack/Realtime. Observação não prepara, assina, envia nem consulta o provedor fiscal por sessão. Cancelamento em análise aceita reconciliação GET central.
4. Lote explicitamente enviado continua nas mesmas preparações aprovadas após confirmação; pausa explícita, encerramento, rejeição ou prévia expirada interrompem novos envios.
5. Modal aberto descobre o evento de cancelamento criado por outro usuário autorizado por uma referência canônica, com leitura isolada por operação e polo.
6. Recusa estruturada 429 antes da execução pode aguardar Retry-After e retomar os mesmos IDs aprovados; timeout/erro ambíguo nunca autoriza reenvio. Fechamento, pausa e expiração interrompem a intenção.
7. Dados, status, informações fiscais e bloqueios permanecem canônicos. Ações de leitura são detalhes, sem exigir consulta manual.

## Evidência inicial
Main conferida: c8dde63ed9372a09211930077f913fe5e20d79d7 (4.8.318). Revisão com três agentes reproduziu perda do evento fiscal no modal, descarte dentro do intervalo de 10 segundos, debounce da continuação central e cancelamento em análise sem GET.
Produção consultada somente por MCP: worker ativo com JWT verificado; controle e cron de recuperação habilitados; sem operações pendentes no momento, portanto sem confirmação de latência fiscal real.
Ajuste visual local dos dois arquivos de Emitidas permanece preservado fora deste manifesto.

## Ordem de implantação executada
1. Aplicar as migrations novas de continuação e observação, preservando controle e cron existentes.
2. Implantar nfse-national-individual com JWT verificado, novas leituras e orçamento separado.
3. Publicar o frontend após CI e revisão; conferir retorno por eventos sem operação fiscal real do agente.

## Validação
- Controlador: 37 regressões de sequência, retorno tardio, eventos, single-flight, pausa/desmontagem, expiração e quota antes do envio passaram.
- Backend: parsing, autorização, observação em 13 estados, reconciliação em análise, limite separado, bridge e transporte GET-only passaram.
- Frontend: cenários sintéticos de cache multiusuário, retorno durante POST pendente, referência de cancelamento descoberta após abrir o modal, 403/429, visibilidade e timestamp idêntico passaram.
- SQL/PGlite: continuação/deduplicação/antecipação, falha da fila HTTP e referências de cancelamento isoladas por escopo/ator passaram. As duas migrations e a concorrência passaram também no PostgreSQL 17 descartável da PR.
- TypeScript e lint focado passaram. Build completo executado com Node 24.22.1. Fontes manuais do manifesto ficam abaixo do teto de 500 linhas.
- Sem navegador, por direção do usuário; conferência visual ficará com ele. Nenhuma emissão, cancelamento ou consulta ao provedor fiscal foi realizada pelo agente. Migrations, Edge e frontend foram implantados após a autorização de produção.

## Publicação e verificação em produção
- Autorização explícita recebida: publicar, atualizar produção e explicar antes/depois com exemplos reais.
- PR [#412](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/412), candidato `087bdb7a9ab41e3f8f6f052b26f96d4b3bae8428`: 15 workflows aprovados e Preview Vercel bem-sucedida. Merge atômico `9859467cbc56e4278aa63c8ff95e32569641a087`.
- Migration `20261112220400_nfse_reconciliation_continuation.sql` aplicada via MCP; ledger remoto `20261112214552`, nome `nfse_reconciliation_continuation`.
- Migration `20261112220500_nfse_observation_cancellation_reference.sql` aplicada via MCP; ledger remoto `20261112214618`, nome `nfse_observation_cancellation_reference`. Os arquivos aplicados permanecem imutáveis.
- Edge `nfse-national-individual` v33 ACTIVE, `verify_jwt=true`; fonte remota retornada conferida contra o pacote aprovado, sem divergência. Worker v1 preservado, controle habilitado e cron de recuperação por minuto ativo.
- Deployment [dpl_6v6iTksLNFqM5XtnzbRxSBAv2fa4](https://vercel.com/denielson-limas-projects/universo-cursos-consultoria/6v6iTksLNFqM5XtnzbRxSBAv2fa4) READY, target production, commit do merge; aliases `www.universocc.com.br` e `universocc.com.br` atribuídos.
- HTTP público `/gestor` e `/assets/main-S_puIhHb.js` retornaram 200 às 21:54 UTC de 12/11; bundle identifica 4.8.319 e o resumo do retorno automático.
- Leitura funcional das novas RPCs sobre registros existentes: emissão nº 7 retornou AUTHORIZED; cancelamento nº 6 retornou CANCELLED, `dispatch=false`, sem XML assinado nem entrada do evento na projeção.
- Auditoria independente somente leitura: Edge/worker/cron ativos, 15 execuções recentes do cron sem falha, privilégios das RPCs restritos a service_role; sem novos envios, cancelamentos ou jobs desde a conferência inicial.
- Limitações: visual conferido pelo usuário; ainda sem medição de uma nova operação fiscal após esta implantação. Tempo do provedor não constitui promessa de confirmação instantânea.

## Exemplos reais anteriores à publicação
Horários de 12/11/2026 em America/Maceio; números extraídos do ledger e auditoria fiscal, sem expor dados pessoais.
- NFS-e nº 7, R$ 14.863,71: AWAITING_CONFIRMATION às 15:15:07.974 e AUTHORIZED às 15:16:14.714, intervalo de 66,740 segundos registrado no banco.
- NFS-e nº 6, R$ 14.863,71: AWAITING_CONFIRMATION às 14:58:52.204 e AUTHORIZED às 14:59:11.358, intervalo de 19,154 segundos. Cancelamento confirmado consta no ledger; não há auditoria suficiente para cronometrar a espera desse cancelamento.
- No fluxo novo, eventos do ledger atualizam a observação do modal/cache; leituras de recuperação são automáticas e o worker concentra as consultas fiscais. Os intervalos históricos acima não medem a interface nem comprovam a latência de uma operação após o release.

## Manifesto explícito
Total: 45 arquivos
- `.github/workflows/nfse-worker-security.yml`
- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-retorno-automatico.md`
- `modules/gestor/emissor-nfse/emissao/useNfseBatchRealtime.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.core.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.core.test.ts`
- `modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseSourceEmissionModal.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseSourceEmissionModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseDocumentOperationMenu.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseDailyFlow.interaction.test.mjs`
- `modules/gestor/emissor-nfse/components/NfseDocumentsList.tsx`
- `modules/gestor/emissor-nfse/parceiros/ServicosParceirosNfseTab.tsx`
- `modules/gestor/emissor-nfse/individual/nfse-individual.types.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual.service-core.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual.contract.test.ts`
- `supabase/functions/nfse-national-individual/contract.ts`
- `supabase/functions/nfse-national-individual/handler.ts`
- `supabase/functions/nfse-national-individual/handler-auto-cancellation.test.ts`
- `supabase/functions/nfse-national-individual/handler-observation.test.ts`
- `supabase/migrations/20261112220400_nfse_reconciliation_continuation.sql`
- `supabase/tests/nfse-reconciliation-continuation.fixture.mjs`
- `supabase/tests/nfse-reconciliation-continuation.isolated.test.mjs`
- `supabase/tests/nfse-reconciliation-continuation.concurrent.test.mjs`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-06-versoes-4-8-249-a-250.md`
- `modules/gestor/emissor-nfse/individual/nfse-individual.errors.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual.errors.test.ts`
- `modules/gestor/emissor-nfse/emissao/useNfseIndividualObservation.ts`
- `supabase/functions/nfse-national-individual/index.ts`
- `supabase/functions/nfse-national-individual/rate-limit.ts`
- `supabase/functions/nfse-national-individual/rate-limit.test.ts`
- `modules/gestor/emissor-nfse/emissao/NfseIndividualObservation.interaction.test.mjs`
- `modules/gestor/emissor-nfse/individual/nfse-individual.contract.ts`
- `supabase/functions/nfse-national-individual/queue-bridge.ts`
- `supabase/functions/nfse-national-individual/queue-bridge.test.ts`
- `supabase/migrations/20261112220500_nfse_observation_cancellation_reference.sql`
- `supabase/tests/nfse-observation-cancellation-reference.isolated.test.mjs`
- `modules/gestor/emissor-nfse/emissao/nfse-batch-rate-limit.test.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-command-quota-retry.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-command-quota-retry.test.mjs`
