# Portal do professor: mobile e atualização automática

Pedido iniciado em 13/11/2026 (America/Maceio).
Status: publicado em produção em 14/11/2026: 4.8.339 estável, revisão 348. PR #429 integrada, deploy READY e versão do bundle confirmada no domínio. Smoke autenticado do Professor permanece pendente.
Escopo: todo acesso depois do login, incluindo menu lateral/móvel, polo, Início, Disciplinas/diários, Plano de Curso, Assinaturas, Agenda, Financeiro, Biblioteca, Comunicação e Perfil. Consolida também o cadastro/perfil docente do Gestor já implementado neste fluxo.

## Contratos e decisões

- Layout prioriza 360/390 px, áreas de toque de 44 px e campos de 16 px. Desktop preserva todas as ações.
- Professor continua usando diário canônico da Gestão. Frequência, notas, REC e conteúdo reaproveitam dados/handlers/permissões; resultados não são recalculados no frontend.
- Preparar aulas significa editar conteúdo futuro nas datas/cargas definidas pela Gestão; não cria permissão para reagendar encontros.
- Plano de Curso foi dividido em editor no fluxo normal e prévia institucional. Compositor PDF, snapshot, revisão-base e bloqueios preservados.
- TanStack Query+Realtime, invalidação por escopo e reconexão automática. Sem botões manuais de atualização. Regra solicitada registrada em lote operacional separado.
- Quatro migrations aplicadas pelo MCP em 14/11/2026: 2 de dossiê privado, 1 de leitura financeira do Gestor e 1 de sinais privados de financeiro/assinaturas do Professor. Fontes alinhadas às versões reais sem alterar os corpos SQL; pós-checagem remota de permissões aprovada.
- Novos sinais não transportam valores, conteúdo de documentos ou imagem de assinatura; RLS existente restringe audiência.

## Manifesto explícito

- `modules/gestor/components/GestorModuleContent.tsx`
- `modules/gestor/parceiros/ParceirosPage.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDetalhes.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorTurmas.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-turmas.service.ts`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-profile.css`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-turmas.service.test.mjs`
- `modules/gestor/parceiros/components/formularioparceiros/professor/ParceiroProfessorForm.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/professor/ProfessorPersonalStep.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/professor/professor-registration.css`
- `modules/gestor/parceiros/components/formularioparceiros/professor/professor-form.interaction.test.mjs`
- `modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDados.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-dados.css`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-dados.interaction.test.mjs`
- `modules/gestor/parceiros/partner-email-update.interaction.test.mjs`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-profile.interaction.test.mjs`
- `modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorFinanceiro.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-financeiro.query.ts`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-financeiro.query.test.ts`
- `modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDocumentos.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/ProfessorDocumentoDialog.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/ProfessorDocumentoCard.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/ProfessorDocumentoForms.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-documentos.presentation.ts`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-documentos.service.ts`
- `supabase/migrations/20261114033433_professor_private_dossier_schema.sql`
- `supabase/migrations/20261114033440_professor_private_dossier_rpc.sql`
- `supabase/migrations/20261114033449_professor_gestor_financeiro_read.sql`
- `supabase/tests/professor_private_dossier.fixture.ts`
- `supabase/tests/professor_private_dossier.isolated.test.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-13-professores-gestor-layout-abas.md`
- `modules/gestor/parceiros/components/viewparceiros/professor/professor-documentos.service.test.mjs`
- `supabase/tests/professor_gestor_financeiro.isolated.test.mjs`
- `modules/professor/turmas/TurmasPage.tsx`
- `modules/professor/turmas/ProfessorAssignmentCard.tsx`
- `modules/professor/turmas/professor-turmas.css`
- `modules/professor/turmas/testing/academic-mobile.test-fixture.tsx`
- `modules/professor/turmas/professor-academic-mobile.interaction.test.mjs`
- `modules/professor/hooks/useProfessorDisciplinas.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/TechnicalDataError.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaEstagio.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/atividades-extra/AtividadesExtraClasse.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioClasse.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioClasseHeader.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioClasseTabs.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioFrequenciaTab.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioResultadoTab.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioConteudoTab.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/DiarioHistoricoBoundary.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/mobile/DiarioFrequenciaMobile.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/mobile/DiarioResultadoMobile.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/mobile/DiarioConteudoMobile.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/mobile/professor-diary-mobile.css`
- `modules/professor/plano-curso/PlanoCursoPage.tsx`
- `modules/professor/plano-curso/plano-curso-professor-ui.contract.test.ts`
- `modules/professor/plano-curso/PlanoCursoAssignmentList.tsx`
- `modules/professor/plano-curso/PlanoCursoDayEditorRow.tsx`
- `modules/professor/plano-curso/PlanoCursoEditorForm.tsx`
- `modules/professor/plano-curso/PlanoCursoInstitutionalPreview.tsx`
- `modules/professor/plano-curso/PlanoCursoTextArea.tsx`
- `modules/professor/plano-curso/usePlanoCursoEditor.ts`
- `modules/professor/plano-curso/plano-curso.presentation.tsx`
- `modules/professor/plano-curso/plano-curso-mobile-render.test.mjs`
- `modules/shared/plano-curso/plano-curso.contract.test.mjs`
- `modules/professor/financeiro/FinanceiroPage.tsx`
- `modules/professor/financeiro/FinanceiroFilters.tsx`
- `modules/professor/financeiro/ProfessorFinanceiroReceiptModal.tsx`
- `modules/professor/financeiro/financeiro.queries.ts`
- `modules/professor/financeiro/useProfessorFinanceRealtime.ts`
- `modules/professor/components/professor-pages.css`
- `modules/professor/biblioteca/BibliotecaPage.tsx`
- `modules/professor/assinaturas/ProfessorAssinaturasPage.tsx`
- `modules/professor/assinaturas/useProfessorSignatureRealtime.ts`
- `modules/professor/calendario/CalendarioProfessorPage.tsx`
- `modules/professor/professor.page.tsx`
- `modules/gestor/calendario/components/AgendaWorkspace.tsx`
- `modules/shared/assinatura-eletronica/ElectronicSignatureInbox.tsx`
- `supabase/migrations/20261114033458_professor_finance_signature_signals.sql`
- `supabase/tests/professor_finance_signature_signals.isolated.test.mjs`
- `ai/operacao/politicas/INTERFACE.md`
- `ai/operacao/MEMORIA_CANONICA.md`
- `ai/operacao/skills/universo-interface-compacta/SKILL.md`
- `docs/design/interface-compacta.md`
- `ai/operacao/registros/alteracoes/2026-11-13-regra-atualizacao-automatica.md`
- `modules/professor/components/ProfessorShell.tsx`
- `modules/professor/components/ProfessorMobileBottomNav.tsx`
- `modules/professor/components/professor-shell.css`
- `modules/professor/components/professor-screens.css`
- `modules/professor/components/professor-portal.interaction.test.mjs`
- `modules/professor/inicio/InicioPage.tsx`
- `modules/professor/inicio/ProfessorHomeLists.tsx`
- `modules/professor/inicio/useProfessorHomeRealtime.ts`
- `modules/professor/perfil/PerfilPage.tsx`
- `modules/professor/perfil/ProfessorProfileData.tsx`
- `modules/professor/perfil/ProfessorProfileSecurity.tsx`
- `modules/professor/perfil/professor-profile.model.ts`
- `modules/professor/perfil/useProfessorProfileRealtime.ts`
- `modules/professor/perfil/ProfessorSignaturePanel.tsx`
- `modules/professor/comunicacao/ComunicacaoPage.tsx`
- `modules/professor/comunicacao/ProfessorChatList.tsx`
- `modules/professor/comunicacao/ProfessorChatThread.tsx`
- `modules/professor/comunicacao/ProfessorMessageComposer.tsx`
- `modules/professor/comunicacao/ProfessorNewChatModal.tsx`
- `modules/professor/comunicacao/professor-chat.css`
- `modules/gestor/biblioteca/components/UploadModal.tsx`
- `modules/gestor/biblioteca/components/biblioteca-upload.css`
- `ai/operacao/registros/alteracoes/2026-11-13-professor-portal-mobile.md`

