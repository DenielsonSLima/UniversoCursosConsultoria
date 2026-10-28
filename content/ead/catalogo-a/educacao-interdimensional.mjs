import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Educação integral e integração das dimensões humanas',
    skills: ['distinguir-integralidade-jornada'], sourceIds: ['sp-modelo-integral', 'pe-interdimensional'],
    sections: [
      { title: 'Ensino: uma concepção de formação, não apenas mais tempo', paragraphs: [
        'Educação integral se refere ao desenvolvimento da pessoa em múltiplas dimensões. Jornada ampliada é uma forma de organizar o tempo escolar, mas não garante por si só uma formação integral. Um dia mais longo pode repetir as mesmas limitações de um dia curto. O planejamento precisa perguntar quais experiências de conhecimento, convivência, expressão e reflexão são oferecidas e quem consegue participar delas.',
        'A educação interdimensional, presente em referências de programas públicos de educação integral, propõe integrar racionalidade, afetividade, corporeidade e transcendência. Essas dimensões não são quatro tipos fixos de aluno nem compartimentos que competem entre si. Em uma atividade, o estudante pode investigar um problema, dialogar com colegas, produzir uma expressão corporal ou artística e refletir sobre valores e sentidos. Integrar não significa abandonar o conhecimento científico.',
        'O enfoque orienta a análise das experiências formativas. Uma proposta exclusivamente centrada em repetir informações pode ignorar relações e participação; uma dinâmica apenas recreativa pode não desenvolver o conhecimento pretendido. A integração exige intencionalidade: objetivos, formas de participação e evidências de aprendizagem. As referências estaduais são exemplos de modelos, não uma autorização para copiar regras administrativas de uma rede para qualquer escola.',
      ] },
      { title: 'Caso resolvido: ampliar o horário sem mudar a experiência', paragraphs: [
        'Uma escola acrescenta duas horas ao turno, preenchidas com mais exercícios idênticos aos da manhã. A gestão anuncia que isso, isoladamente, realiza educação integral. A análise mostra que mudou a duração, mas ainda é necessário avaliar a qualidade e a diversidade das experiências. A equipe pode manter a retomada de conhecimentos quando necessária e combinar investigação, produção e colaboração, com objetivos definidos e apoios para participação.',
        'Em um projeto sobre o espaço da escola, os estudantes analisam medidas, discutem usos, produzem uma representação e justificam escolhas para melhorar a convivência. O exemplo articula conhecimentos e relações sem substituir o currículo por atividades aleatórias. Ao avaliar, a equipe observa tanto a correção das informações quanto a argumentação e a participação, sem reduzir o desempenho a um julgamento sobre a personalidade dos jovens.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Escolha uma atividade escolar fictícia e descreva o que ela ensina e como os estudantes participam. Proponha uma mudança que amplie a experiência formativa sem apenas aumentar sua duração. Identifique quais dimensões são mobilizadas e quais evidências serão observadas. Confira se o conhecimento específico continua presente e se a proposta não classifica pessoas como “racionais” ou “afetivas” de forma fixa. Explique também quais aspectos dependem das condições reais e do projeto pedagógico da escola.',
      ] },
    ],
  },
  {
    title: 'Racionalidade, afetividade, corporeidade e sentido',
    skills: ['planejar-integracao-dimensoes'], sourceIds: ['sp-modelo-integral', 'mg-modelo-integral'],
    sections: [
      { title: 'Ensino: traduzir dimensões em experiências pedagógicas', paragraphs: [
        'A racionalidade envolve compreender, investigar, organizar argumentos e usar conhecimentos. A afetividade aparece nas relações, no reconhecimento de sentimentos e nas condições de confiança para aprender. A corporeidade envolve modos de perceber, agir e se expressar pelo corpo. A transcendência, nos modelos estudados, abre espaço para sentidos, valores e questões que ultrapassam a utilidade imediata. Nenhuma dessas dimensões permite deduzir uma capacidade permanente de uma pessoa a partir de um comportamento isolado.',
        'O planejamento pode combinar formas de expressão para que o estudante construa e comunique uma ideia. Um tema pode ser estudado por leitura, observação, diálogo, desenho, produção e movimento, conforme os objetivos e as necessidades da turma. Não é necessário incluir uma atividade artificial para cada dimensão em toda aula. A coerência entre propósito e experiência é mais relevante do que preencher quatro caixas num formulário.',
        'Trabalhar valores e sentidos exige respeito à diversidade. Não se deve converter uma reflexão pedagógica em imposição de crença ou avaliação da religiosidade dos estudantes. Questões como responsabilidade, cuidado, pertencimento e propósito podem ser discutidas a partir de situações e diferentes perspectivas. O educador organiza o diálogo e os critérios de participação, sem exigir exposição íntima ou adesão a uma visão pessoal.',
      ] },
      { title: 'Caso resolvido: projeto sobre água e convivência', paragraphs: [
        'Uma turma investiga o uso de água em um espaço fictício da escola. Analisa dados e medidas, entrevista usuários com perguntas respeitosas e produz uma instalação artística para comunicar suas conclusões. Na discussão, compara necessidades individuais e uso compartilhado. A integração aparece na relação entre conhecimento, expressão e reflexão, e não em chamar a atividade de “interdimensional” no título.',
        'Uma estudante prefere contribuir pelo desenho, enquanto outro organiza os dados. O professor permite diferentes formas de participação, mas mantém expectativas de aprendizagem: ambos precisam compreender e explicar a proposta. Oferecer opções não significa deixar alguém fora do conhecimento estudado. A avaliação observa evidências e apoios, sem transformar preferências de expressão em tipos fixos de inteligência ou de personalidade.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Planeje uma experiência sobre um problema coletivo da escola. Relacione conhecimento, interação, expressão e reflexão sobre valores, sem inserir etapas sem função. Descreva duas formas de participação acessível e uma evidência de aprendizagem comum a todos. Revise se a proposta exige exposição pessoal ou crença específica. Substitua essas exigências por perguntas sobre situações e decisões. Explique por que oferecer formas diferentes de expressão não deve diminuir o acesso ao conhecimento do projeto.',
      ] },
    ],
  },
  {
    title: 'Pedagogia da presença e autonomia acompanhada',
    skills: ['exercer-presenca-educativa'], sourceIds: ['mg-modelo-integral', 'sp-modelo-integral'],
    sections: [
      { title: 'Ensino: estar disponível sem fazer tudo pelo estudante', paragraphs: [
        'A pedagogia da presença envolve uma atuação intencional de escuta, orientação e acompanhamento. Não se confunde com apenas estar fisicamente perto nem com controlar cada decisão do estudante. O educador torna-se uma referência quando estabelece relações respeitosas, explicita expectativas e oferece apoio para que o jovem desenvolva autonomia. A proximidade precisa manter os limites profissionais e as responsabilidades da escola.',
        'Apoiar a autonomia exige graduar o auxílio. Em uma tarefa nova, o professor pode modelar uma estratégia, fazer perguntas e verificar o entendimento. Conforme o estudante assume as etapas, o apoio muda. Resolver tudo por ele pode produzir uma entrega aparentemente correta sem aprendizagem. Afastar-se completamente sob o argumento de que o jovem precisa ser autônomo também pode deixar uma barreira sem atendimento.',
        'A escuta se transforma em acompanhamento quando os combinados são retomados. Registre objetivos e próximos passos pedagógicos com o estudante, evitando rótulos. Se aparecer uma necessidade que ultrapassa a atuação docente, articule o apoio institucional. Não prometa sigilo absoluto, substitua cuidado especializado ou estabeleça relação de dependência pessoal. A referência educativa fortalece a participação na comunidade escolar, em vez de isolar o jovem em um vínculo exclusivo.',
      ] },
      { title: 'Caso resolvido: dificuldade na organização de um projeto', paragraphs: [
        'Um grupo não consegue iniciar a pesquisa porque seu tema está amplo. O professor não entrega um texto pronto nem abandona a atividade. Faz perguntas para delimitar o problema, mostra como formular uma questão e combina um primeiro produto possível: uma lista de informações necessárias e fontes. Na revisão, o grupo apresenta suas decisões e recebe novas perguntas. O apoio é visível, mas a autoria continua com os estudantes.',
        'Quando o grupo já consegue planejar as etapas, o professor reduz a intervenção direta e acompanha os pontos combinados. Uma dificuldade posterior não é interpretada como incapacidade permanente. A equipe analisa se faltou conhecimento, organização ou condição de participação. O caso demonstra que presença educativa e autonomia se complementam: a intenção é ampliar a capacidade de agir e avaliar, não produzir dependência de respostas do adulto.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Escreva uma situação fictícia em que o professor ajuda demais e outra em que deixa de oferecer apoio necessário. Replaneje ambas com perguntas, uma orientação inicial e um ponto de revisão. Defina o que permanecerá como decisão do estudante. Confira se os combinados podem ser observados e se a relação mantém limites profissionais. Explique como você perceberia que o apoio pode ser reduzido e qual informação indicaria a necessidade de reorganizar a intervenção, em vez de rotular o estudante.',
      ] },
    ],
  },
  {
    title: 'Protagonismo, participação e projeto de vida',
    skills: ['organizar-protagonismo-responsavel'], sourceIds: ['pe-interdimensional', 'sp-modelo-integral'],
    sections: [
      { title: 'Ensino: participação com influência real nas decisões', paragraphs: [
        'Protagonismo estudantil não é somente executar uma tarefa previamente decidida por adultos. Envolve oportunidades de compreender um problema, propor caminhos, decidir dentro de responsabilidades definidas e avaliar os efeitos da ação. A participação precisa ter influência real sobre alguma parte do processo. Uma consulta sem retorno ou uma escolha que nunca pode modificar nada produz aparência de participação, mas não amplia a autoria.',
        'O projeto de vida pode organizar reflexão sobre interesses, possibilidades, conhecimentos e escolhas. Não é um formulário que obriga o jovem a definir uma profissão de modo definitivo. As escolhas mudam e dependem de condições sociais e oportunidades. O trabalho pedagógico ajuda a reconhecer alternativas, construir metas próximas e revisar percursos, sem atribuir sucesso ou fracasso apenas à vontade individual.',
        'O educador explicita os limites do que pode ser decidido, as condições disponíveis e os critérios de acompanhamento. Autonomia vem acompanhada de responsabilidade e análise das consequências. Quando há um limite de segurança ou de recursos, ele deve ser explicado, não apresentado depois como punição por uma proposta. Os estudantes também precisam conhecer como as decisões serão registradas e como receberão retorno sobre sugestões não adotadas.',
      ] },
      { title: 'Caso resolvido: projeto de melhoria de um espaço', paragraphs: [
        'A turma é convidada a melhorar um espaço de leitura. Se os adultos já escolheram todos os materiais e o formato, os estudantes ficam apenas com a montagem. Para criar participação efetiva, a equipe define os limites de orçamento e segurança e abre decisões reais sobre organização, seleção de usos e comunicação. Os jovens pesquisam necessidades, comparam alternativas e justificam uma proposta.',
        'Uma ideia ultrapassa os recursos disponíveis. Em vez de descartá-la sem diálogo, o professor retoma os critérios e pede uma adaptação viável. A decisão final registra quais sugestões foram aproveitadas e por quê. Depois da implantação, os estudantes observam o uso do espaço e propõem ajustes. O processo inclui escolha, execução e avaliação, sem reduzir protagonismo a fazer tarefas ou receber elogios por obedecer.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Planeje um projeto fictício em que estudantes possam tomar pelo menos três decisões reais. Escreva os limites, os recursos e a forma de retorno às sugestões. Inclua uma meta próxima que possa ser revista após a experiência. Confira se a proposta não exige uma escolha profissional definitiva e se reconhece condições de participação. Explique como a avaliação permitirá perceber influência dos estudantes e responsabilidade pelas decisões, em vez de contar apenas o número de tarefas executadas.',
      ] },
    ],
  },
  {
    title: 'Avaliação e revisão de uma experiência interdimensional',
    skills: ['avaliar-experiencia-integrada'], sourceIds: ['sp-modelo-integral', 'mg-modelo-integral'],
    sections: [
      { title: 'Ensino: avaliar evidências sem medir crenças ou personalidade', paragraphs: [
        'Uma experiência integrada precisa de critérios de avaliação ligados aos objetivos. Se o projeto envolve investigação, argumentação e colaboração, descreva quais produções e ações mostrarão essas aprendizagens. Não basta afirmar que a atividade desenvolveu todas as dimensões porque foi agradável. Observações, registros de processo, produções e autoavaliação podem se complementar, desde que o estudante conheça o que está sendo observado.',
        'Critérios precisam evitar julgamentos sobre personalidade, crença ou intimidade. Em colaboração, por exemplo, é possível observar se o grupo distribuiu tarefas, escutou propostas e justificou decisões. Isso é diferente de atribuir nota a ser “extrovertido” ou expressar determinada espiritualidade. Uma pessoa pode participar de modo relevante sem falar mais que as outras. As condições de acessibilidade e os apoios oferecidos também precisam ser considerados.',
        'A avaliação formativa orienta o próximo passo. Uma devolutiva descreve o que foi realizado, a dificuldade identificada e uma possibilidade de avanço. O plano é revisto com base nessas evidências. O ciclo de planejar, realizar, acompanhar e ajustar não deve ser confundido com preencher relatórios sem modificar a prática. A coerência entre concepção e ação aparece quando o resultado da observação muda o ensino.',
      ] },
      { title: 'Caso resolvido: apresentação bonita, compreensão incompleta', paragraphs: [
        'Um grupo produz uma apresentação visual bem acabada, mas não consegue explicar os dados usados para defender sua proposta. Se a avaliação considerar apenas a aparência, deixará de verificar a aprendizagem pretendida. O professor reconhece o trabalho de comunicação e retoma a leitura dos dados, pedindo uma explicação com exemplos. A devolutiva aponta um avanço possível sem rotular os estudantes como incapazes.',
        'Na nova versão, o grupo corrige a interpretação e explica como distribuiu responsabilidades. A comparação entre versões fornece evidência de aprendizagem e de revisão do processo. O docente também analisa se o planejamento ofereceu apoio suficiente para compreender os dados. A avaliação envolve o percurso dos estudantes e a qualidade das condições de ensino, mantendo critérios claros e evitando transformar dimensões humanas em uma escala de personalidade.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie três critérios para avaliar um projeto integrado: um sobre conhecimento, outro sobre argumentação e um sobre colaboração. Descreva evidências observáveis e uma devolutiva para cada dificuldade. Depois revise os critérios para retirar avaliações de crença, intimidade ou extroversão. Planeje uma oportunidade de revisão do produto. Confira se a nova versão poderá mostrar aprendizagem e se a observação do professor também produzirá ajustes no ensino, em vez de apenas uma classificação final.',
      ] },
    ],
  },
];

