import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Agenda, confirmação e organização do atendimento',
    skills: ['organizar-agenda-consultorio'], sourceIds: ['ms-acolhimento', 'anpd-seguranca'],
    sections: [
      { title: 'Ensino: transformar disponibilidade em compromisso claro', paragraphs: [
        'A agenda relaciona disponibilidade do profissional, tipo de atendimento e tempo reservado. O atendente precisa conhecer as regras do consultório, inclusive encaixes, retornos, cancelamentos e comunicação de atrasos. Uma vaga visualmente livre pode ter uma finalidade específica. Confirmar sem conferir o tipo de atendimento ou prometer encaixe por iniciativa própria cria compromissos que o serviço talvez não consiga cumprir.',
        'No agendamento, registre identificação necessária, contato autorizado, data, horário, local e orientação administrativa aplicável. A confirmação deve permitir ao paciente entender onde comparecer e como avisar uma mudança. Diferencie agendado, confirmado, cancelado e realizado: são estados diferentes. Se uma mensagem foi enviada, mas ainda não houve resposta, isso não comprova que a pessoa confirmou. O histórico ajuda a evitar duplicidade e comunicação contraditória.',
        'Solicitações que envolvem prioridade clínica precisam seguir o fluxo definido com a equipe de saúde. O atendente pode acolher e comunicar uma necessidade relatada, mas não diagnostica nem decide gravidade por uma descrição breve. Se o caso exige avaliação responsável, acione o profissional ou o encaminhamento previsto sem tratá-lo como simples disputa por ordem na agenda. As decisões administrativas devem estar claramente separadas das decisões clínicas.',
      ] },
      { title: 'Caso resolvido: dois pedidos para o mesmo horário', paragraphs: [
        'Em um consultório fictício, dois atendentes recebem pedidos para o mesmo horário por canais diferentes. Antes de confirmar, consultam a mesma agenda atualizada e verificam qual compromisso já foi registrado. Não basta manter um papel pessoal para lançar depois, pois o intervalo pode ser oferecido novamente. A solução organiza uma única referência e define o estado de cada solicitação, com confirmação ao paciente após a conferência.',
        'Um dos pacientes pede encaixe. O atendente explica que precisa de autorização conforme a regra e encaminha a solicitação ao responsável, sem prometer atendimento imediato. Se houver mudança, registra quem autorizou e informa a nova condição de forma clara. O caso mostra que uma agenda confiável depende de estado, autorização e comunicação, não apenas de preencher horários em uma tabela.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte uma agenda fictícia com seis horários, dois tipos de atendimento e uma reserva que depende de autorização. Simule confirmação, cancelamento e pedido de encaixe. Escreva uma mensagem para cada situação, distinguindo solicitação de compromisso confirmado. Confira se o histórico evita duas marcações para a mesma vaga e se nenhuma fala promete uma decisão clínica ou um encaixe não autorizado. Indique também como a equipe será informada de um atraso sem expor dados pessoais a outros pacientes.',
      ] },
    ],
  },
  {
    title: 'Identificação, cadastro e conferência documental',
    skills: ['conferir-cadastro-consultorio'], sourceIds: ['ms-identificacao', 'anpd-seguranca'],
    sections: [
      { title: 'Ensino: reconhecer a pessoa correta e a informação necessária', paragraphs: [
        'A identificação segura relaciona o atendimento à pessoa correta. Nomes semelhantes, horário marcado e reconhecimento visual não substituem os identificadores e a conferência previstos no serviço. O atendente precisa conhecer o fluxo para atualizar contato, corrigir divergência e solicitar apoio quando houver dificuldade de comunicação. A identificação deve ocorrer de modo respeitoso, evitando anunciar informações sensíveis para toda a recepção.',
        'Cadastros precisam permanecer coerentes ao longo do percurso. Uma correção de contato deve ser registrada no local autorizado e comunicada a quem depende dela. Criar um cadastro novo toda vez que há dúvida pode duplicar históricos e misturar informações. Se houver divergência, verifique os dados e encaminhe a regularização pelo procedimento, sem completar por aparência, memória ou informação de terceiros não confirmada.',
        'A conferência documental é administrativa dentro das responsabilidades definidas. O atendente verifica presença e correspondência de documentos conforme o fluxo, mas não altera conteúdo clínico, assina por outro profissional ou interpreta um resultado para orientar tratamento. Dados e documentos devem ter acesso limitado à necessidade de trabalho. Em exercícios e treinamento, use situações fictícias e não cópias de prontuários reais.',
      ] },
      { title: 'Caso resolvido: cadastro duplicado com contato antigo', paragraphs: [
        'Uma pessoa chega para retorno e aparece em dois cadastros de nomes semelhantes. Um contém telefone antigo e o outro foi criado durante uma marcação recente. O atendente não escolhe aleatoriamente o cadastro que parece mais completo. Confere os identificadores e solicita a regularização responsável, preservando a relação com o atendimento e o histórico. A fusão ou correção, quando aplicável, segue a autorização do sistema e do serviço.',
        'Depois, o contato atualizado passa a ser usado na comunicação autorizada. A equipe identifica que a busca anterior era feita apenas pelo primeiro nome e revê o procedimento. O aprendizado é tratar a causa da duplicidade e manter rastreabilidade, em vez de apagar um cadastro sem avaliar suas informações. Um dado correto no papel não ajuda se o sistema continua usando a versão antiga.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie dois cadastros fictícios com uma semelhança de nome e uma divergência de contato. Descreva como conferir a identidade e encaminhar a regularização sem apagar o histórico. Elabore uma lista de documentos administrativos e justifique por que cada um é necessário no atendimento simulado. Retire campos incluídos sem finalidade. Confira se sua proposta mantém separado o que é conferência documental do que é decisão clínica e se a atualização chega ao ponto de comunicação correto.',
      ] },
    ],
  },
  {
    title: 'Acolhimento, acessibilidade e orientação de percurso',
    skills: ['acolher-orientar-paciente'], sourceIds: ['ms-acolhimento', 'ms-identificacao'],
    sections: [
      { title: 'Ensino: recepcionar é tornar o caminho compreensível', paragraphs: [
        'O acolhimento envolve escutar a necessidade e assumir um encaminhamento responsável, dentro da função. Na recepção, isso inclui explicar o percurso: onde aguardar, como será chamado, quem pode esclarecer uma dúvida e o que acontecerá após a consulta. Uma resposta curta pode ser clara sem ser impessoal. Termos internos e siglas precisam ser traduzidos para quem não conhece a organização do consultório.',
        'Acessibilidade envolve condições de participação e comunicação. Pergunte qual apoio a pessoa necessita, sem presumir incapacidade nem falar somente com o acompanhante quando o paciente pode se comunicar. Respeite o modo de expressão e utilize os recursos disponíveis no serviço. Se uma barreira não puder ser resolvida pelo atendente, comunique à equipe responsável. A adaptação mantém o acesso ao atendimento, em vez de apenas exigir que a pessoa se ajuste ao formato existente.',
        'Orientações de preparo ou continuidade devem reproduzir instruções oficiais do serviço e ser esclarecidas pelo responsável quando houver dúvida clínica. Não invente jejum, suspensão de medicamento ou condição de exame para acelerar a informação. Uma solicitação com relato de agravamento precisa de encaminhamento ao profissional conforme o fluxo; o atendente não classifica sozinho o risco nem oferece um diagnóstico tranquilizador.',
      ] },
      { title: 'Caso resolvido: instrução que não foi compreendida', paragraphs: [
        'Um paciente recebe uma orientação administrativa por escrito, mas informa que não consegue ler naquele formato. Reenviar o mesmo arquivo não enfrenta a barreira. O atendente verifica o apoio disponível e explica o percurso em linguagem acessível, confirmando com o paciente se o próximo passo ficou claro. Quando a dúvida passa a envolver preparo clínico, encaminha ao profissional responsável em vez de completar com uma regra genérica.',
        'Ao fim do atendimento, o paciente consegue explicar onde solicitar o esclarecimento e como receber a orientação confirmada. Esse resultado é mais útil do que registrar apenas “arquivo enviado”. A equipe também avalia se os materiais usados podem ser adaptados para reduzir a repetição da dificuldade. Acolhimento envolve comunicação e continuidade, sem substituir competências clínicas ou expor a pessoa diante da sala de espera.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Escreva uma orientação de percurso para um consultório fictício e depois adapte-a para uma pessoa que precisa de outro formato de comunicação. Inclua uma dúvida administrativa que você pode esclarecer e uma dúvida clínica que deve ser encaminhada. Confira se sua mensagem evita siglas, promessas de resultado e instruções clínicas improvisadas. Simule a verificação de entendimento com uma pergunta que permita à pessoa explicar o próximo passo, sem transformá-la em teste constrangedor.',
      ] },
    ],
  },
  {
    title: 'Privacidade, entrega de documentos e comunicação digital',
    skills: ['proteger-documentos-consultorio'], sourceIds: ['anpd-seguranca', 'ms-identificacao'],
    sections: [
      { title: 'Ensino: o canal precisa ser adequado ao conteúdo', paragraphs: [
        'A rotina do consultório utiliza informações pessoais e de saúde que precisam de proteção. O atendente acessa o necessário à sua atividade e utiliza canais autorizados. Uma conversa informal com alguém conhecido não autoriza revelar presença, diagnóstico, documento ou contato de um paciente. O pedido deve seguir o fluxo de identificação e autorização do destinatário, conforme a organização responsável pelo tratamento dos dados.',
        'Antes de enviar um documento, confira a pessoa, o arquivo, a versão e o canal autorizado. O preenchimento automático pode selecionar um endereço antigo ou de outra pessoa. Compartilhar uma pasta inteira para resolver a entrega de um único documento pode expor informações desnecessárias. Na recepção física, telas e impressos também precisam estar protegidos de leitura por quem aguarda atendimento.',
        'Se houver dúvida sobre autorização, suspenda o encaminhamento automático e peça a avaliação responsável. Não crie regra pessoal para liberar documentos a qualquer familiar ou negar toda solicitação sem analisar o fluxo. Quando ocorre um envio incorreto, comunique o incidente pelo procedimento e preserve as informações necessárias à avaliação. Apagar a mensagem do seu aparelho não comprova que a informação deixou de circular.',
      ] },
      { title: 'Caso resolvido: familiar solicita documento por mensagem', paragraphs: [
        'Uma pessoa diz ser familiar do paciente e pede um documento por um número que não consta no cadastro. O atendente não envia com base apenas no sobrenome ou na urgência alegada. Confere a solicitação e a autorização pelo fluxo do consultório. Se a situação exige decisão sobre representação ou acesso, encaminha ao responsável, mantendo o pedido identificado como pendente até a resposta.',
        'Em outro envio, o sistema sugere um contato antigo. A conferência antes do encaminhamento evita exposição indevida. A equipe passa a revisar o contato autorizado no ponto correto do percurso e registra mudanças. O caso demonstra que privacidade não é somente guardar segredo: é organizar acesso, destinatário, canal e continuidade de forma que a informação chegue a quem deve recebê-la.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Construa uma lista de conferência para entrega de um documento fictício. Inclua identidade, autorização, arquivo, versão e canal. Simule um pedido por terceiro e um envio ainda não realizado com contato divergente. Escreva o encaminhamento das duas situações sem inventar uma regra jurídica universal. Confira se a proposta compartilha apenas o necessário e se descreve a pendência para quem precisa decidir. Não use nomes, documentos ou mensagens reais de pacientes no treinamento.',
      ] },
    ],
  },
  {
    title: 'Passagem de informações, pendências e qualidade do atendimento',
    skills: ['acompanhar-pendencias-consultorio'], sourceIds: ['ms-acolhimento', 'anpd-seguranca'],
    sections: [
      { title: 'Ensino: diferenciar tarefa feita de necessidade resolvida', paragraphs: [
        'O atendimento administrativo continua depois de uma mensagem ou marcação. Uma pendência pode envolver retorno de autorização, correção cadastral, informação a confirmar ou contato com paciente. Para acompanhar, registre situação, próximo passo, responsável e condição de encerramento. Sem isso, a equipe pode considerar um pedido concluído apenas porque alguém iniciou uma ação, deixando a pessoa sem resposta.',
        'A passagem de informações entre turnos deve destacar o que afeta o trabalho seguinte e usar o canal autorizado. Evite detalhes clínicos sem necessidade, julgamentos e abreviações desconhecidas. A pessoa que recebe precisa entender o que já foi confirmado e o que continua pendente. Uma nota como “resolver paciente” não descreve uma ação verificável. O registro deve ajudar a continuidade sem expor informações a quem não participa do atendimento.',
        'Indicadores simples podem apoiar melhoria: conflitos de agenda, contatos devolvidos por erro e solicitações que ficaram sem retorno. Defina o que é contado e em qual período. Um número menor de reclamações não prova automaticamente melhor atendimento; pode haver barreira para registrar a dificuldade. Compare os dados com a observação do percurso e discuta melhorias na organização, em vez de atribuir toda falha à falta de atenção individual.',
      ] },
      { title: 'Caso resolvido: pedido sem responsável pelo retorno', paragraphs: [
        'Um paciente solicita confirmação de uma orientação e recebe a resposta “vamos verificar”. O turno termina e ninguém foi indicado para retornar. A solução é identificar o pedido, o responsável pelo próximo contato e a informação que falta, respeitando os limites de acesso. Quando a equipe responde, registra a confirmação e o canal utilizado. O pedido não deve ser encerrado enquanto o retorno combinado não tiver sido tratado pelo fluxo.',
        'Na revisão semanal, a coordenação percebe que várias pendências não tinham responsável definido. A melhoria inclui um campo claro de encaminhamento e uma conferência no fechamento do turno. Depois, verifica se os pedidos passaram a receber retorno. O caso mostra como qualidade pode ser acompanhada por mudanças concretas no processo, sem depender apenas de discursos sobre cordialidade ou produtividade.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte um quadro fictício com quatro pendências: autorização, cadastro, informação clínica a encaminhar e contato sem resposta. Para cada uma, defina próximo passo, responsável e evidência de conclusão. Escreva uma passagem de turno usando somente os dados necessários. Confira se o texto distingue mensagem enviada de resposta confirmada e se alguém consegue saber o que fazer sem procurar uma informação guardada em conversa pessoal. Proponha uma melhoria de processo e descreva como verificar se ela funcionou.',
      ] },
    ],
  },
];

