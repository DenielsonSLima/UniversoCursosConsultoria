# Ingresso técnico até 365 dias e recebimento de transferência

Lote autorizado em 10/10/2026. Entrega 4.8.201, revisão 210, preparada para GitHub e produção após validação integrada.

## Objetivo e aceite

- Permitir novo vínculo direto até `data_inicio + 365 dias`, inclusive, usando a data de America/Maceio.
- Após o prazo, exigir recebimento oficial de transferência, sem exceções permanentes por nome/curso.
- Preservar vínculos atuais, ativação, reativação, financeiro, replays e importações históricas comprovadas.
- Data inicial ausente impede nova entrada direta até correção; fases e permissões atuais continuam válidas.
- Compartilhar a elegibilidade canônica entre banco, gestor e inscrição pública, antes de criar cobranças.
- Ler a grade efetiva do curso por módulos e disciplinas, com os mesmos identificadores validados ao gravar notas.
- Receber transferência em cinco etapas: aluno/origem, notas, configuração financeira, cobranças editáveis e revisão geral.
- Carregar padrões da turma; separar vencimento da matrícula/rematrícula e primeira mensalidade; oferecer calendário mensal ou intervalo de 30 dias.
- Manter edição por cobrança, descontos/juros/multa opcionais e ciclos independentes; mostrar impedimentos no passo correspondente.
- Conferir o financeiro ao avançar, preservando notas e ajustes ao voltar ou recuperar falhas.

## Etapas e revisão

1. Banco: política temporal, proteção dos pontos de ingresso e provas privadas de transferência/importação.
2. Gestor/público: elegibilidade canônica e caminho para transferência, sem alterar alunos já vinculados.
3. Recebimento: grade efetiva, cinco passos, configuração e lista separadas, vencimentos independentes.
4. Revisão cruzada dos três agentes: corrigidos preview sem ajustes, recarga da grade após rejeição, preservação de C1 aplicado quando C2 falha e retenção de opções de grupos desligados.

## Validação concluída

- Reprodução pelo RPC real confirmou ausência da janela temporal. Na T40, a matriz possui 3 módulos e 27 disciplinas; a tabela de professores/ajustes da turma não tinha linhas e era consultada indevidamente como grade.
- Ensaios SQL com rollback: dias 364/365/366, ano bissexto, início ausente/futuro, ator sem polo, replay após mudança válida da data, ativação existente, origem falsa, checkout, transferência interna e importador oficial com prova real de lote.
- Os 12 cenários anteriores dos planos de transferência v2/v3 passaram com a nova proteção. Constraints adiadas verificadas antes do rollback.
- Contrato real do recebimento: leitura das 27 disciplinas; gravação de nota/frequência; disciplina alheia recusada; taxa e mensalidade em datas diferentes; sequência de 30 dias; calendário no dia31; edição, adição e herança de condições individuais; geração local de recebíveis conferida e revertida. Nenhuma emissão bancária.
- Interface: 19 testes do gestor e 5 públicos; 20 testes Deno do financeiro/recebimento; 7 testes Node de grade/hook/rodapé, incluindo falha parcial, reparo da lista, revisão automática e mudança concorrente da grade.
- Lint focado das frentes, TypeScript integrado e build de produção passaram. Testes novos incorporados ao CI.
- Após aplicar as cinco migrations, repetidos os três contratos novos em rollback: todos passaram. Consulta final: 5 turmas dentro do prazo, 7 após o prazo, T40 com 3 módulos/27 disciplinas e zero permissões transitórias remanescentes.
- Advisors comparados à linha de base: novos avisos limitados às três RPCs SECURITY DEFINER intencionais e à tabela privada com RLS sem políticas (negação padrão). RPCs internas revogadas; consultas do gestor validam perfil/polo; catálogo público expõe apenas campos públicos.
- Smoke visual pendente para o usuário, conforme orientação de concluir o código. A revisão automática recusou acessar o Safari por possível conflito com outra automação; os testes de componentes não substituem essa conferência.

## Banco aplicado via MCP Supabase

Migrations locais imutáveis após aplicação; o ledger remoto usa o horário real:

