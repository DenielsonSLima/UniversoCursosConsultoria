export const lessons = [
  {
    "id": "ead-excel-basico-avancado-20261027-v2-aula-1",
    "title": "Estruturar dados e escrever fórmulas conferíveis",
    "hours": 20,
    "skills": [
      "Identificar células e intervalos e calcular valores a partir de dados organizados."
    ],
    "sourceIds": [
      "xl-formulas",
      "xl-ref"
    ],
    "html": `<h2>Estruturar dados e escrever fórmulas conferíveis</h2>
<p>Uma pasta de trabalho pode reunir várias planilhas. Em cada planilha, colunas e linhas formam células, identificadas por endereços como B2. Para construir um controle confiável, separe o significado dos dados de sua aparência. Uma coluna de quantidade, uma coluna de preço e uma de total têm funções diferentes. Neste curso, o projeto será uma planilha de movimentação fictícia de materiais, com exemplos próprios e conferência manual dos resultados.</p>
<p>Organize uma linha de cabeçalhos e use cada linha seguinte para um registro. Evite colocar subtotal no meio da base que será analisada como se fosse outra operação. Defina unidade, período e significado dos campos antes de somar. A largura da coluna e o formato de moeda ajudam a leitura, mas não substituem conferir se o conteúdo é um número utilizável ou um texto. Números importados como texto podem exigir tratamento antes dos cálculos.</p>
<p>Uma fórmula normalmente começa com o sinal de igual. Se B2 contém quantidade e C2 contém preço unitário, =B2*C2 calcula o total da linha. Referências tornam o cálculo dependente das entradas: ao alterar uma quantidade, o resultado deve acompanhar a mudança. Escrever manualmente o total pode romper essa relação. Os exemplos usam nomes de funções em português e ponto e vírgula entre argumentos; idioma, separadores e disponibilidade devem ser conferidos na versão utilizada.</p>
<p>Para somar um intervalo, use uma função como =SOMA(D2:D4), depois confira quais células estão incluídas. O endereço D2:D4 representa as três células da coluna D entre as linhas dois e quatro, incluindo as extremidades. Somar uma coluna inteira sem observar o contexto pode incluir um total já calculado ou registros que não pertencem ao período. A escolha do intervalo faz parte do raciocínio, e não é um detalhe que o programa sempre decide corretamente.</p>
<table><caption>Dados fictícios para reproduzir a partir de A1</caption><thead><tr><th>Material</th><th>Quantidade</th><th>Preço unitário</th><th>Total</th></tr></thead><tbody><tr><td>Papel</td><td>4</td><td>5</td><td>20</td></tr><tr><td>Caneta</td><td>3</td><td>2</td><td>6</td></tr><tr><td>Pasta</td><td>2</td><td>7</td><td>14</td></tr></tbody></table>
<p>Caso resolvido: a primeira linha de dados tem quatro unidades a R$ 5, totalizando R$ 20. As demais totalizam R$ 6 e R$ 14. A soma dos três totais é R$ 40. Ao aumentar a quantidade de papel de quatro para cinco, o primeiro total passa a R$ 25 e o total geral a R$ 45. Se a planilha continuar mostrando R$ 40, confira se a célula de total contém fórmula ou um valor digitado e se o intervalo de soma alcança as três linhas.</p>
<p>Prática orientada: reproduza a tabela e escreva as fórmulas na coluna D. Copie a fórmula de D2 para as linhas seguintes, confira os endereços e faça as contas manualmente. Depois altere um preço e registre o resultado esperado antes de observar a planilha. Inclua uma quarta operação e veja se o total passou a considerá-la. Esse teste mostra a diferença entre uma planilha que parece correta com poucos dados e uma que continua coerente quando a base cresce.</p>
<p>Salve a pasta com um nome que identifique o exercício e mantenha uma cópia anterior às experiências. Registre a unidade monetária e o período, sem inserir informações reais de clientes ou fornecedores. A conferência desta aula é conseguir explicar de onde vem cada total e demonstrar que uma alteração de entrada muda o resultado esperado. Uma fórmula que retorna um número não está automaticamente correta: ela precisa representar a regra pretendida.</p>`
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-aula-2",
    "title": "Controlar referências e usar funções com critérios",
    "hours": 20,
    "skills": [
      "Aplicar referências, testes e funções de tratamento a situações explicitamente definidas."
    ],
    "sourceIds": [
      "xl-ref",
      "xl-se",
      "xl-contar",
      "xl-texto",
      "xl-somase",
      "xl-ano"
    ],
    "html": `<h2>Controlar referências e usar funções com critérios</h2>
<p>Ao copiar uma fórmula, as referências relativas se ajustam à nova posição. Se =B2*C2 está em D2 e é copiada uma linha abaixo para D3, passa a usar =B3*C3. Isso é útil para repetir o mesmo cálculo em vários registros. Uma referência absoluta fixa coluna e linha com cifrões, como $G$1. Referências mistas fixam apenas uma das dimensões. Escolha conforme o que deve variar; não fixe todos os endereços por receio de que uma fórmula mude.</p>
<p>Imagine uma taxa de desconto do exercício guardada em G1 como 10%. Para calcular o valor após desconto sobre D2, use =D2*(1-$G$1). Ao copiar para a linha seguinte, D2 deve acompanhar a linha e $G$1 deve continuar apontando para a taxa. Para um valor de R$ 200, o resultado é R$ 180; para R$ 50, é R$ 45. A taxa é fictícia e serve apenas ao treino de referências, sem representar política comercial ou cálculo tributário.</p>
<p>A função SE testa uma condição e escolhe resultados. Em =SE(D2>=100;"Meta";"Rever"), um valor de exatamente cem atende à condição maior ou igual e retorna Meta. Um valor de noventa retorna Rever. Defina os limites antes de escrever a fórmula e teste um caso abaixo, um no limite e um acima. Uma regra verbal como “a partir de cem” não corresponde a usar somente maior que cem. Textos devolvidos pela função devem aparecer entre aspas.</p>
<p>Funções com critérios permitem examinar grupos. Se A2:A5 contém Papel, Caneta, Papel e Pasta, =CONT.SE(A2:A5;"Papel") conta duas ocorrências. Para somar os valores correspondentes de outra coluna, uma função como =SOMASE(A2:A5;"Papel";D2:D5) relaciona o intervalo de critério aos valores das mesmas linhas. Com valores 20, 6, 5 e 14 nessa ordem, a soma do grupo Papel é 25. Contar registros e somar valores são operações diferentes.</p>
<p>No tratamento de texto, =ARRUMAR(A2) pode retirar espaços comuns no início e no fim e reduzir espaços comuns repetidos entre palavras. Nem todo caractere de espaço é tratado do mesmo modo; a documentação distingue o espaço comum do espaço incondicional usado em algumas páginas. Para datas, confirme se a célula contém uma data reconhecida, e não uma descrição textual. Por exemplo, se B2 contém uma data reconhecida de 2026, =ANO(B2) retorna 2026. A aparência visual sozinha não comprova o tipo do dado.</p>
<p>Caso resolvido: uma fórmula de desconto foi copiada sem fixar G1. Na primeira linha funcionou, mas a segunda passou a procurar a taxa em G2, que estava vazia. A revisão substituiu a taxa relativa por $G$1 e manteve relativa a referência do total de cada linha. Em seguida, foram testados valores conhecidos. O problema não exigia digitar manualmente cada desconto; exigia representar corretamente qual dado era comum a todas as operações.</p>
<p>Prática guiada: calcule três valores após a mesma taxa fictícia, usando uma célula única para a taxa. Copie as fórmulas e confira se todas continuam apontando para ela. Crie também os três testes de limite para SE e uma contagem por material. Compare o resultado da contagem com uma marcação manual das linhas correspondentes. Em uma cópia, inclua espaços comuns extras no nome de um material e examine o efeito do tratamento antes de consolidar o cadastro.</p>
<p>Finalize descrevendo sua regra em palavras e comparando-a à fórmula. Se um resultado parecer inesperado, confira entradas, referências e limites nessa ordem antes de esconder o erro. Uma mensagem alternativa pode ser útil ao usuário, mas não deve disfarçar um cadastro ou cálculo não conferido. A função serve ao problema definido; escolher uma fórmula complexa sem necessidade torna a auditoria mais difícil sem melhorar a informação produzida.</p>`
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-aula-3",
    "title": "Organizar tabelas, filtros e validações",
    "hours": 20,
    "skills": [
      "Manter registros íntegros e estabelecer entradas válidas para a base de análise."
    ],
    "sourceIds": [
      "xl-validar",
      "xl-formulas",
      "xl-pivot"
    ],
    "html": `<h2>Organizar tabelas, filtros e validações</h2>
<p>Uma base de análise funciona melhor quando cada coluna possui um significado e cada linha corresponde a um registro. Mantenha cabeçalhos claros, evite células mescladas na área de dados e não misture unidades incompatíveis na mesma coluna. Uma tabela estruturada do Excel pode facilitar a identificação e a expansão da base, mas precisa partir de dados coerentes. Transformar uma área em tabela não corrige automaticamente códigos duplicados, datas inválidas ou descrições com sentido diferente.</p>
<p>Classificar muda a ordem dos registros de acordo com um critério. Preserve a relação entre as colunas da mesma linha: ordenar somente a coluna de nomes e deixar quantidades paradas pode associar um material à quantidade de outro. Antes de confirmar, confira o intervalo e a opção de expandir a seleção quando o programa apresentar essa escolha. Use uma cópia para o primeiro teste e compare dois registros identificáveis antes e depois da classificação.</p>
<p>Filtrar mostra os registros que atendem ao critério e oculta temporariamente os demais, sem equivaler a excluí-los. Um filtro por Material igual a Papel pode ajudar uma conferência, mas precisa ser informado em um relatório. Uma planilha com filtro ativo não representa visualmente toda a base. Não suponha também que toda fórmula passa a somar só linhas visíveis: a função SOMA sobre o intervalo continua incluindo valores mesmo que as linhas sejam ocultadas por filtro.</p>
<p>A validação de dados pode restringir tipos ou valores de entrada. Para uma quantidade de peças inteiras entre zero e cem, escolha uma regra de número inteiro com esses limites. Para categorias padronizadas, uma lista pode reduzir variações de escrita. Configure mensagem e comportamento de erro conforme o objetivo e teste entradas válidas e inválidas. Uma regra mal definida pode impedir um dado legítimo ou aceitar um valor que não deveria entrar.</p>
<p>Caso resolvido: a coluna Quantidade deveria receber inteiros de zero a cem. A regra foi testada com 0, 25, 100, 101 e 2,5. Os três primeiros estão no intervalo e são inteiros; os dois últimos violam critérios diferentes. Uma regra que aceita somente números maiores que zero recusaria o zero, embora ele esteja permitido no enunciado. A validação precisa representar exatamente a regra do controle, inclusive os limites.</p>
<p>Prática orientada: crie cinco registros com código, material, data e quantidade. Configure uma lista para categoria e uma regra numérica para quantidade. Faça os testes de limite em uma cópia e registre o comportamento observado. Depois filtre uma categoria, conte manualmente os registros visíveis e remova o filtro. Confira que os demais registros continuam presentes. Se uma operação os removeu, você fez algo diferente da filtragem planejada.</p>
<p>Para conferir totais sob filtros, identifique o que cada fórmula calcula e escolha o recurso apropriado ao objetivo. A função SUBTOTAL oferece modos de cálculo que consideram filtros, mas seus argumentos e o tratamento de linhas ocultadas manualmente precisam ser conferidos antes do uso. Nesta prática, a verificação principal é não confundir o conjunto exibido com o conjunto que uma SOMA está usando. Um título de relatório deve explicitar período e recorte.</p>
<p>A validação é um apoio à qualidade da entrada, não uma barreira de segurança ou uma prova de que todos os dados antigos estão corretos. Examine importações, colagens e a base existente de acordo com o procedimento. Registre o significado dos campos e quem pode alterar as regras. O resultado esperado é uma base que outra pessoa consegue compreender, testar e atualizar sem depender de explicações informais sobre qual coluna deve ser interpretada de cada maneira.</p>`
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-aula-4",
    "title": "Criar gráficos e relatórios que respondem a uma pergunta",
    "hours": 20,
    "skills": [
      "Selecionar dados, recorte e representação compatíveis com a comparação pretendida."
    ],
    "sourceIds": [
      "xl-grafico",
      "xl-formulas",
      "xl-pivot"
    ],
    "html": `<h2>Criar gráficos e relatórios que respondem a uma pergunta</h2>
<p>Um gráfico deve responder a uma pergunta definida. Comparar quantidades por material e acompanhar um indicador ao longo de meses são tarefas diferentes. Antes de inserir uma representação, escolha quais registros e medidas serão usados. Um gráfico visualmente atraente pode transmitir uma conclusão errada se incluir períodos incompatíveis, duplicar totais ou apresentar contagem como se fosse soma. A clareza do relatório começa na base e no significado da medida.</p>
<p>Para comparar categorias, colunas ou barras podem facilitar a leitura. Para observar evolução ao longo de períodos ordenados, uma linha pode ser apropriada. Uma composição percentual exige que as partes pertençam ao mesmo total e sejam interpretadas nesse contexto. Essas escolhas não são um catálogo rígido que dispensa análise; são pontos de partida. O leitor precisa identificar categoria, unidade, período e fonte dos valores sem adivinhar o que o desenho representa.</p>
<p>No Excel, selecione os dados pertinentes e procure as opções de gráfico em Inserir. A recomendação automática pode ajudar, mas confira o resultado. Veja se o programa usou a primeira linha como rótulo, se as séries correspondem às medidas e se os eixos estão organizados. Uma coluna numérica com códigos de produtos não deve virar uma série de valores somente porque contém números. Corrija a seleção e a configuração quando a interpretação automática não atender ao objetivo.</p>
<p>Um relatório simples pode conter pergunta, período, indicadores, gráfico e observações sobre limites ou pendências. Se a base possui filtro ativo ou informações ainda não confirmadas, isso precisa ser distinguido do dado consolidado. Não use apenas cores para comunicar uma diferença relevante; rótulos e explicações tornam a informação mais acessível. Evite efeitos de perspectiva que dificultem comparar alturas ou áreas e confira se o eixo favorece uma leitura proporcional adequada.</p>
<p>Caso resolvido: três meses do exercício registraram 90, 120 e 105 unidades. A soma é 315 e a média aritmética é 105. Uma linha na ordem dos meses mostra aumento seguido de redução, sem permitir concluir que o crescimento continuará. O título informa que são unidades de um material e qual período foi usado. A observação do relatório explica que os dados são fictícios para prática, em vez de apresentá-los como desempenho real de uma organização.</p>
<p>Prática guiada: organize os três valores em uma tabela com meses ordenados e crie uma representação temporal. Depois crie uma tabela de quatro categorias para comparar suas quantidades. Em cada gráfico, escreva uma pergunta que ele consegue responder e uma conclusão que não pode ser inferida só por aquela imagem. Compare os valores exibidos com a base, inclusive a identificação das séries e a presença de totais que não deveriam ser tratados como outra categoria.</p>
<p>Faça um teste de atualização: altere um valor da base e confira qual parte do gráfico mudou. Acrescente um novo período e verifique se o intervalo passou a abrangê-lo. Não considere um painel atualizado só porque a data do arquivo mudou. Uma parte pode usar uma tabela expansível e outra continuar presa a um intervalo antigo. A conferência precisa observar o dado efetivamente representado e a operação necessária para atualizar cada recurso.</p>
<p>Para concluir, peça a outra pessoa que descreva o principal resultado usando apenas o relatório. Se ela confundir a unidade, o período ou a diferença entre contagem e valor, revise os rótulos e a explicação. Não retire um dado relevante para tornar o gráfico mais favorável a uma tese. O objetivo é produzir uma leitura verificável, com números que possam ser rastreados à base e limites que impeçam interpretações mais amplas do que a informação permite.</p>`
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-aula-5",
    "title": "Pesquisar cadastros e resumir com Tabela Dinâmica",
    "hours": 20,
    "skills": [
      "Usar correspondência exata e configurar um resumo por categoria com atualização conferida."
    ],
    "sourceIds": [
      "xl-procx",
      "xl-procv",
      "xl-pivot"
    ],
    "html": `<h2>Pesquisar cadastros e resumir com Tabela Dinâmica</h2>
<p>Uma pesquisa relaciona uma chave a outra informação de um cadastro. Primeiro defina o que identifica cada registro e confira se a chave é única no contexto pretendido. Um código escrito como texto pode não corresponder a um número semelhante, e espaços adicionais podem impedir a correspondência esperada. Uma função não resolve sozinha qual de dois cadastros duplicados é válido. A qualidade da chave precisa ser examinada antes de usar o retorno em um cálculo.</p>
<p>Em versões compatíveis, =PROCX(F2;A2:A4;C2:C4;"Não encontrado";0) procura a chave de F2 em A2:A4 e retorna o valor da mesma posição de C2:C4, usando correspondência exata indicada por zero. A mensagem escolhida trata a ausência prevista; ela não prova que um cadastro está completo. A documentação da Microsoft informa que PROCX não está disponível no Excel 2016 e 2019. Confira a versão antes de escolher a função para um arquivo que outras pessoas precisarão usar.</p>
<p>Uma alternativa em versões que a suportam é =PROCV(F2;$A$2:$C$4;3;FALSO), quando a chave está na primeira coluna do intervalo e o retorno está na terceira. FALSO pede correspondência exata. Omitir esse argumento pode levar a uma pesquisa aproximada que não representa uma busca de código exato. Observe também a direção: nesse exemplo, PROCV pesquisa na primeira coluna e retorna uma coluna à direita dentro da matriz indicada.</p>
<p>Para reproduzir, coloque três códigos fictícios na coluna A e preços na C: P01 com 5, P02 com 9 e P03 com 12. Com F2 igual a P02, a pesquisa exata deve retornar 9. Teste também P99, ausente do cadastro, e uma chave com espaço extra. Confira a diferença entre não encontrar e retornar um preço próximo. Se houver duas linhas com P02, investigue a duplicidade em vez de confiar no primeiro retorno como decisão sobre qual cadastro está correto.</p>
<p>Uma Tabela Dinâmica resume uma base organizada por campos. Para somar valores por material, coloque o material na área de Linhas e o valor na área de Valores, conferindo que a operação é Soma, não Contagem. A base deve ter cabeçalhos e tipos coerentes. Uma coluna com valores tratados como texto pode produzir uma contagem em vez do resumo esperado. Alterar a aparência do total não corrige o tipo da informação ou a operação selecionada.</p>
<p>Caso resolvido: a base tem Papel 20, Caneta 6, Papel 5 e Pasta 14. O resumo por material deve apresentar Papel 25, Caneta 6 e Pasta 14, totalizando 45. Se o resumo mostrar dois para Papel, provavelmente está contando registros, e não somando os valores. Após acrescentar outra linha, confira o intervalo ou tabela de origem e execute a atualização necessária conforme a versão. Não suponha que qualquer configuração de resumo acompanha automaticamente toda alteração.</p>
<p>Prática orientada: faça as duas pesquisas sobre o cadastro fictício, quando as funções existirem na sua versão, e documente a alternativa usada. Crie o resumo da base de quatro registros e compare com uma soma manual por grupo. Acrescente uma nova linha de Papel no valor 3 e confira que o grupo passa a 28 e o total a 48 depois da atualização correta. Guarde uma cópia anterior ao teste para demonstrar qual operação foi necessária.</p>
<p>Combine pesquisa e resumo somente depois de validar cada parte. Um preço retornado do cadastro errado pode ser somado corretamente e ainda gerar um relatório incorreto. Explique a chave, o modo de correspondência, a coluna retornada, a operação do resumo e o procedimento de atualização. Essa documentação torna o uso de recursos avançados verificável e evita que uma função aparentemente sofisticada esconda uma base sem identidade ou um total com significado indefinido.</p>`
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-aula-6",
    "title": "Integrar, testar e documentar uma planilha de controle",
    "hours": 20,
    "skills": [
      "Conferir a cadeia entre entradas, cálculos e relatórios com casos e resultados esperados."
    ],
    "sourceIds": [
      "xl-formulas",
      "xl-ref",
      "xl-validar",
      "xl-grafico",
      "xl-procx",
      "xl-pivot"
    ],
    "html": `<h2>Integrar, testar e documentar uma planilha de controle</h2>
<p>Uma planilha de controle reúne partes que dependem umas das outras. A entrada identifica a operação, a fórmula calcula uma medida e o relatório apresenta um recorte. Um erro no cadastro pode atravessar toda a cadeia sem produzir uma mensagem de erro. Para o projeto final, use uma base fictícia de materiais, quantidades, preços e categorias. Separe as áreas de entrada, cadastro e análise de modo que outra pessoa consiga compreender sua finalidade.</p>
<p>Defina uma pergunta de controle, como qual foi o valor movimentado por categoria no período do exercício. Escreva as regras antes de montar o painel: quais operações entram, qual unidade é usada, como se calcula o valor e como são tratadas pendências. Use validações pertinentes, sem confundi-las com autorização de acesso. Quando houver dados reais em um contexto de trabalho, permissões e compartilhamento precisam seguir os recursos e procedimentos definidos pela organização.</p>
<p>Testes úteis possuem entrada e resultado esperado conhecidos. Para uma linha de duas unidades a R$ 8, espere R$ 16. Para três linhas com totais 16, 9 e 5, espere soma de R$ 30. Se a taxa fictícia de desconto for 10%, a aplicação ao total de R$ 30 produz R$ 27, conforme a regra estudada. Refaça as contas fora da fórmula e inclua um teste em que a quantidade muda. Um painel que só foi observado sem alteração de dados ainda não demonstrou atualização coerente.</p>
<p>Inclua casos de limite e de falha prevista. Uma quantidade zero permitida deve ter tratamento compatível com a regra; uma chave inexistente deve ser identificada; uma nova linha precisa entrar no total e no resumo; um filtro deve ser informado no relatório. Não esconda erros de pesquisa com zero se esse zero puder ser interpretado como preço válido. Uma mensagem de pendência pode comunicar melhor a situação e impedir uma conclusão financeira sem informação confirmada.</p>
<p>Caso resolvido: o relatório totalizava somente D2:D4. A equipe incluiu uma quarta operação em D5 e o painel manteve o total antigo. O teste de nova linha revelou o intervalo fixo incompleto. A revisão ajustou a origem do cálculo e conferiu também a fonte do gráfico e da Tabela Dinâmica. Corrigir apenas uma célula não garantiria que as três saídas passassem a usar o mesmo conjunto de registros. A conferência comparou cada saída ao total manual esperado.</p>
<p>Prática guiada: construa uma base de seis operações fictícias e documente quatro testes: cálculo de uma linha, soma por grupo, nova operação e código ausente. Registre o resultado esperado antes de executar e o resultado observado depois. Se houver diferença, procure a causa na entrada, na referência ou na operação de resumo. Corrija o problema e repita somente o teste afetado e a conferência da cadeia correspondente, preservando a versão anterior para comparação.</p>
<p>Prepare uma folha de orientações com campos, unidades, regras principais, recursos exigidos pela versão e modo de atualização. Evite instruções vagas como “não mexer em nada”. Indique onde os dados devem ser inseridos e quais áreas contêm fórmulas. Recursos de proteção de planilha podem reduzir alterações acidentais, mas não devem ser apresentados como garantia de confidencialidade. A apresentação precisa explicar o que a planilha realmente faz e quais verificações continuam necessárias.</p>
<p>Finalize com uma revisão por outra pessoa, usando a documentação sem instruções informais adicionais. Peça que ela inclua uma operação de treino e encontre um total por categoria. Observe onde houve dúvida e melhore os rótulos ou as instruções. A prova objetiva avalia decisões e resultados das situações estudadas, enquanto o projeto demonstra aplicação. Nenhuma fórmula isolada substitui a responsabilidade de conferir dados, critérios e alcance do relatório produzido.</p>`
  }
];
