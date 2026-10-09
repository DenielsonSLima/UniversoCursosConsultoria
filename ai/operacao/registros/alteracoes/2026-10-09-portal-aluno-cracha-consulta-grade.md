# Portal do aluno: crachá, consulta da carteirinha e dias das disciplinas

Versão: 4.8.192. Base: cd6a2641b99e7a3ca77a6b25ce1c8793dc3cae66.
Escopo autorizado: três correções relatadas pelo usuário, divididas entre três agentes,
com revisão cruzada e publicação pelo fluxo GitHub/Vercel.

## Resultado e causas

- O crachá chamava a impressão do HTML da tela e não tinha download PDF próprio.
  Agora usa o compositor vetorial existente com formato CR80 vertical, modelo atual,
  fundo, foto e QR. Prévia, baixar PDF e imprimir compartilham o mesmo Blob.
  Recursos incompletos, código ausente ou falha de validação bloqueiam a entrega.
  Datas e validade vêm do backend; não há nova regra de cálculo no frontend.
- A consulta CIE intersectava os campos selecionados na emissão antiga com a política
  atual. Campos adicionados depois ficavam impossibilitados de aparecer.
  A consulta agora aplica a política atual à CIE, preenchendo os campos disponíveis
  e usando as máscaras canônicas. Snapshots, código, datas e contadores permanecem
  imutáveis. Campos removidos deixam de aparecer; demais documentos preservam o contrato.
- As linhas das disciplinas não tinham ação de expansão. Agora cada disciplina abre
  os dias cadastrados em aulas_turma, usando a mesma origem do diário/agenda.
  Consulta e cache são isolados por aluno, matrícula e turma, com cancelamento,
  rejeição de dados de outra turma, retry, estados de ausência e acesso por teclado.

## Backend e segurança

Migration aplicada via MCP Supabase em 2026-10-09:
`20261009145431_carteirinha_current_public_policy`.
O helper interno é SECURITY INVOKER, search_path vazio e sem EXECUTE para anon/authenticated.
O wrapper público existente mantém seus controles e apenas três expressões CIE mudam.
Consulta real de uma emissão v1 confirmou resposta v2 com os três novos campos mascarados.
Permissões públicas do wrapper e proibição do helper foram conferidas em banco e no teste.
Comparação dos advisors por achado/metadata: 657 antes e depois, sem achados novos.
Nenhum cadastro, emissão, política salva, consentimento ou registro acadêmico foi alterado.

## Validação

- Crachá: 4 testes de navegador controlado, download e impressão com Blob único,
  verso opcional, falhas de ativos/validação e atualização do modelo.
- Modelo configurado real: 1 teste adicional com recursos visuais reais e dados
  sintéticos; frente e verso do PDF renderizados e inspecionados.
- Carteirinha horizontal: 9 testes existentes passaram após extensão do compositor.
- Grade: 6 testes de interação, teclado/mobile, erro/retry, escopo e resposta atrasada.
- SQL: 8 testes passaram executando a migration real em PostgreSQL isolado (PGlite),
  incluindo máscaras, política atual, remoções, nulls, snapshots imutáveis,
  validade/revogação e EXECUTE conforme o papel.
- Consulta pública: 2 testes do mapper/componente reais, exibindo e ocultando campos.
- ESLint dos arquivos do lote, versão e teto de 500 linhas passaram no fechamento.
- CI confirmou TypeScript, lint global e os manifestos completos. O contrato antigo
  foi atualizado para aceitar SET search_path TO vazio e ACL preservada por
  CREATE OR REPLACE, com 6 testes mantendo as guardas contra privilégios amplos.
- O teste de impressão usa Chromium completo; headless-shell não inclui visualizador
  PDF. O clique real e a espera pelo carregamento continuam obrigatórios.
- Build completo, suíte de CI e Preview compõem a porta de publicação.

## Limitações e publicação

O checkout local é seletivo: a checagem global de manifestos históricos depende do CI
completo. Navegador autenticado Safari e impressora física não estão disponíveis;
as interações foram exercitadas em Chromium controlado com dados sintéticos.
Os PDFs e imagens de validação são temporários e não integram este manifesto.
As notificações permanecem com sua lógica existente; agenda e grade usam aulas_turma.

## Manifesto explícito

Total: 30 arquivos.

- `.github/workflows/student-card-pdf.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-09-portal-aluno-cracha-consulta-grade.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/aluno/secretaria/SecretariaPage.tsx`
- `modules/aluno/secretaria/components/AlunoIdentityDocuments.tsx`
- `modules/aluno/secretaria/components/InternshipBadgeDocument.tsx`
- `modules/aluno/secretaria/components/StudentCardPrintDialog.tsx`
- `modules/aluno/secretaria/internship-badge.browser.fixture.mjs`
- `modules/aluno/secretaria/internship-badge.browser.test.mjs`
- `modules/aluno/secretaria/useInternshipBadgePdf.ts`
- `modules/aluno/turmas/components/TurmaDetail.tsx`
- `modules/aluno/turmas/components/turma-detail/AcademicSummaryTab.tsx`
- `modules/aluno/turmas/components/turma-detail/CurriculumDisciplineSection.tsx`
- `modules/aluno/turmas/curriculum-days.ui.fixture.mjs`
- `modules/aluno/turmas/curriculum-days.ui.test.mjs`
- `modules/aluno/turmas/hooks/useAlunoClassSchedule.ts`
- `modules/aluno/turmas/hooks/useAlunoTurmasData.ts`
- `modules/aluno/turmas/turmas.types.ts`
- `modules/gestor/cadastros/modelos-documentos/cracha/components/CrachaPreview.tsx`
- `modules/public/validator/carteirinha/current-policy.rendering.test.mjs`
- `modules/shared/pdf/student-card/index.ts`
- `modules/shared/pdf/student-card/render.ts`
- `supabase/migrations/20261009145431_carteirinha_current_public_policy.sql`
- `supabase/tests/carteirinha_current_policy.isolated.test.mjs`
- `supabase/tests/document_validation_effective_rpc.contract.test.ts`
- `supabase/tests/fixtures/carteirinha-current-policy-helpers.sql`
- `supabase/tests/fixtures/carteirinha-current-policy-schema.sql`
