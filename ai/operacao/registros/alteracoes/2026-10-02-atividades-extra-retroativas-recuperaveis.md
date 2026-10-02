# Atividades extra-classe retroativas e recuperáveis

## Objetivo e aceite

- Permitir prazos retroativos na grade e no serviço de criação, sem alterar a regra de atraso de novas entregas dos alunos.
- Exibir edição de título/prazo/carga e exclusão recuperável na mesma linha extra-classe do planejamento.
- Preservar respostas, notas, autoria, turma, disciplina, bloqueios acadêmicos, escopo de Gestão/professor e limite de carga.
- Restaurar somente o estado original comprovado. Arquivos antigos sem origem registrada permanecem indisponíveis para restauração automática.
- Proteger edição concorrente pelo timestamp original e manter formulário/confirmacão após falha.

## Diagnóstico

Base: `330810837211338b53ba10f7745d082ac8eb7464` (4.8.150).
O trigger `stamp_and_validate_atividade_extra` rejeitava PUBLICADA com prazo anterior ao dia corrente, inclusive updates sem mudança de prazo. O serviço secundário repetia o bloqueio no cliente. A linha de extra-classe não renderizava as ações existentes nas aulas comuns.

A revisão independente verificou o projeto de produção `kfekgwyqozhicpfuunpo` (UniversoCursoseConsultoria), apesar de a listagem resumida não incluí-lo. O trigger remoto corresponde à base; helpers operacionais atuais e bloqueio do diário devem permanecer intactos.

## Implementação e riscos

- Migração nova adiciona estado anterior do arquivo, retira apenas o bloqueio de prazo passado e cria RPC autenticada/scopada para editar, arquivar e restaurar.
- Guarda de respostas e FOR SHARE existente combinam com FOR UPDATE da RPC; nenhuma resposta é removida. Edição continua proibida após qualquer resposta.
- Arquivar preserva registros, mas retira atividade do portal e sua carga dos totais: a confirmação mostra esse efeito. Restauração revalida carga e estado operacional.
- Sem edição de migrations aplicadas. Sem delete de dados, mudança financeira, credenciais ou novas permissões amplas.
- Migração deve preceder a publicação do frontend, que consulta o novo campo. A publicação não fica concluída sem smoke correspondente.

## Validação

- 56/56 testes dedicados aprovados: 25 SQL isolados com helpers de permissão atuais e função de carga verificada em produção, 19 de serviço/contrato e 12 interações ReactDOM. Revisão independente sem defeitos pendentes.
- TypeScript global, lint do snapshot completo de frontend, build de produção (incluindo 26 páginas de compartilhamento), 56 testes dedicados e controle de versão aprovados localmente. Índice operacional local regenerado com 15 fontes.
- TypeScript, lint, build e check:file-lines globais são exigidos na CI do commit final antes de publicar; o resultado remoto deve ser conferido no PR. O snapshot local não inclui todas as migrations/fontes históricas auditadas, portanto a contagem dos 22 arquivos deste manifesto não substitui essa verificação global.
- Smoke autenticado Safari pendente enquanto o computador autorizado está offline; testes ReactDOM não substituem essa verificação.
- PGlite valida serialização prevista no SQL e tentativa posterior à resposta, sem simular duas sessões simultâneas de produção.
- Histórico de 82 entradas preservado integralmente; versões 4.8.65–90 movidas sem alterações para arquivo de histórico para manter o teto de 500 linhas.

## Manifesto explícito

- `.github/workflows/quality-gates.yml`
- `modules/gestor/gestao/tecnicos/detalhes/components/atividades-extra/atividadesExtraClasse.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradeDisciplina.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradeAtividades.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradeAtividadeEditor.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/turma-grade-atividade.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/turma-grade-atividade.utils.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/turma-grade-atividade.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/turma-grade-atividade.interaction.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/hooks/useTurmaGrade.ts`
- `modules/gestor/gestao/tecnicos/detalhes/turma-grade.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/turma-grade.types.ts`
- `supabase/migrations/20261002191442_manage_retroactive_extra_class_activities.sql`
- `supabase/tests/atividade_extra_management.fixture.sql`
- `supabase/tests/atividade_extra_workload_current.fixture.sql`
- `supabase/tests/atividade_extra_management.isolated.test.mjs`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-16-a-2026-09-25-versoes-4-8-65-a-4-8-90.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-02-atividades-extra-retroativas-recuperaveis.md`

Total: 22 arquivos

## Publicação

Migração `20261002191442_manage_retroactive_extra_class_activities` aplicada no projeto Universo (`kfekgwyqozhicpfuunpo`) em 02/10/2026. Leitura posterior confirmou campo novo, ausência da trava de prazo passado, RLS ativo, execução anônima negada e restauração desconhecida bloqueada. Chamada de alvo nulo confirmou a guarda sem alterar registros. Advisory pós-migração adicionou apenas o aviso esperado de RPC SECURITY DEFINER autenticada: acesso intencional, guardas de identidade/escopo, search_path vazio e acesso anônimo revogado; avisos preexistentes não foram alterados.

Frontend deve ser publicado somente após CI do commit final; resultado e links remotos serão registrados no PR. Smoke autenticado Safari permanece pendente e não é substituído pelos testes ReactDOM.