- `modules/gestor/biblioteca/components/library-upload.behavior.test.mjs`
- `.github/workflows/professor-portal-contracts.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-08-versoes-4-8-270-a-271.md`

- `modules/shared/realtime/realtime-canonical.contract.test.ts`
- `supabase/tests/professor_financial_portal.contract.test.ts`

Total: 116 arquivos.

## Validação

- Entrega de revisão: [PR #429](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/429), branch `codex/professor-portal-mobile-20261113`, candidato `4.8.339-rc.1`.
- CI específica do Professor passou no GitHub. Contratos legados de chat/financeiro atualizados para a captura de conversa e recuperação automática, sem voltar a exigir recarga manual.
- Biblioteca: 15 testes passaram com as mesmas guardas de publicação, verificando erro inline. Regressões novas do professor integradas em workflow próprio sem credenciais nem I/O em produção.
- Checagem remota de histórico exigiu avanço de versão; acrescentado RC, preservadas integralmente as entradas publicadas e arquivadas 4.8.270–271 para cumprir o teto de linhas.

- Gestor local autenticado: perfil compacto, seleção por teclado e cancelamento de edição, vínculos reais consultados. Documentos/Financeiro detectaram migrations ainda não instaladas no banco conectado.
- Usuário escolheu continuar testes sintéticos após expiração da sessão local; nenhuma nota, frequência, assinatura ou pagamento real gravado.
- Safari com componentes reais em 360/390 px e navegação em 1280 px: menu/drawer, navegação inferior, nove módulos, identificação do polo, perfil/edição/cancelamento, conversa e retorno, Biblioteca/envio/erro inline, Agenda e caixa de assinaturas conferidos. Notas zero/vazio, gravação ao sair do campo, frequência por sessão manhã/tarde e aproveitamento bloqueado conferidos.
- Conteúdo futuro e Plano de Curso: edição, salvamento sintético, conflito preservando rascunho e modo somente leitura conferidos; datas e cargas seguem a Gestão.
- Financeiro do Professor: filtros/status, paginação e abertura do recibo PDF nativo funcionaram no ensaio. Cartões compactos conferidos novamente em 390 px.
- Dossiê do Gestor com RPCs reais em PGlite: adicionar pendência, upload PDF, prévia, aprovação e histórico passaram, com contadores/status atualizados sem ação de recarga. Financeiro do cadastro retornou fontes reais da fixture e filtrou em aberto no banco.
- Contratos SQL reais testados em PGlite isolado para dossiê, leitura financeira e sinais. Revisão independente das guardas, grants, escopos e chaves concluída sem pendências novas.
- Perfil e navegação: 16 campos, rascunho, falha de gravação, senha, Google, polo por ID, bottomnav e drawer em testes de interação. Filiais com mesmo nome mantêm cidade/UF visíveis no celular.
- Build completo em Node 24.22.1, TypeScript geral e ESLint do manifesto passaram. Teto de 500 linhas e diff whitespace passaram para os 116 arquivos.
- Regressões do Gestor: 22 testes passaram. Portal/contratos/PGlite de sinais: 21 passaram; os 7 testes existentes de sessão/dias do Plano de Curso passaram com Deno --sloppy-imports, além dos 2 testes de renderização. Dossiê e leitura financeira também passaram no PostgreSQL isolado.
- Auditoria de drift contra main 41ff2ba4 (4.8.338): 47 arquivos existentes e 62 novos; registros de Caixa mensal/Dashboard preservados no índice de manifestos.

## Publicação confirmada em 14/11/2026

- Usuário autorizou publicar a PR #429 em produção em 14/11/2026. Versão publicada: `4.8.339`, fase `stable`, revisão `348`, data `2026-11-14`; candidato RC e histórico preservados.
- Quatro migrations aplicadas e pós-checagem remota confirmadas pelo MCP. PR #429 integrada por squash em `a735226868837232b17b16f65175f9b6e8165b87`; árvore idêntica à revisada. 21/21 checks do head estável `1f8a98c8` aprovados.
- Vercel: `dpl_EJf4F2FHguPXpGapiN1YSZzyc7wG`, ambiente production, READY, Vite, build em 56 s; aliases www.universocc.com.br e universocc.com.br atribuídos.
- HTTP público: página inicial e /sistema/login retornaram 200; /assets/main-C_nstLJD.js retornou 200 e identificou 4.8.339 / ESTÁVEL. Vercel não retornou grupos error/fatal do deploy na janela de 10 minutos consultada.
- Conferência autenticada do Professor pendente conforme opção pelos ensaios sintéticos. Nenhuma mutação acadêmica/financeira ou assinatura real foi executada no smoke.
- Pós-checagem: 9 RPCs/helpers, 4 tabelas com RLS, 7 policies, bucket privado, 5 triggers e Realtime conferidos. Sem identidade, helpers retornam false e 2 RPCs negam com `42501`. Advisor: 3 INFO `rls_enabled_no_policy` esperados nas tabelas internas de arquivos/eventos/operações do dossiê, com grants diretos revogados e deny-all intencional; nenhuma policy permissiva adicionada. [Referência do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Ledger das migrations aplicadas

Nomes locais alinhados às versões atribuídas pelo MCP. SHA-256 e bytes de cada corpo SQL conferidos antes/depois da renomeação, sem alteração. Não reaplicar estas migrations.

| Versão local anterior | Versão aplicada | Migration | SHA-256 |
| --- | --- | --- | --- |
| `20261114020500` | `20261114033433` | `professor_private_dossier_schema` | `ab78647885b88f32293e90c157df7acc3930d17e08958c45e588cbfdbc5dba5d` |
| `20261114020510` | `20261114033440` | `professor_private_dossier_rpc` | `90c2219bd40ab8559bd83a684f4796547b134ef39c39373bc9c9a4df4cc999c4` |
| `20261114021000` | `20261114033449` | `professor_gestor_financeiro_read` | `738a8f56382882bb0d0c8d7968a911483c704494431aaf07f2c2b2f697da1a04` |
| `20261114033000` | `20261114033458` | `professor_finance_signature_signals` | `5fe6250a5a3f48a54164548cfb51fb233287da483e691ff2c3136fb5e2d7fd19` |

## Limites e entrega

- Ensaios sintéticos exercitam componentes reais, sem afirmar autenticação/autorizações/latência de produção. Contextos e alunos são fictícios.
- Não assinar, emitir, quitar ou preencher dados acadêmicos reais como parte do smoke.
- GitHub e Supabase somente pelo MCP e manifesto explícito; preservar main 4.8.338 e alterações publicadas de outros lotes. Produção da PR #429 autorizada e concluída; evidências acima distinguem HTTP, contratos e a pendência de sessão autenticada.
- Fixture, API de ensaio, imagens e saídas de build em tmp são regeneráveis e não integram o manifesto.

Regra operacional sincronizada na skill instalada e em nota da memória pessoal. RAG reindexado no fechamento: 15 fontes e 80 trechos. Checks remotos e preview acompanhados na PR.
