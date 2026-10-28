import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Planejar a chegada e reconhecer barreiras de retorno',
    skills: ['planejar-acolhimento'], sourceIds: ['unicef-crises', 'mec-bncc'],
    sections: [
      { title: 'Ensino: acolhimento como organização da experiência escolar', paragraphs: [
        'Acolher no retorno às aulas significa criar condições para que cada estudante compreenda a rotina, encontre adultos de referência e consiga participar. Não se resume a uma festa de boas-vindas. A mesma atividade pode ser acolhedora para quem já conhece a escola e confusa para quem mudou de turma, utiliza outra língua ou precisa de apoio de comunicação. O planejamento começa pelas barreiras concretas: informação incompleta, acesso físico, transporte, materiais e relações com colegas.',
        'Antes da chegada, organize um roteiro com horário, local de recepção, responsável por cada grupo e destino de dúvidas. Comunique à família o que precisa ser levado e como avisar uma dificuldade, usando linguagem direta. Uma mensagem acessível informa o que acontecerá e como pedir ajuda; não exige que todos tenham aplicativo, impressora ou conexão constante. Disponibilize alternativa compatível com os canais reais da comunidade e confira se a mensagem foi compreendida.',
        'Na recepção, apresente nome e função dos adultos de referência, mostre os ambientes necessários e explique a sequência do dia. Observe quem não conseguiu entrar na atividade, sem transformar a observação em rótulo. Perguntar em particular se a pessoa precisa de ajuda é diferente de anunciar à turma que ela tem um problema. Acolhimento pedagógico também não é diagnóstico clínico: necessidades persistentes são discutidas com a equipe responsável e a rede de apoio.',
      ] },
      { title: 'Caso resolvido: retorno após mudança de prédio', paragraphs: [
        'Uma turma retorna em outro prédio. A equipe planejou uma apresentação coletiva longa, mas quatro famílias avisaram que não compreenderam o novo endereço e uma estudante não conhece a rota acessível. A solução começa antes da cerimônia: confirmar o endereço em mensagem curta, indicar ponto de referência, oferecer canal de contato e verificar a rota com a equipe. No primeiro dia, um adulto identificado recebe o grupo e acompanha a apresentação dos espaços. A dificuldade não é falta de interesse dessas famílias; existe uma barreira de informação e orientação.',
        'Para verificar o resultado, a coordenação observa quantos estudantes localizaram a sala, quais dúvidas se repetiram e quais ajustes serão necessários no dia seguinte. Não se mede acolhimento apenas pela quantidade de mensagens enviadas. Envio é uma ação da escola; compreensão e acesso são resultados a observar. O registro deve permitir corrigir a rotina, não produzir uma lista pública de quem teve dificuldade.',
      ] },
      { title: 'Prática e conferência', paragraphs: [
        'Elabore uma mensagem de chegada para uma escola fictícia com dois turnos. Inclua horário, entrada, adulto de referência e canal para dúvidas. Depois crie uma versão que possa ser entregue em papel. Compare as versões: uma família consegue descobrir onde ir e o que fazer sem conhecer as siglas da instituição? Desenhe também uma sequência de cinco momentos da recepção. Confira se cada momento tem responsável e se há alternativa para quem chegar depois. Guarde as duas versões e explique qual barreira cada escolha remove.',
      ] },
    ],
  },
  {
    title: 'Organizar circulação, entrada, saída e comunicação de ocorrências',
    skills: ['organizar-rotina-protetiva'], sourceIds: ['unicef-crises', 'unicef-protecao'],
    sections: [
      { title: 'Ensino: combinar responsabilidades antes do movimento', paragraphs: [
        'Uma rotina protetiva precisa definir quem recebe, quem acompanha deslocamentos e quem decide diante de uma situação fora do previsto. Entrada e saída concentram pessoas, informações e mudanças de responsabilidade. Por isso, um combinado apenas verbal e conhecido por um único funcionário é frágil. A equipe deve conhecer o procedimento institucional para identificação, autorização de saída, atrasos e contato com responsáveis, preservando os direitos e a dignidade de estudantes e visitantes.',
        'Uma lista de verificação transforma a rotina em ações observáveis: conferir se a entrada está sinalizada, se o adulto de referência está presente, se a circulação prevista está disponível e se os canais internos de comunicação funcionam. A lista não substitui inspeção técnica de estrutura ou equipamentos; problemas que exigem avaliação especializada são encaminhados à gestão. Identificar um risco não autoriza improvisar reparos nem exigir que estudantes testem uma condição insegura.',
        'Em uma ocorrência, separe observação de interpretação. “A porta da sala não fechou às 7h20” é um fato verificável; “ninguém cuida da escola” é uma avaliação ampla. Registre local, horário, situação observada, providência inicial e pessoa acionada. Não fotografe crianças para divulgar o episódio em grupos. O compartilhamento deve ocorrer pelo fluxo definido, com a informação necessária para proteger e resolver. Em perigo imediato, a prioridade é seguir o plano local de proteção e acionar os responsáveis pela resposta.',
      ] },
      { title: 'Caso resolvido: mudança não confirmada na saída', paragraphs: [
        'No fim do turno, uma pessoa informa que buscará um estudante, mas a alteração não aparece na orientação recebida pela escola. O funcionário não decide pela aparência ou familiaridade do visitante. Mantém o estudante acompanhado, comunica à equipe responsável e confirma a autorização pelo procedimento institucional e por um contato já conhecido. Uma mensagem apresentada pelo próprio interessado não substitui essa confirmação. A medida evita transferir a responsabilidade antes de esclarecer a informação.',
        'Depois, a equipe identifica que mudanças estavam sendo enviadas para números pessoais de funcionários diferentes. A correção organizacional é centralizar o canal de atualização e comunicar claramente como as famílias devem solicitar alterações. O registro do caso usa o mínimo necessário e não vira exposição do estudante ou da família. A revisão do processo é mais útil do que procurar culpados diante de informações fragmentadas.',
      ] },
      { title: 'Prática e conferência', paragraphs: [
        'Crie uma lista com seis verificações para entrada e saída de uma escola fictícia. Para cada item, indique como perceber uma falha e a quem encaminhar. Escreva também um registro de ocorrência sem nomes reais, contendo apenas fatos e providências. Revise: há alguma acusação sem evidência, dado desnecessário ou ação que depende de profissional especializado? Substitua julgamentos por descrições observáveis e teste se outro integrante da equipe conseguiria entender o que ainda precisa ser resolvido.',
      ] },
    ],
  },
  {
    title: 'Escuta, convivência e encaminhamento de necessidades',
    skills: ['escutar-sem-expor'], sourceIds: ['unicef-protecao', 'mec-bncc'],
    sections: [
      { title: 'Ensino: escutar e manter limites de atuação', paragraphs: [
        'Na volta à escola, estudantes podem demonstrar entusiasmo, retraimento, irritação ou dificuldade de concentração. Uma manifestação isolada não permite concluir sua causa. A escuta começa com disponibilidade, linguagem respeitosa e espaço adequado. Perguntas abertas, como “o que ajudaria você a participar hoje?”, permitem expressar uma necessidade sem impor uma explicação. A pessoa pode preferir conversar em outro momento; uma roda coletiva não deve obrigar relatos pessoais.',
        'Convivência é aprendida em situações concretas. Em vez de apenas dizer “respeitem os colegas”, descreva comportamentos esperados: esperar a vez de falar, pedir ajuda ao adulto de referência, não compartilhar imagens sem autorização e incluir colegas na atividade. Os combinados precisam ser compreensíveis, retomados e aplicados com coerência. Um cartaz cheio de proibições, sem conversa sobre situações reais, não garante entendimento nem participação.',
        'Quando uma fala indica possível violação de direitos, acolha sem desacreditar, culpar ou prometer segredo absoluto. Não conduza uma investigação nem peça repetição detalhada do relato para vários adultos. Registre o necessário conforme o fluxo institucional e acione a equipe responsável pela proteção. A escola deve articular sua atuação com a rede competente. O papel pedagógico não substitui atendimento clínico, investigação ou medidas especializadas de proteção.',
      ] },
      { title: 'Caso resolvido: estudante evita uma atividade em grupo', paragraphs: [
        'Durante um trabalho, um estudante pede para ficar sozinho. Diante da turma, o professor poderia interpretar a recusa como indisciplina e exigir explicações. Uma resposta mais cuidadosa é oferecer uma conversa reservada e uma forma inicial de participação menos exposta. Ao ouvir que o estudante não conhece os colegas, o professor organiza duplas com uma tarefa clara e acompanha a interação. Não há motivo para anunciar uma hipótese de diagnóstico nem obrigá-lo a contar experiências pessoais para justificar o apoio.',
        'Se a dificuldade continuar, o professor registra o que observou, as estratégias usadas e o resultado, e conversa com a equipe pedagógica. Esse registro é diferente de escrever “não socializa”: mostra em quais situações houve barreira e o que ajudou. A decisão posterior pode envolver diálogo com responsáveis e apoios da escola. A escuta tem continuidade quando a equipe verifica se o apoio combinado foi oferecido.',
      ] },
      { title: 'Prática e conferência', paragraphs: [
        'Escreva três perguntas abertas para conhecer necessidades de retorno sem expor histórias pessoais. Construa uma situação de conflito entre colegas e proponha dois combinados observáveis para preveni-la. Depois simule um encaminhamento escrito para a equipe pedagógica: observação, intervenção tentada e necessidade de acompanhamento. Confira se sua proposta contém diagnóstico improvisado, promessa de sigilo absoluto ou pedido de relato público. Reescreva os trechos que ultrapassam a atuação pedagógica e explique qual proteção a mudança oferece.',
      ] },
    ],
  },
  {
    title: 'Avaliação diagnóstica e recomposição da aprendizagem',
    skills: ['planejar-recomposicao'], sourceIds: ['mec-bncc', 'unicef-crises'],
    sections: [
      { title: 'Ensino: descobrir o ponto de partida para ensinar', paragraphs: [
        'A avaliação diagnóstica busca evidências sobre o que o estudante já consegue fazer e quais apoios necessita. Ela serve ao planejamento, não à criação de rótulos permanentes. Uma tarefa curta pode revelar mais que uma prova extensa se exigir a habilidade que se deseja observar. É preciso distinguir dificuldade de conteúdo de barreiras de leitura, comunicação, acesso ao material ou compreensão das instruções.',
        'Escolha uma habilidade, proponha uma situação em que ela apareça e defina o que observar. Em leitura, por exemplo, localizar informação explícita e produzir uma inferência são ações diferentes. Em matemática, repetir uma conta pronta não equivale a escolher a operação num problema. Registre a estratégia usada, o apoio oferecido e os erros relevantes. Uma nota agregada não mostra, sozinha, qual intervenção será adequada.',
        'A recomposição organiza oportunidades de aprender conhecimentos essenciais a partir dessas evidências. Pode envolver retomada de conceitos, agrupamentos temporários, materiais acessíveis e novas tarefas com complexidade gradual. Não consiste em entregar a mesma ficha repetidas vezes nem em eliminar todo desafio. Depois da intervenção, proponha outra situação que exija a mesma habilidade, mas com dados diferentes, e compare o raciocínio observado.',
      ] },
      { title: 'Caso resolvido: resultado baixo com causas distintas', paragraphs: [
        'Uma atividade sobre tabelas teve muitos erros. Ao conversar com a turma, a professora percebe duas situações: alguns estudantes não compreenderam a legenda; outros leram os números, mas não conseguiram comparar as quantidades. A intervenção não precisa ser idêntica. O primeiro grupo recebe uma exploração guiada dos elementos da tabela; o segundo trabalha comparações com materiais e perguntas graduadas. Todos permanecem no percurso da turma, com apoios definidos e possibilidade de mudar de agrupamento.',
        'Na verificação seguinte, a professora usa uma tabela de outro assunto. Se apenas trocar a posição das mesmas respostas, pode medir memória do exercício anterior. A nova tarefa verifica transferência da habilidade. O registro indica quem passou a explicar a comparação e quem ainda precisa de apoio. A decisão é retomada em equipe para que a dificuldade não fique reduzida a “falta de base”, expressão que não orienta uma ação concreta.',
      ] },
      { title: 'Prática e conferência', paragraphs: [
        'Escolha uma habilidade de leitura ou cálculo e crie uma tarefa diagnóstica curta. Escreva duas respostas fictícias com dificuldades diferentes e planeje uma intervenção para cada uma. Elabore uma segunda tarefa com outros dados para verificar aprendizagem. Confira se a habilidade inicial continua sendo exigida, se as instruções são claras e se o apoio não entrega a resposta. Descreva como os resultados modificariam o planejamento da semana seguinte, evitando agrupamentos fixos e comparações públicas entre estudantes.',
      ] },
    ],
  },
  {
    title: 'Acompanhar frequência, retorno e articulação com a rede',
    skills: ['acompanhar-permanencia'], sourceIds: ['unicef-crises', 'unicef-protecao'],
    sections: [
      { title: 'Ensino: acompanhar presença sem confundir ausência com desinteresse', paragraphs: [
        'A frequência mostra parte da participação escolar, mas não explica sozinha por que alguém falta. Transporte, moradia, trabalho familiar, acessibilidade e situações de violência podem criar barreiras. O acompanhamento começa com registro consistente e contato respeitoso, conforme o fluxo da escola. A pergunta é o que impede a presença e que apoio pode ser articulado; uma cobrança genérica pode esconder a necessidade real.',
        'Um plano de acompanhamento registra a situação, o responsável pelo contato, a providência combinada, o prazo para retorno e a forma de verificar o resultado. Diferencie ação e desfecho: “mensagem enviada” não significa “família contatada”; “encaminhamento realizado” não significa “atendimento concluído”. A equipe precisa acompanhar o que aconteceu depois. Utilize dados fictícios em estudos e preserve o acesso aos registros reais para quem necessita deles no trabalho.',
        'A articulação com a rede envolve educação, assistência social, saúde e proteção de direitos, conforme o caso e os protocolos locais. Compartilhar informações não significa circular toda a história de uma família. Indique o necessário à finalidade do atendimento e confirme o canal adequado. A escola não precisa resolver isoladamente todas as barreiras, mas mantém sua responsabilidade de ensinar, acolher e acompanhar a permanência.',
      ] },
      { title: 'Caso resolvido: retorno após ausência prolongada', paragraphs: [
        'Uma estudante deixou de comparecer após a família mudar de endereço. O primeiro contato não é respondido. Em vez de registrar “família não quer colaborar”, a equipe verifica se o telefone continua atualizado e organiza novas tentativas pelo fluxo institucional. Quando consegue contato, identifica dificuldade de transporte. A gestão articula a demanda com o setor competente e combina um retorno com apoio pedagógico. Não basta preencher “encaminhada”: é preciso verificar se a barreira de deslocamento foi enfrentada.',
        'Após o retorno, um adulto de referência acompanha presença, acesso aos materiais e participação na turma. A estudante não é exposta publicamente nem precisa justificar repetidas vezes sua ausência. O plano prevê uma data de revisão e registra apenas o necessário. Se houver outra barreira, a equipe ajusta o apoio. O êxito é permanecer e aprender, não apenas aparecer uma vez no registro de chamada.',
      ] },
      { title: 'Prática e conferência', paragraphs: [
        'Monte um plano fictício de acompanhamento com situação observada, contato, apoio, responsável, prazo e resultado a verificar. Inclua um caso em que a mensagem foi enviada, mas ainda não houve conversa. Explique por que o acompanhamento não pode ser encerrado nesse ponto. Depois defina duas evidências de permanência além da presença em um único dia. Revise o documento para retirar julgamentos e dados desnecessários e escreva como a equipe saberá se a articulação com outro serviço produziu uma resposta.',
      ] },
    ],
  },
];

