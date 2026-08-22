# Jornada completa de Cursos Livres — 2026-08-22

Estado: `PRONTO_PARA_PUBLICACAO_PRODUCAO_4_7_0`

## Objetivo entregue

Transformar Cursos Livres numa jornada presencial completa, reaproveitando turma, grade, aulas e diário existentes e acrescentando avaliação final online segura, conclusão/certificado automáticos e condição financeira individual baseada no plano padrão da turma.

O backend foi aplicado no Supabase principal/Produção após autorização explícita do responsável. Nenhuma cobrança, matrícula ou turma artificial foi criada. A publicação do frontend e da versão estável `4.7.0` foi autorizada explicitamente em 2026-08-22 e aguarda somente os gates finais de GitHub/Vercel.

## Reunião e decisões de alinhamento

- O Livre permanece presencial; não reutiliza a configuração de prova EAD como fonte de verdade.
- A avaliação é versionada em `RASCUNHO`/`PUBLICADA`; uma versão publicada é imutável e a turma fixa a versão aplicável.
- Publicação exige ao menos 50 questões ativas e válidas.
- A liberação usa o início do último encontro planejado, no fuso `America/Maceio`, e exige carga planejada exatamente completa.
- Cada tentativa congela dez questões únicas sorteadas no servidor; o cliente nunca recebe gabarito.
- Correção, aprovação, conclusão da matrícula e solicitação síncrona do certificado acontecem no banco.
- A turma Livre mantém um único professor responsável e vincula todas as disciplinas do curso.
- A estrutura da grade é congelada após uso operacional ou primeira tentativa; somente resumos podem continuar editáveis no caso permitido.
- O valor e a quantidade de parcelas da turma formam somente a condição padrão.
- No vínculo do aluno, a Gestão pode herdar o padrão ou personalizar 1–60 parcelas, primeiro vencimento, desconto comercial, desconto de pontualidade, juros mensais e multa fixa.
- Um aluno pode receber, por exemplo, dois boletos; outro pode receber um boleto único à vista com desconto; outro pode manter as mensalidades sem desconto.
- A prévia, o rateio exato de centavos e as mensagens de desconto/juros/multa são canônicos do servidor. O frontend não calcula parcelas.
- “Vincular sem títulos” cria somente o vínculo acadêmico. “Gerar agora” cria títulos locais do tipo boleto; emissão bancária continua sendo ação posterior no Financeiro.
- Condições diferentes do padrão exigem permissão financeira, código protegido e motivo auditável; depois da geração, o snapshot financeiro fica imutável.
- Informática Básica recebe nove matérias com resumos, carga total de 80 horas e banco publicado com exatamente 50 questões válidas.
- Duplicação de Curso Livre é atômica e clona curso e grade com novos IDs; não copia banco de avaliação, por decisão de escopo.

## Segurança e concorrência

- RPCs críticas usam `SECURITY DEFINER`, `search_path = ''`, grants explícitos e checagem de RBAC.
- Início/entrega da prova, salvamento da grade, duplicação, criação da turma e matrícula financeira são idempotentes.
- Locks seguem ordem determinística e a autorização é refeita após o lock quando necessário.
- Dependentes diretos e compostos de `turmas_disciplinas`, inclusive relações com `ON DELETE CASCADE`, impedem remoção estrutural silenciosa.
- Escrita direta da grade Livre é bloqueada por RLS; outras modalidades preservam seu contrato existente.
- Replay financeiro ocorre antes de consultar estado mutável e ainda respeita a permissão atual do operador.
- Nenhuma integração bancária é chamada dentro das RPCs transacionais do lote.

## Aplicação em Produção

- Projeto confirmado: `kfekgwyqozhicpfuunpo` (`https://kfekgwyqozhicpfuunpo.supabase.co`).
- Aplicação exclusiva pelo MCP Supabase, após resposta explícita `SIM AUTORIZADO`.
- Ledger final: 26/26 migrations, sem lacunas, entre as versões remotas `20260822201749` e `20260822213949`.
- A primeira tentativa de `enforce_curso_livre_schedule_and_access` foi rejeitada pelo parser antes de entrar no ledger. Faltava fechar o agrupamento do ramo Técnico; a fonte foi corrigida, recebeu contrato de regressão e só então foi aplicada com sucesso.
- O advisor detectou oito FKs novas sem cobertura. A migration complementar `index_curso_livre_financial_foreign_keys` adicionou os índices; o resultado final voltou ao baseline de 66 FKs legadas sem índice e deixou zero ocorrência nas relações novas do lote.
- A contrarrevisão identificou antes da publicação um retorno financeiro sem máscara no primeiro processamento, uma ordem de locks incompatível entre início/entrega, ausência de soma exata no save da grade e proteção incompleta da avaliação de origem. Quatro migrations aditivas corrigiram os pontos; os cores ficaram executáveis somente pelo owner e os wrappers públicos preservaram RBAC, idempotência e `search_path` vazio.
- Nenhum boleto, título, matrícula, turma ou tentativa de prova foi criado na validação.

