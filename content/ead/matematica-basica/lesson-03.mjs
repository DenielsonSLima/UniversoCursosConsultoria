import { referenceHtml } from './sources.mjs';

const sourceIds = ['mb-obmep-proporcoes', 'mb-obmep-percentual-probabilidade'];

export const lesson03 = {
  id: 'mb-20261027-aula3',
  title: 'Razões, proporções e porcentagens no cotidiano',
  hours: 16,
  skills: [
    'Resolver situações de proporcionalidade direta e distinguir relações não proporcionais.',
    'Calcular porcentagens, descontos e acréscimos sobre uma base identificada.',
    'Determinar uma quantidade total a partir de uma porcentagem conhecida.',
  ],
  sourceIds,
  html: `
<h2>Razões, proporções e porcentagens no cotidiano</h2>
<p>Frações ajudam a comparar grandezas e calcular partes de um total. Nesta aula,
você irá usar razões, reconhecer quando uma regra de três é adequada e calcular
porcentagens. Em toda conta, registre a unidade e identifique qual quantidade
representa o total de referência.</p>
<h3>1. Razão e proporcionalidade direta</h3>
<p>Uma razão compara duas quantidades por divisão. Se uma receita pede 2 xícaras
de arroz para 6 pessoas, são 2/6 = 1/3 de xícara por pessoa. Numa relação
diretamente proporcional, multiplicar uma grandeza por um fator multiplica
a outra pelo mesmo fator: o quociente permanece constante.</p>
<h3>Exemplo resolvido 1 — ampliar uma receita</h3>
<p>A receita de 2 xícaras para 6 pessoas será feita para 15 pessoas, mantendo
o mesmo consumo por pessoa. Uma pessoa corresponde a 2/6 de xícara; portanto,
15 × (2/6) = <strong>5 xícaras</strong>. Também poderíamos usar o fator
15/6 = 2,5 e multiplicar 2 × 2,5 = 5. Confira: 5/15 = 2/6.</p>
<p>A hipótese de proporcionalidade precisa fazer sentido. Se uma corrida custa
R$ 6,00 fixos mais R$ 2,00 por quilômetro, 3 km custam R$ 12,00 e 6 km custam
R$ 18,00. Dobrar a distância não dobra o preço por causa da parte fixa.
Não use regra de três automaticamente em qualquer tabela.</p>
<h3>Exemplo resolvido 2 — preço por unidade</h3>
<p>Quatro cadernos iguais custam R$ 28,00, sem descontos por quantidade.
Cada caderno custa 28 ÷ 4 = R$ 7,00. Sete custam 7 × 7 =
<strong>R$ 49,00</strong>. A razão preço/quantidade é constante, R$ 7,00 por unidade.
Se uma promoção mudasse o preço a partir do quinto caderno, essa mesma conta
precisaria ser adaptada à nova regra.</p>
<h3>2. Porcentagem é uma razão por cem</h3>
<p>Porcentagem significa uma razão com denominador 100. Assim, 25% = 25/100 = 1/4
e 12% = 0,12. Para calcular p% de um total T, multiplique T por p/100.
Também é possível usar parcelas: 10% é a décima parte; 5% é a metade de 10%.
Sempre pergunte: porcentagem de quê? O mesmo percentual aplicado a bases
diferentes produz quantidades diferentes.</p>
<h3>Exemplo resolvido 3 — desconto</h3>
<p>Uma mochila de R$ 160,00 tem desconto de 15%. Dez por cento são R$ 16,00 e
cinco por cento são R$ 8,00. Desconto total: R$ 24,00. Preço final:
160 − 24 = <strong>R$ 136,00</strong>. De outra forma, paga-se 85% do preço:
160 × 0,85 = 136. Não subtraia 15 reais: 15% é uma proporção, não um valor fixo.</p>
<h3>Exemplo resolvido 4 — acréscimo e base</h3>
<p>Uma inscrição de R$ 80,00 aumenta 20%. O acréscimo é 80 × 0,20 = R$ 16,00,
e o novo valor é <strong>R$ 96,00</strong>. Um desconto posterior de 20%
incidiria sobre 96, não sobre 80: 96 × 0,80 = R$ 76,80. Por isso, aumento
e desconto de mesmo percentual não se anulam em sequência.</p>
<h3>3. Descobrir o total</h3>
<p>Se sabemos uma parte e seu percentual, podemos encontrar o inteiro. Escreva
a relação entre parte e total antes de escolher a operação. Para conferir,
aplique o percentual ao total encontrado e verifique se recupera a parte informada.</p>
<h3>Exemplo resolvido 5 — percentual conhecido</h3>
<p>Em uma turma, 12 estudantes correspondem a 30% do total. Se T é o total,
0,30 × T = 12, então T = 12 ÷ 0,30 = <strong>40 estudantes</strong>.
Verificação: 30% de 40 = 0,30 × 40 = 12. Multiplicar 12 por 0,30 encontraria
30% da parte, não o total da turma.</p>
<h3>Treino com conferência</h3>
<ol>
<li>Três garrafas iguais custam R$ 18,00. Quanto custam 8, mantendo o preço unitário?</li>
<li>Para 4 pessoas, uma receita usa 300 g de farinha. Quanto usará para 10?</li>
<li>Calcule 25% de 72 e 12% de 150.</li>
<li>Um livro de R$ 90,00 tem desconto de 10%. Qual é o novo preço?</li>
<li>Um plano de R$ 50,00 aumenta 8%. Qual é o valor após o aumento?</li>
<li>Vinte e um participantes representam 35% de um grupo. Quantos há no grupo?</li>
</ol>
<h3>Confira depois de tentar</h3>
<p>1) 18/3 × 8 = R$ 48,00. 2) 300/4 × 10 = 750 g.
3) 18 e 18. 4) 90 × 0,90 = R$ 81,00. 5) 50 × 1,08 = R$ 54,00.
6) 21/0,35 = 60 participantes.</p>
<h3>Estudo e aplicação</h3>
<p>Monte uma tabela de quantidades e preços para um produto sem promoção e confira
se a razão permanece constante. Crie uma segunda tabela com taxa fixa e explique
por que ela não representa proporcionalidade direta. Escolha três preços fictícios,
aplique descontos diferentes e determine o percentual que cada desconto representa.
Complete os exercícios complementares anotando a base de cada percentual.</p>
` + referenceHtml(sourceIds),
};
