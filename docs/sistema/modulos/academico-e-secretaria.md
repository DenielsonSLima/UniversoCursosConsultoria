# Acadêmico e Secretaria

Status: CANÔNICO. Última revisão: 2026-08-12.

## O que este módulo faz

O domínio acadêmico organiza cursos, matrículas, turmas, disciplinas, períodos,
aulas, diários, avaliações, frequência, estágio, histórico e solicitações
documentais.

Gestão configura oferta e turma. O Professor mantém o diário e o plano de
curso. A Secretaria acompanha aluno, resultados e emissão de documentos. O
Aluno acessa somente os dados liberados para sua identidade.

## Caminho típico do curso técnico

    Curso e grade
       -> Turma e período
       -> Matrícula
       -> Diário, aulas, frequência e avaliações
       -> Fechamento do diário
       -> Resultado, documentos, estágio ou dependência

## Estágio

Não existe um botão global de liberação. O sistema avalia três grupos de
condições:

1. A disciplina da grade deve possuir carga de estágio.
2. A turma deve estar em andamento e o período do módulo precisa estar aberto
   ou em fechamento.
3. Quando exigidas, todas as doses vacinais obrigatórias do aluno devem estar
   aprovadas.

Na tela de vacinas da turma, a aprovação da última dose muda o aluno para o
grupo de liberados. No estágio, a ação deixa de estar bloqueada e passa para
avaliação de estágio.

## Dependência acadêmica

Quando um aluno é reprovado, a dependência só pode ser encaminhada depois do
resultado terminal e do fechamento total do diário de origem.

Fluxo operacional:

1. Secretaria > Dependências Acadêmicas.
2. Localizar a disciplina reprovada e escolher Encaminhar.
3. Selecionar uma turma de reoferta elegível.
4. Conferir a cobrança isolada e o vencimento único.
5. Confirmar e emitir o boleto.
6. A tentativa só é liberada para o diário de destino quando o pagamento é
   comprovado.

O aluno não é transferido para a turma inteira. Ele mantém a matrícula
original e entra somente no diário da disciplina refeita.

Para ser elegível, a turma de destino deve ser do mesmo curso, conter a mesma
disciplina, estar em situação acadêmica permitida, não ter iniciado aulas
naquela disciplina e não ter tentativa ativa duplicada para o aluno.

## Configuração

Antes de operar uma turma técnica, confirme:

- curso, matriz curricular e carga horária de cada disciplina;
- polo, turma, período e status de matrículas;
- professor responsável e planejamento de aulas;
- regras de frequência e avaliação;
- requisitos documentais e vacinais;
- permissões de Secretaria, Gestão e Professor por polo.

Configurações acadêmicas devem ser feitas nas telas de Cadastros e Gestão por
usuários autorizados. Regras de elegibilidade, resultado e transição ficam no
backend; não devem ser duplicadas em componentes visuais.

## Fontes principais

- modules/gestor/gestao/
- modules/gestor/secretaria/
- modules/professor/turmas/
- modules/professor/plano-curso/
- modules/aluno/turmas/
- modules/shared/vacinas/
- supabase/migrations/ com prefixos academic, diario, turma e dependency
- supabase/tests/dependency_*.contract.test.ts

## Validação recomendada

- Planejar uma turma sem criar dados reais de produção.
- Confirmar permissões por polo e por papel.
- Exercitar o fechamento de um diário controlado.
- Para dependência, usar aluno e turma de teste, evitando emitir boleto real.

