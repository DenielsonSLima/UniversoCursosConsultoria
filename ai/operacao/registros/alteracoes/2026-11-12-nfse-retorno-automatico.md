# NFS-e: retorno automático de emissão e cancelamento

## Objetivo e autorização
Usuário solicitou correção por etapas para acompanhar automaticamente envio e cancelamento, com atualização imediata por Realtime/TanStack Query quando houver retorno, sem botão de consulta manual. Versão proposta: 4.8.319. Implementação e testes autorizados; produção ainda depende de autorização explícita do lote. Não realizar emissão ou cancelamento real como teste.

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

## Ordem de implantação proposta
1. Aplicar as migrations novas de continuação e observação, preservando controle e cron existentes.
2. Implantar nfse-national-individual com JWT verificado, novas leituras e orçamento separado.
3. Publicar o frontend após CI e revisão; conferir retorno por eventos sem operação fiscal real do agente.

## Validação
- Controlador: 37 regressões de sequência, retorno tardio, eventos, single-flight, pausa/desmontagem, expiração e quota antes do envio passaram.
- Backend: parsing, autorização, observação em 13 estados, reconciliação em análise, limite separado, bridge e transporte GET-only passaram.
- Frontend: cenários sintéticos de cache multiusuário, retorno durante POST pendente, referência de cancelamento descoberta após abrir o modal, 403/429, visibilidade e timestamp idêntico passaram.
- SQL/PGlite: continuação/deduplicação/antecipação, falha da fila HTTP e referências de cancelamento isoladas por escopo/ator passaram. A validação PostgreSQL 17 real está preparada no workflow descartável da PR.
- TypeScript e lint focado passaram. Build completo executado com Node 24.22.1. Fontes manuais do manifesto ficam abaixo do teto de 500 linhas.
- Sem navegador, por direção do usuário; conferência visual ficará com ele. Nenhuma emissão, cancelamento, consulta fiscal real ou operação de produção realizada nesta implementação.

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
