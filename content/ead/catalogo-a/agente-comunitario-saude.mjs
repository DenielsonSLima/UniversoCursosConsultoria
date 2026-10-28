import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'SUS, território e papel do agente comunitário',
    skills: ['reconhecer-papel-acs'], sourceIds: ['lei-acs', 'sesmt-visitas'],
    sections: [
      { title: 'Ensino: aproximar comunidade e equipe de saúde', paragraphs: [
        'O agente comunitário de saúde atua na promoção da saúde e prevenção de doenças, em conexão com a comunidade e a equipe do SUS. Conhecer o território significa reconhecer pessoas, serviços, condições de moradia, circulação e barreiras de acesso. Um mapa com ruas é apenas o começo: duas famílias próximas podem ter possibilidades muito diferentes de chegar à unidade, compreender uma orientação ou manter um acompanhamento.',
        'Diferencie necessidade relatada, observação e decisão clínica. Uma pessoa pode dizer que deixou de ir à unidade porque não conhece o agendamento; o agente ajuda a compreender o fluxo e comunica a barreira à equipe. Isso não equivale a diagnosticar uma doença ou decidir um tratamento. A atuação é articulada, com responsabilidades definidas. Este curso livre estuda fundamentos e situações de trabalho; a formação exigida, o vínculo e as condições para exercer atribuições são definidos pela legislação e pelo serviço competente.',
        'Territorialização não é classificar moradores como “bons” ou “difíceis”. Organize informações sobre a população e os recursos disponíveis: unidade de referência, escolas, assistência social, transporte e iniciativas comunitárias. Reconheça obstáculos, como distância ou dificuldade de comunicação, sem atribuir culpa. A informação é útil quando permite planejar uma resposta e acompanhar o resultado, respeitando o modo de vida das pessoas.',
      ] },
      { title: 'Caso resolvido: serviço próximo, acesso difícil', paragraphs: [
        'Em uma área fictícia, a unidade fica a poucos quarteirões, mas moradores de uma rua deixaram de comparecer a atividades. Ao conversar, o agente identifica que a passagem usual está interditada e a rota alternativa exige transporte. Concluir que a comunidade perdeu o interesse seria um julgamento sem fundamento. O registro descreve a barreira e sua abrangência; a equipe discute alternativas de orientação e articulação com os setores competentes.',
        'A ação seguinte deve ter responsável e retorno: a equipe pode reorganizar a informação sobre acesso e avaliar atividades compatíveis com a realidade local. Depois, verifica se as pessoas conseguiram chegar ou se outra barreira permanece. Contar visitas realizadas não prova que o acesso melhorou. O caso mostra por que conhecer o território exige escuta e acompanhamento, além de localizar endereços num mapa.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe um território fictício com uma unidade de saúde, uma escola e duas barreiras de acesso. Para cada barreira, escreva uma observação verificável, uma pergunta para conhecer a situação e um encaminhamento à equipe. Não use nomes ou endereços reais. Confira se sua proposta diferencia orientação de decisão clínica e se prevê verificar o resultado. Acrescente uma situação que não possa ser resolvida pelo agente isoladamente e explique qual parte da resposta depende do trabalho compartilhado.',
      ] },
    ],
  },
  {
    title: 'Cadastro, atualização e registro responsável',
    skills: ['registrar-informacao-territorial'], sourceIds: ['sesmt-visitas', 'anpd-seguranca'],
    sections: [
      { title: 'Ensino: produzir informação útil sem expor a família', paragraphs: [
        'O cadastro vincula informações de pessoas e famílias ao acompanhamento do território. Não é uma ficha preenchida uma única vez para sempre. Mudança de endereço, composição familiar ou contato pode alterar o planejamento. A atualização deve seguir o instrumento e o fluxo do serviço, com identificação correta. Antes de registrar, explique a finalidade da coleta em linguagem compreensível e esclareça dúvidas sem prometer benefícios que não foram definidos.',
        'Qualidade do registro envolve correção, completude necessária e distinção entre o que foi informado e o que foi observado. Não preencha respostas por aparência, boato ou suposição. Se uma informação precisa ser confirmada, sinalize essa necessidade conforme a orientação do sistema, em vez de inventar um valor para terminar a ficha. Duplicar pessoas ou misturar dados de famílias diferentes pode produzir acompanhamento equivocado e dificultar a continuidade do cuidado.',
        'Proteção de dados faz parte da rotina: utilize os canais e dispositivos autorizados, mantenha o controle de acesso e evite listas expostas. Uma informação relevante para a equipe não se torna pública por ter sido obtida em visita. Conversas sobre condições de saúde não devem ocorrer de modo que vizinhos ou pessoas sem participação no cuidado tenham acesso. Em exercícios e apresentações, substitua os dados reais por situações fictícias.',
      ] },
      { title: 'Caso resolvido: telefone e endereço incompatíveis', paragraphs: [
        'Ao planejar o acompanhamento, o agente percebe que um telefone foi associado a duas famílias sem relação conhecida e que uma moradora informou mudança de endereço. A solução não é apagar registros para “limpar” a lista. Ele verifica a informação pelo procedimento do serviço, registra a atualização com a identificação correta e comunica à equipe os efeitos sobre a organização das visitas. Se houver dúvida sobre o cadastro, solicita apoio à pessoa responsável pelo sistema.',
        'Um colega pede a planilha inteira em um grupo de mensagens pessoal. O agente deve confirmar o canal institucional e compartilhar apenas o necessário à finalidade autorizada. A rapidez do contato não elimina o dever de proteção. O trabalho fica melhor quando a equipe sabe qual informação foi atualizada, por quem e o que ainda exige conferência; isso permite continuidade sem depender da memória de uma pessoa.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie uma ficha fictícia com três inconsistências: contato desatualizado, informação não confirmada e possível duplicidade. Escreva como verificaria cada situação sem completar campos por suposição. Depois redija uma comunicação breve à equipe sobre uma atualização, removendo dados que não sejam necessários. Confira se outra pessoa entenderia a pendência e se o documento poderia ser usado sem revelar a identidade de uma família em sala de aula. Explique também por que apagar a dúvida não é o mesmo que corrigir o dado.',
      ] },
    ],
  },
  {
    title: 'Planejar e conduzir a visita domiciliar',
    skills: ['planejar-visita-acs'], sourceIds: ['sesmt-visitas', 'lei-acs'],
    sections: [
      { title: 'Ensino: finalidade, escuta e continuidade', paragraphs: [
        'Uma visita deve ter finalidade conhecida e preparação compatível com o acompanhamento. Consulte a programação e as informações a que tem acesso autorizado, identifique a necessidade de materiais educativos e combine com a equipe os casos que exigem atuação conjunta. O roteiro organiza o encontro, mas não deve impedir a escuta de uma necessidade que aparece durante a conversa. Planejar não é decorar perguntas sem compreender por que serão feitas.',
        'Ao chegar, apresente-se, confirme com quem está falando e explique a finalidade. Respeite a disponibilidade e a privacidade do morador. Se não for um momento adequado, siga o procedimento para registrar a situação e reorganizar o contato. A recusa ou ausência não autoriza entrada forçada, exposição da família ou preenchimento de uma visita como se tivesse ocorrido. Observe o ambiente com respeito, evitando comentários que constranjam as pessoas.',
        'Durante o encontro, utilize linguagem clara, escute o relato e confirme o entendimento da orientação. Ao terminar, retome os combinados: qual informação será levada à equipe, que providência depende do serviço e como haverá retorno. O registro posterior deve corresponder ao que aconteceu. Procedimentos e avaliações que dependem de formação específica, supervisão e condições adequadas não são autorizados apenas pelo estudo deste material.',
      ] },
      { title: 'Caso resolvido: prioridade muda durante o encontro', paragraphs: [
        'A visita estava prevista para atualizar uma informação de contato. Durante a conversa, a família relata que não conseguiu agendar um acompanhamento combinado com a equipe. O agente escuta e identifica qual etapa do fluxo não foi compreendida. Não garante uma consulta em nome de outro profissional nem escolhe tratamento. Registra a barreira e combina levar a necessidade ao serviço responsável, com uma forma de retorno para a família.',
        'Ao preencher o registro, descreve o motivo inicial e a necessidade identificada, segundo o instrumento utilizado. Se não houve atendimento clínico, não registra procedimentos clínicos para dar aparência de completude. Na reunião de equipe, informa o que foi relatado, o que orientou e o que continua pendente. A continuidade depende dessa passagem de informação, não da promessa de que tudo será resolvido na mesma visita.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Escreva um roteiro fictício de visita com preparação, apresentação, objetivo, perguntas abertas, síntese e retorno. Inclua uma situação em que o morador prefere outro horário e outra em que surge uma necessidade não prevista. Explique como registrar as duas sem inventar contato ou procedimento. Revise o roteiro: ele oferece tempo para escuta, preserva a privacidade e distingue orientação de decisões que pertencem à equipe? Simule o encerramento em linguagem que o morador consiga repetir com suas próprias palavras.',
      ] },
    ],
  },
  {
    title: 'Educação em saúde e comunicação compreensível',
    skills: ['construir-acao-educativa-saude'], sourceIds: ['lei-acs', 'sesmt-visitas'],
    sections: [
      { title: 'Ensino: dialogar sobre possibilidades reais', paragraphs: [
        'Educação em saúde não é apenas transmitir uma lista de ordens. Parte de necessidades e conhecimentos da comunidade e busca construir compreensão e possibilidades de cuidado. Uma orientação pode estar tecnicamente escrita e ainda ser impraticável para quem não tem acesso ao recurso indicado. Perguntar como a rotina acontece permite adaptar a comunicação e levar à equipe as barreiras que não se resolvem com informação.',
        'Defina um objetivo observável para cada ação educativa. “Falar sobre saúde” é amplo; “ao final, os participantes saberão identificar o canal da unidade para esclarecer dúvidas de acompanhamento” permite avaliar entendimento. Escolha material oficial adequado ao público, confira a atualização e discuta com a equipe o uso pretendido. Evite divulgar mensagens recebidas em redes sociais como se fossem orientações do serviço.',
        'Use exemplos, perguntas abertas e verificação de entendimento. Pedir que alguém explique com suas palavras o próximo passo é mais informativo do que perguntar apenas “entendeu?”. Isso não deve ser um teste para constranger. Se a resposta mostra confusão, reformule a mensagem. Dúvidas sobre medicamento, diagnóstico ou mudança de conduta clínica são encaminhadas ao profissional responsável; não improvise uma resposta para não parecer inseguro.',
      ] },
      { title: 'Caso resolvido: encontro com baixa participação', paragraphs: [
        'Uma equipe prepara uma conversa sobre acesso aos serviços, mas percebe que o encontro anterior teve pouca participação. Antes de repetir a mesma apresentação, o agente conversa com moradores e identifica que o horário coincide com deslocamentos de trabalho. O problema não é resolvido aumentando o número de slides. A equipe revê o horário, simplifica a mensagem e organiza um meio alternativo de orientação.',
        'No novo encontro, os participantes recebem uma situação fictícia e explicam onde buscariam a informação necessária. A equipe observa quais etapas continuam confusas e ajusta o material. A avaliação considera a compreensão do fluxo e a possibilidade de usar a informação, não apenas a quantidade de pessoas presentes. A ação termina com uma referência clara para dúvidas, sem prometer atendimento que ainda não foi organizado.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Planeje uma conversa educativa sobre como buscar informações na unidade de referência. Defina público, objetivo, duração, material oficial e uma pergunta para verificar entendimento. Crie uma barreira de participação e proponha uma adaptação possível. Depois escreva uma dúvida clínica que deve ser encaminhada, sem respondê-la por conta própria. Confira se a atividade permite escuta, se diferencia participação de aprendizagem e se a orientação pode ser compreendida sem siglas ou conhecimento prévio do funcionamento do serviço.',
      ] },
    ],
  },
  {
    title: 'Trabalho em equipe, acompanhamento e leitura de indicadores',
    skills: ['acompanhar-acoes-territorio'], sourceIds: ['sesmt-visitas', 'lei-acs'],
    sections: [
      { title: 'Ensino: transformar registros em decisões compartilhadas', paragraphs: [
        'Os registros do território ajudam a equipe a reconhecer necessidades, organizar acompanhamentos e avaliar suas ações. Um número só é compreensível quando sabemos o que foi contado, em qual período e para qual grupo. “Foram feitas vinte visitas” não informa quantas pessoas ou famílias diferentes foram acompanhadas, nem quais demandas foram resolvidas. Uma mesma família pode receber mais de um contato por motivos diferentes.',
        'Na reunião de equipe, apresente fatos relevantes e pendências de forma objetiva. Um encaminhamento precisa indicar sua finalidade e permitir retorno. Distinguir “necessidade identificada”, “demanda comunicada”, “providência agendada” e “retorno confirmado” evita encerrar acompanhamentos antes da hora. A equipe define prioridades conforme seus critérios e protocolos; o agente contribui com o conhecimento do território e as informações obtidas de modo responsável.',
        'Indicadores não devem incentivar registros fictícios para melhorar resultados. Antes de comparar períodos, confira se a definição e a população de referência são as mesmas. Uma redução no número de visitas pode resultar de mudança de registro ou de organização do trabalho; não prova automaticamente piora ou melhora do cuidado. Use os números para fazer perguntas e conferir o processo, preservando a informação pessoal de quem foi acompanhado.',
      ] },
      { title: 'Caso resolvido: contatos e famílias não são a mesma contagem', paragraphs: [
        'Em uma semana fictícia, houve doze contatos: oito famílias receberam um contato e duas receberam dois. Foram acompanhadas dez famílias, não doze. Se a equipe comparar esse total com uma lista de famílias que precisavam de retorno, deve usar a contagem compatível. Somar contatos repetidos como famílias diferentes exageraria a cobertura e poderia esconder quem ainda não foi localizado.',
        'A reunião identifica que três demandas continuam sem resposta. Cada uma recebe um responsável pelo próximo passo e uma data de revisão, conforme o fluxo do serviço. Na semana seguinte, a equipe não verifica apenas se mensagens foram enviadas: confirma o retorno que ocorreu e ajusta o plano nos casos pendentes. O resultado depende da continuidade do trabalho e da qualidade da comunicação, além do volume de atividades registradas.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Construa uma tabela fictícia com cinco famílias, motivos de acompanhamento e quantidade de contatos no mês. Conte separadamente famílias e contatos. Escolha duas pendências e escreva uma passagem de informação para a equipe com finalidade, responsável pelo retorno e critério para verificar andamento. Confira se o texto evita diagnóstico improvisado e se os dados permitem entender a necessidade sem expor detalhes desnecessários. Explique por que uma atividade registrada não pode ser automaticamente contada como uma demanda resolvida.',
      ] },
    ],
  },
];

