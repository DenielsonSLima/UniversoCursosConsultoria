# Carência da prova e período dos certificados EAD

Data de trabalho · 28/11/2026  
Versão · 4.8.375, revisão 384
Estado · Publicação autorizada com ativação em duas etapas

## Etapas

1. Registrar no banco o primeiro acesso autorizado à sala, por matrícula. A prova exige 168 horas decorridas ou antecipação da Secretaria. A correção continua sujeita aos pré-requisitos, à nota e às regras de acesso do curso. O catálogo mostra os metadados da prova, e as questões ficam no cofre acadêmico.
2. Incluir **Secretaria → Provas EAD**. A lista paginada mostra as matrículas em carência no polo. A antecipação exige a permissão específica e grava matrícula, motivo, usuário e horário. O servidor valida o polo tanto na consulta quanto na gravação.
3. Exibir início, conclusão e emissão no modelo de certificado EAD. A emissão nova usa o período registrado pelo banco. A retificação individual oferece a auditoria vinculada ao aluno e ao curso ou uma referência documental conferida. A substituição preserva o registro anterior e gera outro código de validação em uma transação.

## Conferência histórica

- 35 certificados finalizados com código ativo e snapshot correspondente.
- Para os 35, a primeira alteração de progresso anterior à aprovação foi localizada na auditoria da conta do aluno. A criação do certificado confirmou a hora da aprovação.
- Em seis registros, o dia da aprovação no horário de Sergipe difere da data gravada em UTC. Em 27 registros, primeira atividade conhecida e aprovação ocorreram no mesmo dia em Sergipe.

## Sequência de publicação

- Disponibilizar `ead_start_study` antes da interface que chama a função. Coordenar o Portal do Aluno com a retirada das questões do catálogo, pois a versão anterior do portal buscava as questões diretamente ali em cursos sem revisão.
- Conferir a lista por polo, a antecipação e o envio da prova com perfis separados. Conferir o modelo em **Modelos Documentos** e a emissão nos fluxos da Secretaria e do aluno.
- Após a conferência do ambiente, a Secretaria pode revisar o período de cada certificado e confirmar a retificação. A confirmação revoga o código anterior.

## Validação

- Banco PostgreSQL isolado, testes de política, autenticação, prazo, exceção, catálogo, editor, prévia histórica e retificação.
- Navegação e formulários exercitados com componentes reais e transporte sintético. TypeScript e build Vite aprovados.
- Frente e verso do PDF vetorial renderizados com dados sintéticos e a geometria do modelo aplicado. A extração confirmou o período, a data de emissão e a grade, com os recursos visuais separados. O smoke com sessão autenticada fica para a implantação.
- O verificador de linhas do checkout aponta 15 caminhos de lotes anteriores ausentes. A conferência dos arquivos deste lote é feita pelo manifesto abaixo.

## Registro da preparação no Supabase

As funções de início, Secretaria e certificação foram instaladas antes do deploy. IDs no ledger remoto, preservados os nomes das fontes no manifesto.

- Início de estudo · `20261128130723`
- Gestão de carência · `20261128130754`
- Evidência histórica · `20261128130756`
- Período da emissão · `20261128130758`
- Retificação · `20261128130801`
- Preservação da validação pública · `20261128130803`

## Manifesto explícito

