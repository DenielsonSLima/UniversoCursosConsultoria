import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Adolescências, direitos e educação social',
    skills: ['relacionar-adolescencia-direitos-territorio'], sourceIds: ['camara-eca', 'mds-convivencia'],
    sections: [
      { title: 'Ensino: conhecer o território sem transformar condições sociais em rótulos', paragraphs: [
        'O ECA considera adolescente a pessoa entre doze e dezoito anos, com situações excepcionais previstas em lei para aplicação além dessa faixa. Adolescentes são sujeitos de direitos, com experiências diversas de família, escola, comunidade e cultura. Não há uma única adolescência definida por rebeldia, risco ou falta de interesse. O trabalho educativo começa por ouvir e compreender o contexto, evitando atribuir a todos uma mesma trajetória ou julgar capacidade pela origem social.',
        'A educação social cria oportunidades de convivência, participação, cultura e reflexão sobre direitos no território. Uma oficina pode ser um meio, mas seu objetivo não é apenas ocupar tempo ou exigir obediência. No SUAS, o Serviço de Convivência e Fortalecimento de Vínculos é uma intervenção planejada da Proteção Social Básica com atividades em grupo e caráter preventivo. O curso apresenta fundamentos educativos; não transforma qualquer oficina em serviço formal do SUAS nem substitui atribuições técnicas de seus profissionais.',
        'O território inclui recursos e barreiras: escola, transporte, espaços culturais, serviços e redes de apoio. Um adolescente pode desejar participar e não ter acesso ao horário ou ao local. Ausência não deve ser imediatamente interpretada como desinteresse. Mapear condições permite planejar uma ação possível e articular apoios. Respeito envolve dignidade, opinião, expressão, imagem e vida privada, sem humilhação como recurso de disciplina ou cobrança de relatos íntimos para provar participação.',
      ] },
      { title: 'Caso resolvido: baixa presença não significa falta de vontade', paragraphs: [
        'Uma oficina começa no mesmo horário em que parte do grupo ainda está saindo da escola e depende de transporte. A equipe observa pouca presença e poderia rotular os adolescentes como descomprometidos. A análise do território mostra uma barreira concreta. O planejamento é revisto com os participantes e com a organização, considerando horários e acesso, em vez de intensificar ameaças de exclusão.',
        'A mudança precisa ser acompanhada para verificar se melhorou a participação e se outros fatores permanecem. Ouvir não significa aceitar qualquer condição impossível, mas explicar possibilidades e construir alternativas com responsabilidade. O caso diferencia interpretar um número de presença e compreender a situação que o produz. Direitos e deveres são discutidos em condições reais, não como punição por uma barreira que o próprio serviço não considerou.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe um território fictício com escola, transporte, espaço cultural e serviço de apoio. Identifique duas potencialidades e duas barreiras para participação de adolescentes. Planeje uma conversa que permita conhecer o problema sem cobrar exposição pessoal. Explique a diferença entre uma oficina e a oferta institucional do SCFV. Confira se o diagnóstico inicial evita rótulos por bairro, família ou ausência e se o planejamento relaciona objetivo educativo a condições reais de acesso.',
      ] },
    ],
  },
  {
    title: 'Participação com decisão, autoria e devolutiva',
    skills: ['planejar-participacao-adolescente'], sourceIds: ['unicef-agenda', 'camara-eca'],
    sections: [
      { title: 'Ensino: consultar não é o mesmo que permitir influência', paragraphs: [
        'Participação significativa exige compreender o objetivo, ter oportunidade de expressão e saber como a contribuição será considerada. Chamar adolescentes para aparecer em uma fotografia de um projeto já decidido não garante autoria. O adulto precisa explicar o que está aberto à decisão e quais limites existem, sem prometer que toda proposta será executada. A participação deve ocorrer de forma livre, informada, acessível e segura, evitando constrangimento de quem não deseja se expor.',
        'Um projeto educativo relaciona problema, objetivo, ações, recursos, responsabilidades e critérios de acompanhamento. Os adolescentes podem contribuir em várias etapas, não apenas na execução de tarefas. Para escolher uma ação, compare relevância, viabilidade e efeito esperado. Uma votação pode ser útil, mas não deve apagar a voz de quem tem barreira para se expressar ou transformar direito básico em opção da maioria. Organize maneiras diferentes de contribuição e explicite o processo de decisão.',
        'Depois da escuta, a devolutiva informa o que foi recebido, o que será feito e o que não será possível, com justificativa. Sem retorno, a consulta pode gerar expectativa sem consequência e reduzir confiança. O acompanhamento verifica se a ação ocorreu e se produziu o resultado pretendido. Número de cartazes ou de reuniões não basta quando o objetivo era melhorar uma condição de participação. Os indicadores precisam se relacionar à mudança que o grupo buscou.',
      ] },
      { title: 'Caso resolvido: campanha escolhida antes de ouvir o grupo', paragraphs: [
        'Uma equipe convida adolescentes para uma roda e apresenta uma campanha como escolha deles, embora tema e formato já estejam fechados. A reorganização começa pela honestidade: explicitar o que já está definido e abrir decisões reais sobre aspectos ainda possíveis, ou rever a etapa de planejamento. Não se chama de protagonismo uma tarefa que apenas pede concordância. O grupo precisa entender como pode influenciar o trabalho.',
        'Em um projeto fictício de melhorar o uso de um espaço comum, os participantes levantam barreiras, escolhem uma ação viável e combinam como verificar o acesso depois da mudança. A devolutiva mostra o que foi incorporado e o limite de orçamento. O caso ensina autoria com responsabilidade: participar não é receber poder fictício, mas conhecer as condições, construir decisões e acompanhar seus efeitos.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte um projeto fictício com problema, objetivo, ação, recursos e acompanhamento. Indique duas decisões abertas ao grupo e um limite que precisa ser explicado desde o início. Planeje uma forma de contribuição para quem não quer falar em público. Escreva uma devolutiva sobre uma proposta incorporada e outra inviável, com justificativa respeitosa. Confira se o grupo participa antes da execução e se o indicador observa uma mudança relevante, em vez de apenas contar materiais produzidos.',
      ] },
    ],
  },
  {
    title: 'Convivência, diálogo e enfrentamento de humilhações',
    skills: ['organizar-convivencia-protetiva-adolescente'], sourceIds: ['camara-eca', 'unicef-agenda', 'mds-convivencia'],
    sections: [
      { title: 'Ensino: conflito e violência não recebem uma resposta indistinta', paragraphs: [
        'A convivência pode incluir discordância e negociação, mas humilhação, discriminação e ameaça não devem ser tratadas como brincadeira obrigatória. O educador organiza acordos compreensíveis de uso do espaço, fala e recursos e intervém para proteger. A escuta não exige neutralidade diante de violação de direitos. Também não autoriza expor quem sofreu uma agressão para que convença o grupo de que ficou magoado ou aceite uma reconciliação pública.',
        'Um diálogo sobre conflito procura compreender fatos e necessidades sem reduzir participantes a identidades fixas de problema. A intervenção considera contexto, assimetria e segurança. Em uma situação de violência ou intimidação, não se impõe uma conversa entre as partes como única solução. Pode haver necessidade de proteção e acionamento do fluxo institucional e da rede competente. Este curso não ensina investigação nem técnicas clínicas; trabalha organização educativa e encaminhamento responsável.',
        'Atividades coletivas precisam permitir participação sem constrangimento. Dividir em grupos não garante que todos tenham voz; observe quem decide, quem fica com recursos e quem é silenciado. Acessibilidade e respeito às diferenças ajudam a organizar a experiência. Um combinado deve ser revisto quando sua aplicação produz exclusão, em vez de ser usado como justificativa automática para afastar alguém. A equipe acompanha o efeito das intervenções e comunica pendências de proteção.',
      ] },
      { title: 'Caso resolvido: comentário humilhante apresentado como brincadeira', paragraphs: [
        'Durante uma atividade, um participante recebe comentários repetidos sobre sua aparência e pede para parar. A equipe não exige que ele aprenda a aceitar a brincadeira para pertencer ao grupo. Interrompe a exposição, oferece acolhimento e segue o fluxo para compreender e proteger, sem fazê-lo relatar tudo diante dos demais. O acordo de convivência precisa ter consequência concreta na forma de conduzir a situação.',
        'Depois, o trabalho educativo com o grupo pode abordar respeito e efeito das ações sem revelar informações privadas. A situação específica continua sendo acompanhada, não desaparece com uma palestra. O caso mostra que uma ação geral de convivência e um cuidado individual de proteção são complementares. Uma fotografia de todos juntos ou um pedido de desculpas forçado não comprovam que a intimidação terminou.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Elabore acordos para uma atividade fictícia e explique como serão apresentados e revistos com o grupo. Descreva uma discordância que admite negociação e uma humilhação que exige proteção, indicando diferenças na resposta. Não use histórias reais do grupo. Planeje como garantir participação a quem foi silenciado sem obrigar exposição. Confira se a intervenção acompanha o resultado e se nenhuma reconciliação pública é imposta como condição de receber acolhimento ou continuar na atividade.',
      ] },
    ],
  },
  {
    title: 'Produção digital, informação e cuidado com imagem e dados',
    skills: ['planejar-comunicacao-digital-adolescente'], sourceIds: ['camara-eca', 'unicef-agenda'],
    sections: [
      { title: 'Ensino: divulgar uma causa não autoriza expor uma pessoa', paragraphs: [
        'A comunicação digital pode ampliar participação e autoria, mas a finalidade educativa não elimina cuidado com imagem, privacidade e segurança. Antes de produzir conteúdo, defina público, mensagem e canal. A presença em uma oficina não significa autorização automática para publicar rosto, nome ou história pessoal. A equipe deve observar as autorizações e responsabilidades aplicáveis e oferecer formas de contribuir sem exposição, sem penalizar quem não deseja aparecer.',
        'Uma informação deve ter origem, contexto e data verificados antes de ser divulgada. Um recorte pode ser verdadeiro e ainda induzir a uma conclusão errada quando retirado de seu contexto. Imagens de outras datas ou locais, títulos e números sem fonte precisam de conferência. A atividade educativa pode comparar documentos e buscar a fonte original sem reenviar conteúdo ofensivo ao grupo. Repetir uma mensagem muitas vezes não comprova que ela é correta.',
        'Proteja dados de contato, localização e rotina dos participantes. Um painel interno de acompanhamento não deve virar imagem pública para demonstrar resultado. Comentários e mensagens também precisam de um plano de moderação e resposta quando o projeto utiliza canais abertos. Não peça senhas pessoais para facilitar a publicação. A conta institucional deve ter responsáveis e controles apropriados. O alcance de uma postagem é apenas um indicador; não comprova que a mensagem foi compreendida ou que uma necessidade do território foi atendida.',
      ] },
      { title: 'Caso resolvido: campanha com história identificável', paragraphs: [
        'Um grupo quer divulgar uma campanha de direitos e propõe usar o relato de um colega com nome, escola e fotografia. A intenção de sensibilizar não basta para autorizar a exposição. A equipe interrompe a proposta identificável e organiza outra forma de comunicar, respeitando consentimentos e proteção aplicáveis. Pode usar uma situação fictícia claramente indicada ou informação geral verificada, sem transformar a experiência pessoal em requisito de participação.',
        'Antes da publicação, o grupo confere a fonte da informação e a data de um dado utilizado. Também revisa se detalhes indiretos permitem identificar alguém mesmo sem o nome. O caso articula autoria e responsabilidade: adolescentes podem produzir conteúdo, mas precisam de condições e apoio para decidir com informação. Uma postagem que alcança muitas pessoas não é bem-sucedida se cria exposição indevida ou desinformação.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Planeje uma peça fictícia de comunicação sobre um direito, definindo público, fonte e canal. Crie uma conferência de contexto e data e liste detalhes que poderiam identificar uma pessoa indiretamente. Proponha uma forma de autoria para quem não quer aparecer. Não publique a peça nem use histórias reais. Confira se o plano protege senhas e dados e se inclui quem modera respostas. Explique por que alcance, compreensão da mensagem e mudança na situação são resultados diferentes.',
      ] },
    ],
  },
  {
    title: 'Escuta, rede de proteção e continuidade do encaminhamento',
    skills: ['acolher-e-encaminhar-protecao-adolescente'], sourceIds: ['camara-eca', 'unicef-escuta', 'mds-convivencia'],
    sections: [
      { title: 'Ensino: acolher uma revelação não é produzir uma investigação', paragraphs: [
        'Uma atividade educativa pode abrir espaço para que um adolescente procure ajuda ou revele uma situação de violência. O adulto acolhe com respeito, evita perguntas repetidas ou sugestivas e não exige detalhes para provar que merece proteção. O relato espontâneo não deve ser transformado em depoimento diante do grupo. Escuta especializada e depoimento especial têm finalidades e responsabilidades próprias; este curso não habilita para realizá-los nem para investigar a veracidade do caso.',
        'Explique com linguagem compreensível que a informação será tratada com cuidado e compartilhada com quem precisa atuar na proteção, conforme os deveres e o fluxo aplicáveis. Não prometa sigilo absoluto nem divulgue a história a toda a equipe. Situação de risco imediato exige resposta imediata pelos serviços e autoridades competentes, sem esperar a próxima reunião. As comunicações legalmente exigidas e o acionamento da rede, incluindo Conselho Tutelar quando cabível, não podem ser substituídos por uma conversa informal.',
        'O encaminhamento identifica serviço ou responsável, necessidade, informação estritamente necessária e forma de acompanhar a continuidade. CRAS, CREAS, escola, saúde e órgãos de proteção têm funções diferentes; nenhum endereço deve ser escolhido apenas por ser o mais conhecido. Conheça os fluxos locais e mantenha contatos institucionais atualizados. Enviar uma mensagem não comprova que o adolescente foi atendido. Acompanhar o retorno significa verificar continuidade sem assumir atribuições de outro serviço ou exigir que ele repita a história a cada contato.',
      ] },
      { title: 'Caso resolvido: pedido de segredo diante de violência', paragraphs: [
        'Um adolescente procura o educador e relata situação que exige proteção, pedindo segredo absoluto. O adulto acolhe e explica que precisa acionar pessoas responsáveis para ajudar com segurança, compartilhando apenas o necessário. Não promete guardar tudo nem começa uma sequência de perguntas para confirmar cada detalhe. Segue o protocolo e os deveres de comunicação, priorizando o risco e evitando exposição ou contato imprudente que possa ampliar a ameaça.',
        'O registro objetivo distingue as palavras espontaneamente relatadas das observações do adulto e das ações realizadas. O fluxo define quem acompanha o retorno da rede. O caso mostra que confiança e proteção não se opõem: ser claro sobre o limite do sigilo evita uma promessa impossível e permite cuidado responsável. A atividade do grupo não pode continuar como se a revelação fosse apenas um tema para a próxima oficina.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe uma rede fictícia com escola, assistência social, saúde e órgão de proteção, indicando finalidades distintas e como conferir contatos locais. Escreva uma resposta acolhedora a um relato simulado sem perguntas investigativas nem promessa de segredo absoluto. Monte um encaminhamento com responsável e confirmação de continuidade, usando dados inventados e mínimos. Confira se risco imediato não espera um calendário de reuniões e se o plano evita obrigar repetição do relato ou transformar o educador em investigador.',
      ] },
    ],
  },
];
const activities = [
  { module: 1, skill: 'relacionar-adolescencia-direitos-territorio', prompt: 'Uma oficina coincide com saída da escola e transporte do grupo. A baixa presença deve levar primeiro a:', options: ['Rotular desinteresse de todos.', 'Excluir quem não chegou.', 'Analisar a barreira de acesso e rever o planejamento com os participantes.', 'Ignorar o território.'] },
  { module: 2, skill: 'planejar-participacao-adolescente', prompt: 'Um projeto já decidido é apresentado como escolha dos adolescentes. A participação melhora quando:', options: ['Os limites são explicitados e existem decisões reais com devolutiva sobre as contribuições.', 'Só se pede uma fotografia.', 'A opinião é coletada sem retorno.', 'Toda proposta é prometida sem verificar viabilidade.'] },
  { module: 3, skill: 'organizar-convivencia-protetiva-adolescente', prompt: 'Comentários humilhantes persistem após pedido para parar. A equipe deve:', options: ['Exigir tolerância para pertencer ao grupo.', 'Forçar reconciliação pública.', 'Considerar resolvido após uma palestra.', 'Interromper a exposição, acolher e acompanhar proteção pelo fluxo adequado.'] },
  { module: 4, skill: 'planejar-comunicacao-digital-adolescente', prompt: 'Uma campanha propõe usar relato identificável de participante. A intenção educativa:', options: ['Autoriza automaticamente qualquer exposição.', 'Não dispensa análise de finalidade, autorizações e proteção, com alternativas sem exposição.', 'Permite publicar só porque retirou o nome.', 'Substitui conferência de fontes.'] },
  { module: 5, skill: 'acolher-e-encaminhar-protecao-adolescente', prompt: 'Um adolescente revela violência e pede sigilo absoluto. A resposta responsável é:', options: ['Prometer segredo em qualquer situação.', 'Investigar detalhes para decidir se merece ajuda.', 'Acolher, explicar o compartilhamento necessário à proteção e acionar o fluxo e deveres aplicáveis.', 'Contar ao grupo para buscar apoio.'] },
];
const exam = [
  { module: 1, skill: 'relacionar-adolescencia-direitos-territorio', prompt: 'O trabalho educativo com adolescentes deve reconhecer:', options: ['Diversidade de trajetórias, direitos e condições do território.', 'Uma personalidade igual por faixa etária.', 'Origem social como incapacidade.', 'Ausência como prova automática de desinteresse.'] },
  { module: 1, skill: 'relacionar-adolescencia-direitos-territorio', prompt: 'O SCFV é:', options: ['Qualquer oficina sem vínculo institucional.', 'Uma punição por baixa presença.', 'Um substituto de todo atendimento especializado.', 'Serviço planejado de Proteção Social Básica, com convivência e fortalecimento de vínculos.'] },
  { module: 2, skill: 'planejar-participacao-adolescente', prompt: 'A devolutiva de uma escuta informa:', options: ['Somente que a reunião terminou.', 'O que foi considerado, próximos passos e limites justificados.', 'Que toda proposta foi aceita sem análise.', 'Apenas a quantidade de fotos.'] },
  { module: 2, skill: 'planejar-participacao-adolescente', prompt: 'Um indicador de projeto deve se relacionar:', options: ['Apenas ao número de materiais.', 'Somente à visibilidade do adulto.', 'À mudança pretendida e a critérios consistentes de acompanhamento.', 'À promessa de sucesso sem evidência.'] },
  { module: 3, skill: 'organizar-convivencia-protetiva-adolescente', prompt: 'Diante de violência ou intimidação, impor diálogo entre as partes como única solução:', options: ['Pode ignorar assimetria e proteção; a resposta deve considerar segurança e fluxo competente.', 'Sempre resolve sem acompanhamento.', 'É condição para acolher quem sofreu.', 'Dispensa intervenção do adulto.'] },
  { module: 3, skill: 'organizar-convivencia-protetiva-adolescente', prompt: 'Participação em grupo exige observar:', options: ['Somente se as cadeiras estão próximas.', 'Apenas silêncio.', 'Só a pessoa que decide tudo.', 'Acesso aos recursos, oportunidades de expressão e quem é silenciado.'] },
  { module: 4, skill: 'planejar-comunicacao-digital-adolescente', prompt: 'Antes de divulgar uma informação, é pertinente verificar:', options: ['Somente se já circulou muito.', 'Origem, contexto e data, buscando a fonte correspondente.', 'A quantidade de emojis.', 'A urgência do pedido de compartilhamento.'] },
  { module: 4, skill: 'planejar-comunicacao-digital-adolescente', prompt: 'Retirar o nome de uma história:', options: ['Sempre impede identificação.', 'Autoriza todo uso de imagem.', 'Pode ser insuficiente se outros detalhes identificarem a pessoa.', 'Dispensa finalidade e proteção.'] },
  { module: 5, skill: 'acolher-e-encaminhar-protecao-adolescente', prompt: 'Acolher relato espontâneo de violência exige:', options: ['Respeito e proteção, sem perguntas investigativas repetidas ou exposição ao grupo.', 'Produzir depoimento especial pelo educador sem habilitação.', 'Exigir prova detalhada antes de ajudar.', 'Prometer segredo sem limites.'] },
  { module: 5, skill: 'acolher-e-encaminhar-protecao-adolescente', prompt: 'Um encaminhamento responsável inclui:', options: ['Somente uma mensagem enviada.', 'Repetição da história a qualquer pessoa.', 'Um endereço escolhido ao acaso.', 'Responsável, finalidade, informação necessária e acompanhamento da continuidade pelo fluxo.'] },
];
export const courseRevision = defineCourse({
  courseId: 'ed089ba4-b89e-427c-9394-b0c4c54be111', slug: 'educacao-social-na-adolescencia', courseName: 'Educação Social na Adolescência', hours: 80,
  audience: 'Estudantes de fundamentos de educação social com adolescentes, participação e proteção, sem substituição de funções clínicas, investigativas ou técnicas do SUAS.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'camara-eca', title: 'Câmara — ECA, texto atualizado', url: 'https://www2.camara.leg.br/legin/fed/lei/1990/lei-8069-13-julho-1990-372211-normaatualizada-pl.html' },
    { id: 'mds-convivencia', title: 'MDS — Serviço de Convivência e Fortalecimento de Vínculos', url: 'https://www.gov.br/mds/pt-br/acoes-e-programas/suas/servicos-e-programas-1/convivencia-e-fortalecimento-de-vinculos' },
    { id: 'unicef-agenda', title: 'UNICEF — Guia metodológico Agenda Cidade 2025–2028', url: 'https://www.unicef.org/brazil/media/38316/file/Guia%20Metodol%C3%B3gico%20da%20Agenda%20Cidade%20UNICEF%20%282025-2028%29.pdf' },
    { id: 'unicef-escuta', title: 'Conanda/MDHC/UNICEF — Atendimento integrado e escuta protegida', url: 'https://www.unicef.org/brazil/innocenti/brazil/media/29026/file/Publicacao%20Lei%20Escuta%20Protegida.pdf.pdf' },
  ],
}, modules, activities, exam);
export default courseRevision;
