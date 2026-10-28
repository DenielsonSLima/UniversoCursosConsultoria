import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Consulta de estilo e leitura do cabelo e da barba',
    skills: ['planejar-estilo-barbearia'], sourceIds: ['senac-corte', 'seduc-secoes'],
    sections: [
      { title: 'Ensino: traduzir uma referência em decisões de comprimento e forma', paragraphs: [
        'O planejamento começa pela conversa sobre o resultado desejado e a manutenção possível no cotidiano. Uma fotografia pode ajudar, mas não define sozinha o serviço. Pergunte o que a pessoa quer preservar, quanto aceita retirar e como costuma arrumar o cabelo e a barba. Antes de usar ferramentas, confirme o entendimento. Expressões como curto ou só acertar significam coisas diferentes para pessoas diferentes; transformá-las em referências compreensíveis reduz mudanças não autorizadas.',
        'Observe direção de crescimento, distribuição de volume, textura aparente, comprimento atual e áreas em que o cabelo se comporta de modo diferente. Um redemoinho pode interferir no caimento; uma barba pode ter densidades distintas entre regiões. Essas características ajudam a planejar o resultado, sem tratar uma textura como defeito ou prometer reprodução exata de outra pessoa. A avaliação estética não inclui diagnóstico de doença de pele ou do couro cabeludo.',
        'Combine referências de contorno, volume e relação entre topo e laterais. Um estilo pode exigir finalização frequente; outro prioriza manutenção simples. A decisão deve respeitar preferência e condições observadas, sem impor um formato de rosto como regra obrigatória de beleza. Se há uma condição de pele que torna o procedimento inadequado ou exige avaliação, não tente escondê-la com produto ou passar a lâmina para testar. Reorganize o atendimento e encaminhe a questão pertinente.',
      ] },
      { title: 'Caso resolvido: fotografia com topo maior que o disponível', paragraphs: [
        'A pessoa apresenta uma referência com topo longo e laterais curtas, mas o comprimento atual do topo é menor que o da fotografia. O barbeiro explica a diferença e combina uma aproximação possível, preservando o crescimento necessário para outra etapa. Não promete produzir imediatamente um comprimento que não existe. A conversa identifica o que pode ser feito agora e o que depende de tempo e manutenção.',
        'O plano registra em linguagem simples a intenção acordada: manter o topo disponível, organizar laterais e conferir o contorno antes da finalização. A referência passa a apoiar a comunicação, em vez de substituir a avaliação do cabelo presente. O caso também demonstra que satisfação não depende apenas da execução técnica, mas da clareza sobre o resultado possível e sobre o que será retirado.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Prepare um roteiro de consulta para um personagem fictício com uma fotografia de referência descrita em palavras. Inclua perguntas sobre comprimento, rotina e manutenção, sem usar imagens pessoais de terceiros. Desenhe um plano simples com topo, laterais e contorno, marcando uma diferença entre referência e condição atual. Explique como confirmar a decisão antes do corte. O exercício não exige cortar cabelo real; revise se o plano respeita textura e preferência, em vez de impor um padrão único de aparência.',
      ] },
    ],
  },
  {
    title: 'Estação de trabalho, processamento dos materiais e lâminas',
    skills: ['organizar-higiene-barbearia'], sourceIds: ['anvisa-beleza', 'anvisa-seguro', 'anvisa-laminas'],
    sections: [
      { title: 'Ensino: a preparação sanitária antecede o próximo cliente', paragraphs: [
        'O atendimento precisa de bancada organizada, iluminação, recursos íntegros e materiais em condição adequada. Cabelo aparado e resíduos não devem permanecer sobre ferramentas prontas para uso. Separe o fluxo do material utilizado e do material preparado. Higiene das mãos, proteção apropriada e troca de itens pessoais conforme o uso fazem parte do serviço. Luvas não substituem higiene nem tornam seguro alternar telefone, dinheiro e contato com o cliente sem os cuidados necessários.',
        'Limpeza, desinfecção e esterilização têm finalidades diferentes. O processamento de cada instrumento considera seu uso, material, instrução do fabricante e exigências sanitárias aplicáveis. Não afirme que um borrifador torna qualquer ferramenta estéril. A Anvisa orienta métodos reconhecidos, controláveis e validados para materiais que podem entrar em contato com sangue; regras locais também precisam ser atendidas. Um equipamento vendido com nome de esterilizador não comprova, por si só, eficácia do processo.',
        'Lâminas de uso único não são reutilizadas em outra pessoa. O descarte de perfurocortantes ocorre em recipiente apropriado, de acordo com o gerenciamento de resíduos, evitando exposição de quem recolhe depois. Não deixe a lâmina usada solta na bancada nem em lixo comum. A retirada e o descarte seguem técnica e treinamento apropriados, sem manipular a parte cortante por improviso. O curso trabalha os critérios de organização; a execução com ferramentas exige prática orientada.',
      ] },
      { title: 'Caso resolvido: estação aparentemente pronta com material usado', paragraphs: [
        'A cadeira está limpa, mas um pente utilizado e uma lâmina usada continuam junto ao material separado para o próximo atendimento. A estação não está pronta. A equipe mantém os itens utilizados no fluxo correspondente, providencia o descarte da lâmina no recipiente apropriado e confere a condição dos recursos antes de receber o próximo cliente. Limpar apenas a cadeira deixa um risco importante sem tratamento.',
        'A revisão da rotina identifica se há espaço definido para material utilizado, recipiente acessível e tempo para a preparação entre pessoas. A pressa da agenda não justifica reutilizar o descartável nem marcar um processamento que não ocorreu. O caso diferencia aparência organizada de condição sanitária efetiva e mostra por que o trajeto das ferramentas precisa ser conhecido pela equipe.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe uma estação de barbearia com separação entre material pronto, utilizado e resíduos. Faça uma lista de conferência entre atendimentos, distinguindo limpeza do ambiente e processamento dos instrumentos. Explique por que uma lâmina usada não pode voltar à área preparada. Não manipule lâminas reais para este exercício. Confira se seu desenho permite cumprir instruções dos produtos e as regras locais e se ninguém depende de reconhecer uma ferramenta usada apenas pela aparência.',
      ] },
    ],
  },
  {
    title: 'Seções, mecha de referência e controle do corte com tesoura',
    skills: ['relacionar-secao-guia-corte'], sourceIds: ['senac-corte', 'seduc-secoes'],
    sections: [
      { title: 'Ensino: controlar a referência permite conferir a forma', paragraphs: [
        'Dividir o cabelo em regiões ajuda a organizar o corte e a relacionar partes da forma planejada. Topo, laterais, região posterior e nuca são referências de organização, não uma obrigação de usar a mesma divisão em todo estilo. A posição da cabeça e a direção natural do cabelo interferem na leitura do comprimento. Mudar essas condições sem perceber pode produzir um resultado diferente mesmo quando se tenta repetir a mesma medida.',
        'Uma mecha de referência orienta o comprimento ou a relação que será mantida nas seguintes, conforme a técnica planejada. Sem conseguir visualizar a referência, cortar mais não é uma solução de controle. A largura da seção e a organização do cabelo precisam permitir comparação. Elevação, direção da mecha e posição dos dedos influenciam a forma; nomes de ângulos só têm sentido quando se explicita a referência usada na técnica. Este estudo não reduz todos os cortes a uma fórmula única.',
        'A conferência verifica se o resultado está coerente com o plano, considerando caimento e relação entre regiões. Uma diferença aparente pode estar ligada à posição, tensão ou distribuição do cabelo. Antes de corrigir retirando mais, reavalie as referências. O treino inicial deve ocorrer em recurso didático adequado e com orientação técnica; tesouras e ferramentas cortantes não são recursos para tentativa livre em outra pessoa. O texto prepara a leitura do procedimento e a tomada de decisões de aprendizagem.',
      ] },
      { title: 'Caso resolvido: referência perdida em uma seção ampla', paragraphs: [
        'Em um exercício de planejamento, a seção ficou ampla e a mecha de referência não pode ser vista com clareza. A decisão correta é reorganizar a divisão e recuperar a referência conforme a técnica ensinada na prática, não escolher um comprimento ao acaso. O problema não se resolve tentando compensar depois na região seguinte. A organização permite controlar o que será comparado antes de retirar comprimento.',
        'Na conferência, a cabeça do modelo didático está inclinada de forma diferente da posição utilizada antes. A avaliação precisa considerar essa mudança, pois a aparência de comprimento pode ser afetada. O caso mostra que precisão não vem apenas da ferramenta: depende também de condições consistentes de observação. A correção começa pela análise do processo, evitando uma sequência de cortes cada vez mais curtos para perseguir uma diferença mal compreendida.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Faça um desenho de cabeça em vista lateral e posterior, marcando regiões e uma referência de comprimento. Explique como uma seção muito ampla ou uma mudança de posição pode dificultar o controle. Escreva quais informações precisaria confirmar com o instrutor antes de treinar a técnica com tesoura. Sem cortar cabelo, simule no desenho uma conferência e descreva por que retirar mais não deve ser a primeira resposta a toda diferença percebida. Preserve a relação entre plano, referência e verificação.',
      ] },
    ],
  },
  {
    title: 'Máquina, comprimentos e planejamento de transições',
    skills: ['planejar-transicao-comprimentos'], sourceIds: ['senac-corte', 'seduc-secoes'],
    sections: [
      { title: 'Ensino: conhecer a medida do acessório e o efeito esperado', paragraphs: [
        'A máquina e seus acessórios controlam comprimentos, mas o número impresso no pente não deve ser tratado como medida universal entre todos os fabricantes. Consulte a indicação em milímetros e o manual do conjunto utilizado. Ajuste de alavanca, direção de trabalho e características do cabelo também influenciam o resultado. Um acessório mal encaixado ou danificado é uma condição de interrupção, e não algo a compensar com atenção extra enquanto continua em uso.',
        'Uma transição planejada relaciona regiões mais curtas e mais longas. O desenho prévio indica onde manter volume e como as faixas se conectam, respeitando o estilo combinado. Usar comprimentos menores em qualquer ponto para apagar uma marca pode deslocar a região curta e alterar toda a proposta. O reconhecimento de uma linha ou diferença exige observar forma, iluminação, caimento e técnica, antes de uma retirada adicional. Não existe uma sequência única de pentes que sirva a todas as cabeças e estilos.',
        'A preparação inclui conferir funcionamento, aquecimento, integridade e condição de higiene conforme instruções do equipamento. A técnica de manuseio e a aproximação de áreas sensíveis exigem ensino prático orientado. Neste módulo, o exercício é planejar e interpretar comprimentos, sem prescrever uma manobra de corte em pessoa real. A relação numérica entre medidas ajuda a organizar a intenção: 10 mm é maior que 7 mm, independentemente do nome comercial do acessório.',
      ] },
      { title: 'Caso resolvido: acessórios com números semelhantes e medidas diferentes', paragraphs: [
        'Um estudante troca de conjunto de máquina e escolhe um pente apenas pelo número que reconhece. Ao conferir, percebe que a medida em milímetros não corresponde ao comprimento pretendido. A seleção deve ser corrigida antes do uso, considerando a indicação e a compatibilidade do equipamento. Memória do nome não substitui identificação da medida real do acessório. O planejamento continua baseado no resultado combinado.',
        'Em um desenho de transição, a região inferior foi marcada com 5 mm, a intermediária com 8 mm e uma superior com maior comprimento. Essas medidas são uma simulação de relação, não uma receita de corte universal. Se a pessoa quer preservar volume mais baixo, mover a faixa curta para cima pode contrariar o plano. O caso mostra que apagar uma marca sem avaliar o conjunto pode comprometer a forma pretendida.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie um mapa fictício de comprimentos em milímetros para três regiões, sem executar o corte. Explique a ordem das medidas e o volume que deseja preservar. Escreva uma conferência de acessório que inclua compatibilidade, integridade e indicação do fabricante. Introduza uma linha aparente e descreva quais referências observaria antes de propor correção com o instrutor. Revise se o plano evita equivalências automáticas de números de pentes e se não transforma uma simulação em receita para todos os clientes.',
      ] },
    ],
  },
  {
    title: 'Desenho da barba, contorno e avaliação da finalização',
    skills: ['planejar-barba-finalizacao'], sourceIds: ['senac-corte', 'anvisa-beleza', 'anvisa-laminas'],
    sections: [
      { title: 'Ensino: distribuição dos fios e preferência orientam o desenho', paragraphs: [
        'A barba apresenta direção de crescimento e densidade que podem variar entre regiões e lados. O desenho deve considerar essa distribuição e a preferência da pessoa, sem prometer preencher uma área apenas retirando fios de outra. Comprimento, volume e contorno são decisões relacionadas, mas diferentes. Antes de reduzir, confirme o que será preservado. Uma simetria visual não se obtém obrigatoriamente retirando a mesma quantidade de cada lado quando o crescimento é diferente.',
        'O contorno define o limite visual acordado, respeitando a condição da pele. A técnica com lâmina exige treinamento prático e material apropriado de uso único; não deve ser improvisada sobre área irritada ou lesionada. Não se usa cosmético para anestesiar um desconforto nem se indica medicamento como parte do acabamento estético. Se aparece uma condição que impede a continuidade, interrompa a etapa e siga o encaminhamento adequado, sem diagnosticar a origem da alteração.',
        'Na finalização, observe o conjunto nas condições combinadas e confirme se o resultado corresponde ao pedido. Produtos precisam ser adequados à finalidade, regulares e usados conforme instruções. Não misture substâncias ou aplique produto sem identidade para obter um efeito prometido. Explique uma manutenção simples compatível com o serviço e seus limites. A conferência do resultado não autoriza fazer uma mudança significativa depois de a pessoa ter aprovado outro comprimento.',
      ] },
      { title: 'Caso resolvido: densidade diferente entre os lados', paragraphs: [
        'Uma barba tem menor densidade em uma região lateral. A pessoa deseja preservar o comprimento. Retirar bastante do lado mais cheio para copiar exatamente a quantidade de fios do outro não é uma solução automaticamente coerente com o pedido. O profissional conversa sobre o efeito possível, planeja volume e contorno e confirma o que será feito. A análise considera o conjunto, em vez de transformar assimetria natural em defeito a eliminar a qualquer custo.',
        'Antes da etapa de contorno, uma área apresenta irritação visível. O atendimento precisa ser reorganizado sem passar a lâmina para testar se incomoda. A preferência estética não elimina o cuidado com a condição da pele. O caso mostra como planejamento e observação continuam até o acabamento: não basta cumprir uma sequência por hábito quando surgem informações que exigem mudar a etapa prevista.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe uma barba fictícia com regiões de densidade diferente e escreva duas perguntas para confirmar o resultado desejado. Diferencie redução de comprimento, organização de volume e definição de contorno. Acrescente uma condição de pele que exige suspender uma etapa e descreva o encaminhamento sem diagnosticar ou indicar medicamento. Não utilize lâmina real para o exercício. Confira se a finalização respeita a preferência, usa produtos identificados e não promete modificar a distribuição natural dos fios.',
      ] },
    ],
  },
];
const activities = [
  { module: 1, skill: 'planejar-estilo-barbearia', prompt: 'A referência tem topo mais longo que o comprimento atual. Qual conversa deve anteceder o serviço?', options: ['Prometer reprodução imediata exata.', 'Explicar a diferença e combinar o resultado possível preservando a intenção.', 'Cortar sem confirmar o que será preservado.', 'Desconsiderar a rotina da pessoa.'] },
  { module: 2, skill: 'organizar-higiene-barbearia', prompt: 'Uma lâmina usada permanece ao lado das ferramentas preparadas. Qual ação é necessária?', options: ['Guardar para outra pessoa.', 'Borrifar qualquer produto e reutilizar.', 'Providenciar descarte próprio e restabelecer a separação do material utilizado e preparado.', 'Considerar a estação pronta pela cadeira limpa.'] },
  { module: 3, skill: 'relacionar-secao-guia-corte', prompt: 'Uma seção ampla impede visualizar a referência. O controle melhora ao:', options: ['Reorganizar a seção e recuperar a referência conforme a técnica orientada.', 'Escolher um comprimento aleatório.', 'Retirar sempre mais para compensar.', 'Ignorar a posição da cabeça.'] },
  { module: 4, skill: 'planejar-transicao-comprimentos', prompt: 'Ao trocar de conjunto de máquina, a escolha do pente deve conferir:', options: ['Apenas o número lembrado.', 'Somente a cor do acessório.', 'O que outro fabricante costuma indicar.', 'Medida em milímetros, compatibilidade e instrução do fabricante.'] },
  { module: 5, skill: 'planejar-barba-finalizacao', prompt: 'Uma área da pele apresenta irritação antes do contorno com lâmina. Qual decisão foi ensinada?', options: ['Passar para testar se incomoda.', 'Suspender a etapa e reorganizar o atendimento com o encaminhamento adequado.', 'Indicar medicamento sem avaliação.', 'Esconder a condição com produto sem identidade.'] },
];
const exam = [
  { module: 1, skill: 'planejar-estilo-barbearia', prompt: 'A fotografia de referência deve ser utilizada como:', options: ['Garantia de resultado idêntico em qualquer cabelo.', 'Substituto da conversa.', 'Apoio à comunicação, considerando comprimento, crescimento e preferência reais.', 'Autorização para retirar qualquer quantidade.'] },
  { module: 1, skill: 'planejar-estilo-barbearia', prompt: 'Antes de interpretar o pedido curto, é adequado:', options: ['Confirmar quanto retirar e o que preservar em referências compreensíveis.', 'Adotar uma medida única para todos.', 'Escolher o estilo sem conversar.', 'Presumir que qualquer redução serve.'] },
  { module: 2, skill: 'organizar-higiene-barbearia', prompt: 'Limpeza e esterilização:', options: ['São sinônimos pela aparência.', 'Têm finalidades e requisitos diferentes; um borrifador não comprova esterilidade.', 'Podem ser registradas sem execução.', 'Dispensam instruções e normas locais.'] },
  { module: 2, skill: 'organizar-higiene-barbearia', prompt: 'A lâmina de uso único após o atendimento deve:', options: ['Voltar à embalagem para outro cliente.', 'Ir solta ao lixo comum.', 'Ser guardada com pentes limpos.', 'Seguir descarte de perfurocortante em recipiente apropriado.'] },
  { module: 3, skill: 'relacionar-secao-guia-corte', prompt: 'A mecha de referência contribui para:', options: ['Eliminar a necessidade de planejamento.', 'Garantir qualquer corte sem orientação.', 'Controlar relações de comprimento dentro da técnica planejada.', 'Dispensar conferência de posição.'] },
  { module: 3, skill: 'relacionar-secao-guia-corte', prompt: 'Ao perceber uma diferença aparente, antes de retirar mais, convém:', options: ['Reavaliar posição, tensão, distribuição e referências do plano.', 'Encurtar indefinidamente todas as regiões.', 'Ignorar o caimento.', 'Mudar o pedido sem conversar.'] },
  { module: 4, skill: 'planejar-transicao-comprimentos', prompt: 'Um acessório danificado ou mal encaixado exige:', options: ['Continuar com mais pressa.', 'Usar em uma área menor para testar.', 'Apenas segurar com força.', 'Interromper o uso e corrigir a condição antes da continuidade.'] },
  { module: 4, skill: 'planejar-transicao-comprimentos', prompt: 'Mover a faixa curta para cima apenas para apagar uma linha pode:', options: ['Preservar automaticamente qualquer plano.', 'Alterar a forma e o volume que se pretendia manter.', 'Dispensar avaliação do conjunto.', 'Ser uma solução universal.'] },
  { module: 5, skill: 'planejar-barba-finalizacao', prompt: 'Densidades diferentes na barba devem ser consideradas:', options: ['Como obrigação de retirar a mesma quantidade dos dois lados.', 'Como defeito a ocultar com qualquer produto.', 'No planejamento do volume e contorno, com preferência e resultado possível.', 'Como motivo para prometer crescimento imediato.'] },
  { module: 5, skill: 'planejar-barba-finalizacao', prompt: 'Produtos de finalização precisam:', options: ['Ter identidade, finalidade adequada e uso conforme instruções e regularidade.', 'Ser misturados livremente para maior efeito.', 'Substituir avaliação de uma lesão.', 'Dispensar validade por serem cosméticos.'] },
];
export const courseRevision = defineCourse({
  courseId: '87d24625-edc4-4754-87d3-4ee5ee962283', slug: 'barbeiro-profissional', courseName: 'Barbeiro Profissional', hours: 120,
  audience: 'Estudantes de fundamentos de planejamento, higiene, formas e referências do corte e da barba, articulados à prática técnica orientada.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'senac-corte', title: 'Senac RJ — Workshop de corte, procedimentos e referências', url: 'https://portaleducativo.rj.senac.br/wp-content/uploads/2024/09/E-book-Cabeleireiro-Workshop-Corte.pdf' },
    { id: 'seduc-secoes', title: 'Seduc CE — Cabelo e maquiagem, seções e referências de corte', url: 'https://www.ced.seduc.ce.gov.br/wp-content/uploads/sites/82/2022/05/card-cabelo-e-maquiagem-13.pdf' },
    { id: 'anvisa-beleza', title: 'Anvisa — Perguntas frequentes sobre serviços de embelezamento', url: 'https://www.gov.br/anvisa/pt-br/acessoainformacao/perguntasfrequentes/servicos-de-saude/servicos-de-embelezamento/' },
    { id: 'anvisa-seguro', title: 'Anvisa — Estabelecimento seguro', url: 'https://www.gov.br/anvisa/pt-br/comunicacao/campanhas/estetica/estabelecimento-seguro' },
    { id: 'anvisa-laminas', title: 'Anvisa/Senacon — Boletim consumo e saúde, salão de beleza', url: 'https://www.gov.br/anvisa/pt-br/centraisdeconteudo/publicacoes/cosmeticos/publicacoes/boletim-consumo-e-saude-junho-2017-ano-10-no-47.pdf/@@download/file' },
  ],
}, modules, activities, exam);
export default courseRevision;