const activities = [
  { module: 1, skill: 'reconhecer-papel-acs', prompt: 'Moradores relatam dificuldade para chegar à unidade por mudança na rota de transporte. Como o conhecimento do território contribui para a atuação do ACS?', options: ['Permite atribuir falta de interesse aos moradores.', 'Substitui decisões de toda a equipe.', 'Ajuda a registrar a barreira e articulá-la com a equipe responsável.', 'Autoriza prometer um novo transporte sem consultar o serviço.'] },
  { module: 2, skill: 'registrar-informacao-territorial', prompt: 'Uma informação cadastral importante não foi confirmada. O que preserva a qualidade do registro?', options: ['Registrar a necessidade de conferência e seguir o fluxo do serviço.', 'Preencher por aparência para terminar a ficha.', 'Copiar a resposta de outra família.', 'Apagar o cadastro inteiro sem analisar a situação.'] },
  { module: 3, skill: 'planejar-visita-acs', prompt: 'O morador informa que não pode receber a visita naquele momento. Qual conduta corresponde ao roteiro estudado?', options: ['Registrar todos os objetivos como realizados.', 'Entrar para não perder a programação.', 'Divulgar a recusa aos vizinhos.', 'Respeitar a disponibilidade e reorganizar o contato conforme o serviço.'] },
  { module: 4, skill: 'construir-acao-educativa-saude', prompt: 'Uma orientação foi apresentada, mas o participante não consegue explicar o próximo passo. O que fazer?', options: ['Considerar a presença suficiente para provar aprendizagem.', 'Reformular a comunicação e verificar novamente o entendimento.', 'Repetir apenas as siglas do material.', 'Registrar que a pessoa não quer aprender.'] },
  { module: 5, skill: 'acompanhar-acoes-territorio', prompt: 'Um relatório soma contatos repetidos como se fossem famílias diferentes. Qual é o problema?', options: ['Contatos e famílias sempre representam a mesma contagem.', 'A repetição melhora a precisão da cobertura.', 'A contagem pode exagerar o acompanhamento de famílias distintas.', 'A definição do indicador não interfere no resultado.'] },
];

