import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Apoio administrativo e atribuições do corretor',
    skills: ['distinguir-apoio-e-corretagem'], sourceIds: ['camara-corretagem', 'cofeci-formacao'],
    sections: [
      { title: 'Ensino: organizar o trabalho sem assumir intermediação', paragraphs: [
        'O apoio administrativo imobiliário organiza informações e tarefas internas para que o profissional responsável conduza o trabalho. A intermediação de compra, venda, permuta e locação e a opinião sobre comercialização são atribuições do corretor de imóveis. A conclusão deste curso livre de auxiliar não fornece a habilitação ou o registro necessários para exercer a profissão. Também não transforma uma orientação informal da empresa em autorização para negociar por conta própria.',
        'O Decreto 81.871/1978 reserva ao corretor inscrito o atendimento ao público interessado em transações patrocinadas por uma pessoa jurídica. Por isso, o recorte deste material é administrativo: cadastro interno de imóveis, organização de documentos, controle de versões e encaminhamento de tarefas ao corretor. Não se ensina o auxiliar a captar propostas, apresentar condições comerciais, aconselhar sobre preço ou substituir o profissional em uma visita de negociação.',
        'Uma tarefa precisa ter finalidade, responsável e ponto de entrega. Digitalizar um documento para o processo interno é diferente de concluir que o imóvel está juridicamente regular. Atualizar uma informação autorizada é diferente de prometer uma condição ao interessado. Ao receber solicitação que ultrapassa o apoio, o auxiliar identifica a demanda e encaminha ao profissional indicado, registrando o necessário. Não improvisa uma resposta para evitar uma pendência no sistema.',
      ] },
      { title: 'Caso resolvido: pedido para negociar uma redução', paragraphs: [
        'Um corretor está ausente e alguém pede ao auxiliar que negocie um abatimento para não perder a oportunidade. Mesmo com um valor escrito em uma planilha, a tarefa deixou de ser organização administrativa e passou à intermediação. O auxiliar não assume a negociação. Encaminha a demanda ao corretor responsável e mantém a informação de que existe uma solicitação aguardando atendimento profissional, sem prometer aceitação ou resultado.',
        'O registro interno pode indicar data, referência do imóvel e profissional acionado, com acesso restrito. Não precisa reproduzir toda uma conversa em uma lista aberta. A empresa deve prever cobertura profissional para ausências; uma falha de escala não amplia a atribuição do auxiliar. Esse limite protege o interessado e permite que a equipe localize a demanda sem confundir encaminhamento com decisão comercial.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Classifique tarefas fictícias: arquivar uma certidão, oferecer desconto, atualizar um endereço autorizado, opinar sobre preço e encaminhar uma pendência ao corretor. Justifique a diferença entre apoio interno e intermediação. Desenhe um fluxo para uma solicitação recebida durante a ausência do profissional. Confira se ele identifica o responsável e o retorno necessário, sem criar uma promessa comercial. Acrescente como a equipe verificará se o encaminhamento chegou à pessoa designada.',
      ] },
    ],
  },
  {
    title: 'Cadastro do imóvel e consistência das informações',
    skills: ['conferir-cadastro-imobiliario'], sourceIds: ['camara-corretagem', 'anpd-seguranca'],
    sections: [
      { title: 'Ensino: cada informação precisa de origem e contexto', paragraphs: [
        'O cadastro interno identifica o imóvel por uma referência estável, além de endereço e unidade. Dois apartamentos no mesmo edifício não são o mesmo bem. Um endereço abreviado, uma fotografia ou o nome de um proprietário não bastam para escolher o registro. A equipe deve distinguir identificação do imóvel, identificação das pessoas e estado administrativo do processo. Mesclar cadastros por semelhança pode contaminar documentos, anúncios e encaminhamentos.',
        'Características como área, número de vagas e disponibilidade devem ter origem e data de conferência. Área privativa e área total são conceitos diferentes; não se troca uma pela outra para deixar o anúncio mais atraente. Quando há divergência entre documentos ou informação recebida, o auxiliar registra a pendência e encaminha ao responsável. O campo sem confirmação deve permanecer distinguível de uma informação validada, em vez de receber um valor presumido para completar a tela.',
        'Uma rotina útil separa dado original, correção e validação. Ao corrigir número da unidade, confira qual fonte motivou a mudança e se o registro selecionado é o correto. Preserve o histórico previsto pela empresa e avise quem utiliza a informação. Não replique uma correção em todos os imóveis do mesmo prédio. Dados de pessoas exigem finalidade e acesso adequado; um catálogo operacional não precisa expor documentos pessoais a toda a equipe.',
      ] },
      { title: 'Caso resolvido: duas unidades com áreas distintas', paragraphs: [
        'O cadastro R-042 contém a unidade 204, com área privativa de 61 m² informada em documento identificado. Uma planilha recebida depois traz 78 m² sem dizer se é área total ou privativa. O auxiliar não substitui 61 por 78 automaticamente. Confere a unidade e a origem, registra a divergência e solicita validação ao responsável. Se o segundo valor for área total, os campos continuam diferentes, cada um com seu significado.',
        'O exemplo mostra por que consistência não significa deixar todos os números iguais. É possível haver dois valores corretos que descrevem grandezas diferentes. A entrega administrativa adequada é um cadastro com conceitos claros e pendência rastreável, e não uma escolha estética do maior número. A decisão sobre uso comercial da informação fica com o profissional responsável depois da conferência necessária.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie três imóveis fictícios no mesmo edifício, com referências e unidades diferentes. Inclua campos para característica, origem, data e estado de conferência. Introduza uma divergência de área e mostre como ela fica pendente sem apagar a informação anterior. Revise se alguém conseguiria identificar o bem sem ver dados pessoais desnecessários. Explique por que uma fotografia igual ou um proprietário em comum não autoriza juntar dois registros.',
      ] },
    ],
  },
  {
    title: 'Organização documental e controle de pendências',
    skills: ['organizar-documentacao-imovel'], sourceIds: ['camara-corretagem', 'anpd-seguranca'],
    sections: [
      { title: 'Ensino: presença do arquivo não equivale a aprovação', paragraphs: [
        'Um dossiê administrativo reúne documentos solicitados pelo responsável e evidencia o que foi recebido, conferido ou ainda precisa de análise. O auxiliar pode controlar presença, legibilidade, identificação e versão conforme uma lista aprovada. Isso não o autoriza a declarar regularidade jurídica ou a concluir que um negócio é seguro. Uma pasta cheia pode conter documentos de outro imóvel, cópias ilegíveis ou informação que depende de interpretação profissional.',
        'Nomear arquivos com referência do processo, tipo documental e data facilita a busca sem colocar dados pessoais excessivos no nome. Versões precisam ser diferenciadas: recebido, substituído, em análise ou aprovado pelo responsável são estados distintos. Evite uma única pasta chamada documentos finais onde qualquer pessoa sobrescreve a cópia anterior. Quando a organização depende de um arquivo enviado por terceiro, confirme origem e recebimento pelo canal autorizado.',
        'Uma pendência deve apontar o objeto, a ação necessária, quem a acompanha e a data do próximo controle. Recebido não significa analisado; analisado não significa aprovado para qualquer finalidade. O prazo de um checklist interno não é uma validade universal de certidão. Requisitos documentais variam conforme a operação e a análise competente. O apoio trabalha com a lista vigente aprovada, encaminhando dúvidas em vez de inventar exigências ou dispensas.',
      ] },
      { title: 'Caso resolvido: arquivo novo no processo errado', paragraphs: [
        'Chega uma cópia de documento com referência semelhante à de um processo aberto. Antes de marcar a pendência como concluída, o auxiliar percebe que a identificação do imóvel não corresponde. Mantém a pendência, separa o arquivo pelo procedimento autorizado e solicita esclarecimento ao responsável. A simples chegada de um documento não prova que a necessidade daquele processo foi atendida.',
        'Após receber o arquivo correto, registra o recebimento e o encaminha à análise indicada. Só o responsável competente altera o estado que dependa dessa análise. A sequência evita que um indicador de documentos recebidos seja confundido com conclusão de uma verificação. Se houve acesso indevido ao documento de outra pessoa, a situação também precisa seguir o fluxo de proteção de dados da organização.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte um dossiê fictício com cinco entradas, distinguindo tipo, referência, recebimento, legibilidade, versão e responsável pela análise. Use nomes inventados e não reproduza documentos reais. Escreva uma pendência que ainda depende de conferência de identidade e outra que já foi recebida, mas aguarda análise. Verifique se seu quadro permite saber o próximo passo sem declarar regularidade jurídica. Descreva como impedir que uma nova cópia apague silenciosamente o histórico.',
      ] },
    ],
  },
  {
    title: 'Material de divulgação e controle de versões autorizadas',
    skills: ['controlar-material-imobiliario'], sourceIds: ['camara-corretagem', 'anpd-seguranca'],
    sections: [
      { title: 'Ensino: preparar um arquivo não é autorizar um anúncio', paragraphs: [
        'O apoio pode organizar imagens e versões de materiais para aprovação interna. A publicação imobiliária envolve autorização e identificação profissional previstas na regulamentação; não é uma tarefa que o auxiliar decide sozinho. Antes de liberar um arquivo ao fluxo de publicação, a organização precisa conferir quem é o responsável, qual imóvel está sendo anunciado e se a versão corresponde ao conteúdo aprovado. Não se presume autorização porque uma fotografia já circulou em uma conversa.',
        'O material deve distinguir informação confirmada de expectativa ou opinião. Uma característica não comprovada, uma disponibilidade antiga ou um preço de versão anterior podem induzir a erro. O controle administrativo mantém relação entre referência do imóvel, versão, data, origem dos dados e aprovação. A equipe precisa saber qual arquivo está vigente e como retirar ou substituir os anteriores nos canais utilizados. Copiar e colar entre imóveis parecidos exige conferência integral.',
        'Fotografias também podem revelar pessoas, placas, documentos, sistemas de segurança ou detalhes privados. A revisão para publicação verifica o que é necessário à finalidade e encaminha dúvidas de autorização. O auxiliar não resolve direitos de imagem por intuição. Uma correção de preço ou condição é informação comercial: deve vir do profissional responsável e seguir o fluxo de aprovação. O histórico ajuda a localizar onde uma versão antiga permaneceu disponível.',
      ] },
      { title: 'Caso resolvido: preço alterado em apenas um canal', paragraphs: [
        'O corretor aprova uma nova versão do material de um imóvel. O arquivo interno foi atualizado, mas um canal ainda exibe a versão anterior. O apoio registra os canais vinculados e o estado da substituição, comunicando a divergência ao responsável. Não responde ao público inventando qual condição prevalece. A conclusão da tarefa exige verificar o material efetivamente disponível em cada destino previsto.',
        'Uma lista de distribuição com referência, versão enviada e confirmação de atualização facilita o controle. Se a alteração não foi concluída em um canal, permanece uma pendência identificada. O caso diferencia salvar um arquivo novo de atualizar a informação publicada. Também mostra a utilidade de manter versões: sem elas, a equipe não consegue reconstruir qual material originou a dúvida.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Prepare uma ficha de controle de divulgação fictícia para um único imóvel em três canais, com versão e aprovação identificadas. Inclua uma fotografia que exponha um documento e descreva o encaminhamento antes de usar a imagem. Simule uma atualização autorizada que não chegou a um canal. Explique como manter a pendência e confirmar a substituição. Confira se nenhuma etapa atribui ao auxiliar a negociação, a autorização profissional ou uma garantia jurídica sobre a divulgação.',
      ] },
    ],
  },
  {
    title: 'Fluxo interno, dados pessoais e entrega rastreável',
    skills: ['acompanhar-fluxo-imobiliario'], sourceIds: ['anpd-seguranca', 'camara-corretagem'],
    sections: [
      { title: 'Ensino: acompanhar uma tarefa até o resultado esperado', paragraphs: [
        'O controle interno deve separar tarefa criada, encaminhada, recebida e concluída. Um e-mail enviado não comprova que o corretor responsável recebeu a pendência nem que ela foi resolvida. O auxiliar acompanha o próximo passo administrativo, sem transformar o painel de tarefas em decisão sobre a transação. Estados claros reduzem o risco de duas pessoas acreditarem que a outra já cuidou de um documento ou de uma informação divergente.',
        'Dados pessoais coletados durante uma operação imobiliária podem envolver identificação, contato e documentação financeira. O acesso deve acompanhar a finalidade e a função. Uma pessoa que organiza fotografias não precisa necessariamente acessar toda a documentação de renda. Use canais e repositórios autorizados, com controles definidos pela organização. Conta compartilhada, cópia em celular pessoal ou planilha aberta tornam difícil identificar acesso e conter um envio equivocado.',
        'O encerramento de uma tarefa inclui conferir o resultado e registrar o necessário. O tratamento posterior dos documentos segue as regras da organização e as obrigações aplicáveis, não uma decisão individual de guardar tudo para sempre ou apagar tudo ao final do dia. Diante de envio ao destinatário errado, não tente resolver apenas apagando a mensagem local. Interrompa novos envios e comunique imediatamente ao canal responsável, com informações objetivas para avaliar a ocorrência.',
      ] },
      { title: 'Caso resolvido: pendência enviada sem responsável confirmado', paragraphs: [
        'Uma lista apresenta oito tarefas como concluídas porque todas foram enviadas por mensagem. Ao revisar o fluxo, a equipe identifica duas sem destinatário responsável confirmado. Elas não devem ser tratadas como resultado entregue. O apoio corrige o estado, confirma a atribuição e acompanha o recebimento pelo canal previsto. Não marca a análise profissional como pronta apenas para manter a taxa de conclusão.',
        'A melhoria é definir previamente o que significa concluir cada tarefa. Para organizar um arquivo, pode ser salvar no local correto e confirmar acesso do responsável; para uma análise, o fechamento depende da manifestação de quem tem competência. O painel deixa de contar simples cliques e passa a representar entregas. Documentos pessoais não precisam ser duplicados na lista para demonstrar que a tarefa existe.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie um fluxo fictício de seis tarefas internas com objeto, estado, responsável e evidência de conclusão. Inclua um documento recebido, uma divergência encaminhada e um arquivo disponível no repositório errado. Defina quais pessoas precisam acessar cada informação e explique como evitar uma cópia aberta de documentos pessoais. Escreva uma comunicação objetiva de envio equivocado sem reproduzir dados do titular. Revise se o fluxo permite acompanhar o trabalho e preserva as decisões comerciais e técnicas do corretor.',
      ] },
    ],
  },
];

