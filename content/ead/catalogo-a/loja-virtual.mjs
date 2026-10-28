import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Proposta da loja, domínio e escolha da plataforma',
    skills: ['planejar-estrutura-loja-virtual'], sourceIds: ['sebrae-loja', 'registro-dominio'],
    sections: [
      { title: 'Ensino: criar uma loja começa pelo percurso que ela precisa atender', paragraphs: [
        'Defina público, produtos, região atendida e capacidade de entrega antes de escolher a aparência da loja. Uma operação de itens sob encomenda tem necessidades diferentes de um catálogo com estoque pronto e muitas variações. O planejamento relaciona o que será oferecido, como o pedido será recebido e como chegará ao consumidor. Não basta publicar uma vitrine se preço, disponibilidade, pagamento e entrega não conseguem funcionar juntos.',
        'Domínio é o nome que ajuda a localizar serviços na Internet; plataforma é o sistema que organiza catálogo, carrinho e pedidos; hospedagem mantém a aplicação e seus dados disponíveis. Uma contratação pode reunir esses elementos, mas registrar um domínio não cria automaticamente uma loja funcional. Controle titularidade, acessos e renovação. Não deixe o único acesso administrativo preso à conta pessoal de um prestador sem um plano de continuidade para o negócio.',
        'Compare plataformas por requisitos concretos: variantes de produtos, cálculo de entrega, integrações de pagamento, gestão de estoque, acessibilidade, exportação de dados e suporte. Considere custo de implantação, mensalidade e cobranças variáveis conforme o contrato, em vez de apenas uma promoção inicial. Antes de decidir, desenhe uma compra completa e verifique como cada requisito será atendido. O teste pode usar ambiente de demonstração e dados fictícios, sem abrir uma loja pública ou contratar serviços para concluir este curso.',
      ] },
      { title: 'Caso resolvido: vitrine pronta, frete incompatível', paragraphs: [
        'Uma loja fictícia venderá peças frágeis para três regiões, mas a plataforma escolhida só apresenta um frete fixo que não corresponde à operação planejada. O visual aprovado não resolve a incompatibilidade. A equipe revisa o requisito de entrega, as integrações disponíveis e os custos antes de publicar. Se não há uma solução viável, precisa ajustar a escolha ou o recorte da operação, mantendo a oferta verdadeira.',
        'O domínio já registrado continua sendo um recurso útil, mas não prova que o catálogo e a compra estão prontos. A entrega do projeto deve demonstrar uma jornada funcional, não apenas a página inicial. O caso ensina a transformar uma intenção comercial em critérios verificáveis: endereço, plataforma, pagamento e logística são partes relacionadas, com responsabilidades que precisam estar claras.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Descreva uma loja fictícia com público, cinco produtos e região de entrega. Monte uma tabela de requisitos e compare duas plataformas imaginárias sem indicar marcas ou contratar planos. Diferencie domínio, plataforma e hospedagem e identifique quem controlaria os acessos do negócio. Desenhe a jornada da busca ao recebimento. Confira se há uma forma realista de atender cada requisito e se o critério de escolha vai além de um tema visual ou de uma mensalidade promocional isolada.',
      ] },
    ],
  },
  {
    title: 'Catálogo, variantes, estoque e página do produto',
    skills: ['organizar-catalogo-e-estoque-digital'], sourceIds: ['sebrae-loja', 'decreto-ecommerce', 'senacon-compras'],
    sections: [
      { title: 'Ensino: o item comprado precisa corresponder ao que será separado', paragraphs: [
        'O catálogo organiza produtos em categorias compreensíveis e páginas com informação suficiente para uma decisão. Nome, características, medidas, composição ou especificações pertinentes devem corresponder ao item real. Fotografias ajudam a mostrar, mas não substituem descrição clara. Texto alternativo e informações que não dependam apenas de cor ampliam o acesso. Não use uma imagem de uma versão para sugerir que todas as variantes têm exatamente o mesmo aspecto.',
        'Uma variante combina características relevantes, como tamanho e cor, e precisa de identificação própria quando há controle separado. SKU é um código interno que ajuda a relacionar catálogo, estoque e pedido. Camiseta azul pequena e azul grande podem ter quantidades diferentes. Somar tudo em um único saldo pode permitir vender uma combinação inexistente. A descrição visível e o código operacional têm funções complementares: o cliente precisa compreender a escolha e a equipe precisa separar o item correspondente.',
        'Defina como a plataforma trata disponível, reservado e vendido, inclusive em pedidos ainda aguardando pagamento. A regra deve evitar venda duplicada e prever liberação de reserva conforme o fluxo. Estoque físico e informação online precisam ser conciliados. Cadastrar cem unidades na tela não cria cem unidades reais. Se a produção é sob encomenda, disponibilidade e prazo precisam ser apresentados como tal, sem simular envio imediato de algo que ainda será produzido.',
      ] },
      { title: 'Caso resolvido: saldo total esconde variante esgotada', paragraphs: [
        'O estoque fictício tem quatro camisetas verdes pequenas e seis verdes grandes. O catálogo mostra dez unidades de camiseta verde sem permitir identificar a disponibilidade por tamanho. Um pedido de pequena não pode ser atendido usando automaticamente uma grande. A correção é organizar a identificação e a quantidade por variante, com a correspondência no pedido e na separação. O total da família não substitui o saldo do item escolhido.',
        'Após reservar duas pequenas para pedidos em andamento, a quantidade disponível depende da regra de reserva implementada. A equipe precisa testar a alteração e o cancelamento, sem subtrair duas vezes o mesmo movimento. O caso mostra por que catálogo não é apenas texto de divulgação: sua estrutura interfere na promessa de entrega e na operação que ocorrerá depois do pagamento.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie um catálogo fictício com dois produtos e quatro variantes identificadas por SKU. Escreva uma página com descrição, medidas pertinentes, preço e condição de disponibilidade, usando imagens apenas se houver direito de uso. Monte uma tabela com físico, reservado e disponível e simule a liberação de uma reserva cancelada. Explique como impedir que uma cor ou tamanho inexistente seja vendido pelo saldo total da família. Revise se a descrição e o pedido permitem separar exatamente o item escolhido.',
      ] },
    ],
  },
  {
    title: 'Carrinho, frete, pagamento e estados do pedido',
    skills: ['testar-fluxo-compra-online'], sourceIds: ['sebrae-loja', 'decreto-ecommerce', 'senacon-compras'],
    sections: [
      { title: 'Ensino: confirmar uma etapa não conclui todas as seguintes', paragraphs: [
        'O carrinho reúne itens, variantes e quantidades e deve permitir revisar antes da contratação. O cálculo final precisa apresentar preço e despesas adicionais de forma clara, incluindo entrega quando aplicável. Prazo de separação ou produção e prazo de transporte devem ser tratados de modo compreensível na promessa ao cliente. Um frete que funciona para um endereço não comprova cobertura de todos os destinos anunciados; teste regiões e situações que representam a operação.',
        'A integração de pagamento deve ser configurada e testada conforme documentação do prestador, preferencialmente em ambiente próprio de testes. Pedido criado, pagamento pendente, confirmado, separado, enviado e entregue são estados diferentes. Uma captura de comprovante enviada por mensagem não deve acionar automaticamente a expedição sem a conferência prevista. Uma notificação repetida também não deve criar dois pedidos ou baixar duas vezes o estoque; a equipe precisa verificar esse comportamento no fluxo real da plataforma.',
        'Inclua cenários de recusa, cancelamento e interrupção, além da compra bem-sucedida. Se o cliente volta uma página ou perde conexão, é necessário compreender o que ficou registrado antes de orientar nova tentativa. A loja deve evitar cobrança duplicada e exibir um estado compreensível. Não colete dados completos de cartão em formulário improvisado ou em mensagens. Use os recursos seguros do prestador e controle os acessos administrativos, mantendo a informação necessária à confirmação do pedido.',
      ] },
      { title: 'Caso resolvido: pagamento pendente não é envio liberado', paragraphs: [
        'Uma compra fictícia gera o pedido L-018, mas o pagamento permanece pendente. O cliente envia imagem de uma tela dizendo que já concluiu. A equipe confere o estado no canal responsável e não transforma a imagem em confirmação financeira. Quando a integração registra a aprovação válida, o pedido segue para a etapa prevista. A correspondência entre pedido, valor e evento de pagamento precisa permanecer rastreável.',
        'No teste, a mesma confirmação chega novamente. O resultado esperado não é criar outro pedido nem retirar o estoque pela segunda vez. A equipe verifica que a plataforma trata o evento sem duplicar o efeito. O caso mostra por que testar uma única compra feliz é insuficiente: repetição, falha e retomada fazem parte da operação e podem afetar estoque, cobrança e comunicação ao consumidor.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe um fluxo com pedido criado, pagamento pendente, confirmado, separado e enviado. Acrescente recusa, cancelamento e notificação repetida, indicando o resultado esperado em cada caso. Monte uma conferência fictícia de dois endereços de entrega e do total antes da confirmação. Não faça pagamento real nem use dados de cartão. Revise se a expedição depende da confirmação adequada, se cada evento produz o efeito uma única vez e se o cliente pode revisar e entender a compra.',
      ] },
    ],
  },
  {
    title: 'Preço, contribuição e indicadores da jornada',
    skills: ['analisar-resultados-loja-virtual'], sourceIds: ['sebrae-loja', 'senacon-compras'],
    sections: [
      { title: 'Ensino: faturamento não é lucro e visita não é pedido pago', paragraphs: [
        'Uma loja precisa compreender como cada venda contribui para cobrir custos fixos e gerar resultado. Preço recebido menos custos e despesas variáveis da venda forma a contribuição no modelo simplificado. Produto, embalagem, tarifa de pagamento e frete subsidiado podem participar desse cálculo conforme a operação. Não trate toda receita como ganho disponível. Tributos e demais despesas precisam ser considerados conforme a situação do negócio, com apoio contábil quando necessário.',
        'Na simulação de uma venda por R$100, com produto de R$50, embalagem de R$5, tarifa de R$4 e subsídio de frete de R$6, a contribuição é R$35 antes dos custos fixos e de outros itens não incluídos. O exemplo não estabelece preço ideal nem regime tributário. Uma campanha que aumenta volume pode reduzir essa contribuição se amplia descontos e despesas. O resultado precisa considerar as hipóteses, e não apenas o número de pedidos exibido no painel.',
        'Indicadores também dependem de definição. Conversão de visitas em pedidos pagos exige numerador e denominador do mesmo período e critério. Vinte pedidos pagos em mil visitas correspondem a 2% nessa definição, mas não dizem sozinhos por que pessoas desistiram. Observe etapas como produto, carrinho e pagamento para formular hipóteses. Antes de comparar períodos, confira se o método de contagem mudou. Dados de teste, duplicidades ou pedidos cancelados podem distorcer a análise.',
      ] },
      { title: 'Caso resolvido: campanha vende mais e contribui menos', paragraphs: [
        'Uma promoção fictícia aumenta pedidos, mas o desconto e o frete subsidiado reduzem a contribuição por venda. A equipe não conclui sucesso apenas pelo faturamento. Compara preço efetivo, custos variáveis e resultado da campanha com critérios consistentes. Se o desconto retira R$12 da contribuição e não há outra compensação, é preciso avaliar o efeito no conjunto. Mais pedidos não garantem cobertura dos custos fixos.',
        'Ao observar abandono no pagamento, a equipe cria hipóteses como erro de integração ou falta de clareza sobre entrega. Testa o fluxo e examina evidências antes de trocar toda a página inicial. O indicador aponta onde investigar, não prova uma causa específica. O caso articula custo e experiência: uma mudança só deve ser considerada melhora quando atende ao objetivo e não cria cobrança indevida, promessa falsa ou prejuízo oculto.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte uma venda fictícia com preço e quatro custos variáveis, calculando a contribuição e explicitando o que ficou fora. Simule um desconto e descreva a diferença. Calcule a conversão de um conjunto de visitas em pedidos pagos, definindo período e critério. Acrescente uma hipótese de abandono e um teste que possa confirmá-la ou enfraquecê-la. Revise se o exercício distingue faturamento, contribuição e lucro e se nenhum percentual é apresentado sem indicar de onde vieram seus números.',
      ] },
    ],
  },
  {
    title: 'Informação ao consumidor, dados e atendimento após a compra',
    skills: ['organizar-direitos-atendimento-ecommerce'], sourceIds: ['decreto-ecommerce', 'senacon-compras', 'anpd-seguranca'],
    sections: [
      { title: 'Ensino: o fluxo de atendimento precisa ser tão real quanto o carrinho', paragraphs: [
        'O comércio eletrônico deve apresentar identificação do fornecedor, características essenciais, preço e despesas, condições de pagamento, disponibilidade e entrega, entre as informações aplicáveis. O Decreto 7962/2013 também prevê atendimento facilitado, possibilidade de corrigir erros antes da contratação e confirmação. Não esconda uma condição relevante em um texto distante enquanto a tela promete o contrário. A experiência deve permitir uma decisão informada e o acompanhamento do que foi contratado.',
        'Nas compras fora do estabelecimento, o CDC prevê direito de arrependimento em sete dias a contar da assinatura ou do recebimento do produto ou serviço, conforme a contratação. A loja precisa informar meios adequados e eficazes para exercê-lo, inclusive pela ferramenta usada na contratação, e confirmar o recebimento da manifestação. Não crie uma barreira de atendimento para impedir o direito. Troca por conveniência, vício do produto e arrependimento são situações diferentes, que não devem ser misturadas em uma regra única de não trocamos.',
        'Dados de cadastro e entrega devem ter finalidade clara, proteção e acesso compatível com a função. O parceiro de transporte precisa das informações necessárias à entrega, não de toda a documentação de pagamento. Não publique dados de clientes em capturas de testes ou de painéis. Defina responsáveis por pedido, reclamação, cancelamento e devolução, acompanhando a solução até o resultado. Encaminhar uma mensagem não comprova estorno, entrega ou resolução da demanda; cada estado precisa de confirmação correspondente.',
      ] },
      { title: 'Caso resolvido: formulário recebe cancelamento, pedido continua expedindo', paragraphs: [
        'Uma loja oferece um formulário de atendimento, mas ninguém acompanha as solicitações antes da separação de pedidos. Uma manifestação de cancelamento chega e permanece sem encaminhamento enquanto a expedição continua. A existência do formulário não comprova atendimento eficaz. A equipe precisa relacionar a demanda ao pedido e ao fluxo responsável, confirmar recebimento e acompanhar a ação cabível, observando os direitos e a situação da contratação.',
        'A revisão do processo define quem verifica a fila e como a equipe de expedição recebe a informação pertinente. Dados pessoais não são espalhados em uma planilha aberta para resolver a falta de integração. O caso mostra que criar uma loja inclui organizar o atendimento posterior, com estados claros e rastreabilidade. A publicação só deve ocorrer após testar esse percurso, além do catálogo e do pagamento.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Prepare uma lista de informações essenciais de uma loja fictícia e mostre onde o consumidor as encontra antes de confirmar. Desenhe um fluxo de arrependimento sem impor motivo obrigatório, com confirmação e encaminhamento da ação cabível. Defina quais dados um parceiro de entrega precisa receber e quais não precisa. Simule uma demanda que chega durante a separação do pedido. Revise se atendimento, expedição e confirmação de resultado estão conectados e se nenhuma política pretende eliminar direitos por simples texto do site.',
      ] },
    ],
  },
];
const activities = [
  { module: 1, skill: 'planejar-estrutura-loja-virtual', prompt: 'Registrar um domínio significa que a loja já está pronta para vender?', options: ['Não; catálogo, plataforma, pagamento e logística ainda precisam funcionar e ser testados.', 'Sim, dispensa plataforma.', 'Sim, cria automaticamente estoque.', 'Sim, comprova integração de frete.'] },
  { module: 2, skill: 'organizar-catalogo-e-estoque-digital', prompt: 'O saldo total de um produto soma tamanhos diferentes. Para evitar vender variante inexistente, é necessário:', options: ['Usar sempre o total da família.', 'Trocar o tamanho após a venda sem informar.', 'Controlar identificação e disponibilidade por variante relevante.', 'Ocultar as opções.'] },
  { module: 3, skill: 'testar-fluxo-compra-online', prompt: 'A integração recebe duas vezes a confirmação do mesmo pagamento. O teste deve verificar que:', options: ['Cria dois pedidos.', 'Não duplica pedido nem efeito no estoque pela mesma confirmação.', 'Cobra novamente automaticamente.', 'Dispensa rastreabilidade.'] },
  { module: 4, skill: 'analisar-resultados-loja-virtual', prompt: 'Uma campanha aumenta o faturamento. Para avaliar o resultado, é preciso:', options: ['Considerar toda receita como lucro.', 'Ignorar descontos.', 'Contar apenas visitas.', 'Examinar contribuição, custos e critérios dos indicadores, além do volume.'] },
  { module: 5, skill: 'organizar-direitos-atendimento-ecommerce', prompt: 'Um formulário recebe demandas, mas nenhuma é acompanhada. A loja deve:', options: ['Organizar recebimento, responsável, ação e confirmação de resultado do atendimento.', 'Considerar atendimento concluído ao criar o formulário.', 'Exigir que o cliente tente indefinidamente.', 'Espalhar os dados em grupo aberto.'] },
];
const exam = [
  { module: 1, skill: 'planejar-estrutura-loja-virtual', prompt: 'A comparação entre plataformas deve considerar:', options: ['Somente cor do tema.', 'Apenas a promoção inicial.', 'Requisitos de catálogo, pagamento, logística, dados e custo da operação.', 'A quantidade de efeitos visuais.'] },
  { module: 1, skill: 'planejar-estrutura-loja-virtual', prompt: 'Domínio, hospedagem e plataforma:', options: ['Têm funções distintas que podem ser reunidas em uma contratação, sem se tornarem equivalentes.', 'São sempre o mesmo serviço.', 'Criam estoque físico ao serem registrados.', 'Dispensam controle de acessos.'] },
  { module: 2, skill: 'organizar-catalogo-e-estoque-digital', prompt: 'Uma descrição de produto adequada:', options: ['Pode prometer uma variante inexistente.', 'Substitui medidas por imagem genérica.', 'Omite condição de encomenda.', 'Corresponde ao item, às variantes e às condições reais de disponibilidade.'] },
  { module: 2, skill: 'organizar-catalogo-e-estoque-digital', prompt: 'No modelo em que disponível=físico−reservado, há nove unidades físicas e três reservadas. O disponível é:', options: ['Doze.', 'Seis.', 'Três.', 'Nove.'] },
  { module: 3, skill: 'testar-fluxo-compra-online', prompt: 'Pedido criado e pagamento confirmado são:', options: ['Sempre a mesma etapa.', 'Uma garantia automática de entrega.', 'Estados diferentes que precisam de correspondência no fluxo.', 'Informações dispensáveis para separar.'] },
  { module: 3, skill: 'testar-fluxo-compra-online', prompt: 'O teste da compra deve incluir:', options: ['Sucesso, falha, cancelamento e retomada, com total e entrega claros.', 'Somente a página inicial.', 'Apenas um endereço que funciona.', 'Pagamento real de todo estudante.'] },
  { module: 4, skill: 'analisar-resultados-loja-virtual', prompt: 'Venda por R$90 com custos variáveis de R$40, R$5 e R$10 gera contribuição simplificada de:', options: ['R$90.', 'R$55.', 'R$45.', 'R$35.'] },
  { module: 4, skill: 'analisar-resultados-loja-virtual', prompt: 'Trinta pedidos pagos em 1.500 visitas, no mesmo período e critério, representam conversão de:', options: ['20%.', '2%.', '5%.', '50%.'] },
  { module: 5, skill: 'organizar-direitos-atendimento-ecommerce', prompt: 'Uma política do site pode eliminar o direito legal de arrependimento por dizer não trocamos?', options: ['Sim, pelo simples aceite.', 'Sim, se o carrinho funciona.', 'Não; políticas e atendimento precisam respeitar os direitos aplicáveis.', 'Sim, se o pedido foi pago por meio digital.'] },
  { module: 5, skill: 'organizar-direitos-atendimento-ecommerce', prompt: 'O parceiro de entrega deve receber:', options: ['Dados necessários à finalidade da entrega, com proteção e controle adequados.', 'Toda informação financeira do cliente sem necessidade.', 'Senhas de pagamento.', 'Lista pública de todas as compras e documentos.'] },
];
export const courseRevision = defineCourse({
  courseId: '2138b9fa-c556-498e-8c91-85fac566169c', slug: 'criacao-de-loja-virtual', courseName: 'Criação de Loja Virtual', hours: 100,
  audience: 'Estudantes que planejam e configuram uma operação de comércio eletrônico, com testes simulados de catálogo, pagamento, logística e atendimento.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'sebrae-loja', title: 'Sebrae — Sete passos para criar uma loja virtual', url: 'https://www.sebraeplay.com.br/content/7-passos-para-criar-uma-loja-virtual' },
    { id: 'registro-dominio', title: 'Registro.br/NIC.br — Registro de novos domínios', url: 'https://registro.br/ajuda/registro-de-novos-dominios/' },
    { id: 'decreto-ecommerce', title: 'Presidência — Decreto 7962/2013, comércio eletrônico', url: 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm' },
    { id: 'senacon-compras', title: 'Senacon — Cartilha de compras online e direitos do consumidor, 2025', url: 'https://www.gov.br/mj/pt-br/assuntos/arquivos-imprensa/senacon/cartilha-black-friday-senacon-2025' },
    { id: 'anpd-seguranca', title: 'ANPD — Segurança da informação para agentes de tratamento', url: 'https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/anonimizado___guia_orientat-_seg_da_inf_p_atpp.pdf' },
  ],
}, modules, activities, exam);
export default courseRevision;
