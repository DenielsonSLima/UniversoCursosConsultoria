# Fidelidade do Diário, assinaturas e acessos temporários 4.7.3 — 2026-08-23

Estado: `PUBLICACAO_AUTORIZADA_EM_VALIDACAO`

## Objetivo

Restaurar a listagem de turmas, igualar o Diário do Professor ao fluxo canônico do Gestor, aplicar integralmente os modelos salvos e a marca d'água institucional, disponibilizar a revisão do coordenador dentro do próprio portal Professor e validar os acessos temporários sem gerar boleto, cobrança ou operação Banese.

## Resultado funcional

- O contrato de indicadores do Gestor preserva valores numéricos e volta a listar as turmas técnicas e livres temporárias nas categorias corretas.
- Professor e Gestor reutilizam o mesmo compositor vetorial do Diário; a antiga árvore raster/genérica foi retirada.
- Capa, página 2, contracapa, campos, QR, posições de Professor/Coordenador e marca d'água são consumidos dos modelos ativos e das configurações do polo.
- Ausência ou incompatibilidade do modelo/marca configurados falha explicitamente; o gerador não inventa aparência substituta.
- A página 2 mantém dois slots distintos e configuráveis. Sobreposição, papel divergente, QR fora da folha ou modelo incompleto bloqueiam a emissão.
- O fluxo de assinatura permanece Professor → Coordenador. A coordenação é uma capacidade do perfil Professor, não um portal ou papel exclusivo.
- O último signatário gera o Diário final com duas páginas vetoriais de evidência anexadas e um comprovante independente.
- O Gestor recebeu o módulo `Assinaturas`, com busca, filtros, caixa/acervo, card de Diários e visualização/baixada do documento final. Contratos e Matrículas aparecem como categorias futuras explicitamente indisponíveis enquanto não houver contrato seguro de backend.
- A turma também expõe o atalho para o Diário assinado quando o artefato final existe.

## Governança permanente

- A política de PDFs oficiais passou a exigir rastreamento da origem visual antes de alterar qualquer gerador.
- A skill `universo-document-model-fidelity` foi criada, validada e instalada localmente. Ela obriga a localizar Modelo de Documentos, configurações institucionais e marca d'água, reutilizar o compositor canônico e testar prévia, download e impressão com a mesma origem.

## Supabase e segurança

- Projeto principal: `kfekgwyqozhicpfuunpo`.
- Treze migrations incrementais foram aplicadas exclusivamente pelo MCP Supabase; os arquivos-fonte abaixo preservam o conteúdo aplicado.
- A política jurídica da Matriz está `APROVADA`, com evidências habilitadas e fluxo sequencial.
- O snapshot congela modelo, manifesto semântico v2, marca do Diário e marca própria do comprovante sem reconsultar configuração mutável após o início.
- Professor e Coordenador devem ser identidades distintas, com atribuição ativa e escopo de polo/curso.
- A Edge Function `assinatura-eletronica-diario-artefatos` foi publicada na versão 13, com JWT obrigatório.
- O adaptador remoto exige igualdade entre o alvo semântico externo e o manifesto congelado; divergência é rejeitada.
- Auditoria dos dados temporários confirmou zero recebíveis, boletos, transações de gateway e arquivos CNAB associados.

## Validação de acessos

- Seis logins temporários autenticaram pelo contrato real: três professores, um professor com coordenação, um aluno e um responsável.
- Ana visualiza a disciplina técnica; Bruno visualiza sua disciplina; Informática visualiza as nove disciplinas do Curso Livre.
- O Professor coordenador continua em `/professor` e recebe apenas as capacidades de revisão e assinatura coordenacional.
- O Aluno visualiza duas matrículas e resultados técnicos. A carteirinha estudantil foi emitida pelo RPC do próprio aluno, com prefixo `CIE`, snapshot público e frente/verso oficiais.
- O Responsável visualiza exatamente um dependente dentro do vínculo autorizado.
- O Gestor recebe as duas turmas temporárias pelo RPC canônico de progresso.
- O Diário-alvo de Relações Humanas possui 20/20 horas, cinco sessões, um aluno e nenhuma pendência acadêmica; está elegível para fechamento e revisão.

## Limites de teste

- Safari estava aberto e autenticado, mas o controlador remoto não conseguiu anexar à janela (`cgWindowNotFound`). A validação autenticada foi continuada pelos mesmos contratos públicos de Auth/RPC/Edge, sem extrair segredos do navegador e sem substituir silenciosamente o Safari por outro navegador.
- Nenhum boleto, cobrança, arquivo Banese, transação bancária ou recebível foi gerado.
- A assinatura real não foi fabricada: a etapa obrigatória de preparação do envelope depende de uma sessão Gestor e o Safari não ficou controlável. O Diário permaneceu aberto e sem envelope; nenhuma atualização SQL contornou RLS.

## Validação técnica

