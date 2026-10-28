import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Função da portaria e limites de responsabilidade',
    skills: ['distinguir-portaria-vigilancia'], sourceIds: ['lei-seguranca', 'anpd-seguranca'],
    sections: [
      { title: 'Ensino: recepção e controle de acesso com critérios', paragraphs: [
        'A portaria organiza a entrada e saída conforme os procedimentos do estabelecimento: identifica a finalidade da visita, confirma a autorização e orienta o deslocamento. É um ponto de comunicação entre pessoas que chegam e os setores responsáveis. O trabalho exige atenção à informação e à continuidade do posto, e não decisões baseadas em aparência, roupa ou afinidade. Um procedimento conhecido ajuda a tratar situações semelhantes com o mesmo critério.',
        'Portaria e vigilância não são nomes intercambiáveis. A legislação distingue serviços típicos de controle de acesso, executados sem arma de fogo, das atividades de segurança privada reguladas. Este curso aborda recepção, conferência, registro e comunicação dentro da função de portaria; não é formação de vigilante nem autoriza ações especializadas por mudança de nome do cargo. Quando a demanda ultrapassa o posto, o trabalhador deve acionar a pessoa ou equipe competente.',
        'Antes de assumir, conheça os canais de contato, quem pode autorizar acessos, como agir quando a pessoa procurada não responde e o fluxo de incidentes. Também identifique quais informações podem ser fornecidas a visitantes. Saber que alguém trabalha em determinado local não autoriza divulgar telefone pessoal, horário individual ou outros dados. A orientação deve atender à finalidade da visita sem expor as pessoas do estabelecimento.',
      ] },
      { title: 'Caso resolvido: pedido fora da atribuição', paragraphs: [
        'Um visitante afirma que precisa entrar imediatamente e pede ao agente que ignore a confirmação porque “todos o conhecem”. O agente explica o procedimento, tenta o contato institucional e mantém a solicitação em espera até a resposta prevista. Não inventa uma autorização nem transforma a situação em confronto. Se a pressão continuar, comunica ao responsável do posto pelo canal definido, relatando o que foi pedido e a confirmação ainda ausente.',
        'Ao final do turno, registra a ocorrência de modo objetivo e informa se o procedimento foi concluído ou se a demanda permaneceu pendente. Não escreve uma avaliação sobre o caráter do visitante. A qualidade do trabalho está em manter a decisão vinculada à autorização competente e comunicar o que aconteceu. Uma exceção criada por simpatia enfraquece o processo e dificulta a atuação de quem assume o turno seguinte.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe o fluxo de uma visita em um prédio fictício: chegada, identificação necessária, confirmação, autorização, orientação e saída. Acrescente um caminho para ausência de resposta do setor procurado. Indique o que o agente decide dentro do procedimento e o que precisa encaminhar. Revise se existe algum atalho baseado apenas em familiaridade ou aparência. Depois redija uma explicação curta para comunicar a regra ao visitante de maneira respeitosa e sem divulgar dados internos.',
      ] },
    ],
  },
  {
    title: 'Conferência de acesso, visitantes e prestadores',
    skills: ['conferir-acesso-autorizado'], sourceIds: ['lei-seguranca', 'anpd-seguranca'],
    sections: [
      { title: 'Ensino: conferir identidade, finalidade e autorização', paragraphs: [
        'Um acesso depende de elementos que precisam ser coerentes: quem solicita, qual a finalidade, quem será procurado e qual autorização foi obtida. Confirmar apenas o nome não resolve todo o processo. Prestadores podem ter horário e local de atuação definidos; visitantes podem precisar de acompanhamento. O procedimento deve indicar os passos aplicáveis, inclusive a forma de registrar a saída e encerrar uma identificação temporária.',
        'Uma autorização apresentada pelo próprio interessado pode precisar de confirmação no canal institucional. Mensagens, ligações e documentos devem ser tratados conforme o procedimento, sem presumir autenticidade só pela aparência. Se houver divergência, mantenha o pedido pendente e encaminhe para conferência. A pressão por rapidez não transforma um dado não confirmado em autorização. Também não se deve criar exigências adicionais por iniciativa pessoal para pessoas de determinado perfil.',
        'Colete apenas os dados previstos e necessários à finalidade. A pessoa responsável pelo tratamento define regras de guarda, acesso e descarte; o agente não deve inventar um prazo universal nem montar cópias pessoais de documentos. Crachás, listas e telas devem ser usados de forma a não exibir dados de outros visitantes. Ao orientar alguém, indique o destino autorizado e o acompanhamento exigido, sem liberar circulação além do que foi confirmado.',
      ] },
      { title: 'Caso resolvido: prestador com destino diferente', paragraphs: [
        'Um prestador é esperado para manutenção em um setor, mas solicita entrada por outro acesso e afirma que irá a uma sala diferente. O agente compara a solicitação com a informação disponível e busca confirmação com o responsável. A divergência pode ser um ajuste legítimo ou uma informação incorreta; não deve ser resolvida por adivinhação. Enquanto aguarda, mantém o fluxo de espera previsto, sem divulgar a localização de pessoas ou liberar circulação não autorizada.',
        'Confirmada a alteração pelo canal correto, registra o que mudou e fornece a orientação correspondente. Se a autorização não for confirmada, segue o encaminhamento definido, sem confrontar nem inventar uma liberação. O caso demonstra que controle de acesso não é apenas reconhecer um rosto: exige coerência entre pessoa, finalidade, destino e autorização. O registro permite explicar a decisão a quem assume o posto.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie três solicitações fictícias: visitante sem resposta do setor, prestador com autorização confirmada e pedido com destino divergente. Descreva o próximo passo de cada uma usando o mesmo critério de conferência. Elabore também uma ficha mínima de registro e justifique a finalidade de cada campo. Retire dados que só foram incluídos “por garantia”. Confira se outra pessoa conseguiria executar o fluxo sem depender de informações guardadas apenas na memória de um funcionário.',
      ] },
    ],
  },
  {
    title: 'Registros, chaves e passagem de posto',
    skills: ['registrar-rastreabilidade-portaria'], sourceIds: ['anpd-seguranca', 'lei-seguranca'],
    sections: [
      { title: 'Ensino: permitir continuidade sem expor informações', paragraphs: [
        'Um registro operacional deve permitir reconstruir uma ação relevante: quando ocorreu, o que foi observado, quem foi acionado e qual providência ficou pendente. Escrever muito não significa registrar bem. Informações vagas, julgamentos e abreviações desconhecidas dificultam a continuidade. Use o instrumento autorizado e diferencie fato, relato de terceiro e interpretação. Não altere o registro de outra pessoa para esconder uma divergência.',
        'O controle de chaves é uma forma de rastreabilidade. O procedimento precisa identificar a chave, o responsável autorizado por retirá-la, o momento da retirada e a devolução. Guardar uma chave “com alguém conhecido” sem registro transfere uma responsabilidade que não pode ser acompanhada. Se houver falta ou divergência, comunique pelo fluxo do posto e preserve o histórico. Não produza cópias ou empreste chaves fora da autorização definida.',
        'Na passagem de turno, destaque pendências e mudanças que afetam o trabalho: acesso temporário ainda ativo, equipamento com falha, chave não devolvida ou contato aguardado. O recebimento do posto exige conferir essas informações, não apenas assinar um livro. Senhas e credenciais devem seguir as regras de acesso; um registro operacional não é lugar para escrever senhas expostas. O compartilhamento deve alcançar quem precisa atuar, sem circular imagens e dados em canais pessoais.',
      ] },
      { title: 'Caso resolvido: chave sem devolução registrada', paragraphs: [
        'Ao receber o turno, o agente encontra uma chave ausente e uma anotação incompleta. Em vez de concluir que houve perda ou preencher uma devolução que não presenciou, confere o registro, verifica a pendência com quem entrega o posto e aciona o responsável conforme o procedimento. A informação ainda não confirmada permanece identificada como pendência. Isso evita criar um histórico aparentemente correto que não corresponde ao ocorrido.',
        'Depois de localizar a devolução, o responsável registra a confirmação com o contexto necessário. A equipe percebe que a ficha não diferenciava retirada de devolução e ajusta o instrumento. A melhoria organiza campos claros e uma conferência no momento da passagem de posto. O caso não exige expor o nome de pessoas em um grupo aberto: exige manter rastreabilidade para quem tem responsabilidade sobre o controle.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte um registro fictício de retirada e devolução de três chaves, com uma pendência. Escreva uma passagem de posto que destaque o que precisa ser acompanhado. Em seguida, revise três frases: uma com julgamento, outra sem horário e outra com senha exposta. Reescreva para preservar fatos, continuidade e segurança da informação. Confira se o registro distingue o que já foi confirmado do que ainda depende de verificação e se cada pendência tem um responsável a acionar.',
      ] },
    ],
  },
  {
    title: 'Atendimento, comunicação e conflitos',
    skills: ['comunicar-procedimento-portaria'], sourceIds: ['lei-seguranca', 'anpd-seguranca'],
    sections: [
      { title: 'Ensino: clareza e respeito sem abandonar o procedimento', paragraphs: [
        'O atendimento da portaria precisa conciliar orientação e conferência. Uma comunicação clara informa o próximo passo, quem pode responder e qual é a situação da solicitação. Evite frases que humilham ou geram disputa pessoal. “Preciso confirmar com o setor responsável” descreve uma etapa; “você não manda aqui” transforma o atendimento em confronto. Ser respeitoso não significa liberar um acesso que continua sem autorização.',
        'Escute o pedido e confirme o que foi compreendido. Se houver dificuldade de comunicação, adapte a forma de orientar, utilizando recursos acessíveis previstos no serviço. Não presuma intenção a partir de sotaque, aparência ou condição de deficiência. A conferência precisa manter o mesmo critério, com os apoios necessários para que a pessoa compreenda o processo. Também não prometa tempo de resposta ou decisão de outro setor sem informação confirmada.',
        'Quando há conflito, preserve a segurança, mantenha a comunicação objetiva e acione apoio conforme o procedimento. Não tente resolver uma ameaça por confronto físico, perseguição ou exposição em redes sociais. Descreva fatos ao responsável e siga as orientações do plano local. Uma ocorrência registrada depois deve explicar o pedido, a divergência e a providência tomada, sem acrescentar ofensas ou conclusões sobre a personalidade de quem estava envolvido.',
      ] },
      { title: 'Caso resolvido: espera e informação incompleta', paragraphs: [
        'Um visitante se irrita porque o setor procurado ainda não respondeu. O agente pode reconhecer a dificuldade sem inventar uma liberação: informa que o contato está em confirmação e apresenta o próximo encaminhamento previsto. Se houver outro canal institucional disponível, utiliza-o. Não divulga telefone pessoal de um funcionário para transferir o problema ao visitante. A decisão permanece ligada à autorização, não ao volume da reclamação.',
        'Se o comportamento passa a representar risco, o agente aciona o apoio responsável e segue a orientação do posto. Depois, o registro distingue a espera inicial das ações observadas, evitando expressões como “pessoa suspeita” sem descrição. A gestão pode revisar se havia falha de contato e melhorar a informação ao público. Assim, a experiência de atendimento ajuda a aperfeiçoar o processo sem abandonar critérios de acesso.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Escreva uma resposta para um visitante que não compreendeu a necessidade de confirmação e outra para quem solicita dado pessoal de um funcionário. As respostas devem conter explicação do procedimento, próximo passo e limite de informação. Simule ainda uma situação que exige acionar apoio em vez de continuar discutindo. Revise as falas para retirar ameaças, ironias e promessas não confirmadas. Explique como manter o atendimento respeitoso sem criar uma autorização por conta própria.',
      ] },
    ],
  },
  {
    title: 'Prevenção e comunicação em situações de emergência',
    skills: ['acionar-resposta-prevista'], sourceIds: ['mte-nr23', 'anpd-seguranca'],
    sections: [
      { title: 'Ensino: conhecer o plano e comunicar o que foi observado', paragraphs: [
        'A preparação para emergências começa antes de uma ocorrência: conhecer os canais de acionamento, os responsáveis, as orientações de alarme e as rotas previstas no estabelecimento. A organização deve informar os trabalhadores sobre resposta e evacuação. O estudo teórico não substitui treinamento específico nem autoriza assumir tarefas técnicas. O agente precisa saber quais ações cabem ao posto e como solicitar apoio sem atrasar a resposta responsável.',
        'A observação da rotina pode identificar condições que precisam ser corrigidas, como material obstruindo uma passagem de emergência ou sinalização danificada. Comunique a condição pelo fluxo definido e acompanhe a pendência. Não crie bloqueios para “melhorar a segurança” que impeçam a saída das pessoas. As medidas do local devem seguir o plano e os requisitos aplicáveis, com responsabilidade técnica quando necessária.',
        'Em uma comunicação de emergência, informe local exato, situação observada e informação relevante disponível, sem inventar a causa. Dizer que há fumaça em um corredor é diferente de afirmar que o problema foi provocado por alguém. Siga as orientações de alarme, proteção e acionamento previstas. Não entre em área de risco para produzir imagens, investigar por conta própria ou buscar objetos; a prioridade é a proteção de pessoas e a atuação de quem está preparado para a resposta.',
      ] },
      { title: 'Caso resolvido: passagem obstruída antes do expediente', paragraphs: [
        'Antes da abertura, o agente observa caixas colocadas em uma passagem sinalizada de emergência. A condição deve ser comunicada imediatamente ao responsável pelo local, com indicação precisa de onde está o bloqueio. Não basta escrever uma observação vaga para o próximo turno. A organização providencia a correção pelo procedimento seguro, e a equipe confirma que a passagem foi desobstruída antes de encerrar a pendência.',
        'Em outro momento, ocorre um alarme. O agente não presume que seja teste porque não vê fumaça da portaria. Segue o procedimento de resposta e confirma as informações com os responsáveis pelo plano. Após a ocorrência, registra os fatos e encaminhamentos. O aprendizado está em não substituir o plano por suposições pessoais e em conhecer previamente os canais que precisam funcionar quando há urgência.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie um mapa fictício de comunicação com posto, gestor, equipe de resposta e ponto de encontro previsto. Não invente procedimentos técnicos de combate a incêndio. Escreva uma mensagem de acionamento com local e observação, e outra de acompanhamento de uma passagem obstruída. Confira se a mensagem permite localizar o problema, se evita atribuir uma causa sem prova e se o encerramento depende de confirmação da correção. Registre quais informações você precisaria receber da organização antes de assumir o posto.',
      ] },
    ],
  },
];

