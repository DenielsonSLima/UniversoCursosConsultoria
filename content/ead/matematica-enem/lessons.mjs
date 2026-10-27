export const lessons = [
  {
    id: 'me-20261027-aula-1',
    title: 'Competências do Enem e Resolução de Problemas',
    hours: 26,
    skills: ['me-leitura-tabelas', 'me-unidades-estimativa'],
    inepSkills: ['H3', 'H4', 'H10', 'H25'],
    sourceIds: ['inep-matriz', 'inep-matriz-pdf', 'inep-habilidades', 'obmep-razoes'],
    html: `
<h2>Da informação à solução</h2>
<p>Ao resolver um problema, transforme a pergunta em uma quantidade identificável: preço final, distância, número de pessoas, área ou probabilidade. Anote os dados com suas unidades, escolha uma representação e só depois calcule. O resultado precisa responder ao que foi pedido. Saber que uma alternativa parece razoável ajuda a conferir uma conta, mas não substitui a justificativa matemática.</p>
<p>Esta revisão reúne fundamentos e problemas contextualizados. A matriz do Inep orienta a seleção das habilidades; ela não é uma lista de fórmulas nem significa que estas seis aulas esgotem todos os assuntos do exame. Use caderno e lápis. Registre cada tentativa, confira as soluções e retorne ao conceito quando o erro persistir.</p>
<h3>Números e representações</h3>
<p>Uma fração a/b, com b diferente de zero, expressa uma divisão. Quando representa parte de um conjunto, o denominador é o total usado como referência. Por exemplo, 18 de 60 correspondem a 18/60 = 3/10 = 0,3 = 30%. A mesma quantidade tem representações diferentes. Compare frações usando denominador comum ou divisão; 3/8 = 0,375 é menor que 2/5 = 0,4. A posição na reta numérica também permite ordenar números negativos: −2 é maior que −5.</p>
<p>Respeite a ordem das operações: parênteses, potências, multiplicações/divisões e adições/subtrações, resolvendo operações de mesma prioridade da esquerda para a direita. Assim, 18 − 2 × 4 = 10, enquanto (18 − 2) × 4 = 64. Ao estimar, substitua valores por outros próximos e registre que se trata de aproximação.</p>
<h3>Exemplo resolvido 1 — tabela e participação</h3>
<table><caption>Passagens vendidas em três dias</caption><thead><tr><th>Dia</th><th>Quantidade</th></tr></thead><tbody><tr><td>Segunda</td><td>120</td></tr><tr><td>Terça</td><td>150</td></tr><tr><td>Quarta</td><td>180</td></tr></tbody></table>
<p>Qual foi a participação de quarta no total? Primeiro some: 120 + 150 + 180 = 450. A parte pedida é 180/450 = 0,4 = 40%. O aumento de terça para quarta é outra pergunta: (180 − 150)/150 = 20%. Dividir a diferença pelo total dos três dias não mede esse crescimento.</p>
<h3>Exemplo resolvido 2 — unidades e limite de capacidade</h3>
<p>Uma excursão tem 137 participantes. Cada veículo leva até 32. A divisão dá 137/32 = 4,28125. Não se pode contratar uma fração de veículo, e quatro levariam somente 128 pessoas. Portanto são necessários cinco. O arredondamento depende do contexto: para pessoas atendidas é preciso arredondar para cima; para peças completas produzidas com um estoque limitado, pode ser necessário arredondar para baixo.</p>
<h3>Exemplo resolvido 3 — tempo e velocidade</h3>
<p>Uma bicicleta percorre 18 km em 45 minutos, com velocidade média constante no modelo. Converta 45 min em 45/60 = 0,75 h. Então v = distância/tempo = 18/0,75 = 24 km/h. Dividir por 45 forneceria km/min, não km/h. A estimativa confirma: em menos de uma hora percorreu 18 km, então em uma hora percorreria mais que 18 km.</p>
<h3>Leitura de gráficos sem armadilhas</h3>
<p>Confira título, legenda, unidade, escala e período. Em gráfico de colunas, compare alturas associadas aos valores; em linha, observe os intervalos e o comportamento entre pontos. Se um eixo começa em 90, a diferença visual entre 100 e 110 pode parecer grande, mas o aumento continua sendo 10%. Uma projeção baseada numa tendência supõe que o padrão continue; ela não é certeza sobre o futuro.</p>
<h3>Pratique e confira</h3>
<ol><li>Uma biblioteca emprestou 80, 100 e 120 livros em três semanas. Que fração do total foi emprestada na terceira?</li><li>Quantas caixas de 24 garrafas são necessárias para transportar 170 garrafas?</li><li>Converta 2 h 15 min em horas decimais e 3,2 km em metros.</li><li>Uma pessoa percorre 6 km em 1 h 30 min. Calcule a velocidade média.</li><li>Um gráfico informa redução de 200 para 150 atendimentos. Qual foi a redução relativa ao valor inicial?</li></ol>
<p><strong>Conferência:</strong> 1) 120/300 = 2/5 = 40%. 2) Oito caixas, pois sete comportam 168. 3) 2,25 h e 3.200 m. 4) 6/1,5 = 4 km/h. 5) 50/200 = 25%. Se errou, identifique se trocou a referência, a unidade ou o arredondamento.</p>
<h3>Trilha de estudo — 26 horas</h3>
<p>Distribua o estudo em leitura e reescrita dos exemplos (4 h), revisão de frações, operações e medidas na trilha aberta (6 h), resolução comentada dos exercícios e criação de variações numéricas (8 h), leitura de tabelas reais com identificação de fonte e unidade (4 h) e revisão dos erros com atividade da aula (4 h). São horas de trabalho orientado, não duração de vídeo.</p>
<p>Referências: <a href="https://www.gov.br/inep/pt-br/centrais-de-conteudo/acervo-linha-editorial/publicacoes-institucionais/avaliacoes-e-exames-da-educacao-basica/matrizes-de-referencia-enem">matriz do Inep</a> e <a href="https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=57">razões e proporções — OBMEP/IMPA</a>. Os exemplos e exercícios desta aula são originais.</p>`,
  },
  {
    id: 'me-20261027-aula-2',
    title: 'Aritmética, Razão, Proporção e Porcentagem',
    hours: 26,
    skills: ['me-proporcionalidade', 'me-porcentagens'],
    inepSkills: ['H3', 'H16', 'H17'],
    sourceIds: ['inep-habilidades', 'obmep-razoes', 'obmep-porcentagem'],
    html: `
<h2>Comparar quantidades e acompanhar mudanças</h2>
<p>Uma razão compara duas grandezas por divisão. Escreva a ordem: quilômetros por litro é distância dividida por combustível; litros por quilômetro usa a razão inversa. Uma proporção é uma igualdade entre razões. Em a/b = c/d, com b e d não nulos, vale ad = bc. Antes de montar uma regra de três, verifique por que a razão ou o produto deveria permanecer constante.</p>
<p>Grandezas diretamente proporcionais têm quociente constante: dobrar uma dobra a outra. Se cada ingresso custa R$ 18, o custo de n ingressos é 18n, sem taxa fixa. Grandezas inversamente proporcionais têm produto constante: para o mesmo trabalho, dobrar o número de equipes de igual produtividade reduz o tempo à metade, desde que possam trabalhar simultaneamente sem interferência. Nem toda relação crescente é proporcional: uma corrida com bandeirada fixa não custa o dobro quando a distância dobra.</p>
<h3>Exemplo resolvido 1 — mistura</h3>
<p>Uma tinta usa azul e branco na razão 2:5. Para preparar 21 litros, divida o total em 2 + 5 = 7 partes. Cada parte tem 21/7 = 3 litros. São 6 litros de azul e 15 de branco. A conferência é dupla: 6/15 = 2/5 e 6 + 15 = 21. Usar 2/5 do total para o azul seria incorreto, pois 5 representa o branco, não o total de partes.</p>
<h3>Exemplo resolvido 2 — trabalho fixo</h3>
<p>Quatro bombas iguais esvaziam um reservatório em seis horas. Se a vazão se mantiver e todas operarem juntas, oito bombas fazem o mesmo serviço em t horas: 4 × 6 = 8t; t = 3 h. O produto bombas × horas permanece 24. Se uma bomba tiver outra vazão ou houver entrada de água, o modelo precisa ser revisto.</p>
<h3>Porcentagem e base de comparação</h3>
<p>p% significa p/100. Um aumento de p% multiplica o valor por 1 + p/100; um desconto multiplica por 1 − p/100. A variação relativa entre inicial I e final F é (F − I)/I, para I diferente de zero. Pontos percentuais medem a diferença entre duas porcentagens: passar de 20% para 30% é subir 10 pontos percentuais e crescer 50% em relação aos 20% iniciais.</p>
<h3>Exemplo resolvido 3 — mudanças sucessivas</h3>
<p>Um produto de R$ 250 recebe desconto de 20% e depois aumento de 10% sobre o preço descontado. Calcule 250 × 0,80 × 1,10 = R$ 220. O fator total 0,88 representa queda de 12%, e não 10%. As bases são diferentes: o desconto foi R$ 50; o aumento seguinte foi R$ 20.</p>
<h3>Exemplo resolvido 4 — escalas e juros</h3>
<p>Num mapa 1:50.000, uma distância de 3,6 cm representa 3,6 × 50.000 = 180.000 cm = 1,8 km. Compare unidades iguais antes de simplificar a razão. Em outro contexto, R$ 800 a juros simples de 2% ao mês por três meses geram J = 800 × 0,02 × 3 = R$ 48; montante R$ 848. Se a capitalização fosse composta, o montante seria 800 × 1,02³ = R$ 848,9664, aproximadamente R$ 848,97. A palavra “simples” ou “compostos” muda o modelo.</p>
<h3>Pratique e confira</h3>
<ol><li>Uma receita para seis pessoas usa 450 g de arroz. Quanto usará para dez pessoas mantendo as porções?</li><li>Três máquinas iguais fazem um lote em oito horas. Quanto tempo levariam seis máquinas nas mesmas condições?</li><li>Um preço de R$ 120 aumenta 25% e depois cai 20%. Qual é o preço final?</li><li>Uma planta 1:200 mostra parede de 4,5 cm. Qual é o comprimento real em metros?</li><li>Uma taxa passou de 12% para 15%. Calcule a diferença em pontos percentuais e o crescimento relativo.</li><li>Calcule o montante de R$ 500 a juros simples de 3% ao mês por quatro meses.</li></ol>
<p><strong>Conferência:</strong> 1) 450 × 10/6 = 750 g. 2) 3 × 8/6 = 4 h. 3) 120 × 1,25 × 0,8 = R$ 120. 4) 900 cm = 9 m. 5) 3 pontos percentuais; 3/12 = 25%. 6) 500 × (1 + 0,03 × 4) = R$ 560. Em cada item, explique qual quantidade ficou constante.</p>
<h3>Trilha de estudo — 26 horas</h3>
<p>Reserve 5 h para teoria e exemplos, 6 h para a trilha OBMEP de proporções direta e inversa e regra de três, 8 h para exercícios próprios e da trilha com resolução completa, 4 h para comparar preços por unidade e escalas, e 3 h para revisar erros e realizar a atividade. Para cada solução, faça uma estimativa e confira a unidade. Estudar exemplos de proporcionalidade ajuda também nas aulas de funções, geometria e probabilidade.</p>
<p>Aprofundamento aberto: <a href="https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=57">Razões e Proporções</a> e <a href="https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=26">Porcentagem e Juros — OBMEP/IMPA</a>. Os problemas desta aula foram escritos para esta revisão.</p>`,
  },
  {
    id: 'me-20261027-aula-3',
    title: 'Álgebra, Funções e Gráficos',
    hours: 27,
    skills: ['me-funcao-afim', 'me-funcao-quadratica'],
    inepSkills: ['H19', 'H20', 'H21'],
    sourceIds: ['inep-habilidades', 'obmep-afim', 'obmep-quadratica', 'obmep-trilha-funcoes'],
    html: `
<h2>Modelos algébricos para relações entre grandezas</h2>
<p>Uma variável representa uma quantidade que pode mudar. Uma equação impõe igualdade; resolvê-la é encontrar valores que a tornam verdadeira. Em 3x + 5 = 26, subtraia 5 dos dois lados e divida por 3: x = 7. Confira: 3 × 7 + 5 = 26. Uma inequação compara valores; se multiplicar ou dividir os dois membros por um número negativo, inverta o sentido. Em −2x &lt; 6, obtemos x &gt; −3.</p>
<p>Fatorar transforma uma soma em produto. Em x² − 9x + 20, procure dois números cuja soma seja 9 e cujo produto seja 20: 4 e 5. Assim, x² − 9x + 20 = (x − 4)(x − 5), pois desenvolver o produto recupera x² − 5x − 4x + 20. Para resolver x² − 9x + 20 = 0, use que um produto é zero quando pelo menos um fator é zero: x = 4 ou x = 5. Esse reconhecimento é útil para trinomios fatoráveis, mas nem toda equação quadrática terá raízes inteiras.</p>
<p>Uma função associa cada entrada do domínio a uma única saída. O domínio deve respeitar o contexto: quantidade de ingressos é inteira e não negativa; tempo transcorrido é não negativo. No plano cartesiano, o eixo horizontal costuma representar a entrada x, e o vertical a saída y. Um ponto (2, 18) afirma que x = 2 produz y = 18. Verifique rótulos e unidades; não conclua que duas curvas que se cruzam representam fenômenos iguais fora daquele ponto.</p>
<h3>Exemplo resolvido 1 — função afim e tabela</h3>
<p>Uma entrega cobra R$ 8 fixos e R$ 3 por quilômetro: C(d) = 8 + 3d, para d ≥ 0. O coeficiente 3 mede a variação em reais por quilômetro; 8 é a cobrança quando d = 0. Para 4 km, C(4) = 20. Se a entrega custou R$ 35, resolva 8 + 3d = 35: d = 9 km.</p>
<table><caption>Pontos do gráfico de C(d) = 8 + 3d</caption><thead><tr><th>d, em km</th><th>C, em reais</th></tr></thead><tbody><tr><td>0</td><td>8</td></tr><tr><td>2</td><td>14</td></tr><tr><td>4</td><td>20</td></tr></tbody></table>
<p>Marque esses pares no caderno e una-os com uma reta no domínio d ≥ 0. O crescimento é constante: 6 reais a cada 2 km. Conhecendo dois pontos, a taxa é Δy/Δx = (20 − 14)/(4 − 2) = 3. Uma tabela, sozinha, não prova que a regra vale entre os pontos: aqui isso vem do modelo de cobrança informado.</p>
<h3>Exemplo resolvido 2 — comparar planos</h3>
<p>O plano A custa 20 + 2x reais e B custa 8 + 4x reais, para x unidades utilizadas. No empate, 20 + 2x = 8 + 4x, então x = 6 e ambos custam R$ 32. Para x &gt; 6, A é mais barato: sua taxa de crescimento é menor. Para x &lt; 6, B é mais barato. Testar x = 0 e x = 10 ajuda a conferir o sentido da desigualdade.</p>
<h3>Exemplo resolvido 3 — máximo de função quadrática</h3>
<p>Um modelo de área é A(x) = −x² + 12x, com 0 ≤ x ≤ 12. Complete o quadrado: A(x) = −(x − 6)² + 36. Como o quadrado é não negativo, a área não ultrapassa 36; esse máximo ocorre em x = 6. A parábola abre para baixo e cruza o eixo horizontal em x = 0 e x = 12. Em f(x) = ax² + bx + c, a diferente de zero, a coordenada horizontal do vértice é −b/(2a). Se a for positivo, o vértice será mínimo.</p>
<h3>Exemplo resolvido 4 — crescimento multiplicativo</h3>
<p>Uma cultura começa com 300 unidades e dobra a cada hora: N(t) = 300 × 2ᵗ, para horas inteiras t ≥ 0. Em três horas, N(3) = 2.400. Para atingir 4.800, 300 × 2ᵗ = 4.800 implica 2ᵗ = 16 e t = 4. Somar 300 a cada hora produziria uma progressão aritmética; dobrar produz progressão geométrica. Quando a potência não for reconhecida diretamente, o logaritmo é a operação inversa da exponencial: log₂16 = 4.</p>
<h3>Pratique e confira</h3>
<ol><li>Para C(x) = 12 + 5x, calcule C(6) e encontre x quando C(x) = 57.</li><li>Uma reta passa por (0, 7) e (3, 19). Encontre sua regra e o valor em x = 5.</li><li>Compare A(x) = 30 + x e B(x) = 12 + 3x. Quando empatam?</li><li>Escreva −x² + 10x como um quadrado completado e determine seu máximo.</li><li>Uma população de 80 unidades triplica em cada etapa. Quantas haverá após três etapas?</li><li>Resolva x² − 7x + 12 = 0 pela fatoração e confira as raízes.</li></ol>
<p><strong>Conferência:</strong> 1) 42 e 9. 2) y = 4x + 7; y(5) = 27. 3) x = 9, custo 39. 4) −(x − 5)² + 25, máximo 25. 5) 80 × 27 = 2.160. 6) (x − 3)(x − 4) = 0, raízes 3 e 4. Ao usar o vértice, confira se ele pertence ao domínio do problema.</p>
<h3>Trilha de estudo — 27 horas</h3>
<p>Estude e refaça os exemplos em 5 h; use 7 h nas leituras e exercícios abertos de função afim e quadrática; reserve 8 h para construir tabelas, desenhar gráficos, resolver equações e comparar modelos; utilize 4 h para variações de crescimento e domínio; finalize com 3 h de revisão e atividade. O foco é justificar o modelo e interpretar a resposta, além de manipular símbolos.</p>
<p>Referências abertas: <a href="https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=35">Função Afim</a>, <a href="https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=62">Introdução à Função Quadrática</a> e <a href="https://portaldaobmep.impa.br/index.php/modulo/index?a=1">trilha de funções, exponenciais e progressões — OBMEP/IMPA</a>.</p>`,
  },
  {
    id: 'me-20261027-aula-4',
    title: 'Geometria Plana, Espacial e Analítica',
    hours: 27,
    skills: ['me-area-volume', 'me-geometria-distancias'],
    inepSkills: ['H8', 'H11', 'H12', 'H22'],
    sourceIds: ['inep-matriz-pdf', 'inep-habilidades', 'obmep-geometria', 'obmep-volume'],
    html: `
<h2>Representar o espaço e medir</h2>
<p>Um desenho auxilia o raciocínio, mas suas proporções podem ser apenas ilustrativas. Marque os dados fornecidos. Perímetro mede contorno, em unidades de comprimento; área mede superfície, em unidades quadradas; volume mede ocupação espacial, em unidades cúbicas. Converter 1 m para 100 cm não significa converter 1 m² para 100 cm²: 1 m² = 10.000 cm² e 1 m³ = 1.000.000 cm³ = 1.000 litros.</p>
<p>Retas perpendiculares formam ângulos de 90°. Os ângulos internos de um triângulo somam 180°. Em um triângulo retângulo, os catetos formam o ângulo reto, e a hipotenusa fica oposta a ele. O teorema de Pitágoras afirma h² = a² + b². Antes de aplicá-lo, certifique-se de que existe um ângulo reto; não vale automaticamente para qualquer triângulo.</p>
<h3>Fórmulas com significado</h3>
<p>Retângulo: A = base × altura. Triângulo: A = base × altura perpendicular/2, porque duas cópias adequadas formam um paralelogramo. Trapézio: A = (base maior + base menor) × altura/2. Círculo: A = πr² e comprimento da circunferência = 2πr. Em prismas retos, V = área da base × altura; no cilindro, V = πr²h. Indique se usou π exato ou uma aproximação dada. Duplicar todas as medidas multiplica a área por quatro e o volume por oito.</p>
<h3>Exemplo resolvido 1 — piso e compra inteira</h3>
<p>Um quarto retangular mede 4 m por 3,5 m. Sua área é 14 m². Cada caixa cobre 2 m²; sem perdas seriam sete caixas. Se a compra deve incluir 10% de reserva sobre a área, serão 14 × 1,10 = 15,4 m². Dividindo por 2 obtemos 7,7, portanto oito caixas. Somar 10% ao número já arredondado de caixas pode produzir decisões diferentes em outros casos; mantenha a unidade até o fim.</p>
<h3>Exemplo resolvido 2 — capacidade e altura</h3>
<p>Um tanque em forma de bloco retangular tem base 2 m por 1,5 m. Qual altura de água corresponde a 1.800 litros? Converta 1.800 L para 1,8 m³. A área da base é 3 m²; logo 3h = 1,8 e h = 0,6 m. Num cilindro de raio 1 m e altura 2 m, o volume seria 2π m³, aproximadamente 6,28 m³ se π = 3,14, ou 6.280 litros. Raio é metade do diâmetro.</p>
<h3>Exemplo resolvido 3 — distância no plano</h3>
<p>Num mapa cartesiano com cada unidade igual a um quilômetro, os pontos A(1, 2) e B(7, 10) diferem 6 unidades horizontalmente e 8 verticalmente. A distância em linha reta é √(6² + 8²) = √100 = 10 km. Seguir ruas que só permitem movimentos horizontais e verticais exigiria pelo menos 6 + 8 = 14 km. A resposta depende do caminho permitido, não apenas dos pontos.</p>
<h3>Exemplo resolvido 4 — semelhança e trigonometria</h3>
<p>No mesmo instante e num terreno plano, uma haste vertical de 1,5 m projeta sombra de 2 m. Uma árvore projeta sombra de 8 m. Sob os mesmos raios solares, os triângulos são semelhantes: H/8 = 1,5/2, então H = 6 m. Em um triângulo retângulo, seno é cateto oposto/hipotenusa, cosseno é cateto adjacente/hipotenusa e tangente é oposto/adjacente. Se uma rampa tem comprimento 10 m e sobe formando ângulo de 30° com o chão, a altura é 10 × sen30° = 5 m, pois sen30° = 1/2.</p>
<h3>Pratique e confira</h3>
<ol><li>Determine área e perímetro de um retângulo de 9 m por 4 m.</li><li>Um triângulo retângulo tem catetos 5 e 12 cm. Determine a hipotenusa e a área.</li><li>Quantos litros cabem num bloco de dimensões 1,2 m, 0,5 m e 0,8 m?</li><li>Calcule a distância entre P(−2, 1) e Q(4, 9), em unidades.</li><li>Um círculo tem diâmetro 10 cm. Calcule a área usando π = 3,14.</li><li>Em uma planta 1:100, um quadrado tem lado de 3 cm. Qual é a área real em m²?</li></ol>
<p><strong>Conferência:</strong> 1) 36 m² e 26 m. 2) 13 cm e 30 cm². 3) 0,48 m³ = 480 L. 4) √(6² + 8²) = 10. 5) Raio 5; área 78,5 cm². 6) Lado real 3 m; área 9 m². Desenhe as figuras e escreva unidades em todas as etapas.</p>
<h3>Trilha de estudo — 27 horas</h3>
<p>Dedique 5 h aos conceitos e desenhos, 7 h à apostila aberta sobre Pitágoras e áreas e à trilha de volume, 8 h aos exercícios com justificativas e variações, 4 h a escalas e geometria cartesiana e 3 h à revisão e atividade. Meça um ambiente e compare o desenho em escala com a área calculada, explicando possíveis erros de medição.</p>
<p>Estudo aberto: <a href="https://www.obmep.org.br/docs/apostila3.pdf">Teorema de Pitágoras e Áreas — OBMEP</a> e <a href="https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=56">Unidades de medida de volume — OBMEP/IMPA</a>.</p>`,
  },
  {
    id: 'me-20261027-aula-5',
    title: 'Estatística, Probabilidade e Análise de Dados',
    hours: 27,
    skills: ['me-estatistica', 'me-probabilidade'],
    inepSkills: ['H24', 'H27', 'H28', 'H29'],
    sourceIds: ['inep-habilidades', 'obmep-estatistica', 'obmep-probabilidade'],
    html: `
<h2>Descrever dados e analisar incerteza</h2>
<p>A população é o conjunto de interesse; uma amostra é uma parte observada. Uma pesquisa apenas com voluntários de um grupo específico pode não representar toda a população. Frequência absoluta conta ocorrências; frequência relativa divide essa contagem pelo total. Antes de comparar tabelas, confira se os grupos têm o mesmo tamanho e se as categorias foram definidas da mesma forma.</p>
<p>A média aritmética soma os valores e divide pela quantidade de observações. A mediana exige ordenar os dados: para quantidade ímpar, é o termo central; para quantidade par, é a média dos dois centrais. Moda é o valor mais frequente; pode haver mais de uma moda. A amplitude é máximo menos mínimo. Uma média isolada não descreve toda a distribuição.</p>
<h3>Exemplo resolvido 1 — medidas de posição</h3>
<p>Tempos de espera, em minutos: 4, 6, 6, 8 e 16. A média é 40/5 = 8; a mediana é 6; a moda é 6; a amplitude é 16 − 4 = 12. O tempo 16 eleva a média. Dizer que todas as pessoas esperaram oito minutos é falso: oito resume a soma por pessoa, sem apagar a variação.</p>
<h3>Exemplo resolvido 2 — frequências e média ponderada</h3>
<table><caption>Livros lidos em um mês por dez participantes</caption><thead><tr><th>Livros</th><th>Pessoas</th></tr></thead><tbody><tr><td>0</td><td>2</td></tr><tr><td>1</td><td>3</td></tr><tr><td>2</td><td>4</td></tr><tr><td>3</td><td>1</td></tr></tbody></table>
<p>O total de livros é 0 × 2 + 1 × 3 + 2 × 4 + 3 × 1 = 14. A média é 14/10 = 1,4 livro por pessoa. Leram pelo menos dois livros 4 + 1 = 5 pessoas, ou 50%. Para a mediana, expanda mentalmente as frequências: as posições 5 e 6 contêm 1 e 2; mediana = 1,5. Fazer a média simples de 0, 1, 2 e 3 ignoraria as frequências.</p>
<h3>Probabilidade e contagem</h3>
<p>Um experimento aleatório tem resultados possíveis descritos pelo espaço amostral. Um evento reúne resultados de interesse. Em um espaço finito equiprovável, P(evento) = casos favoráveis/casos possíveis. Essa razão exige que os resultados elementares tenham a mesma chance. A probabilidade fica entre 0 e 1; o evento complementar tem probabilidade 1 − P(evento).</p>
<h3>Exemplo resolvido 3 — retirada sem reposição</h3>
<p>Uma caixa contém quatro fichas verdes e duas amarelas, indistinguíveis ao tato. Todas têm a mesma chance de seleção. Ao retirar duas fichas sem reposição, a probabilidade de ambas serem verdes é (4/6) × (3/5) = 2/5 = 40%. Depois da primeira verde há três verdes entre cinco fichas. Usar 4/6 novamente presumiria reposição. Se houvesse reposição e nova mistura, seria (4/6)² = 4/9.</p>
<h3>Exemplo resolvido 4 — combinar escolhas e evitar dupla contagem</h3>
<p>Com quatro camisetas e três calças, existem 4 × 3 = 12 pares possíveis, escolhendo uma peça de cada tipo. Para escolher duas pessoas de um grupo de cinco sem distinguir cargos, existem (5 × 4)/2 = 10 duplas: cada par foi contado nas duas ordens. Já para presidente e vice há 5 × 4 = 20 escolhas, pois trocar os cargos muda o resultado.</p>
<p>Para eventos A e B, P(A ou B) = P(A) + P(B) − P(A e B). Se 12 de 30 alunos praticam futebol, 10 praticam vôlei e quatro praticam ambos, 12 + 10 − 4 = 18 praticam ao menos um; a probabilidade ao selecionar uniformemente um aluno é 18/30 = 60%. A subtração elimina a contagem duplicada da interseção.</p>
<h3>Pratique e confira</h3>
<ol><li>Calcule média, mediana, moda e amplitude de 2, 3, 3, 7, 10.</li><li>Uma turma tem duas notas 5, três notas 7 e cinco notas 9. Qual é a média?</li><li>Uma urna tem três bolas azuis e duas vermelhas, iguais exceto a cor. Qual é a probabilidade de retirar duas azuis sem reposição?</li><li>Quantos códigos de duas letras distintas podem ser formados com A, B, C e D, considerando a ordem?</li><li>Num dado honesto de seis faces, qual é a probabilidade de não sair um múltiplo de três?</li><li>De 40 entrevistados, 22 usam ônibus, 14 usam bicicleta e seis usam ambos. Quantos não usam nenhum desses meios?</li></ol>
<p><strong>Conferência:</strong> 1) Média 5; mediana 3; moda 3; amplitude 8. 2) (10 + 21 + 45)/10 = 7,6. 3) 3/5 × 2/4 = 3/10. 4) 4 × 3 = 12. 5) Quatro resultados entre seis: 2/3. 6) União 22 + 14 − 6 = 30; nenhum = 10. Explique quando a ordem ou a reposição alterou a resposta.</p>
<h3>Trilha de estudo — 27 horas</h3>
<p>Use 5 h na leitura e reprodução dos cálculos, 7 h nos módulos abertos de medidas de posição e probabilidade, 8 h em exercícios e tabelas com frequências, 4 h em contagem e análise de pesquisas e 3 h na revisão com atividade. Faça pequenas simulações com fichas para comparar frequência observada e probabilidade teórica; poucos sorteios não precisam reproduzir exatamente a proporção prevista.</p>
<p>Referências: <a href="https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=99">Estatística Básica I</a> e <a href="https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=46">Introdução à Probabilidade — OBMEP/IMPA</a>.</p>`,
  },
  {
    id: 'me-20261027-aula-6',
    title: 'Simulados, Estratégia de Prova e Revisão',
    hours: 27,
    skills: ['me-modelagem-integrada', 'me-revisao-quantitativa'],
    inepSkills: ['H4', 'H18', 'H21', 'H25', 'H28'],
    sourceIds: ['inep-matriz', 'inep-habilidades', 'obmep-afim', 'obmep-geometria', 'obmep-estatistica'],
    html: `
<h2>Aplicar, conferir e revisar</h2>
<p>Esta aula integra os conteúdos anteriores. Primeiro tente resolver os casos sem consultar a solução. Registre o que cada variável significa, a unidade da resposta e o motivo de escolher a operação. Depois confira a resolução. Classifique um erro como leitura, conceito, modelagem, cálculo ou unidade; essa classificação indica qual trecho retomar. Apenas memorizar a alternativa correta não prepara para um problema com novos números.</p>
<h3>Simulado comentado 1 — comparar preços e consumo</h3>
<p>Uma associação precisa comprar 12 kg de arroz. A embalagem A contém 2 kg por R$ 11,60 e a B contém 5 kg por R$ 28. Não é permitido comprar frações de pacote. Qual combinação atende à necessidade pelo menor custo?</p>
<p><strong>Solução:</strong> B custa R$ 5,60/kg e A custa R$ 5,80/kg, mas o pacote maior pode gerar sobra. Sem B, seis A custam R$ 69,60. Com um B, faltam 7 kg: quatro A fornecem 8 kg; total R$ 74,40. Com dois B, falta 2 kg: um A completa exatamente 12 kg; total 56 + 11,60 = R$ 67,60. Três B custam R$ 84. Mais pacotes B aumentam o custo. A combinação mínima é dois B e um A. Comparar apenas preço por quilograma não encerraria a decisão.</p>
<h3>Simulado comentado 2 — capacidade e crescimento</h3>
<p>Um reservatório tem 500 litros e recebe água à vazão constante de 40 litros por minuto, sem saída. Sua capacidade é 2.900 litros. Quanto tempo falta para encher?</p>
<p><strong>Solução:</strong> V(t) = 500 + 40t. No enchimento, 500 + 40t = 2.900; portanto t = 2.400/40 = 60 minutos. Dividir 2.900 por 40 ignoraria a água já presente. No domínio 0 ≤ t ≤ 60, o gráfico é um segmento de reta de (0, 500) a (60, 2.900). Após esse instante, a mesma regra não descreve o volume armazenado se houver transbordamento.</p>
<h3>Simulado comentado 3 — área, reserva e custo</h3>
<p>Um jardim retangular mede 8 m por 5 m. Há um canteiro triangular de base 4 m e altura perpendicular de 3 m, totalmente dentro dele. A parte restante receberá grama vendida a R$ 12/m². Sem reserva e sem desperdício, qual será o custo?</p>
<p><strong>Solução:</strong> A área total é 40 m²; a do triângulo é 4 × 3/2 = 6 m². Restam 34 m². Custo = 34 × 12 = R$ 408. Se houvesse reserva de 5% sobre a área de grama, compraríamos 35,7 m² e pagaríamos R$ 428,40. A unidade confirma que multiplicamos área por reais por metro quadrado, produzindo reais.</p>
<h3>Simulado comentado 4 — distribuição e probabilidade</h3>
<p>Em um grupo de 20 estudantes, os números de acertos num treino foram: quatro estudantes com 6 acertos, dez com 8 e seis com 10. Qual é a média e a probabilidade de um estudante escolhido uniformemente ter pelo menos oito acertos?</p>
<p><strong>Solução:</strong> Total de acertos = 4 × 6 + 10 × 8 + 6 × 10 = 164. Média = 164/20 = 8,2. O evento “pelo menos oito” inclui as categorias 8 e 10: (10 + 6)/20 = 0,8 = 80%. Não se deve calcular (6 + 8 + 10)/3, pois as frequências são diferentes. Se o sorteio favorecesse algum estudante, a razão simples de contagens precisaria ser revista.</p>
<h3>Treino autônomo antes da atividade</h3>
<ol><li>Uma empresa cobra R$ 15 fixos e R$ 6 por hora de aluguel. Com R$ 69, quantas horas inteiras podem ser pagas?</li><li>Um tanque com base 3 m por 2 m recebe 1.200 litros. Quanto sobe o nível?</li><li>Um curso tem 40 participantes. Em uma pesquisa, 18 preferem estudar pela manhã, 12 à tarde e dez à noite. Qual a participação do turno noturno e qual a diferença em pontos percentuais entre manhã e noite?</li><li>Um produto de R$ 160 recebe desconto de 15% e frete de R$ 12. Qual é o custo total?</li><li>Escolhem-se aleatoriamente duas fichas sem reposição de uma caixa com cinco fichas numeradas de 1 a 5. Qual a probabilidade de ambas serem pares?</li><li>Um quadrado tem diagonal 10√2 cm. Determine sua área.</li></ol>
<p><strong>Conferência:</strong> 1) (69 − 15)/6 = 9 h. 2) 1,2/6 = 0,2 m. 3) 25%; manhã 45%, diferença 20 pontos percentuais. 4) 160 × 0,85 + 12 = R$ 148. 5) 2/5 × 1/4 = 1/10. 6) Lado 10 cm, área 100 cm². Refaça com outros valores, conservando as condições do enunciado.</p>
<h3>Como revisar o resultado</h3>
<p>Uma resposta probabilística maior que 100%, uma quantidade negativa de pacotes ou uma altura maior que a hipotenusa revelam incompatibilidades. Verifique a ordem de grandeza, substitua o valor no modelo e, quando possível, use um segundo caminho: área por decomposição, porcentagem por fração ou equação por tabela. Num treino cronometrado, registre o tempo gasto por problema e retome os que exigiram mais leitura; o objetivo da revisão é tornar o raciocínio compreensível e reproduzível.</p>
<h3>Trilha de estudo — 27 horas</h3>
<p>Reserve 4 h para os quatro simulados comentados, 8 h para resolver e criar variações dos treinos, 6 h para refazer sem consulta os problemas em que errou nas cinco aulas anteriores, 5 h para exercícios das fontes abertas relacionados aos erros encontrados e 4 h para revisão final e avaliações. A prova do curso usa situações novas com os mesmos conceitos. Ela é uma avaliação interna desta revisão, sem reproduzir a escala ou a forma de cálculo da nota oficial do Enem.</p>
<p>Retome os materiais abertos: <a href="https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=35">função afim</a>, <a href="https://www.obmep.org.br/docs/apostila3.pdf">geometria</a> e <a href="https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=99">estatística — OBMEP/IMPA</a>. Problemas e resoluções desta revisão são originais.</p>`,
  },
];
