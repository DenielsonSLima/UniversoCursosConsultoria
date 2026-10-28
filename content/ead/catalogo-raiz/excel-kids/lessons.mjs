export const lessons = [
  {
    "id": "ead-excel-kids-20261027-v2-aula-1",
    "title": "Conhecer células, linhas e colunas",
    "hours": 16,
    "skills": [
      "Localizar uma célula pelo endereço e distinguir planilha de pasta de trabalho."
    ],
    "sourceIds": [
      "xk-inicio",
      "xk-acesso",
      "xk-salvar"
    ],
    "html": `<h2>Conhecer células, linhas e colunas</h2>
<p>O Excel organiza informações em uma grade. As colunas costumam ser identificadas por letras e as linhas por números. No encontro de uma coluna com uma linha fica uma célula. O endereço B3 indica coluna B e linha três. Nesta trilha, o projeto será um controle fictício de materiais e uma apresentação do resultado. Você pode praticar no ambiente disponibilizado pela escola ou por um responsável, sem usar dados pessoais de colegas nem publicar a planilha na internet.</p>
<p>Um arquivo do Excel é chamado de pasta de trabalho e pode reunir várias planilhas. A pasta de trabalho é o conjunto salvo; cada planilha é uma das grades dentro dele. Não confunda a aba de uma planilha com o nome do arquivo. Um projeto pode ter uma planilha chamada Materiais e outra chamada Resumo, ambas dentro do mesmo arquivo. Ao salvar ou reabrir, confira qual pasta de trabalho e qual planilha você está usando.</p>
<p>Clique em uma célula e observe o destaque da célula ativa e sua identificação na interface. O que você digitar será inserido ou poderá substituir o conteúdo dessa célula, conforme o modo de edição. Antes de começar, confira o endereço. Uma palavra digitada no lugar errado pode aparecer em uma coluna destinada a números. Localizar a célula faz parte do trabalho; não é preciso mover rapidamente pela grade para demonstrar que compreendeu sua organização.</p>
<p>Para montar uma tabela de estudo, use a primeira linha para explicar o que cada coluna representa. Por exemplo, A1 pode conter Material e B1 pode conter Quantidade. As linhas seguintes guardarão os materiais e seus números. Um cabeçalho informa o significado do campo; não deve ser contado como mais um material. Escolha nomes claros e mantenha os dados relacionados na mesma linha, para que outra pessoa consiga entender a tabela sem uma explicação secreta.</p>
<p>Caso resolvido: na planilha Materiais, Ana precisava registrar quatro caixas na célula B3. Primeiro localizou a coluna B e depois a linha três, conferindo o encontro entre as duas. Se escrevesse o número em C3, estaria em outra coluna. Ela também percebeu que mudar o nome da aba para Materiais não mudou automaticamente o nome do arquivo. Para reencontrar o projeto, registrou o local e o nome usados ao salvar a pasta de trabalho.</p>
<p>Prática guiada: crie uma planilha vazia e escreva Material em A1 e Quantidade em B1. Digite Lápis em A2 e o número 6 em B2. Depois escreva Borracha em A3 e 4 em B3. Diga o endereço de cada dado e confira se nome e quantidade estão na mesma linha. Acrescente outra planilha com o nome Observações, quando o ambiente permitir, e volte à primeira. A conferência é distinguir duas grades dentro de um mesmo arquivo.</p>
<p>Faça uma brincadeira de localização com um colega: um indica um endereço da pequena área usada e o outro explica coluna e linha antes de selecioná-lo. Utilize apenas o arquivo de treino. Se o acesso por mouse, teclado ou recurso assistivo exigir outra estratégia, combine uma forma adequada com o responsável. O endereço é uma referência que ajuda diferentes formas de navegação; ele não depende de todos enxergarem ou apontarem a mesma posição da mesma maneira.</p>
<p>Salve com um nome reconhecível, como materiais-treino-v1.xlsx, na pasta combinada. Reabra e confira que os dados continuam nas células esperadas. Não basta encontrar o ícone do Excel: é necessário abrir o trabalho certo. Ao terminar, explique com suas palavras a diferença entre célula, planilha e pasta de trabalho e mostre um exemplo de cada um no próprio projeto. Esses conceitos serão usados nos cálculos e no gráfico das próximas aulas.</p>`
  },
  {
    "id": "ead-excel-kids-20261027-v2-aula-2",
    "title": "Organizar dados sem misturar seus significados",
    "hours": 16,
    "skills": [
      "Registrar nomes e quantidades com cabeçalhos, unidades e relações preservadas."
    ],
    "sourceIds": [
      "xk-inicio",
      "xk-formulas",
      "xk-salvar"
    ],
    "html": `<h2>Organizar dados sem misturar seus significados</h2>
<p>Uma tabela precisa contar uma história compreensível sobre seus dados. Se uma coluna guarda nomes de materiais e outra guarda quantidades, não coloque uma observação longa no meio da coluna de números. Cada coluna tem um significado e cada linha reúne informações do mesmo item. O projeto desta aula usa somente materiais fictícios, para aprender a conferir registros sem precisar coletar dados reais sobre pessoas.</p>
<p>Observe a unidade de medida. Se uma linha representa caixas e outra representa unidades soltas, somar os números sem explicar a diferença pode produzir uma conclusão sem sentido. Para este exercício, todas as quantidades serão de unidades individuais. Quando uma tarefa real tiver embalagens, seria necessário conhecer a conversão ou separar as medidas. Uma coluna chamada Quantidade deve deixar claro o que está sendo contado, não apenas mostrar números.</p>
<p>A formatação pode tornar o título e os cabeçalhos reconhecíveis, mas não muda automaticamente o significado do que foi digitado. Uma célula colorida não comprova que o número está certo. Evite decorar todas as células de maneiras diferentes, pois isso pode esconder a organização da tabela. Destaque o que ajuda a leitura e use texto para explicar diferenças importantes, sem depender apenas de cores.</p>
<p>Confira valores e rótulos juntos. Se você mover só a coluna de materiais e deixar as quantidades paradas, pode associar seis unidades a outro item. Ao reorganizar a tabela, preserve cada linha como um conjunto. Para o primeiro teste, faça uma cópia e compare dois registros fáceis de reconhecer antes e depois. Se o nome mudou de lugar e sua quantidade não o acompanhou, a organização deixou de representar a informação inicial.</p>
<table><caption>Dados fictícios, todos em unidades individuais</caption><thead><tr><th>Material</th><th>Quantidade</th></tr></thead><tbody><tr><td>Lápis</td><td>6</td></tr><tr><td>Borracha</td><td>4</td></tr><tr><td>Caderno</td><td>5</td></tr></tbody></table>
<p>Caso resolvido: a turma registrou Lápis 6, Borracha 4 e Caderno 5. Um colega quis colocar os nomes em outra ordem, mas selecionou só os nomes. As quantidades ficaram nas linhas antigas. A revisão voltou à cópia inicial e reorganizou os registros completos. A tarefa não era apenas deixar a lista em ordem alfabética; era manter a relação entre cada material e a quantidade correspondente.</p>
<p>Prática orientada: reproduza a tabela e acrescente uma coluna chamada Observação, usando informações inventadas sobre os materiais. Confira a unidade de medida e peça que alguém localize quantos cadernos existem no exercício. Faça uma cópia antes de experimentar uma reorganização e compare os registros. A resposta será correta somente se o nome, a quantidade e a observação continuarem relacionados ao mesmo item.</p>
<p>Para revisar, leia primeiro os cabeçalhos e diga o que seria válido em cada coluna. Depois percorra as linhas e procure palavras na área de quantidades, números em campos que deveriam conter nomes e registros incompletos. Uma célula vazia pode indicar informação ausente; ela não deve ser interpretada automaticamente como zero. Se não houver uma quantidade confirmada no exercício, registre a pendência em vez de inventar um valor para completar a aparência da tabela.</p>
<p>Finalize escrevendo uma pequena orientação para quem abrir a planilha: o que cada coluna representa, qual unidade foi usada e quais dados foram inventados. Uma tabela bem organizada pode ser compreendida por outra pessoa sem que o autor esteja ao lado. Essa explicação também ajudará a escolher quais células devem entrar no cálculo de total e quais servem apenas para identificar ou descrever os materiais.</p>`
  },
  {
    "id": "ead-excel-kids-20261027-v2-aula-3",
    "title": "Calcular e testar mudanças nas quantidades",
    "hours": 16,
    "skills": [
      "Usar referências e uma soma de intervalo, conferindo o efeito de alterar uma entrada."
    ],
    "sourceIds": [
      "xk-formulas",
      "xk-inicio"
    ],
    "html": `<h2>Calcular e testar mudanças nas quantidades</h2>
<p>Uma planilha pode calcular a partir dos valores que você registrou. Uma fórmula começa normalmente com o sinal de igual e pode usar endereços de células. Se B2 tem 6 e B3 tem 4, =B2+B3 calcula dez. É diferente de escrever apenas 10: a fórmula depende das entradas. Se uma dessas quantidades mudar, o resultado deve acompanhar a alteração. Essa relação será o principal teste desta aula.</p>
<p>Para reunir mais células de uma mesma coluna, use um intervalo como B2:B4. Ele começa em B2 e termina em B4, incluindo as extremidades. Com 6, 4 e 5 nessas células, =SOMA(B2:B4) resulta em quinze. Os exemplos usam a função em português; o nome e os separadores podem variar conforme o idioma e a configuração. Se sua versão apresentar outro nome, peça ajuda para encontrar a função equivalente, sem trocar a regra do cálculo.</p>
<p>Coloque o total em uma célula que não seja parte dos valores que ele está somando. Uma fórmula que inclui a própria célula cria uma dependência circular, em vez da soma simples pretendida. Para o exercício, use A6 com o rótulo Total e B6 com =SOMA(B2:B4). Confira o endereço de início e de fim antes de aceitar uma seleção automática. O programa pode sugerir uma área, mas você precisa verificar se ela corresponde aos três materiais.</p>
<p>Faça também uma conta fora da planilha, no papel ou com uma estratégia que você conheça. A comparação serve para examinar a fórmula, não para escolher qual resultado parece mais bonito. Se o total não corresponder, confira entradas e intervalo. Um número errado em B3 e uma soma que esqueceu B4 são problemas diferentes. Corrigir o resultado digitando um valor por cima da fórmula pode esconder a causa e impedir futuras atualizações.</p>
<p>Caso resolvido: os valores 6, 4 e 5 somam quinze. A quantidade de lápis foi atualizada de seis para oito, então o esperado passou a 8 + 4 + 5 = dezessete. A célula com fórmula deve mostrar dezessete. Se continuar mostrando quinze, talvez o total tenha sido digitado manualmente ou a fórmula esteja ligada a outra célula. O teste de alteração permite conferir se a planilha está calculando a partir das entradas certas.</p>
<p>Prática guiada: use as quantidades da aula anterior e faça a soma em B6. Escreva o resultado esperado antes de confirmar a fórmula. Altere uma quantidade, calcule novamente fora da planilha e compare. Depois restaure o valor inicial. Registre as duas versões de entrada e saída. A conferência é conseguir explicar não apenas qual total apareceu, mas por que ele mudou quando uma das quantidades mudou.</p>
<p>Experimente acrescentar outro material na linha cinco, com quantidade 3 em B5. A fórmula =SOMA(B2:B4) ainda termina na linha quatro e não inclui essa nova entrada. Se o total deve considerar os quatro materiais, o intervalo precisa alcançar B5, mantendo a célula do total fora da área somada. Antes de ajustar, diga qual valor espera. Com 6, 4, 5 e 3, a soma dos quatro materiais é dezoito.</p>
<p>Para concluir, prepare um pequeno desafio com três quantidades diferentes e peça que alguém encontre o intervalo e o total. Não é necessário usar uma função mais complicada para mostrar aprendizagem. O importante é que a referência represente os dados pretendidos, o resultado possa ser conferido e a mudança de entrada produza a atualização esperada. Salve uma cópia do projeto antes de começar a representação gráfica.</p>`
  },
  {
    "id": "ead-excel-kids-20261027-v2-aula-4",
    "title": "Mostrar quantidades em um gráfico legível",
    "hours": 16,
    "skills": [
      "Escolher rótulos e uma comparação visual que possa ser conferida na tabela."
    ],
    "sourceIds": [
      "xk-grafico",
      "xk-inicio",
      "xk-formulas"
    ],
    "html": `<h2>Mostrar quantidades em um gráfico legível</h2>
<p>Um gráfico ajuda a comparar informações, mas precisa representar os dados certos. Na tabela de materiais, queremos observar a quantidade de cada item. Nome e quantidade cumprem papéis diferentes: os nomes identificam as categorias e os números representam as medidas. Não escolha células só porque estão coloridas. Confira quais registros farão parte do gráfico e se todos usam a mesma unidade de contagem.</p>
<p>Para comparar três materiais, um gráfico de colunas pode mostrar uma coluna para cada categoria. O tamanho de cada coluna deve corresponder ao valor da tabela. Os rótulos precisam permitir reconhecer material e unidade, e o título deve explicar o assunto. Uma figura sem identificação pode ser bonita e ainda assim não informar o que está sendo comparado. Use cores como apoio, mantendo texto suficiente para entender a mensagem.</p>
<p>No Excel disponível, selecione os rótulos e as quantidades e procure as opções de gráfico na guia Inserir. A organização dos comandos pode variar entre computador, navegador e celular. Depois de criar, confira se os materiais foram tratados como categorias e se os números correspondem a suas quantidades. Uma seleção incompleta pode deixar um item fora ou apresentar uma coluna sem o nome correto.</p>
<p>Não inclua o total geral como se fosse mais um material quando o objetivo é comparar apenas os itens. Na tabela do exercício, Lápis 6, Borracha 4 e Caderno 5 são as três categorias. O total quinze reúne as três e tem outra função. Se ele aparecer como quarta coluna, o leitor pode interpretar que há um material chamado Total em vez de perceber que se trata de uma soma. A escolha do intervalo evita essa confusão.</p>
<p>Caso resolvido: um gráfico mostrou três colunas com quantidades 6, 4 e 5. Lápis tinha a maior quantidade, Borracha a menor e a diferença entre Lápis e Borracha era de duas unidades. Esses dados não informam qual material é mais importante nem qual será usado primeiro. O gráfico permite comparar os números do exercício; outras conclusões exigiriam informações que a tabela não contém.</p>
<p>Prática orientada: crie o gráfico dos três materiais, com título e unidade identificados. Compare cada coluna à tabela e responda qual é maior, qual é menor e qual a diferença entre dois valores. Depois altere temporariamente uma quantidade e observe se o gráfico acompanha a mudança. Se não acompanhar, confira a origem dos dados antes de concluir que a nova quantidade foi incorporada ao resultado visual.</p>
<p>Peça que um colega explique o gráfico sem ouvir sua apresentação. Ele consegue dizer o que está sendo contado e quais são as categorias? Se precisar adivinhar o significado de uma cor ou de um número, melhore os rótulos. A representação deve ajudar a leitura, inclusive para quem utiliza outra forma de acessar a informação. Mantenha a tabela disponível como referência textual dos valores, em vez de deixar tudo dependente da imagem.</p>
<p>Finalize escrevendo duas conclusões: uma que o gráfico sustenta e outra que ele não permite afirmar. Por exemplo, é possível comparar quantidades, mas não descobrir o motivo de uma quantidade ser maior sem outras informações. Essa diferença entre observar e explicar será importante no projeto final. Salve a versão revisada e registre qual intervalo foi utilizado para que você consiga conferir a representação novamente.</p>`
  },
  {
    "id": "ead-excel-kids-20261027-v2-aula-5",
    "title": "Revisar, salvar e apresentar um projeto",
    "hours": 16,
    "skills": [
      "Conferir tabela, fórmula e gráfico e guardar uma versão que possa ser retomada."
    ],
    "sourceIds": [
      "xk-salvar",
      "xk-inicio",
      "xk-formulas",
      "xk-grafico"
    ],
    "html": `<h2>Revisar, salvar e apresentar um projeto</h2>
<p>O projeto final reunirá uma tabela fictícia, uma fórmula de total e um gráfico de comparação. Antes de começar, escolha uma pergunta simples, como quantas unidades de cada material existem no conjunto inventado. A pergunta orienta os campos e a medida. Não é necessário coletar informações de colegas, usar nomes completos ou registrar dados de saúde ou família para aprender planilhas. Trabalhe com os exemplos e criações fictícias desta trilha.</p>
<p>Planeje uma tabela com cabeçalhos claros e quatro materiais. Use uma unidade comum, registre quantidades e coloque o total fora do intervalo somado. Escreva a fórmula com os endereços que correspondem à sua tabela. Em seguida, escolha somente as categorias e quantidades necessárias ao gráfico. Um projeto coerente permite acompanhar a relação entre entrada, cálculo e representação, sem depender de números digitados manualmente em cada parte.</p>
<p>Faça uma lista de conferência: os nomes e as quantidades estão na mesma linha? A unidade está explicada? O intervalo da soma inclui os quatro materiais? O gráfico apresenta os valores correspondentes e não trata o total como outra categoria? Uma resposta positiva precisa ser demonstrada no arquivo. Se você encontrou o resultado por acaso, repita o teste com outra quantidade para verificar a relação entre as partes.</p>
<p>Salvar guarda a pasta de trabalho para uso posterior. Na primeira gravação, confira nome e local; para preservar uma versão anterior e experimentar mudanças, crie uma cópia com outro nome pela função disponível. Alguns ambientes usam salvamento automático na nuvem, outros exigem gravação manual. Confirme o estado de salvamento e o arquivo em uso antes de fechar. O nome da aba da planilha não substitui identificar o nome da pasta de trabalho salva.</p>
<p>Caso resolvido: um projeto tinha quatro materiais com quantidades 5, 7, 2 e 6, somando vinte. Ao mudar a terceira quantidade para quatro, o esperado passou a vinte e dois. A fórmula mudou, mas o gráfico continuou usando uma área antiga que não representava os quatro itens corretamente. A revisão conferiu a seleção do gráfico e o total separadamente. Corrigir só a aparência do título não faria a representação usar a base certa.</p>
<p>Prática guiada: monte seu próprio conjunto de quatro materiais fictícios. Calcule o total fora da planilha e compare com a fórmula. Altere uma quantidade, preveja o novo total e confira o gráfico. Depois salve uma nova versão e reabra o arquivo. Peça a outra pessoa que encontre uma quantidade, explique a soma e leia uma comparação no gráfico usando somente os rótulos e as orientações que você escreveu.</p>
<p>Antes de compartilhar, confira quem deve receber o arquivo e use o canal combinado com o professor ou responsável. Não torne o documento público apenas porque há uma opção de compartilhamento fácil. O exercício não depende de criar uma conta nova nem de enviar dados reais. Se você não conseguir usar um recurso na sua versão, registre a limitação e demonstre a parte do raciocínio com a tabela e a conferência manual, buscando orientação para a ferramenta disponível.</p>
<p>Apresente seu projeto explicando uma decisão e uma correção concreta. Mostre por que escolheu o intervalo, como conferiu o total e qual teste fez para observar uma atualização. A prova objetiva avalia escolhas e resultados estudados, enquanto a prática permite demonstrar a construção da planilha. O aprendizado é conseguir localizar, organizar, calcular e conferir informações, e não apenas preencher muitas células ou produzir um gráfico com vários efeitos visuais.</p>`
  }
];
