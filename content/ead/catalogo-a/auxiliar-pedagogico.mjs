import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Plano docente, objetivo de aprendizagem e tarefa de apoio',
    skills: ['relacionar-objetivo-apoio-pedagogico'], sourceIds: ['mec-bncc', 'mec-recomposicao'],
    sections: [
      { title: 'Ensino: o recurso e a atividade precisam servir ao que se quer aprender', paragraphs: [
        'O auxiliar pedagógico participa da organização e do acompanhamento das propostas em articulação com o professor. O objetivo indica a aprendizagem que se pretende desenvolver; a atividade é a situação organizada para favorecê-la; o recurso é um meio utilizado. Esses elementos não são intercambiáveis. Distribuir um cartaz ou executar um jogo não demonstra, por si só, que o estudante compreendeu o conteúdo. Antes de preparar o apoio, é necessário conhecer a intenção docente.',
        'Uma habilidade não se reduz ao nome de um tema. No tema tabelas, por exemplo, o objetivo pode ser localizar uma informação e relacionar linha e coluna. O apoio precisa manter essa relação visível e permitir que o estudante a examine. Se o adulto aponta sempre a célula correta e fornece a resposta, pode terminar a tarefa sem produzir evidência da aprendizagem pretendida. A ajuda deve ampliar a possibilidade de pensar e participar, não substituir a ação do estudante.',
        'Combine com o professor o que preparar, o que observar e quando solicitar intervenção. O auxiliar não altera sozinho o objetivo ou o critério de avaliação para facilitar o preenchimento. Também não transforma uma orientação comum em tarefas idênticas para toda situação: Educação Infantil e Ensino Fundamental têm organizações curriculares e propostas próprias. A rotina de apoio inclui conferir se materiais e instruções correspondem à versão planejada e se estão disponíveis no momento necessário.',
      ] },
      { title: 'Caso resolvido: jogo bonito sem relação com a habilidade', paragraphs: [
        'O professor pretende que estudantes comparem quantidades representadas em uma tabela. O auxiliar encontra um jogo visualmente atraente que exige apenas memorizar cores. Antes de substituir a proposta, verifica que o recurso não trabalha a relação pretendida. Conversa com o professor e prepara a tabela e os apoios combinados. A escolha é orientada pela aprendizagem, e não apenas pelo entusiasmo que um material pode gerar.',
        'Durante a tarefa, observa se o estudante encontra as categorias e explica a comparação. Uma resposta correta obtida após o adulto apontar tudo tem significado diferente de uma leitura autônoma. O registro identifica o tipo de apoio oferecido, para que a equipe não confunda conclusão da folha com domínio da habilidade. O caso ajuda a organizar tanto os recursos quanto a observação do processo.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Escreva um objetivo fictício de leitura de tabela e separe atividade, recurso e evidência esperada. Proponha uma tarefa de apoio ao professor e uma pergunta que ajude o estudante sem revelar a resposta. Crie um exemplo de recurso interessante que não atende ao objetivo e explique por quê. Confira se o auxiliar conhece a intenção da proposta e se as decisões sobre alteração do planejamento continuam articuladas ao docente. Registre também o que precisaria ser preparado antes do início da aula.',
      ] },
    ],
  },
  {
    title: 'Materiais acessíveis e remoção de barreiras à participação',
    skills: ['reconhecer-barreira-atividade-escolar'], sourceIds: ['mec-bncc', 'mec-inclusao'],
    sections: [
      { title: 'Ensino: dificuldade de acesso não prova ausência de conhecimento', paragraphs: [
        'Um estudante pode compreender o conteúdo e encontrar barreira na forma de apresentação ou resposta. Texto com contraste insuficiente, instrução somente oral em ambiente ruidoso, material fora de alcance ou interface inacessível são problemas da proposta e do ambiente. O auxiliar observa a situação concreta e articula com o professor os apoios necessários. Não conclui incapacidade a partir da primeira dificuldade nem reduz automaticamente a expectativa de aprendizagem.',
        'Adaptação de acesso e alteração do objetivo são decisões diferentes. Se a intenção é interpretar uma informação científica, oferecer o texto em formato acessível pode preservar a aprendizagem pretendida. Se a intenção é observar leitura autônoma de palavras, ler todas elas pelo estudante muda o que está sendo observado. A escolha do recurso precisa considerar a habilidade e os apoios planejados. Não existe um único recurso obrigatório para todas as pessoas com um mesmo diagnóstico.',
        'Organize materiais e instruções de forma clara e utilizável pelo grupo, considerando necessidades específicas com a equipe. Antecipar barreiras costuma ser melhor que esperar a exclusão acontecer. Apoio não significa manter o estudante isolado ao lado do adulto, com uma tarefa sem vínculo com a turma. A proposta deve favorecer participação, interação e autonomia possível. Ouvir o próprio estudante ajuda a compreender qual recurso funciona e quais dificuldades permanecem.',
      ] },
      { title: 'Caso resolvido: responder de outra forma sem mudar o objetivo', paragraphs: [
        'A turma precisa comparar características de dois ambientes naturais. Um estudante consegue comunicar a comparação, mas o modo de resposta exclusivamente manuscrito cria uma barreira identificada pela equipe. O professor define uma forma de expressão acessível que mantém o conteúdo a comparar. O auxiliar prepara o recurso combinado e registra o apoio. A mudança não é dispensar o estudo do tema; é permitir que o conhecimento seja expresso.',
        'Em outra tarefa, o objetivo é produzir determinado registro escrito. A mesma solução não pode ser aplicada sem examinar o que se pretende avaliar. O caso mostra que acessibilidade exige análise pedagógica, em vez de uma regra automática. O auxiliar comunica a barreira e contribui com a execução do apoio, enquanto o docente define os critérios e articula os recursos especializados quando necessários.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Escolha uma atividade fictícia e identifique uma barreira de apresentação, uma de espaço e uma de resposta. Para cada uma, proponha um apoio a discutir com o professor, indicando qual objetivo deve ser preservado. Explique uma situação em que dar a resposta mudaria a evidência de aprendizagem. Não associe um recurso obrigatório a um diagnóstico. Confira se sua proposta inclui o estudante na experiência da turma e prevê observar se o apoio escolhido efetivamente favorece a participação.',
      ] },
    ],
  },
  {
    title: 'Mediação de leitura e resolução de problemas sem dar respostas',
    skills: ['oferecer-apoio-sem-substituir-raciocinio'], sourceIds: ['mec-bncc', 'mec-recomposicao'],
    sections: [
      { title: 'Ensino: uma pergunta de apoio mantém o estudante no trabalho intelectual', paragraphs: [
        'A mediação combina desafio compreensível e apoio pertinente, conforme o planejamento docente. Antes de ajudar, escute a estratégia do estudante e verifique o ponto em que a dificuldade aparece. Repetir o enunciado mais alto não resolve toda barreira. Perguntas como o que a tarefa está pedindo e onde você encontrou essa informação podem tornar o pensamento visível. A escolha depende do objetivo; um roteiro de perguntas não deve ser aplicado mecanicamente a qualquer conteúdo.',
        'Na compreensão de um texto, o apoio pode convidar a localizar evidências, relacionar partes ou explicar uma interpretação. Dizer o sentido antes de o estudante examinar o texto retira parte da atividade. Em um problema matemático, distinguir dados, pergunta e relação entre quantidades é diferente de procurar uma palavra que supostamente determina a operação. A ajuda deve favorecer a análise da situação e a verificação do resultado, evitando macetes que falham em outros problemas.',
        'A intensidade do apoio precisa ser observada. Uma pessoa pode avançar após reler uma informação; outra pode precisar de representação ou retomada planejada pelo professor. Registre que tipo de intervenção ocorreu e o que o estudante conseguiu fazer depois. Não apresente uma produção conduzida integralmente pelo adulto como desempenho autônomo. Quando a dificuldade indica uma aprendizagem anterior não consolidada, comunique ao docente para orientar a próxima intervenção, em vez de repetir a mesma tarefa sem mudança.',
      ] },
      { title: 'Caso resolvido: dados de um problema de distribuição', paragraphs: [
        'Um problema fictício apresenta 24 cartões a distribuir igualmente entre seis grupos. O estudante afirma que deve somar porque viu dois números. O auxiliar não se limita a fornecer a operação. Conforme a orientação docente, pergunta o que precisa ficar igual e convida a representar a distribuição. Ao separar seis grupos e acompanhar os cartões, o estudante pode relacionar a situação ao quociente e verificar que cada grupo recebe quatro.',
        'O resultado é parte do trabalho, mas o raciocínio também importa. O registro informa se a pessoa organizou os grupos, precisou de material ou apenas repetiu uma resposta. Em uma nova situação, o apoio pode ser reduzido para observar o que foi compreendido. O caso não oferece a regra de que toda expressão igualmente sempre resolve sozinha o problema: a relação entre as quantidades precisa ser analisada no contexto.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie um problema simples diferente do caso e escreva três perguntas de apoio que não entreguem a operação. Em uma proposta de leitura, prepare uma pergunta que peça evidência no texto em vez de uma opinião sem relação com ele. Liste o que observaria antes e depois da ajuda. Revise se sua intervenção permite que o estudante explique a estratégia e se registra o grau de apoio. Discuta com o professor quando uma dificuldade precisa de retomada de conhecimentos anteriores, e não de mais respostas prontas.',
      ] },
    ],
  },
  {
    title: 'Trabalho em grupo, transições e convivência',
    skills: ['organizar-participacao-grupo-escolar'], sourceIds: ['mec-bncc', 'mec-inclusao'],
    sections: [
      { title: 'Ensino: estar sentado junto não garante colaboração', paragraphs: [
        'Uma proposta coletiva precisa de objetivo, organização e oportunidade de participação. Dividir a turma em mesas não garante que todos pensem ou sejam ouvidos. Um estudante pode resolver tudo enquanto os demais apenas copiam. O auxiliar acompanha o que foi combinado com o professor, observa a distribuição de ações e oferece os apoios previstos para a interação. A participação pode ocorrer de formas diferentes, sem exigir uma fala idêntica de todos.',
        'Combinados claros ajudam a regular uso dos materiais, turnos e solicitação de ajuda. Eles precisam ser compreensíveis e aplicáveis à situação, não apenas uma lista de proibições na parede. Quando surge conflito, priorize proteção, escuta e encaminhamento ao fluxo docente. Não exponha o estudante nem use humilhação para obter silêncio. Descrever o acontecimento e apoiar formas de reorganização é diferente de definir alguém como o problema da turma.',
        'Transições entre atividades também exigem planejamento. Quem distribui, onde guardar e como o grupo se desloca são decisões que reduzem espera e confusão. O auxiliar prepara recursos e ajuda a manter a continuidade, sem transformar organização em controle de cada iniciativa infantil. Na Educação Infantil, interações e brincadeiras orientam a proposta; no Fundamental, tarefas e conteúdos precisam de mediação coerente com o currículo. O apoio considera essas diferenças e as orientações do professor.',
      ] },
      { title: 'Caso resolvido: um integrante decide tudo', paragraphs: [
        'Durante uma tarefa de comparação de imagens, uma pessoa segura todo o material e responde sozinha. O grupo parece ocupado, mas parte dos estudantes não teve acesso à proposta. O auxiliar observa a situação e aplica a organização combinada pelo professor: materiais visíveis e oportunidades para que cada pessoa examine e comunique uma relação. Não faz a comparação pelo grupo nem afasta quem precisa de apoio.',
        'O professor recebe informação sobre como a organização afetou a participação, permitindo rever a próxima proposta. Se houver conflito sobre o material, o adulto protege e ajuda a reorganizar conforme os combinados, sem procurar um culpado fixo. O caso mostra que colaboração depende de condições concretas de acesso e interação. A observação do grupo precisa ir além de contar mesas silenciosas ou folhas preenchidas.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Planeje uma tarefa coletiva fictícia com objetivo, materiais e formas de participação. Identifique um sinal de que alguém está apenas copiando e proponha um apoio a combinar com o professor. Escreva uma transição que evite fila longa para buscar um único recurso. Crie um relato de conflito com fatos e intervenção, sem rótulos. Confira se o plano favorece participação e convivência respeitosa e se a organização não substitui a aprendizagem que a tarefa pretende desenvolver.',
      ] },
    ],
  },
  {
    title: 'Evidências, devolutivas e acompanhamento com o professor',
    skills: ['registrar-evidencia-apoio-pedagogico'], sourceIds: ['mec-recomposicao', 'mec-bncc'],
    sections: [
      { title: 'Ensino: avaliação orienta uma próxima ação de ensino', paragraphs: [
        'A observação pedagógica precisa se relacionar ao objetivo da proposta. Concluiu a folha informa pouco quando não mostra o que o estudante compreendeu ou qual apoio recebeu. Uma evidência pode ser uma estratégia explicada, um trecho localizado ou uma comparação construída. O auxiliar registra informações combinadas com o professor, sem atribuir diagnóstico nem definir sozinho resultado avaliativo. O docente utiliza esse conjunto para planejar a continuidade do ensino.',
        'Avaliação diagnóstica identifica pontos de partida; a formativa acompanha o processo e permite ajustar a intervenção; a somativa pode sintetizar resultados em um período. Essas funções não dependem apenas do nome do instrumento. Um teste sem análise e sem ação posterior não produz, por si só, recomposição de aprendizagem. O ciclo precisa relacionar evidência, interpretação pedagógica, intervenção e nova observação. Repetir uma tarefa que não foi compreendida pode manter a mesma dificuldade.',
        'Uma devolutiva útil descreve o avanço e indica o próximo passo relacionado ao trabalho. Muito bem ou está errado podem ser insuficientes quando não mostram o que rever. O apoio segue a orientação docente para não fornecer a resposta que ainda está sendo avaliada. Dados e produções de estudantes devem circular nos canais adequados. Comparações públicas e rótulos não ajudam a compreender o processo e podem prejudicar a participação de quem precisa de apoio.',
      ] },
      { title: 'Caso resolvido: mesma resposta, apoios diferentes', paragraphs: [
        'Dois estudantes apresentam a mesma resposta correta em uma atividade. Um explica como localizou a informação; o outro chegou ao resultado depois que o adulto indicou cada etapa. Registrar apenas certo esconde uma diferença importante para o planejamento. O auxiliar descreve o tipo de apoio e a resposta observada, permitindo ao professor decidir como acompanhar a autonomia e o que precisa ser retomado.',
        'Na proposta seguinte, a equipe observa uma situação semelhante com apoio ajustado. O objetivo não é retirar ajuda de forma abrupta para testar resistência, mas compreender o que se mantém e qual mediação favorece avanço. A devolutiva aponta algo concreto, como a necessidade de conferir a categoria antes de comparar os valores. O caso demonstra por que avaliação e apoio precisam compartilhar a mesma habilidade de referência.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte um registro fictício com habilidade, situação, produção observada, apoio e próximo ponto de acompanhamento pelo professor. Escreva uma devolutiva que indique o que foi compreendido e uma ação a rever, sem entregar a resposta de um item em andamento. Compare dois desempenhos com o mesmo resultado e apoios distintos. Confira se o registro diferencia evidência de julgamento e se a próxima ação de ensino decorre do que foi observado, em vez de repetir uma atividade apenas para preencher tempo.',
      ] },
    ],
  },
];
const activities = [
  { module: 1, skill: 'relacionar-objetivo-apoio-pedagogico', prompt: 'Um recurso atraente não trabalha a habilidade definida pelo professor. O auxiliar deve:', options: ['Substituir a proposta só pela aparência.', 'Considerar que qualquer jogo ensina a mesma coisa.', 'Aplicar e marcar domínio pela animação do grupo.', 'Conferir a intenção docente e preparar recurso coerente com ela.'] },
  { module: 2, skill: 'reconhecer-barreira-atividade-escolar', prompt: 'Um estudante conhece o conteúdo, mas encontra barreira no formato de resposta. A equipe deve:', options: ['Rever o acesso e o apoio, preservando o objetivo em articulação com o professor.', 'Concluir incapacidade.', 'Excluir da tarefa da turma.', 'Oferecer sempre uma atividade sem relação com o tema.'] },
  { module: 3, skill: 'oferecer-apoio-sem-substituir-raciocinio', prompt: 'Ao apoiar um problema matemático, qual pergunta mantém o estudante na análise?', options: ['Quer que eu diga a resposta?', 'Pode copiar o que eu fiz?', 'O que a situação pede e como as quantidades se relacionam?', 'Qual número deve ser marcado sem ler?'] },
  { module: 4, skill: 'organizar-participacao-grupo-escolar', prompt: 'Uma pessoa resolve tudo enquanto o grupo copia. Qual apoio melhora a participação?', options: ['Premiar apenas quem segurou o material.', 'Organizar acesso e oportunidades de contribuição conforme o plano docente.', 'Marcar colaboração pela quantidade de folhas.', 'Afastar quem ainda precisa de ajuda.'] },
  { module: 5, skill: 'registrar-evidencia-apoio-pedagogico', prompt: 'Dois estudantes acertam com níveis de ajuda diferentes. O registro deve:', options: ['Apagar a informação de apoio.', 'Atribuir o mesmo grau de autonomia automaticamente.', 'Concluir que toda ajuda atrapalhou.', 'Descrever produção e apoio recebido para orientar o acompanhamento docente.'] },
];
const exam = [
  { module: 1, skill: 'relacionar-objetivo-apoio-pedagogico', prompt: 'Objetivo, atividade e recurso são:', options: ['Três nomes para o mesmo elemento.', 'Aprendizagem pretendida, situação organizada e meio utilizado, relacionados entre si.', 'Itens que dispensam planejamento.', 'Definidos apenas pelo material mais bonito.'] },
  { module: 1, skill: 'relacionar-objetivo-apoio-pedagogico', prompt: 'Concluir uma folha com todas as respostas fornecidas pelo adulto:', options: ['Comprova domínio autônomo.', 'Dispensa observação.', 'É sempre a melhor evidência.', 'Não comprova, por si só, aprendizagem autônoma da habilidade.'] },
  { module: 2, skill: 'reconhecer-barreira-atividade-escolar', prompt: 'Uma barreira de alcance ou comunicação deve ser analisada:', options: ['Na relação com a proposta e o ambiente, articulando apoios.', 'Como incapacidade definitiva do estudante.', 'Como motivo para dispensar currículo.', 'Por uma solução única para todo diagnóstico.'] },
  { module: 2, skill: 'reconhecer-barreira-atividade-escolar', prompt: 'Ler todas as palavras pelo estudante em uma tarefa que observa leitura autônoma:', options: ['Nunca muda a evidência.', 'Sempre comprova que ele leu sozinho.', 'Pode mudar o que está sendo observado e precisa de análise docente.', 'É equivalente a melhorar contraste do material.'] },
  { module: 3, skill: 'oferecer-apoio-sem-substituir-raciocinio', prompt: 'Antes de intervir, é útil:', options: ['Aplicar o mesmo roteiro sem ouvir.', 'Escutar a estratégia e localizar onde aparece a dificuldade.', 'Fornecer sempre a operação.', 'Cobrar rapidez em vez de compreensão.'] },
  { module: 3, skill: 'oferecer-apoio-sem-substituir-raciocinio', prompt: 'Uma pergunta de compreensão textual pode convidar a:', options: ['Repetir a opinião do adulto.', 'Evitar retornar ao texto.', 'Escolher uma resposta pela extensão.', 'Localizar evidência e explicar a relação com a interpretação.'] },
  { module: 4, skill: 'organizar-participacao-grupo-escolar', prompt: 'O trabalho em grupo exige:', options: ['Condições concretas de acesso, interação e participação na tarefa.', 'Apenas proximidade das cadeiras.', 'Uma única pessoa fazendo tudo.', 'Silêncio como único indicador.'] },
  { module: 4, skill: 'organizar-participacao-grupo-escolar', prompt: 'Uma transição entre propostas fica mais organizada quando:', options: ['Todos disputam o mesmo recurso.', 'Os materiais aparecem depois de longa espera.', 'Recursos, deslocamento e guarda são planejados com o professor.', 'Organização substitui o objetivo da aula.'] },
  { module: 5, skill: 'registrar-evidencia-apoio-pedagogico', prompt: 'O ciclo de avaliação que orienta recomposição relaciona:', options: ['Teste e arquivamento sem análise.', 'Evidência, interpretação, intervenção e nova observação.', 'Somente soma de notas.', 'Repetição infinita da mesma folha.'] },
  { module: 5, skill: 'registrar-evidencia-apoio-pedagogico', prompt: 'Uma devolutiva útil indica:', options: ['Um rótulo permanente.', 'A comparação pública com colegas.', 'Apenas uma aprovação genérica.', 'Avanço observado e próximo passo relacionado à habilidade.'] },
];
export const courseRevision = defineCourse({
  courseId: '5387b9dc-38af-4b43-9cca-644ed61f5dbc', slug: 'auxiliar-pedagogico', courseName: 'Auxiliar Pedagógico', hours: 100,
  audience: 'Estudantes de apoio pedagógico articulado ao professor, com planejamento, acesso, mediação e registro da aprendizagem.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'mec-bncc', title: 'MEC — BNCC, Educação Infantil e Ensino Fundamental', url: 'https://basenacionalcomum.mec.gov.br/images/BNCC_EI_EF_110518_versaofinal_site.pdf' },
    { id: 'mec-recomposicao', title: 'MEC — Guia de avaliação e mediações pedagógicas para recomposição das aprendizagens', url: 'https://www.gov.br/mec/pt-br/recomposicao-aprendizagens/GuiadeAvaliaoeMediaesPedaggicaspar.pdf' },
    { id: 'mec-inclusao', title: 'MEC — Educação inclusiva na escola regular', url: 'https://basenacionalcomum.mec.gov.br/implementacao/praticas/caderno-de-praticas/aprofundamentos/196-educacao-inclusiva-na-escola-regular' },
  ],
}, modules, activities, exam);
export default courseRevision;
