# Identidade, naturalidade e nacionalidade do aluno

Estado: VALIDADO — PUBLICAÇÃO EM PRODUÇÃO AUTORIZADA

## Objetivo e aceite

Padronizar cadastro, edição gerencial e perfil do aluno sem impedir o uso de texto livre. Nacionalidade e naturalidade devem sugerir referências oficiais durante a digitação. Nome social permanece opcional e, quando vazio, o nome civil é usado somente na exibição e nos documentos. A CIN usa o CPF como número único; RGs antigos, CNH e registros legados precisam ser preservados sem reclassificação destrutiva.

Ensino Médio, EJA e documentação civil continuam informativos e não bloqueiam a ativação acadêmica de aluno inserido em turma iniciada.

## Decisões de compatibilidade

- Municípios usam o catálogo vigente do IBGE, mas o texto livre continua canônico para localidades históricas ou estrangeiras.
- Países seguem ISO/IBGE; somente gentílicos curados aparecem como sugestão de nacionalidade.
- O literal antigo `CARTEIRA NACIONAL DE IDENTIFICAÇÃO` não é convertido automaticamente, porque foi usado como default em cadastros com RG e CIN misturados.
- A seleção explícita de `CIN — Carteira de Identidade Nacional` exibe o CPF e ignora resíduos de RG em documentos, sem apagar informação legada.
- Novos cadastros não presumem um tipo documental quando a escolha está vazia.

## Manifesto explícito

