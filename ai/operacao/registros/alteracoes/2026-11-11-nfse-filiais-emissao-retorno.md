# NFS-e: filiais, modelos centrais e retorno academico

## Escopo e autorizacao

Lote critico do dominio NFS-e solicitado pelo usuario: emitir e cancelar uma nota por filial, verificar o retorno dos recebimentos e corrigir o cadastro central dos modelos. Uso fiscal somente pelo sistema autenticado; portal oficial restrito a consulta. Propria retirada desta rodada por instrucao expressa posterior; testar Aquidaba e Porto da Folha. Descricao formal sem numero de parcela autorizada pelo usuario, preservando fatos reais. Publicacao autorizada. Base GitHub main9bc04a509573d77c3542068be1e2856550176a1c,4.8.296; candidata4.8.297/revisao306. Preservar alteracoes paralelas fora do manifesto.

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
- Resultado real desta tarefa: ZERO novas notas das filiais emitidas ou canceladas. Uma preparacao e revisao reais de Aquidaba foram salvas; sua previa PREVIEWED mostrou descricao factual e CNPJ/municipio corretos, mas exigiu numero no endereco. Todos72alunos ativos de Aquidaba e112de Porto estao sem numero cadastrado. Usuario confirmou S/N como sem numero nos dois cadastros do teste; atualizacao desses campos e renovacao da revisao em andamento. Os dois testes ponta a ponta e o retorno visual apos cancelamento continuam pendentes; testes sinteticos nao sao prova de autorizacao fiscal individual.

## Aplicacao e seguranca

Onze migrations novas aplicadas por MCP Supabase, com prefixos exatos do ledger listados no manifesto. Bytes aplicados imutaveis. Helpers privados sem grants app; wrappers minimos autenticados/service_role conforme contrato;search_path vazio; RLS preservada. Sem identidade real simulada.

Edge nfse-national-individual ACTIVEv23,verify_jwt=true. BundleSHA256810c69af22edc8b6b2adf4b5cae457ad2a4affcc6be063bfaf829719d48a2048;32 fontes verificadas no get_edge_function,30 anteriores identicas. Unica fonte anterior alterada:adapter; adicionado resolvedor de local. Relay privado, HMAC/pins e demais endpoints inalterados.

## Validacao

- Revisao independente com tres agentes: representacao, fluxo academico e integracao fiscal.
- SQL isolado:10 representacao,9 retorno academico,5 local,7 gestao central e7 descricao sem parcela; todos passaram. Casos de outro ambiente/empresa, revogacao antes de replay, prova incompleta e sobreposicao preservam bloqueios.
- Deno:22 testes de local/adapter/runtime revisados; teste de local com--frozen repetido5/5, incluindo XSD sintetico das tres filiais. Novo teste incluido na CI.
- Frontend:281 testes NFS-e locais passaram, incluindo3 SSR de snapshot e2 de mensagem de validacao; contratos, TanStack e Realtime cobertos. DOM de acoes dos modelos e pendentes passou. Tipos e lint focados passaram.
- Node local24.19 foi recusado pela guarda existente; runtime oficial24.22.3 isolado em/tmp comSHA256 para build, sem reduzir a guarda do projeto.
- Build integrado passou comNode24.22.3; teto500 aprovado no manifesto. CI, Preview e smoke visual da publicacao: em fechamento. Evidencias finais de publicacao constarao tambem na PR.
- Dados pessoais, segredos, artefatos gerados e caches fora do manifesto/RAG.

- Descricao sem parcela aplicada pela migration15247: mantem dados completos anteriores byte-identicos e acrescenta datas reais apenas aos pagamentos sem numeracao; modelo v7 e fontes financeiras mantiveram hashes. Previa ilustrativa explica a condicao.
- Remocao logica na UI aceita somente ausencia de operacao ou PREVIEWED semlease de despacho. Artefatos assinados de preparacao podem existir nesse estado e continuam preservados. SQL existente serializa remocao eCLAIM com o mesmo mutex de escopo e locks do documento; origem removida impedeCLAIM, estado ja despachado impede remocao. DOM cobre selecao mista e todos estados bloqueados. SemnovaDDL dessa UI.
- CI inicial aprovou11 dos12workflows; NFS-e detectou fixture antiga de exportacao semcapability explicita. Fixture atualizada para matriz/filial e grupoDOM10/10 aprovado, sem afrouxar regra do produto. Candidato atualizado passara novamente pelaCI.

## Manifesto explícito

- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-11-nfse-filiais-emissao-retorno.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
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
- `supabase/tests/nfse_academic_cancel_release.fixture.sql`
- `supabase/tests/nfse_academic_cancel_release.isolated.test.mjs`
- `supabase/tests/nfse_academic_optional_installment.isolated.test.mjs`
- `supabase/tests/nfse_branch_representation.fixture.sql`
- `supabase/tests/nfse_branch_representation.isolated.test.mjs`
- `supabase/tests/nfse_model_matrix_management.isolated.test.mjs`
- `supabase/tests/nfse_operation_service_location.isolated.test.mjs`

Total: 52 arquivos.