const activities = [
  { module: 1, skill: 'organizar-agenda-consultorio', prompt: 'Dois canais recebem pedidos para a mesma vaga. Qual organização evita dupla marcação?', options: ['Confirmar nos dois canais e resolver depois.', 'Manter uma agenda pessoal separada para cada atendente.', 'Usar a mesma referência atualizada e conferir o estado antes de confirmar.', 'Considerar toda solicitação automaticamente realizada.'] },
  { module: 2, skill: 'conferir-cadastro-consultorio', prompt: 'Há dois cadastros parecidos com informações diferentes. Qual é a conduta estudada?', options: ['Escolher o que parece mais completo.', 'Conferir identificadores e encaminhar a regularização com preservação do histórico.', 'Apagar ambos antes de avaliar.', 'Criar um terceiro cadastro sem pesquisa.'] },
  { module: 3, skill: 'acolher-orientar-paciente', prompt: 'Uma orientação não pode ser lida no formato enviado. Qual ação enfrenta a barreira?', options: ['Verificar apoio disponível e oferecer comunicação compreensível.', 'Reenviar exatamente o mesmo arquivo como única resposta.', 'Presumir desinteresse.', 'Improvisar instruções clínicas para abreviar o contato.'] },
  { module: 4, skill: 'proteger-documentos-consultorio', prompt: 'Um familiar pede documento por contato não cadastrado. O que deve anteceder o envio?', options: ['Reconhecer o sobrenome como autorização suficiente.', 'Compartilhar a pasta inteira para facilitar.', 'Ignorar qualquer pedido de terceiro sem encaminhamento.', 'Conferir solicitação e autorização pelo fluxo responsável.'] },
  { module: 5, skill: 'acompanhar-pendencias-consultorio', prompt: 'Um pedido ficou com a resposta “vamos verificar”, sem responsável. O que permite acompanhá-lo?', options: ['Encerrar porque houve uma resposta inicial.', 'Publicar a dificuldade para pressionar a equipe.', 'Definir próximo passo, responsável e evidência de conclusão.', 'Esperar que qualquer pessoa se lembre.'] },
];