| Arquivo local | Versão no ledger |
| --- | --- |
| `20261010200000_technical_admission_window_policy.sql` | `20261010150545` |
| `20261010200010_technical_admission_transfer_permits.sql` | `20261010150550` |
| `20261010200020_technical_admission_entrypoint_guards.sql` | `20261010150555` |
| `20261010201000_external_transfer_effective_course_grade.sql` | `20261010150603` |
| `20261010201010_external_transfer_independent_due_dates.sql` | `20261010150610` |

## Conferência visual pelo usuário

1. Selecionar aluno, curso e turma; conferir os cinco passos e a mesma grade da Gestão.
2. Informar aproveitamento, nota e frequência; avançar e voltar sem perder os campos.
3. Configurar matrícula em uma data e primeira mensalidade em outra, com intervalo de 30 dias; gerar a lista.
4. Ajustar valor/vencimento/condições de uma parcela, adicionar, mover ou remover e conferir a revisão geral.
5. Em turma após o prazo, conferir matrícula direta indisponível e transferência disponível ao perfil autorizado.

## Publicação

Entrega preparada sobre `aba3f98b42e76c1dc107ef7f3b2409cfeb519c02`. Publicar apenas o manifesto abaixo. O resultado do GitHub e do deploy será comunicado após os checks da revisão exata.

## Manifesto explícito

Total: 66 arquivos.

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-10-ingresso-tecnico-365-dias.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `.github/workflows/quality-gates.yml`
- `docs/contracts/ciclos-tecnicos-passagem-e-proveniencia.md`
- `modules/shared/utils/technicalAdmissionPolicy.ts`
- `modules/shared/utils/technicalAdmissionPolicy.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/technical-admission.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/hooks/useTechnicalAdmission.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/TechnicalAdmissionNotice.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/TurmaAlunosHeader.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/useTechnicalEnrollmentConfirmation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/technical-enrollment-attempt.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/technical-enrollment-attempt.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/technical-admission-ui.behavior.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/technical-enrollment-no-finance-access.contract.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaAlunos.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaAcademico.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/TurmaTecnicoDetalhes.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoMatriculas.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoMatriculasModals.tsx`
- `modules/gestor/parceiros/components/EnrollmentModal.tsx`
- `modules/gestor/parceiros/hooks/useParceirosMutations.ts`
- `modules/public/publicTechnicalClasses.client.ts`
- `modules/public/publicTechnicalClasses.service.ts`
- `modules/public/publicTechnicalClasses.contract.test.ts`
- `modules/public/courseAvailability.ts`
- `modules/public/hooks/useCourseEnrollmentAvailability.ts`
- `modules/public/landing-pages/cursos-tecnicos/technicalLanding.types.ts`
- `modules/public/landing-pages/cursos-tecnicos/technicalLanding.service.ts`
- `modules/public/landing-pages/cursos-tecnicos/useTechnicalEnrollmentController.ts`
- `modules/public/landing-pages/cursos-tecnicos/shared/technicalLanding.utils.ts`
- `modules/public/landing-pages/cursos-tecnicos/shared/TechnicalEnrollmentForm.tsx`
- `modules/public/landing-pages/cursos-tecnicos/shared/TechnicalLandingHero.tsx`
- `supabase/migrations/20261010200000_technical_admission_window_policy.sql`
- `supabase/migrations/20261010200010_technical_admission_transfer_permits.sql`
- `supabase/migrations/20261010200020_technical_admission_entrypoint_guards.sql`
- `supabase/tests/technical_admission_window.rollback.sql`
- `supabase/tests/technical_admission_import.rollback.sql`
- `supabase/tests/external_transfer_schedule.rollback.sql`
- `supabase/tests/external_transfer_individual_terms.rollback.sql`
- `supabase/migrations/20261010201000_external_transfer_effective_course_grade.sql`
- `supabase/migrations/20261010201010_external_transfer_independent_due_dates.sql`
- `supabase/tests/external_transfer_grade_and_due_dates.rollback.sql`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer.contract.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-financial-configuration.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-financial-configuration.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferCycleConfigurator.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferFinancialFields.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferScheduleFields.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferScheduleRow.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-presentation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/academic-lifecycle.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferAcademicFields.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferNotesFields.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ReceiveExternalTransferController.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ReceiveExternalTransferModal.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/useReceiveExternalTransfer.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-draft.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-grade.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-preview-runner.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-grade.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-wizard.behavior.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-test-runtime.mjs`