const activities = [
  { module: 1, skill: 'distinguir-integralidade-jornada', prompt: 'Uma escola amplia o turno, mas apenas repete exercícios sem rever a experiência formativa. O que pode ser concluído?', options: ['A ampliação, sozinha, garante educação integral.', 'O conhecimento científico deixou de ser necessário.', 'Mudou a duração; a integralidade ainda depende da proposta e das experiências.', 'Qualquer atividade extra integra automaticamente todas as dimensões.'] },
  { module: 2, skill: 'planejar-integracao-dimensoes', prompt: 'Como integrar diferentes dimensões sem transformar estudantes em tipos fixos?', options: ['Classificar cada jovem como racional ou afetivo para sempre.', 'Oferecer experiências coerentes com o objetivo e formas diversas de participação.', 'Separar o conhecimento científico das demais experiências.', 'Exigir adesão à crença pessoal do professor.'] },
  { module: 3, skill: 'exercer-presenca-educativa', prompt: 'Um grupo não consegue delimitar seu tema de pesquisa. Qual intervenção expressa presença educativa?', options: ['Entregar toda a pesquisa pronta.', 'Abandonar a tarefa para testar autonomia.', 'Assumir permanentemente todas as decisões.', 'Orientar por perguntas, combinar uma etapa e acompanhar a autoria do grupo.'] },
  { module: 4, skill: 'organizar-protagonismo-responsavel', prompt: 'Qual organização permite protagonismo na melhoria de um espaço escolar?', options: ['Definir limites e abrir decisões reais, com pesquisa, justificativa e avaliação.', 'Decidir tudo antes e deixar apenas a montagem aos estudantes.', 'Pedir opiniões sem nunca dar retorno.', 'Impor uma profissão futura como condição de participação.'] },
  { module: 5, skill: 'avaliar-experiencia-integrada', prompt: 'Uma apresentação é visualmente boa, mas interpreta dados incorretamente. Qual devolutiva é formativa?', options: ['Avaliar apenas a aparência.', 'Rotular o grupo como incapaz.', 'Reconhecer a comunicação, retomar a interpretação e oferecer revisão.', 'Dispensar o conhecimento porque houve criatividade.'] },
];