- PDF, modelo, Diário, compositor e evidências: 193 contratos aprovados.
- Edge Function de artefatos: 112 contratos aprovados; `deno check` aprovado.
- Acervo/Assinaturas do Gestor: 10 contratos aprovados.
- Atalho e artefatos assinados dentro da turma: 5 contratos Node aprovados.
- Navegação e papéis temporários: 34 contratos aprovados.
- Aluno/Responsável: 57 verificações aprovadas.
- Guardas remotas de geometria: Técnico e Livre preservam largura, QR+rótulo e slots válidos após a migration `20260823210922`.
- TypeScript, ESLint focado, teto de linhas, versão, operação, RAG e build integram o gate final.
- Revisão independente obrigatória antes da publicação.

## Publicação

- Atualização atômica da PR #83 na branch `release/sincronizacao-completa-4-7-2`, promovida para a versão estável 4.7.3.
- Merge na `main` e Vercel Produção foram autorizados expressamente pelo usuário e dependem de CI/Preview verdes.
- Edge Function v13 e migrations já estão ativas; a publicação web não altera dados financeiros.

## Manifesto explícito

Total: 188 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/politicas/PDFS_OFICIAIS.md`
- `ai/operacao/qualidade/limite-linhas.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/ALTERACOES.md`
- `ai/operacao/registros/alteracoes/2026-08-23-fidelidade-diario-assinaturas-acessos-4-7-3.md`
- `ai/operacao/skills/universo-document-model-fidelity/SKILL.md`
- `ai/operacao/skills/universo-document-model-fidelity/agents/openai.yaml`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-08-02-parte-2.md`
- `internal/versioning/system-version.json`
- `modules/gestor/cadastros/modelos-documentos/diarios/DiariosPage.tsx`
- `modules/gestor/cadastros/modelos-documentos/diarios/components/DiarioBackCoverSettingsPanel.tsx`
- `modules/gestor/cadastros/modelos-documentos/diarios/components/DiarioEditorCanvas.tsx`
- `modules/gestor/cadastros/modelos-documentos/diarios/components/DiarioFieldPropertiesPanel.tsx`
- `modules/gestor/cadastros/modelos-documentos/diarios/diarios-editor.types.ts`
- `modules/gestor/cadastros/modelos-documentos/diarios/diarios-template-defaults.ts`
- `modules/gestor/cadastros/modelos-documentos/diarios/diarios.service.ts`
- `modules/gestor/cadastros/modelos-documentos/diarios/hooks/useDiarioTemplateEditor.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioClasse.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioClasseTabs.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioPrintBackCover.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioPrintCover.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioPrintDocument.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioPrintPage.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioPrintSections.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioPrintStyles.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/TurmaDiarioCard.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/TurmaDiarios.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-classe.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-assets.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-back-cover-fields.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-cover-pages.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-layout.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-pages.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-server-boundary.fixtures.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-server-boundary.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-snapshot-contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.browser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.validation-academic.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.validation-core.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.validation-institution.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.validation-structure.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-validation-flow.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/export/DiarioExportModal.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/hooks/useDiarioExport.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/hooks/useDiarioLocalState.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/hooks/useDiarioPdfDownload.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/turma-diario-assinado.contract.test.mjs`
- `modules/gestor/secretaria/SecretariaPage.tsx`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.editor-stamp.ts`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.editor-watermark.ts`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.editor.ts`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.pages.ts`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.pdf.contract.fixtures.ts`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.pdf.contract.test.ts`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.pdf.preview.contract.test.ts`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.pdf.receipt.contract.test.ts`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.pdf.ts`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.preview-sections.ts`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.receipt-decoration.ts`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.receipt-sections.ts`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.receipt-validation.ts`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.stamp-preview.ts`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.types.ts`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.validation-helpers.ts`
- `modules/gestor/secretaria/assinatura-eletronica/signature-pdf-artifacts.server.ts`
- `modules/gestor/secretaria/assinaturas/SecretariaAssinaturasAcervo.shared.ts`
- `modules/gestor/secretaria/assinaturas/SecretariaAssinaturasAcervo.tsx`
- `modules/gestor/secretaria/assinaturas/SecretariaAssinaturasAcervoDetailDialog.tsx`
- `modules/gestor/secretaria/assinaturas/SecretariaAssinaturasAcervoFilters.tsx`
- `modules/gestor/secretaria/assinaturas/SecretariaAssinaturasPage.tsx`
- `modules/gestor/secretaria/assinaturas/secretaria-assinaturas-acervo.contract.test.ts`
- `modules/gestor/secretaria/components/SecretariaDashboard.tsx`
- `modules/gestor/secretaria/secretaria-access.ts`
- `modules/professor/assinaturas/ProfessorAssinaturasPage.tsx`
- `modules/professor/assinaturas/professor-signature-access.test.ts`
- `modules/professor/assinaturas/professor-signature-access.ts`
- `modules/professor/professor.page.tsx`
- `modules/professor/turmas/professor-diary-parity.test.ts`
- `modules/shared/polo-institutional/polo-institutional.types.ts`
- `modules/shared/assinatura-eletronica/ElectronicSignatureActionModal.helpers.ts`
- `modules/shared/assinatura-eletronica/ElectronicSignatureActionModal.tsx`
- `modules/shared/assinatura-eletronica/ElectronicSignatureActionModal.types.ts`
- `modules/shared/assinatura-eletronica/ElectronicSignatureActionModalContent.tsx`
- `modules/shared/assinatura-eletronica/ElectronicSignatureConsentForm.tsx`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.client-boundary.test.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.contract.inbox.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.contract.legal.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.contract.presentation.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.contract.query-keys.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.contract.stamp.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.contract.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.service.administration-normalizers.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.service.api-administration.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.service.api-archive.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.service.api-diary.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.service.api-signing.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.service.api.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.service.archive-normalizers.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.service.consent-normalizers.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.service.editor-normalizers.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.service.envelope-normalizers.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.service.inbox-normalizers.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.service.model-asset-normalizer.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.service.preview-normalizers.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.service.shared.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.service.transport.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.service.ts`
- `modules/shared/assinatura-eletronica/diary-pdf-semantic-manifest.ts`
- `modules/shared/assinatura-eletronica/diary-signature-client.contract.test.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.apply.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.drawing.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.inspection.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.legacy-renderer.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.roles.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.semantic-placement.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.server.artifacts.test.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.server.core.test.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.server.fixtures.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.server.geometry.test.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.server.semantic.test.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.server.test.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.server.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.template-renderer.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.template.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.types.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.validation.ts`
- `modules/shared/assinatura-eletronica/signature-stamp-template.constants.ts`
- `modules/shared/assinatura-eletronica/signature-stamp-template.geometry.test.ts`
- `modules/shared/assinatura-eletronica/signature-stamp-template.geometry.ts`
- `modules/shared/assinatura-eletronica/signature-stamp-template.normalization.ts`
- `modules/shared/assinatura-eletronica/signature-stamp-template.test.ts`
- `modules/shared/assinatura-eletronica/signature-stamp-template.ts`
- `modules/shared/assinatura-eletronica/signature-stamp-template.validation.test.ts`
- `modules/shared/assinatura-eletronica/useElectronicSignatureActionModal.ts`
- `modules/shared/assinatura-eletronica/useElectronicSignatureDialogFocus.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-assets.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-back-cover-assets.test.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-back-cover-assets.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-contracts.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-diary-signature-slots.test.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-diary-signature-slots.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-final-assets.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-finalization-watermark.test.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-finalization.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-original-assets.test.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-original.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-participant-validation.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-receipt-watermark-assets.test.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-signature-geometry.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifacts-request-geometry.tests.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifacts-snapshot-original.tests.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifacts.test.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifacts.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/supabase-adapter-manifest.test.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/supabase-adapter-manifest.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/supabase-adapter-normalization.tests.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/supabase-adapter-normalizers.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/supabase-adapter-receipt-watermark.test.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/supabase-adapter-receipt-watermark.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/supabase-adapter-storage.tests.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/supabase-adapter-support.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/supabase-adapter.test.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/supabase-adapter.ts`
- `supabase/migrations/20260823170000_require_distinct_diary_professor_coordinator.sql`
- `supabase/migrations/20260823170100_merge_coordination_into_professor_portal.sql`
- `supabase/migrations/20260823170200_approve_matriz_diary_signature_policy.sql`
- `supabase/migrations/20260823170300_allow_legacy_source_uuids_in_diary_snapshot.sql`
- `supabase/migrations/20260823170400_allow_missing_institutional_email_in_diary_snapshot.sql`
- `supabase/migrations/20260823170500_fix_gestao_academic_progress_numeric_contract.sql`
- `supabase/migrations/20260823170600_expand_polo_institutional_data_for_official_documents.sql`
- `supabase/migrations/20260823170700_add_diary_signature_positions_to_templates.sql`
- `supabase/migrations/20260823170800_freeze_diary_back_cover_assets_manifest_v2.sql`
- `supabase/migrations/20260823170900_fix_merged_professor_profile_scope_ambiguity.sql`
- `supabase/migrations/20260823171000_allow_diary_back_cover_semantic_manifest_v2.sql`
- `supabase/migrations/20260823171100_separate_diary_receipt_watermark_snapshot.sql`
- `supabase/migrations/20260823171200_validate_diary_back_cover_geometry.sql`
- `supabase/tests/assinatura_eletronica_watermark_presentation.contract.test.ts`
- `supabase/tests/diary_back_cover_asset_manifest_v2.contract.test.ts`
- `supabase/tests/diary_coordination_professor_access_approval.contract.test.ts`
- `supabase/tests/diary_document_model_fidelity.contract.test.ts`
- `supabase/tests/diary_receipt_watermark_separation.contract.test.ts`
- `supabase/tests/diary_semantic_manifest_v2.contract.test.ts`
- `supabase/tests/gestao_academic_progress_numeric_contract.contract.test.ts`
