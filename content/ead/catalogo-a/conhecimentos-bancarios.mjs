import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Sistema Financeiro Nacional e funções das instituições',
    skills: ['distinguir-funcoes-sfn'], sourceIds: ['cvm-sfn', 'bcb-regulacao', 'bcb-glossario'],
    sections: [
      { title: 'Ensino: definir diretrizes, supervisionar e operar são funções diferentes', paragraphs: [
        'O Sistema Financeiro Nacional reúne instituições e entidades que permitem intermediação de recursos e prestação de serviços financeiros. Uma pessoa pode manter recursos em uma instituição enquanto outra obtém crédito, em operações com contratos, custos e riscos próprios. Essa organização não se resume a agências bancárias. Conhecer as funções ajuda a distinguir quem estabelece diretrizes, quem supervisiona e quem oferece um produto ou executa uma operação.',
        'As entidades normativas definem políticas e diretrizes. O Conselho Monetário Nacional atua no campo da moeda e do crédito. Banco Central e Comissão de Valores Mobiliários são exemplos de entidades supervisoras, com competências distintas e também atribuições normativas em seus âmbitos. O BC monitora e fiscaliza o sistema financeiro e executa políticas de sua competência; a CVM atua no mercado de valores mobiliários. Não se deve tratar BC, CMN e CVM como nomes de um mesmo banco comercial.',
        'Instituições operadoras prestam serviços e realizam operações dentro de suas autorizações. O nome comercial ou a aparência digital de uma empresa não informa, sozinho, seu tipo jurídico e quais atividades pode oferecer. Antes de interpretar uma operação, identifique instituição, produto e contrato. A autorização ou supervisão não significa que o órgão público recomenda aquele produto ao cliente ou garante qualquer promessa de rentabilidade. Este curso apresenta fundamentos, sem indicar uma contratação individual.',
      ] },
      { title: 'Caso resolvido: confundir banco comercial com supervisor', paragraphs: [
        'Um anúncio afirma que um investimento é garantido porque a empresa tem relação com o Banco Central. A análise precisa separar autorização de funcionamento, características do produto e eventual proteção específica. O BC não se transforma em parte de todo contrato oferecido por uma instituição supervisionada. O estudante deve procurar a informação oficial sobre a instituição e examinar o produto, sem aceitar o uso do nome de um órgão como prova de ausência de risco.',
        'Em um mapa de funções, o CMN aparece no nível de diretrizes; BC e CVM, em suas funções supervisoras; e o prestador, na operação correspondente. O mapa não substitui uma análise regulatória detalhada, mas evita a confusão inicial. O caso demonstra que conhecer a estrutura do SFN é útil na leitura de publicidade, de notícias e de demandas de atendimento, e não apenas para memorizar siglas.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte um mapa com entidade normativa, supervisora e operadora, usando CMN, BC, CVM e uma instituição fictícia. Escreva uma pergunta que ajude a identificar o tipo de produto antes de relacioná-lo a uma autoridade. Analise uma promessa fictícia de retorno sem risco baseada apenas no nome de um órgão e explique por que a justificativa é insuficiente. Não faça uma contratação para o exercício. Confira se seu mapa diferencia funções e não transforma autorização em recomendação ou garantia geral.',
      ] },
    ],
  },
  {
    title: 'Contas, depósitos, aplicações e leitura do extrato',
    skills: ['interpretar-produtos-extrato-bancario'], sourceIds: ['bcb-glossario', 'cvm-sfn'],
    sections: [
      { title: 'Ensino: saldo de recursos e limite de crédito não são a mesma coisa', paragraphs: [
        'Uma conta registra movimentações conforme seu tipo e condições. No extrato, crédito pode indicar entrada e débito, saída; isso é diferente de usar crédito para significar dinheiro emprestado. A leitura deve considerar descrição, data, valor e estado do lançamento. Um movimento agendado não é automaticamente realizado, e uma informação de saldo precisa ser interpretada conforme o que a tela inclui. Não trate limite de empréstimo ou cheque especial como patrimônio disponível sem custo.',
        'Depósito, aplicação e operação de crédito têm finalidades e regras diferentes. Ao aplicar recursos, examine prazo, possibilidade de resgate, risco e forma de remuneração. Liquidez é a possibilidade de transformar um ativo em recursos utilizáveis nas condições previstas; não equivale a rentabilidade. Risco de crédito envolve a possibilidade de não receber o devido pelo devedor ou emissor; risco de mercado se relaciona a variações de preços e taxas. Um nome conhecido de instituição não torna todos os produtos equivalentes.',
        'A conferência de extrato relaciona saldo inicial, entradas, saídas e saldo final, preservando os movimentos que explicam a diferença. Se não há outros lançamentos, saldo inicial mais entradas menos saídas deve corresponder ao final. Uma divergência precisa ser investigada, não corrigida com uma entrada fictícia. Utilize informações simuladas no estudo e mantenha proteção sobre dados reais. A leitura organizada permite identificar cobrança, agendamento ou movimentação que exige esclarecimento pelo canal da instituição.',
      ] },
      { title: 'Caso resolvido: conciliar sem contar o limite como saldo próprio', paragraphs: [
        'Uma conta fictícia inicia com R$400, recebe R$250 e tem saídas de R$180 e R$70. Sem outros lançamentos, termina com R$400. A tela também apresenta um limite de crédito de R$600, que não deve ser somado ao valor como se fosse dinheiro próprio. Usar o limite representa uma operação de crédito conforme as condições aplicáveis, não uma entrada de renda. A conciliação continua baseada nas movimentações efetivas.',
        'Ao comparar duas aplicações, uma pode permitir resgate em condição diferente da outra. O estudante não escolhe a supostamente melhor apenas pelo retorno anunciado. Precisa compreender a disponibilidade e os riscos associados à finalidade de quem utiliza os recursos. O exemplo é educacional: não recomenda um investimento nem presume que uma necessidade individual será atendida por um produto apenas porque tem liquidez no nome.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie um extrato fictício com saldo inicial, três entradas e quatro saídas, conferindo a soma final. Acrescente um limite de crédito e um lançamento futuro em campos separados, explicando por que não são entradas realizadas. Descreva duas aplicações fictícias com prazos de resgate diferentes e distinga liquidez de rentabilidade sem escolher um produto para alguém real. Revise se a conciliação mantém todos os movimentos e se uma diferença vira uma pergunta a investigar, em vez de um ajuste inventado.',
      ] },
    ],
  },
  {
    title: 'Crédito, juros e custo efetivo total',
    skills: ['comparar-custo-credito'], sourceIds: ['bcb-glossario', 'bcb-caderno'],
    sections: [
      { title: 'Ensino: taxa, prazo e encargos precisam ser lidos em conjunto', paragraphs: [
        'Crédito permite utilizar recursos agora com obrigação de pagamento conforme contrato. Capital é o valor de referência; juros remuneram o uso do recurso; prazo e forma de pagamento influenciam a evolução da dívida. Uma parcela menor não comprova custo total menor: pode corresponder a prazo mais longo. Compare operações com valores, datas e condições equivalentes e verifique os encargos, sem avaliar apenas a taxa anunciada em destaque.',
        'Nos juros simples, o cálculo de cada período usa o capital inicial, mantendo as hipóteses. Nos compostos, a incidência considera o saldo acumulado. Com capital de R$1.000, taxa de 2% ao mês e três meses sem pagamentos, o modelo simples resulta em R$1.060; o composto resulta em R$1.061,208, ou R$1.061,21 após arredondar o valor final. É uma simulação sem tarifas, tributos ou outros fluxos, não uma proposta bancária real.',
        'O Custo Efetivo Total, CET, expressa o custo da operação incluindo juros e demais despesas e encargos pertinentes. Não se obtém o CET apenas somando percentuais de natureza diferente nem confundindo a taxa anunciada com todo o custo. Para a comparação, confira o demonstrativo e a mesma base de período, além do fluxo contratado. A amortização corresponde à redução do principal; uma parcela pode incluir juros e outros componentes, e seu valor inteiro não deve ser tratado automaticamente como redução da dívida.',
      ] },
      { title: 'Caso resolvido: prestação menor com pagamento total maior', paragraphs: [
        'Duas propostas fictícias para o mesmo valor recebido têm pagamentos mensais de R$260 por quatro meses e R$180 por seis meses. A soma nominal é R$1.040 na primeira e R$1.080 na segunda. A segunda parcela é menor, mas sua soma é maior. Isso ainda não calcula o CET: faltam datas e eventuais encargos do fluxo completo. O caso ensina a não concluir menor custo apenas pela prestação.',
        'A comparação responsável pede os demonstrativos e verifica condições equivalentes, inclusive o valor líquido efetivamente recebido. Se uma tarifa é descontada na liberação, o dinheiro disponível pode ser menor que o capital nominal mostrado. O estudante registra a diferença e busca esclarecimento, sem ocultar esse custo. O exercício produz perguntas corretas de análise, em vez de recomendar automaticamente a proposta com menor número na publicidade.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Calcule uma simulação de R$500 por dois meses a 1% ao mês, sem pagamentos e sem outros encargos, nos modelos simples e composto. Mostre as hipóteses e arredonde somente o resultado final quando necessário. Crie duas propostas fictícias com parcelas e prazos distintos, compare somas e liste o que falta para avaliar o CET. Explique amortização sem confundi-la com toda a prestação. Não contrate crédito para o exercício; confira se taxa e período são compatíveis e se o custo foi tratado além do destaque publicitário.',
      ] },
    ],
  },
  {
    title: 'Meios de pagamento, Pix e confirmação de uma transação',
    skills: ['conferir-transacao-pagamento'], sourceIds: ['bcb-pix', 'bcb-glossario', 'bcb-seguranca-pix'],
    sections: [
      { title: 'Ensino: meio de pagamento, identificação e estado da operação', paragraphs: [
        'Dinheiro, cartão, boleto e transferências são meios com fluxos e características diferentes. Antes de considerar uma obrigação quitada, verifique os dados e o estado da operação pelo canal responsável. Solicitação, agendamento e conclusão não são a mesma coisa. Uma imagem recebida por mensagem pode estar adulterada ou mostrar apenas um agendamento. A conferência deve relacionar valor, destinatário e efetivo registro da transação, sem depender de pressão de quem enviou o arquivo.',
        'No Pix, uma chave funciona como identificador associado à conta e não precisa ser necessariamente CPF ou telefone; pode ser aleatória. Antes de confirmar o envio, confira os dados do destinatário exibidos pela instituição e o valor. QR Code não elimina essa verificação: um código pode apontar para destino diferente do esperado. As funções disponíveis e os limites aplicáveis precisam ser consultados na instituição, sem supor que toda operação terá comportamento idêntico.',
        'Devolução de Pix recebido por engano deve usar a funcionalidade vinculada à transação original, após conferir no extrato que o recebimento de fato ocorreu. Não faça um novo pagamento para conta indicada por mensagem como se fosse o mesmo processo. Para suspeita de fraude, acione prontamente a instituição pelo canal oficial e preserve registros. O mecanismo de análise de fraude não constitui promessa de recuperação integral nem substitui a avaliação do caso. O curso não fixa prazos operacionais que possam mudar.',
      ] },
      { title: 'Caso resolvido: pedido de devolução para outra conta', paragraphs: [
        'Uma pessoa envia uma imagem de comprovante e pede que o valor seja devolvido para uma chave diferente. O recebedor primeiro consulta seu próprio extrato no canal oficial. Se houve recebimento que precisa ser devolvido, utiliza a função da transação original, e não a nova chave sugerida. Se o valor não aparece, não envia dinheiro com base na imagem. A situação pode exigir comunicação à instituição para esclarecimento.',
        'O caso mostra duas conferências complementares: existência da transação e destino do retorno. Mesmo um comprovante verdadeiro não justifica aceitar uma instrução para conta diferente. O procedimento evita transformar uma devolução em uma nova transferência sem vínculo. A documentação do atendimento preserva os fatos, sem compartilhar senhas, códigos de autenticação ou imagens de telas que exponham dados desnecessários.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe um fluxo fictício que diferencie pagamento solicitado, agendado e concluído. Elabore uma conferência antes de confirmar um Pix, incluindo valor e destinatário. Acrescente uma mensagem com pedido de devolução a outra conta e explique o uso da funcionalidade original após verificar o extrato. Use dados inventados e não realize transferência. Revise se o fluxo evita tratar imagem de comprovante como única prova e se uma suspeita é levada ao canal oficial sem promessa de restituição automática.',
      ] },
    ],
  },
  {
    title: 'Segurança de acesso, atendimento e registro de uma divergência',
    skills: ['encaminhar-divergencia-bancaria-segura'], sourceIds: ['bcb-seguranca-pix', 'bcb-glossario', 'mj-conta'],
    sections: [
      { title: 'Ensino: confirmar o canal é parte da verificação', paragraphs: [
        'Uma mensagem pode imitar o nome e a aparência de uma instituição e pedir ação urgente. Não confie apenas no logotipo, no identificador exibido de chamada ou em um link recebido. Para esclarecer, procure o canal oficial de forma independente, sem usar os contatos fornecidos pela própria mensagem suspeita. Senhas e códigos de autenticação permitem acesso ou autorização e não devem ser informados a quem os solicita sob pretexto de bloquear uma fraude.',
        'No atendimento legítimo, diferencie informação de produto, autorização de operação e encaminhamento de reclamação. Não execute uma movimentação que não compreendeu para supostamente receber ajuda. Descrição, data, valor e protocolo ajudam a localizar uma divergência sem divulgar toda a vida financeira em canais abertos. Se a conta foi comprometida, a resposta exige contato imediato com a instituição e medidas pelos meios oficiais, preservando evidências do ocorrido.',
        'A busca de solução acompanha o fluxo de atendimento e os canais competentes, como a ouvidoria da instituição e as autoridades aplicáveis. Uma reclamação ao Banco Central não deve ser apresentada como julgamento automático de um conflito individual nem como garantia de ressarcimento. Mantenha registros do que foi solicitado e respondido. A segurança também inclui conferir permissões, proteger dispositivos e evitar que dados de autenticação circulem em capturas de tela durante uma tentativa de suporte.',
      ] },
      { title: 'Caso resolvido: falsa central pede código e transferência', paragraphs: [
        'Uma ligação informa que há fraude na conta e exige um código de autenticação e uma transferência para conta segura. A urgência é um sinal para interromper a interação, não para dispensar conferência. A pessoa procura a instituição por um canal oficial obtido independentemente e relata a solicitação, sem entregar o código ou executar o pagamento. A conta indicada por quem ligou não se torna segura por receber esse nome.',
        'Se alguma operação já ocorreu, a comunicação ao banco precisa ser imediata e acompanhada das informações disponíveis. Não se promete que o dinheiro será recuperado, nem se apagam as mensagens antes de preservar os registros úteis. O caso relaciona prevenção e resposta: confirmar o canal reduz o risco de entregar novos acessos enquanto se tenta resolver uma movimentação suspeita. O protocolo permite acompanhar o retorno sem repetir informações sensíveis a interlocutores não verificados.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Escreva um relato fictício de cobrança divergente com data, valor, descrição e solicitação de esclarecimento, sem incluir senha ou código. Descreva como localizar um canal oficial independentemente de uma mensagem recebida. Crie uma falsa solicitação de transferência para conta segura e explique a decisão de interromper e conferir. Não utilize conta real. Revise se o encaminhamento preserva evidências e acompanha resposta, distinguindo reclamação de promessa de ressarcimento e evitando expor dados em grupos abertos.',
      ] },
    ],
  },
];
const activities = [
  { module: 1, skill: 'distinguir-funcoes-sfn', prompt: 'Uma empresa usa o nome do Banco Central para afirmar que todo produto é garantido. Qual análise é adequada?', options: ['Supervisão equivale a recomendação de qualquer produto.', 'CMN é um banco que paga a dívida.', 'O nome do órgão elimina todo risco.', 'É necessário distinguir autorização, produto e eventual proteção específica; supervisão não é garantia geral.'] },
  { module: 2, skill: 'interpretar-produtos-extrato-bancario', prompt: 'O extrato apresenta saldo próprio e limite de crédito separados. O limite deve ser interpretado como:', options: ['Possibilidade de crédito conforme condições, não renda ou dinheiro próprio sem custo.', 'Depósito recebido.', 'Rentabilidade já realizada.', 'Patrimônio sem obrigação de pagamento.'] },
  { module: 3, skill: 'comparar-custo-credito', prompt: 'Uma proposta tem parcela menor e prazo maior. Para comparar o custo, é necessário:', options: ['Escolher sempre a menor parcela.', 'Ignorar encargos.', 'Examinar fluxo, valor recebido, prazo, encargos e CET em base comparável.', 'Somar taxas incompatíveis e chamar de CET.'] },
  { module: 4, skill: 'conferir-transacao-pagamento', prompt: 'Alguém pede devolução de Pix para outra chave. Qual cuidado foi ensinado?', options: ['Enviar novo Pix para qualquer chave indicada.', 'Conferir recebimento no extrato e usar a função de devolução da transação original quando cabível.', 'Confiar apenas na imagem enviada.', 'Entregar código de autenticação para confirmar.'] },
  { module: 5, skill: 'encaminhar-divergencia-bancaria-segura', prompt: 'Uma ligação exige código de autenticação e transferência para conta segura. A ação adequada é:', options: ['Cumprir pela urgência.', 'Usar apenas o contato fornecido por quem ligou.', 'Enviar código e depois reclamar.', 'Interromper e procurar o canal oficial independentemente, sem executar a solicitação.'] },
];
const exam = [
  { module: 1, skill: 'distinguir-funcoes-sfn', prompt: 'No mapa institucional estudado, o CMN se relaciona a:', options: ['Políticas e diretrizes no campo da moeda e do crédito.', 'Atendimento de conta-corrente como banco comercial.', 'Garantia de todo investimento privado.', 'Venda direta de qualquer produto.'] },
  { module: 1, skill: 'distinguir-funcoes-sfn', prompt: 'BC e CVM devem ser entendidos como:', options: ['Siglas intercambiáveis de um banco.', 'Instituições com exatamente toda a mesma competência.', 'Operadores de todas as contas dos clientes.', 'Entidades supervisoras com competências próprias em seus âmbitos.'] },
  { module: 2, skill: 'interpretar-produtos-extrato-bancario', prompt: 'Uma conta inicia com R$600, recebe R$150 e tem saídas de R$90 e R$40, sem outros lançamentos. O saldo final é:', options: ['R$880.', 'R$620.', 'R$320.', 'R$750.'] },
  { module: 2, skill: 'interpretar-produtos-extrato-bancario', prompt: 'Liquidez e rentabilidade:', options: ['São sempre a mesma medida.', 'Dispensam leitura de condições.', 'Tratam de disponibilidade de recursos e remuneração, conceitos diferentes.', 'Garantem ausência de risco em qualquer aplicação.'] },
  { module: 3, skill: 'comparar-custo-credito', prompt: 'R$800 a 2% ao mês por dois meses, sem pagamentos ou encargos, no modelo composto, resultam em:', options: ['R$832,32.', 'R$832,00.', 'R$816,00.', 'R$960,00.'] },
  { module: 3, skill: 'comparar-custo-credito', prompt: 'O CET permite considerar:', options: ['Somente o número de parcelas.', 'Apenas a taxa publicitária.', 'Somente o principal.', 'Juros e demais despesas e encargos pertinentes ao custo da operação.'] },
  { module: 4, skill: 'conferir-transacao-pagamento', prompt: 'Uma imagem de comprovante recebida por mensagem:', options: ['Substitui sempre o registro da instituição.', 'Exige conferência do efetivo estado da transação no canal responsável.', 'Comprova que todo agendamento foi concluído.', 'Dispensa conferir valor e destinatário.'] },
  { module: 4, skill: 'conferir-transacao-pagamento', prompt: 'Antes de confirmar um Pix por QR Code, é necessário:', options: ['Ignorar os dados por ser código.', 'Confiar na aparência gráfica.', 'Conferir valor e destinatário apresentados pela instituição.', 'Enviar senha ao recebedor.'] },
  { module: 5, skill: 'encaminhar-divergencia-bancaria-segura', prompt: 'Uma reclamação financeira deve preservar:', options: ['Fatos, registros e protocolos em canais adequados, sem promessa automática de ressarcimento.', 'Somente a urgência da mensagem.', 'Senhas compartilhadas para facilitar.', 'Dados abertos para qualquer interlocutor.'] },
  { module: 5, skill: 'encaminhar-divergencia-bancaria-segura', prompt: 'Para conferir uma mensagem suspeita, o canal deve ser:', options: ['Apenas o link recebido.', 'Qualquer número sugerido pelo interlocutor.', 'O primeiro perfil com logotipo parecido.', 'Obtido de forma independente nos meios oficiais da instituição.'] },
];
export const courseRevision = defineCourse({
  courseId: '2fec1298-c9e5-49d1-af84-3b1135b514ad', slug: 'conhecimentos-bancarios', courseName: 'Conhecimentos Bancários', hours: 100,
  audience: 'Estudantes de fundamentos do SFN, produtos, custos, pagamentos e atendimento seguro, com simulações educacionais sem recomendação individual de contratação.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'cvm-sfn', title: 'CVM — O Sistema Financeiro Nacional', url: 'https://www.gov.br/investidor/pt-br/investir/como-investir/conheca-o-mercado-de-capitais/sistema-financeiro-nacional/o-sistema-financeiro-nacional' },
    { id: 'bcb-regulacao', title: 'Banco Central — Regulação do sistema financeiro', url: 'https://www.bcb.gov.br/estabilidadefinanceira/regulacao' },
    { id: 'bcb-glossario', title: 'Banco Central — Glossário simplificado de termos financeiros', url: 'https://www.bcb.gov.br/content/cidadaniafinanceira/documentos_cidadania/Informacoes_gerais/glossario_cidadania_financeira.pdf' },
    { id: 'bcb-caderno', title: 'Banco Central — Caderno de educação financeira', url: 'https://www.bcb.gov.br/content/cidadaniafinanceira/documentos_cidadania/Cuidando_do_seu_dinheiro_Gestao_de_Financas_Pessoais/caderno_cidadania_financeira.pdf' },
    { id: 'bcb-pix', title: 'Banco Central — Perguntas frequentes Pix', url: 'https://www.bcb.gov.br/meubc/faqs/s/pix' },
    { id: 'bcb-seguranca-pix', title: 'Banco Central — Segurança no Pix', url: 'https://www.bcb.gov.br/estabilidadefinanceira/pix-seguranca' },
    { id: 'mj-conta', title: 'Ministério da Justiça — Conta invadida e transações não reconhecidas', url: 'https://www.gov.br/mj/pt-br/acesso-a-informacao/acoes-e-programas/sofri-um-golpe-e-agora/invadiram-minha-conta' },
  ],
}, modules, activities, exam);
export default courseRevision;
