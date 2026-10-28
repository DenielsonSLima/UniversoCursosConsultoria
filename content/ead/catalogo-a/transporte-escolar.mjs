import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Condutor, veículo e autorização: requisitos distintos',
    skills: ['distinguir-requisitos-transporte-escolar'], sourceIds: ['ctb-atual', 'contran-formacao', 'detran-especializados'],
    sections: [
      { title: 'Ensino: documentação do motorista não regulariza automaticamente o serviço', paragraphs: [
        'O transporte de escolares envolve requisitos do condutor, do veículo e da operação. A habilitação de uma pessoa não substitui a autorização do veículo nem as exigências locais aplicáveis ao serviço. O CTB trata da condução de escolares nos artigos 136 a 139. Este curso livre de fundamentos não substitui o curso especializado e o processo exigidos pelos órgãos de trânsito, nem gera registro no Renach. A comprovação profissional precisa ser conferida nos canais oficiais.',
        'O artigo 138 exige idade superior a 21 anos, habilitação na categoria D, não ter cometido mais de uma infração gravíssima nos últimos doze meses e aprovação no curso especializado regulamentado pelo Contran. A formação especializada está disciplinada pela Resolução Contran 1020/2025 e pelos normativos da Senatran, incluindo a Portaria 923/2025. Não se deve usar automaticamente uma apostila antiga para definir os requisitos atuais. A situação do condutor e os demais exames e registros aplicáveis dependem de conferência oficial.',
        'Para o veículo, o CTB prevê autorização, registro como veículo de passageiros, inspeção semestral e equipamentos obrigatórios e de segurança, entre outros requisitos. A autorização fica em local visível no interior, com a lotação permitida; não se transporta acima da capacidade. A inspeção periódica não elimina a necessidade de verificar condições antes de cada operação. O município também pode aplicar exigências previstas em seus regulamentos, que precisam ser consideradas na organização do serviço.',
      ] },
      { title: 'Caso resolvido: CNH regular e veículo sem autorização conferida', paragraphs: [
        'Uma empresa apresenta a CNH do motorista e informa que isso basta para iniciar a rota. A conferência está incompleta: ainda é necessário verificar formação e requisitos do condutor, autorização e condições do veículo e as regras da operação. Não se deve transformar um documento correto em prova de regularidade de todos os elementos. A pendência precisa ser resolvida pelo responsável antes de realizar o serviço em condição irregular.',
        'Uma ficha separa campos de condutor, veículo e operação, com fonte da verificação e situação. O controle não cria uma licença própria; serve para localizar o que foi efetivamente conferido e o que ainda falta. O caso mostra por que certificação de curso livre e documento de habilitação têm finalidades diferentes. Também evita que uma atualização normativa fique escondida atrás de um checklist copiado de anos anteriores.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Elabore um quadro fictício com três grupos: condutor, veículo e operação. Atribua a cada grupo um requisito e o canal oficial de conferência, sem usar documentos de pessoas reais. Inclua uma pendência de autorização e explique por que uma CNH válida não a resolve. Compare curso livre e formação especializada prevista na regulamentação. Revise se o quadro distingue inspeção periódica e verificação cotidiana, preserva a lotação permitida e reconhece a necessidade de consultar as regras locais aplicáveis.',
      ] },
    ],
  },
  {
    title: 'Rota, pontos de parada e conferência antes da saída',
    skills: ['planejar-rota-escolar-segura'], sourceIds: ['ctb-atual', 'fnde-operacao'],
    sections: [
      { title: 'Ensino: tempo de percurso e segurança são considerados juntos', paragraphs: [
        'A rota organiza sequência de pontos, horários, capacidade e condições de acesso à escola. O menor trajeto em distância não é necessariamente o mais seguro ou utilizável pelo veículo. Visibilidade, espaço de parada, circulação de pedestres, condições da via e necessidades dos estudantes interferem na escolha. Mudanças precisam ser comunicadas e aprovadas pelo fluxo de gestão da operação; não se cria um ponto improvisado apenas porque alguém pediu por mensagem durante o percurso.',
        'Antes da saída, a rotina de conferência verifica condições observáveis e documentação pertinente, segundo o procedimento e a responsabilidade técnica de manutenção. Pneus, luzes, portas, cintos e saídas de emergência precisam estar em condição adequada. Um checklist não autoriza diagnóstico mecânico por pessoa sem competência. Diante de falha relevante, comunique e interrompa a liberação conforme o fluxo. Assinar todos os campos sem verificar não torna o veículo seguro.',
        'O planejamento inclui a relação de estudantes da rota e a forma de registrar embarques, ausências, desembarques e alterações autorizadas. O documento precisa estar atualizado e acessível a quem executa a operação, com proteção dos dados. Uma lista antiga pode gerar falsa conferência de capacidade ou de presença. Condutor e monitor, quando houver, precisam conhecer suas responsabilidades e como transmitir uma mudança, sem depender de comentários que não chegam a todos os envolvidos.',
      ] },
      { title: 'Caso resolvido: atalho e ponto sem área segura de parada', paragraphs: [
        'Um atalho reduziria alguns minutos, mas exige parar em um trecho de baixa visibilidade e sem condição adequada para o embarque. A economia de tempo não justifica incluir esse ponto por iniciativa do condutor. A situação é encaminhada à gestão da rota para análise das alternativas. Enquanto isso, a operação segue o percurso autorizado e o procedimento para qualquer impedimento, sem expor estudantes para cumprir um horário.',
        'Na conferência anterior à viagem, um cinto apresenta defeito. A vaga não se torna utilizável porque o estudante fará um trecho curto. O problema precisa ser tratado pelo fluxo responsável e a operação reorganizada dentro da capacidade efetivamente segura e autorizada. O caso relaciona planejamento e condição do veículo: uma boa rota não compensa equipamento de segurança indisponível.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe uma rota fictícia com três pontos e uma escola. Indique uma condição de visibilidade, uma de parada e uma de acesso que devem ser analisadas. Crie um pedido de alteração e descreva o encaminhamento à gestão, sem decidir por um atalho improvisado. Monte uma conferência prévia com um defeito identificado e o estado da pendência. Revise se o plano evita superar capacidade, mantém a relação de estudantes atual e diferencia observação operacional de manutenção técnica.',
      ] },
    ],
  },
  {
    title: 'Embarque, desembarque e conferência de todos os estudantes',
    skills: ['controlar-embarque-desembarque-escolar'], sourceIds: ['ctb-atual', 'fnde-operacao'],
    sections: [
      { title: 'Ensino: a segurança da rota inclui cada entrada e cada saída', paragraphs: [
        'O embarque ocorre com o veículo imobilizado em condição segura e pelo acesso previsto. Organize a aproximação, evitando disputa, correria e circulação em áreas de manobra. Antes do deslocamento, confira acomodação, uso dos dispositivos de segurança aplicáveis e fechamento adequado. O tipo de veículo e as normas pertinentes orientam os sistemas de retenção; não improvise adaptação de cinto ou equipamento. O motorista precisa manter atenção à condução e combinar com a equipe o apoio necessário.',
        'Presença não é apenas um número. A relação permite identificar quem embarcou, quem não veio e onde ocorreu o desembarque conforme a organização da rota. Uma substituição de ponto ou pessoa que receberá a criança segue o procedimento e as autorizações aplicáveis. Familiaridade ou um recado não confirmado não substituem o fluxo de entrega previsto. Para estudantes que desembarcam com autonomia autorizada, o procedimento deve estar claro à equipe; não se cria a regra no momento da parada.',
        'Ao finalizar o percurso, confira fisicamente o interior e os espaços acessíveis do veículo conforme a rotina, além de reconciliar os registros. Todos saíram não é uma conclusão segura baseada apenas em silêncio ou em um número que parece correto. Uma criança pode estar dormindo ou fora da visão inicial. O fechamento da rota inclui garantir que não restou estudante e comunicar qualquer divergência prontamente ao responsável, sem esperar o próximo turno para investigar.',
      ] },
      { title: 'Caso resolvido: contagem final não corresponde à lista', paragraphs: [
        'Ao encerrar uma rota, o registro indica uma pessoa a mais do que os desembarques confirmados. A equipe não corrige a lista para fazer os números coincidirem. Confere imediatamente o veículo e o percurso dos registros, acionando o responsável pela operação para localizar a divergência e proteger o estudante. A situação precisa de resposta imediata conforme o plano, mesmo que ninguém esteja chamando ou fazendo ruído.',
        'Depois de resolvida a situação, o registro preserva os fatos e a ação realizada. A análise identifica se houve falta de anotação, alteração não comunicada ou falha no procedimento. O objetivo não é apenas fechar uma soma; é assegurar a correspondência entre cada estudante e o término seguro de seu deslocamento. A conferência física final permanece necessária mesmo quando a planilha parece estar correta.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte uma lista fictícia com cinco estudantes, pontos autorizados e estados de embarque e desembarque. Introduza uma divergência e descreva a conferência imediata e a comunicação responsável. Elabore uma rotina final que inclua inspeção física do interior, sem depender apenas de contagem ou silêncio. Acrescente um pedido de saída em ponto diferente e explique como verificar a autorização. Revise se condutor e apoio sabem quem registra e quem confirma, evitando uma responsabilidade que cada um presume ser do outro.',
      ] },
    ],
  },
  {
    title: 'Condução preventiva, atenção e condições adversas',
    skills: ['relacionar-condicoes-conducao-preventiva'], sourceIds: ['ctb-atual', 'detran-especializados'],
    sections: [
      { title: 'Ensino: a velocidade precisa ser compatível com a situação', paragraphs: [
        'A condução preventiva considera via, visibilidade, clima, veículo, circulação e condição do condutor. Estar abaixo da velocidade máxima não garante adequação a toda situação. Chuva, baixa visibilidade ou presença de crianças próximas à via exigem avaliação e margem de segurança. O horário da escola não autoriza recuperar atraso aumentando risco. Uma rota que só funciona com pressa precisa ser revista pela gestão, em vez de transformar a condução arriscada em prática habitual.',
        'A distância percorrida enquanto o motorista percebe e reage não é a mesma que a distância de frenagem. Como exemplo matemático, a 36 km/h o veículo percorre 10 metros por segundo: em um segundo de reação, percorre 10 metros antes de começar a frear. Esse número não é distância segura universal, pois ainda falta a frenagem e as condições variam. Distração aumenta a demora de resposta; freios e pneus em condição inadequada também comprometem a parada.',
        'Não use telefone durante a condução nem tente resolver conflito no interior desviando o olhar por um período prolongado. Quando uma situação exige intervenção incompatível com dirigir, realize a parada segura conforme o contexto e o procedimento. Fadiga ou mal-estar não se resolvem apenas abrindo a janela ou aumentando o som. Comunique a condição e reorganize a operação com o responsável. Manter a atenção inclui reconhecer quando não há condição de prosseguir com segurança.',
      ] },
      { title: 'Caso resolvido: atraso e chuva no caminho da escola', paragraphs: [
        'Uma rota está atrasada e começa a chover, reduzindo a visibilidade. A decisão não é compensar o tempo perdido com velocidade maior. O condutor ajusta a condução à condição e comunica o atraso pelo modo seguro previsto, sem manusear telefone enquanto dirige. A gestão e a escola precisam receber a informação para reorganizar o atendimento, mas a comunicação não pode criar uma nova distração na direção.',
        'A revisão posterior considera se os horários previstos eram compatíveis com o percurso e se houve um impedimento excepcional. O indicador de pontualidade deve ser analisado junto à segurança, não usado para estimular pressa. O caso liga uma decisão imediata de prevenção a uma melhoria da rota. Chegar alguns minutos antes não constitui resultado adequado quando depende de reduzir a margem de proteção de estudantes e demais usuários da via.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Descreva uma rota fictícia em três condições: tempo seco, chuva e visibilidade reduzida. Explique por que o mesmo limite máximo não define automaticamente a velocidade apropriada. Calcule quantos metros são percorridos em um segundo a 18 km/h e diga por que isso não representa a distância total de parada. Proponha uma comunicação de atraso sem uso do telefone durante a condução. O exercício não envolve dirigir para testar frenagem; revise se tempo de reação, frenagem e condições do ambiente permanecem diferenciados.',
      ] },
    ],
  },
  {
    title: 'Acessibilidade, comunicação e resposta organizada a ocorrências',
    skills: ['organizar-apoio-ocorrencia-transporte'], sourceIds: ['ctb-atual', 'fnde-operacao', 'detran-especializados'],
    sections: [
      { title: 'Ensino: apoio planejado permite participação com segurança', paragraphs: [
        'O transporte deve considerar necessidades de acesso, comunicação e apoio dos estudantes. Recursos de acessibilidade exigem veículo e equipamento adequados, treinamento e verificação de funcionamento. Não se improvisa fixação, transferência ou embarque manual para substituir um recurso indisponível. A equipe precisa conhecer o plano aplicável e como acionar a gestão quando a condição prevista não está disponível, preservando o estudante durante a reorganização.',
        'A comunicação usa linguagem clara e respeitosa e verifica compreensão. Nem todo estudante responde da mesma forma ou percebe uma instrução apenas oral. Combine formas de orientação com a escola e responsáveis conforme as necessidades, sem expor informações pessoais a todo o grupo. Uma dificuldade de participação pode estar na forma de comunicar ou no acesso, e não em falta de vontade. Condutor e monitor, quando presente, precisam saber como dividir o apoio sem prejudicar a atenção à direção.',
        'A operação necessita de plano para pane, impedimento de rota, acidente ou alteração importante de condição de um estudante. Priorize proteção e acionamento dos serviços e responsáveis adequados à situação. Não invente uma transferência para veículo não autorizado nem aplique manobras de primeiros socorros sem capacitação. Este curso aborda organização da resposta e comunicação, não treinamento prático de socorro. Registre local, horário, pessoas envolvidas e ações realizadas nos canais previstos, protegendo dados e imagens.',
      ] },
      { title: 'Caso resolvido: recurso de acessibilidade indisponível', paragraphs: [
        'Antes do embarque, o recurso previsto para acesso de um estudante não funciona. A equipe não tenta resolver carregando a pessoa de uma forma improvisada para manter o horário. Mantém a proteção e comunica imediatamente à gestão para reorganizar o atendimento com condição adequada. A acessibilidade precisa ser efetiva; a existência de uma etiqueta no veículo não substitui funcionamento e uso correto do equipamento.',
        'A comunicação informa o problema concreto e a necessidade de solução, sem expor o diagnóstico do estudante a outros passageiros. Depois, a revisão verifica a manutenção, a conferência anterior e o plano de contingência. O caso distingue disposição para ajudar de uma ação tecnicamente apropriada. Boa intenção não torna seguro um procedimento para o qual faltam equipamento e treinamento, e a pendência não deve desaparecer do registro porque o horário terminou.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Escreva um plano fictício de comunicação para uma pane e para indisponibilidade de um recurso de acesso. Indique quem precisa ser acionado, quais informações objetivas são necessárias e como preservar estudantes e dados. Não prescreva manobras de socorro ou transferência corporal. Acrescente uma orientação que precise ser apresentada de forma diferente para garantir compreensão. Confira se a resposta evita veículo improvisado, exposição de imagens e continuidade com recurso essencial defeituoso, mantendo a gestão informada até a solução.',
      ] },
    ],
  },
];
const activities = [
  { module: 1, skill: 'distinguir-requisitos-transporte-escolar', prompt: 'Uma CNH válida comprova, sozinha, regularidade de toda a operação escolar?', options: ['Sim, dispensa veículo e autorização.', 'Sim, se a rota for curta.', 'Não; condutor, veículo e operação têm requisitos próprios a conferir.', 'Sim, substitui formação especializada.'] },
  { module: 2, skill: 'planejar-rota-escolar-segura', prompt: 'Um atalho economiza tempo, mas exige parada com baixa visibilidade. O encaminhamento adequado é:', options: ['Incluir imediatamente para cumprir o horário.', 'Submeter a alteração à gestão para análise de segurança, sem improvisar o ponto.', 'Pedir que os estudantes corram até o veículo.', 'Ignorar a condição do ponto.'] },
  { module: 3, skill: 'controlar-embarque-desembarque-escolar', prompt: 'No fechamento, há divergência entre embarques e desembarques. A equipe deve:', options: ['Alterar a lista para fechar a conta.', 'Esperar o próximo turno.', 'Concluir que todos saíram pelo silêncio.', 'Conferir imediatamente veículo e registros e acionar o fluxo responsável para proteger e localizar.'] },
  { module: 4, skill: 'relacionar-condicoes-conducao-preventiva', prompt: 'Com chuva e atraso, qual decisão preserva a prevenção?', options: ['Ajustar a condução à condição e comunicar o atraso pelo modo seguro previsto.', 'Aumentar a velocidade para compensar.', 'Digitar enquanto dirige.', 'Tratar o horário como autorização para reduzir margem de segurança.'] },
  { module: 5, skill: 'organizar-apoio-ocorrencia-transporte', prompt: 'O recurso de acessibilidade previsto não funciona antes do embarque. A equipe deve:', options: ['Improvisar transferência corporal sem treinamento.', 'Omitir o defeito para manter a rota.', 'Proteger o estudante e acionar a gestão para condição adequada, sem improvisação.', 'Transferir para qualquer veículo disponível.'] },
];
const exam = [
  { module: 1, skill: 'distinguir-requisitos-transporte-escolar', prompt: 'O curso livre de fundamentos apresentado:', options: ['Gera automaticamente registro no Renach.', 'Não substitui a formação especializada e os requisitos oficiais de atuação.', 'Dispensa exames e conferências.', 'Autoriza qualquer categoria de CNH.'] },
  { module: 1, skill: 'distinguir-requisitos-transporte-escolar', prompt: 'A inspeção semestral do veículo:', options: ['Elimina conferência cotidiana.', 'Permite operar com cinto defeituoso.', 'Dispensa autorização.', 'Não elimina a verificação das condições antes da operação.'] },
  { module: 2, skill: 'planejar-rota-escolar-segura', prompt: 'Uma rota adequada considera:', options: ['Segurança, pontos, capacidade, acesso e tempo, com alterações pelo fluxo de gestão.', 'Somente a menor distância.', 'Pedidos não confirmados durante a viagem.', 'Qualquer parada para evitar atraso.'] },
  { module: 2, skill: 'planejar-rota-escolar-segura', prompt: 'Um cinto defeituoso em vaga prevista exige:', options: ['Usar a vaga em trecho curto.', 'Pedir que duas pessoas compartilhem outro cinto.', 'Comunicar a falha e reorganizar a operação conforme condição segura e autorizada.', 'Marcar o item como verificado sem ação.'] },
  { module: 3, skill: 'controlar-embarque-desembarque-escolar', prompt: 'A conferência final deve incluir:', options: ['Somente o silêncio do interior.', 'Inspeção física do veículo e reconciliação de cada estudante nos registros.', 'A presunção de que todos seguiram o grupo.', 'A exclusão de linhas divergentes.'] },
  { module: 3, skill: 'controlar-embarque-desembarque-escolar', prompt: 'Uma alteração de ponto ou entrega de estudante deve:', options: ['Ser decidida por familiaridade.', 'Dispensar confirmação para ganhar tempo.', 'Ser comunicada apenas depois.', 'Seguir o procedimento e as autorizações aplicáveis à rota.'] },
  { module: 4, skill: 'relacionar-condicoes-conducao-preventiva', prompt: 'A 72 km/h um veículo percorre 20 m em um segundo. Isso representa:', options: ['Somente distância percorrida nesse segundo; a distância total de parada inclui outros fatores e frenagem.', 'Uma distância universal segura.', 'Toda a frenagem em qualquer chuva.', 'Prova de que distração não altera o risco.'] },
  { module: 4, skill: 'relacionar-condicoes-conducao-preventiva', prompt: 'Mal-estar ou fadiga do condutor devem:', options: ['Ser resolvidos apenas com som alto.', 'Ser ignorados até o fim.', 'Ser comunicados para reorganizar a operação em condição segura.', 'Autorizar aumentar a velocidade.'] },
  { module: 5, skill: 'organizar-apoio-ocorrencia-transporte', prompt: 'Uma dificuldade de compreender instrução somente oral requer:', options: ['Concluir falta de vontade.', 'Rever a comunicação e os apoios com escola e responsáveis, conforme necessidade.', 'Expor o estudante diante do grupo.', 'Retirar toda informação.'] },
  { module: 5, skill: 'organizar-apoio-ocorrencia-transporte', prompt: 'Na resposta a uma pane, a organização deve:', options: ['Transferir para qualquer veículo sem conferência.', 'Publicar imagens dos estudantes.', 'Improvisar manobras para as quais não houve capacitação.', 'Proteger, acionar os responsáveis e serviços adequados e registrar fatos nos canais previstos.'] },
];
export const courseRevision = defineCourse({
  courseId: '07b44c42-47bf-423f-8b84-ea6ad5b73ef7', slug: 'condutor-de-transporte-escolar', courseName: 'Condutor de Transporte Escolar', hours: 80,
  audience: 'Estudantes de fundamentos de segurança e organização do transporte escolar; o curso livre não substitui formação especializada, exames e registros oficiais.',
  subtitle: 'Curso livre teórico: não substitui habilitação, formação especializada, registro no Renach ou prática de condução.',
  objectives: ['Reconhecer o limite deste estudo teórico, sem habilitação especializada ou treinamento prático de condução.', ...modules.map(module => module.title)],
  sources: [
    { id: 'ctb-atual', title: 'ANTT — Código de Trânsito Brasileiro, texto atualizado', url: 'https://anttlegis.antt.gov.br/action/ActionDatalegis.php?acao=abrirTextoAto&cod_menu=7155&cod_modulo=161&link=S&numeroAto=00009503&orgao=NI&seqAto=000&tipo=LEI&valorAno=1997' },
    { id: 'contran-formacao', title: 'ANTT — Resolução Contran 1020/2025', url: 'https://anttlegis.antt.gov.br/action/ActionDatalegis.php?acao=abrirTextoAto&cod_menu=7145&cod_modulo=420&desItem=&desItemFim=&nomeTitulo=codigos&numeroAto=00001020&orgao=CONTRAN%2FMT&seqAto=000&tipo=RES&valorAno=2025' },
    { id: 'detran-especializados', title: 'Detran RJ — Requisitos e formação especializada vigentes', url: 'https://www.detran.rj.gov.br/educacao/cursos-especializados/requisitos-cursos-especializados.html' },
    { id: 'fnde-operacao', title: 'FNDE — Operação dos veículos de transporte escolar, Resolução 45/2013', url: 'https://www.gov.br/fnde/pt-br/acesso-a-informacao/legislacao/resolucoes/2013/resolucao-cd-fnde-no-45-de-20-de-novembro-de-2013' },
  ],
}, modules, activities, exam);
export default courseRevision;