const activities = [
  { module: 1, skill: 'planejar-acolhimento', prompt: 'Famílias informam que não entendem a mensagem de retorno porque ela usa siglas e só foi enviada por aplicativo. Qual ajuste enfrenta diretamente essa barreira?', options: ['Repetir a mesma mensagem diariamente.', 'Oferecer orientação em linguagem clara e um canal acessível às famílias.', 'Considerar que a confirmação de envio prova compreensão.', 'Reservar a informação para quem comparecer à reunião.'] },
  { module: 2, skill: 'organizar-rotina-protetiva', prompt: 'Uma mudança de responsável pela saída chega por um contato desconhecido. Qual é a providência organizacional adequada antes de liberar o estudante?', options: ['Aceitar a mensagem se contiver o nome completo.', 'Pedir que outros estudantes reconheçam o visitante.', 'Confirmar a alteração pelo procedimento institucional e manter acompanhamento.', 'Deixar a decisão exclusivamente com o estudante.'] },
  { module: 3, skill: 'escutar-sem-expor', prompt: 'Um estudante prefere não falar de sua ausência durante uma roda coletiva. Qual resposta respeita uma escuta acolhedora?', options: ['Oferecer conversa reservada, sem exigir relato público.', 'Exigir a explicação para justificar o acolhimento.', 'Solicitar que colegas expliquem a história dele.', 'Prometer que nenhuma informação será compartilhada em qualquer hipótese.'] },
  { module: 4, skill: 'planejar-recomposicao', prompt: 'Dois grupos erram uma atividade: um não compreende as instruções e outro não domina o conceito. O que a avaliação diagnóstica deve orientar?', options: ['A mesma repetição sem mudança para os dois grupos.', 'Um rótulo permanente de dificuldade.', 'A comparação pública das notas.', 'Intervenções diferentes e uma nova verificação da habilidade.'] },
  { module: 5, skill: 'acompanhar-permanencia', prompt: 'O registro informa apenas “encaminhamento ao serviço realizado”. O que falta para acompanhar a permanência escolar?', options: ['Apagar a situação após encaminhar.', 'Verificar se houve resposta ao encaminhamento e se a barreira foi enfrentada.', 'Publicar os dados da família para acelerar o atendimento.', 'Presumir que qualquer encaminhamento garante retorno.'] },
];

