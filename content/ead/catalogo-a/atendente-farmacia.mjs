import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Papel do atendente e uso responsável de medicamentos',
    skills: ['reconhecer-limites-atendente-farmacia'], sourceIds: ['anvisa-boas-praticas', 'anvisa-uso-racional'],
    sections: [
      { title: 'Ensino: atendimento comercial integra um serviço de saúde', paragraphs: [
        'O atendente de farmácia apoia recepção, organização e rotinas comerciais e administrativas conforme os procedimentos e a supervisão do estabelecimento. Medicamentos não devem ser tratados como produtos indiferenciados de consumo: escolha, qualidade, uso e orientação podem afetar a saúde. A resposta a uma dúvida precisa respeitar as responsabilidades da equipe, especialmente as atribuições do farmacêutico e de outros profissionais habilitados.',
        'Uso racional envolve necessidade, adequação e segurança, e não apenas concluir uma venda. O atendente não deve diagnosticar a partir de uma descrição breve, indicar tratamento por experiência pessoal ou alterar uma prescrição. Uma pessoa pode relatar sintomas parecidos com os de outra e ainda precisar de avaliação diferente. Encaminhar a dúvida ao farmacêutico é parte de um atendimento responsável, não uma falha de conhecimento comercial.',
        'Conheça os procedimentos do local: identificação da equipe, como acionar o farmacêutico, quais atividades cabem ao apoio e como registrar uma pendência. A ausência de uma resposta imediata não autoriza inventar uma regra. Promoções, metas e pressão por rapidez também não substituem requisitos de segurança. Produtos sem exigência de prescrição podem ter riscos e dúvidas de uso; não devem ser apresentados como inofensivos apenas por estarem disponíveis.',
      ] },
      { title: 'Caso resolvido: recomendação baseada em experiência pessoal', paragraphs: [
        'Um cliente pede “o mesmo que funcionou com meu vizinho” e descreve uma queixa. O atendente acolhe o pedido, mas não conclui que o produto é adequado por semelhança de relato. Aciona o farmacêutico pelo fluxo do estabelecimento para orientação. Não transforma um comentário de terceiro em prescrição nem sugere aumentar a quantidade comprada para acelerar o efeito. O atendimento preserva a possibilidade de uma avaliação apropriada.',
        'Ao concluir o contato, a equipe explica o próximo passo em linguagem clara e evita prometer resultado terapêutico. Se o farmacêutico precisar encaminhar para outro atendimento, o atendente apoia a orientação administrativa cabível. O caso mostra que a qualidade da venda não se resume ao produto entregue: inclui reconhecer os limites da própria função e garantir que a dúvida chegue a quem pode avaliá-la.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie três pedidos fictícios: informação de preço, dúvida sobre mudança de tratamento e procura de um produto por indicação de conhecido. Defina o que pode ser esclarecido administrativamente e o que deve ser encaminhado. Escreva falas curtas que não contenham diagnóstico, prescrição ou promessa de cura. Confira se sua proposta distingue apoio de decisão técnica e se mantém a orientação ao cliente mesmo quando a resposta depende de outro profissional. Não use dados de pacientes reais na simulação.',
      ] },
    ],
  },
  {
    title: 'Identificação do produto, rótulo e apresentação',
    skills: ['distinguir-identificacao-medicamento'], sourceIds: ['anvisa-boas-praticas', 'anvisa-conservacao'],
    sections: [
      { title: 'Ensino: embalagens parecidas não representam o mesmo produto', paragraphs: [
        'A identificação de um medicamento envolve mais do que o nome comercial ou a cor da embalagem. Princípio ativo identifica a substância com ação farmacológica; concentração informa a quantidade em uma unidade ou volume; forma farmacêutica descreve a apresentação, como comprimido ou solução. Via de administração também é relevante e não deve ser presumida por aparência. A conferência deve utilizar as informações oficiais e o procedimento do estabelecimento.',
        'Uma apresentação de determinada quantidade por comprimido não é descrita da mesma forma que uma quantidade por mililitro. Unidades fazem parte da informação: miligrama e mililitro não são sinônimos. Essa leitura básica ajuda a perceber divergências e encaminhá-las; não autoriza calcular uma nova dose, converter uma prescrição por conta própria ou substituir apresentações sem avaliação técnica. A decisão de uso pertence ao profissional habilitado dentro de sua atribuição.',
        'Verifique legibilidade, integridade, lote e validade conforme o fluxo. Uma caixa pode estar com o nome esperado e ainda apresentar concentração diferente ou condição inadequada. Não use o local na prateleira como prova de identificação. Produtos semelhantes devem ser organizados de modo a reduzir trocas, com conferência no momento previsto. Uma dúvida deve interromper o encaminhamento automático até a avaliação responsável.',
      ] },
      { title: 'Caso resolvido: nome semelhante, apresentação diferente', paragraphs: [
        'Em uma simulação, duas embalagens de um produto fictício têm nomes semelhantes, mas uma é comprimido e outra é solução. O atendente percebe a diferença antes da continuidade do atendimento. Não trata as apresentações como equivalentes por terem o mesmo nome-base. Confere os dados e encaminha a divergência ao farmacêutico, preservando a referência ao que foi solicitado. Nenhuma conversão de dose é feita por iniciativa do apoio comercial.',
        'A equipe verifica que as embalagens estavam lado a lado e que a separação era feita apenas pela cor. Reorganiza a identificação e reforça a conferência de dados no ponto adequado. O caso ensina que a prevenção de troca depende de informações específicas do produto e do processo, e não apenas de memorizar sua aparência. A correção precisa permanecer útil quando o fabricante muda o desenho da caixa.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe dois rótulos fictícios com nome, forma, concentração, lote e validade. Faça uma diferença de apresentação sem usar marca ou prescrição real. Escreva quais campos precisam ser comparados e qual dúvida exigiria avaliação do farmacêutico. Não proponha uma dose. Confira se sua análise distingue unidade de massa de unidade de volume e se evita concluir equivalência apenas pelo nome. Proponha uma organização de prateleira que ajude a reduzir troca sem dispensar a conferência.',
      ] },
    ],
  },
  {
    title: 'Recebimento, conservação, lote e validade',
    skills: ['conferir-conservacao-farmacia'], sourceIds: ['anvisa-boas-praticas', 'anvisa-conservacao'],
    sections: [
      { title: 'Ensino: preservar as condições definidas para cada produto', paragraphs: [
        'O recebimento verifica origem, identificação, integridade e condições previstas para o produto. Lote e validade precisam estar legíveis e relacionados ao controle do estoque. A entrega física não comprova, sozinha, que o item está disponível para uso ou comercialização. Suspeita de dano, alteração ou condição de transporte inadequada deve ser identificada e encaminhada ao farmacêutico conforme o procedimento.',
        'As condições de conservação seguem as informações do fabricante e as regras do serviço. Não existe uma recomendação universal de colocar todos os medicamentos na geladeira. Refrigeração, exposição à luz e umidade precisam ser tratadas conforme o produto. Quando há controle de ambiente ou equipamento, os registros e as respostas a desvios devem seguir o procedimento autorizado; preencher o valor esperado sem medir ou conferir elimina a evidência necessária.',
        'A organização por validade auxilia a reduzir vencimentos, mas não autoriza entregar produto danificado por ele vencer primeiro. Itens vencidos, em avaliação ou bloqueados devem ser identificados e segregados de acordo com o fluxo, evitando confusão com o disponível. A destinação e a liberação após uma ocorrência não são decididas por conveniência do atendente. Rastrear o lote ajuda a localizar os itens quando houver uma orientação de recolhimento ou investigação.',
      ] },
      { title: 'Caso resolvido: condição de conservação não confirmada', paragraphs: [
        'Uma entrega de produto que possui condição específica chega sem evidência suficiente para confirmar o transporte adequado. A equipe não conclui que está correto apenas porque a caixa parece íntegra. Registra a pendência e aciona o responsável para avaliação, mantendo a identificação do lote e da entrega. Não altera o registro para fazê-lo coincidir com o valor esperado nem mistura o produto ao estoque liberado.',
        'Depois da decisão técnica, o histórico mostra a situação e a providência adotada. A equipe revisa como o fornecedor e o recebimento trocam as informações necessárias. Se o problema se repetir, a rastreabilidade permite identificar quais entregas e lotes foram afetados. O caso liga conservação à qualidade e demonstra por que a validade impressa não garante segurança quando as condições de armazenamento não foram preservadas.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte um controle fictício de quatro lotes com validade e situação: disponível, vencido, em avaliação e bloqueado. Defina quais podem ser separados e quais exigem encaminhamento. Escreva uma ocorrência de conservação sem inventar faixas técnicas para um medicamento real. Confira se o registro preserva o que foi observado e se a decisão de liberação está atribuída ao responsável. Explique como localizar um lote sem depender apenas da quantidade total de caixas no sistema.',
      ] },
    ],
  },
  {
    title: 'Prescrições, dúvidas e encaminhamento ao farmacêutico',
    skills: ['encaminhar-prescricao-duvida'], sourceIds: ['anvisa-boas-praticas', 'anvisa-uso-racional'],
    sections: [
      { title: 'Ensino: reconhecer divergência não é resolver tecnicamente', paragraphs: [
        'Uma prescrição contém informações que precisam ser avaliadas conforme os requisitos aplicáveis. O apoio do atendente pode envolver recepção e encaminhamento do documento dentro do procedimento, mas a avaliação técnica e as decisões privativas não são substituídas por experiência de balcão. Regras de validade, retenção e forma de apresentação podem variar conforme a categoria; não memorize um único prazo como se valesse para todo medicamento.',
        'Se uma informação estiver ilegível, divergente ou ausente, não complete por suposição nem pergunte a outro cliente o que parece estar escrito. Acione o farmacêutico para avaliar o caso e definir a providência cabível. Fotografias e documentos eletrônicos também precisam do tratamento previsto e da verificação responsável. A aparência de uma imagem não comprova, por si só, autenticidade ou atendimento dos requisitos.',
        'Dúvidas sobre substituir produto, mudar dose, interromper uso ou combinar medicamentos devem chegar ao profissional habilitado. O atendente pode explicar que haverá avaliação e organizar o contato sem oferecer uma solução clínica improvisada. A segurança depende também de preservar o que foi solicitado e o que foi orientado, evitando que uma comunicação incompleta modifique a decisão ao passar entre pessoas da equipe.',
      ] },
      { title: 'Caso resolvido: trecho ilegível e pedido de rapidez', paragraphs: [
        'Um cliente apresenta um documento com trecho que não pode ser lido e pede que a venda seja feita rapidamente. O atendente não escolhe a opção mais comum nem completa a escrita por semelhança. Encaminha o documento ao farmacêutico e comunica a dúvida com precisão. Se houver necessidade de esclarecimento com o prescritor, essa providência segue o fluxo técnico responsável, sem criar uma informação que não estava confirmada.',
        'Durante a espera, o atendente explica o motivo da conferência de modo respeitoso e não promete que o produto será liberado. A pressão comercial não muda o requisito de avaliação. Ao concluir, a equipe preserva a informação necessária sobre o encaminhamento conforme seu procedimento. O caso demonstra a diferença entre reconhecer uma pendência e assumir uma decisão técnica que não cabe ao apoio.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie três pedidos fictícios: documento com informação ilegível, dúvida sobre troca de apresentação e pergunta sobre horário de funcionamento. Escreva o encaminhamento de cada um sem prescrever nem completar dados clínicos. Confira se você distinguiu resposta administrativa de avaliação farmacêutica e se evitou usar um prazo universal para qualquer receita. Simule uma comunicação ao farmacêutico que contenha a dúvida exata e a informação disponível, sem acrescentar uma conclusão por conta própria.',
      ] },
    ],
  },
  {
    title: 'Atendimento seguro, privacidade e queixas sobre produtos',
    skills: ['acolher-queixa-produto-farmacia'], sourceIds: ['anvisa-uso-racional', 'anvisa-boas-praticas', 'anpd-seguranca'],
    sections: [
      { title: 'Ensino: encaminhar uma queixa sem minimizar ou diagnosticar', paragraphs: [
        'O cliente pode relatar dúvida de uso, alteração na embalagem, problema de qualidade ou efeito percebido. O atendente acolhe e encaminha ao farmacêutico, sem concluir a causa clínica nem afirmar que é impossível haver problema. Uma queixa sobre o produto precisa manter informações que permitam identificação, como apresentação e lote quando disponíveis, respeitando o procedimento e a proteção dos dados da pessoa.',
        'Diferencie uma questão comercial de uma necessidade de avaliação de saúde. Troco ou preço podem ter encaminhamento administrativo; relato de efeito ou dúvida sobre continuidade de uso não se resolve apenas com troca de caixa ou recomendação pessoal. O profissional responsável define a avaliação e o fluxo cabível. O atendente não deve orientar abandono ou mudança de tratamento por iniciativa própria, nem prometer que uma substituição eliminará o relato.',
        'A comunicação precisa preservar privacidade. Evite discutir a condição do cliente em voz alta, compartilhar imagens de documentos em grupos pessoais ou registrar mais dados do que a finalidade exige. Se houver necessidade de notificação ou investigação de qualidade, a equipe segue os canais competentes. O acompanhamento identifica o que foi encaminhado e o retorno previsto, sem confundir uma mensagem enviada com uma situação resolvida.',
      ] },
      { title: 'Caso resolvido: embalagem com alteração percebida', paragraphs: [
        'Um cliente mostra uma embalagem e relata mudança de aspecto em um produto. O atendente não declara que o material está seguro só por estar dentro da validade. Encaminha a situação ao farmacêutico, preservando as informações de identificação e o relato conforme o procedimento. Se houver suspeita de qualidade no estoque, a avaliação responsável considera os lotes e as condições pertinentes, sem uma decisão comercial de continuar vendendo para evitar prejuízo.',
        'A equipe registra a providência e orienta o cliente pelo fluxo adequado, sem expor seu relato a outras pessoas. Depois, verifica se os itens sob avaliação continuam corretamente identificados. O caso mostra que atendimento seguro envolve qualidade, comunicação e continuidade. Resolver apenas a insatisfação comercial sem examinar a queixa pode deixar uma falha do processo sem tratamento.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Elabore um formulário fictício de encaminhamento de queixa com identificação do produto, relato observado, responsável acionado e próximo passo. Não use dados reais nem tente definir a causa de uma reação. Diferencie uma dúvida de preço de uma situação que exige avaliação de saúde ou qualidade. Confira se o documento evita julgamento, promessa de cura ou mudança de tratamento. Descreva como confirmar que um produto em avaliação permanece separado do disponível até a decisão responsável.',
      ] },
    ],
  },
];

