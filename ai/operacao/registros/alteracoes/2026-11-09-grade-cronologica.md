# Grade em ordem cronológica — 4.8.279

## Objetivo e aceite

Intercalar aulas e extras por dia na disciplina expandida em Grade & Profs. A solicitação inclui atualizar GitHub e produção. Preservar os rótulos Aula/Extra, sua numeração de origem, conteúdo, carga horária, sessões, edição e arquivamento recuperável. Datas ausentes ou inválidas ficam ao fim; empates preservam a ordem original, com aulas antes de extras. Arquivadas continuam separadas.

## Escopo e risco

Apresentação local e publicação. Sem migrations, alterações de dados, frequência, notas, permissões ou regras acadêmicas. Mantido um controlador de mutações das extras, com chaves de identidade estáveis durante reordenação. O lote extra-classe-frequencia anterior é preservado sem reabrir seu escopo.

## Manifesto explícito

- `modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradeDisciplina.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradeAtividades.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/turma-grade-cronologia.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradePlanejamento.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/turma-grade-atividade.interaction.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/turma-grade-atividade.test.mjs`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-09-grade-cronologica.md`

Total: 10 arquivos.

## Validação e publicação

- Causa confirmada no componente: todas as aulas eram renderizadas antes da lista de extras.
- 40 testes focados de cronologia, contratos de atividade e interação DOM aprovados. O contrato estático de arquivadas foi atualizado para o helper que agora contém o filtro. CI completo e Preview devem aprovar o commit exato antes do merge.
- Smoke visual autenticado Safari pendente: Mac informado como offline. Testes DOM não substituem essa verificação.
- Publicação autorizada pelo pedido de 09/11/2026, após checks e Preview aprovados. Acompanhar o commit/PR e o deployment vinculados a este registro para o resultado final.