- `.github/workflows/ead-trust-access.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-28-provas-e-certificados-ead.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-12-versao-4-8-305.md`
- `internal/versioning/system-version.json`
- `modules/aluno/cursos/components/EadCourseRoom.tsx`
- `modules/aluno/cursos/components/EadQuizPanel.tsx`
- `modules/aluno/cursos/cursosPage.types.ts`
- `modules/aluno/cursos/eadAssessmentRevision.ts`
- `modules/aluno/cursos/eadTrustLearning.interaction.test.mjs`
- `modules/aluno/cursos/hooks/useEadLearning.ts`
- `modules/aluno/cursos/hooks/useEadStudyProgress.ts`
- `modules/gestor/cadastros/modelos-documentos/diploma/components/DiplomaElementProperties.tsx`
- `modules/gestor/cadastros/modelos-documentos/diploma/components/DiplomaPreview.tsx`
- `modules/gestor/cadastros/modelos-documentos/diploma/components/diploma-preview.blocks.ts`
- `modules/gestor/cadastros/modelos-documentos/diploma/components/diploma-preview.model.ts`
- `modules/gestor/cadastros/modelos-documentos/diploma/components/diploma-preview.normalization.ts`
- `modules/gestor/cadastros/modelos-documentos/diploma/diploma.service.ts`
- `modules/gestor/secretaria/SecretariaPage.tsx`
- `modules/gestor/secretaria/certificados/SecretariaCertificadosPage.tsx`
- `modules/gestor/secretaria/certificados/certificados.queries.ts`
- `modules/gestor/secretaria/certificados/certificados.service.ts`
- `modules/gestor/secretaria/certificados/certificados.types.ts`
- `modules/gestor/secretaria/certificados/certificate-identity-snapshot.test.mjs`
- `modules/gestor/secretaria/certificados/certificate-identity-snapshot.ts`
- `modules/gestor/secretaria/certificados/components/EadCertificateBlock.tsx`
- `modules/gestor/secretaria/certificados/components/EadCertificatePeriodCorrection.tsx`
- `modules/gestor/secretaria/certificados/components/certificado-preview.utils.ts`
- `modules/gestor/secretaria/certificados/components/ead-certificate-template.test.mjs`
- `modules/gestor/secretaria/certificados/ead-certificates.ui.fixture.mjs`
- `modules/gestor/secretaria/certificados/ead-certificates.ui.test.mjs`
- `modules/gestor/secretaria/certificados/ead-identity.integration.test.mjs`
- `modules/gestor/secretaria/components/SecretariaDashboard.tsx`
- `modules/gestor/secretaria/historico-emissoes/components/EmissionDocumentPages.tsx`
- `modules/gestor/secretaria/historico-emissoes/ead-history-pdf.ts`
- `modules/gestor/secretaria/provas-ead/ProvasEadReleaseForm.tsx`
- `modules/gestor/secretaria/provas-ead/SecretariaProvasEadPage.tsx`
- `modules/gestor/secretaria/provas-ead/provas-ead.interaction.test.mjs`
- `modules/gestor/secretaria/provas-ead/provas-ead.service.ts`
- `modules/gestor/secretaria/provas-ead/useProvasEad.ts`
- `modules/gestor/secretaria/secretaria-access.ts`
- `scripts/ead-catalog/publication-sql.mjs`
- `scripts/ead-catalog/publication.test.mjs`
- `supabase/migrations/20261128130000_ead_study_periods.sql`
- `supabase/migrations/20261128130010_ead_quiz_release_guard.sql`
- `supabase/migrations/20261128130015_protect_ead_quiz_questions.sql`
- `supabase/migrations/20261128130020_secretaria_ead_quiz_wait.sql`
- `supabase/migrations/20261128130030_ead_historical_study_evidence.sql`
- `supabase/migrations/20261128130040_freeze_ead_certificate_study_period.sql`
- `supabase/migrations/20261128130050_rectify_ead_certificate_study_period.sql`
- `supabase/migrations/20261128130051_preserve_ead_rectification_public_snapshot.sql`
- `supabase/migrations/20261128130060_add_period_to_institutional_ead_certificate_model.sql`
- `supabase/tests/ead_certificate_period.isolated.test.mjs`
- `supabase/tests/ead_historical_study_evidence.isolated.test.mjs`
- `supabase/tests/ead_quiz_release.isolated.test.mjs`
- `supabase/tests/secretaria_ead_quiz_wait.isolated.test.mjs`

Total: 58 arquivos.