const activities = [
  { module: 1, skill: 'reconhecer-limites-atendente-farmacia', prompt: 'Um cliente pede o produto que “funcionou com um vizinho” para uma queixa semelhante. Qual conduta respeita o papel do atendente?', options: ['Indicar o mesmo tratamento por semelhança.', 'Aumentar a quantidade sugerida para garantir efeito.', 'Acolher e encaminhar a dúvida ao farmacêutico.', 'Prometer que o resultado será igual.'] },
  { module: 2, skill: 'distinguir-identificacao-medicamento', prompt: 'Duas embalagens têm nome semelhante, mas forma e concentração diferentes. Qual é a conclusão segura?', options: ['O nome-base garante equivalência.', 'A cor da caixa deve decidir a escolha.', 'O atendente pode converter a dose por iniciativa própria.', 'A diferença exige conferência e avaliação responsável antes da continuidade.'] },
  { module: 3, skill: 'conferir-conservacao-farmacia', prompt: 'Um lote chegou sem evidência suficiente de condição de transporte exigida. O que fazer?', options: ['Identificar a pendência e encaminhar a avaliação antes de considerar liberado.', 'Registrar a condição esperada sem conferir.', 'Misturar ao disponível porque está na validade.', 'Presumir que a caixa íntegra comprova todo o transporte.'] },
  { module: 4, skill: 'encaminhar-prescricao-duvida', prompt: 'Um trecho de documento está ilegível e o cliente pede rapidez. Qual ação foi ensinada?', options: ['Escolher o produto mais vendido.', 'Encaminhar a dúvida precisa ao farmacêutico sem completar por suposição.', 'Pedir a outro cliente que interprete.', 'Criar uma informação para finalizar o atendimento.'] },
  { module: 5, skill: 'acolher-queixa-produto-farmacia', prompt: 'Há relato de alteração de aspecto em um produto ainda dentro da validade. Qual encaminhamento é adequado?', options: ['Descartar a queixa porque a validade não terminou.', 'Resolver apenas pelo menor preço.', 'Encaminhar ao farmacêutico e preservar a identificação e o relato.', 'Prometer que uma troca elimina qualquer efeito.'] },
];