const exam = [
  { module: 1, skill: 'organizar-agenda-consultorio', prompt: 'Uma mensagem de confirmação foi enviada sem resposta do paciente. Qual estado pode ser afirmado?', options: ['Consulta realizada.', 'Envio feito; confirmação ainda não comprovada.', 'Cancelamento solicitado.', 'Atendimento clínico concluído.'] },
  { module: 1, skill: 'organizar-agenda-consultorio', prompt: 'Um paciente pede encaixe que depende de autorização. O atendente deve:', options: ['Prometer o atendimento para reduzir a espera.', 'Criar uma vaga sem consultar o fluxo.', 'Classificar sozinho a gravidade clínica.', 'Encaminhar a solicitação ao responsável sem prometer uma decisão não confirmada.'] },
  { module: 2, skill: 'conferir-cadastro-consultorio', prompt: 'Qual conjunto torna a atualização cadastral útil ao atendimento?', options: ['Identificação correta, registro no local autorizado e atualização do ponto de comunicação.', 'Apenas a mudança em um papel pessoal.', 'Um cadastro novo a cada dúvida.', 'Informações completadas por aparência.'] },
  { module: 2, skill: 'conferir-cadastro-consultorio', prompt: 'Qual ação ultrapassa uma conferência administrativa de documentos?', options: ['Verificar correspondência com o cadastro.', 'Encaminhar divergência ao responsável.', 'Interpretar resultado para orientar mudança de tratamento.', 'Conferir presença dos documentos previstos no fluxo.'] },
  { module: 3, skill: 'acolher-orientar-paciente', prompt: 'Uma comunicação acessível do percurso deve permitir ao paciente:', options: ['Conhecer todas as siglas internas antes de ser atendido.', 'Entender onde aguardar e qual será o próximo passo.', 'Receber uma promessa de resultado clínico.', 'Substituir as orientações profissionais por mensagens genéricas.'] },
  { module: 3, skill: 'acolher-orientar-paciente', prompt: 'Surge uma dúvida sobre preparo clínico não esclarecida no material do serviço. Qual ação é adequada?', options: ['Inventar um tempo de jejum para todos os casos.', 'Orientar suspensão de medicamento por iniciativa própria.', 'Presumir que qualquer regra de outro exame serve.', 'Encaminhar ao profissional responsável para orientação confirmada.'] },
  { module: 4, skill: 'proteger-documentos-consultorio', prompt: 'Antes de enviar um documento, qual conferência foi ensinada?', options: ['Pessoa, autorização, arquivo, versão e canal.', 'Somente se o arquivo abre no computador.', 'Apenas o primeiro contato sugerido pelo sistema.', 'O sobrenome de quem pediu.'] },
  { module: 4, skill: 'proteger-documentos-consultorio', prompt: 'Um envio incorreto já ocorreu. O que preserva a possibilidade de avaliação responsável?', options: ['Apagar a mensagem e considerar o problema encerrado.', 'Comunicar o incidente pelo procedimento e manter as informações necessárias.', 'Ocultar a situação para evitar registro.', 'Reenviar publicamente para corrigir a entrega.'] },
  { module: 5, skill: 'acompanhar-pendencias-consultorio', prompt: 'Qual passagem de turno permite continuidade?', options: ['“Resolver paciente”, sem contexto.', 'Uma lista de julgamentos sobre pessoas.', 'O que foi confirmado, o que falta, próximo passo e responsável.', 'Detalhes sensíveis expostos a toda a sala.'] },
  { module: 5, skill: 'acompanhar-pendencias-consultorio', prompt: 'Uma melhoria de processo deve ser avaliada por:', options: ['Evidências de que a mudança produziu o retorno ou reduziu a falha definida.', 'Somente a intenção de melhorar.', 'Um número sem período ou definição.', 'Ausência de reclamações como prova única de qualidade.'] },
];

export const courseRevision = defineCourse({
  courseId: '4b740b1a-58ec-4248-93f1-a49ce61d4b0e', slug: 'atendente-de-consultorio-medico',
  courseName: 'Atendente de Consultório Médico', hours: 100,
  audience: 'Interessados em agenda, recepção, cadastro, comunicação e proteção de informações em consultórios.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'ms-acolhimento', title: 'Ministério da Saúde — Acolhimento nas práticas de saúde', url: 'https://bvsms.saude.gov.br/acolhimento/' },
    { id: 'ms-identificacao', title: 'Ministério da Saúde — Protocolo de identificação do paciente', url: 'https://www.gov.br/saude/pt-br/composicao/saes/seguranca-do-paciente/publicacoes/protocolos-de-seguranca-do-paciente/protocolo-de-identificacao-do-paciente/view' },
    { id: 'anpd-seguranca', title: 'ANPD — Guia orientativo de segurança da informação', url: 'https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/anonimizado___guia_orientat-_seg_da_inf_p_atpp.pdf' },
  ],
}, modules, activities, exam);

export default courseRevision;
