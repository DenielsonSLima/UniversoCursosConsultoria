# NFS-e: filiais, modelos centrais e retorno academico

## Escopo e autorizacao

Lote critico do dominio NFS-e solicitado pelo usuario: emitir e cancelar uma nota por filial, verificar o retorno dos recebimentos e corrigir o cadastro central dos modelos. Uso fiscal somente pelo sistema autenticado; portal oficial restrito a consulta. Propria retirada desta rodada por instrucao expressa posterior; testar Aquidaba e Porto da Folha. Descricao formal sem numero de parcela autorizada pelo usuario, preservando fatos reais. Publicacao autorizada. Base GitHub main9bc04a509573d77c3542068be1e2856550176a1c,4.8.296; entrega inicial4.8.297/revisao306 e continuação4.8.298/revisao307. Preservar alteracoes paralelas fora do manifesto.

## Correcoes

- Matriz ativa e unica da empresa gerencia os modelos. Filiais leem/usam/exportam o mesmo ID e versao, sem recadastro. Wrapper autoriza antes de replay; cores sem grants diretos. Modelos locais antigos ficam fora do catalogo central, preservados no historico.
- A1 da matriz pode representar filiais ativas da mesma empresa/raiz, no ambiente autorizado. Resolver valida CNPJ completo do emissor e certificado da matriz, configuracao, fingerprint e validade; assinatura/mTLS permanecem no backend. Nao lemos nem duplicamos chave privada, senha ou PFX.
- Indicador030101 resolve o local no estabelecimento emissor somente no cenario nacional/provedor/IBS-CBS/sem compra governamental. Demais cenarios conservam o local fixo do modelo. PREPARE/CLAIM validam o snapshot; historicos emitidos nao sao recalculados.
- Cancelamento academico libera elegibilidade somente com estado CANCELLED e codigo CONFIRMED coerentes, evento101101, ambiente/chave/referencia/assinatura presente e vinculo academico correto. XML, nota, reservas e financeiro anteriores ficam imutaveis; nova preparacao exige novo documento/operacao/DPS. Confirmacao pendente/rejeitada/incerta nao libera.
- Consulta mensal recusa sobreposicao parcial ou legado. Cache TanStack Query e Realtime consideram autoridade, unidade, ambiente e meses afetados. Sem polling novo.
- Mensagem especifica orienta identificar parcela/taxa no financeiro quando essa informacao canonica falta, sem expor identificadores internos ou mensagens SQL desconhecidas.

## Estado remoto e reproducao

- Tres configuracoesPROD salvas pela interface autenticada, com referencia ao A1 da matriz, SimplesME/EPP/apuracao1 e municipio proprio: Aquidaba2800209, Porto da Folha2805604, Propria2805703. Inscricoes municipais nao foram inventadas/copias da matriz. Configuracao da matriz e certificado existentes preservados.
- Duas copias locais criadas inicialmente foram inativadas apos correcao do usuario; terceira clonagem cancelada antes de salvar. Modelo central v7 preservado. Nao apagar historico.
- Tentativa real de preparar aluno em Aquidaba pelo fluxo normal reverteu integralmente com22023: recebimento sem parcela/tipo de taxa. Nenhum documento, reserva ou envio foi criado nessa tentativa.
- Consulta canonica em todas as datas:620 pagamentos em Aquidaba e1263 em Porto sem numero de parcela/taxa canonico; Propria sem pagamento efetivo. Em novembro:3 recebimentos/3alunos em Aquidaba e26/11 em Porto. Usuario autorizou descricao factual sem numero de parcela e retirou Propria desta rodada. Nao criar pagamento ficticio nem inventar parcela.
- Testes reais concluídos pelo fluxo normal autenticado em produção: Aquidabã e Porto da Folha autorizaram uma NFS-e nº1 deR$260,00 cada, com CNPJ/município próprios e A1 da matriz. As duas receberam cancelamentoCONFIRMED/evento101101 e XML oficial. As duas mensalidades voltaram a aparecer disponíveis na seleção de alunos do mesmo polo/mês/ambiente; conferência adicional somente leitura provou liberação estrita, reservas históricas preservadas e recibos/valores iguais à captura original. Nenhuma emissão foi realizada no portal oficial. Propriá permanece excluída conforme instrução do usuário.
- S/N foi informado somente nos dois cadastros autorizados; hashes dos demais campos permaneceram iguais. Preparações anteriores sem transmissão foram removidas logicamente antes de refazer a descrição. Nenhum pagamento foi criado ou alterado.

## Aplicacao e seguranca

Quatorze migrations deste lote aplicadas por MCP Supabase, com prefixos exatos do ledger listados no manifesto. Bytes aplicados imutaveis. Helpers privados sem grants app; wrappers minimos autenticados/service_role conforme contrato;search_path vazio; RLS preservada. Sem identidade real simulada.

