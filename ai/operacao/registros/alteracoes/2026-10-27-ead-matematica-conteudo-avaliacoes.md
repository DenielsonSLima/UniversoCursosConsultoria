# Matemática EAD: conteúdo, atividades e avaliações
Data: 27/10/2026. Estado: EM VALIDAÇÃO. Candidato: 4.8.240/revisão 249.

## Pedido e autorização
O responsável solicitou três agentes, pesquisa real, reunião, correção e publicação autorizada. Confirmou Matemática Básica como reforço para estudantes, com operações, frações, porcentagem e geometria. Escopo restrito a Matemática Básica (80h) e Matemática para Enem (160h).

## Critérios de aceite
- Aulas próprias e substantivas, fontes institucionais identificadas, exemplos resolvidos e prática com conferência.
- Atividade específica em cada aula e prova que mede as habilidades ensinadas; gabaritos e resoluções conferidos.
- Material Básica destinado a estudantes; Enem com problemas matemáticos contextualizados, sem perguntas de redação ou conduta genérica.
- Preservar registros anteriores; mudança de progresso exige confirmação explícita do aluno.
- Proteger gabaritos e resoluções antes da resposta; documentos emitidos e notas aprovadas permanecem preservados.
- Banco somente MCP Supabase; branch, commit, PR e merge somente MCP GitHub. Produção autorizada neste pedido.
- Validar contratos, pacote real, smoke Safari, build e readback remoto. Nenhuma operação financeira ou revisão de notas individuais.

## Etapas
1. Diagnóstico publicado confirmado: provas genéricas, associação por posição, textos repetidos e erros didáticos.
2. Pesquisa e autoria: concluídas, com fontes e cobertura em docs/ead/revisao-matematica-basica.md e revisao-matematica-enem.md.
3. Reunião dos três agentes: revisão cruzada de 38 gabaritos e discussão de histórico, divulgação das respostas e certificado legado pendente.
4. Implementação: 11 aulas, 45 exemplos/simulados resolvidos, 65 treinos, 11 atividades e 27 questões finais. Mesmos cursos e cargas; IDs acadêmicos novos.
5. Validação local: 45 testes, ESLint focado e build com Node 24.22.1 aprovados.
6. Publicação: pendente; infraestrutura de versões → interface compatível → conteúdo V2.
7. Conferência final: pendente.

## Decisões e revisão crítica
- As duas fontes são reforço/revisão matemática; a curadoria não afirma esgotar toda a matriz do Enem nem reproduzir TRI.
- O PDF atual do INEP foi identificado, mas sua abertura retornou 502. Trechos indexados e documento institucional anterior sustentam os códigos citados; a limitação está explícita na pesquisa.
- Os vídeos antigos não tiveram alinhamento comprovado. O novo pacote usa aulas textuais e trilhas abertas e dispensa vídeo obrigatório; não publica vídeo inventado.
- Versões privadas por curso prendem trabalho/tentativa existente à configuração correspondente. Registros vazios seguem a revisão atual e prendem a versão na primeira interação.
- A troca confirmada arquiva integralmente o progresso anterior, sem transferir respostas para IDs novos. Notas aprovadas, certificados e replays anteriores permanecem na sua versão.
- O emissor de certificado pendente usa o currículo efetivamente aprovado. Não altera compositor, modelo, PDF ou documento já emitido.
- A revisão encontrou vazamento por explicações detalhadas: resoluções foram segregadas do catálogo e só aparecem no feedback autoritativo após a resposta.
- O agente de interface encontrou atividade clicável durante troca; controles/handlers passam a bloquear enquanto a revisão está pendente.
- O importador legado não foi refatorado; a guarda do banco impede sobrescrever curso revisionado sem preservar/publicar nova revisão acadêmica.
- O repositório foi confirmado público. Fontes de avaliações e migrations de dados não incluem gabaritos nem resoluções. Pacotes completos são reservados por MCP em tabela privada com RLS e sem grants; a migration consome o pacote na mesma transação e o elimina da reserva. CI usa chaves sintéticas; conferência local usa arquivo privado fora do repositório.
- Snapshots de produção e saídas geradas de QA ficam em tmp; não são indexados nem fazem parte do lote.
- Migration financeira paralela 20261027222000_resume_service_fee_exact_get.sql preservada e excluída deste manifesto.