const exam = [
  { module: 1, skill: 'distinguir-integralidade-jornada', prompt: 'Educação integral e jornada ampliada são:', options: ['Sinônimos em qualquer contexto.', 'Uma concepção de formação e uma organização do tempo, que precisam ser articuladas.', 'Conceitos que excluem conhecimento acadêmico.', 'Nomes para aumentar o número de exercícios.'] },
  { module: 1, skill: 'distinguir-integralidade-jornada', prompt: 'Uma proposta interdimensional coerente deve:', options: ['Eliminar o raciocínio científico.', 'Classificar estudantes em quatro personalidades.', 'Incluir atividades aleatórias sem objetivos.', 'Integrar experiências com intencionalidade e evidências de aprendizagem.'] },
  { module: 2, skill: 'planejar-integracao-dimensoes', prompt: 'Qual conjunto corresponde às dimensões discutidas nas referências do curso?', options: ['Racionalidade, afetividade, corporeidade e transcendência.', 'Somente desempenho em provas.', 'Quatro níveis fixos de inteligência.', 'Apenas tempo, espaço, nota e frequência.'] },
  { module: 2, skill: 'planejar-integracao-dimensoes', prompt: 'Trabalhar sentidos e valores pedagogicamente exige:', options: ['Impor a crença do professor.', 'Dar nota à religiosidade do estudante.', 'Respeitar perspectivas e evitar exposição íntima ou adesão obrigatória.', 'Dispensar critérios para o diálogo.'] },
  { module: 3, skill: 'exercer-presenca-educativa', prompt: 'Presença educativa se distingue de presença apenas física porque:', options: ['Controla todas as escolhas do jovem.', 'Envolve escuta, orientação e acompanhamento intencionais.', 'Dispensa qualquer objetivo de ensino.', 'Cria dependência exclusiva do adulto.'] },
  { module: 3, skill: 'exercer-presenca-educativa', prompt: 'Quando o estudante assume etapas de uma tarefa com autonomia, o apoio docente deve:', options: ['Permanecer sempre idêntico e substituir a autoria.', 'Ser retirado de todo o processo sem acompanhamento.', 'Converter dificuldades posteriores em rótulos.', 'Ser ajustado, mantendo os pontos de revisão necessários.'] },
  { module: 4, skill: 'organizar-protagonismo-responsavel', prompt: 'Qual evidência diferencia participação efetiva de participação aparente?', options: ['As propostas dos estudantes influenciam decisões possíveis e recebem retorno.', 'Os estudantes apenas executam uma decisão pronta.', 'Existe consulta sem qualquer resposta.', 'A palavra protagonismo aparece no título.'] },
  { module: 4, skill: 'organizar-protagonismo-responsavel', prompt: 'No trabalho com projeto de vida, uma abordagem adequada é:', options: ['Exigir uma profissão definitiva de todos.', 'Construir e revisar metas, reconhecendo interesses, condições e oportunidades.', 'Atribuir qualquer resultado apenas à força de vontade.', 'Impedir mudanças de escolha após uma atividade.'] },
  { module: 5, skill: 'avaliar-experiencia-integrada', prompt: 'Qual critério observa colaboração sem julgar personalidade?', options: ['Falar mais alto que os colegas.', 'Demonstrar extroversão em toda situação.', 'Distribuir tarefas, escutar propostas e justificar decisões.', 'Revelar questões íntimas ao grupo.'] },
  { module: 5, skill: 'avaliar-experiencia-integrada', prompt: 'A avaliação modifica o ensino quando:', options: ['As evidências orientam devolutivas, apoios e nova oportunidade de revisão.', 'Serve apenas para preencher relatório.', 'Substitui a observação por impressão pessoal.', 'Evita qualquer alteração no planejamento.'] },
];