Edge inicialv23 atualizada para ACTIVEv25,verify_jwt=true. Bundlev25SHA256a9a375c09de7c6caae232b1d31bca3bae05bf0f4f409080ed3387e28371a9f97;33 fontes verificadas byte a byte. A base remota paralelav24 foi preservada:31 arquivos intactos, apenas adapter acadêmico e novo helper de datas. Relay privado, HMAC/pins e demais endpoints inalterados. A publicação GitHub isola o delta acadêmico sobre main, preservando fontes locais governamentais fora deste commit.

## Validacao

- Revisao independente com tres agentes: representacao, fluxo academico e integracao fiscal.
- SQL isolado:10 representacao,9 retorno academico,5 local,7 gestao central e7 descricao sem parcela; todos passaram. Casos de outro ambiente/empresa, revogacao antes de replay, prova incompleta e sobreposicao preservam bloqueios.
- Deno:22 testes de local/adapter/runtime revisados; teste de local com--frozen repetido5/5, incluindo XSD sintetico das tres filiais. Novo teste incluido na CI.
- Frontend:281 testes NFS-e locais passaram, incluindo3 SSR de snapshot e2 de mensagem de validacao; contratos, TanStack e Realtime cobertos. DOM de acoes dos modelos e pendentes passou. Tipos e lint focados passaram.
- Node local24.19 foi recusado pela guarda existente; runtime oficial24.22.3 isolado em/tmp comSHA256 para build, sem reduzir a guarda do projeto.
- Build integrado passou comNode24.22.3; teto500 aprovado no manifesto. A entrega297 teve12 workflows aprovados, Preview/PROD READY e versão conferida no Safari. Critérios finais da continuação298 serão registrados na PR.
- Dados pessoais, segredos, artefatos gerados e caches fora do manifesto/RAG.

- Descricao sem parcela aplicada pela migration15247: mantem dados completos anteriores byte-identicos e acrescenta datas reais apenas aos pagamentos sem numeracao; modelo v7 e fontes financeiras mantiveram hashes. Previa ilustrativa explica a condicao.
- Remocao logica na UI aceita somente ausencia de operacao ou PREVIEWED semlease de despacho. Artefatos assinados de preparacao podem existir nesse estado e continuam preservados. SQL existente serializa remocao eCLAIM com o mesmo mutex de escopo e locks do documento; origem removida impedeCLAIM, estado ja despachado impede remocao. DOM cobre selecao mista e todos estados bloqueados. SemnovaDDL dessa UI.
- CI297 final aprovou12/12 workflows após corrigir a fixture antiga de exportação semcapability explícita. Nenhuma guarda do produto foi afrouxada.

## Continuação 4.8.298

- Dois bloqueios internos reproduzidos e corrigidos: separadores gerados U+2014 recusados pelo compositor conservador; competência acadêmica comparada indevidamente com o relógio da emissão. Novas preparações usam separadorASCII e último pagamento real da revisão congelada. Modelos, pagamentos, snapshots e XML anteriores não são reescritos. Serviços e datas fixas preservam suas regras.
- Migration25318 aplicada com SHA256d076dcc76f1e4e701ac6af6be3131285c0f67c16acac180cd4d31f9f021db48d; comparação remota provou que somente a função mudou. Fonte15247 aplicada permanece imutável. O XSD oficial não foi falsamente descrito como proibindo Unicode.
- Pedido posterior do usuário: pré-modelo facilita emissão; Revisar/Editar é opcional. PREVIEW_QUEUE cria validação canônica somente em operação acadêmica nova, com proveniênciaSYSTEM_VALIDATED/humanConfirmed=false. Editor opcional salva seleção sob versão/token. Revisão manual válida e replay/renewal existentes permanecem imutáveis. Nenhum clique de revisão ou checkbox de emissão é obrigatório; o envio fiscal continua exigindo clique explícito emEmitir.
- Migrations32026 e32034 aplicadas em ordem; SHA256b0dcb0b88a39c73c84f4a68d98dbabf9a6f885e0d23e0e80a536ea5a6f2b8811 e027f7dcf94c3c6f6479c9934913c6091bb5899edc8dcff59fdc566aae1b0883e. Mutex review-request precede academic-scope tanto no editor quanto no novo PREVIEW; autorização precede replay, CLAIM revalida fingerprint e falha posterior reverte revisão/operação juntas.
- Individual e lote carregam a prévia automaticamente; detalhes recolhidos emRevisar dados. Abertura nunca faz ISSUE; botãoEmitir explícito mantém capability, ambiente, expiração e persistência de IDs. Lote serial pausa em resultado incerto; consulta recupera a mesma operação, cancelamento preservado.
- Validação focada:8 SQL/compostorASCII;58 Deno no passo existente com XSD;9 SQL automáticos+3 negativos independentes;5 contratos e5 DOM do editor;2 DOM StrictMode e6 contratos do envio. Tipos/lint aprovados. Migrations e UI revisadas por agentes independentes; teste de ordem de locks aprovado. Smoke autenticado do novo fluxo e CI/Preview de298 em fechamento, sem nova nota fiscal fora das duas autorizadas.

