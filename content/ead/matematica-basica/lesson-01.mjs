import { referenceHtml } from './sources.mjs';

const sourceIds = ['mb-obmep-operacoes'];

export const lesson01 = {
  id: 'mb-20261027-aula1',
  title: 'Operações, números decimais e resolução de problemas',
  hours: 16,
  skills: [
    'Resolver situações com as quatro operações e conferir o resultado.',
    'Calcular expressões respeitando a prioridade das operações.',
    'Resolver cálculos com números decimais em situações de medida e dinheiro.',
  ],
  sourceIds,
  html: `
<h2>Operações, números decimais e resolução de problemas</h2>
<p>Ao terminar esta aula, você deverá escolher operações a partir de um enunciado,
resolver contas com naturais e decimais e verificar se o resultado faz sentido.
Tenha papel e lápis: antes de ler cada solução, tente construir seu próprio caminho.</p>
<h3>1. O que cada operação representa</h3>
<p>A adição reúne quantidades; a subtração pode indicar retirada, diferença ou quanto
falta. A multiplicação representa grupos de mesmo tamanho e também combinações.
A divisão permite repartir igualmente ou descobrir quantos grupos cabem em uma
quantidade. Um problema pode exigir mais de uma operação; procurar apenas palavras
como “ganhou” ou “perdeu” não substitui entender o que está sendo perguntado.</p>
<p>O sistema decimal é posicional: em 2.305, o algarismo 3 vale 300. Na forma decimal,
3,47 = 3 + 4/10 + 7/100. Assim, 3,5 e 3,50 representam a mesma quantidade.
Para somar ou subtrair decimais, alinhe as vírgulas, pois unidades devem ficar sob
unidades, décimos sob décimos. Complete com zeros quando necessário.</p>
<h3>Exemplo resolvido 1 — grupos e resto</h3>
<p>Uma escola recebeu 156 lápis e distribuiu 12 para cada uma de 9 turmas. Quantos
sobraram? Primeiro calcule o distribuído: 9 × 12 = 108. Depois retire esse total:
156 − 108 = <strong>48 lápis</strong>. Verificação: 108 + 48 = 156.
Dividir 156 por 9 responderia outra pergunta: quanto cada turma receberia se toda
a quantidade fosse distribuída igualmente.</p>
<p>Na divisão de naturais com resto, dividendo = divisor × quociente + resto,
com o resto menor que o divisor. Por exemplo, 29 = 6 × 4 + 5: são 4 grupos completos
de 6 e sobram 5. Divisão por zero não é definida; não há um número de grupos de
tamanho zero que forme uma quantidade positiva.</p>
<h3>2. Ordem de cálculo</h3>
<p>Resolva primeiro os parênteses, depois potências, em seguida multiplicações e
divisões e, por fim, adições e subtrações. Operações de mesma prioridade são feitas
da esquerda para a direita. A potência 2³ significa 2 × 2 × 2 = 8; não significa
2 × 3. Parênteses podem mudar o resultado e precisam ser respeitados.</p>
<h3>Exemplo resolvido 2 — expressão</h3>
<p>Calcule 30 − 2 × (4 + 5). O parêntese vale 9. A multiplicação vale 18.
Portanto, 30 − 18 = <strong>12</strong>. Se fizéssemos 30 − 2 primeiro, estaríamos
mudando a expressão. Em 24 ÷ 3 × 2, faça 24 ÷ 3 = 8 e depois 8 × 2 = 16.</p>
<h3>3. Cálculos com vírgula</h3>
<p>Na multiplicação de decimais, pode-se calcular com inteiros e depois ajustar as
casas decimais. Em 1,2 × 0,3, faça 12 × 3 = 36 e use duas casas: 0,36.
Na divisão, multiplicar dividendo e divisor pelo mesmo número diferente de zero
mantém o quociente: 4,8 ÷ 0,6 = 48 ÷ 6 = 8. A vírgula não é simplesmente apagada
de um número só. Compare também a ordem de grandeza: 1,2 × 0,3 é menor que 1,2.</p>
<h3>Exemplo resolvido 3 — compra e troco</h3>
<p>Três cadernos custam R$ 7,40 cada e uma caneta custa R$ 2,80. Pagando com R$ 30,00,
qual é o troco? Cadernos: 3 × 7,40 = 22,20. Compra: 22,20 + 2,80 = 25,00.
Troco: 30,00 − 25,00 = <strong>R$ 5,00</strong>. Uma estimativa, 3 × 7,50 + 3,00,
produz R$ 25,50 e confirma que o total exato está numa faixa razoável.</p>
<h3>Exemplo resolvido 4 — repartir uma medida</h3>
<p>Uma fita de 7,5 m será dividida em 5 partes iguais. Cada parte mede
7,5 ÷ 5 = <strong>1,5 m</strong>. Confira multiplicando: 5 × 1,5 = 7,5.
A resposta 15 m seria impossível: cada parte não pode ser maior que a fita inteira.</p>
<h3>4. Treino com conferência</h3>
<ol>
<li>Uma caixa tem 8 pacotes de 15 folhas. Após usar 37 folhas, quantas restam?</li>
<li>Calcule 42 − 3 × (2 + 6).</li>
<li>Calcule 18 ÷ 3 × 2 + 1.</li>
<li>Some 4,75 e 2,8; depois subtraia 1,35.</li>
<li>Uma corda de 9,6 m é cortada em 8 partes iguais. Qual é cada medida?</li>
<li>Calcule 2,4 × 0,5 e 6,3 ÷ 0,9. Explique o ajuste das casas decimais.</li>
</ol>
<h3>Confira depois de tentar</h3>
<p>1) 8 × 15 − 37 = 120 − 37 = 83 folhas.
2) 42 − 3 × 8 = 18. 3) 6 × 2 + 1 = 13.
4) 7,55 − 1,35 = 6,20. 5) 1,2 m, pois 8 × 1,2 = 9,6.
6) 1,20 e 7; na divisão, 6,3/0,9 = 63/9.</p>
<h3>Estudo e aplicação</h3>
<p>Registre um orçamento fictício com cinco produtos, suas quantidades e preços.
Calcule o total, o troco de um pagamento e uma estimativa. Depois mude duas
quantidades e refaça as contas. Resolva também exercícios do material complementar,
anotando quais erros vieram da interpretação e quais vieram do cálculo.
A carga horária do módulo inclui esse estudo, prática, revisão e avaliação;
a leitura desta página é uma parte do percurso.</p>
` + referenceHtml(sourceIds),
};
