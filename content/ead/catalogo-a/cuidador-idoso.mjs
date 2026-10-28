import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Pessoa idosa, autonomia e plano de cuidado compartilhado',
    skills: ['apoiar-autonomia-pessoa-idosa'], sourceIds: ['ms-caderneta', 'ms-guia-cuidados'],
    sections: [
      { title: 'Ensino: necessidade de ajuda não elimina a pessoa das decisões', paragraphs: [
        'Pessoas idosas têm histórias, preferências e condições de saúde diferentes. A idade não comprova dependência nem incapacidade de decidir. Cuidar envolve reconhecer o que a pessoa faz, em que necessita de apoio e quais escolhas deseja manter. Autonomia se refere à participação nas decisões; independência se relaciona à realização de atividades sem ajuda. Uma limitação para executar um movimento não significa automaticamente ausência de autonomia para expressar uma preferência.',
        'O plano de cuidado articula a pessoa, família, cuidadores e equipe de saúde conforme a situação. Identifica necessidades, orientações vigentes, atividades possíveis, responsáveis e formas de comunicação. O cuidador apoia o cotidiano e observa mudanças; não assume diagnóstico, prescrição ou procedimentos que exigem competência profissional específica. Ao encontrar uma orientação incompleta, procura esclarecimento, em vez de definir sozinho uma conduta de saúde para preencher a lacuna.',
        'A comunicação deve dirigir-se à pessoa cuidada, com linguagem respeitosa e tempo para resposta. Evite infantilizar, falar apenas com o acompanhante ou presumir que uma dificuldade de ouvir é falta de compreensão. Confirme como ela prefere ser chamada e como pode participar. O plano também precisa considerar descanso e apoio de quem cuida: sobrecarga e ausência de continuidade comprometem a qualidade. Pedir ajuda e organizar revezamento responsável são ações de cuidado, não sinais de desinteresse.',
      ] },
      { title: 'Caso resolvido: ajuda para vestir sem retirar a escolha', paragraphs: [
        'Uma pessoa precisa de apoio para vestir uma peça, mas consegue escolher entre opções adequadas ao contexto. O cuidador apresenta as possibilidades e auxilia a parte do movimento para a qual há necessidade, seguindo as orientações de segurança. Não decide tudo por pressa nem exige que a pessoa execute sem apoio para provar independência. A ação combina escolha, participação possível e assistência efetiva.',
        'A família informa que prefere outra roupa por conveniência. A conversa considera a preferência da pessoa e a condição concreta, sem tratá-la como ausente. Se existe uma limitação que exige avaliação, ela é discutida com a equipe apropriada. O caso diferencia autonomia de execução: oferecer auxílio físico não exige apagar a escolha. Registrar o apoio necessário ajuda a próxima pessoa a manter o mesmo cuidado respeitoso.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie uma rotina fictícia com três atividades que a pessoa realiza, duas em que necessita de ajuda e duas decisões em que expressa preferência. Diferencie autonomia e independência em cada situação. Monte um plano de comunicação com família e equipe, incluindo uma orientação a esclarecer e um momento de descanso do cuidador. Não use diagnóstico de pessoa real. Confira se o plano se dirige à pessoa cuidada e se o apoio permite participação, em vez de fazer tudo por ela ou exigir desempenho sem ajuda.',
      ] },
    ],
  },
  {
    title: 'Ambiente, mobilidade e prevenção de quedas',
    skills: ['reduzir-riscos-ambiente-idoso'], sourceIds: ['ms-caderneta', 'ms-quedas'],
    sections: [
      { title: 'Ensino: uma queda não deve ser aceita como parte inevitável de envelhecer', paragraphs: [
        'A prevenção de quedas considera a pessoa e o ambiente. Iluminação insuficiente, obstáculos, tapetes soltos e piso molhado podem criar riscos nos percursos cotidianos. Caminho para banheiro, acesso à cama e circulação noturna merecem atenção. A avaliação de saúde também é importante: alterações de visão, equilíbrio, medicamentos e outros fatores podem participar do risco. O cuidador comunica episódios de queda, tropeço ou desequilíbrio à equipe, sem concluir que são normais da idade.',
        'Dispositivos de apoio, exercícios e adaptações precisam de orientação adequada à pessoa. Uma bengala emprestada ou um método visto na Internet não substituem avaliação e ajuste. O apoio à mobilidade deve seguir o plano e o treinamento recebido, com atenção às condições do cuidador e do ambiente. Este material não ensina levantamento ou transferência corporal. Força física e boa vontade não tornam segura uma técnica improvisada que pode lesionar a pessoa e quem ajuda.',
        'Observe mudanças no modo de caminhar e na necessidade de apoio e comunique antes de insistir na mesma rotina. Reduzir risco não significa proibir toda atividade e manter a pessoa imóvel por conveniência. A equipe deve buscar equilíbrio entre proteção, participação e mobilidade possível. Depois de uma queda ou alteração importante, acione avaliação conforme a situação e o plano; não esconda o episódio porque aparentemente não houve lesão. A informação sobre quando, como e onde ocorreu ajuda a prevenir novas ocorrências.',
      ] },
      { title: 'Caso resolvido: trajeto noturno com obstáculo novo', paragraphs: [
        'Uma mesa foi colocada no trajeto utilizado à noite entre quarto e banheiro, e a luz não alcança parte do caminho. O cuidador percebe a mudança antes da circulação e reorganiza o ambiente com a pessoa e os responsáveis, garantindo passagem e iluminação adequadas. Não espera um tropeço para considerar o problema. A conferência precisa acompanhar mudanças da casa, e não ocorrer apenas no primeiro dia de trabalho.',
        'Na mesma semana, a pessoa relata desequilíbrio que não tinha antes. A retirada do obstáculo não dispensa comunicar a mudança à equipe de saúde. O risco pode envolver mais de um fator, e o cuidador não deve atribuir tudo ao móvel nem alterar medicamentos por imaginar a causa. O caso mostra duas frentes complementares: reduzir riscos ambientais identificáveis e encaminhar alterações de condição para avaliação competente.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe uma casa fictícia com percurso diurno e noturno, marcando iluminação, obstáculos e acesso ao banheiro. Proponha três melhorias ambientais e diferencie essas ações de uma indicação de dispositivo de marcha pela equipe. Escreva um relato objetivo de desequilíbrio com momento e contexto. Não realize transferência em outra pessoa como teste. Confira se a prevenção preserva a mobilidade possível e se uma mudança de condição é comunicada, sem diagnóstico ou suspensão de medicamento pelo cuidador.',
      ] },
    ],
  },
  {
    title: 'Higiene, conforto, saúde bucal e observação da pele',
    skills: ['organizar-higiene-conforto-idoso'], sourceIds: ['ms-guia-cuidados', 'ms-caderneta'],
    sections: [
      { title: 'Ensino: preparar o cuidado evita interrupções e preserva a dignidade', paragraphs: [
        'O cuidado de higiene começa por combinar o que será feito, preparar materiais e organizar ambiente seguro e privacidade. A pessoa participa no que consegue e recebe auxílio no restante, com respeito a preferências e orientações de saúde. Expor desnecessariamente o corpo ou conversar sobre detalhes pessoais diante de terceiros não é uma parte inevitável do cuidado. Higiene das mãos e uso apropriado dos recursos reduzem o transporte de contaminação entre tarefas.',
        'A saúde bucal merece atenção mesmo quando a pessoa usa prótese ou tem poucos dentes. O cuidado segue a orientação recebida e observa dificuldade, dor ou alteração a comunicar à equipe. Não se considera a ausência de queixa uma prova de que não há necessidade. Objetos pessoais e próteses precisam permanecer identificados e em condições adequadas. Um recurso utilizado por outra pessoa não deve ser compartilhado apenas porque parece limpo.',
        'Durante os cuidados, observe desconforto e alterações da pele sem realizar diagnóstico. Umidade persistente, atrito e permanência prolongada na mesma posição podem exigir revisão do plano pela equipe. A organização de conforto e mudança de posição é individualizada; não imponha uma frequência universal retirada de um exemplo. Não massageie uma área lesionada nem aplique produto ou curativo improvisado. Informe o que foi observado, onde e desde quando, para que o profissional responsável avalie e oriente.',
      ] },
      { title: 'Caso resolvido: alteração da pele percebida na higiene', paragraphs: [
        'Durante um cuidado combinado, o cuidador percebe uma área de pele diferente do aspecto habitual e desconforto relatado pela pessoa. Registra a localização e o observado com privacidade e comunica à equipe responsável. Não escolhe uma pomada pelo nome de uma lesão que imagina reconhecer nem tenta resolver com massagem. A informação deve apoiar avaliação, e o cuidado continua conforme a orientação recebida e a necessidade de proteção.',
        'A equipe também verifica se o plano de conforto, os materiais e os apoios estão adequados. O objetivo não é ocultar a alteração para evitar questionamento da família, mas reconhecer cedo uma situação que precisa de atenção. O caso demonstra o valor da observação durante a rotina e da comunicação objetiva: a higiene oferece uma oportunidade de perceber mudanças, sem transformar o cuidador em responsável por diagnóstico e tratamento.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte uma preparação fictícia para um cuidado de higiene com materiais, privacidade, participação e segurança do ambiente. Inclua um item pessoal que precisa permanecer identificado e uma alteração que deve ser comunicada. Escreva o relato sem rótulo diagnóstico ou fotografia de pessoa real. Explique por que conforto e observação da pele dependem de plano individualizado, não de pomada ou frequência universal. Confira se o cuidado bucal está previsto e se a organização evita deixar a pessoa exposta enquanto alguém busca material esquecido.',
      ] },
    ],
  },
  {
    title: 'Alimentação, hidratação e apoio à participação nas refeições',
    skills: ['acompanhar-alimentacao-idoso'], sourceIds: ['ms-alimentacao-idosa', 'ms-caderneta', 'ms-guia-cuidados'],
    sections: [
      { title: 'Ensino: orientar o ambiente não significa prescrever uma dieta', paragraphs: [
        'A alimentação envolve necessidade nutricional, cultura, preferência e prazer. O apoio organiza o momento e favorece a participação possível, seguindo o plano individual e as orientações dos profissionais responsáveis. Se há dieta, consistência, restrição de líquidos ou outra condição específica, o cuidador não altera por iniciativa própria. Uma regra genérica de quantidade de água ou de textura não serve para todas as pessoas e pode contrariar uma necessidade clínica.',
        'Prepare ambiente tranquilo, utensílios adequados e o apoio de posicionamento indicado, evitando pressa e distrações que comprometam a atenção. Incentivar é diferente de forçar. Observe aceitação e dificuldade, respeitando a dignidade da pessoa. Tosse ou desconforto durante a refeição e mudança na capacidade de mastigar ou engolir devem ser comunicados para avaliação. Não tente resolver oferecendo mais líquido, engrossando uma preparação ou mudando tudo para pastoso sem orientação competente.',
        'Higiene dos alimentos, utensílios e mãos continua necessária. A identificação ajuda a oferecer a preparação correspondente ao plano, sobretudo quando várias pessoas recebem refeições diferentes. Registre o que foi ofertado e consumido quando isso faz parte do acompanhamento, sem chamar de refeição completa uma oferta recusada. O registro não é uma cobrança moral da pessoa; permite que a equipe reconheça mudança de padrão e ajuste o cuidado. Preferências podem orientar a conversa, mantendo as necessidades específicas definidas.',
      ] },
      { title: 'Caso resolvido: menor aceitação e dificuldade durante a refeição', paragraphs: [
        'Uma pessoa que costumava se alimentar com apoio leve passa a consumir menos e demonstra dificuldade na oferta. O cuidador não conclui desobediência nem insiste aumentando a velocidade. Interrompe a oferta que se tornou insegura, mantém a proteção e comunica à equipe responsável conforme o contexto. O relato distingue o que mudou, o alimento oferecido e a dificuldade observada, sem criar uma dieta alternativa por conta própria.',
        'Após a avaliação, a equipe orienta os próximos cuidados e como acompanhar a resposta. A família e o cuidador precisam receber a versão vigente para evitar instruções contraditórias. O caso mostra que conhecer a preferência é útil, mas não resolve sozinho uma mudança de condição. Uma receita doméstica ou uma orientação antiga para outra pessoa não substitui avaliação individual de alimentação e deglutição.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Planeje uma refeição fictícia com participação da pessoa, preparação identificada e orientação individual já definida por equipe competente. Crie um registro de oferta e aceitação que não force consumo nem esconda recusa. Acrescente uma dificuldade nova e descreva a comunicação responsável, sem prescrever consistência, volume de líquido ou manobra de socorro. Confira se o exercício mantém ambiente tranquilo, higiene e atenção e se uma orientação antiga é esclarecida antes de substituir a vigente.',
      ] },
    ],
  },
  {
    title: 'Medicamentos, mudanças de condição e continuidade do cuidado',
    skills: ['rastrear-orientacoes-cuidado-idoso'], sourceIds: ['ms-caderneta', 'ms-guia-cuidados'],
    sections: [
      { title: 'Ensino: informação atual e conferência evitam cuidado duplicado ou omitido', paragraphs: [
        'O apoio relacionado a medicamentos deve seguir prescrição e orientação da equipe de saúde, dentro do papel e da capacitação do cuidador. Não se escolhe dose, horário alternativo, associação ou interrupção por experiência própria. Nome parecido e aparência do comprimido não comprovam correspondência. Dúvida sobre identidade, orientação incompleta, dose esquecida ou recusa exige esclarecimento pelo fluxo competente; nunca dobre por conta própria uma oferta posterior para compensar.',
        'Mantenha a informação dos medicamentos utilizados atualizada e disponível à equipe conforme o acompanhamento, preservando identificação e condições de conservação. Não triture, abra ou misture uma apresentação sem confirmação profissional de que isso é permitido e adequado. Alterar a forma pode modificar seu uso e efeito. O registro distingue previsto, realizado, recusado e pendente de esclarecimento, com horário e responsável. Marcar antes da execução pode fazer outra pessoa acreditar que o cuidado já ocorreu.',
        'Mudanças importantes de consciência, respiração, dor ou condição geral exigem resposta e avaliação compatíveis com a situação, conforme o plano e os serviços de urgência quando necessários. Não espere a rotina do dia seguinte para comunicar uma situação aguda preocupante. Na passagem de cuidado, informe alterações, orientações atualizadas e pendências e confirme o recebimento. O material ensina reconhecimento e comunicação, sem substituir treinamento prático de primeiros socorros, avaliação clínica ou procedimentos de enfermagem.',
      ] },
      { title: 'Caso resolvido: oferta sem registro e risco de repetição', paragraphs: [
        'No início do turno, há dúvida se uma oferta de medicamento orientada já ocorreu. A ausência de marcação não autoriza repetir automaticamente. O cuidador confere com quem realizou o turno anterior e aciona a orientação profissional para resolver a incerteza. Não transforma uma suposição em anotação de realizado nem decide compensar no próximo horário. A prioridade é esclarecer o cuidado com segurança, preservando o fato de que existiu uma divergência.',
        'A revisão do processo combina registrar após a ação e confirmar pendências na passagem de turno. A pessoa cuidada também participa da comunicação na medida possível, sem ser ignorada. O caso evidencia que um quadro com horários não é suficiente: o sistema de continuidade precisa mostrar o que aconteceu, o que não aconteceu e qual decisão ainda depende de esclarecimento. A rastreabilidade evita que pressa e memória substituam conferência.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Elabore um quadro fictício de cuidados orientados com estados previsto, realizado, recusado e pendente, sem colocar nomes ou doses de medicamentos reais. Simule uma dúvida na passagem de turno e descreva a conferência e o pedido de orientação. Escreva um relato de mudança importante de condição com momento e observação, indicando resposta responsável sem diagnóstico. Confira se o plano não permite marcar antecipadamente, compensar doses ou alterar apresentações e se a informação chega a quem dará continuidade ao cuidado.',
      ] },
    ],
  },
];
const activities = [
  { module: 1, skill: 'apoiar-autonomia-pessoa-idosa', prompt: 'Uma pessoa precisa de ajuda para vestir, mas consegue escolher a roupa. O apoio adequado é:', options: ['Decidir tudo para poupar tempo.', 'Exigir que faça sem ajuda.', 'Preservar a escolha e auxiliar o que for necessário com segurança.', 'Falar apenas com a família.'] },
  { module: 2, skill: 'reduzir-riscos-ambiente-idoso', prompt: 'Um obstáculo novo aparece no trajeto noturno e há relato de desequilíbrio recente. O cuidador deve:', options: ['Reorganizar o risco ambiental e comunicar a mudança de condição à equipe.', 'Concluir que toda causa é o móvel.', 'Aceitar quedas como normais da idade.', 'Alterar medicamento por iniciativa própria.'] },
  { module: 3, skill: 'organizar-higiene-conforto-idoso', prompt: 'Uma alteração da pele é percebida durante a higiene. O cuidado estudado exige:', options: ['Diagnosticar e escolher pomada.', 'Massagear a área sem orientação.', 'Ocultar para evitar conflito.', 'Descrever e comunicar a alteração, preservando privacidade e orientação responsável.'] },
  { module: 4, skill: 'acompanhar-alimentacao-idoso', prompt: 'Surge dificuldade nova durante a refeição. O cuidador deve:', options: ['Forçar consumo rápido.', 'Interromper a oferta insegura e comunicar para avaliação, sem mudar dieta por conta própria.', 'Oferecer mais líquido automaticamente.', 'Trocar tudo para pastoso sem consultar.'] },
  { module: 5, skill: 'rastrear-orientacoes-cuidado-idoso', prompt: 'Há dúvida se uma oferta de medicamento já ocorreu. O cuidador deve:', options: ['Repetir automaticamente.', 'Dobrar no próximo horário.', 'Conferir e buscar orientação competente antes de decidir, sem transformar suposição em registro.', 'Marcar realizado para encerrar a pendência.'] },
];
const exam = [
  { module: 1, skill: 'apoiar-autonomia-pessoa-idosa', prompt: 'Autonomia e independência são:', options: ['Participação nas decisões e realização de atividades sem ajuda, dimensões que não devem ser confundidas.', 'Sempre ausentes após certa idade.', 'Sinônimos de fazer tudo pelo outro.', 'Comprovadas apenas por força física.'] },
  { module: 1, skill: 'apoiar-autonomia-pessoa-idosa', prompt: 'O plano de cuidado deve:', options: ['Excluir a pessoa das conversas.', 'Ser decidido apenas pela pressa da rotina.', 'Presumir dependência igual para todas as pessoas idosas.', 'Articular preferências, necessidades, orientações e responsabilidades.'] },
  { module: 2, skill: 'reduzir-riscos-ambiente-idoso', prompt: 'Quedas e episódios de desequilíbrio:', options: ['São inevitáveis e dispensam comunicação.', 'Devem ser valorizados e comunicados para avaliação e prevenção.', 'Autorizam suspender toda mobilidade sem plano.', 'São resolvidos com qualquer dispositivo emprestado.'] },
  { module: 2, skill: 'reduzir-riscos-ambiente-idoso', prompt: 'Uma adaptação ambiental adequada busca:', options: ['Apenas imobilizar a pessoa.', 'Ignorar o percurso noturno.', 'Reduzir obstáculos e melhorar acesso e iluminação, preservando participação possível.', 'Substituir avaliação de uma mudança de saúde.'] },
  { module: 3, skill: 'organizar-higiene-conforto-idoso', prompt: 'Antes da higiene, é pertinente:', options: ['Preparar recursos, combinar o cuidado e preservar privacidade e participação.', 'Expor o corpo enquanto busca material.', 'Usar item pessoal de outra pessoa.', 'Dispensar cuidado bucal quando há prótese.'] },
  { module: 3, skill: 'organizar-higiene-conforto-idoso', prompt: 'O conforto e o acompanhamento de risco para a pele dependem de:', options: ['Uma pomada escolhida por semelhança.', 'Massagem sobre qualquer lesão.', 'Um horário universal que dispensa avaliação.', 'Plano individualizado e comunicação de alterações à equipe.'] },
  { module: 4, skill: 'acompanhar-alimentacao-idoso', prompt: 'A orientação sobre dieta, consistência ou líquidos deve:', options: ['Ser copiada de outra pessoa.', 'Considerar a necessidade individual definida pela equipe competente.', 'Ser alterada sempre que houver preferência diferente.', 'Ser substituída por uma quantidade universal.'] },
  { module: 4, skill: 'acompanhar-alimentacao-idoso', prompt: 'Um registro de alimentação útil distingue:', options: ['Somente a refeição planejada.', 'A opinião de que a pessoa foi obediente.', 'O que foi oferecido, aceitação e dificuldade observada quando pertinentes ao acompanhamento.', 'Oferta e consumo como se fossem a mesma coisa.'] },
  { module: 5, skill: 'rastrear-orientacoes-cuidado-idoso', prompt: 'Triturar ou abrir uma apresentação de medicamento:', options: ['Exige confirmação profissional de adequação; não se altera por iniciativa própria.', 'É sempre permitido.', 'Resolve qualquer recusa.', 'Dispensa conferir identidade.'] },
  { module: 5, skill: 'rastrear-orientacoes-cuidado-idoso', prompt: 'Uma mudança aguda preocupante de condição exige:', options: ['Esperar o próximo dia para relatar.', 'Registrar depois sem comunicar.', 'Buscar um diagnóstico pela Internet.', 'Resposta e avaliação compatíveis com a situação, acionando o fluxo e serviços necessários.'] },
];
export const courseRevision = defineCourse({
  courseId: '8588ff0f-70bf-4224-83e0-80a8e8bbb7c3', slug: 'cuidador-de-idoso', courseName: 'Cuidador de Idoso', hours: 160,
  audience: 'Estudantes de apoio ao cuidado cotidiano da pessoa idosa, com autonomia, observação e articulação com família e equipe de saúde.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'ms-caderneta', title: 'Ministério da Saúde — Caderneta brasileira da pessoa idosa, 2026', url: 'https://www.gov.br/saude/pt-br/composicao/saps/publicacoes/cadernetas-e-cartoes/caderneta-brasileira-da-pessoa-idosa/@@download/file' },
    { id: 'ms-guia-cuidados', title: 'Ministério da Saúde — Guia de cuidados para a pessoa idosa', url: 'https://bvsms.saude.gov.br/bvs/publicacoes/guia_cuidados_pessoa_idosa.pdf' },
    { id: 'ms-quedas', title: 'Ministério da Saúde — Saúde da pessoa idosa e prevenção de quedas', url: 'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/s/saude-da-pessoa-idosa' },
    { id: 'ms-alimentacao-idosa', title: 'Ministério da Saúde — Alimentação saudável da pessoa idosa', url: 'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/s/saude-da-pessoa-idosa/alimentacao-saudavel' },
  ],
}, modules, activities, exam);
export default courseRevision;