export const courseRevision = defineCourse({
  courseId: 'b55a877b-e50d-436a-bf05-83ee4c4f5cd4', slug: 'aperfeicoamento-em-educacao-interdimensional',
  courseName: 'Aperfeiçoamento em Educação Interdimensional', hours: 156,
  audience: 'Educadores interessados em formação integral, presença educativa, protagonismo e avaliação de experiências integradas.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'pe-interdimensional', title: 'Secretaria de Educação de Pernambuco — Ementa de educação interdimensional, 2026', url: 'https://educape.educacao.pe.gov.br/docente/course/info.php?id=129' },
    { id: 'sp-modelo-integral', title: 'Secretaria de Educação de São Paulo — Modelo pedagógico e de gestão do Ensino Integral', url: 'https://efape.educacao.sp.gov.br/curriculopaulista/wp-content/uploads/2022/01/Modelo-Pedag%C3%B3gico-e-de-Gest%C3%A3o-1.pdf' },
    { id: 'mg-modelo-integral', title: 'Secretaria de Educação de Minas Gerais — Documento orientador EMTI, 2022', url: 'https://www.educacao.mg.gov.br/wp-content/uploads/2023/01/DOCUMENTO-ORIENTADOR-EMTI-2022.pdf' },
  ],
}, modules, activities, exam);

export default courseRevision;