- `modules/shared/components/EditableCombobox.tsx`
- `modules/shared/components/editable-combobox.utils.ts`
- `modules/shared/components/editable-combobox.utils.test.ts`
- `modules/shared/catalogs/person-reference-catalog.service.ts`
- `modules/shared/utils/personDisplayName.ts`
- `modules/shared/utils/personDisplayName.test.ts`
- `modules/shared/utils/technicalEnrollmentRequirements.ts`
- `modules/shared/utils/technicalEnrollmentRequirements.test.ts`
- `modules/shared/utils/studentIdentityDocument.ts`
- `modules/shared/utils/studentIdentityDocument.test.ts`
- `modules/shared/utils/studentIdentityCatalogs.contract.test.ts`
- `modules/shared/document-validation/document-validation-url.test.ts`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoFormStepPersonal.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoFormStepDocuments.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoForm.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/parceiro-aluno-form.types.ts`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/parceiro-aluno-form.constants.ts`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoPersonalSection.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDados.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetailsSections.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/parceiro-aluno-dados.utils.ts`
- `modules/gestor/parceiros/components/cards/AlunoCard.tsx`
- `modules/gestor/parceiros/utils/parceiro-mappers.ts`
- `modules/gestor/parceiros/utils/parceiro-mappers.test.ts`
- `modules/aluno/perfil/PerfilDadosTab.tsx`
- `modules/aluno/perfil/PerfilTechnicalSection.tsx`
- `modules/aluno/perfil/usePerfilDadosForm.ts`
- `modules/aluno/perfil/perfil.types.ts`
- `modules/aluno/perfil/perfil-update.service.ts`
- `modules/gestor/secretaria/shared/secretaria-registration-snapshot.ts`
- `modules/shared/secretaria/document-template.helpers.ts`
- `modules/gestor/cadastros/ficha-matricula/student-template-preview.service.ts`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ficha/FichaAlunoModal.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ficha/FichaAlunoPrintStyles.tsx`
- `modules/gestor/secretaria/declaracao-matricula/SecretariaDeclaracaoMatriculaPage.tsx`
- `modules/gestor/secretaria/declaracao-matricula/SecretariaDeclaracaoDocumentPages.tsx`
- `modules/gestor/secretaria/declaracao-matricula/SecretariaDeclaracaoPrintViewer.tsx`
- `modules/gestor/secretaria/declaracao-matricula/SecretariaDeclaracaoSelection.tsx`
- `modules/gestor/secretaria/declaracao-matricula/declaracao-matricula.helpers.ts`
- `modules/gestor/secretaria/declaracao-matricula/declaracao-matricula.helpers.test.ts`
- `modules/gestor/secretaria/declaracao-matricula/declaracao-matricula.types.ts`
- `modules/gestor/secretaria/declaracao-matricula/declaracao-print-assets.ts`
- `modules/gestor/secretaria/carteirinhas/SecretariaCarteirinhasPage.tsx`
- `modules/aluno/secretaria/SecretariaPage.tsx`
- `modules/gestor/secretaria/historico-emissoes/template-parser.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-registration-snapshot.ts`
- `modules/gestor/secretaria/historico-emissoes/preview-utils.ts`
- `modules/gestor/secretaria/historico-emissoes/components/EmissionDocumentPages.tsx`
- `modules/gestor/secretaria/historico-emissoes/historico-emissoes.types.ts`
- `modules/gestor/secretaria/historico-emissoes/historico-emissoes.service.ts`
- `modules/gestor/secretaria/shared/SecretariaAcademicDocumentPreview.tsx`
- `modules/gestor/secretaria/certificados/certificados.service.ts`
- `modules/gestor/secretaria/certificados/certificados.types.ts`
- `modules/gestor/secretaria/certificados/components/certificado-preview.utils.ts`
- `supabase/migrations/20260927141413_create_geographic_catalogs.sql`
- `supabase/migrations/20260927141429_seed_country_nationality_catalog.sql`
- `supabase/migrations/20260927141432_seed_ibge_municipalities_01.sql`
- `supabase/migrations/20260927141434_seed_ibge_municipalities_02.sql`
- `supabase/migrations/20260927141437_seed_ibge_municipalities_03.sql`
- `supabase/migrations/20260927141439_seed_ibge_municipalities_04.sql`
- `supabase/migrations/20260927141441_seed_ibge_municipalities_05.sql`
- `supabase/migrations/20260927141444_seed_ibge_municipalities_06.sql`
- `supabase/migrations/20260927141446_seed_ibge_municipalities_07.sql`
- `supabase/migrations/20260927141449_seed_ibge_municipalities_08.sql`
- `supabase/migrations/20260927141451_seed_ibge_municipalities_09.sql`
- `supabase/migrations/20260927141454_seed_ibge_municipalities_10.sql`
- `supabase/migrations/20260927141456_seed_ibge_municipalities_11.sql`
- `supabase/migrations/20260927141458_seed_ibge_municipalities_12.sql`
- `supabase/migrations/20260927141502_seed_ibge_municipalities_13.sql`
- `supabase/migrations/20260927141505_normalize_brazilian_nationality.sql`
- `supabase/tests/geographic_catalogs.contract.test.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-27-identidade-naturalidade-cin.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 77 arquivos.

## Validação

- 76/76 testes focados de formulário, mapeamento, nome social, CIN, EJA, catálogos, documentos e contratos SQL aprovados.
- TypeScript global, ESLint focado e build completo de produção aprovados.
- 35 contratos documentais e vetoriais diretamente afetados foram aprovados sem alteração de layout ou marca d'água.
- Um teste amplo do visualizador histórico possui falha paralela fora deste manifesto; o contrato diretamente afetado permanece aprovado.
- Três agentes independentes fizeram a revisão inicial e uma nova reunião de sign-off após os ajustes.
- Produção autorizada explicitamente pelo usuário em 27/09/2026.
- Migrations `20260927141413` a `20260927141505` aplicadas via MCP Supabase; 5.571 municípios, 193 países e 36 gentílicos curados confirmados.
- Quatro constraints estão validadas, o default documental foi removido e os 403 registros com identificação legada permaneceram sem reclassificação.
- RLS e grants remotos foram conferidos: catálogos somente `SELECT`, RPCs somente `EXECUTE`; advisors não apontaram alerta de segurança ligado ao lote.

## Publicação

- Aplicar migrations via MCP Supabase e conferir contagens, constraints, funções, RLS e advisors.
- Publicar somente este manifesto via MCP GitHub, aguardar CI/Vercel, mesclar e executar smoke autenticado sem alterar cadastro real.
