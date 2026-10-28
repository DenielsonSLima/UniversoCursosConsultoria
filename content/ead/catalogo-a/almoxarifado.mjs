import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Recebimento, conferência e decisão de entrada',
    skills: ['conferir-recebimento-material'], sourceIds: ['mg-almox', 'cldf-materiais'],
    sections: [
      { title: 'Ensino: receber fisicamente não é aceitar sem conferência', paragraphs: [
        'O recebimento começa pela identificação da entrega e dos documentos que a acompanham. Compare o material com a solicitação e as condições definidas: descrição, quantidade, unidade de fornecimento, integridade e informações de lote ou validade quando aplicáveis. Um volume fechado não comprova que seu conteúdo está correto. A conferência precisa respeitar as responsabilidades do processo, inclusive quando a avaliação técnica pertence a outro setor.',
        'Diferencie quantidade de embalagens e quantidade de unidades. Se a compra prevê caixas com dez peças, uma entrega de cinco caixas representa cinquenta peças apenas se a embalagem estiver correta e a unidade de controle for peça. Registrar cinco como se fossem cinquenta, ou lançar caixas como peças sem conversão, distorce o saldo. O cadastro deve deixar clara a unidade utilizada e as conversões autorizadas.',
        'Divergência ou avaria precisa ser registrada e encaminhada. O material pendente de avaliação não deve ser misturado ao estoque disponível como se estivesse aceito. Conforme o procedimento institucional, identifique a situação, mantenha segregação adequada e aguarde a regularização. Assinar sem conferir para “resolver depois” pode dificultar a comprovação do que realmente chegou. A entrada no controle deve corresponder ao material aceito pelo fluxo responsável.',
      ] },
      { title: 'Caso resolvido: embalagens com quantidade diferente', paragraphs: [
        'Uma solicitação fictícia prevê seis caixas com doze unidades de um item. Na conferência, cinco caixas contêm doze unidades, e uma contém oito. O total físico é 5 × 12 + 8 = 68 unidades, não 72. A equipe registra a diferença de quatro e segue o procedimento para tratar a pendência. Não lança a quantidade solicitada apenas para fazer os documentos coincidirem. Se houver necessidade de aceitação parcial, essa decisão cabe ao fluxo autorizado.',
        'Depois da regularização, o registro mostra o que entrou, a unidade de controle e o documento de referência. A ocorrência permite verificar se a falha estava na entrega, na embalagem ou na informação usada no pedido. O aprendizado é separar expectativa de evidência: o pedido informa o que deveria chegar; a conferência comprova o que foi observado. A diferença não deve desaparecer por alteração sem histórico.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie uma ficha fictícia de recebimento com descrição, unidade, quantidade prevista, quantidade conferida e situação. Inclua um caso de embalagem íntegra, outro com avaria e um terceiro com unidade de fornecimento diferente. Escreva o encaminhamento de cada um e indique qual informação exige avaliação de outro responsável. Confira se o saldo disponível só recebe o que foi aceito e se uma pessoa consegue reconstruir a divergência a partir do registro. Não use documentos reais de fornecedor na atividade.',
      ] },
    ],
  },
  {
    title: 'Endereçamento, lotes, validade e separação',
    skills: ['organizar-armazenagem-rastreavel'], sourceIds: ['mg-almox', 'cldf-materiais'],
    sections: [
      { title: 'Ensino: encontrar e preservar o material certo', paragraphs: [
        'Armazenar não é apenas ocupar o espaço livre. O local precisa permitir identificação, conservação e acesso compatíveis com o material. O endereçamento relaciona a posição física ao cadastro: corredor, estante e nível, por exemplo. O código deve ser legível e usado de modo consistente. Uma mudança de localização sem atualização do controle pode fazer um item existente parecer indisponível durante a separação.',
        'Lote e validade permitem acompanhar grupos de materiais e sua condição de uso. PEPS, ou FIFO, prioriza o que entrou primeiro; PVPS, também conhecido por FEFO, prioriza o que vence primeiro. A escolha depende da natureza do material e das regras do processo. Para itens com prazo de validade, a ordem de entrada não garante a ordem de vencimento. Identifique também materiais bloqueados, devolvidos ou em avaliação para que não sejam separados como disponíveis.',
        'Condições de armazenamento, empilhamento e movimentação devem seguir as orientações aplicáveis e a capacidade dos equipamentos. Não invente um limite de carga nem opere um equipamento apenas por conhecer a teoria. Mantenha passagens e acessos necessários livres, observe a integridade das embalagens e comunique condições inadequadas. A separação confere item, quantidade, unidade, lote quando exigido e destino autorizado antes da entrega.',
      ] },
      { title: 'Caso resolvido: o lote novo vence antes', paragraphs: [
        'Dois lotes de um material estão disponíveis. O lote que chegou na semana passada vence depois do lote recebido hoje. Se o procedimento para esse material exige priorizar a validade, o lote recebido hoje deve ser separado primeiro, desde que esteja aceito e em condições de uso. Aplicar automaticamente a ordem de chegada ignoraria o vencimento e poderia aumentar perdas. A regra precisa estar visível e ser compreendida por quem separa.',
        'Ao reorganizar a posição dos lotes, a equipe atualiza a localização e mantém a identificação. O sistema não deve mostrar apenas um saldo total que impeça reconhecer materiais com condições diferentes. Se uma embalagem estiver danificada, a equipe comunica e aplica o bloqueio previsto, sem oferecer o item por ele vencer primeiro. Priorizar validade nunca substitui a verificação de integridade e autorização para uso.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe um endereçamento simples para três estantes e crie quatro lotes fictícios, com datas de entrada e validade distintas. Faça uma lista de separação e explique quando a ordem por validade difere da ordem de entrada. Inclua um lote bloqueado e verifique se ele foi excluído da disponibilidade. Revise se o registro permite localizar o item sem depender da memória de um colega. Acrescente uma situação de embalagem danificada e descreva o encaminhamento, sem inventar uma liberação técnica.',
      ] },
    ],
  },
  {
    title: 'Movimentações, saldo e documentos de rastreabilidade',
    skills: ['calcular-saldo-e-rastrear-movimento'], sourceIds: ['cldf-materiais', 'mg-almox'],
    sections: [
      { title: 'Ensino: cada alteração de saldo precisa ter uma origem', paragraphs: [
        'O saldo de um item é afetado por entradas e saídas registradas. Em um período simples, saldo final = saldo inicial + entradas − saídas. Devoluções, transferências e ajustes precisam ser identificados pela natureza da operação, não misturados como se fossem o mesmo movimento. Uma quantidade no sistema só é confiável quando os registros representam os acontecimentos físicos e seguem a unidade de controle.',
        'A saída deve se relacionar a uma requisição ou autorização, com item, quantidade, unidade e destino. A conferência na entrega permite verificar se o material separado é o solicitado. Transferências entre locais precisam preservar a relação entre origem e destino; registrar saída de um lado sem acompanhar a entrada do outro cria uma pendência. O documento ou identificação do movimento permite reconstruir o percurso depois.',
        'Uma devolução não deve ser automaticamente somada ao estoque utilizável. É necessário verificar identidade, quantidade e condição conforme o procedimento. Um ajuste de inventário também não deve ser usado para esconder uma movimentação que deixou de ser registrada. A equipe investiga a origem da diferença e aplica a correção autorizada com histórico. Apagar lançamentos ou alterar datas apenas para fazer o saldo coincidir destrói a rastreabilidade.',
      ] },
      { title: 'Caso resolvido: saldo com entrada, saída e devolução', paragraphs: [
        'Um item tinha 45 unidades disponíveis. Entraram 30 unidades aceitas, saíram 28 por requisição e retornaram 3 unidades que foram conferidas e aceitas como devolução utilizável. O saldo passa a 45 + 30 − 28 + 3 = 50 unidades. A devolução fica identificada como tal. Se as três unidades ainda estivessem em avaliação, não poderiam ser consideradas disponíveis apenas porque chegaram fisicamente ao local.',
        'Ao fechar o período, a equipe encontra uma saída que foi entregue, mas ainda não registrada. A solução é tratar a pendência com o documento e a autorização correspondentes, preservando a informação do que ocorreu. Criar uma “perda” genérica para acertar o número esconderia a causa. A conferência entre documentos e movimentos serve para melhorar o processo, além de obter um total final.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte uma ficha fictícia com saldo inicial e cinco movimentos: entrada aceita, requisição, devolução em avaliação, transferência e devolução aceita. Calcule o saldo disponível sem somar o que continua bloqueado. Para cada movimento, indique qual documento ou confirmação permite rastreá-lo. Confira se a unidade permanece igual durante o cálculo. Depois explique como investigaria uma saída física sem lançamento, distinguindo regularização documental de um ajuste genérico sem origem.',
      ] },
    ],
  },
  {
    title: 'Consumo, classificação ABC e planejamento de reposição',
    skills: ['interpretar-consumo-e-reposicao'], sourceIds: ['mg-almox', 'es-curva-abc'],
    sections: [
      { title: 'Ensino: analisar valor e necessidade sem confundir critérios', paragraphs: [
        'A classificação ABC ajuda a priorizar atenção conforme a importância de um critério escolhido, frequentemente o valor de consumo no período. Calcule quantidade consumida × valor unitário, ordene os itens por esse resultado e analise sua participação no total. Um item de baixo preço pode representar valor relevante se for usado em grande quantidade. A classe não é uma qualidade permanente do produto: depende do período, dos dados e dos limites definidos pela organização.',
        'Valor de consumo e criticidade são critérios diferentes. Um item barato pode ser indispensável para manter uma atividade. Por isso, a classificação financeira não elimina a análise de risco de falta, substituição possível e prazo de fornecimento. Não existe um corte percentual que precise ser copiado sem observar o contexto. O relatório deve indicar o critério e apoiar uma decisão, não substituir a avaliação responsável.',
        'Para um modelo simples de reposição, considere consumo médio no período compatível com o prazo de entrega e um estoque de segurança definido pelo processo. Se o consumo é medido por dia, o prazo também precisa ser convertido em dias. O ponto de reposição pode ser calculado como consumo durante o prazo de entrega + segurança. O modelo pressupõe condições que precisam ser acompanhadas: variações no consumo ou atrasos alteram sua utilidade.',
      ] },
      { title: 'Caso resolvido: comparar valores e prever ressuprimento', paragraphs: [
        'Dois materiais tiveram consumo mensal fictício: o item A foi usado 80 vezes e custa R$ 4 por unidade; o B foi usado 15 vezes e custa R$ 18. O valor de consumo de A é R$ 320 e o de B é R$ 270. Olhar somente o preço unitário colocaria B em primeiro, mas pelo critério de valor consumido A vem antes. Ainda é preciso verificar se algum deles tem criticidade especial.',
        'Para outro item, o consumo estável é de 6 unidades por dia, o prazo de entrega é de 5 dias e a segurança definida é de 8 unidades. O modelo simples indica 6 × 5 + 8 = 38 unidades como ponto de reposição. Se o prazo aumentar, o cálculo precisa ser revisto. O caso mostra por que registrar apenas um número sem suas hipóteses pode induzir decisão inadequada.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie três itens com consumos e preços fictícios, calcule o valor consumido e ordene os resultados. Escolha um item barato que seja crítico e explique por que ele merece atenção mesmo sem liderar o valor financeiro. Depois monte um exemplo de ponto de reposição com consumo diário e prazo em dias; altere o prazo e compare o resultado. Confira se o cálculo usa unidades compatíveis e se as condições do modelo foram registradas, evitando tratar a estimativa como uma garantia de que não haverá falta.',
      ] },
    ],
  },
  {
    title: 'Inventário, divergências e melhoria do controle',
    skills: ['investigar-divergencia-inventario'], sourceIds: ['cldf-materiais', 'mg-almox'],
    sections: [
      { title: 'Ensino: contar, comparar e investigar', paragraphs: [
        'O inventário compara a situação física com o controle registrado em um momento definido. A preparação identifica itens, locais, unidade de contagem, responsáveis e tratamento das movimentações durante a conferência. Se entradas e saídas continuam sem controle do momento de corte, uma diferença pode resultar apenas de contagens feitas em momentos diferentes. A organização precisa garantir condições para que a comparação tenha sentido.',
        'Na contagem, identifique o material e a unidade, registre o observado e siga o procedimento de recontagem de divergências. Não altere o físico para reproduzir o número esperado. Também não conclua a causa de uma falta antes de conferir localização, conversão de unidade, documentos e movimentos pendentes. Itens semelhantes, embalagens com quantidades diferentes e saldos distribuídos em locais distintos são fontes frequentes de erro operacional.',
        'A correção do saldo exige autorização e histórico conforme a responsabilidade definida. Depois de tratar a diferença, investigue o processo que a produziu: cadastro inconsistente, saída sem documento, transferência incompleta ou falha na conferência. Um indicador de acuracidade precisa declarar sua fórmula. Proporção de itens sem diferença e quantidade de unidades divergentes não medem exatamente a mesma coisa, e sua interpretação deve ser explícita.',
      ] },
      { title: 'Caso resolvido: diferença por unidade de embalagem', paragraphs: [
        'O sistema mostra vinte unidades de um item, enquanto a equipe encontra duas caixas fechadas com dez unidades cada. Aparentemente existem “duas” contra “vinte”, mas a conferência da unidade mostra que as quantidades podem ser compatíveis. Antes de corrigir o saldo, a equipe verifica o conteúdo e a unidade de controle. Alterar vinte para dois sem essa análise criaria uma divergência que não existia.',
        'Em outro item, a recontagem confirma falta de quatro unidades. A equipe procura movimentos e documentos pendentes e identifica uma entrega não lançada. A regularização segue o fluxo autorizado e mantém a referência ao acontecimento. A melhoria inclui conferir a saída no momento da entrega e acompanhar pendências no fechamento. O inventário torna-se uma ferramenta de prevenção quando a causa é tratada, e não apenas um dia de ajustar números.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Prepare um inventário fictício de cinco itens com localização, unidade, saldo registrado e contagem. Inclua uma diferença de embalagem, uma transferência pendente e uma falta sem causa confirmada. Escreva a sequência de conferências antes de propor ajuste. Depois defina um indicador de itens sem divergência e explique exatamente seu denominador. Confira se sua conclusão separa fato de hipótese e se a melhoria proposta atua sobre a causa identificada em vez de apenas exigir mais atenção de todos.',
      ] },
    ],
  },
];

