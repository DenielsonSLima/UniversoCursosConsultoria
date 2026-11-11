# Modelos NFS-e compartilhados entre matriz e filiais

## Objetivo e escopo

Modelos de emissão da matriz disponíveis às filiais ativas da mesma empresa, sem recadastro. Menu de três pontos com clonagem independente e inativação auditada. Sem alteração de notas, contas, certificados ou dados reais durante testes.

Origem permanece identificada. Filial pode usar e clonar o modelo herdado, mas edição/inativação do original exige a unidade de origem. Modelos próprios das filiais não são compartilhados entre irmãs. Ambientes são isolados e participantes fixos precisam continuar acessíveis ao destino.

## Situação

Implementação local revisada e integrada sobre a 4.8.294, SHA 66a6e037c595d67a28f1f921a2199e83c463d9f8. Candidata 4.8.295/revisão 304. Publicação no GitHub e em produção autorizada explicitamente pelo usuário em 11/11/2026, após testes. As quatro migrations de funções serão aplicadas somente após os gates do candidato, sem alterar modelos reais.

## Validação

- 11 testes de contrato: origem, permissões da projeção, lista com 150 modelos, escopo e intenção das mutações.
- Smoke sintético da interface: teclado, fechar menu, clique externo, Cancelar, foco, clique duplo, erro/retry com mesmo request_id, inativação, clone herdado, estado inativo e troca de unidade.
- PGlite: quatro migrations compiladas; helper/RPC exercitados com empresas/unidades sintéticas, grants mínimos, isolamento, auditoria, clone complexo, replay após alteração da origem e revogação de acesso antes do replay.
- Lint focado e teto de 500 linhas aprovados no manifesto.
- Revisão independente: nenhum bloqueador P0–P2 identificado; testes repetidos aprovados. Não houve teste concorrente com duas sessões PostgreSQL.
- Os consumidores fiscais completos não foram executados no harness mínimo. CI/build de integração, validação RPC real e smoke autenticado no Safari permanecem pendentes. Nenhuma identidade real foi simulada.
- Migrations só substituem funções e adicionam helper/RPC; não alteram modelos existentes. Os snapshots de auditoria são imutáveis. Não há exclusão física.

- Exportação de modelo: dois testes de abertura, download, retry e foco repetidos após mudança do hook; mutações proibidas no transporte da fixture.
- Índice RAG refeito localmente com 15 fontes e 80 trechos, sem incluir o cache no lote.

## Manifesto explícito

- `modules/gestor/emissor-nfse/modelos/NfseEmissionModelsSection.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelActionsMenu.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelActionDialog.tsx`
- `modules/gestor/emissor-nfse/modelos/nfse-model-actions.css`
- `modules/gestor/emissor-nfse/modelos/NfseModelActions.interaction.test.mjs`
- `modules/gestor/emissor-nfse/modelos/exportacao/NfseModelExportModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/modelos/hooks/useNfseModels.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.contract.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.service-core.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.contract.test.ts`
- `modules/gestor/emissor-nfse/types/nfse.types.ts`
- `supabase/migrations/20261111121000_nfse_shared_model_scope.sql`
- `supabase/migrations/20261111121001_nfse_shared_model_consumers.sql`
- `supabase/migrations/20261111121002_nfse_shared_model_preparation.sql`
- `supabase/migrations/20261111121003_nfse_shared_model_mutation.sql`
- `supabase/tests/nfse-shared-models.isolated.test.mjs`
- `supabase/tests/nfse_shared_models_rollback.sql`
- `.github/workflows/nfse-regressions.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-11-nfse-modelos-compartilhados.md`

Total: 23 arquivos.
