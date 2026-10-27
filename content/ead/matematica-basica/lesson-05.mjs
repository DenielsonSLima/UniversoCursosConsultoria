import { referenceHtml } from './sources.mjs';

const sourceIds = ['mb-obmep-estatistica', 'mb-obmep-percentual-probabilidade'];

export const lesson05 = {
  id: 'mb-20261027-aula5',
  title: 'Leitura de dados, médias e probabilidade simples',
  hours: 16,
  skills: [
    'Interpretar tabelas de frequências e calcular a participação de uma categoria.',
    'Calcular e interpretar média, mediana e moda de conjuntos pequenos.',
    'Calcular probabilidades em espaços amostrais finitos equiprováveis.',
  ],
  sourceIds,
  html: `
<h2>Leitura de dados, médias e probabilidade simples</h2>
<p>Nesta aula, as operações, frações e porcentagens serão usadas para interpretar
informações. Você irá organizar dados, calcular medidas de resumo e encontrar
probabilidades em situações simples. Dados fictícios serão usados nos exemplos;
as conclusões valem para esses conjuntos e não descrevem uma população real.</p>
<h3>1. Ler antes de calcular</h3>
<p>Uma tabela informa categorias ou valores e suas quantidades, chamadas frequências
absolutas. A frequência relativa é a quantidade de uma categoria dividida pelo total.
Se todos os casos estão classificados em categorias que não se sobrepõem,
as frequências absolutas somam o total e as relativas somam 1, ou 100%.
Observe sempre título, período, unidade e fonte antes de comparar números.</p>
<h3>Exemplo resolvido 1 — tabela de frequência</h3>
<p>Uma consulta fictícia perguntou a 20 estudantes como chegam à escola.
Cada estudante escolheu uma única opção:</p>
<table><thead><tr><th>Meio de transporte</th><th>Estudantes</th></tr></thead>
<tbody><tr><td>A pé</td><td>8</td></tr><tr><td>Ônibus</td><td>7</td></tr>
<tr><td>Bicicleta</td><td>5</td></tr></tbody></table>
<p>Confira o total: 8 + 7 + 5 = 20. A participação dos que vão a pé é
8/20 = 0,40 = <strong>40%</strong>. Ônibus supera bicicleta em 7 − 5 =
<strong>2 estudantes</strong>. Não confunda essa diferença com 2%: em relação
ao total, as participações são 35% e 25%, uma diferença de 10 pontos percentuais.</p>
<p>Num gráfico de barras, compare comprimentos usando a escala do eixo. Um eixo
que começa acima de zero pode ampliar visualmente pequenas diferenças.
Num gráfico de linhas, o eixo horizontal geralmente organiza uma sequência,
como dias, e permite observar variações. A tabela ou o gráfico, sozinho,
não explica as causas de uma mudança nem prova que uma variável provoca outra.</p>
<h3>2. Média aritmética, mediana e moda</h3>
<p>A média aritmética é a soma dos valores dividida pela quantidade de valores.
Ela pode ser vista como uma repartição igual do total. A mediana é o valor central
depois de ordenar os dados; quando há dois centrais, use a média desses dois.
A moda é o valor mais frequente. Pode haver mais de uma moda, e um conjunto
pode não ter uma moda que o destaque.</p>
<h3>Exemplo resolvido 2 — resumir um conjunto</h3>
<p>As quantidades de páginas lidas em cinco dias foram 4, 6, 6, 9 e 10.
A soma é 35; a média é 35/5 = <strong>7 páginas por dia</strong>.
Na lista ordenada, o terceiro valor é a mediana: <strong>6</strong>.
A moda também é <strong>6</strong>, pois aparece duas vezes.
Ninguém precisou ler exatamente 7 páginas em um dos dias para a média ser 7.</p>
<h3>Exemplo resolvido 3 — dois valores centrais e um extremo</h3>
<p>Para os tempos 2, 3, 5 e 10 minutos, a média é 20/4 = 5 minutos.
A mediana é (3 + 5)/2 = <strong>4 minutos</strong>. Se o último tempo mudar
de 10 para 30, a média sobe para 40/4 = 10, mas a mediana continua 4.
Isso mostra por que uma média isolada pode esconder a distribuição dos dados.
Ao comparar grupos, verifique também quantidade de observações e valores extremos.</p>
<h3>3. Probabilidade: casos possíveis e favoráveis</h3>
<p>O espaço amostral reúne os resultados possíveis de uma experiência. Um evento
é um conjunto de resultados de interesse. Quando todos os resultados são igualmente
prováveis, probabilidade = número de casos favoráveis/número de casos possíveis.
Essa condição é essencial: contar faces de um dado viciado, por exemplo,
não garante que cada uma tenha a mesma chance.</p>
<h3>Exemplo resolvido 4 — dado equilibrado</h3>
<p>Um dado equilibrado tem faces numeradas de 1 a 6. Qual é a probabilidade de sair
um número maior que 4? Os resultados favoráveis são 5 e 6: são 2 dentre 6.
Logo, P = 2/6 = <strong>1/3</strong>. O evento não é impossível nem certo.
Mesmo repetindo o lançamento, não há obrigação de ocorrer exatamente uma vez
a cada três jogadas.</p>
<h3>Exemplo resolvido 5 — sorteio de uma ficha</h3>
<p>Uma caixa contém 3 fichas amarelas e 2 azuis, de mesmo tamanho e material,
bem misturadas e sem identificação ao tato. Retira-se uma ficha ao acaso.
A chance de azul é 2/5 = 0,4 = <strong>40%</strong>. A de não azul é
3/5 = 60%. As duas somam 100%. Essas probabilidades descrevem uma retirada;
para várias retiradas, seria preciso dizer se a ficha volta à caixa.</p>
<h3>Treino com conferência</h3>
<ol>
<li>Uma tabela tem frequências 6, 9 e 15. Qual é o total e o percentual da última categoria?</li>
<li>Calcule a média de 3, 5, 7 e 9.</li>
<li>Determine mediana e moda de 2, 8, 4, 4 e 7.</li>
<li>Qual é a mediana de 1, 3, 8 e 12?</li>
<li>Num dado equilibrado de 1 a 6, qual é a chance de um número par?</li>
<li>Há 4 fichas verdes e 6 brancas equiprováveis. Qual é a chance de retirar uma verde?</li>
</ol>
<h3>Confira depois de tentar</h3>
<p>1) 30; 15/30 = 50%. 2) 24/4 = 6. 3) Ordene 2, 4, 4, 7, 8:
mediana 4, moda 4. 4) (3 + 8)/2 = 5,5.
5) 3/6 = 1/2 = 50%. 6) 4/10 = 2/5 = 40%.</p>
<h3>Estudo e aplicação</h3>
<p>Crie uma tabela fictícia de livros lidos por dez estudantes. Calcule média,
mediana e moda, e desenhe um gráfico de barras com título e escala legível.
Depois faça 30 lançamentos de uma moeda, registre a frequência de cada face e
compare as frequências com a probabilidade teórica de 1/2 para uma moeda equilibrada.
Uma diferença nessa pequena experiência é esperada e não prova que a moeda é viciada.
Revise os exercícios em que errou antes de responder à atividade e à prova.</p>
` + referenceHtml(sourceIds),
};