const activities = [
  { module: 1, skill: 'conferir-recebimento-material', prompt: 'Uma entrega prevê quatro caixas com vinte peças, mas uma caixa tem quinze e as outras estão completas. Quantas peças foram fisicamente conferidas?', options: ['80 peças', '75 peças', '65 peças', '35 peças'] },
  { module: 2, skill: 'organizar-armazenagem-rastreavel', prompt: 'Um lote recebido hoje vence antes de outro recebido na semana passada. Se o procedimento prioriza validade e ambos estão aceitos, qual deve ser separado primeiro?', options: ['O lote com vencimento mais próximo.', 'Sempre o que entrou primeiro, sem considerar validade.', 'Qualquer um, porque a validade não interfere.', 'O lote bloqueado para avaliação.'] },
  { module: 3, skill: 'calcular-saldo-e-rastrear-movimento', prompt: 'O saldo inicial é 60 unidades. Entraram 25 aceitas e saíram 32 por requisição. Qual é o saldo após esses movimentos?', options: ['117 unidades', '35 unidades', '53 unidades', '85 unidades'] },
  { module: 4, skill: 'interpretar-consumo-e-reposicao', prompt: 'Um item tem consumo estável de 4 unidades por dia, entrega em 6 dias e segurança definida de 10. Pelo modelo simples estudado, qual é o ponto de reposição?', options: ['20 unidades', '24 unidades', '40 unidades', '34 unidades'] },
  { module: 5, skill: 'investigar-divergencia-inventario', prompt: 'A contagem encontra três caixas com oito unidades e o sistema controla peças. Qual verificação deve anteceder qualquer ajuste?', options: ['Comparar três caixas diretamente com qualquer saldo.', 'Conferir a conversão para vinte e quatro peças e os dados de controle.', 'Alterar o saldo para três por serem três embalagens.', 'Apagar o cadastro para refazê-lo.'] },
];