## Validação executada

- `deno test`: `69/69` aprovados.
- `node --test`: `28/28` contratos de interface aprovados.
- `npx tsc --noEmit`: aprovado.
- ESLint focado nos arquivos TypeScript/React do lote: aprovado.
- `npm run build`: aprovado; somente avisos preexistentes de chunks acima de 500 kB.
- Contrarrevisão independente de SQL e integração: nenhum blocker/High remanescente.
- Teto de 500 linhas: aprovado em todo o manifesto. `gestao.service.ts` foi dividido em fachada de 417 linhas e `gestao-create-turma.service.ts` com 229 linhas.
- Produção: 26/26 migrations no ledger; 19 triggers presentes; RLS e grants das seis tabelas públicas novas aprovados.
- A base principal contém um curso Livre Informática Básica, sem turmas, matrículas ou encontros Livres. O seed foi ajustado para reconhecer as grafias legadas `HARDWARE E PERIFÉRIOS` e `SOFTWARES E SISTEMA OPERACIONAIS`, preservando os nove IDs existentes.
- Informática Básica validada com 1 módulo, 9 matérias/80h, 9 resumos, 9 conteúdos, 1 avaliação publicada e 50/50 questões válidas.
- Smoke SQL real: gestor autorizado leu grade/avaliação; chamada sem identidade foi negada; prévia financeira de R$ 500/4 retornou quatro parcelas somando R$ 500.
- Advisors pós-aplicação: baseline preservado em 470 avisos de segurança (49 `INFO`, 421 `WARN`) e 252 de performance (232 `INFO`, 20 `WARN`); execução anônima permaneceu em 13 funções legadas, nenhum core corretivo recebeu ACL externa e nenhuma FK nova do lote ficou sem índice.
- Smoke autenticado bloqueado pelo ambiente: nenhum navegador in-app/Chrome está conectado à sessão (`browsers = []`).

## Pendências de fechamento

1. Executar smoke visual autenticado completo na Gestão e no Portal do Aluno quando houver navegador conectado.
2. Validar replay e concorrência com fixture controlada quando existir homologação ou turma Livre de teste expressamente autorizada; a Produção ainda não possui dados operacionais Livres.
3. Evitar bulk SQL de alteração/exclusão de múltiplas turmas Livres até testar esse cenário; a interface implementada é unitária.
4. Concluir commit atômico, CI, Preview Vercel, merge em `main` e smoke HTTP de Produção; emissão bancária continua fora deste lote.

## Manifesto explícito

Total: 113 arquivos

