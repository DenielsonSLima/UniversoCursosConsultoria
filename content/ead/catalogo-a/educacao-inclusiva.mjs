import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Educação inclusiva, barreiras e direito à aprendizagem',
    skills: ['analisar-barreira-educacional'], sourceIds: ['camara-lbi', 'camara-pneei'],
    sections: [
      { title: 'Ensino: matrícula e presença precisam se transformar em participação', paragraphs: [
        'A educação inclusiva exige condições de acesso, permanência, participação e aprendizagem. Colocar uma carteira na sala não resolve uma proposta que o estudante não consegue acessar. A Lei Brasileira de Inclusão considera a interação entre impedimentos e barreiras; a análise educacional precisa olhar também para ambiente, comunicação, materiais e atitudes. Uma dificuldade não deve ser atribuída automaticamente à pessoa sem examinar o que a escola oferece e o que impede participar.',
        'A educação especial é uma modalidade transversal. A política nacional vigente contempla estudantes com deficiência, com transtorno do espectro autista e com altas habilidades ou superdotação. Necessidades e potencialidades variam entre pessoas, inclusive com uma mesma identificação. O planejamento pedagógico não pode ser uma lista fixa de tarefas por diagnóstico. Conhecer o estudante, ouvi-lo e examinar o contexto ajuda a definir apoios pertinentes, preservando a expectativa de aprender.',
        'Barreiras podem ser físicas, comunicacionais, tecnológicas, pedagógicas ou atitudinais, entre outras formas presentes na vida escolar. Uma atividade que só permite resposta oral rápida pode excluir alguém que usa outra forma de comunicação. Uma atitude que presume incapacidade também cria restrição de participação. O curso desenvolve análise de situações e planejamento educacional inicial, sem habilitar para diagnóstico clínico, terapias ou substituir a formação exigida para docência e atendimento especializado.',
      ] },
      { title: 'Caso resolvido: estudante presente sem acesso à proposta', paragraphs: [
        'Uma turma interpreta informações apresentadas apenas em uma imagem pequena, projetada longe. Um estudante não consegue acessar o material e recebe outra folha sem relação com o tema. A resposta não deve ser considerada inclusão apenas porque ele permaneceu na sala. A equipe identifica a barreira de apresentação e organiza acesso ao conteúdo e à participação, mantendo a relação com a aprendizagem pretendida e os apoios necessários.',
        'A mudança pode envolver formato acessível, posição, descrição e recursos combinados com o estudante e a equipe, conforme a necessidade. A solução precisa ser testada e acompanhada, não escolhida por uma receita universal. O caso distingue estar no espaço e participar do currículo. O registro aponta o que impedia o acesso, qual recurso foi usado e se houve avanço na interação com a proposta.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Descreva uma atividade fictícia e identifique uma barreira no ambiente, uma na comunicação e uma na atitude dos adultos. Proponha mudanças que preservem vínculo com a aprendizagem da turma. Escreva como ouvir o estudante e verificar se o apoio funcionou. Não use laudos de pessoas reais. Confira se a análise evita uma tarefa desconectada apenas para ocupar tempo e se distingue presença, participação e evidência de aprendizagem, reconhecendo potencialidades e necessidades sem reduzir a pessoa ao diagnóstico.',
      ] },
    ],
  },
  {
    title: 'Educação Infantil: interações, brincadeiras e acesso às experiências',
    skills: ['planejar-experiencia-infantil-inclusiva'], sourceIds: ['mec-bncc', 'camara-pneei'],
    sections: [
      { title: 'Ensino: a experiência comum admite modos diferentes de participar', paragraphs: [
        'Na Educação Infantil, interações e brincadeiras organizam o trabalho pedagógico e os direitos de conviver, brincar, participar, explorar, expressar e conhecer-se orientam as experiências. Inclusão não é antecipar uma sequência de exercícios classificatórios do Ensino Fundamental nem manter uma criança sempre ao lado de um adulto enquanto as outras brincam. O ambiente precisa oferecer possibilidades de encontro com pessoas, objetos, movimento e linguagem, com apoios adequados.',
        'Uma experiência pode ser compartilhada sem exigir o mesmo gesto, tempo ou fala de todas as crianças. Em uma exploração sonora, algumas podem produzir som, outras perceber vibração ou acompanhar uma sequência por recurso acessível, conforme a proposta e as necessidades. O professor planeja a intenção e a equipe analisa o acesso aos materiais, a comunicação e a participação. Não se presume que a criança não tenha interesse apenas porque não responde pela forma inicialmente esperada.',
        'Cuidados e educação são integrados. Alimentação, higiene e transições também envolvem interação, segurança e participação possível, com orientações individuais quando necessárias. O apoio não deve fazer tudo pela criança sem necessidade nem exigir execução independente que não corresponde à condição real. Observe as iniciativas e os recursos que ampliam sua ação. O diálogo com a família ajuda a compreender modos de comunicação e experiências, sem transformar o contexto familiar em motivo de culpa pela barreira escolar.',
      ] },
      { title: 'Caso resolvido: acesso ao material de uma brincadeira', paragraphs: [
        'A turma explora recipientes e objetos adequados ao grupo, mas parte do material fica fora do alcance de uma criança. A equipe poderia levar um único objeto para ela e isolá-la. Em vez disso, reorganiza o espaço e os apoios para permitir que participe da experiência e das interações. A mudança considera segurança e objetivo, não apenas a conveniência de manter o ambiente como estava.',
        'Durante a exploração, a criança comunica uma escolha por gesto. O adulto acolhe e dá tempo de resposta, articulado à forma de comunicação utilizada. O professor registra o que essa participação revela e o que ainda é barreira. O caso demonstra que a experiência não se mede apenas pela produção de um objeto igual: iniciativa, troca e exploração são aspectos pedagógicos que precisam ser observados no contexto.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Planeje uma experiência fictícia de brincadeira com objetivo, materiais adequados e duas formas diferentes de participação. Inclua uma barreira de alcance e outra de comunicação e descreva os apoios a discutir com a equipe. Relacione a proposta a dois direitos de aprendizagem sem apenas copiar seus nomes. Escreva o que observaria para revisar o planejamento. Confira se a criança participa do encontro com o grupo e se o adulto favorece iniciativa, sem transformar o apoio em isolamento ou substituição de toda ação infantil.',
      ] },
    ],
  },
  {
    title: 'Ensino Fundamental: objetivo curricular, acessibilidade e expressão',
    skills: ['preservar-objetivo-com-acessibilidade'], sourceIds: ['mec-bncc', 'camara-lbi', 'camara-pneei'],
    sections: [
      { title: 'Ensino: variar o acesso não significa retirar automaticamente o conteúdo', paragraphs: [
        'No Ensino Fundamental, o planejamento identifica a habilidade, a situação de aprendizagem e a evidência esperada. Acessibilizar envolve examinar como o estudante recebe informação, participa e expressa o que compreendeu. Uma resposta exclusivamente manuscrita pode criar barreira quando o objetivo é analisar relações em Ciências. Outra forma de expressão pode preservar a aprendizagem pretendida. A decisão precisa considerar o que está sendo ensinado e avaliado, em vez de reduzir qualquer tarefa para uma cópia mais curta.',
        'Há situações em que o modo de realizar integra a própria habilidade. Se o objetivo é observar determinada produção escrita, substituir toda escrita por resposta fornecida pelo adulto muda a evidência. Isso não significa negar apoio, mas planejar recursos e critérios de forma explícita com os profissionais responsáveis. Acessibilidade, mediação e ajuste curricular precisam ser registrados e acompanhados. Não se deve apresentar desempenho construído integralmente por outra pessoa como evidência de autonomia do estudante.',
        'Em Matemática, representações táteis, visuais ou de outra natureza podem apoiar o acesso às relações, conforme adequação e objetivo. Na leitura, formato acessível e apoio à compreensão precisam ser distinguidos de dar a interpretação pronta. O estudante deve ter oportunidade de pensar, explicar e retomar. Altas habilidades ou superdotação também demandam apoios e oportunidades pertinentes, sem presumir facilidade igual em toda área ou usar apenas tarefas repetitivas adicionais como resposta pedagógica.',
      ] },
      { title: 'Caso resolvido: comparar dados sem depender de copiar a tabela', paragraphs: [
        'A habilidade de uma proposta é comparar valores em uma tabela e justificar uma conclusão. Um estudante consegue analisar os dados por um recurso acessível, mas a exigência de copiar toda a tabela impede chegar ao trabalho de comparação. A equipe revê essa exigência e prepara o acesso e a expressão previstos no planejamento. O conteúdo não é dispensado; a barreira que consumia a tarefa é reduzida para permitir observar a relação matemática.',
        'O registro informa o recurso utilizado e o raciocínio apresentado, sem atribuir a produção a uma ausência de apoio que não ocorreu. Em uma nova proposta, o acompanhamento verifica o avanço e o apoio ainda necessário. O caso mostra a importância de conhecer o objetivo: se a intenção fosse outra, a decisão poderia ser diferente. Inclusão não se resolve por uma lista automática de facilitar tudo ou exigir tudo igual.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie uma atividade fictícia de leitura ou Matemática com objetivo e evidência esperada. Identifique uma barreira de apresentação e outra de expressão. Proponha uma acessibilização que preserve a habilidade e um exemplo de ajuda que a substitua indevidamente. Explique como registrar o recurso e a resposta do estudante. Acrescente uma possibilidade de aprofundamento para quem necessita de desafio adicional. Confira se as decisões decorrem da análise pedagógica e se não são prescrições universais baseadas apenas em diagnóstico.',
      ] },
    ],
  },
  {
    title: 'AEE, estudo de caso e planejamento colaborativo',
    skills: ['articular-aee-e-classe-comum'], sourceIds: ['camara-pneei', 'inep-aee', 'mec-portaria'],
    sections: [
      { title: 'Ensino: serviços e profissionais se articulam à escolarização', paragraphs: [
        'O Atendimento Educacional Especializado organiza atividades, recursos pedagógicos e de acessibilidade para apoiar o processo de escolarização, de forma complementar ou suplementar conforme o público e a necessidade. Não deve ser confundido com simples reforço de uma matéria nem apresentado como substituto automático da classe comum. O trabalho especializado se articula ao professor regente e à equipe, permitindo que recursos e estratégias cheguem às situações em que a barreira aparece.',
        'A política nacional prevê estudo de caso com identificação de demandas e barreiras, análise do contexto, potencialidades e definição de estratégias e recursos. O resultado fundamenta documentos pedagógicos individualizados, como PAEE e PEI, com atualização e acompanhamento. A participação do estudante e da família integra esse processo. Um laudo pode trazer informação subsidiária, mas não substitui estudo pedagógico nem é condição para garantir a oferta do AEE, conforme o Decreto 12686/2025 atualizado.',
        'O profissional de apoio escolar atua em consonância com os planos e necessidades definidas e não substitui a docência, o professor do AEE ou técnicas privativas de profissões regulamentadas. A responsabilidade não deve ser concentrada em uma pessoa que acompanha o estudante enquanto o restante da equipe se considera dispensado. Comunicação acessível, tecnologia assistiva, tradução/interpretação e outros recursos têm finalidades e profissionais próprios quando aplicáveis. A colaboração identifica quem faz o quê e como verificar o efeito do apoio.',
      ] },
      { title: 'Caso resolvido: recurso existe, mas não chega à sala comum', paragraphs: [
        'Um recurso de comunicação é trabalhado com o estudante em atendimento especializado, mas a sala comum continua usando apenas perguntas orais rápidas. A existência do recurso não resolve a barreira se o planejamento não permite utilizá-lo. Professor regente, AEE, apoio e estudante articulam como ele participa das propostas, com preparação e acompanhamento. A equipe não envia toda dificuldade de volta ao atendimento especializado para evitar rever a aula.',
        'O plano registra situação, recurso, responsabilidade e critério de acompanhamento. Se o apoio não produz o efeito esperado, a análise considera uso, contexto e adequação, em vez de concluir que o estudante falhou com a ferramenta. O caso mostra que um documento individualizado precisa orientar ações reais. Preencher um modelo sem articulá-lo ao currículo e à vida escolar produz papel, mas não garante participação.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Escreva um estudo de caso fictício breve com barreira, potencialidade, apoio e contexto, sem diagnóstico clínico. Desenhe a relação entre classe comum, AEE, estudante, família e profissionais de apoio, indicando responsabilidades diferentes. Proponha uma estratégia que deve sair do atendimento especializado e integrar uma situação de aula. Confira se o plano tem acompanhamento e se nenhum profissional aparece como substituto de todos os outros. Explique por que documento clínico e planejamento pedagógico não são equivalentes.',
      ] },
    ],
  },
  {
    title: 'Avaliação acessível, evidências e revisão dos apoios',
    skills: ['avaliar-aprendizagem-e-apoio-inclusivo'], sourceIds: ['mec-bncc', 'camara-pneei', 'camara-lbi'],
    sections: [
      { title: 'Ensino: saber qual evidência se busca permite interpretar o resultado', paragraphs: [
        'Uma avaliação acessível considera o objetivo, o formato, o tempo, os recursos e a forma de resposta necessários. O apoio precisa permitir demonstrar a aprendizagem sem ocultar o que foi feito pelo estudante e o que foi conduzido pelo adulto. Igualdade de oportunidades não exige impor toda condição idêntica quando isso mantém uma barreira. Também não significa aprovar automaticamente sem acompanhar o que se ensina e o que foi aprendido.',
        'Registre produções e estratégias ao longo do tempo, relacionando evidências à habilidade e aos apoios. Uma única nota pode esconder mudanças importantes ou misturar dificuldades de acesso com dificuldade no conteúdo. A devolutiva indica avanço e próximo passo de ensino em linguagem compreensível. Na Educação Infantil, acompanhamento e registro não têm objetivo de promoção; no Fundamental, critérios e estratégias se articulam ao currículo e às normas do sistema, preservando acessibilidade e expectativa de aprendizagem.',
        'A revisão do apoio pergunta se a barreira foi reduzida e se houve participação e aprendizagem, não apenas se o recurso foi entregue. Um equipamento disponível mas sem uso não é resultado suficiente. O acompanhamento deve ouvir o estudante e dialogar com família e equipe, resguardando informações pessoais. Não divulgue laudos, rótulos ou comparações públicas para justificar uma adaptação. A informação necessária à ação pedagógica precisa circular com finalidade e responsabilidade.',
      ] },
      { title: 'Caso resolvido: mesmo resultado com condições de acesso diferentes', paragraphs: [
        'Em uma avaliação, uma estudante não consegue ler o material no formato apresentado e entrega uma produção incompleta. Depois de organizado o acesso apropriado, explica relações que não ficaram visíveis antes. A equipe não interpreta o primeiro resultado como incapacidade definitiva. Analisa a barreira, o recurso e a evidência posterior, mantendo registro das condições de realização para orientar ensino e acompanhamento.',
        'Isso não elimina a necessidade de trabalhar conteúdos ainda não compreendidos. O plano distingue o que melhorou com o acesso e o que demanda mediação pedagógica. O caso mostra que adaptar e ensinar se articulam, sem serem a mesma operação. A próxima observação verifica a aprendizagem e a adequação dos apoios, permitindo decisões fundamentadas em vez de uma disputa entre exigir tudo igual e deixar de avaliar.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte uma ficha fictícia de avaliação com habilidade, condições de acesso, produção, apoio e próxima intervenção. Compare uma barreira de formato e uma dificuldade de conteúdo, propondo ações diferentes. Escreva uma devolutiva acessível e uma pergunta para ouvir o estudante sobre o recurso. Não use documentos reais. Confira se há evidências ao longo do tempo e se o plano verifica resultado do apoio, sem transformar nota isolada, presença ou simples entrega de equipamento em prova suficiente de inclusão.',
      ] },
    ],
  },
];
const activities = [
  { module: 1, skill: 'analisar-barreira-educacional', prompt: 'Um estudante está na sala, mas recebe tarefa sem vínculo porque não acessa o material da turma. A equipe deve:', options: ['Considerar inclusão concluída pela presença.', 'Manter a tarefa desconectada sempre.', 'Presumir incapacidade sem analisar.', 'Examinar a barreira e organizar acesso, participação e aprendizagem vinculados à proposta.'] },
  { module: 2, skill: 'planejar-experiencia-infantil-inclusiva', prompt: 'Em uma brincadeira, materiais ficam fora do alcance de uma criança. Qual decisão amplia inclusão?', options: ['Reorganizar ambiente e apoios para participar da experiência com o grupo.', 'Isolar com objeto sem relação.', 'Exigir que supere sozinha.', 'Retirar o direito de explorar.'] },
  { module: 3, skill: 'preservar-objetivo-com-acessibilidade', prompt: 'O objetivo é comparar dados, mas copiar toda a tabela cria uma barreira. A equipe deve:', options: ['Dispensar toda Matemática.', 'Dar a conclusão pronta.', 'Rever o acesso e a exigência de cópia, preservando a comparação e sua evidência.', 'Avaliar somente rapidez de copiar.'] },
  { module: 4, skill: 'articular-aee-e-classe-comum', prompt: 'Um recurso é usado no AEE, mas não está integrado às atividades comuns. A ação pertinente é:', options: ['Tratar AEE como substituto de toda aula.', 'Articular professores, estudante e apoios para uso na situação em que existe a barreira.', 'Atribuir tudo ao acompanhante.', 'Considerar entrega do recurso suficiente.'] },
  { module: 5, skill: 'avaliar-aprendizagem-e-apoio-inclusivo', prompt: 'Após ajustar o formato acessível, aparecem conhecimentos antes não demonstrados. O acompanhamento deve:', options: ['Ignorar a condição de acesso.', 'Concluir que não é preciso ensinar mais nada.', 'Apagar o registro anterior sem análise.', 'Distinguir efeito do acesso e necessidades de ensino, com evidências e revisão dos apoios.'] },
];
const exam = [
  { module: 1, skill: 'analisar-barreira-educacional', prompt: 'A educação inclusiva exige:', options: ['Somente matrícula.', 'Condições de acesso, permanência, participação e aprendizagem.', 'Tarefa igual apesar de barreira.', 'Ocupação sem relação com currículo.'] },
  { module: 1, skill: 'analisar-barreira-educacional', prompt: 'Estudantes com uma mesma identificação:', options: ['Sempre precisam do mesmo recurso.', 'Devem receber tarefas fixas por diagnóstico.', 'Dispensam observação pedagógica.', 'Podem ter necessidades e potencialidades diferentes, analisadas no contexto.'] },
  { module: 2, skill: 'planejar-experiencia-infantil-inclusiva', prompt: 'Na Educação Infantil, a proposta inclusiva considera:', options: ['Interações, brincadeiras e direitos de aprendizagem com formas acessíveis de participação.', 'Apenas exercícios classificatórios.', 'Isolamento constante ao lado do adulto.', 'Resposta oral idêntica como única evidência.'] },
  { module: 2, skill: 'planejar-experiencia-infantil-inclusiva', prompt: 'Uma escolha comunicada por gesto deve:', options: ['Ser ignorada até virar fala.', 'Ser tratada como falta de interesse.', 'Ser acolhida na forma de comunicação da criança, com apoio e tempo.', 'Eliminar a possibilidade de interagir.'] },
  { module: 3, skill: 'preservar-objetivo-com-acessibilidade', prompt: 'A decisão sobre forma de resposta precisa considerar:', options: ['Apenas facilidade de corrigir.', 'O objetivo e a evidência de aprendizagem que se pretende observar.', 'Uma redução automática de todo conteúdo.', 'Um recurso único para toda pessoa.'] },
  { module: 3, skill: 'preservar-objetivo-com-acessibilidade', prompt: 'Altas habilidades ou superdotação:', options: ['Garantem facilidade igual em toda área.', 'Dispensam apoio educacional.', 'São atendidas apenas com mais cópias repetitivas.', 'Também demandam oportunidades e apoios pertinentes às necessidades e potencialidades.'] },
  { module: 4, skill: 'articular-aee-e-classe-comum', prompt: 'A oferta do AEE, conforme a política estudada:', options: ['Não deve ser condicionada à apresentação de laudo de saúde e se fundamenta em análise pedagógica das necessidades.', 'Depende sempre de diagnóstico clínico obrigatório.', 'Substitui automaticamente a classe comum.', 'É apenas repetir matéria para toda a turma.'] },
  { module: 4, skill: 'articular-aee-e-classe-comum', prompt: 'PAEE e PEI precisam:', options: ['Ser modelos sem relação com a aula.', 'Transferir toda responsabilidade ao apoio.', 'Derivar do estudo de caso e orientar ações e acompanhamento pedagógicos.', 'Substituir a participação do estudante.'] },
  { module: 5, skill: 'avaliar-aprendizagem-e-apoio-inclusivo', prompt: 'A revisão de um recurso verifica:', options: ['Somente se foi comprado.', 'Se reduziu barreiras e favoreceu participação e aprendizagem.', 'A aparência do equipamento.', 'A divulgação pública de quem o utiliza.'] },
  { module: 5, skill: 'avaliar-aprendizagem-e-apoio-inclusivo', prompt: 'Uma avaliação acessível deve:', options: ['Dispensar qualquer evidência.', 'Presumir autonomia mesmo quando o adulto fez tudo.', 'Confundir formato e conhecimento.', 'Relacionar objetivo, acesso, produção e apoio, orientando o próximo ensino.'] },
];
export const courseRevision = defineCourse({
  courseId: 'bd49b1da-d182-46de-92ab-1b70bcf1b96b', slug: 'educacao-especial-inclusiva', courseName: 'Educação Especial Inclusiva e Ensino Infantil e Fundamental', hours: 180,
  audience: 'Estudantes e equipes que analisam fundamentos e situações de inclusão na Educação Infantil e no Ensino Fundamental, sem substituição da formação docente ou clínica.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'mec-bncc', title: 'MEC — BNCC, Educação Infantil e Ensino Fundamental', url: 'https://basenacionalcomum.mec.gov.br/images/BNCC_EI_EF_110518_versaofinal_site.pdf' },
    { id: 'camara-lbi', title: 'Câmara — Lei Brasileira de Inclusão, texto atualizado', url: 'https://www2.camara.leg.br/legin/fed/lei/2015/lei-13146-6-julho-2015-781174-normaatualizada-pl.pdf' },
    { id: 'camara-pneei', title: 'Câmara — Decreto 12686/2025 atualizado pelo Decreto 12773/2025', url: 'https://www2.camara.leg.br/legin/fed/decret/2025/decreto-12686-20-outubro-2025-798166-normaatualizada-pe.html' },
    { id: 'inep-aee', title: 'Inep — Atendimento educacional especializado e estudo de caso', url: 'https://www.gov.br/inep/pt-br/acesso-a-informacao/perguntas-frequentes/censo-escolar/educacao-especial/o-que-e-o-atendimento' },
    { id: 'mec-portaria', title: 'MEC — Portaria 421/2026 com alterações', url: 'https://mecnormas.mec.gov.br/pesquisa/detalhar/11240' },
  ],
}, modules, activities, exam);
export default courseRevision;