const exam = [
  { module: 1, skill: 'reconhecer-papel-acs', prompt: 'Qual situação expressa a articulação do ACS com a equipe do SUS?', options: ['Definir sozinho o tratamento de uma condição relatada.', 'Reconhecer uma barreira de acesso e levar a necessidade à equipe.', 'Substituir o fluxo de atendimento por promessas pessoais.', 'Concluir a causa clínica a partir de um boato.'] },
  { module: 1, skill: 'reconhecer-papel-acs', prompt: 'Conhecer o território exige, além de localizar ruas:', options: ['Classificar famílias por simpatia.', 'Presumir que proximidade garante acesso.', 'Registrar apenas locais comerciais.', 'Reconhecer condições, recursos e barreiras vividas pela comunidade.'] },
  { module: 2, skill: 'registrar-informacao-territorial', prompt: 'Qual procedimento evita que uma atualização produza acompanhamento equivocado?', options: ['Conferir a identificação e registrar a mudança no fluxo correto.', 'Misturar informações de pessoas com nomes parecidos.', 'Criar um cadastro novo a cada contato sem conferir duplicidade.', 'Completar toda dúvida com valores aproximados.'] },
  { module: 2, skill: 'registrar-informacao-territorial', prompt: 'Um colega pede dados de famílias em um grupo pessoal de mensagens. Qual ação foi ensinada?', options: ['Enviar tudo porque o pedido veio de um colega.', 'Publicar a lista para evitar pedidos repetidos.', 'Confirmar canal e finalidade e compartilhar apenas o necessário autorizado.', 'Usar dados reais em exercícios públicos para facilitar o trabalho.'] },
  { module: 3, skill: 'planejar-visita-acs', prompt: 'Qual preparação torna a visita orientada a uma finalidade?', options: ['Decorar perguntas sem conhecer o acompanhamento.', 'Consultar programação e informações autorizadas e combinar necessidades com a equipe.', 'Registrar a visita antes de saber se haverá contato.', 'Escolher procedimentos clínicos sem verificar atribuições.'] },
  { module: 3, skill: 'planejar-visita-acs', prompt: 'Durante a visita surge uma dificuldade de agendamento. Qual encaminhamento preserva os limites de atuação?', options: ['Garantir uma consulta em nome de outro profissional.', 'Ignorar por não constar do objetivo inicial.', 'Escolher tratamento para substituir a consulta.', 'Registrar a barreira, orientar sobre o fluxo e combinar retorno com o serviço.'] },
  { module: 4, skill: 'construir-acao-educativa-saude', prompt: 'Qual objetivo permite observar compreensão em uma ação educativa?', options: ['Os participantes conseguem identificar o canal para esclarecer dúvidas de acompanhamento.', 'A apresentação contém muitos termos técnicos.', 'O encontro ocupa todo o horário disponível.', 'Todos recebem a mesma ordem sem possibilidade de diálogo.'] },
  { module: 4, skill: 'construir-acao-educativa-saude', prompt: 'Uma atividade tem pouca participação porque coincide com o trabalho dos moradores. Qual decisão enfrenta a causa identificada?', options: ['Aumentar apenas a quantidade de slides.', 'Rever horário e alternativas de orientação com a equipe.', 'Registrar desinteresse sem novo contato.', 'Manter o formato e proibir dúvidas.'] },
  { module: 5, skill: 'acompanhar-acoes-territorio', prompt: 'Qual informação precisa acompanhar um número usado para avaliar ações?', options: ['Apenas a opinião de quem produziu a planilha.', 'Somente um total sem período.', 'O que foi contado, em qual período e para qual grupo.', 'Uma comparação com qualquer grupo disponível.'] },
  { module: 5, skill: 'acompanhar-acoes-territorio', prompt: 'Uma demanda foi comunicada à equipe, mas ainda não houve resposta confirmada. Como descrevê-la?', options: ['Como resolvida, pois comunicar encerra o acompanhamento.', 'Como inexistente para não afetar o indicador.', 'Como resultado de falha da família.', 'Como pendência que precisa de próximo passo e retorno verificável.'] },
];

export const courseRevision = defineCourse({
  courseId: '760c441f-ecab-42c4-9316-fdc6247efb6d', slug: 'agente-comunitario-de-saude',
  courseName: 'Agente Comunitário de Saúde', hours: 180,
  audience: 'Interessados em fundamentos da atuação comunitária e trabalhadores que revisam práticas de território, registro e articulação com a equipe.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'lei-acs', title: 'Câmara dos Deputados — Lei 11.350/2006, texto atualizado', url: 'https://www2.camara.leg.br/legin/fed/lei/2006/lei-11350-5-outubro-2006-545707-normaatualizada-pl.html' },
    { id: 'sesmt-visitas', title: 'Secretaria de Saúde de Mato Grosso — Roteiros de visita domiciliar do ACS', url: 'https://www.saude.mt.gov.br/storage/files/qKlf8LfV7rjGQMMdLLPbUWGOpAUXhqexg5pfKLzE.pdf' },
    { id: 'anpd-seguranca', title: 'ANPD — Guia orientativo de segurança da informação', url: 'https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/anonimizado___guia_orientat-_seg_da_inf_p_atpp.pdf' },
  ],
}, modules, activities, exam);

export default courseRevision;