const activities = [
  { module: 1, skill: 'distinguir-portaria-vigilancia', prompt: 'Um visitante pressiona o agente a liberar entrada sem confirmação porque é conhecido. Qual critério deve orientar a decisão?', options: ['A familiaridade deve substituir o fluxo.', 'A autorização definida no procedimento, com encaminhamento se não houver confirmação.', 'A aparência do visitante.', 'A intensidade da reclamação.'] },
  { module: 2, skill: 'conferir-acesso-autorizado', prompt: 'Um prestador solicita destino diferente do que consta na autorização. Qual é o próximo passo adequado?', options: ['Liberar qualquer destino porque a pessoa já foi identificada.', 'Decidir por conta própria qual sala parece correta.', 'Confirmar a divergência com o responsável pelo canal institucional.', 'Pedir a outro visitante que autorize.'] },
  { module: 3, skill: 'registrar-rastreabilidade-portaria', prompt: 'Uma chave está ausente e a devolução não foi confirmada. Como registrar a situação?', options: ['Preencher devolução para finalizar o turno.', 'Apagar a retirada para corrigir o sistema.', 'Concluir imediatamente que houve furto.', 'Manter a pendência, conferir os fatos e acionar o responsável.'] },
  { module: 4, skill: 'comunicar-procedimento-portaria', prompt: 'Qual fala explica uma espera sem criar promessa não confirmada?', options: ['“O setor ainda não confirmou; vou seguir o próximo contato previsto.”', '“Pode entrar porque você já esperou bastante.”', '“Tenho certeza de que será atendido agora”, sem confirmação.', '“Vou divulgar o telefone pessoal de quem não respondeu.”'] },
  { module: 5, skill: 'acionar-resposta-prevista', prompt: 'Um alarme é acionado, mas o agente não vê a causa da portaria. Qual conduta foi ensinada?', options: ['Ignorar por parecer teste.', 'Seguir o procedimento de resposta e os canais definidos.', 'Entrar na área para filmar antes de avisar.', 'Presumir que não há risco se ninguém ligou.'] },
];

