import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Item, unidade e recebimento com documento correspondente',
    skills: ['conferir-item-unidade-documento'], sourceIds: ['mg-almoxarifado', 'ro-estoque'],
    sections: [
      { title: 'Ensino: unidade comercial e unidade de controle precisam se relacionar', paragraphs: [
        'O controle começa por identificar o item e sua unidade de movimentação. Caixa, pacote, peça e quilograma não são quantidades intercambiáveis. Uma compra pode chegar em caixas e o estoque ser controlado por unidades, exigindo fator de conversão definido. O cadastro deve distinguir itens semelhantes, variantes e especificações relevantes. Corrigir uma descrição não autoriza misturar produtos que têm características diferentes ou alterar o código para acomodar uma divergência recebida.',
        'O recebimento compara pedido, documentação e material efetivamente apresentado. Quantidade, identidade, integridade e condições pertinentes são conferidas antes de disponibilizar para uso ou expedição. Registro de chegada e aceitação podem ser etapas distintas. Se há avaria ou falta, registre e encaminhe a decisão pelo fluxo responsável. Não registre a quantidade esperada como se tivesse sido recebida apenas porque consta no pedido. Um saldo incorreto na entrada se propagará para reserva, venda e faturamento.',
        'Documentos e movimentos precisam de referência rastreável: data, item, unidade, origem e responsável. Importar dados de um arquivo não comprova que o físico corresponde ao conteúdo. A equipe deve conhecer como o sistema evita duplicidade quando a mesma entrada é processada novamente. O curso utiliza simulações administrativas, sem emitir documentos fiscais, alterar sistemas reais ou determinar classificação tributária. A aprendizagem está em relacionar dados e identificar o que ainda exige conferência.',
      ] },
      { title: 'Caso resolvido: caixas convertidas e diferença de quantidade', paragraphs: [
        'Uma entrega fictícia contém oito caixas identificadas com doze unidades cada. A quantidade física conferida é 96 unidades. O documento e o pedido indicam 100 unidades. A diferença de quatro não deve ser escondida alterando o fator de conversão nem registrando 100 no estoque. A ocorrência segue o fluxo de recebimento e decisão, com o que foi efetivamente encontrado e a documentação correspondente.',
        'Se o sistema usa peça como unidade, a equipe registra o fator de doze e a quantidade conforme a decisão validada, preservando a referência da entrega. Inserir oito peças porque havia oito caixas também estaria errado. O caso demonstra duas conferências: unidade de medida e correspondência de quantidade. Um documento formal não substitui a observação física e uma contagem correta perde sentido se a unidade estiver errada.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte um cadastro fictício com três itens e unidades de compra e controle, explicitando conversões válidas. Simule uma entrega de cinco caixas com dez peças cada e compare com um pedido de 52 peças. Registre a divergência sem escolher sozinho sua solução comercial ou fiscal. Acrescente um arquivo importado duas vezes e descreva o resultado que o controle deveria impedir. Confira se o exercício separa quantidade prevista e recebida e se cada movimento mantém referência verificável.',
      ] },
    ],
  },
  {
    title: 'Reserva, separação, expedição e baixa sem duplicidade',
    skills: ['relacionar-reserva-e-movimento-fisico'], sourceIds: ['mg-almoxarifado', 'ro-estoque'],
    sections: [
      { title: 'Ensino: reservado, separado e expedido representam estados diferentes', paragraphs: [
        'O saldo físico representa a quantidade registrada como existente; reserva vincula uma parte a determinada demanda; disponível depende das regras do sistema. No modelo desta aula, disponível é físico menos reservado. Separar um item para um pedido não significa que ele já saiu do local nem que foi faturado ou pago. Cada evento precisa ter definição e responsável, para que a equipe saiba quando a quantidade muda e qual referência permite conferir a operação.',
        'Na expedição de uma quantidade já reservada, o modelo reduz o físico e a reserva correspondente, sem subtrair o mesmo item duas vezes do disponível. Uma entrega parcial exige preservar a parte ainda pendente e a correspondência com o pedido. Se uma reserva é cancelada antes da saída, ela pode ser liberada conforme o fluxo, sem criar entrada física fictícia. O desenho exato varia por sistema, mas as definições precisam ser claras e coerentes com o que ocorreu.',
        'A conferência de separação relaciona item, variante, unidade, quantidade e destino. Um pedido correto não impede erro na retirada de um produto parecido. A confirmação de expedição deve representar o evento efetivo e não ser marcada antecipadamente para limpar a fila. Quando há integração, mensagem repetida não deve gerar segunda baixa. Se um retorno de comunicação é perdido, consulte o estado antes de reenviar uma ação que pode duplicar seu efeito. Essas regras são verificadas em ambiente de teste, sem movimentar estoque real no curso.',
      ] },
      { title: 'Caso resolvido: expedir parte da quantidade reservada', paragraphs: [
        'O controle fictício mostra 120 unidades físicas e 35 reservadas, portanto 85 disponíveis no modelo. São expedidas 30 unidades dessa reserva. O físico passa a 90 e a reserva restante a 5; o disponível continua 85. Subtrair 30 novamente do disponível após aplicar as duas mudanças produziria uma duplicidade. O resultado só faz sentido se a saída corresponde realmente à reserva citada e não há outros movimentos no intervalo.',
        'Se as cinco restantes forem canceladas antes de sair, a reserva é liberada e o físico permanece 90; o disponível passa a 90. Não houve devolução de mercadoria, pois essas unidades nunca saíram. O caso distingue cancelamento de demanda e retorno físico. O sistema deve manter a referência e os estados para que outra pessoa consiga reconstruir a operação, em vez de ajustar o saldo diretamente sem explicação.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Em uma planilha fictícia, crie saldo físico, reservado e disponível pela regra da aula. Simule reserva, expedição parcial e cancelamento do restante, mostrando cada estado sem dupla subtração. Acrescente uma confirmação repetida e indique que o efeito não deve ocorrer duas vezes. Não use sistema de produção. Confira se cada operação tem referência de pedido e se separado, expedido e faturado permanecem distintos. Explique por que cancelar algo que não saiu não autoriza criar uma entrada física.',
      ] },
    ],
  },
  {
    title: 'Inventário e custo médio ponderado em um modelo de controle',
    skills: ['calcular-custo-e-investigar-diferenca'], sourceIds: ['ro-estoque', 'mg-almoxarifado'],
    sections: [
      { title: 'Ensino: quantidade e valor são controles relacionados, mas diferentes', paragraphs: [
        'O inventário confronta quantidade física e registro em uma data ou corte definidos. Movimentos durante a contagem precisam de controle para não comparar momentos diferentes. A diferença pode decorrer de erro de unidade, registro pendente, item em outro endereço, duplicidade ou perda, entre outras causas. Não conclua desvio intencional apenas por uma divergência. Recontagem, documentos e histórico sustentam a análise antes de um ajuste autorizado.',
        'Custo unitário e preço de venda não são sinônimos. Um modelo de custo médio ponderado divide o valor total do saldo e da nova entrada pela quantidade total correspondente. A ponderação considera quantidades diferentes; fazer média simples dos dois preços só funciona em condições particulares, como quantidades iguais. Os exemplos assumem que os custos informados já são os definidos para o modelo e não tratam de tributos recuperáveis, despesas adicionais ou política contábil de uma empresa real.',
        'Quando uma saída é avaliada pelo custo médio vigente no modelo, o valor do movimento é quantidade vezes custo médio. Isso não é faturamento, que pode usar preço de venda e outros componentes da operação. O método aplicável e sua contabilização dependem das regras e da orientação competente; não se transforma uma simulação em obrigação universal. O objetivo é compreender como o sistema relaciona quantidade, custo e valor e como conferir se uma conta é plausível.',
      ] },
      { title: 'Caso resolvido: média com lotes de tamanhos diferentes', paragraphs: [
        'Há vinte unidades com custo unitário de R$ 10 e entram trinta com custo de R$ 14, sem outros componentes no exemplo. O valor é 20×10+30×14=R$ 620 para cinquenta unidades. O custo médio é 620/50=R$ 12,40. Uma média simples de 10 e 14 daria R$ 12 e ignoraria que a quantidade da segunda entrada é maior. O valor correto fica entre os custos e mais próximo do preço do lote maior.',
        'Uma saída de oito unidades, sem nova entrada ou alteração de custo, corresponde a 8×12,40=R$ 99,20 no modelo. Restam 42 unidades e R$ 520,80 de valor. Se o inventário depois encontra apenas 41, a diferença de uma unidade precisa de investigação e ajuste autorizado, não de modificação silenciosa do custo médio para fazer o valor coincidir. A contagem e o método de avaliação respondem a perguntas diferentes.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Calcule o custo médio de dez unidades a R$ 8 e trinta a R$ 12, assumindo custos já definidos e sem outros movimentos. Avalie uma saída de cinco unidades e confira quantidade e valor remanescentes. Em outra situação, descreva uma diferença de inventário com duas hipóteses e os documentos necessários para investigá-las. Use dados fictícios. Revise se a ponderação considera quantidades, se preço de venda não foi usado como custo e se nenhum ajuste é proposto sem recontagem e aprovação responsável.',
      ] },
    ],
  },
  {
    title: 'Faturamento e documentos fiscais eletrônicos: correspondência e estado',
    skills: ['distinguir-documento-fiscal-e-operacao'], sourceIds: ['portal-nfe', 'sefaz-documentos'],
    sections: [
      { title: 'Ensino: pedido comercial, documento fiscal e cobrança não são equivalentes', paragraphs: [
        'O pedido registra a demanda e as condições comerciais aprovadas; o documento fiscal atende à operação e às regras aplicáveis; a cobrança acompanha a obrigação de pagamento. A criação de um deles não comprova os demais eventos. O tipo documental e o momento adequado dependem da operação, da legislação e da orientação fiscal responsável. O curso não determina CFOP, NCM, alíquota ou tratamento tributário para uma situação real, nem ensina emitir ou cancelar documento em produção.',
        'A NF-e é um documento eletrônico; seu XML contém dados estruturados e assinatura, e a autorização de uso integra o fluxo fiscal. O DANFE é sua representação auxiliar e não deve ser confundido com o arquivo eletrônico ou com uma confirmação de pagamento. Uma impressão ou um PDF isolados não comprovam, por si sós, o estado atual da NF-e. O status deve ser conferido pelos canais oficiais e pelo procedimento adequado, considerando as situações legais específicas, como contingência quando aplicável.',
        'Autorização de uso verifica aspectos formais previstos pelo Fisco, não garante que todo o mérito da operação, a mercadoria física ou o recebimento financeiro estejam corretos. Confira emitente, destinatário, itens, unidades, quantidades e valores com as referências da operação. Documentos de modelos diferentes, como os relativos a serviços, têm fluxos próprios; não se aplicam automaticamente as mesmas regras da NF-e de mercadorias. Uma divergência deve chegar ao responsável fiscal antes de ser corrigida por uma solução improvisada.',
      ] },
      { title: 'Caso resolvido: PDF disponível e operação ainda divergente', paragraphs: [
        'Um pedido fictício contém um item com unidade definida, mas o documento apresentado usa outra unidade sem conversão comprovada. A existência de um PDF não resolve a divergência. A equipe confere os dados eletrônicos e o estado fiscal pelos meios pertinentes e encaminha a análise da unidade e da operação ao responsável. Não altera o estoque ou a impressão para esconder a diferença. As referências precisam permanecer relacionadas para permitir correção adequada.',
        'Em outro caso, o documento está autorizado, mas a conferência física identifica quantidade diferente. A autorização não dispensa investigar a entrega e os registros. O caso mostra que controle fiscal e físico se complementam sem serem a mesma evidência. A solução depende do fluxo comercial e fiscal, não de concluir que o material está correto apenas porque houve um protocolo de autorização.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe um fluxo fictício que separe pedido, documento fiscal, expedição e cobrança, indicando quais referências os relacionam. Escreva uma conferência de XML e estado documental sem usar nota real ou emitir qualquer documento. Acrescente uma divergência de unidade e explique quem precisa avaliá-la. Não escolha tributos ou códigos fiscais. Revise se o DANFE não é confundido com comprovante de recebimento financeiro e se autorização formal não é apresentada como prova de toda a operação material.',
      ] },
    ],
  },
  {
    title: 'Recebimentos, devoluções e conciliação entre os controles',
    skills: ['conciliar-estoque-fiscal-financeiro'], sourceIds: ['mg-almoxarifado', 'portal-nfe', 'sefaz-documentos'],
    sections: [
      { title: 'Ensino: cada evento tem efeito próprio e precisa de confirmação', paragraphs: [
        'Faturar não significa receber dinheiro, assim como receber uma transferência não prova automaticamente a qual pedido ela pertence. A conciliação relaciona cliente, referência, valor, data e estado, com evidência do canal responsável. Uma captura de comprovante recebida por mensagem não substitui confirmação financeira. Recebimento parcial deve deixar saldo pendente claro. Desconto, juros, tarifa ou abatimento só entram no cálculo conforme os fatos e aprovações aplicáveis, sem ajuste inventado para fechar a conta.',
        'Uma devolução pode envolver retorno físico, avaliação da condição do item, documento fiscal e efeito financeiro, cada um com seu fluxo. Chegar uma caixa ao depósito não comprova que o item está liberado para venda nem que um estorno foi efetivado. Confira identidade, quantidade, motivo registrado e condição, segregando o que depende de análise. O encaminhamento fiscal é feito por responsável competente. Cancelar um documento ou uma demanda não cria automaticamente um movimento físico que nunca ocorreu.',
        'Os controles devem permitir reconstruir o histórico sem apagar a operação anterior. Referências e eventos de correção evitam que uma diferença reapareça em outro setor. A mesma confirmação repetida não deve duplicar baixa, entrada ou recebimento. No fechamento, compare o que foi pedido, movimentado, documentado e pago, destacando pendências e quem as acompanha. A conclusão é evidência de resultado correspondente, não apenas a marcação de uma tarefa enviada a outra pessoa.',
      ] },
      { title: 'Caso resolvido: faturamento com recebimento parcial', paragraphs: [
        'Uma obrigação fictícia de R$ 1.500 tem recebimento confirmado de R$ 600, sem desconto, juros, tarifa ou outro evento no exemplo. O saldo a receber é R$ 900. O estoque já teve o movimento correspondente, mas isso não permite marcar o pagamento total. A conciliação mantém o recebido e o pendente separados, com referência da operação. Uma segunda mensagem do mesmo recebimento não pode acrescentar outros R$ 600.',
        'Depois, chega uma devolução a avaliar. A equipe não coloca o item diretamente no disponível nem muda o saldo financeiro antes de cumprir as decisões e registros pertinentes. O retorno físico, o tratamento fiscal e o efeito financeiro precisam de correspondência, mas não são um único clique universal. O caso demonstra por que estados distintos evitam venda de item impróprio, duplicidade de crédito e fechamento de conta sem fato comprovado.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie uma obrigação fictícia com dois recebimentos parciais e calcule o pendente sem outros encargos, explicitando a hipótese. Acrescente uma mensagem repetida e mostre que não muda o resultado. Desenhe uma devolução com conferência física, análise, responsável fiscal e confirmação financeira quando cabível. Não emita documento ou realize estorno real. Revise se cada controle mantém referência e histórico e se a caixa recebida, o documento e o dinheiro não são tratados como evidências intercambiáveis.',
      ] },
    ],
  },
];
const activities = [
  { module: 1, skill: 'conferir-item-unidade-documento', prompt: 'Chegam seis caixas com dez unidades cada, mas o pedido indica 64 unidades. Qual registro evita esconder a divergência?', options: ['Registrar 64 por constar no pedido.', 'Registrar o físico conferido de 60 unidades e encaminhar a diferença pelo fluxo responsável.', 'Alterar o fator para coincidir.', 'Registrar seis peças.'] },
  { module: 2, skill: 'relacionar-reserva-e-movimento-fisico', prompt: 'No modelo disponível=físico−reservado, cancelar reserva antes da saída:', options: ['Sempre cria entrada física.', 'Exige segunda baixa.', 'Libera a reserva conforme o fluxo, sem inventar retorno físico.', 'Comprova faturamento pago.'] },
  { module: 3, skill: 'calcular-custo-e-investigar-diferenca', prompt: 'Uma divergência de inventário deve levar a:', options: ['Recontagem e análise de histórico e documentos antes de ajuste autorizado.', 'Acusação automática de desvio.', 'Mudança silenciosa de custo para coincidir.', 'Exclusão do movimento sem referência.'] },
  { module: 4, skill: 'distinguir-documento-fiscal-e-operacao', prompt: 'Uma NF-e autorizada comprova automaticamente que a quantidade física recebida está correta?', options: ['Sim, por todo mérito ser garantido.', 'Sim, dispensa contagem.', 'Sim, se há PDF.', 'Não; autorização formal e correspondência física são verificações diferentes.'] },
  { module: 5, skill: 'conciliar-estoque-fiscal-financeiro', prompt: 'Uma devolução chega ao depósito. O retorno físico:', options: ['Comprova estorno financeiro.', 'Exige conferência e fluxos correspondentes, sem liberar item ou crédito automaticamente.', 'Dispensa análise de condição.', 'Apaga a operação anterior.'] },
];
const exam = [
  { module: 1, skill: 'conferir-item-unidade-documento', prompt: 'Sete caixas com oito peças cada correspondem a:', options: ['15 peças.', '7 peças.', '56 peças.', '78 peças.'] },
  { module: 1, skill: 'conferir-item-unidade-documento', prompt: 'Importar um arquivo de recebimento:', options: ['Não substitui conferir correspondência com o físico e evitar duplicidade.', 'Cria a mercadoria faltante.', 'Comprova integridade de toda entrega.', 'Dispensa unidade de controle.'] },
  { module: 2, skill: 'relacionar-reserva-e-movimento-fisico', prompt: 'Há 80 unidades físicas e 20 reservadas. Saem 15 dessa reserva, sem outros eventos. No modelo da aula, físico/reservado/disponível ficam:', options: ['65/20/45.', '65/5/60.', '80/5/75.', '65/0/65.'] },
  { module: 2, skill: 'relacionar-reserva-e-movimento-fisico', prompt: 'Uma confirmação repetida da mesma expedição deve:', options: ['Baixar novamente para garantir.', 'Criar pedido novo.', 'Eliminar referência anterior.', 'Ser tratada sem duplicar o efeito do movimento.'] },
  { module: 3, skill: 'calcular-custo-e-investigar-diferenca', prompt: 'Dez unidades a R$ 6 e trinta a R$ 10, com custos já definidos e sem outros componentes, geram custo médio de:', options: ['R$ 8.', 'R$ 10.', 'R$ 9.', 'R$ 16.'] },
  { module: 3, skill: 'calcular-custo-e-investigar-diferenca', prompt: 'Custo médio e preço de venda:', options: ['São conceitos diferentes; avaliar a saída a custo não é faturamento pelo preço comercial.', 'São sempre iguais.', 'Dispensam política e orientação contábil.', 'Podem ser trocados para ajustar inventário.'] },
  { module: 4, skill: 'distinguir-documento-fiscal-e-operacao', prompt: 'O DANFE é:', options: ['O recebimento financeiro.', 'Prova automática de entrega correta.', 'Substituto de todo arquivo e status fiscal.', 'Representação auxiliar da NF-e, diferente do documento eletrônico e da confirmação de pagamento.'] },
  { module: 4, skill: 'distinguir-documento-fiscal-e-operacao', prompt: 'Uma divergência fiscal de unidade ou classificação deve:', options: ['Ser escondida na impressão.', 'Chegar ao responsável competente, mantendo referências e dados para análise.', 'Ser resolvida com código inventado.', 'Alterar silenciosamente o estoque para coincidir.'] },
  { module: 5, skill: 'conciliar-estoque-fiscal-financeiro', prompt: 'Uma obrigação de R$ 1.300 tem recebimento confirmado de R$ 450, sem outros eventos. O pendente é:', options: ['R$ 1.750.', 'R$ 450.', 'R$ 850.', 'R$ 950.'] },
  { module: 5, skill: 'conciliar-estoque-fiscal-financeiro', prompt: 'A conciliação final relaciona:', options: ['Pedido, movimento, documento e pagamento, com pendências e histórico de eventos.', 'Somente tarefas enviadas.', 'Apenas a imagem de um comprovante.', 'Um ajuste sem referência para fechar os totais.'] },
];
export const courseRevision = defineCourse({
  courseId: 'd6e53b45-785c-4234-a9ba-3a122357b230', slug: 'estoque-e-faturamento', courseName: 'Estoque e Faturamento', hours: 100,
  audience: 'Estudantes de controle operacional de estoque e faturamento, com simulações de quantidade, custo, documento e recebimento; sem emissão fiscal ou definição tributária real.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'mg-almoxarifado', title: 'MG — Manual de gestão de almoxarifados', url: 'https://www.mg.gov.br/planejamento/documento/manual-gestao-de-almoxarifados' },
    { id: 'ro-estoque', title: 'Governo de Rondônia — Estoque e custo médio no e-Estado', url: 'https://documentos.sistemas.ro.gov.br/books/e-estado-modulo-almoxarifado/page/estoque' },
    { id: 'portal-nfe', title: 'Portal Nacional da NF-e — Conceito, autorização e documento auxiliar', url: 'https://www.nfe.fazenda.gov.br/portal/perguntasFrequentes.aspx?tipoConteudo=auR4yGlWmRY%3D' },
    { id: 'sefaz-documentos', title: 'Sefaz PE — Documentos fiscais eletrônicos e canais oficiais', url: 'https://www.sefaz.pe.gov.br/Servicos/ICMS/Paginas/Documentos_Fiscais.aspx' },
  ],
}, modules, activities, exam);
export default courseRevision;
