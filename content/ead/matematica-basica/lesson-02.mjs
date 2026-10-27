import { referenceHtml } from './sources.mjs';

const sourceIds = ['mb-obmep-fracoes', 'mb-obmep-operacoes'];

export const lesson02 = {
  id: 'mb-20261027-aula2',
  title: 'Frações: equivalência, comparação e operações',
  hours: 16,
  skills: [
    'Representar e comparar frações equivalentes do mesmo inteiro.',
    'Somar e subtrair frações com denominadores diferentes.',
    'Resolver problemas de fração de uma quantidade e de divisão de frações.',
  ],
  sourceIds,
  html: `
<h2>Frações: equivalência, comparação e operações</h2>
<p>Uma fração pode representar uma parte de um inteiro, o resultado de uma divisão
ou uma razão entre quantidades. Nesta aula você irá representar essas ideias,
comparar quantidades e operar com elas. Desenhe barras ou círculos divididos
em partes iguais para conferir o significado das contas.</p>
<h3>1. Numerador, denominador e inteiro de referência</h3>
<p>Em 3/4, o denominador 4 indica em quantas partes iguais o inteiro foi dividido;
o numerador 3 informa quantas dessas partes são consideradas. O denominador não
pode ser zero. Para comparar pedaços de pizzas, é preciso saber se as pizzas têm
o mesmo tamanho: metade de uma pizza grande pode superar três quartos de uma pequena.
Nas comparações numéricas desta aula, o inteiro de referência é o mesmo.</p>
<p>Frações não precisam ser menores que 1: 7/4 = 1 + 3/4. A escrita a/b também indica
a divisão a ÷ b. Por isso, 3/4 = 0,75 e 1/2 = 0,5. Na reta numérica, 3/4 fica
entre 0 e 1, enquanto 7/4 fica entre 1 e 2.</p>
<h3>Exemplo resolvido 1 — equivalência e comparação</h3>
<p>Compare 2/3 e 3/4. Divida ambos os inteiros em 12 partes: 2/3 = 8/12
e 3/4 = 9/12. Como 8 é menor que 9, <strong>2/3 é menor que 3/4</strong>.
Multiplicar numerador e denominador pelo mesmo número não nulo preserva o valor.
O processo inverso simplifica a fração: 18/24 = 3/4, dividindo ambos por 6.</p>
<p>Se os denominadores são iguais e positivos, compare os numeradores. Se os
numeradores são iguais e positivos, a fração de menor denominador é maior:
1/3 é maior que 1/5 porque o mesmo inteiro foi dividido em menos partes.
Não use essa última regra quando os numeradores forem diferentes.</p>
<h3>2. Adição e subtração: peças do mesmo tamanho</h3>
<p>Podemos somar diretamente numeradores apenas quando os denominadores são iguais:
2/7 + 3/7 = 5/7. Com denominadores diferentes, encontre frações equivalentes
com um denominador comum. Usar o menor múltiplo comum costuma deixar os números
menores, mas qualquer múltiplo comum positivo serve. Somar denominadores é um erro:
1/2 + 1/2 é 1 inteiro, e não 2/4.</p>
<h3>Exemplo resolvido 2 — duas partes de uma trilha</h3>
<p>Uma estudante percorreu 1/2 de uma trilha pela manhã e 1/3 à tarde. Quanto percorreu
e quanto falta? Como 1/2 = 3/6 e 1/3 = 2/6, ela percorreu
3/6 + 2/6 = <strong>5/6</strong>. Falta 1 − 5/6 = 6/6 − 5/6 =
<strong>1/6</strong>. A soma é menor que 1, coerente com uma trilha ainda incompleta.</p>
<h3>3. Fração de uma quantidade e multiplicação</h3>
<p>Calcular a/b de uma quantidade significa dividi-la por b e multiplicar por a.
Também podemos multiplicar a quantidade por a/b. O produto de duas frações usa
numerador vezes numerador e denominador vezes denominador. Por exemplo,
2/3 de 3/5 é (2 × 3)/(3 × 5) = 6/15 = 2/5.</p>
<h3>Exemplo resolvido 3 — livros de uma estante</h3>
<p>Uma estante tem 40 livros, dos quais 3/5 são de literatura. Divida 40 em 5 grupos:
40 ÷ 5 = 8. Considere 3 grupos: 3 × 8 = <strong>24 livros</strong>.
Os demais são 40 − 24 = 16, equivalentes a 2/5 do total.</p>
<h3>4. Divisão de frações</h3>
<p>Dividir pode significar descobrir quantas vezes uma medida cabe em outra.
Dividir por uma fração não nula equivale a multiplicar por sua inversa.
Em (3/4) ÷ (2/5), calculamos (3/4) × (5/2) = 15/8.
O resultado pode ser maior que a quantidade inicial quando o divisor é menor que 1:
cabem duas meias unidades em uma unidade.</p>
<h3>Exemplo resolvido 4 — porções de suco</h3>
<p>Uma jarra contém 3/2 de litro de suco. Quantas porções de 1/4 de litro é possível
servir? (3/2) ÷ (1/4) = (3/2) × 4 = <strong>6 porções</strong>.
Confira: 6 × 1/4 = 6/4 = 3/2 de litro. Não inverta a primeira fração nem ambas:
a inversa usada é a do divisor.</p>
<h3>Treino com conferência</h3>
<ol>
<li>Simplifique 12/18 e escreva uma fração equivalente com denominador 9.</li>
<li>Qual é maior: 5/6 ou 7/9? Mostre um denominador comum.</li>
<li>Calcule 2/3 + 1/4.</li>
<li>Uma receita usa 7/8 de xícara; já foram colocados 1/2. Quanto falta?</li>
<li>Quanto é 3/8 de 48? E 2/3 de 3/4?</li>
<li>Quantas porções de 1/3 de litro cabem em 2 litros?</li>
</ol>
<h3>Confira depois de tentar</h3>
<p>1) 2/3 e 6/9. 2) 5/6 = 15/18 é maior que 7/9 = 14/18.
3) 8/12 + 3/12 = 11/12. 4) 7/8 − 4/8 = 3/8.
5) 18; (2 × 3)/(3 × 4) = 1/2. 6) 2 × 3 = 6 porções.</p>
<h3>Estudo e aplicação</h3>
<p>Desenhe barras para três pares de frações equivalentes. Crie duas situações
de receita ou repartição: uma que exija adição e outra que exija divisão.
Resolva-as com desenho e cálculo, identificando sempre o inteiro de referência.
Amplie a prática com os exercícios do Portal da OBMEP. Antes da atividade avaliativa,
refaça sem consulta um exercício de cada operação.</p>
` + referenceHtml(sourceIds),
};