### Operação

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas.json`
- `ai/operacao/registros/alteracoes/2026-08-22-jornada-cursos-livres.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-07-31-a-2026-08-02.md`
- `internal/versioning/system-version.json`

### Supabase — acadêmico

- `supabase/migrations/20260822160000_create_curso_livre_assessment_schema.sql`
- `supabase/migrations/20260822160100_create_curso_livre_assessment_management.sql`
- `supabase/migrations/20260822160200_create_curso_livre_class_contract.sql`
- `supabase/migrations/20260822160300_include_livre_in_professor_portal.sql`
- `supabase/migrations/20260822160400_create_curso_livre_attempt_schema.sql`
- `supabase/migrations/20260822160500_enforce_curso_livre_schedule_and_access.sql`
- `supabase/migrations/20260822160600_create_curso_livre_student_read_start.sql`
- `supabase/migrations/20260822160700_create_curso_livre_submit_certificate.sql`
- `supabase/migrations/20260822160800_seed_informatica_basica_livre_assessment.sql`
- `supabase/migrations/20260822160900_create_curso_livre_grade_workspace.sql`
- `supabase/migrations/20260822160910_create_curso_livre_grade_guards.sql`
- `supabase/migrations/20260822160915_freeze_operational_curso_livre_grade.sql`
- `supabase/migrations/20260822160920_save_curso_livre_grade_secure.sql`
- `supabase/migrations/20260822160930_duplicate_curso_livre_secure.sql`
- `supabase/tests/curso_livre_assessment_management.contract.test.ts`
- `supabase/tests/curso_livre_student_attempt.contract.test.ts`
- `supabase/tests/curso_livre_informatica_seed.contract.test.ts`
- `supabase/tests/curso_livre_grade_secure.contract.test.ts`
- `supabase/tests/curso_livre_duplicate_secure.contract.test.ts`

### Supabase — financeiro

- `supabase/migrations/20260822161000_create_single_plan_enrollment_condition_state.sql`
- `supabase/migrations/20260822161100_create_single_plan_canonical_preview.sql`
- `supabase/migrations/20260822161200_render_single_plan_enrollment_condition.sql`
- `supabase/migrations/20260822161300_secure_single_plan_condition_authorization.sql`
- `supabase/migrations/20260822161400_create_single_plan_condition_state_helpers.sql`
- `supabase/migrations/20260822161500_create_single_plan_enrollment_v2_rpc.sql`
- `supabase/migrations/20260822161600_query_single_plan_pending_and_keep_legacy_rpc.sql`
- `supabase/migrations/20260822161700_index_curso_livre_financial_foreign_keys.sql`
- `supabase/migrations/20260822161800_mask_single_plan_enrollment_financial_response.sql`
- `supabase/migrations/20260822161900_serialize_curso_livre_attempt_lifecycle.sql`
- `supabase/migrations/20260822162000_enforce_curso_livre_grade_total.sql`
- `supabase/migrations/20260822162100_protect_published_curso_livre_question_origin.sql`
- `supabase/tests/nontechnical_single_plan_financial.contract.test.ts`
- `supabase/tests/nontechnical_single_plan_individual_conditions.contract.test.ts`

### Gestão — curso, grade e avaliação

- `modules/gestor/cadastros/components/CursoGradeCurricularDetails.tsx`
- `modules/gestor/cadastros/components/CursoGradeCurricularHeader.tsx`
- `modules/gestor/cadastros/components/CursoGradeTab.tsx`
- `modules/gestor/cadastros/cursos-livres/cursos-livres.service.ts`
- `modules/gestor/cadastros/cursos-livres/curso-livre-grade.contract.test.mjs`
- `modules/gestor/cadastros/cursos-livres/avaliacao-final/CursoLivreAvaliacaoFinalTab.tsx`
- `modules/gestor/cadastros/cursos-livres/avaliacao-final/QuestaoCursoLivreEditor.tsx`
- `modules/gestor/cadastros/cursos-livres/avaliacao-final/avaliacao-curso-livre.service.ts`
- `modules/gestor/cadastros/cursos-livres/avaliacao-final/avaliacao-curso-livre.types.ts`
- `modules/gestor/cadastros/cursos-livres/avaliacao-final/useAvaliacaoCursoLivreGestao.ts`

### Gestão — turma e financeiro de plano único

- `modules/gestor/gestao/gestao.service.ts`
- `modules/gestor/gestao/gestao-create-turma.service.ts`
- `modules/gestor/gestao/gestao.types.ts`
- `modules/gestor/gestao/hooks/useTurmaPresencialRealtime.ts`
- `modules/gestor/gestao/components/forms/TurmaLivreForm.tsx`
- `modules/gestor/gestao/components/forms/TurmaEspecializacaoForm.tsx`
- `modules/gestor/gestao/components/forms/turma-plano-unico/CurrencyInput.tsx`
- `modules/gestor/gestao/components/forms/turma-plano-unico/TurmaPlanoUnicoForm.tsx`
- `modules/gestor/gestao/components/forms/turma-plano-unico/TurmaPlanoUnicoStepper.tsx`
- `modules/gestor/gestao/components/forms/turma-plano-unico/steps/TurmaPlanoUnicoDadosStep.tsx`
- `modules/gestor/gestao/components/forms/turma-plano-unico/steps/TurmaPlanoUnicoFinanceiroStep.tsx`
- `modules/gestor/gestao/components/forms/turma-plano-unico/steps/TurmaPlanoUnicoReviewStep.tsx`
- `modules/gestor/gestao/components/forms/turma-plano-unico/turma-plano-unico-form.constants.ts`
- `modules/gestor/gestao/components/forms/turma-plano-unico/turma-plano-unico-form.contract.test.mjs`
- `modules/gestor/gestao/components/forms/turma-plano-unico/turma-plano-unico-form.types.ts`
- `modules/gestor/gestao/components/forms/turma-plano-unico/turma-plano-unico-form.utils.test.mjs`
- `modules/gestor/gestao/components/forms/turma-plano-unico/turma-plano-unico-form.utils.ts`
- `modules/gestor/gestao/components/forms/turma-plano-unico/turma-plano-unico-form.validation.ts`
- `modules/gestor/gestao/components/forms/turma-plano-unico/useTurmaPlanoUnicoDialog.ts`
- `modules/gestor/gestao/components/forms/turma-plano-unico/useTurmaPlanoUnicoPreview.ts`
- `modules/gestor/gestao/presencial-financeiro-unico/components/CodigoCondicaoPlanoFinanceiroUnicoCard.tsx`
- `modules/gestor/gestao/presencial-financeiro-unico/components/CondicaoPlanoFinanceiroUnicoModal.tsx`
- `modules/gestor/gestao/presencial-financeiro-unico/components/ConfirmarPlanoFinanceiroUnicoModal.tsx`
- `modules/gestor/gestao/presencial-financeiro-unico/components/PendenciasPlanoFinanceiroUnicoPanel.tsx`
- `modules/gestor/gestao/presencial-financeiro-unico/components/PlanoFinanceiroUnicoStateModal.tsx`
- `modules/gestor/gestao/presencial-financeiro-unico/components/TurmaPlanoFinanceiroUnico.tsx`
- `modules/gestor/gestao/presencial-financeiro-unico/components/TurmaPlanoFinanceiroUnicoAlunos.tsx`
- `modules/gestor/gestao/presencial-financeiro-unico/components/TurmaPlanoFinanceiroUnicoConfiguracoes.tsx`
- `modules/gestor/gestao/presencial-financeiro-unico/formatters.ts`
- `modules/gestor/gestao/presencial-financeiro-unico/hooks/useAlunosDisponiveisPlanoFinanceiroUnico.ts`
- `modules/gestor/gestao/presencial-financeiro-unico/hooks/useCondicaoPlanoFinanceiroUnico.ts`
- `modules/gestor/gestao/presencial-financeiro-unico/hooks/usePlanoFinanceiroUnico.ts`
- `modules/gestor/gestao/presencial-financeiro-unico/index.ts`
- `modules/gestor/gestao/presencial-financeiro-unico/keys.ts`
- `modules/gestor/gestao/presencial-financeiro-unico/presencial-financeiro-unico.contract.test.mjs`
- `modules/gestor/gestao/presencial-financeiro-unico/presencial-financeiro-unico.service.ts`
- `modules/gestor/gestao/presencial-financeiro-unico/types.ts`
- `modules/gestor/gestao/livres/GestaoLivres.tsx`
- `modules/gestor/gestao/livres/detalhes/TurmaLivreDetalhes.tsx`
- `modules/gestor/gestao/livres/detalhes/components/TurmaAlunos.tsx`
- `modules/gestor/gestao/livres/detalhes/components/TurmaConfiguracoes.tsx`
- `modules/gestor/gestao/livres/detalhes/components/TurmaFinanceiro.tsx`
- `modules/gestor/gestao/especializacao/GestaoEspecializacao.tsx`
- `modules/gestor/gestao/especializacao/detalhes/TurmaEspecializacaoDetalhes.tsx`
- `modules/gestor/gestao/especializacao/detalhes/components/TurmaAlunos.tsx`
- `modules/gestor/gestao/especializacao/detalhes/components/TurmaConfiguracoes.tsx`
- `modules/gestor/gestao/especializacao/detalhes/components/TurmaFinanceiro.tsx`

### Portal do Aluno

- `modules/aluno/aluno.page.tsx`
- `modules/aluno/cursos/CursosPage.tsx`
- `modules/aluno/cursos/components/CourseCatalogGrid.tsx`
- `modules/aluno/cursos/components/CourseCatalogView.tsx`
- `modules/aluno/cursos/cursosPage.types.ts`
- `modules/aluno/cursos/cursosPage.utils.ts`
- `modules/aluno/cursos/hooks/useAlunoCoursesCatalog.ts`
- `modules/aluno/turmas/components/TurmaDetail.tsx`
- `modules/aluno/turmas/components/final-assessment/LiveFinalAssessmentTab.tsx`
- `modules/aluno/turmas/components/final-assessment/curso-livre-final-assessment.service.ts`
- `modules/aluno/turmas/components/final-assessment/curso-livre-final-assessment.types.ts`
- `modules/aluno/turmas/components/final-assessment/useCursoLivreFinalAssessment.ts`
- `modules/aluno/turmas/hooks/useAlunoTurmasData.ts`
- `modules/aluno/turmas/turmas.types.ts`
- `modules/aluno/turmas/turmas.utils.ts`
- `modules/aluno/turmas/curso-livre-final-assessment.contract.test.mjs`
- `modules/aluno/turmas/dependency-access.test.ts`

## Sobre o worktree compartilhado

Alguns arquivos compartilhados de Portal do Aluno e Gestão já continham alterações paralelas fora deste lote. Elas foram preservadas. Este registro atribui ao lote somente as integrações de Curso Livre e plano financeiro único nesses arquivos; não reivindica nem reverte os demais trechos preexistentes.
