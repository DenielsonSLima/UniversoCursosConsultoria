# Histórico de alterações

Este arquivo registra as mudanças publicadas no sistema. A entrada mais recente deve sempre corresponder ao arquivo `system-version.json`.

## [0.2.2-beta.3] - 2026-07-14

### Adicionado

- Conclusões EAD passam a entrar em `Secretaria > Certificações` como pendentes para registro de número, livro e página.
- Portal do aluno passou a gerar o PDF real da carteirinha estudantil, com frente e verso no formato do cartão.
- Fechamento de período técnico passou a exibir avaliações de estágio pendentes e reprovações de estágio.

### Corrigido

- Certificado EAD deixou de ser liberado automaticamente ao concluir a prova; o aluno só recebe o PDF após a emissão da Secretaria.
- Avaliação e reprovação no estágio agora participam do encerramento do período e do resultado final da matrícula.
- Ações de progresso e prova EAD agora validam o próprio aluno, os itens reais do curso e os pré-requisitos antes da conclusão.

### Segurança

- Alunos não conseguem consultar certificados pendentes nem finalizar certificados por chamada direta.
- Emissão do certificado valida o gestor e o polo, ignora responsável forjado e reconfirma a conclusão EAD no banco.
- Emissão, revogação e leitura dos códigos documentais passaram a respeitar aluno, matrícula e escopo de polo no banco.

## [0.2.1-beta.2] - 2026-07-14

### Corrigido

- Acesso do professor limitado às próprias disciplinas, com diário, presença e estágio bloqueados fora do período operacional.
- Portal do professor limitado ao polo ativo autorizado e às turmas de cursos técnicos.
- Consultas acadêmicas deixaram de expor CPF e data de nascimento ao diário do professor.
- Disciplinas de estágio passaram a ser identificadas pela carga horária configurada, inclusive em Enfermagem.
- Portal do aluno passou a exibir as disciplinas e a situação do estágio antes da primeira avaliação.

### Segurança

- RPCs acadêmicas e de estágio passaram a validar vínculo, turma e disciplina no banco antes de retornar dados.
- Situação vacinal do estágio é fornecida ao professor apenas de forma agregada, sem acesso a comprovantes.
- Notas, frequência, práticas e avaliações de estágio agora validam matrícula ativa e coerência entre aluno, aula, turma e disciplina.

## [0.2.0-beta.1] - 2026-07-14

### Adicionado

- Ciclo autoritativo de turmas técnicas, com planejamento, inscrições, períodos, fechamento e finalização.
- Atividades extraclasse vinculadas ao período, com entrega, correção e integração ao resultado acadêmico.
- Visão acadêmica do aluno adequada à fase da turma, preservando o histórico após conclusão ou reprovação.
- Comprovantes vacinais em armazenamento privado e validação exclusiva da secretaria.

### Corrigido

- Proteções de matrícula, grade, diário, estágio, vacinas e auditoria contra alterações diretas ou fora do período.
- Estados de carregamento e erro agora bloqueiam operações quando os dados acadêmicos não puderem ser confirmados.
- Datas do ciclo técnico e financeiro normalizadas para o fuso de Maceió.

### Alterado

- Telas extensas do módulo técnico e cadastro acadêmico foram divididas em componentes menores.

## [0.1.0-beta.1] - 2026-07-14

### Adicionado

- Identificação discreta `BETA · v0.1.0` nos portais do gestor, aluno e professor.
- Fonte única para a versão atual do sistema.
- Validação automática entre a versão atual e este histórico.
- Verificação em pull requests para exigir a atualização deste registro em toda alteração do produto.