const exam = [
  { module: 1, skill: 'reconhecer-limites-atendente-farmacia', prompt: 'Qual situação exige encaminhamento técnico em vez de decisão comercial do atendente?', options: ['Dúvida sobre mudança de tratamento.', 'Pergunta sobre horário de funcionamento.', 'Consulta de preço de produto identificado.', 'Informação sobre o canal de atendimento.'] },
  { module: 1, skill: 'reconhecer-limites-atendente-farmacia', prompt: 'Um medicamento sem exigência de prescrição deve ser apresentado como:', options: ['Inofensivo em qualquer quantidade.', 'Produto que dispensa toda orientação.', 'Equivalente a qualquer outro da mesma cor.', 'Produto que ainda pode envolver riscos e dúvidas de uso.'] },
  { module: 2, skill: 'distinguir-identificacao-medicamento', prompt: 'Qual informação ajuda a distinguir apresentações além do nome?', options: ['Somente o lugar da caixa na prateleira.', 'Forma farmacêutica, concentração e informações oficiais de identificação.', 'A preferência pessoal de quem atende.', 'A cor predominante da embalagem.'] },
  { module: 2, skill: 'distinguir-identificacao-medicamento', prompt: 'Por que miligrama e mililitro não devem ser tratados como sinônimos?', options: ['Porque qualquer unidade pode ser retirada do rótulo.', 'Porque representam sempre a mesma dose.', 'Porque são unidades de grandezas diferentes e integram a informação da apresentação.', 'Porque o nome comercial substitui todas as unidades.'] },
  { module: 3, skill: 'conferir-conservacao-farmacia', prompt: 'Qual regra orienta a conservação?', options: ['Seguir as especificações do produto e o procedimento, sem generalizar refrigeração.', 'Guardar todos os produtos na geladeira.', 'Ignorar umidade quando há validade futura.', 'Preencher valores esperados em vez de conferir registros.'] },
  { module: 3, skill: 'conferir-conservacao-farmacia', prompt: 'Priorizar a validade significa que um produto danificado pode ser entregue antes dos demais?', options: ['Sim, para evitar perda financeira.', 'Sim, se foi recebido recentemente.', 'Sim, quando o nome está legível.', 'Não; integridade, condição e liberação responsável continuam necessárias.'] },
  { module: 4, skill: 'encaminhar-prescricao-duvida', prompt: 'Uma regra de prazo de receita deve ser aplicada indistintamente a todos os medicamentos?', options: ['Sim, para simplificar o balcão.', 'Não; os requisitos podem variar e precisam da avaliação aplicável.', 'Sim, se alguém se lembra de um caso anterior.', 'Não; por isso documentos nunca precisam de avaliação.'] },
  { module: 4, skill: 'encaminhar-prescricao-duvida', prompt: 'Reconhecer informação ilegível permite ao atendente:', options: ['Completar pelo produto mais comum.', 'Converter uma apresentação por conta própria.', 'Identificar a pendência e encaminhar ao farmacêutico.', 'Escolher uma dose aproximada.'] },
  { module: 5, skill: 'acolher-queixa-produto-farmacia', prompt: 'Uma queixa sobre possível problema de qualidade deve preservar:', options: ['Identificação do produto e relato necessário, com encaminhamento responsável.', 'Somente a opinião de quem vendeu.', 'Uma conclusão clínica criada no balcão.', 'Exposição do cliente aos demais presentes.'] },
  { module: 5, skill: 'acolher-queixa-produto-farmacia', prompt: 'Qual conduta protege a privacidade durante o atendimento?', options: ['Discutir a condição em voz alta para obter ajuda de clientes.', 'Compartilhar documentos em grupos pessoais.', 'Registrar qualquer informação sem finalidade.', 'Utilizar canais autorizados e dados necessários ao encaminhamento.'] },
];

