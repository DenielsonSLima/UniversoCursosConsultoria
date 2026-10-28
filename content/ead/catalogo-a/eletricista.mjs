import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Grandezas elétricas e modelo resistivo em corrente contínua',
    skills: ['calcular-grandezas-eletricas-teoricas'], sourceIds: ['ufrn-eletricidade'],
    sections: [
      { title: 'Ensino: tensão, corrente e resistência representam grandezas diferentes', paragraphs: [
        'Este é um curso livre exclusivamente teórico de fundamentos. Os exercícios utilizam papel, esquemas e cálculos; não solicitam montar circuitos, abrir equipamentos, fazer medições ou executar serviços elétricos. A conclusão não fornece habilitação profissional, capacitação prática ou autorização para trabalho em eletricidade, nem substitui os requisitos de segurança e formação aplicáveis. Conhecer uma fórmula é uma aprendizagem diferente de estar apto a intervir em uma instalação.',
        'Tensão é diferença de potencial entre dois pontos, medida em volts, V. Corrente elétrica corresponde ao fluxo de carga por tempo, medida em ampères, A. Resistência, medida em ohms, Ω, relaciona tensão e corrente nas condições consideradas. No modelo de resistor ôhmico com condições mantidas, U=R×I e I=U/R. A relação não permite tratar todos os equipamentos reais como uma resistência fixa em qualquer situação; temperatura, componentes eletrônicos e outras características podem alterar o comportamento.',
        'Um cálculo começa por identificar o modelo e as unidades. Converta miliampères para ampères quando necessário: 500 mA correspondem a 0,5 A. Não some tensão e corrente como se fossem valores da mesma grandeza. Em corrente contínua idealizada, o sentido convencional considerado no esquema não alterna periodicamente; em corrente alternada, as grandezas variam no tempo. Os exercícios resistivos em corrente contínua desta aula não constituem instrução para ligar uma fonte ou experimentar contato com condutores.',
      ] },
      { title: 'Caso resolvido: conferir unidade antes da lei de Ohm', paragraphs: [
        'Em um esquema puramente teórico, há 12 V entre os terminais de um resistor de 24 Ω. Pelo modelo indicado, I=12/24=0,5 A, que equivalem a 500 mA. Escrever 0,5 mA seria um erro de fator mil. Se a resistência dobrasse mantendo a mesma tensão e o modelo, a corrente cairia à metade. O raciocínio compara grandezas e condições, sem precisar construir ou medir o circuito.',
        'Outro esquema informa uma corrente de 0,2 A em um resistor de 30 Ω. A tensão calculada é U=30×0,2=6 V. A conferência dimensional ajuda a reconhecer a relação: ohm multiplicado por ampère resulta em volt. Nenhuma dessas contas informa segurança de toque, método de medição ou seção de condutor. O resultado só responde à pergunta idealizada que foi formulada.',
      ] },
      { title: 'Exercício teórico orientado', paragraphs: [
        'Em papel, resolva dois modelos: 18 V em 36 Ω e 0,3 A em 20 Ω, identificando a grandeza pedida e sua unidade. Converta 250 mA para ampères e explique por que não são 250 A. Escreva as hipóteses do resistor ôhmico e uma limitação ao transferir o resultado para equipamento real. Não utilize bateria, tomada ou instrumento de medição. Confira se tensão, corrente e resistência permanecem distinguidas e se o exercício não é interpretado como autorização de serviço ou teste de segurança.',
      ] },
    ],
  },
  {
    title: 'Leitura de esquemas e associações em série e paralelo',
    skills: ['interpretar-serie-paralelo-teoricos'], sourceIds: ['ufrn-eletricidade'],
    sections: [
      { title: 'Ensino: a relação entre os nós define a associação', paragraphs: [
        'Um esquema representa conexões e componentes por convenções, não pela aparência física de uma instalação. Identifique os nós e os caminhos antes de decidir se há série ou paralelo. Em uma associação simples em série, a corrente percorre os componentes na sequência, sem ramificação intermediária; a resistência equivalente é a soma. Em paralelo, resistores estão ligados entre os mesmos dois nós, têm a mesma tensão e a corrente total se distribui pelos ramos.',
        'Para dois resistores positivos em paralelo, a resistência equivalente pode ser calculada por R1×R2/(R1+R2). Para vários, utiliza-se 1/Req=1/R1+1/R2+... . O resultado em paralelo é menor que a menor resistência individual, nas hipóteses do modelo. Em série, a equivalente é maior que cada parcela positiva. Essas relações oferecem uma conferência de plausibilidade: um número que contraria a regra pode indicar erro na identificação da conexão ou na conta.',
        'A divisão de tensão em série e de corrente em paralelo decorre das relações do circuito e dos valores, não apenas da posição desenhada na folha. Dois símbolos próximos não estão necessariamente em série. Uma representação pode mudar de forma e preservar as mesmas conexões. O estudo aqui é de esquemas idealizados. Não deve ser usado como desenho de instalação predial, indicação de ligação de tomadas ou roteiro de montagem; esses trabalhos exigem projeto, normas e profissionais responsáveis.',
      ] },
      { title: 'Caso resolvido: mesmos resistores em conexões distintas', paragraphs: [
        'Dois resistores de 6 Ω e 12 Ω em série apresentam 18 Ω de resistência equivalente. Se estiverem em paralelo, a equivalente será 6×12/(6+12)=72/18=4 Ω. A mudança não ocorreu nos valores dos componentes, mas na relação entre os nós. O resultado 4 Ω ser menor que 6 Ω é coerente com o modelo em paralelo. Somar os valores nesse segundo caso daria um resultado incompatível.',
        'Se o conjunto em paralelo recebe 12 V no esquema ideal, o ramo de 6 Ω tem 2 A e o de 12 Ω tem 1 A, totalizando 3 A. A equivalente de 4 Ω também produziria 12/4=3 A. A conferência pelos dois caminhos sustenta o raciocínio. O caso não autoriza conectar componentes ou escolher a capacidade de uma fonte real: potência, limites e demais condições não foram especificados para uma execução.',
      ] },
      { title: 'Exercício teórico orientado', paragraphs: [
        'Desenhe apenas em papel dois resistores de 8 Ω e 8 Ω em série e em paralelo. Calcule a equivalente de cada esquema e compare com as parcelas. Em outro desenho, mude a posição dos símbolos mantendo os mesmos nós e explique por que a associação não mudou. Não monte o circuito. Confira se sua decisão decorre das conexões e se o cálculo em paralelo atende à comparação com a menor resistência. Registre também por que um esquema didático não equivale a projeto de instalação.',
      ] },
    ],
  },
  {
    title: 'Potência, energia e estimativa de consumo',
    skills: ['calcular-potencia-energia-teoricas'], sourceIds: ['mme-potencia', 'ufrn-eletricidade'],
    sections: [
      { title: 'Ensino: potência é uma taxa e energia depende também do tempo', paragraphs: [
        'Potência elétrica expressa uma taxa de transformação de energia e é medida em watts, W. No circuito ideal de corrente contínua considerado, P=U×I. Para um resistor no modelo da lei de Ohm, também se podem usar P=R×I² ou P=U²/R. Em equipamentos de corrente alternada, potência ativa e outras relações exigem considerar o tipo de carga e condições; não aplique a fórmula simplificada para dimensionar qualquer instalação a partir de uma etiqueta.',
        'Energia em um intervalo com potência constante pode ser estimada por E=P×t. Se potência está em quilowatts e tempo em horas, o resultado é quilowatt-hora, kWh. Um quilowatt corresponde a mil watts. Não confunda kW com kWh nem escreva kW/h para representar o consumo nessa conta. Um equipamento de maior potência usado por poucos minutos pode consumir menos energia no período que outro de menor potência utilizado por muitas horas.',
        'O consumo calculado não é o valor completo da conta de energia. A cobrança depende de tarifas, tributos, bandeiras e outros componentes aplicáveis. Além disso, uma potência nominal pode não permanecer constante durante todo o uso: equipamentos com ciclos de funcionamento exigem outra análise. A estimativa deve informar hipóteses e período. Os exercícios deste módulo são cálculos em papel e não pedem abrir medidor, acessar quadro ou ligar um aparelho para medir consumo.',
      ] },
      { title: 'Caso resolvido: converter minutos e watts', paragraphs: [
        'Um equipamento fictício de 1.200 W funciona com potência constante por 15 minutos. Primeiro converte-se 1.200 W em 1,2 kW e 15 minutos em 0,25 h. A energia é 1,2×0,25=0,3 kWh. Multiplicar 1.200 por 15 e chamar o resultado de kWh misturaria unidades. Se o mesmo uso ocorre vinte vezes, a estimativa é 6 kWh, mantidas as hipóteses e sem outros períodos de funcionamento.',
        'Em um circuito resistivo idealizado de 24 V e 2 A, P=24×2=48 W. Esse resultado representa potência no modelo, não a energia de um mês nem uma recomendação de proteção. O caso separa pergunta, unidade e limite: calcular potência não informa automaticamente seção de cabo, disjuntor ou adequação de um equipamento real. Essas escolhas dependem de outros critérios de projeto e segurança.',
      ] },
      { title: 'Exercício teórico orientado', paragraphs: [
        'Calcule em papel a energia de um equipamento fictício de 800 W por 45 minutos com potência constante. Explique as conversões e projete dez repetições iguais. Em outra conta, determine potência de um resistor que recebe 10 V e 2 A no modelo ideal. Liste três informações que faltariam para transformar uma estimativa em valor completo de uma fatura. Não faça medição real. Confira se energia e potência estão separadas e se nenhuma conta é utilizada como dimensionamento de instalação.',
      ] },
    ],
  },
  {
    title: 'Falhas, proteção e limites da interpretação de um sintoma',
    skills: ['distinguir-falhas-e-protecoes-eletricas'], sourceIds: ['mte-nr10', 'mte-manual'],
    sections: [
      { title: 'Ensino: um dispositivo atuar não revela sozinho toda a causa', paragraphs: [
        'Sobrecarga é uma condição de corrente superior à prevista para o funcionamento adequado de um circuito ou componente; curto-circuito envolve um caminho de baixa impedância em condição de falha. Ambos podem produzir aquecimento e outros perigos, mas não são o mesmo fenômeno. Corrente elétrica pelo corpo, arco elétrico e riscos adicionais do ambiente precisam ser considerados na prevenção. Não se cria uma experiência de choque, curto ou aquecimento para aprender esses conceitos.',
        'Disjuntores e fusíveis de proteção contra sobrecorrente possuem características de atuação relacionadas ao projeto. Um dispositivo diferencial residual monitora desequilíbrio das correntes nos condutores ativos e atua conforme suas características; não é equivalente a toda proteção contra sobrecorrente, salvo funções combinadas previstas no dispositivo. Aterramento, isolamento, barreiras e demais medidas também têm papéis próprios. A presença de um recurso não autoriza dispensar os outros nem garante ausência de risco em qualquer condição.',
        'Se uma proteção atua, substituir por outra de maior corrente nominal sem análise pode deixar a instalação desprotegida. A repetição de rearme para descobrir se agora funciona não é diagnóstico responsável. Um relato de aquecimento, cheiro ou atuação precisa ser comunicado ao profissional competente, mantendo pessoas afastadas da condição perigosa conforme o plano. Cor de fio, posição de uma chave ou ausência de luz não comprovam que é seguro tocar. Este curso não ensina procedimento de inspeção ou reparo.',
      ] },
      { title: 'Caso resolvido: proposta de aumentar o disjuntor para parar de atuar', paragraphs: [
        'Uma pessoa relata atuação repetida de proteção e propõe colocar um dispositivo de maior capacidade para resolver. A sugestão ignora a causa e a relação com os componentes protegidos. O estudante identifica o erro conceitual e encaminha a avaliação a profissional responsável, sem abrir o quadro nem realizar troca. O sintoma pode ter origens diferentes e não fornece dados suficientes para uma escolha de proteção.',
        'O registro teórico separa observação e conclusão: a proteção atuou em determinado contexto, mas isso não comprova sozinho qual componente está em falha. A atuação não deve ser eliminada por conveniência. O caso mostra por que conhecer a função de proteção é útil mesmo sem executar serviço: permite reconhecer uma proposta inadequada e evitar que uma conta simples seja usada como justificativa para intervenção sem projeto.',
      ] },
      { title: 'Exercício teórico orientado', paragraphs: [
        'Compare em um quadro sobrecarga, curto-circuito e desequilíbrio monitorado por dispositivo diferencial, sem produzir nenhuma falha. Descreva por que funções de proteção não são intercambiáveis. Escreva uma análise de pedido fictício para aumentar um disjuntor, identificando informações ausentes e o encaminhamento competente. Não toque ou fotografe o interior de quadro real. Confira se o estudo evita recomendar valores ou seções e se uma proteção atuada permanece um sinal para análise, em vez de um obstáculo a remover.',
      ] },
    ],
  },
  {
    title: 'NR-10, documentos e fronteira entre estudo e autorização de trabalho',
    skills: ['reconhecer-limites-estudo-eletricidade'], sourceIds: ['mte-nr10', 'mte-vigencia'],
    sections: [
      { title: 'Ensino: certificado de estudo teórico não libera intervenção elétrica', paragraphs: [
        'A segurança em eletricidade envolve medidas de controle, análise de risco, procedimentos, documentação e requisitos de pessoas e organizações. Qualificação, habilitação, capacitação e autorização não são nomes intercambiáveis de um certificado. A autorização para trabalhar está vinculada aos requisitos aplicáveis e à responsabilidade da organização. Este curso livre teórico não substitui treinamento regulamentar, formação prática, avaliação de condições de saúde, registro profissional ou outros requisitos quando exigidos.',
        'Em 27/10/2026, a página oficial do MTE informa que a redação da NR-10 com última modificação em 2019 permanece vigente até 31/05/2027. A nova redação aprovada pela Portaria MTE 737/2026 entra em vigor em 01/06/2027, ressalvados prazos específicos. Publicação e vigência são momentos diferentes. O estudante deve consultar a versão e a data aplicáveis, sem tratar um arquivo mais recente como obrigação já em vigor. O conteúdo deste curso preserva o recorte de fundamentos e limites.',
        'Instalação desligada não equivale automaticamente a condição liberada para trabalho. A desenergização e a prevenção de reenergização integram procedimentos técnicos executados por pessoas competentes e autorizadas, com verificações e medidas previstas. O texto não fornece uma sequência operacional para realizá-las. Esquemas e documentos atualizados ajudam a análise, mas não tornam seguro atuar por leitura informal. Uma divergência entre documento e condição relatada deve gerar avaliação responsável, nunca uma adaptação por tentativa.',
      ] },
      { title: 'Caso resolvido: usar o certificado livre como liberação de serviço', paragraphs: [
        'Após concluir o estudo, alguém pretende abrir um quadro alegando que as 160 horas do curso já autorizam a atividade. A conclusão é incorreta: a carga cadastrada não cria habilitação, treinamento prático ou autorização da organização. O aprendizado permite resolver os modelos apresentados e reconhecer limites, sem executar a intervenção. A demanda de serviço precisa chegar a profissionais e responsáveis que atendam aos requisitos aplicáveis.',
        'Em outra situação, a empresa consulta um PDF aprovado em 2026 e percebe uma data de início de vigência futura. A decisão documental precisa distinguir o texto vigente e o planejamento de transição, conforme a fonte oficial. O caso demonstra que competência teórica inclui ler o alcance e a data de uma norma, e não apenas citar seu nome. Evita tanto ignorar mudanças publicadas quanto apresentar obrigação futura como atual.',
      ] },
      { title: 'Exercício teórico orientado', paragraphs: [
        'Monte uma ficha de estudo com título da norma, fonte oficial, data de consulta e vigência. Diferencie formação teórica livre, treinamento regulamentar e autorização para uma atividade, sem emitir qualquer declaração profissional. Escreva uma resposta a uma solicitação de executar serviço após o curso e indique o encaminhamento responsável. Não realize desenergização, teste, inspeção ou montagem. Confira se todos os exercícios permanecem em papel e se o certificado é interpretado apenas no limite real do estudo realizado.',
      ] },
    ],
  },
];
const activities = [
  { module: 1, skill: 'calcular-grandezas-eletricas-teoricas', prompt: 'No modelo ôhmico ideal, há 20 V em 40 Ω. A corrente calculada é:', options: ['0,5 A.', '2 A.', '800 A.', '0,5 mA.'] },
  { module: 2, skill: 'interpretar-serie-paralelo-teoricos', prompt: 'Dois resistores positivos estão entre os mesmos dois nós. Qual associação é representada?', options: ['Série apenas pela proximidade.', 'Sempre uma resistência nula.', 'Paralelo, com a mesma tensão entre os ramos.', 'Uma instalação real autorizada.'] },
  { module: 3, skill: 'calcular-potencia-energia-teoricas', prompt: 'Uma potência constante de 2 kW por 0,5 h corresponde a energia de:', options: ['4 kWh.', '1 kWh.', '2 kW/h.', '0,25 kWh.'] },
  { module: 4, skill: 'distinguir-falhas-e-protecoes-eletricas', prompt: 'Uma proteção atua repetidamente. Aumentar sua corrente nominal sem análise:', options: ['É diagnóstico suficiente.', 'Sempre elimina a causa.', 'É permitido após calcular qualquer potência.', 'Pode comprometer a proteção; a causa exige avaliação competente.'] },
  { module: 5, skill: 'reconhecer-limites-estudo-eletricidade', prompt: 'A conclusão deste curso livre teórico 160 h:', options: ['Não substitui habilitação, prática, treinamento regulamentar ou autorização de trabalho exigidos.', 'Autoriza abrir quadros.', 'Equivale a toda formação NR-10.', 'Permite realizar medições em qualquer instalação.'] },
];
const exam = [
  { module: 1, skill: 'calcular-grandezas-eletricas-teoricas', prompt: 'No modelo ôhmico, um resistor de 15 Ω recebe 0,4 A. A tensão é:', options: ['37,5 V.', '0,0267 V.', '6 V.', '60 V.'] },
  { module: 1, skill: 'calcular-grandezas-eletricas-teoricas', prompt: '750 mA correspondem a:', options: ['0,75 A.', '75 A.', '750 A.', '0,00075 A.'] },
  { module: 2, skill: 'interpretar-serie-paralelo-teoricos', prompt: 'Resistores de 5 Ω e 10 Ω em série têm equivalente de:', options: ['2 Ω.', '15 Ω.', '50 Ω.', '0,5 Ω.'] },
  { module: 2, skill: 'interpretar-serie-paralelo-teoricos', prompt: 'Dois resistores de 10 Ω em paralelo têm equivalente de:', options: ['20 Ω.', '100 Ω.', '10 Ω.', '5 Ω.'] },
  { module: 3, skill: 'calcular-potencia-energia-teoricas', prompt: 'Um equipamento fictício de 600 W por 30 minutos com potência constante consome:', options: ['18 kWh.', '1,2 kWh.', '0,3 kWh.', '300 kWh.'] },
  { module: 3, skill: 'calcular-potencia-energia-teoricas', prompt: 'A estimativa de energia por potência e tempo:', options: ['Não fornece sozinha todos os componentes do valor de uma fatura nem dimensiona instalação.', 'É sempre a conta completa a pagar.', 'Determina automaticamente um disjuntor.', 'Dispensa hipóteses de funcionamento.'] },
  { module: 4, skill: 'distinguir-falhas-e-protecoes-eletricas', prompt: 'Proteção contra sobrecorrente e diferencial residual:', options: ['São funções sempre idênticas.', 'Dispensam outras medidas.', 'Tornam seguro tocar qualquer condutor.', 'Têm funções distintas; combinações dependem das características do dispositivo e do projeto.'] },
  { module: 4, skill: 'distinguir-falhas-e-protecoes-eletricas', prompt: 'Ausência de luz e posição de uma chave:', options: ['Comprovam condição segura de toque.', 'Não comprovam liberação para trabalho ou ausência de risco elétrico.', 'Substituem procedimento técnico.', 'Autorizam inspeção por estudante.'] },
  { module: 5, skill: 'reconhecer-limites-estudo-eletricidade', prompt: 'Na consulta oficial de 27/10/2026, a nova redação NR-10 da Portaria 737/2026:', options: ['Já eliminou toda regra anterior imediatamente.', 'Não tem data de vigência.', 'Tem início de vigência em 01/06/2027; publicação e vigência são momentos diferentes.', 'Transforma curso livre em autorização.'] },
  { module: 5, skill: 'reconhecer-limites-estudo-eletricidade', prompt: 'Os exercícios deste curso devem ser feitos:', options: ['Em papel e esquemas teóricos, sem montagem, medição ou serviço elétrico real.', 'Abrindo o quadro da residência.', 'Produzindo um curto para observar.', 'Tocando condutores para comparar.'] },
];
export const courseRevision = defineCourse({
  courseId: '7efb524d-488f-4d31-8538-59db91341e21', slug: 'eletricista', courseName: 'Eletricista', hours: 160,
  subtitle: 'Curso livre exclusivamente teórico: sem habilitação, treinamento regulamentar, prática elétrica ou autorização para serviços.',
  audience: 'Estudantes de conceitos, cálculos e leitura teórica de eletricidade; atividades exclusivamente em papel, sem execução elétrica.',
  objectives: ['Reconhecer o limite do curso livre teórico, sem habilitação, treinamento regulamentar ou autorização de serviço.', ...modules.map(module => module.title)],
  sources: [
    { id: 'ufrn-eletricidade', title: 'UFRN/IMD — Conceitos de eletricidade, grandezas e associações', url: 'https://materialpublic.imd.ufrn.br/curso/disciplina/1/20/2/1' },
    { id: 'mme-potencia', title: 'MME — Potência e consumo de energia', url: 'https://www.gov.br/mme/pt-br/assuntos/noticias/julho-26/potencia-e-consumo-de-energia-o-que-sao-e-como-impactam-na-conta-de-luz' },
    { id: 'mte-nr10', title: 'MTE — NR-10 vigente até 31/05/2027', url: 'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-10-atualizada-2019-1.pdf' },
    { id: 'mte-vigencia', title: 'MTE — Histórico, versões e transição de vigência da NR-10', url: 'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-10-nr-10' },
    { id: 'mte-manual', title: 'MTE — Manual de interpretação da NR-10, referência conceitual de 2010', url: 'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-10_manual_de_auxilio_na_interpretacao_e_aplicacao_da_nr_10.pdf' },
  ],
}, modules, activities, exam);
export default courseRevision;
