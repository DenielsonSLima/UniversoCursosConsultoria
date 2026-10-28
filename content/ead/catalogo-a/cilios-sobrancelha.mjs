import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Desenho da sobrancelha e referências de proporção',
    skills: ['planejar-desenho-sobrancelha'], sourceIds: ['senac-design'],
    sections: [
      { title: 'Ensino: medir ajuda a analisar, mas não impõe um único rosto ideal', paragraphs: [
        'O design organiza forma, espessura e contorno da sobrancelha considerando os fios existentes e a preferência da pessoa. A consulta identifica o que ela deseja preservar ou modificar e quais procedimentos foram realizados antes. A análise estética não autoriza diagnosticar uma condição de pele nem atribuir personalidade a um formato de rosto. Uma técnica de proporção é ferramenta de planejamento, não uma regra de que toda pessoa deve ter o mesmo desenho.',
        'Início, ponto alto e término são referências para descrever a linha da sobrancelha. Compare sua posição e espessura no conjunto, considerando diferenças naturais entre os lados. Um desenho em papel pode marcar essas referências e testar alternativas antes de qualquer retirada. A medição só é comparável quando posição e referência são consistentes. Uma diferença de fotografia ou de inclinação pode produzir aparência de assimetria que não deve ser corrigida retirando pelos sem análise.',
        'O mapeamento precisa distinguir fios a preservar, área de contorno proposta e regiões em que não há fios suficientes para o efeito desejado. Retirar de um lado não cria crescimento no outro. Confirme a proposta antes da execução prática, evitando uma mudança maior apenas porque um lado parece mais fácil de reduzir. Este módulo ensina leitura e desenho em suporte didático; técnicas de retirada e contato com a pele exigem formação prática adequada e cuidados sanitários específicos.',
      ] },
      { title: 'Caso resolvido: tentativa de igualar duas espessuras', paragraphs: [
        'Uma pessoa deseja preservar sobrancelhas espessas, mas um lado tem uma pequena região com menor densidade. Reduzir muito o lado mais cheio para torná-lo igual pode contrariar o pedido e produzir um resultado difícil de reverter. O planejamento considera o conjunto e a possibilidade de correção cosmética apropriada, quando cabível, com explicação do efeito temporário. A decisão é combinada antes de qualquer retirada.',
        'Em um desenho, o estudante marca início, ponto alto e término, além da área a preservar. Reavalia o mapa na mesma posição para não confundir inclinação com diferença de forma. O caso mostra que precisão inclui escolher o que não retirar. A proposta deve respeitar distribuição natural e preferência, sem prometer produzir fios ou transformar medidas em diagnóstico de caráter.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe em papel duas sobrancelhas fictícias com diferenças discretas. Marque início, ponto alto, término e área a preservar. Escreva perguntas para confirmar preferência de espessura e manutenção. Compare duas propostas sem executar pinçamento ou aplicação em pessoa real. Explique como posição e iluminação podem interferir na comparação. Confira se o mapa serve à escolha informada e se evita reduzir cada vez mais para perseguir igualdade absoluta ou associar traços físicos à personalidade.',
      ] },
    ],
  },
  {
    title: 'Cílios: leitura do efeito visual e planejamento em mapa',
    skills: ['distinguir-variaveis-design-cilios'], sourceIds: ['anvisa-colas', 'anvisa-cosmeticos'],
    sections: [
      { title: 'Ensino: efeito visual e adequação do procedimento são análises diferentes', paragraphs: [
        'Os cílios naturais fazem parte da região ocular e não devem ser tratados como suporte indiferente a qualquer material. Um planejamento estético distingue condição observada, efeito desejado e requisitos do procedimento e dos produtos. Este curso trabalha conceitos e simulações em desenho; não ensina aplicação de adesivo junto aos olhos nem certifica habilidade manual de alongamento. A escolha real exige capacitação específica e respeito às instruções, à finalidade e às restrições aplicáveis.',
        'Comprimento, curvatura e distribuição são variáveis diferentes na descrição de um efeito visual. Aumentar o comprimento em toda a linha não produz o mesmo desenho de variar regiões de forma planejada. Um mapa em papel permite representar a progressão e comunicar a intenção, mas não prova que aquele material ou conjunto é adequado a uma pessoa. A medida de um produto não deve ser escolhida apenas por parecer mais chamativa, ignorando as condições e limitações de uso.',
        'Compare um efeito com maior destaque central e outro com destaque deslocado, usando traços esquemáticos. Não existe um desenho obrigatório associado a um tipo de pessoa. A preferência e o contexto são discutidos sem prometer resultado idêntico a uma fotografia. Densidade visual não é autorização para aplicar quantidade ilimitada de material. Se faltam informações ou condições adequadas, o atendimento não deve prosseguir por tentativa. O mapa é uma etapa de planejamento e comunicação, não substituto de avaliação e execução técnica apropriadas.',
      ] },
      { title: 'Caso resolvido: mapa aprovado não comprova produto adequado', paragraphs: [
        'O estudante desenha um efeito que agrada à pessoa fictícia. Em seguida, descobre que não tem informação clara sobre a finalidade do adesivo disponível. A aprovação estética do mapa não autoriza usar esse produto. A escolha deve ser suspensa até verificar identidade, regularização e uso previsto com a documentação apropriada. Um desenho bem elaborado não elimina um risco de produto ou de procedimento.',
        'Ao comparar dois mapas, a equipe explica a diferença de distribuição sem afirmar que um deles corrigirá uma condição de saúde ou mudará a personalidade. O caso separa três planos: intenção visual, condição de uso e habilidade de execução. Confundi-los pode levar a considerar uma aprovação verbal como permissão para qualquer técnica. O aprendizado teórico precisa manter essa distinção ao planejar próximos estudos e treinamento.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe dois mapas esquemáticos de cílios, um com destaque central e outro com distribuição diferente. Descreva comprimento, curvatura e distribuição sem escolher adesivo ou aplicar material em alguém. Liste as informações de produto e de formação que ainda seriam necessárias antes de uma execução real. Explique por que um mapa aprovado não comprova segurança ou habilidade manual. Confira se a proposta não oferece uma medida universal, uma carga ilimitada ou uma promessa de resultado clínico.',
      ] },
    ],
  },
  {
    title: 'Pinças, acessórios e organização higiênica da estação',
    skills: ['organizar-instrumentos-design-olhar'], sourceIds: ['anvisa-beleza', 'anvisa-seguro'],
    sections: [
      { title: 'Ensino: finalidade do instrumento orienta o processamento necessário', paragraphs: [
        'O atendimento demanda materiais íntegros, iluminação e separação entre recursos preparados e utilizados. Organize o fluxo de pinças, escovas, aplicadores e itens pessoais antes de iniciar. Um instrumento não fica pronto apenas porque voltou à bandeja. A superfície deve permitir a higienização e a execução precisa, sem misturar material usado ao que será utilizado em outra pessoa. Cabelo, pó e resíduos não devem permanecer no apoio de recursos preparados.',
        'Limpeza remove sujidades; desinfecção e esterilização têm requisitos diferentes. Para pinças que podem entrar em contato com sangue, a Anvisa orienta métodos de esterilização reconhecidos e controláveis, precedidos de limpeza, observadas as regras locais. Borrifar álcool não é uma garantia universal de esterilidade. O processo deve seguir material, equipamento, instruções e validação aplicáveis, sem improvisar uma sequência porque o instrumento parece ter tocado apenas pele íntegra.',
        'Itens de uso único não voltam ao estoque preparado após contato com uma pessoa. Cosmético em uso deve ser manejado de forma a evitar contaminar a embalagem e o conteúdo, conforme as instruções. Mãos e recursos de proteção também exigem cuidado nas trocas de tarefa. Tocar telefone ou dinheiro e retornar ao procedimento com a mesma condição de mãos ou luvas pode transportar contaminação. O ambiente precisa permitir descartar e processar corretamente, em vez de depender de memória sobre qual item já foi usado.',
      ] },
      { title: 'Caso resolvido: pinça limpa visualmente sem processamento confirmado', paragraphs: [
        'Uma pinça utilizada parece limpa e está ao lado de outra preparada. Sem identificação ou confirmação do processamento, não se pode presumir que ambas têm a mesma condição. A pinça utilizada retorna ao fluxo apropriado e só poderá ser disponibilizada depois das etapas exigidas. A equipe revê a separação física e os registros para impedir mistura. A aparência não substitui a condição sanitária comprovada.',
        'O caso também exige planejamento de quantidade de instrumentos: uma agenda maior não justifica encurtar etapas entre clientes. A disponibilidade deve ser compatível com o tempo e os requisitos do processamento. Preparar mais recursos de forma adequada ou reorganizar horários são decisões operacionais possíveis; reutilizar sem o fluxo exigido não é uma solução. O atendimento seguro depende de estrutura real, não apenas de uma placa dizendo material higienizado.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Faça um desenho da estação separando preparado, utilizado e descarte. Liste informações necessárias para verificar o processamento de uma pinça e diferencie limpeza de esterilização sem inventar parâmetros de equipamento. Inclua um aplicador de uso único e mostre como evitar que volte ao estoque. Não utilize instrumentos ou resíduos reais. Revise se a agenda permite cumprir o fluxo, se a aparência não é a única prova e se tocar objetos externos exige avaliar a condição antes de retornar à tarefa.',
      ] },
    ],
  },
  {
    title: 'Cosméticos, adesivos e verificação da finalidade de uso',
    skills: ['verificar-produto-regiao-ocular'], sourceIds: ['anvisa-colas', 'anvisa-cosmeticos', 'anvisa-alisantes'],
    sections: [
      { title: 'Ensino: produto regular para uma finalidade não está autorizado para todas', paragraphs: [
        'A rotulagem e a consulta oficial permitem relacionar produto, empresa, finalidade, instruções e restrições. Regularização não significa autorização para qualquer região do corpo. Um produto capilar pode ter advertência de não usar em cílios ou sobrancelhas; não se adapta esse uso por semelhança de fios. Cosméticos, medicamentos e adesivos para finalidades não cosméticas são categorias diferentes, e uma promessa comercial não substitui a verificação.',
        'A Anvisa alerta para danos graves do uso de colas instantâneas não regularizadas como cosméticos em procedimentos de beleza. Não se utiliza cola de reparos para fixar cílios, mesmo que contenha nome de substância semelhante ao de outro produto. A finalidade e a formulação importam. Também não se mistura ou dilui um produto para criar um novo uso. Informação incompleta, embalagem sem identidade, lote ou validade não verificáveis exigem interromper a seleção, em vez de confiar no relato de quem vendeu.',
        'Produtos usados em sobrancelhas também exigem finalidade adequada e instruções específicas, inclusive para coloração temporária quando aplicável. Teste previsto pelo fabricante ou orientação competente não elimina toda possibilidade de reação, nem autoriza ignorar contraindicações e sinais de problema. Não ofereça um teste improvisado na região ocular para provar segurança. O estudo teórico compara rótulos fictícios e critérios de verificação; não pede experimentar cosméticos ou adesivos em voluntários.',
      ] },
      { title: 'Caso resolvido: embalagem capilar usada como se fosse para sobrancelha', paragraphs: [
        'Uma pessoa sugere usar um produto de cabelo na sobrancelha porque o resultado foi visto em uma rede social. A embalagem não autoriza essa finalidade e apresenta restrição de uso. A equipe não reduz a quantidade para tentar tornar a adaptação segura. Retira o produto da seleção para aquele procedimento e busca informação oficial e recurso apropriado, sem prometer que uma aplicação rápida evitará reação.',
        'Outro produto é anunciado apenas como cola forte. Sem identidade e finalidade cosmética adequadas, ele também não é opção de atendimento. O caso reforça que a verificação é específica: ter uma embalagem, uma nota de compra ou um nome químico conhecido não comprova adequação à região ocular. A decisão deve ocorrer antes de abrir e aplicar, e não depois de aparecer desconforto.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie dois rótulos fictícios descritos em texto: um com finalidade claramente definida e outro com informação incompleta ou uso incompatível. Monte uma conferência de identidade, regularização, validade, lote, instrução e restrição. Explique por que um produto capilar não pode ser automaticamente transferido para sobrancelha ou cílios. Não aplique nada para validar a hipótese. Revise se a atividade diferencia cola não cosmética e produto adequado e se um teste não é apresentado como garantia absoluta de ausência de reação.',
      ] },
    ],
  },
  {
    title: 'Sequência de atendimento, registro e resposta a intercorrências',
    skills: ['organizar-atendimento-design-olhar'], sourceIds: ['senac-design', 'anvisa-colas', 'anvisa-beleza'],
    sections: [
      { title: 'Ensino: a decisão de continuar é reavaliada ao longo do serviço', paragraphs: [
        'Uma sequência organizada relaciona consulta, proposta visual, verificação dos recursos, execução por pessoa capacitada, conferência do resultado e orientação pertinente. Confirmar preferência não equivale a autorizar qualquer produto ou técnica. Se a condição observada ou os recursos não permitem o procedimento adequado, o plano precisa ser revisto. Não se utiliza uma assinatura para transferir ao cliente a responsabilidade de aceitar um risco evitável ou um uso incompatível com as instruções.',
        'Registre o que foi combinado e realizado, com identificação de produtos e dados pertinentes conforme o serviço. Isso ajuda a reconstruir o atendimento em caso de dúvida ou evento adverso. Fotos exigem finalidade e autorização adequadas; consentir com um serviço não significa autorizar publicação de imagem. A avaliação do resultado compara a proposta e a condição final sem pressionar a pessoa a aceitar uma mudança não combinada. O registro precisa preservar privacidade e acesso compatível.',
        'Ardência, dor, irritação importante ou alteração visual durante ou após uma etapa não devem ser tratadas como prova de que o produto está fazendo efeito. Interrompa o procedimento e encaminhe prontamente para avaliação de saúde conforme a situação; em alteração visual ou lesão ocular, não espere terminar o atendimento. Não tente neutralizar com mistura caseira, usar removedor de finalidade diferente ou indicar colírio por conta própria. Preserve informações do produto e do ocorrido para o atendimento e a notificação pelos canais apropriados.',
      ] },
      { title: 'Caso resolvido: desconforto não é etapa obrigatória de beleza', paragraphs: [
        'Durante uma etapa, a pessoa relata ardência e mudança na visão. O profissional não continua para concluir o efeito prometido nem afirma que vai passar porque outra cliente também sentiu. Interrompe e encaminha para avaliação imediata adequada à situação, mantendo as informações de produto e momento da ocorrência. Não introduz outro cosmético ou medicamento para tentar neutralizar uma causa que não avaliou.',
        'A análise posterior considera identificação, instruções, condições do serviço e a notificação cabível, sem transformar o relato em publicidade ou exposição da pessoa. O caso diferencia qualidade estética e resposta a problema: um desenho aprovado não compensa dano e uma boa ficha só tem valor se os sinais efetivamente mudam a conduta. A prevenção inclui reconhecer quando a etapa não deve começar e quando precisa parar.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte uma ficha fictícia que separe proposta, recursos verificados, etapa realizada e orientação final. Inclua uma solicitação de uso de fotografia e diferencie essa finalidade do atendimento. Escreva uma resposta simulada a desconforto e alteração visual, com interrupção e encaminhamento de saúde, sem instrução de colírio, solvente ou neutralização. Confira se a comunicação é rápida e objetiva e se o registro permite identificar o produto, preservando privacidade e evitando promessas de que qualquer reação é normal.',
      ] },
    ],
  },
];
const activities = [
  { module: 1, skill: 'planejar-desenho-sobrancelha', prompt: 'Uma sobrancelha tem área de menor densidade e a pessoa quer preservar espessura. Qual planejamento é coerente?', options: ['Retirar muito da outra para igualar a qualquer custo.', 'Analisar o conjunto e confirmar uma proposta que respeite fios existentes e preferência.', 'Prometer crescimento imediato ao retirar.', 'Associar a diferença à personalidade.'] },
  { module: 2, skill: 'distinguir-variaveis-design-cilios', prompt: 'Um mapa de cílios foi aprovado visualmente, mas a finalidade do adesivo é desconhecida. O atendimento pode prosseguir?', options: ['Sim, a aprovação elimina a dúvida.', 'Sim, usando pouco.', 'Não; o mapa não substitui verificação de produto e condição de uso.', 'Sim, se a fotografia for bonita.'] },
  { module: 3, skill: 'organizar-instrumentos-design-olhar', prompt: 'Uma pinça usada está junto ao material preparado, sem processamento confirmado. O correto é:', options: ['Mantê-la fora do uso e encaminhar ao fluxo apropriado antes de disponibilizar novamente.', 'Presumir esterilidade pela aparência.', 'Usar em outra pessoa rapidamente.', 'Borrifar qualquer produto e considerar tudo concluído.'] },
  { module: 4, skill: 'verificar-produto-regiao-ocular', prompt: 'Um produto para cabelo traz restrição incompatível com uso na sobrancelha. O profissional deve:', options: ['Reduzir a quantidade para adaptar.', 'Seguir uma recomendação de rede social.', 'Misturar com outro para enfraquecer.', 'Não utilizá-lo nessa finalidade e verificar recurso apropriado.'] },
  { module: 5, skill: 'organizar-atendimento-design-olhar', prompt: 'A pessoa relata ardência e alteração visual. Qual resposta foi ensinada?', options: ['Concluir a etapa para depois avaliar.', 'Interromper e encaminhar prontamente à avaliação de saúde adequada, sem neutralização ou medicamento improvisado.', 'Afirmar que é efeito normal.', 'Aplicar solvente doméstico.'] },
];
const exam = [
  { module: 1, skill: 'planejar-desenho-sobrancelha', prompt: 'Início, ponto alto e término são:', options: ['Um diagnóstico de personalidade.', 'Uma regra de beleza idêntica para todos.', 'Referências de desenho a analisar no conjunto e confirmar com a preferência.', 'Autorização para retirar sem consulta.'] },
  { module: 1, skill: 'planejar-desenho-sobrancelha', prompt: 'Uma comparação entre os lados exige atenção a:', options: ['Posição, referências e diferenças naturais, antes de corrigir retirando.', 'Somente uma fotografia inclinada.', 'Retirar progressivamente até não restar diferença.', 'Uma espessura universal.'] },
  { module: 2, skill: 'distinguir-variaveis-design-cilios', prompt: 'Comprimento, curvatura e distribuição dos cílios:', options: ['São nomes iguais para a mesma variável.', 'Descrevem aspectos diferentes de um planejamento visual.', 'Permitem quantidade ilimitada de material.', 'Substituem capacitação para aplicação.'] },
  { module: 2, skill: 'distinguir-variaveis-design-cilios', prompt: 'Um mapa desenhado em papel:', options: ['Certifica habilidade manual junto aos olhos.', 'Comprova adequação de qualquer adesivo.', 'Dispensa informação de produto.', 'Ajuda no planejamento, mas não comprova condição de uso ou execução técnica.'] },
  { module: 3, skill: 'organizar-instrumentos-design-olhar', prompt: 'A organização dos instrumentos deve:', options: ['Misturar utilizados e preparados para economizar espaço.', 'Depender apenas da memória.', 'Separar fluxos e comprovar as etapas de processamento aplicáveis.', 'Aceitar aparência como único critério.'] },
  { module: 3, skill: 'organizar-instrumentos-design-olhar', prompt: 'Um aplicador de uso único após contato com a pessoa:', options: ['Não retorna ao estoque preparado para outra utilização.', 'Pode voltar se não tiver cor visível.', 'Fica limpo automaticamente.', 'Deve ser guardado na embalagem original para outro cliente.'] },
  { module: 4, skill: 'verificar-produto-regiao-ocular', prompt: 'Cola instantânea de reparos não regularizada como cosmético:', options: ['É adequada por ser forte.', 'Pode ser usada se tiver nome químico conhecido.', 'Dispensa finalidade indicada.', 'Não deve ser usada para fixar cílios em procedimento de beleza.'] },
  { module: 4, skill: 'verificar-produto-regiao-ocular', prompt: 'A verificação de um cosmético precisa relacionar:', options: ['Somente a embalagem atraente.', 'Identidade, regularização, finalidade, instruções e restrições pertinentes.', 'Apenas a promessa do vendedor.', 'Qualquer uso com pequena quantidade.'] },
  { module: 5, skill: 'organizar-atendimento-design-olhar', prompt: 'Autorizar o serviço significa autorizar automaticamente publicação de fotos?', options: ['Sim, em qualquer canal.', 'Sim, se o resultado ficou bom.', 'Não; uso de imagem tem finalidade e autorização próprias.', 'Sim, basta ocultar o nome.'] },
  { module: 5, skill: 'organizar-atendimento-design-olhar', prompt: 'Uma ficha de atendimento útil deve:', options: ['Relacionar o combinado, recursos e produtos, execução e ocorrências, com privacidade.', 'Transferir toda responsabilidade ao cliente.', 'Dispensar resposta a alteração visual.', 'Ser substituída por exposição pública da reação.'] },
];
export const courseRevision = defineCourse({
  courseId: 'cf1c3c60-22d0-4b68-991e-b7c5a370eedc', slug: 'designer-de-cilios-e-sobrancelha', courseName: 'Designer de Cílios e Sobrancelha', hours: 80,
  audience: 'Estudantes de fundamentos de desenho e planejamento do olhar, com exercícios em papel e verificação de produtos e cuidados; não certifica execução manual de procedimentos oculares.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'senac-design', title: 'Senac MS — Referências de formação em design de sobrancelhas', url: 'https://dev.ms.senac.br/Curso/Detalhe/31142' },
    { id: 'anvisa-colas', title: 'Anvisa — Perigos de colas instantâneas não cosméticas em procedimentos de beleza', url: 'https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2024/anvisa-alerta-sobre-perigos-do-uso-indevido-de-colas-instantaneas-em-procedimentos-de-beleza' },
    { id: 'anvisa-cosmeticos', title: 'Anvisa — RDC 907/2024, definição, rotulagem e regularização de cosméticos', url: 'https://anvisalegis.datalegis.net/action/ActionDatalegis.php?acao=abrirTextoAto&cod_menu=9431&cod_modulo=310&link=S&numeroAto=00000907&orgao=RDC%2FDC%2FANVISA%2FMS&seqAto=000&tipo=RDC&valorAno=2024' },
    { id: 'anvisa-beleza', title: 'Anvisa — Serviços de embelezamento, processamento e regras locais', url: 'https://www.gov.br/anvisa/pt-br/acessoainformacao/perguntasfrequentes/servicos-de-saude/servicos-de-embelezamento/' },
    { id: 'anvisa-seguro', title: 'Anvisa — Estabelecimento seguro', url: 'https://www.gov.br/anvisa/pt-br/comunicacao/campanhas/estetica/estabelecimento-seguro' },
    { id: 'anvisa-alisantes', title: 'Anvisa — Produtos alisantes e ondulantes para cabelo e restrições', url: 'https://www.gov.br/anvisa/pt-br/comunicacao/campanhas/estetica/produtos-alisantes-e-ondulantes-para-cabelo' },
  ],
}, modules, activities, exam);
export default courseRevision;