export const courseRevision = defineCourse({
  courseId: '35f7bed3-5195-4b57-8b37-cca29b8836d9', slug: 'atendente-de-farmacia',
  courseName: 'Atendente de Farmácia', hours: 120,
  audience: 'Interessados em apoio de atendimento e organização de farmácia, sob supervisão e sem assumir atribuições técnicas privativas.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'anvisa-boas-praticas', title: 'Anvisa — RDC 44/2009, boas práticas e atribuições em farmácias e drogarias', url: 'https://anvisalegis.datalegis.net/action/ActionDatalegis.php?acao=abrirTextoAto&cod_menu=8542&cod_modulo=310&link=S&numeroAto=00000044&orgao=RDC%2FDC%2FANVISA%2FMS&seqAto=000&tipo=RDC&valorAno=2009' },
    { id: 'anvisa-uso-racional', title: 'Anvisa — Uso racional de medicamentos', url: 'https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2020/uso-racional-de-medicamentos-um-alerta-a-populacao?linkId=779193663' },
    { id: 'anvisa-conservacao', title: 'Anvisa — Conservação e validade de medicamentos', url: 'https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2019/saiba-como-conservar-medicamentos-em-casa' },
    { id: 'anpd-seguranca', title: 'ANPD — Guia orientativo de segurança da informação', url: 'https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/anonimizado___guia_orientat-_seg_da_inf_p_atpp.pdf' },
  ],
}, modules, activities, exam);

export default courseRevision;
