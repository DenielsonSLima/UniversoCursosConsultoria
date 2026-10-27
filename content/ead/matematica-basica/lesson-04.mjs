import { referenceHtml } from './sources.mjs';

const sourceIds = ['mb-obmep-geometria', 'mb-obmep-medidas'];

export const lesson04 = {
  id: 'mb-20261027-aula4',
  title: 'Geometria: ângulos, perímetro, área e unidades',
  hours: 16,
  skills: [
    'Reconhecer e calcular ângulos em situações simples.',
    'Distinguir e calcular perímetros e áreas de retângulos e triângulos.',
    'Converter unidades de comprimento e de área preservando a grandeza.',
  ],
  sourceIds,
  html: `
<h2>Geometria: ângulos, perímetro, área e unidades</h2>
<p>A geometria permite descrever formas e resolver problemas de medida. Você irá
trabalhar com ângulos, comprimentos e superfícies. Um desenho ajuda a organizar
o raciocínio, mas não substitui os dados: uma figura fora de escala não autoriza
concluir que dois lados ou dois ângulos são iguais.</p>
<h3>1. Retas, segmentos e ângulos</h3>
<p>Uma reta é considerada ilimitada nos dois sentidos; um segmento tem dois extremos
e pode ter seu comprimento medido. No mesmo plano, duas retas distintas paralelas
não se encontram. Retas perpendiculares se encontram formando ângulos retos.
Nem todo encontro de retas é perpendicular: duas retas podem se cruzar formando
ângulos de 40° e 140°.</p>
<p>Um ângulo é determinado por duas semirretas de mesma origem, chamada vértice.
Uma volta completa mede 360°; meia volta mede 180°; um quarto de volta mede 90°.
Ângulos maiores que 0° e menores que 90° são agudos; o de 90° é reto; os maiores
que 90° e menores que 180° são obtusos. O ângulo de 180° é raso.</p>
<h3>Exemplo resolvido 1 — relógio e volta</h3>
<p>Às 3h exatas, qual é o menor ângulo entre os ponteiros de um relógio analógico?
O mostrador tem 12 intervalos iguais: cada um vale 360° ÷ 12 = 30°.
Entre 12 e 3 há 3 intervalos, então 3 × 30° = <strong>90°</strong>.
É um ângulo reto. Às 2h exatas, seriam 2 × 30° = 60°, um ângulo agudo.
Para horários que não são horas exatas, o ponteiro das horas também se move;
esta conta simplificada precisa ser ajustada.</p>
<p>Em um triângulo plano, a soma dos ângulos internos é 180°. Se dois deles medem
50° e 60°, o terceiro mede 180° − 50° − 60° = 70°. Classifique sem confundir
ângulos com lados: equilátero tem três lados iguais; isósceles tem pelo menos dois
lados iguais; escaleno tem os três lados diferentes.</p>
<h3>2. Perímetro e área são grandezas diferentes</h3>
<p>Perímetro mede o comprimento do contorno. Para um polígono, some os comprimentos
de todos os lados, usando a mesma unidade. Área mede a extensão da superfície
e é expressa em unidades quadradas. Contar quantos quadrados de 1 m por 1 m
cobrem uma região ajuda a entender por que a unidade de área é m².</p>
<h3>Exemplo resolvido 2 — cercar e cobrir</h3>
<p>Um quintal retangular tem 7 m de comprimento e 5 m de largura. Para cercar
todo o contorno, são necessários 7 + 5 + 7 + 5 = <strong>24 m</strong> de cerca.
Para cobrir o chão, a área é 7 × 5 = <strong>35 m²</strong>. A multiplicação
conta 5 fileiras com 7 quadrados de 1 m². Responder 35 m de cerca trocaria
área por comprimento. Se existir um portão sem cerca, desconte sua largura
do perímetro, e não da área do chão.</p>
<p>No quadrado de lado l, perímetro = 4 × l e área = l × l.
No retângulo de base b e altura h, perímetro = 2 × (b + h) e área = b × h.
Dobrar o lado de um quadrado dobra seu perímetro, mas multiplica sua área por 4:
o quadrado de lado 2 tem área 4, e o de lado 4 tem área 16.</p>
<h3>Exemplo resolvido 3 — área de triângulo</h3>
<p>Uma placa triangular tem base de 6 cm e altura perpendicular à base de 4 cm.
Sua área é (6 × 4) ÷ 2 = <strong>12 cm²</strong>. Dois triângulos iguais
desse tipo podem compor um paralelogramo de mesma base e altura, explicando
a divisão por 2. A altura deve ser perpendicular à base; um lado inclinado
não pode ser usado como altura sem que o enunciado garanta essa condição.</p>
<h3>3. Converter sem misturar grandezas</h3>
<p>Como 1 m = 100 cm, converta metros em centímetros multiplicando por 100;
para o caminho inverso, divida por 100. Já 1 m² = 10.000 cm²: um quadrado
de 1 m de lado tem 100 cm em cada direção, logo 100 × 100 quadradinhos
de 1 cm². Comprimentos e áreas não usam o mesmo fator de conversão.</p>
<h3>Exemplo resolvido 4 — medidas antes da fórmula</h3>
<p>Uma mesa mede 1,2 m por 80 cm. Converta 80 cm em 0,8 m e só então calcule:
área = 1,2 × 0,8 = <strong>0,96 m²</strong>. Em centímetros, a mesma conta
seria 120 × 80 = 9.600 cm². A igualdade 0,96 × 10.000 = 9.600 confirma
a conversão. Multiplicar 1,2 por 80 sem tratar as unidades não fornece uma
resposta diretamente em m².</p>
<h3>Treino com conferência</h3>
<ol>
<li>Qual é o menor ângulo entre os ponteiros às 5h exatas? Classifique-o.</li>
<li>Um triângulo tem ângulos de 45° e 65°. Quanto mede o terceiro?</li>
<li>Um retângulo tem lados de 9 m e 4 m. Calcule perímetro e área.</li>
<li>Um triângulo tem base 10 cm e altura perpendicular de 7 cm. Qual é a área?</li>
<li>Converta 2,35 m em cm e 450 cm em m.</li>
<li>Converta 2 m² em cm². Calcule a área de uma placa de 50 cm por 0,4 m em m².</li>
</ol>
<h3>Confira depois de tentar</h3>
<p>1) 5 × 30° = 150°, obtuso. 2) 180° − 45° − 65° = 70°.
3) 26 m e 36 m². 4) 10 × 7/2 = 35 cm².
5) 235 cm e 4,5 m. 6) 20.000 cm²; 0,5 × 0,4 = 0,20 m².</p>
<h3>Estudo e aplicação</h3>
<p>Desenhe uma planta retangular fictícia, indique medidas e estime quanto material
seria necessário para o rodapé e para o piso. Justifique qual conta responde
a cada necessidade. Depois divida um retângulo por uma diagonal e compare suas
áreas triangulares. Faça novos exercícios de medidas no material complementar,
conferindo a unidade de todas as respostas.</p>
` + referenceHtml(sourceIds),
};