## Validação
- Conteúdo: três testes públicos de fontes, cobertura, carga e IDs; cálculos conferidos na revisão cruzada e nas checagens numéricas locais anteriores à separação dos gabaritos.
- Execução/feedback/interface: 33 testes focados aprovados.
- PostgreSQL isolado: oito cenários de versões, permissões, histórico, certificados, gabaritos e resoluções.
- Pacotes reais: publicação dos dois cursos em banco isolado; percurso completo da Básica até prova 100% e arquivo histórico confirmado.
- Safari local com componentes reais e RPC sintética: consulta sem alteração; confirmação inicialmente desabilitada; falha preserva histórico; nova tentativa confirma V2 com uma única cópia arquivada e quinze questões.
- Sessão Safari disponível é de gestor; o smoke local não é declarado uma submissão autenticada de aluno real.
- ESLint focado e build completo com Node 24.22.1: aprovados. Manifesto atual: 49 arquivos, todos abaixo de 500 linhas (máximo 491).
- check:file-lines global executado: 36 falhas por arquivos/manifestos históricos ausentes neste checkout local antigo; nenhuma violação no manifesto atual. Não se alteraram arquivos de outros lotes para contornar esse estado; CI remoto verificará o checkout atual de main.
- CI, ledger, readback e acesso servido: pendentes.

## Manifesto explícito
- `content/ead/matematica-basica/assessments.mjs`
- `content/ead/matematica-basica/index.mjs`
- `content/ead/matematica-basica/lesson-01.mjs`
- `content/ead/matematica-basica/lesson-02.mjs`
- `content/ead/matematica-basica/lesson-03.mjs`
- `content/ead/matematica-basica/lesson-04.mjs`
- `content/ead/matematica-basica/lesson-05.mjs`
- `content/ead/matematica-basica/sources.mjs`
- `content/ead/matematica-enem/assessments.mjs`
- `content/ead/matematica-enem/index.mjs`
- `content/ead/matematica-enem/lessons.mjs`
- `content/ead/matematica-enem/sources.mjs`
- `scripts/ead-mathematics/generate-publication.mjs`
- `scripts/ead-mathematics/publication.test.mjs`
- `scripts/ead-mathematics/revision-model.mjs`
- `scripts/ead-mathematics/revision-model.test.mjs`
- `scripts/ead-mathematics/serve-ui-smoke.mjs`
- `docs/ead/revisao-matematica-basica.md`
- `docs/ead/revisao-matematica-enem.md`
- `modules/aluno/cursos/cursosPage.types.ts`
- `modules/aluno/cursos/eadAssessmentRevision.ts`
- `modules/aluno/cursos/eadAssessmentRevision.test.ts`
- `modules/aluno/cursos/eadAssessmentRevision.ui.fixture.tsx`
- `modules/aluno/cursos/hooks/useEadAssessmentRevision.ts`
- `modules/aluno/cursos/hooks/useEadLearning.ts`
- `modules/aluno/cursos/components/EadRevisionNotice.tsx`
- `modules/aluno/cursos/components/EadLessonArticle.tsx`
- `modules/aluno/cursos/components/EadLearningContent.tsx`
- `modules/aluno/cursos/components/EadCourseRoom.tsx`
- `modules/aluno/cursos/components/EadQuizPanel.tsx`
- `modules/aluno/cursos/components/EadActivitiesPanel.tsx`
- `supabase/tests/ead_assessment_revision.harness.mjs`
- `supabase/tests/ead_assessment_revision.isolated.test.mjs`
- `supabase/migrations/20261027223040_start_ead_assessment_revision.sql`
- `supabase/migrations/20261027223060_protect_math_ead_revision_explanations.sql`
- `supabase/migrations/20261027223110_publish_math_enem_revision.sql`
- `supabase/migrations/20261027223020_correct_ead_progress_by_revision.sql`
- `supabase/migrations/20261027223010_resolve_ead_progress_revision.sql`
- `supabase/migrations/20261027223100_publish_math_basic_revision.sql`
- `supabase/migrations/20261027223000_create_math_ead_revision_registry.sql`
- `supabase/migrations/20261027223050_preserve_ead_certificate_revision.sql`
- `supabase/migrations/20261027223030_validate_ead_mutations_by_revision.sql`
- `.github/workflows/ead-mathematics-revision.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-27-ead-matematica-conteudo-avaliacoes.md`
Total: 49 arquivos.

## Publicação e evidências remotas
Pendentes. Registrar versões do ledger, commit, PR, Preview, implantação de produção e readback sanitizado sem dados pessoais.

