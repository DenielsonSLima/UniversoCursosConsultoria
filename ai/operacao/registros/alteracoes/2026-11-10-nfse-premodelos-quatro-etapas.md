# Pré-modelos NFS-e — quatro etapas e ramos oficiais

## Pedido e escopo

Completar o pré-cadastro para selecionar parceiro e modelo ao emitir, usando as quatro etapas e regras condicionais do Guia Web 1.3. A correção posterior do usuário prevalece: tomador é escolhido na emissão, aluno em cursos ou parceiro PF/PJ em Serviços; não reproduzir campos de uma nota concreta no pré-modelo. Base candidata: commit 478b6e98cc69639389e00347f552c601bdf57acb do PR rascunho #379. Preservar produção e histórico.

Mudança crítica: metadados fiscais, interface e Supabase. Etapa inicial Pessoas/Serviço já validada; este incremento integra Valores, revisão e ramos adicionais inventariados. Sem transmissão fiscal neste lote; E0037 e executor real têm critérios próprios.

O usuário também pediu refazer o visual conforme Contas a Pagar/Receber. Referências locais: `financeiro/despesas/components/DespesaForm.tsx`, `financeiro/financial-dialogs.css` e `docs/design/interface-compacta.md`. Cabeçalho branco compacto, etapas com linha e ícones, campos de 38px, grupos com borda discreta, rolagem interna e rodapé fixo; no móvel, campos e ações de 44px. Estilos limitados ao modal de pré-modelos.

O manual particular de quatro páginas enviado pelo usuário foi lido como referência de preenchimento. Seus exemplos médicos, valores e alíquotas não foram adotados para a Universo. A fonte de cobertura das quatro etapas permanece o Guia oficial Web 1.3 e os perfis oficiais citados nos contratos.

## Aceite

Configuração, Serviço, Valores e Revisão, com regras reutilizáveis e origens da operação. Sem formulário de tomador, local/identidade/ID de participante fixo, documentos concretos ou placeholders de cálculos. Persistência/reabertura canônica, legado e replay preservados. Metadata real do estabelecimento por escopo num resumo cadastral; não copiar identidades ou credenciais no modelo.

## Manifesto explícito

Total: 112 arquivos.

- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-10-nfse-premodelos-quatro-etapas.md`
- `docs/contracts/nfse-premodels-people-service-reference.md`
- `docs/contracts/nfse-premodels-stage12.md`
- `docs/contracts/nfse-premodels-values-reference.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/emissor-nfse/modelos/NfseModelAdditionalFields.interaction.test.mjs`
- `modules/gestor/emissor-nfse/modelos/NfseModelAdditionalPeopleFields.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelAdditionalServiceFields.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelAmountRuleField.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelDocumentRules.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelFederalValues.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelForm.interaction.test.mjs`
- `modules/gestor/emissor-nfse/modelos/NfseModelForm.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelIbsCbsValues.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelMunicipalValues.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelPeopleFields.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelPeopleStep.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelPresetReview.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelServiceFields.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelSteps.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelTransparencyValues.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelValuesFields.interaction.test.mjs`
- `modules/gestor/emissor-nfse/modelos/NfseModelValuesFields.tsx`
- `modules/gestor/emissor-nfse/modelos/additional/NfseAdditionalControls.tsx`
- `modules/gestor/emissor-nfse/modelos/additional/NfseAdditionalForeignTrade.tsx`
- `modules/gestor/emissor-nfse/modelos/additional/NfseAdditionalPlaces.tsx`
- `modules/gestor/emissor-nfse/modelos/additional/nfse-preset-review.domains.ts`
- `modules/gestor/emissor-nfse/modelos/additional/nfse-preset-review.presentation.ts`
- `modules/gestor/emissor-nfse/modelos/catalogos/generated/nfse-currencies-01.json`
- `modules/gestor/emissor-nfse/modelos/catalogos/generated/nfse-currencies-02.json`
- `modules/gestor/emissor-nfse/modelos/catalogos/generated/nfse-currencies-03.json`
- `modules/gestor/emissor-nfse/modelos/catalogos/generated/nfse-currencies-04.json`
- `modules/gestor/emissor-nfse/modelos/catalogos/generated/nfse-currencies-05.json`
- `modules/gestor/emissor-nfse/modelos/catalogos/generated/nfse-currencies-06.json`
- `modules/gestor/emissor-nfse/modelos/catalogos/generated/nfse-additional-metadata.json`
- `modules/gestor/emissor-nfse/modelos/catalogos/generated/nfse-additional-data.ts`
- `modules/gestor/emissor-nfse/modelos/catalogs/classification-data.ts`
- `modules/gestor/emissor-nfse/modelos/catalogs/classifications-01.json`
- `modules/gestor/emissor-nfse/modelos/catalogs/classifications-02.json`
- `modules/gestor/emissor-nfse/modelos/catalogs/classifications-03.json`
- `modules/gestor/emissor-nfse/modelos/catalogs/classifications-04.json`
- `modules/gestor/emissor-nfse/modelos/catalogs/classifications-05.json`
- `modules/gestor/emissor-nfse/modelos/catalogs/classifications-06.json`
- `modules/gestor/emissor-nfse/modelos/catalogs/classifications-07.json`
- `modules/gestor/emissor-nfse/modelos/catalogs/classifications-08.json`
- `modules/gestor/emissor-nfse/modelos/catalogs/classifications-09.json`
- `modules/gestor/emissor-nfse/modelos/catalogs/classifications-10.json`
- `modules/gestor/emissor-nfse/modelos/catalogs/nfse-ibscbs.catalog.test.ts`
- `modules/gestor/emissor-nfse/modelos/catalogs/nfse-ibscbs.catalog.ts`
- `modules/gestor/emissor-nfse/modelos/catalogs/presumed-credits.json`
- `modules/gestor/emissor-nfse/modelos/catalogs/provenance.json`
- `modules/gestor/emissor-nfse/modelos/hooks/useNfseModelIssuerMetadata.ts`
- `modules/gestor/emissor-nfse/modelos/nfse-model-draft-normalization.test.ts`
- `modules/gestor/emissor-nfse/modelos/nfse-model-draft-normalization.ts`
- `modules/gestor/emissor-nfse/modelos/nfse-model-form-context.test.ts`
- `modules/gestor/emissor-nfse/modelos/nfse-model-form-context.ts`
- `modules/gestor/emissor-nfse/modelos/nfse-model-form.css`
- `modules/gestor/emissor-nfse/modelos/nfse-model-options-form.ts`
- `modules/gestor/emissor-nfse/modelos/nfse-model-options-form.test.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-additional-operation-strategies.test.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-additional-operation-strategies.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-additional-options.test.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-additional-options.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-additional-validation.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-additional.domains.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-additional.schema.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-additional.types.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-issuer.service-core.test.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-issuer.service-core.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-issuer.service.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-people-options.test.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-people-options.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-people-v2.test.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-preset-context.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-values-options.test.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-values-options.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-values-rules.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-values-tax-groups.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-values-validation.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-values.types.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.contract.test.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.contract.ts`
- `modules/gestor/emissor-nfse/types/nfse.types.ts`
- `scripts/generate-nfse-ibscbs-catalog.mjs`
- `supabase/migrations/20261110214625_nfse_model_issuer_metadata.sql`
- `supabase/migrations/20261110221924_nfse_model_fiscal_catalog.sql`
- `supabase/migrations/20261110221926_nfse_model_currency_catalog.sql`
- `supabase/migrations/20261110221929_nfse_model_service_codes_1.sql`
- `supabase/migrations/20261110221931_nfse_model_service_codes_2.sql`
- `supabase/migrations/20261110221934_nfse_model_service_codes_3.sql`
- `supabase/migrations/20261110221936_nfse_model_preset_rules.sql`
- `supabase/migrations/20261110221939_nfse_model_service_rule_objects.sql`
- `supabase/migrations/20261110221941_nfse_model_additional_options.sql`
- `supabase/migrations/20261110221943_nfse_model_value_rules.sql`
- `supabase/migrations/20261110221946_nfse_model_values_validation.sql`
- `supabase/migrations/20261110221948_nfse_model_complete_presets_rpc.sql`
- `supabase/migrations/20261110223449_nfse_model_people_operation_sources.sql`
- `supabase/migrations/20261110223451_nfse_model_operation_additional_rules.sql`
- `supabase/migrations/20261110223454_nfse_model_operation_values_rules.sql`
- `supabase/migrations/20261110223456_nfse_model_operation_presets_save.sql`
- `supabase/tests/nfse_model_complete_additional.isolated.test.mjs`
- `supabase/tests/nfse_model_complete_catalog.isolated.test.mjs`
- `supabase/tests/nfse_model_complete_persistence.isolated.test.mjs`
- `supabase/tests/nfse_model_complete_presets.fixture.mjs`
- `supabase/tests/nfse_model_complete_values.isolated.test.mjs`
- `supabase/tests/nfse_model_issuer_metadata.fixture.sql`
- `supabase/tests/nfse_model_issuer_metadata.isolated.test.mjs`
- `supabase/tests/nfse_model_operation_sources.isolated.test.mjs`

## Validação e reunião das três frentes

- Interface/fluxo: cobertura do Guia Web conferida; opções fechadas usam catálogo, dados da nota usam estratégias. A revisão mostra descrições e origens, sem cadastro de participante.
- Fiscal/Valores: conferidas vigências/flags, limites decimais e distinção entre regra e cálculo real; documentos não contêm fornecedor concreto, chave, data ou valor da nota. Revisão independente do SQL sem bloqueio de paridade.
- Backend: autorização antes do replay, histórico v1 preservado, Peoplev2 exigido para grupos novos e payload básico antigo compatível. Guardas de versão e anti-loss preservadas. Sem transmissão.
- 203 contratos puros, 5 smokes DOM, TypeScript global, ESLint de 66 arquivos, build Node24 e teto de linhas: aprovados.
- Contrato operacional aprovado; índice regenerado com15 fontes/79 trechos, bootstrap14874 bytes. Artefatos regeneráveis ficaram fora do manifesto.
- 29 verificações SQL da base das quatro etapas, 11 do contrato de origem por operação e 6 de metadados do estabelecimento: aprovadas em banco isolado.
- Aplicadas via MCP: metadados214625; 11 migrations221924–221948; quatro incrementais223449–223456. Renomeadas conforme ledger, mantendo bytes/hash das aplicadas. Anônimo sem execute; authenticated só nos RPCs públicos; helpers privados sem execute ao cliente.
- Conferência remota dos catálogos:338 serviços,917 NBS,26 indicadores,73 classificações e13 créditos. Nenhuma classificação inexistente vira código válido por texto de busca.
- Smoke Safari anterior: desktop e375×744; navegação, seletores, cancelamento e consulta real do estabelecimento aprovados. Um único modelo sintético inativo foi salvo/reaberto, versão2, sem emitir e sem alterar os dois modelos ativos.

- Smoke final autenticado no Safari local: quatro etapas navegadas; Configuração sem formulário de tomador; Serviço/Valores e revisão com origens preservadas. Layout desktop e375×744 conferidos, com as quatro abas e ações acessíveis. Rodapé fixo e rolagem interna aprovados; troca de etapa retorna ao início do conteúdo.
- Salvamento/reabertura final do mesmo modelo sintético inativo: versão3, Peoplev2. Conferência via MCP confirmou recipientSource=AT_ISSUANCE, recipientAddressSource=FROM_PARTNER, intermediarySource=NONE e ausência de chaves de participante fixo. Os dois modelos ativos permanecem nas versões1 e2. Modal fechado ao terminar; sem transmissão.
- CI do commit61b5fea67ff54669673af0ff3f529fa6ee7c16e3:16/16 verificações aprovadas, incluindo TypeScript, lint, testes, build e Vercel. Preview pronto. PR379 permanece em rascunho; esta conclusão não habilita o executor fiscal.

## Limites de emissão

Este incremento configura e persiste pré-modelos; não resolve valores/documentos de cada nota nem habilita o executor fiscal. Benefício municipal e código municipal fixo aguardam fonte oficial municipal. O retorno anterior E0037 da homologação não foi alterado. Nenhuma nota real transmitida, nenhum recebimento consumido e nenhuma implantação em produção.