const exam = [
  { module: 1, skill: 'conferir-recebimento-material', prompt: 'Receber volumes fisicamente significa necessariamente que todos os itens estão aceitos?', options: ['Sim, pois a embalagem basta como prova.', 'Sim, desde que o fornecedor seja conhecido.', 'Não; a aceitação depende da conferência e das responsabilidades do processo.', 'Não; por isso nenhuma entrega pode ser registrada.'] },
  { module: 1, skill: 'conferir-recebimento-material', prompt: 'Uma entrega tem quantidade divergente do pedido. Qual ação preserva a evidência do recebimento?', options: ['Registrar o observado e encaminhar a pendência pelo procedimento.', 'Lançar a quantidade pedida para coincidir com o documento.', 'Misturar tudo ao disponível antes de avaliar.', 'Apagar a divergência após assinar.'] },
  { module: 2, skill: 'organizar-armazenagem-rastreavel', prompt: 'Qual situação demonstra uso consistente de endereçamento?', options: ['Mover itens sem avisar porque o estoque total não muda.', 'Guardar apenas pela memória do funcionário.', 'Usar o mesmo código para posições diferentes sem identificação.', 'Atualizar o controle quando a localização física do item muda.'] },
  { module: 2, skill: 'organizar-armazenagem-rastreavel', prompt: 'Qual é a diferença entre priorizar PEPS e PVPS?', options: ['Os dois sempre escolhem o último lote recebido.', 'PEPS considera a entrada; PVPS considera o vencimento.', 'PVPS ignora a validade.', 'PEPS elimina a necessidade de conferir integridade.'] },
  { module: 3, skill: 'calcular-saldo-e-rastrear-movimento', prompt: 'Um item começa com 90 unidades, recebe 35 aceitas e tem saída de 48. Qual é o saldo final?', options: ['173 unidades', '42 unidades', '77 unidades', '125 unidades'] },
  { module: 3, skill: 'calcular-saldo-e-rastrear-movimento', prompt: 'Uma devolução chegou e ainda aguarda avaliação de condição. Como tratá-la no controle de disponibilidade?', options: ['Não presumir que está utilizável antes da conferência e aceitação.', 'Somar automaticamente ao saldo disponível.', 'Registrar como compra nova para simplificar.', 'Descartar sem seguir o procedimento.'] },
  { module: 4, skill: 'interpretar-consumo-e-reposicao', prompt: 'O item X teve consumo de 50 unidades a R$ 6; o Y teve 20 a R$ 12. Pelo valor de consumo no período, qual vem primeiro?', options: ['Y, porque o preço unitário é maior.', 'São necessariamente da mesma classe sem calcular.', 'O que ocupar mais espaço físico.', 'X, pois representa R$ 300 contra R$ 240.'] },
  { module: 4, skill: 'interpretar-consumo-e-reposicao', prompt: 'Consumo estável de 3 unidades por dia, entrega em 7 dias e segurança de 5 indicam qual ponto de reposição no modelo estudado?', options: ['15 unidades', '26 unidades', '21 unidades', '35 unidades'] },
  { module: 5, skill: 'investigar-divergencia-inventario', prompt: 'Antes de concluir a causa de uma divergência confirmada, a equipe deve:', options: ['Conferir unidade, localização, documentos e movimentos pendentes.', 'Atribuir imediatamente culpa ao último turno.', 'Alterar os registros para eliminar a diferença.', 'Considerar toda falta como perda sem investigação.'] },
  { module: 5, skill: 'investigar-divergencia-inventario', prompt: 'Por que um indicador de acuracidade precisa informar sua fórmula?', options: ['Para dispensar a contagem física.', 'Porque toda fórmula produz a mesma interpretação.', 'Porque itens sem diferença e unidades divergentes representam medidas diferentes.', 'Para impedir comparação com registros do próprio período.'] },
];

