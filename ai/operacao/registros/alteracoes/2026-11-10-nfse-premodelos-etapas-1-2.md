# Pré-modelos NFS-e — Pessoas e Serviço

## Pedido e limite

Reformular o pré-cadastro conforme as capturas do Portal Nacional, com quatro etapas. O usuário confirmou que todos os parâmetros reutilizáveis devem ficar no pré-modelo, para escolher o parceiro e o modelo ao emitir. Implementação inicial: campos de Pessoas/Serviço presentes nas capturas. A orientação seguinte pediu pesquisar as quatro etapas completas na documentação oficial, incluindo ramos não fotografados. Valores/Revisão e esses ramos ainda exigem integração. Não emitir NFS-e neste lote.

Mudança crítica de metadados fiscais, interface e Supabase; três agentes independentes para contrato, persistência e interface. Base: candidata do PR rascunho #379, commit 1bc182cd0d25ac57d65751a07dcfa7b494e5719f. Preserve o piloto, recebimentos e preparações.

## Aceite

Navegação em quatro etapas; escolhas condicionais de Pessoas/Serviço persistidas por escopo e versão; pessoas resolvidas pelos cadastros; descrição de até 2.000 caracteres também após expansão; seleção por catálogos; reabertura canônica dos valores salvos; ausência de transmissão. Migrations existentes imutáveis.

## Manifesto explícito

Total: 48 arquivos.

- `modules/gestor/emissor-nfse/modelos/NfseModelForm.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelSteps.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelGeneralOptions.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelLocationPicker.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelServiceLocation.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelOperationType.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelServiceFields.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelComplementaryFields.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelDescriptionEditor.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelPeopleStep.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelPeopleFields.tsx`
- `modules/gestor/emissor-nfse/modelos/nfse-model-options-form.ts`
- `modules/gestor/emissor-nfse/modelos/nfse-model-options-form.test.ts`
- `modules/gestor/emissor-nfse/modelos/NfseModelForm.interaction.test.mjs`
- `modules/gestor/emissor-nfse/modelos/NfseModelLocationPicker.interaction.test.mjs`
- `modules/gestor/emissor-nfse/modelos/nfse-model-form.css`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-service-options.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-service-options.test.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-people-options.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-people-options.test.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-partners.service-core.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-partners.service-core.test.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-model-partners.service.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.contract.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.contract.test.ts`
- `modules/gestor/emissor-nfse/modelos/hooks/useNfseModelPartnerSearch.ts`
- `modules/gestor/emissor-nfse/types/nfse.types.ts`
- `modules/gestor/emissor-nfse/parceiros/NfsePartnerServiceModal.tsx`
- `modules/gestor/emissor-nfse/parceiros/NfsePartnerServiceModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.contract.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.contract.test.ts`
- `supabase/migrations/20261110212829_nfse_model_service_presets.sql`
- `supabase/migrations/20261110212831_nfse_model_people_presets_and_save.sql`
- `supabase/migrations/20261110212834_nfse_partner_service_description_2000.sql`
- `supabase/migrations/20261110213318_nfse_model_partner_display_labels.sql`
- `supabase/tests/nfse_model_presets.fixture.sql`
- `supabase/tests/nfse_model_service_options.isolated.test.mjs`
- `supabase/tests/nfse_model_people_presets.isolated.test.mjs`
- `supabase/tests/nfse_partner_service_description.isolated.test.mjs`
- `docs/contracts/nfse-premodels-stage12.md`
- `docs/contracts/nfse-premodels-people-service-reference.md`
- `docs/contracts/nfse-premodels-values-reference.md`
- `docs/contracts/nfse-premodels-review-reference.md`
- `ai/operacao/registros/alteracoes/2026-11-10-nfse-premodelos-etapas-1-2.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `.github/workflows/nfse-regressions.yml`
- `internal/versioning/CHANGELOG.md`

## Validação

- 159 testes de contratos, três smokes DOM, 26 verificações SQL isoladas, TypeScript de Modelos/Serviços (49 raízes), lint de 33 arquivos e teto de linhas aprovados. Build completo com Node 24.22.1 aprovado.
- Quatro migrations aplicadas por MCP, na ordem das versões do manifesto; ledger e permissões conferidos. Anônimo sem busca de parceiros; auxiliares privados sem EXECUTE para authenticated. Modelos anteriores preservados.
- Safari autenticado em 127.0.0.1:5173: navegação das quatro etapas, seleção real de País/IBGE e classificações, gravação e reabertura do modelo TESTE inativo aprovadas. Persistidos competência por data da emissão, série personalizada 49999, uso de endereço cadastral, Brasil/Japoatã, descrição e complemento sintéticos. GET/MCP confirmou os objetos sem labels ou identidade copiada.
- O teste manteve os dois modelos ativos anteriores e não preparou serviço, não gerou conta a receber e não transmitiu documento fiscal. O modelo de teste permanece inativo e identificado na lista.
- Revisão independente encontrou limites divergentes de descrição e nomes longos; consumidores diretos alinhados em 2.000 e labels de parceiros limitados a 300 somente para apresentação. Referências UUID preservadas.

## Limites reais

Pessoas/Serviço ainda não cobrem todos os ramos nacionais: exterior/NIF, comércio exterior, obra, imóvel, evento e código municipal complementar foram inventariados a partir das fontes oficiais. A razão social e o endereço do emitente aparecem por referência ao cadastro, sem prévia preenchida nesse formulário. Valores/Revisão são etapas de navegação ainda sem implementação fiscal. Este lote não torna a emissão real pronta nem altera o resultado E0037 anterior.

## Pesquisa das quatro etapas

O Guia Web 1.3 de produção (31/10/2026, 130 páginas) foi baixado integralmente da página oficial, extraído e comparado com 1.2.1. Etapas: Pessoas p.22, Serviço p.44, Valores p.67, Emitir/Revisão p.85 e resultado p.87. O usuário não precisa enviar as fotos restantes para a especificação. Inventários detalhados nas três referências do manifesto; mapeamento documental e implementação são estados distintos.

Os perfis de produção 09/02/2026 e homologação 20/10/2026 têm diferenças materiais mesmo sob versão XML 1.01. O comunicado oficial de 29/10 mantém produção em NT004/007 e testes em NT009 release1. As regras de cada ramo devem ser implementadas por perfil; não copiar estruturas de teste para produção silenciosamente. Não foi encontrado repositório GitHub oficial que substitua os guias/anexos como autoridade.

Publicação: somente candidata em PR rascunho/Preview; produção não autorizada neste recorte. O manifesto é incremental ao PR #379 e não inclui caches, harnesses ou artefatos de build.
