import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Higiene do manipulador e contaminação cruzada',
    skills: ['prevenir-contaminacao-cozinha'], sourceIds: ['anvisa-rdc216', 'anvisa-cartilha'],
    sections: [
      { title: 'Ensino: um alimento aparentemente normal pode estar contaminado', paragraphs: [
        'A segurança do alimento depende do percurso de produção, não apenas de aparência, cheiro ou sabor. Contaminação biológica envolve agentes como microrganismos; contaminação química pode ocorrer por resíduo de produto inadequado; contaminação física envolve materiais estranhos, como fragmentos de vidro. Um alimento sem alteração perceptível não está automaticamente seguro. Provar uma preparação não é método de verificar sua segurança sanitária.',
        'Mãos, utensílios e superfícies podem transportar contaminação de uma etapa para outra. A contaminação cruzada ocorre, por exemplo, quando um utensílio usado em alimento cru entra em contato com uma preparação pronta sem a higienização adequada. Organize o trabalho para separar essas etapas e siga a rotina de limpeza e desinfecção do serviço. Uma superfície que parece limpa ainda precisa cumprir o procedimento previsto antes do próximo uso.',
        'Higienize as mãos nos momentos necessários, inclusive após sanitário, interrupções e contato com materiais que possam contaminar o trabalho. Luvas, quando utilizadas, não substituem essa higiene nem autorizam tocar tudo com o mesmo par. A saúde do manipulador precisa ser comunicada conforme o procedimento do serviço, especialmente em situações que possam comprometer os alimentos. Uniforme, proteção dos cabelos e ausência de adornos fazem parte da organização higiênica da tarefa.',
      ] },
      { title: 'Caso resolvido: da carne crua à salada pronta', paragraphs: [
        'Um auxiliar termina de preparar carne crua e usa a mesma faca e a mesma bancada para cortar uma salada que será servida sem cocção. A ausência de sujeira visível não autoriza a troca de etapa. O fluxo deveria separar a manipulação ou realizar a higienização adequada dos utensílios e da superfície, além da higiene das mãos. Se a salada já foi exposta à contaminação, a situação deve ser comunicada ao responsável para a ação prevista.',
        'Não se resolve o problema apenas enxugando a faca em um pano. O caso precisa gerar prevenção: sequência de trabalho, utensílios disponíveis, identificação das áreas e compreensão da equipe. Higiene é uma operação executada e verificada, não um rótulo colado na bancada. A avaliação da preparação afetada não deve ser substituída por prova de sabor ou pela decisão de servir rapidamente.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe uma sequência fictícia para preparar alimento cru e uma salada pronta, identificando pontos de troca de tarefa, utensílios e higiene das mãos. Liste um risco biológico, um químico e um físico, com a medida preventiva correspondente. Não use alimento destinado ao consumo para testar uma contaminação. Confira se sua sequência não depende apenas de inspeção visual ou de luvas. Explique como comunicaria uma falha já ocorrida sem esconder a preparação envolvida.',
      ] },
    ],
  },
  {
    title: 'Recebimento, identificação e conservação dos ingredientes',
    skills: ['conferir-ingredientes-cozinha'], sourceIds: ['anvisa-rdc216', 'anvisa-cartilha'],
    sections: [
      { title: 'Ensino: aceitar um ingrediente exige mais que contar embalagens', paragraphs: [
        'No recebimento, confira o produto previsto, a integridade da embalagem, a identificação, a validade e as condições de conservação aplicáveis. Produtos que exigem temperatura controlada precisam da verificação prevista pelo serviço, com instrumento e procedimento adequados. Uma entrega no horário e uma nota fiscal correta não provam que a condição sanitária foi mantida. Divergências devem ser identificadas antes de misturar o lote com o estoque liberado.',
        'O armazenamento protege os alimentos e facilita a retirada do que vence antes, quando adequado. Separe matérias-primas, preparações prontas e produtos de limpeza, evitando contato e gotejamento que contaminem alimentos. Não coloque recipientes diretamente no chão nem use embalagens sem condições de proteção. Mantenha identificação e acesso para conferência. A geladeira não corrige uma matéria-prima recebida em condição inadequada nem torna seguro todo produto por tempo indefinido.',
        'Após abrir ou fracionar um ingrediente, preserve as informações necessárias à identificação e à conservação, incluindo validade após abertura quando aplicável. Essa condição vem da orientação do produto e do procedimento validado do serviço, não de uma regra inventada de que tudo dura a mesma quantidade de dias. Nunca transfira saneantes para recipiente que pareça conter alimento. O endereço do produto e a etiqueta precisam ajudar alguém diferente de quem fez a operação a reconhecer o que está guardado.',
      ] },
      { title: 'Caso resolvido: embalagem violada em uma entrega', paragraphs: [
        'Chegam doze embalagens de um ingrediente. Onze estão íntegras e uma apresenta violação. O auxiliar não distribui o conteúdo desta última entre as demais para evitar perda. Identifica a divergência e segue o fluxo de segregação e decisão do responsável. A conferência por quantidade continua importante, mas não substitui a análise da condição de cada unidade. O registro diferencia recebimento físico de liberação para uso.',
        'No estoque, duas unidades liberadas têm validades diferentes. A organização permite usar primeiro a que vence antes, sem ignorar identificação e condição de conservação. Se uma etiqueta se solta e não é possível identificar com segurança o conteúdo, o produto vira uma pendência para avaliação; não recebe uma etiqueta baseada apenas na memória de um colega. O controle reduz o risco de um ingrediente sem identidade chegar ao preparo.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte uma ficha fictícia de recebimento com identificação do produto, lote quando aplicável, validade, embalagem, condição de conservação e divergência. Crie uma entrega com uma unidade violada e descreva como mantê-la separada sem decidir sozinho pela liberação. Desenhe uma prateleira de ingredientes e um local separado para saneantes. Confira se um produto aberto continua identificável e explique por que contar volumes recebidos não basta para aceitá-los sanitariamente.',
      ] },
    ],
  },
  {
    title: 'Pré-preparo, receita padronizada e rendimento',
    skills: ['calcular-preparo-rendimento'], sourceIds: ['anvisa-rdc216', 'anvisa-cartilha'],
    sections: [
      { title: 'Ensino: organizar quantidades, utensílios e etapas antes de produzir', paragraphs: [
        'O pré-preparo organiza ingredientes e recursos conforme a receita e o fluxo higiênico do serviço. Antes de começar, leia toda a sequência, confira quantidades, equipamentos e tempo disponível. Separar previamente o necessário não significa deixar ingredientes perecíveis fora da conservação por longo período. A organização deve permitir retirar e manipular porções de modo compatível com o procedimento, evitando interrupções e cruzamento entre etapas sujas e limpas.',
        'Uma receita padronizada informa ingredientes, quantidades, método, rendimento e porção de referência. Ao ampliar uma receita, o fator de ajuste é a quantidade desejada dividida pelo rendimento original. Multiplicar ingredientes por esse fator ajuda a estimar a necessidade, mas não autoriza ampliar indefinidamente um recipiente ou equipamento. Tempo de cocção e capacidade precisam de avaliação: uma panela mais cheia não é apenas a mesma operação em tamanho maior.',
        'Peso bruto é a quantidade antes de determinadas perdas de limpeza; peso líquido é o que resta para uso na etapa considerada. Se 5 kg de um vegetal fornecem 4 kg após o pré-preparo, o rendimento de limpeza é 4 dividido por 5, ou 80%. Esses números são um exemplo, não uma característica fixa de todo vegetal. Medir o rendimento real permite planejar a compra e investigar desperdício, sem reutilizar partes impróprias apenas para melhorar um indicador.',
      ] },
      { title: 'Caso resolvido: ajustar uma receita e conferir porções', paragraphs: [
        'Uma ficha fictícia rende vinte porções e utiliza 2 kg de um ingrediente já limpo. Para produzir cinquenta porções equivalentes, o fator é 50 dividido por 20, igual a 2,5. A estimativa passa a 5 kg limpos. Se o rendimento observado de limpeza desse ingrediente for 80%, a compra estimada para essa etapa será 5 dividido por 0,8, igual a 6,25 kg brutos. A hipótese precisa ficar explícita.',
        'O cálculo não informa sozinho a quantidade final depois da cocção nem resolve a capacidade dos equipamentos. A equipe confere a ficha aprovada e a organização do lote antes de produzir. Se o rendimento real divergir, registra o que foi pesado e em qual etapa, em vez de alterar números para coincidir com a expectativa. A comparação só faz sentido quando bruto, líquido e rendimento se referem à mesma operação.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Escolha uma receita fictícia simples e escreva rendimento, porção, ingredientes e sequência. Ajuste de dez para trinta porções e mostre o fator de multiplicação. Em outra simulação, 3 kg brutos resultam em 2,4 kg limpos: calcule o rendimento de limpeza e explique o significado. Não execute testes com faca ou equipamento sem formação prática e supervisão adequadas. Revise se o planejamento inclui conservação dos ingredientes e verifica capacidade, em vez de apenas multiplicar números.',
      ] },
    ],
  },
  {
    title: 'Cocção, manutenção quente e controle de tempo e temperatura',
    skills: ['acompanhar-tempo-temperatura-alimento'], sourceIds: ['anvisa-rdc216', 'anvisa-cartilha'],
    sections: [
      { title: 'Ensino: medir a condição do alimento e seguir o procedimento', paragraphs: [
        'A cocção precisa produzir o resultado culinário previsto e atender ao controle sanitário. Aparência dourada, fervura do líquido ou temperatura do equipamento não comprovam a temperatura em todas as partes do alimento. O instrumento adequado, seu uso higiênico e a posição de medição fazem parte do procedimento do serviço. O auxiliar acompanha o que lhe cabe e comunica desvios; não inventa uma nova combinação de tempo e temperatura para acelerar a produção.',
        'A RDC 216/2004 estabelece que o tratamento térmico deve garantir pelo menos 70 °C em todas as partes do alimento, admitindo temperaturas inferiores quando combinações de tempo e temperatura forem suficientes para assegurar a qualidade higiênico-sanitária. Essa possibilidade depende de critério validado, não de uma escolha pessoal. Para conservação a quente, a referência federal é temperatura superior a 60 °C por, no máximo, seis horas. Regras locais e procedimentos aplicáveis também precisam ser observados.',
        'O controle inclui horário, identificação da preparação, medida e responsável, além da ação diante de resultado fora do previsto. Reaquecer não apaga automaticamente o histórico de uma preparação mantida inadequadamente. Para resfriamento, armazenamento refrigerado ou congelado e reaquecimento, siga o fluxo validado específico do serviço; não deixe grandes volumes sobre a bancada até o dia seguinte. Nesta aula, o foco avaliativo é compreender a medida e reconhecer o desvio, sem improvisar decisões de liberação.',
      ] },
      { title: 'Caso resolvido: visor quente, alimento abaixo do limite previsto', paragraphs: [
        'Um balcão mostra 65 °C no visor, mas a medição prevista no alimento preparado indica 56 °C durante a conservação a quente. O auxiliar não usa o visor como substituto do resultado do alimento. Identifica e comunica o desvio, registra horário e medida e segue a decisão responsável do procedimento. A constatação não autoriza simplesmente modificar o número na planilha ou afirmar que a preparação está segura porque o equipamento está ligado.',
        'A equipe verifica o processo e a condição de uso do equipamento, sem confundir controle do ambiente com controle do alimento. O exemplo não oferece uma autorização universal de reaquecimento ou descarte: a ação depende da avaliação e do histórico exigidos pelo serviço. O papel do registro é permitir essa decisão com evidências, incluindo quanto tempo a situação pode ter durado, e apoiar a prevenção de recorrência.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe uma planilha fictícia de conservação a quente que distinga temperatura do equipamento e medida no alimento. Inclua uma leitura abaixo do limite estudado e descreva a comunicação ao responsável, sem criar uma regra de aproveitamento. Explique por que o mesmo alimento não deve permanecer indefinidamente no balcão. Revise se há identificação da preparação, data, horário, instrumento e ação prevista. Use apenas dados simulados; o exercício não exige manipular preparações destinadas a consumo.',
      ] },
    ],
  },
  {
    title: 'Distribuição protegida, higienização e fechamento da produção',
    skills: ['organizar-distribuicao-e-pop'], sourceIds: ['anvisa-rdc216', 'anvisa-cartilha'],
    sections: [
      { title: 'Ensino: a proteção continua depois da cocção', paragraphs: [
        'A preparação pronta pode ser contaminada durante porcionamento, transporte e distribuição. Proteja recipientes e utensílios, mantenha a identificação e as condições de conservação previstas e evite contato de mãos ou objetos inadequados com o alimento. A organização do serviço deve impedir que quem lida com dinheiro retorne diretamente à manipulação sem as medidas higiênicas necessárias. Uma etapa anterior bem executada não compensa uma falha na entrega.',
        'Limpeza remove sujidades; desinfecção reduz microrganismos por procedimento apropriado. Higienização reúne essas etapas quando aplicáveis. O produto saneante precisa ser adequado ao uso, e concentração, tempo de contato, enxágue quando indicado e armazenamento seguem rótulo e procedimento aprovado. Não misture produtos por conta própria e não adapte uma receita química retirada de outra atividade. Proteja os alimentos durante a operação e mantenha os produtos identificados e separados.',
        'O Manual de Boas Práticas descreve a organização do serviço, enquanto o Procedimento Operacional Padronizado detalha uma rotina específica. Um POP útil mostra sequência, recursos, frequência, responsáveis e verificações necessárias. Ele precisa corresponder à operação real. Assinar um checklist sem executar a tarefa cria um registro falso, não uma garantia. No fechamento, informe pendências, situação dos equipamentos e preparações conforme o fluxo, para que a próxima equipe não dependa de adivinhação.',
      ] },
      { title: 'Caso resolvido: bancada limpa, etapa de desinfecção esquecida', paragraphs: [
        'A equipe retirou restos e gordura de uma bancada, mas o procedimento aplicável também prevê uma etapa de desinfecção. A aparência limpa não permite marcar a higienização inteira como concluída. O auxiliar reconhece qual etapa falta, mantém a área fora do uso previsto até cumprir o fluxo e comunica a pendência. Não aumenta a concentração de um produto para compensar o atraso nem o mistura a outro.',
        'Ao final, o registro identifica a operação efetivamente realizada e a condição de liberação conforme o procedimento. A equipe revê se os materiais estavam disponíveis e se a sequência era compreendida. O caso distingue execução, verificação e registro. Um formulário pode apoiar o trabalho, mas não substitui produto adequado, tempo de contato e cuidados com o alimento durante a limpeza do ambiente.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Escreva o esqueleto de um POP fictício para uma superfície, sem inventar concentração química: indique que as instruções específicas vêm do produto autorizado e do procedimento validado. Inclua retirada de alimentos, limpeza, etapa seguinte aplicável, verificação e registro. Crie uma passagem de turno com uma pendência realista de equipamento e outra de identificação de preparação. Confira se o próximo trabalhador consegue distinguir concluído de aguardando ação e se os alimentos permanecem protegidos durante o serviço.',
      ] },
    ],
  },
];
const activities = [
  { module: 1, skill: 'prevenir-contaminacao-cozinha', prompt: 'Após preparar alimento cru, a mesma faca será usada em uma preparação pronta. Qual cuidado evita contaminação cruzada?', options: ['Apenas enxugar em pano.', 'Confiar na ausência de cheiro.', 'Separar a operação ou realizar a higienização adequada antes do novo uso.', 'Usar a faca rapidamente.'] },
  { module: 2, skill: 'conferir-ingredientes-cozinha', prompt: 'Uma unidade chega com embalagem violada. O auxiliar deve:', options: ['Misturar o conteúdo às unidades íntegras.', 'Identificar a divergência e seguir o fluxo de segregação e avaliação.', 'Aceitar porque a quantidade está correta.', 'Trocar a embalagem sem informar.'] },
  { module: 3, skill: 'calcular-preparo-rendimento', prompt: 'Uma receita rende 12 porções. Para 36 porções equivalentes, qual fator ajusta as quantidades dos ingredientes?', options: ['0,5', '2', '12', '3'] },
  { module: 4, skill: 'acompanhar-tempo-temperatura-alimento', prompt: 'O visor do balcão indica 66 °C, mas a medida prevista no alimento indica 55 °C na conservação a quente. Qual análise é adequada?', options: ['A medida no alimento revela desvio a registrar e comunicar pelo procedimento.', 'O visor sempre substitui a medição do alimento.', 'Basta escrever 66 °C na planilha.', 'O cheiro decide se a temperatura é aceitável.'] },
  { module: 5, skill: 'organizar-distribuicao-e-pop', prompt: 'A limpeza foi feita, mas falta uma etapa de desinfecção prevista. O registro deve:', options: ['Indicar higienização completa pela aparência.', 'Ser assinado antes da execução.', 'Manter a pendência até cumprir e verificar a etapa aplicável.', 'Compensar com mistura improvisada de produtos.'] },
];
const exam = [
  { module: 1, skill: 'prevenir-contaminacao-cozinha', prompt: 'Ausência de alteração de cheiro em um alimento significa:', options: ['Garantia de segurança.', 'Que não é possível concluir segurança apenas por esse sinal.', 'Que pode dispensar conservação.', 'Que pode substituir controle de tempo e temperatura.'] },
  { module: 1, skill: 'prevenir-contaminacao-cozinha', prompt: 'Luvas usadas durante a manipulação:', options: ['Eliminam a necessidade de higiene das mãos.', 'Podem tocar dinheiro e alimento pronto sem mudança de rotina.', 'Garantem segurança mesmo contaminadas.', 'Não substituem higiene das mãos e cuidados nas trocas de tarefa.'] },
  { module: 2, skill: 'conferir-ingredientes-cozinha', prompt: 'Qual conferência é pertinente ao recebimento?', options: ['Identificação, integridade, validade e condição de conservação aplicável.', 'Apenas a cor do veículo.', 'Somente o número de caixas.', 'A opinião de que o alimento parece fresco.'] },
  { module: 2, skill: 'conferir-ingredientes-cozinha', prompt: 'Após abrir um ingrediente, sua identificação e conservação devem:', options: ['Ser descartadas para liberar espaço.', 'Seguir um prazo único inventado para todos os alimentos.', 'Preservar informações necessárias e condições após abertura previstas para o produto e o serviço.', 'Depender exclusivamente da memória do manipulador.'] },
  { module: 3, skill: 'calcular-preparo-rendimento', prompt: 'Se 4 kg brutos fornecem 3,2 kg limpos, o rendimento de limpeza desse exemplo é:', options: ['20%.', '80%.', '125%.', '320%.'] },
  { module: 3, skill: 'calcular-preparo-rendimento', prompt: 'Ao multiplicar uma receita, além de ajustar ingredientes, é necessário:', options: ['Presumir que qualquer panela comporta a produção.', 'Multiplicar automaticamente o tempo de cocção pelo fator.', 'Ignorar conservação no pré-preparo.', 'Conferir capacidade, método e fluxo de produção apropriados.'] },
  { module: 4, skill: 'acompanhar-tempo-temperatura-alimento', prompt: 'A referência federal estudada para conservação a quente é:', options: ['Superior a 60 °C por, no máximo, seis horas, observados os requisitos aplicáveis.', 'Qualquer temperatura por tempo ilimitado.', 'Temperatura do visor sem conferir o alimento.', 'Apenas manter a panela fechada.'] },
  { module: 4, skill: 'acompanhar-tempo-temperatura-alimento', prompt: 'Uma combinação de cocção com temperatura inferior a 70 °C:', options: ['Pode ser escolhida livremente para agilizar.', 'Exige tempo e temperatura suficientes à qualidade higiênico-sanitária segundo critério validado.', 'Dispensa controle sanitário.', 'É comprovada apenas pela aparência dourada.'] },
  { module: 5, skill: 'organizar-distribuicao-e-pop', prompt: 'Um POP de higienização precisa corresponder:', options: ['A uma receita química encontrada em qualquer rede social.', 'Somente ao formulário de assinatura.', 'À rotina real, com sequência, recursos e verificações aplicáveis.', 'Ao desejo de terminar mais rápido.'] },
  { module: 5, skill: 'organizar-distribuicao-e-pop', prompt: 'Durante a distribuição, a preparação pronta:', options: ['Continua exigindo proteção e condições de conservação previstas.', 'Não pode mais ser contaminada.', 'Dispensa cuidado porque foi cozida.', 'Pode compartilhar qualquer utensílio sem higienização.'] },
];
export const courseRevision = defineCourse({
  courseId: 'aa66666e-df91-42d4-94f5-bb54497e602e', slug: 'auxiliar-de-cozinha', courseName: 'Auxiliar de Cozinha', hours: 100,
  audience: 'Estudantes de apoio à produção em serviços de alimentação, com aplicação prática supervisionada e procedimentos do serviço.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'anvisa-rdc216', title: 'Anvisa — RDC 216/2004, texto com alterações', url: 'https://anvisalegis.datalegis.net/action/ActionDatalegis.php?acao=abrirTextoAto&cod_menu=1696&cod_modulo=134&numeroAto=00000216&orgao=RDC%2FDC%2FANVISA%2FMS&pesquisa=true&seqAto=000&tipo=RDC&valorAno=2004' },
    { id: 'anvisa-cartilha', title: 'Anvisa — Cartilha de boas práticas para serviços de alimentação', url: 'https://www.gov.br/anvisa/pt-br/centraisdeconteudo/publicacoes/alimentos/manuais-guias-e-orientacoes/cartilha-boas-praticas-para-servicos-de-alimentacao.pdf/@@display-file/file' },
  ],
}, modules, activities, exam);
export default courseRevision;
