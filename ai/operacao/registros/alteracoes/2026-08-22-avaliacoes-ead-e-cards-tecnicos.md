# Avaliações EAD e cards técnicos autoritativos — 2026-08-22

Data: 2026-08-22

Estado: publicado em Produção na entrega funcional `4.7.0`; dez migrations aplicadas no Supabase e frontend integrado pela PR `#81` no commit `2b6cd0d0aef7b45d7fe2bf38d7ec075575f6eaed`; CI e Vercel aprovados. O fechamento operacional conjunto é versionado como `4.7.1` pela PR `#82`, sem alteração funcional adicional.

## Resultado

As atividades EAD agora preservam o rascunho mais recente, serializam gravações e exibem o retorno autoritativo do servidor. Uma alternativa errada fica identificada em vermelho, a alternativa correta é marcada em verde e a atividade pode ser concluída somente depois da confirmação da RPC. A prova usa exclusivamente a elegibilidade e os totais devolvidos pelo banco, mantém a expiração da retentativa estável e só revela o gabarito após a tentativa ser submetida.

Os gabaritos dos 63 cursos EAD deixaram o JSON público de `cursos` e foram migrados para `internal_academic.ead_assessment_answer_keys`. O Gestor recebe a configuração reconstituída apenas pelas RPCs autorizadas; aluno, conclusão, correção e certificado continuam decididos no banco.

Os cards de Cursos Técnicos mostram o total de disciplinas de cada grade. Os cards de turmas técnicas consomem a fotografia acadêmica canônica da RPC e apresentam `concluídas/total`, sem calcular conclusão no frontend. O transporte divide mais de 200 IDs em lotes de 200 e falha de modo explícito se um lote ou uma linha estiver ausente.

## Etapas executadas

1. Reunião técnica entre as frentes EAD, Supabase/segurança, cards técnicos e testes.
2. Reprodução dos fluxos, revisão dos contratos existentes e definição de invariantes autoritativas.
3. Correção do runtime EAD, feedback visual, salvamento da textarea, retentativa e validação estrita.
4. Cofre privado de gabaritos, serialização das mutações e conclusão idempotente vinculada à matrícula ativa.
5. KPIs de curso e progresso de turma obtidos exclusivamente por RPC, com autorização e batching.
6. Revisão cruzada de TypeScript, SQL, permissões, concorrência, limites de payload e arquivos.
7. Aplicação ordenada em Produção, pós-check remoto e smoke autenticado no Safari.

## Supabase Produção

Projeto: `kfekgwyqozhicpfuunpo`.

- `20260822103822_harden_ead_assessment_mutations.sql` → `20260822140251`.
- `20260822104546_include_course_discipline_count_in_kpis.sql` → `20260822140318`.
- `20260822105339_add_technical_class_completion_counts.sql` → `20260822140337`.
- `20260822114000_create_private_ead_answer_keys.sql` → `20260822152536`.
- `20260822114100_lock_ead_completion_enrollment.sql` → `20260822152545`.
- `20260822114200_add_authoritative_ead_assessment_feedback.sql` → `20260822152553`.
- `20260822114300_serialize_ead_assessment_mutations.sql` → `20260822152601`.
- `20260822114400_sanitize_public_ead_configs.sql` → `20260822152609`.
- `20260822114500_authorize_course_management_kpis.sql` → `20260822152620`.
- `20260822114600_consolidate_authorized_technical_card_progress.sql` → `20260822152627`.

Pós-check remoto:

- 63 cursos EAD, 63 linhas no cofre e nenhuma lacuna.
- Zero alias de gabarito no JSON público.
- 258 respostas de atividades e 630 respostas de prova reconstituídas; 888/888 permanecem numéricas.
- 16/16 verificações de privilégios aprovadas.
- A RPC gerencial devolveu os 63 cursos EAD.
- Os cinco cursos técnicos totalizam 80 disciplinas; os cards exibiram `0`, `27`, `27`, `0` e `26`.
- Nenhum advisor de performance se refere aos objetos novos. Os cinco avisos de segurança relacionados são esperados: são RPCs `SECURITY DEFINER` deliberadamente executáveis por `authenticated`, todas com autorização interna, `search_path` vazio e grants mínimos.

## Validação

