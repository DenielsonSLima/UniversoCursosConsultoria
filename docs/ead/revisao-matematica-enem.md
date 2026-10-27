# Revisão de Matemática para Enem — 27/10/2026

Revisão `me-20261027`, preparada para o curso existente de 160 horas. O material é destinado a estudantes e organiza uma revisão introdutória de fundamentos e problemas contextualizados. Não afirma esgotar a matriz do Enem nem reproduzir sua escala de notas.

## Evidência que motivou a revisão

Consulta somente leitura ao cadastro real dos dois cursos em 27/10/2026 confirmou, no Enem, seis textos iguais depois de normalizar número e título. Não havia exemplos matemáticos resolvidos nesses textos. A prova tinha dez perguntas gerais; nenhuma exigia calcular, interpretar um gráfico específico ou resolver um problema matemático. A atividade ligada à aula de Álgebra perguntava sobre estrutura de redação. As quatro atividades repetiam as primeiras quatro questões finais.

O importador `scripts/import-ead-courses.mjs` explica esse padrão: texto profissional genérico, perguntas por tags e atividades associadas pela posição. A condição `redacao || enem` incluiu redação na avaliação de Matemática. Não foi encontrado indício de o motor trocar o curso do aluno.

Algumas questões gerais tinham apoio literal no texto genérico. O defeito demonstrado é falta de ensino e avaliação das habilidades matemáticas anunciadas; não é ausência absoluta de relação entre todas as palavras do texto e da prova.

## Pesquisa primária e autoria

Foram consultados o [registro institucional da matriz do Inep](https://www.gov.br/inep/pt-br/centrais-de-conteudo/acervo-linha-editorial/publicacoes-institucionais/avaliacoes-e-exames-da-educacao-basica/matrizes-de-referencia-enem), publicado em 2026, e o [PDF oficial identificado nessa pesquisa](https://download.inep.gov.br/enem/outros_documentos/enem_matriz_referencia.pdf). A busca recuperou deste PDF a seção de Matemática com H1–H9, página 7. A abertura direta retornou HTTP 502, também na segunda conferência; não se declara leitura integral. Os códigos restantes foram conferidos no texto recuperado pela busca do [anexo III da Portaria de 2009](https://download.inep.gov.br/educacao_basica/enem/legislacao/2009/portaria_enem2009_2.pdf), com H15–H26 também recuperados da URL oficial legada. Os códigos H representam uma seleção pedagógica; não se declara uma matriz nova nem cobertura das trinta habilidades.

As referências matemáticas são os materiais abertos da OBMEP/IMPA: [razões e proporções](https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=57), [porcentagem e juros](https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=26), [função afim](https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=35), [função quadrática](https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=62), [Pitágoras e áreas](https://www.obmep.org.br/docs/apostila3.pdf), [volume](https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=56), [estatística](https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=99) e [probabilidade](https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=46). O índice oficial também foi consultado para trilhas de funções e progressões. Títulos, URLs, data e limites da consulta estão em `sources.mjs`.

O texto didático, os contextos, os números, as questões e as resoluções foram escritos para esta revisão. Não foram copiados itens oficiais do Enem ou exercícios protegidos das apostilas. Fórmulas e conceitos usuais foram desenvolvidos com exemplos próprios e recálculo independente.

## Cobertura verificável

| Aula | Horas | Habilidades praticadas | Evidência de ensino | Avaliação final |
|---|---:|---|---|---|
| Resolução de problemas | 26 | Tabelas, referência, unidades e arredondamento contextual | Três exemplos e cinco treinos | q-1 e q-2 |
| Aritmética e proporções | 26 | Proporcionalidade, mudanças percentuais e escalas | Quatro exemplos e seis treinos | q-3 e q-4 |
| Álgebra e funções | 27 | Modelo afim, taxa, gráficos e máximo quadrático | Quatro exemplos, fatoração explicada e seis treinos | q-5 e q-6 |
| Geometria | 27 | Áreas, capacidade e distância cartesiana | Quatro exemplos e seis treinos | q-7 e q-8 |
| Estatística e probabilidade | 27 | Frequências, média, mediana e retirada sem reposição | Quatro exemplos e seis treinos | q-9 e q-10 |
| Integração e revisão | 27 | Modelar, combinar conceitos e conferir resultado | Quatro simulados comentados e seis treinos | q-11 e q-12 |

Total: seis aulas, 160 horas, 23 exemplos/simulados resolvidos, 35 treinos com conferência, seis atividades e doze questões finais. As horas são distribuídas em estudo orientado, prática, revisão e avaliação, com plano explícito por aula; não representam duração de leitura ou vídeo. Há tópicos introdutórios adicionais, como exponencial e trigonometria, sem alegar sua avaliação integral em doze itens.

Cada atividade e questão traz `lessonId`, habilidade pertencente à aula e fontes conceituais. As avaliações transferem os métodos para números e situações diferentes dos exemplos; não repetem literalmente as atividades. Os gabaritos e as resoluções dos itens avaliativos pertencem ao pacote privado de publicação e ao feedback autorizado, sem inclusão nos arquivos públicos do curso ou neste relatório.

## Verificação e discussão entre os agentes

- Recálculo independente dos dezoito gabaritos; as doze questões finais têm exatamente uma opção numericamente correta. Horas, pertença das habilidades, IDs de fontes e unicidade das explicações conferidos por execução local.
- O agente de Matemática Básica leu as seis aulas e os dezoito itens do Enem e recalculou os resultados. Confirmou a otimização da compra de pacotes no exemplo didático da aula 6 e a mediana 1,5 da tabela didática na aula 5. Sugeriu ensinar fatoração antes do treino correspondente; incluído exemplo resolvido diferente do treino.
- A revisão cruzada das cinco aulas e vinte itens de Matemática Básica não encontrou erro de cálculo. Foi sugerida nova hora no item do relógio para evitar repetir exatamente o exemplo didático, sugestão acolhida pelo autor.
- Discussão técnica: a configuração exibida, o gabarito utilizado e as tentativas devem pertencer à mesma revisão. Tentativas e conclusões antigas não podem ser recalculadas com itens novos. O coordenador e o agente técnico tratam adapter, arquivo histórico, segurança e publicação em manifesto próprio.
- Alerta levado ao agente técnico: resoluções detalhadas contêm respostas e não devem permanecer no payload público das questões antes da tentativa. O cofre/feedback deve tratar explicações junto aos gabaritos.

## Vídeo e limites

O vídeo anteriormente associado ao curso não foi assistido e não teve seu alinhamento pedagógico comprovado. Esta revisão não herda sua exigência de conclusão: `videoPolicy.required = false`, sem URLs validadas. O adapter deve desativar `exigirVideosConcluidos` e não copiar automaticamente as URLs antigas para estas aulas. O curso textual e a trilha de estudo têm conteúdo próprio.

Esta frente produziu somente conteúdo e documentação de pesquisa. Não aplicou SQL, não alterou tentativas e não publicou o curso. A validação remota, a conferência do payload efetivo e o smoke autenticado pertencem ao fechamento do lote coordenado.

## Manifesto explícito

- `content/ead/matematica-enem/index.mjs`
- `content/ead/matematica-enem/lessons.mjs`
- `content/ead/matematica-enem/assessments.mjs`
- `content/ead/matematica-enem/sources.mjs`
- `docs/ead/revisao-matematica-enem.md`

Total: 5 arquivos.

Todos os arquivos deste manifesto têm menos de 500 linhas físicas.