const exam = [
  { module: 1, skill: 'distinguir-portaria-vigilancia', prompt: 'Qual atividade está no escopo estudado de portaria?', options: ['Organizar acesso autorizado e orientar visitantes conforme o procedimento.', 'Realizar formação de vigilante por iniciativa do posto.', 'Assumir qualquer tarefa armada por mudança do nome do cargo.', 'Criar autorização sem responsável definido.'] },
  { module: 1, skill: 'distinguir-portaria-vigilancia', prompt: 'Antes de assumir o posto, o agente precisa conhecer:', options: ['Apenas pessoas que lhe são familiares.', 'Somente o nome comercial do prédio.', 'Canais, responsáveis por autorização e fluxo de situações não confirmadas.', 'Dados pessoais de todos os funcionários para divulgar aos visitantes.'] },
  { module: 2, skill: 'conferir-acesso-autorizado', prompt: 'Qual conjunto deve ser coerente na conferência de uma solicitação de acesso?', options: ['Roupa, simpatia e tempo de espera.', 'Pessoa, finalidade, destino e autorização.', 'Apenas nome e aparência.', 'Qualquer mensagem apresentada pelo interessado.'] },
  { module: 2, skill: 'conferir-acesso-autorizado', prompt: 'Sobre dados de visitantes, o procedimento adequado é:', options: ['Criar cópias pessoais de todos os documentos.', 'Expor a lista na entrada para facilitar a consulta pública.', 'Inventar um prazo universal de guarda para qualquer estabelecimento.', 'Coletar o necessário e seguir as regras autorizadas de acesso, guarda e descarte.'] },
  { module: 3, skill: 'registrar-rastreabilidade-portaria', prompt: 'Qual informação torna o controle de chaves rastreável?', options: ['Identificação da chave, retirada, responsável autorizado e devolução.', 'Somente a cor da chave.', 'A frase “emprestada a conhecido”.', 'Uma devolução registrada antes de ser confirmada.'] },
  { module: 3, skill: 'registrar-rastreabilidade-portaria', prompt: 'Na passagem de turno, qual conduta permite continuidade?', options: ['Assinar sem conferir pendências.', 'Apagar ocorrências que não foram resolvidas.', 'Destacar pendências, mudanças e confirmações relevantes para quem recebe o posto.', 'Registrar senhas expostas no livro de ocorrências.'] },
  { module: 4, skill: 'comunicar-procedimento-portaria', prompt: 'Um visitante pede o telefone pessoal de um funcionário para resolver uma espera. Qual orientação respeita o limite de informação?', options: ['Divulgar porque o visitante está irritado.', 'Usar o canal institucional e não expor dado pessoal sem autorização.', 'Entregar a lista completa para evitar novos pedidos.', 'Enviar o dado a um grupo público.'] },
  { module: 4, skill: 'comunicar-procedimento-portaria', prompt: 'Quando a situação ultrapassa um atendimento comum e representa risco, o agente deve:', options: ['Criar um confronto físico para encerrar a discussão.', 'Perseguir a pessoa para produzir um registro.', 'Expor o episódio em redes sociais.', 'Preservar a segurança e acionar o apoio previsto no procedimento.'] },
  { module: 5, skill: 'acionar-resposta-prevista', prompt: 'Uma passagem de emergência está obstruída por materiais. O que caracteriza acompanhamento adequado?', options: ['Deixar apenas uma nota vaga para o próximo turno.', 'Considerar normal porque os materiais são temporários.', 'Comunicar o local e confirmar a correção segura antes de encerrar a pendência.', 'Criar outra obstrução para impedir uso da passagem.'] },
  { module: 5, skill: 'acionar-resposta-prevista', prompt: 'Uma comunicação de emergência precisa conter:', options: ['Local exato e situação observada, sem inventar a causa.', 'Apenas uma hipótese sobre o responsável.', 'Vídeo de área de risco como condição para pedir ajuda.', 'Julgamentos sobre quem parece culpado.'] },
];

export const courseRevision = defineCourse({
  courseId: 'aa79ff39-139c-496f-bd1c-b2c4ff5a6a23', slug: 'agente-de-portaria',
  courseName: 'Agente de Portaria', hours: 80,
  audience: 'Interessados em recepção, controle de acesso e comunicação operacional em serviços típicos de portaria.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'lei-seguranca', title: 'Presidência da República — Lei 14.967/2024, distinção dos serviços de portaria', url: 'https://www.presidencia.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14967.htm' },
    { id: 'anpd-seguranca', title: 'ANPD — Guia orientativo de segurança da informação', url: 'https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/anonimizado___guia_orientat-_seg_da_inf_p_atpp.pdf' },
    { id: 'mte-nr23', title: 'MTE — NR-23, proteção contra incêndios, texto atualizado em 2022', url: 'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-23-atualizada-2022.pdf' },
  ],
}, modules, activities, exam);

export default courseRevision;
