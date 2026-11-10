# NFS-e: seleção e exclusão segura da fila — 10/11/2026

## Pedido e escopo

Remover o botão Atualizar da aba Pendentes e permitir selecionar várias preparações para excluir. Base main b730d938b10faec950d9549b8ba371093c050fde, 4.8.282/revisão 291; candidata 4.8.283/revisão 292. Mudança crítica por banco, RLS e financeiro. Não torna o emissor pronto para transmissão fiscal.

## Contrato e segurança

Seleção individual ou de todos da página, contador, limpeza, confirmação explícita e bloqueio de cliques repetidos. Trocar página limpa a seleção; exclusão da última página retorna à página válida. Retry conserva o requestId para evitar repetir a operação após resposta perdida.

Remoção append-only apenas de PREPARADO com fiscalReadiness.ready=false. A RPC autoriza o contexto vigente antes do replay, valida polo/ambiente/mês e rejeita lote misto ou desatualizado por inteiro. Bloqueio de escopo compartilhado entre preparo e remoção, com row locks e READ COMMITTED. Não apaga nem altera pagamentos, documentos, snapshots, batches ou reservas históricas. Reservas de documentos removidos deixam de impedir nova preparação; o guard mantém exclusividade das reservas ativas.

Evento realtime próprio, apenas com identificador técnico e escopo, protegido por RLS piloto. Não depende da liberação do provider fiscal. Invalidação inicial/reconexão e polling limitado a 60s em primeiro plano recuperam mudanças sem controle manual de atualizar. Flags fiscais e botão Emitir continuam bloqueados.

## Manifesto explícito

- `.github/workflows/nfse-regressions.yml`
- `modules/gestor/emissor-nfse/EmissorNfsePage.tsx`
- `modules/gestor/emissor-nfse/fila/nfse-queue-removal.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue.realtime.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue.service-core.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue.service.ts`
- `modules/gestor/emissor-nfse/fila/useNfseQueue.ts`
- `modules/gestor/emissor-nfse/fila/useNfseQueueRealtime.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue-removal.test.ts`
- `modules/gestor/emissor-nfse/pendentes/PendentesNfseTab.tsx`
- `modules/gestor/emissor-nfse/pendentes/PendentesNfseTab.interaction.test.mjs`
- `modules/gestor/emissor-nfse/pendentes/nfse-queue-selection.css`
- `supabase/migrations/20261110132800_nfse_queue_logical_removal.sql`
- `supabase/migrations/20261110132801_nfse_queue_realtime.sql`
- `supabase/tests/nfse_academic_queue.isolated.test.mjs`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-10-nfse-fila-selecao-exclusao.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-10-versoes-4-8-206-a-207.md`

Total: 21 arquivos. Histórico 4.8.206/207 arquivado sem alterar texto. Migrations anteriores permanecem imutáveis.

## Validação

14 testes contratuais, 28 testes SQL isolados carregando as duas migrations novas, e teste DOM com React/QueryClient reais e serviço sintético passaram. Cobertura: seleção/cancelamento/limpeza/paginação, clique repetido, falha/retry, invalidação automática, autoria/escopo, replay, rejeição integral, rollback, proteção de EMITIDA/readiness e novo preparo com histórico preservado.

Tipagem focada e ESLint dos arquivos TS/TSX alterados passaram. Revisão estática independente não encontrou bloqueador. Teto de 500 linhas conferido por manifesto; patch aplica à base. Sem teste concorrente com duas conexões Postgres; PGlite executa os contratos de isolamento/replay. Build completo e CI/Preview do SHA final ainda pendentes.

Safari autenticado indisponível porque o Mac está offline. Nenhuma preparação real foi excluída, nenhum certificado/segredo exportado e nenhuma transmissão fiscal realizada. Smoke autenticado e prova de realtime entre sessões permanecem pendentes.

## Publicação e reversibilidade

Usuário autorizou explicitamente aplicar as duas alterações no banco e publicar a tela em 10/11/2026, mantendo emissão bloqueada e sem excluir itens reais. Publicar somente este manifesto via MCP GitHub. Aplicar as duas migrations versionadas via MCP Supabase, após validação e autorização aplicável, e conferir funções, ACL/RLS, publication e contagens sem mutar registros reais. CI e Preview do SHA exato devem estar aprovados antes do merge/produção.

Em regressão visual, restaurar o frontend anterior. Não apagar o histórico nem reativar reservas por rollback destrutivo. A evolução do backend é aditiva em dados e compatível com o frontend anterior; impedir exclusões preserva toda a prova original. O preparo fiscal futuro deve consultar exclusões e obedecer ao mesmo bloqueio de escopo.