const activities = [
  { module: 1, skill: 'distinguir-apoio-e-corretagem', prompt: 'O auxiliar recebe pedido para negociar um desconto durante a ausência do corretor. Qual encaminhamento respeita o recorte do curso?', options: ['Assumir a negociação usando a planilha interna.', 'Encaminhar ao corretor responsável, sem prometer condição comercial.', 'Oferecer um abatimento pequeno para agilizar.', 'Apresentar-se como corretor temporário.'] },
  { module: 2, skill: 'conferir-cadastro-imobiliario', prompt: 'O cadastro informa área privativa e uma planilha nova traz outra área sem identificar seu tipo. O apoio deve:', options: ['Sempre usar o maior número.', 'Somar os dois valores.', 'Registrar a divergência e conferir origem, conceito e unidade com o responsável.', 'Excluir a referência do imóvel.'] },
  { module: 3, skill: 'organizar-documentacao-imovel', prompt: 'Um arquivo chegou, mas ainda aguarda análise competente. Qual estado evita uma conclusão indevida?', options: ['Regularidade jurídica garantida.', 'Negócio automaticamente aprovado.', 'Pendência dispensada sem conferência.', 'Recebido, aguardando análise identificada.'] },
  { module: 4, skill: 'controlar-material-imobiliario', prompt: 'Um canal mantém material anterior após atualização aprovada. O controle administrativo deve:', options: ['Registrar a divergência e acompanhar a substituição com o responsável.', 'Criar uma condição comercial para aquele canal.', 'Considerar tudo atualizado porque o arquivo interno mudou.', 'Apagar o histórico de versões.'] },
  { module: 5, skill: 'acompanhar-fluxo-imobiliario', prompt: 'Um documento pessoal foi enviado ao destinatário errado. Qual resposta foi ensinada?', options: ['Apagar a mensagem local e não comunicar.', 'Interromper novos envios e comunicar imediatamente pelo fluxo responsável.', 'Reenviar a um grupo maior para localizar o titular.', 'Guardar uma cópia pessoal para futuras consultas.'] },
];
const exam = [
  { module: 1, skill: 'distinguir-apoio-e-corretagem', prompt: 'Qual tarefa ultrapassa o apoio administrativo estudado?', options: ['Organizar versões documentais.', 'Encaminhar uma pendência.', 'Negociar condições de uma venda imobiliária.', 'Identificar o responsável por análise.'] },
  { module: 1, skill: 'distinguir-apoio-e-corretagem', prompt: 'A conclusão deste curso livre de auxiliar:', options: ['Não substitui a habilitação e o registro profissional exigidos para corretagem.', 'Autoriza intermediação independente.', 'Transforma qualquer empregado em corretor.', 'Dispensa o responsável profissional da imobiliária.'] },
  { module: 2, skill: 'conferir-cadastro-imobiliario', prompt: 'Dois apartamentos no mesmo prédio devem:', options: ['Ter um cadastro único pela fotografia.', 'Ser distinguidos por referência e unidade, com informações de origem identificada.', 'Compartilhar automaticamente todos os documentos.', 'Usar a área do maior apartamento.'] },
  { module: 2, skill: 'conferir-cadastro-imobiliario', prompt: 'Área privativa e área total:', options: ['São sempre valores idênticos.', 'Podem ser trocadas para melhorar a divulgação.', 'Dispensam identificação do conceito.', 'Representam conceitos diferentes que não devem ser substituídos sem conferência.'] },
  { module: 3, skill: 'organizar-documentacao-imovel', prompt: 'Uma pasta com muitos arquivos comprova, por si só:', options: ['Aprovação jurídica completa.', 'Possibilidade de dispensar análise.', 'Somente que há arquivos; é necessário conferir correspondência e estado de análise.', 'Conclusão automática da operação.'] },
  { module: 3, skill: 'organizar-documentacao-imovel', prompt: 'Uma pendência administrativa útil identifica:', options: ['Objeto, ação necessária, responsável e próximo controle.', 'Apenas uma cor sem significado.', 'Uma garantia pessoal de regularidade.', 'Um prazo universal inventado para toda certidão.'] },
  { module: 4, skill: 'controlar-material-imobiliario', prompt: 'Antes de usar uma versão de divulgação, o apoio deve conferir:', options: ['Somente se o arquivo é bonito.', 'Se foi copiada de um imóvel parecido.', 'Se dispensa aprovação por ser digital.', 'Referência do imóvel, informação autorizada, versão e aprovação pelo fluxo responsável.'] },
  { module: 4, skill: 'controlar-material-imobiliario', prompt: 'Uma fotografia que expõe documento pessoal exige:', options: ['Publicação imediata por estar na pasta.', 'Revisão de necessidade e encaminhamento da autorização antes do uso.', 'Envio a grupos pessoais para escolher a melhor versão.', 'Dispensa de cuidado por mostrar o imóvel.'] },
  { module: 5, skill: 'acompanhar-fluxo-imobiliario', prompt: 'Qual distinção melhora o controle das tarefas?', options: ['Enviada significa sempre concluída.', 'Criada e analisada têm o mesmo significado.', 'Encaminhamento, recebimento e resultado concluído são estados diferentes.', 'A tarefa termina quando some da tela.'] },
  { module: 5, skill: 'acompanhar-fluxo-imobiliario', prompt: 'O acesso a documentos pessoais deve acompanhar:', options: ['Finalidade e necessidade da função, em canais autorizados.', 'Curiosidade de qualquer integrante.', 'Uma conta compartilhada sem rastreabilidade.', 'A cópia de tudo em dispositivos pessoais.'] },
];
export const courseRevision = defineCourse({
  courseId: '76562af2-e9f4-405a-81c7-76ee55e0fe51', slug: 'auxiliar-corretor-de-imoveis', courseName: 'Auxiliar Corretor de Imóveis', hours: 100,
  audience: 'Estudantes de apoio administrativo interno imobiliário; o curso livre não confere habilitação para corretagem ou atendimento de intermediação.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'camara-corretagem', title: 'Câmara — Decreto 81.871/1978, texto atualizado', url: 'https://www2.camara.leg.br/legin/fed/decret/1970-1979/decreto-81871-29-junho-1978-430918-normaatualizada-pe.html' },
    { id: 'cofeci-formacao', title: 'COFECI — Como ser corretor de imóveis', url: 'https://www.cofeci.gov.br/como-ser-corretor' },
    { id: 'anpd-seguranca', title: 'ANPD — Guia de segurança da informação', url: 'https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/anonimizado___guia_orientat-_seg_da_inf_p_atpp.pdf' },
  ],
}, modules, activities, exam);
export default courseRevision;