- Contratos Deno: 22/22 aprovados.
- Contratos Node focados: 43/43 aprovados; revisão adicional do runtime EAD: 31/31.
- Teste executável de batching e falha integral dos cards: 6/6.
- TypeScript, ESLint focado, formatação Deno, `git diff --check` e build Vite de produção aprovados.
- A contrarrevisão final passou a rejeitar feedback parcial de prova e contagens acadêmicas vazias ou apenas coercíveis, com contratos de regressão específicos.
- Smoke autenticado no Safari: cinco cards técnicos com contagem, gestão de turmas técnicas sem erro no estado vazio, catálogo com 63 cursos EAD e editor de provas com alternativas corretas reconstituídas. Nenhum dado foi salvo durante o smoke.

## Limites verificados

Produção não possui turma técnica nem matrícula/progresso EAD. Por isso, o card de turma com valor real `2/12` e a resposta de uma atividade/prova por um aluno real não foram fabricados para teste. Esses dois fluxos permanecem para o aceite manual do usuário quando houver massa canônica; contratos assíncronos, RPCs, autorização e estados visuais foram cobertos localmente.

## Manifesto explícito

- `modules/aluno/cursos/CursosPage.tsx`
- `modules/aluno/cursos/components/EadCourseRoom.tsx`
- `modules/aluno/cursos/components/EadLearningContent.tsx`
- `modules/aluno/cursos/components/EadActivitiesPanel.tsx`
- `modules/aluno/cursos/components/EadQuizPanel.tsx`
- `modules/aluno/cursos/cursosPage.types.ts`
- `modules/aluno/cursos/cursosPage.utils.ts`
- `modules/aluno/cursos/hooks/useEadLearning.ts`
- `modules/aluno/cursos/eadAssessmentFeedback.ts`
- `modules/aluno/cursos/eadAssessmentFeedback.test.ts`
- `modules/aluno/cursos/eadAssessmentRuntime.ts`
- `modules/aluno/cursos/eadAssessmentRuntime.test.ts`
- `modules/gestor/cadastros/cursos-ead/cursos-ead.service.ts`
- `modules/gestor/cadastros/cursos-ead/hooks/useCursosEadMutations.ts`
- `modules/gestor/cadastros/cursos-ead/cursos-ead-secure-config.contract.test.ts`
- `modules/gestor/cadastros/cadastros.types.ts`
- `modules/gestor/cadastros/cursos-tecnicos/CursosTecnicosPage.tsx`
- `modules/gestor/cadastros/cursos-tecnicos/components/CursoTecnicoCard.tsx`
- `modules/gestor/cadastros/cursos-tecnicos/components/CursoTecnicoCreateView.tsx`
- `modules/gestor/cadastros/cursos-tecnicos/components/CursoTecnicoDuplicateModal.tsx`
- `modules/gestor/cadastros/cursos-tecnicos/components/CursosTecnicosQueryError.tsx`
- `modules/gestor/cadastros/cursos-tecnicos/curso-tecnico-card.contract.ts`
- `modules/gestor/cadastros/cursos-tecnicos/curso-tecnico-card.contract.test.ts`
- `modules/gestor/cadastros/cursos-tecnicos/cursos-tecnicos.service.ts`
- `modules/gestor/gestao/components/TurmaCard.tsx`
- `modules/gestor/gestao/gestao.mappers.ts`
- `modules/gestor/gestao/technical-card-progress.contract.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/hooks/useTurmaGrade.ts`
- `modules/gestor/gestao/tecnicos/detalhes/turma-grade-sync.contract.test.mjs`
- `supabase/migrations/20260822103822_harden_ead_assessment_mutations.sql`
- `supabase/migrations/20260822104546_include_course_discipline_count_in_kpis.sql`
- `supabase/migrations/20260822105339_add_technical_class_completion_counts.sql`
- `supabase/migrations/20260822114000_create_private_ead_answer_keys.sql`
- `supabase/migrations/20260822114100_lock_ead_completion_enrollment.sql`
- `supabase/migrations/20260822114200_add_authoritative_ead_assessment_feedback.sql`
- `supabase/migrations/20260822114300_serialize_ead_assessment_mutations.sql`
- `supabase/migrations/20260822114400_sanitize_public_ead_configs.sql`
- `supabase/migrations/20260822114500_authorize_course_management_kpis.sql`
- `supabase/migrations/20260822114600_consolidate_authorized_technical_card_progress.sql`
- `supabase/tests/ead_assessment_security_hardening.contract.test.ts`
- `supabase/tests/technical_card_discipline_counts.contract.test.ts`
- `ai/operacao/registros/alteracoes/2026-08-22-avaliacoes-ead-e-cards-tecnicos.md`
- `ai/operacao/qualidade/limite-linhas.json`

Total: 43 arquivos, sem caches, build, dump, segredo ou artefato regenerável.