export const courseRevision = defineCourse({
  courseId: 'd30cb464-d2ab-4c92-9f58-cce6c5c6644d', slug: 'almoxarifado',
  courseName: 'Almoxarifado', hours: 100,
  audience: 'Interessados em recebimento, armazenagem, movimentação, reposição e inventário de materiais.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'mg-almox', title: 'Governo de Minas Gerais — Manual de Gestão de Almoxarifados', url: 'https://www.mg.gov.br/planejamento/documento/manual-gestao-de-almoxarifados' },
    { id: 'cldf-materiais', title: 'CLDF — Manual de gestão de material de consumo, rotinas e procedimentos', url: 'https://biblioteca.cl.df.gov.br/dspace/bitstream/123456789/708/1/Manual%20de%20gest%C3%A3o%20de%20material%20de%20consumo%20CLDF%20-%20rotinas%20e%20procedimentos%202022.pdf' },
    { id: 'es-curva-abc', title: 'Governo do Espírito Santo — Manual de relatório de Curva ABC', url: 'https://portalsiades.es.gov.br/Media/Siades/Aprendizado/Manuais/Almoxarifado/Manual%20Almoxarifado%20ES%20-%20Relat%C3%B3rio%20Curva%20ABC.pdf' },
  ],
}, modules, activities, exam);

export default courseRevision;