const exam = [
  { module: 1, skill: 'planejar-acolhimento', prompt: 'Qual informação torna uma orientação de chegada utilizável por quem ainda não conhece a escola?', options: ['Apenas a sigla do setor interno.', 'Somente o lema da instituição.', 'Horário, local de recepção, adulto de referência e canal de dúvidas.', 'Uma relação de regras sem indicar como chegar.'] },
  { module: 1, skill: 'planejar-acolhimento', prompt: 'Qual evidência avalia melhor o resultado da recepção planejada?', options: ['Estudantes conseguem localizar sua turma e pedir ajuda.', 'A escola enviou muitas mensagens.', 'O cartaz teve bastante texto.', 'A apresentação coletiva foi longa.'] },
  { module: 2, skill: 'organizar-rotina-protetiva', prompt: 'Qual registro de ocorrência permite atuação objetiva da equipe?', options: ['“A escola está sempre desorganizada.”', '“Ninguém assume suas responsabilidades.”', '“O problema é falta de interesse de todos.”', 'Local, horário, fato observado, providência inicial e pessoa acionada.'] },
  { module: 2, skill: 'organizar-rotina-protetiva', prompt: 'Um equipamento apresenta defeito que exige avaliação especializada. Qual conduta se mantém dentro da organização protetiva da escola?', options: ['Pedir que estudantes testem o risco.', 'Encaminhar à gestão e seguir as medidas de proteção previstas.', 'Improvisar um reparo sem competência técnica.', 'Ignorar até ocorrer um acidente.'] },
  { module: 3, skill: 'escutar-sem-expor', prompt: 'Qual combinado de convivência descreve um comportamento observável?', options: ['Esperar a vez de falar e solicitar ajuda ao adulto de referência.', 'Ser uma pessoa melhor em todas as situações.', 'Não criar problemas para a escola.', 'Demonstrar uma personalidade adequada.'] },
  { module: 3, skill: 'escutar-sem-expor', prompt: 'Diante de fala que sugere violação de direitos, qual ação corresponde aos limites pedagógicos estudados?', options: ['Investigar detalhadamente com toda a turma.', 'Pedir que a história seja repetida a cada funcionário.', 'Acolher, registrar o necessário e acionar o fluxo de proteção responsável.', 'Prometer segredo absoluto para evitar encaminhamento.'] },
  { module: 4, skill: 'planejar-recomposicao', prompt: 'Uma tarefa diagnóstica é mais útil quando:', options: ['Gera apenas uma classificação fixa.', 'Mostra a habilidade, a estratégia usada e o apoio necessário.', 'Evita qualquer registro do raciocínio.', 'Tem a maior quantidade possível de questões.'] },
  { module: 4, skill: 'planejar-recomposicao', prompt: 'Após uma intervenção, como verificar transferência da aprendizagem?', options: ['Repetir a posição da alternativa anterior.', 'Contar quantas páginas foram copiadas.', 'Usar apenas a opinião de colegas.', 'Propor situação diferente que exija a mesma habilidade.'] },
  { module: 5, skill: 'acompanhar-permanencia', prompt: 'O telefone registrado de uma família não responde após ausências. Qual hipótese de trabalho evita um julgamento sem evidência?', options: ['A família decidiu abandonar a escola.', 'O estudante não merece novo contato.', 'O contato pode estar desatualizado e deve ser verificado pelo fluxo da escola.', 'A falta de resposta encerra o acompanhamento.'] },
  { module: 5, skill: 'acompanhar-permanencia', prompt: 'Qual conjunto torna um plano de acompanhamento verificável?', options: ['Situação, apoio, responsável, prazo e resultado a observar.', 'Somente a expressão “caso resolvido”.', 'Uma lista pública de dificuldades familiares.', 'Mensagens enviadas sem registro de retorno.'] },
];

export const courseRevision = defineCourse({
  courseId: '05a4d5b3-c850-40fd-af24-7925e035cbd0',
  slug: 'acolhimento-e-seguranca-no-retorno-as-aulas',
  courseName: 'Acolhimento e Segurança no Retorno às Aulas', hours: 80,
  audience: 'Profissionais da educação que organizam acolhimento, rotinas protetivas e acompanhamento do retorno escolar.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'unicef-crises', title: 'UNICEF/Undime — Busca Ativa Escolar em crises e emergências', url: 'https://www.unicef.org/brazil/innocenti/relatorios/busca-ativa-escolar-em-crises-e-emergencias' },
    { id: 'unicef-protecao', title: 'UNICEF/Undime/Avante — Busca Ativa Escolar e proteção contra violências', url: 'https://www.unicef.org/brazil/innocenti/brazil/relatorios/busca-ativa-escolar-e-protecao-contra-violencias' },
    { id: 'mec-bncc', title: 'MEC — Base Nacional Comum Curricular', url: 'https://basenacionalcomum.mec.gov.br/images/BNCC_EI_EF_110518_versaofinal_site.pdf' },
  ],
}, modules, activities, exam);

export default courseRevision;