## Manifesto explícito

- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-11-nfse-filiais-emissao-retorno.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseSourceEmissionModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseSourceEmissionModal.tsx`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.core.test.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.core.ts`
- `modules/gestor/emissor-nfse/fila/fiscal-review/NfseFiscalReviewDetails.tsx`
- `modules/gestor/emissor-nfse/fila/fiscal-review/NfseFiscalReviewModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/fila/fiscal-review/NfseFiscalReviewModal.tsx`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.contract.test.ts`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.contract.ts`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.service-core.ts`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.types.ts`
- `modules/gestor/emissor-nfse/fila/fiscal-review/useNfseFiscalReview.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue-validation.test.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue-validation.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue.realtime.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue.service.ts`
- `modules/gestor/emissor-nfse/fila/useNfseQueue.ts`
- `modules/gestor/emissor-nfse/individual/NfseIndividualSnapshot.test.tsx`
- `modules/gestor/emissor-nfse/individual/NfseIndividualSnapshot.tsx`
- `modules/gestor/emissor-nfse/individual/nfse-individual.contract.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual.types.ts`
- `modules/gestor/emissor-nfse/modelos/NfseEmissionModelsSection.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelActions.interaction.test.mjs`
- `modules/gestor/emissor-nfse/modelos/exportacao/NfseModelExportModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.contract.test.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.service-core.ts`
- `modules/gestor/emissor-nfse/pendentes/PendentesNfseTab.interaction.test.mjs`
- `modules/gestor/emissor-nfse/pendentes/PendentesNfseTab.tsx`
- `modules/gestor/emissor-nfse/preparar/PrepararNfseTab.tsx`
- `modules/gestor/emissor-nfse/preparar/queries/nfse-students-availability.test.ts`
- `modules/gestor/emissor-nfse/preparar/queries/nfse-students.keys.ts`
- `modules/gestor/emissor-nfse/preparar/realtime/useNfseReceiptRealtime.ts`
- `modules/gestor/emissor-nfse/preparar/services/nfse-students.contract.test.ts`
- `modules/gestor/emissor-nfse/preparar/services/nfse-students.contract.ts`
- `modules/gestor/emissor-nfse/preparar/types/nfse-students.types.ts`
- `modules/gestor/emissor-nfse/queries/nfse-cache.ts`
- `modules/gestor/emissor-nfse/realtime/nfse-realtime.test.ts`
- `supabase/functions/nfse-national-individual/academic-competence.test.ts`
- `supabase/functions/nfse-national-individual/academic-competence.ts`
- `supabase/functions/nfse-national-individual/adapter.test.ts`
- `supabase/functions/nfse-national-individual/adapter.ts`
- `supabase/functions/nfse-national-individual/service-location.test.ts`
- `supabase/functions/nfse-national-individual/service-location.ts`
- `supabase/migrations/20261112011358_nfse_branch_representation.sql`
- `supabase/migrations/20261112011400_nfse_branch_operation_credentials.sql`
- `supabase/migrations/20261112011403_nfse_branch_queue_credentials.sql`
- `supabase/migrations/20261112011405_nfse_branch_relay_scope.sql`
- `supabase/migrations/20261112011456_nfse_academic_cancel_release_store.sql`
- `supabase/migrations/20261112011503_nfse_academic_cancel_release_prepare.sql`
- `supabase/migrations/20261112011509_nfse_academic_receipt_availability.sql`
- `supabase/migrations/20261112012759_nfse_operation_service_location.sql`
- `supabase/migrations/20261112012806_nfse_prepared_service_location_guard.sql`
- `supabase/migrations/20261112013503_nfse_model_matrix_management.sql`
- `supabase/migrations/20261112015247_nfse_academic_description_optional_installment.sql`
- `supabase/migrations/20261112025318_nfse_academic_description_latin1_separators.sql`
- `supabase/migrations/20261112032026_nfse_automatic_fiscal_review.sql`
- `supabase/migrations/20261112032034_nfse_automatic_review_queue_preview.sql`
- `supabase/tests/nfse_academic_cancel_release.fixture.sql`
- `supabase/tests/nfse_academic_cancel_release.isolated.test.mjs`
- `supabase/tests/nfse_academic_optional_installment.isolated.test.mjs`
- `supabase/tests/nfse_automatic_fiscal_review.isolated.test.mjs`
- `supabase/tests/nfse_automatic_review.fixture.mjs`
- `supabase/tests/nfse_branch_representation.fixture.sql`
- `supabase/tests/nfse_branch_representation.isolated.test.mjs`
- `supabase/tests/nfse_model_matrix_management.isolated.test.mjs`
- `supabase/tests/nfse_operation_service_location.isolated.test.mjs`

Total: 74 arquivos.
