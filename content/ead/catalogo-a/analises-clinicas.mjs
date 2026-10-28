import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Etapas do exame e responsabilidades no serviço',
    skills: ['distinguir-etapas-laboratoriais'], sourceIds: ['anvisa-eac', 'anvisa-perguntas'],
    sections: [
      { title: 'Ensino: o resultado depende de um processo completo', paragraphs: [
        'Um exame de análises clínicas não começa no equipamento nem termina quando aparece um número na tela. A etapa pré-analítica envolve solicitação, identificação, orientação, obtenção e condições da amostra. A etapa analítica corresponde à realização da análise pelo método e sistema previstos. A pós-analítica inclui avaliação, liberação, comunicação e rastreabilidade do resultado conforme a responsabilidade profissional. Uma falha em qualquer etapa pode comprometer o uso da informação.',
        'O serviço precisa definir quem realiza cada atividade, quais procedimentos se aplicam e como são tratadas as situações fora do previsto. Conhecer o fluxo não autoriza executar todas as suas etapas. Formação, habilitação, supervisão e organização do serviço delimitam as responsabilidades. Este curso aborda fundamentos do processo, qualidade e segurança; não ensina uma coleta invasiva por texto nem substitui formação profissional ou autorização para executar e liberar exames.',
        'A legislação sanitária e os procedimentos precisam ser consultados em versões atualizadas. A Anvisa publicou a RDC 978/2025 para serviços relacionados aos exames de análises clínicas e um documento orientativo com esclarecimentos. Ao usar uma referência, confira o escopo e a existência de atualização. Copiar uma instrução de outro serviço sem analisar método, equipamento e responsabilidade pode produzir uma rotina incompatível.',
      ] },
      { title: 'Caso resolvido: análise correta, amostra de origem incerta', paragraphs: [
        'Um equipamento conclui a análise, mas a equipe percebe que a identificação da amostra não pode ser relacionada com segurança à solicitação. O fato de o equipamento funcionar não resolve a incerteza de origem. O caso deve ser tratado como não conformidade conforme o procedimento, com avaliação responsável antes de qualquer liberação. Não se escolhe um cadastro por semelhança de nome para aproveitar o resultado.',
        'Na investigação, a equipe reconstrói as etapas: recebimento, identificação, movimentação e análise. A pergunta não é apenas “qual equipamento falhou?”, pois a causa pode ser pré-analítica. O histórico permite definir a providência segura e a melhoria necessária. A eficiência não é medida pelo número de resultados liberados a qualquer custo, mas por um processo que produza informação confiável e utilizável.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe um fluxo fictício de exame com três etapas e indique uma falha possível em cada uma. Para cada falha, escreva qual informação precisa ser preservada e quem deve avaliar a continuidade. Não use amostras, dados ou laudos reais. Confira se sua descrição diferencia conhecimento do fluxo de autorização para executar uma atividade e se o encerramento depende da avaliação responsável, em vez de uma decisão improvisada para economizar tempo.',
      ] },
    ],
  },
  {
    title: 'Identificação segura e conferência da solicitação',
    skills: ['conferir-identificacao-exame'], sourceIds: ['ms-identificacao', 'anvisa-eac'],
    sections: [
      { title: 'Ensino: relacionar corretamente pessoa, pedido e material', paragraphs: [
        'A identificação segura procura assegurar que a ação seja destinada à pessoa correta. O protocolo nacional orienta o uso de identificadores e a conferência nas etapas relevantes; nome parecido ou localização na fila não são suficientes para distinguir pessoas. No serviço, a equipe deve conhecer os identificadores e a forma de confirmação previstos, bem como os procedimentos quando há divergência, dificuldade de comunicação ou necessidade de apoio.',
        'A solicitação precisa estar relacionada ao cadastro e à amostra de maneira rastreável. Antes de continuar, confira os elementos definidos no procedimento. Etiquetas e documentos podem conter erro; a aparência organizada não prova correspondência. Quando houver divergência, interrompa o encaminhamento automático e acione a conferência responsável. Não corrija uma etiqueta com base apenas na memória de quem estava por perto.',
        'Confirmação e proteção de dados devem ocorrer juntas. A identificação não exige anunciar em voz alta informações sensíveis para toda a recepção. Utilize a abordagem prevista e condições que preservem a privacidade. Em atividades de ensino, use pessoas e códigos fictícios. Um erro de identificação pode afetar mais de um cadastro, por isso a correção precisa preservar o histórico e ser comunicada conforme o procedimento.',
      ] },
      { title: 'Caso resolvido: nomes semelhantes na recepção', paragraphs: [
        'Duas pessoas têm nomes muito parecidos e solicitações diferentes. Uma etiqueta foi impressa antes da conferência e colocada junto a documentos de outra pessoa. A equipe não deve concluir que a ordem de chegada resolve a dúvida. Confere os identificadores previstos, relaciona pedido e cadastro e trata a etiqueta incorreta conforme o fluxo. Se já houver material envolvido, a avaliação precisa considerar toda a rastreabilidade, e não apenas reimprimir um papel.',
        'Depois da correção, a equipe analisa como as impressões estavam sendo organizadas. Separar os documentos por pessoa e conferir no momento adequado pode reduzir a repetição da falha. A melhoria deve ser verificável, por exemplo, observando se a conferência passou a ocorrer no ponto definido. Apenas dizer “prestar mais atenção” não modifica a organização que permitiu a mistura.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie dois cadastros fictícios com nomes semelhantes e identificadores distintos. Monte uma solicitação e uma etiqueta com uma divergência. Escreva quais relações precisam ser conferidas antes de continuar e como a situação deve ser encaminhada, sem produzir um procedimento de coleta. Confira se a proposta usa mais do que posição na fila ou reconhecimento visual e se a correção mantém evidência do erro. Descreva uma melhoria no processo de impressão que não dependa apenas da memória individual.',
      ] },
    ],
  },
  {
    title: 'Condições da amostra e não conformidades pré-analíticas',
    skills: ['reconhecer-nao-conformidade-amostra'], sourceIds: ['anvisa-eac', 'anvisa-perguntas'],
    sections: [
      { title: 'Ensino: critérios dependem do exame e do procedimento', paragraphs: [
        'Uma amostra precisa ser adequada à finalidade do exame. Tipo de material, recipiente, identificação, volume e condições de conservação ou transporte são definidos conforme o procedimento e o método aplicável. Não existe uma temperatura, prazo ou preparo que possa ser generalizado para todos os exames. Quando houver dúvida sobre uma condição, consulte a instrução vigente e a equipe responsável em vez de adaptar por analogia.',
        'O recebimento da amostra inclui a verificação dos critérios definidos e o registro de desvios. Uma condição inadequada pode exigir avaliação, restrição ou nova obtenção, conforme o caso. Essa decisão pertence ao fluxo técnico autorizado. A pessoa que recebe uma entrega não deve mascarar um atraso alterando o horário nem aceitar uma identificação incerta apenas porque o paciente já foi embora.',
        'Não conformidade é uma situação que não atende ao requisito previsto. Descrever o desvio permite avaliar seu impacto e evitar repetição. Registre o que foi observado, quando foi identificado, qual etapa estava envolvida e quem foi acionado. Distinguir um desvio real de um dado ainda não confirmado também é necessário: a dúvida deve ser esclarecida, não transformada em certeza por conveniência.',
      ] },
      { title: 'Caso resolvido: transporte sem condição confirmada', paragraphs: [
        'Uma amostra chega com identificação legível, mas sem informação que permita confirmar uma condição de transporte exigida pelo procedimento. A etiqueta correta não comprova que todo o percurso foi adequado. A equipe mantém a situação identificada, busca a informação pelo canal previsto e encaminha a avaliação. Não preenche o campo com um valor “habitual” para liberar o fluxo.',
        'A análise posterior indica que o formulário de transferência não tinha um campo necessário e que as equipes usavam versões diferentes. A correção inclui padronizar a versão e orientar os pontos de envio, verificando a aplicação nos próximos recebimentos. O caso mostra que tratar não conformidade envolve tanto a decisão sobre a amostra quanto a prevenção da causa no processo.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie uma situação fictícia de recebimento com um requisito não atendido e outra com informação pendente. Não invente limites técnicos para exames. Use a expressão “requisito definido no procedimento” e explique quais evidências seriam necessárias para decidir. Escreva um registro de não conformidade e proponha uma melhoria de formulário ou comunicação. Confira se sua solução preserva os dados observados, evita alterar horários e depende da avaliação técnica responsável quando há impacto potencial no resultado.',
      ] },
    ],
  },
  {
    title: 'Qualidade analítica, controles e avaliação de desvios',
    skills: ['entender-controle-qualidade-exame'], sourceIds: ['anvisa-eac', 'anvisa-perguntas'],
    sections: [
      { title: 'Ensino: controle não é formalidade de preenchimento', paragraphs: [
        'O controle da qualidade procura acompanhar se o sistema analítico funciona dentro dos requisitos estabelecidos. Procedimentos, equipamentos, materiais, manutenção, condições de uso e avaliação dos controles compõem esse processo. O equipamento apresentar um número não basta para provar que o resultado deve ser liberado. A interpretação dos controles e as providências diante de desvios seguem critérios técnicos e responsabilidades definidos.',
        'Diferencie executar uma verificação de avaliar seu resultado. Um registro marcado como realizado não comprova que o critério foi atendido nem que um desvio recebeu tratamento. Quando o controle indica condição fora do previsto, a equipe deve seguir o procedimento de avaliação e liberação responsável. Repetir indefinidamente até aparecer um valor esperado, sem investigar e registrar, elimina informação relevante sobre o desempenho do processo.',
        'A rastreabilidade deve relacionar o que foi utilizado e as condições relevantes de realização. Mudança de lote, intervenção em equipamento ou falha identificada podem exigir verificações previstas. Não se altera um registro para fazer parecer que o sistema estava conforme antes de uma intervenção. O histórico auxilia a avaliar impacto, definir providências e demonstrar que a causa foi tratada.',
      ] },
      { title: 'Caso resolvido: controle com desvio antes da rotina', paragraphs: [
        'Antes da rotina, uma verificação apresenta resultado fora do critério estabelecido. O operador não deve ignorar o registro porque existe fila. Aciona a avaliação responsável e segue o procedimento para a condição identificada. A investigação pode considerar materiais, equipamento e etapas de execução, sem antecipar uma causa. A continuidade e a liberação dependem da verificação técnica prevista, não da pressão por produtividade.',
        'Após uma correção, a equipe documenta o que foi identificado, qual intervenção ocorreu e como confirmou a condição para retomar o trabalho. Se resultados anteriores puderem ter sido afetados, sua avaliação segue o fluxo responsável. O caso ensina a ligação entre controle e decisão: um controle é útil quando sua informação orienta a ação, e não quando é apenas arquivado como evidência de que uma tarefa foi feita.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Elabore um registro fictício de desvio em verificação, sem números clínicos ou limites inventados. Inclua observação, etapa, encaminhamento, decisão responsável e confirmação posterior. Depois compare duas situações: verificação executada sem avaliação e verificação avaliada com providência documentada. Explique por que elas não representam a mesma evidência de qualidade. Revise se seu fluxo evita repetição sem investigação e se permite relacionar a intervenção ao retorno autorizado da rotina.',
      ] },
    ],
  },
  {
    title: 'Liberação, comunicação e rastreabilidade pós-analítica',
    skills: ['reconhecer-liberacao-responsavel'], sourceIds: ['anvisa-eac', 'ms-identificacao', 'anpd-seguranca'],
    sections: [
      { title: 'Ensino: informação precisa chegar ao destinatário correto', paragraphs: [
        'A etapa pós-analítica organiza avaliação e liberação do resultado, entrega e comunicação conforme as responsabilidades do serviço. Um laudo não é apenas um arquivo a encaminhar: precisa estar relacionado à pessoa e ao exame corretos e passar pelo fluxo de validação. O trabalhador não deve interpretar um resultado para orientar mudança de tratamento sem competência e atribuição para isso.',
        'O serviço deve definir como comunicar situações que exigem atenção e quem recebe a informação. Um aviso enviado não significa que a comunicação foi confirmada. Quando o procedimento exige confirmação ou retorno, essa etapa precisa ser acompanhada e registrada. A regra também deve prever como tratar falha de contato, sem divulgar dados em canais públicos ou a pessoas não autorizadas.',
        'Se um resultado precisar de correção, preserve o histórico e siga o fluxo de revisão e comunicação. Substituir silenciosamente um arquivo pode impedir que o destinatário perceba a mudança. A rastreabilidade permite identificar versão, liberação e providências relevantes. A proteção de dados continua após a análise: compartilhamento, armazenamento e descarte devem usar as condições autorizadas pelo serviço.',
      ] },
      { title: 'Caso resolvido: arquivo enviado ao contato errado', paragraphs: [
        'Na preparação da entrega, a equipe identifica que o endereço eletrônico selecionado não corresponde ao destinatário autorizado. Antes do envio, interrompe a operação e confirma cadastro e canal. Se o envio já tiver ocorrido, a situação deve ser comunicada pelo fluxo de incidente, sem esconder o erro. O fato de o exame estar tecnicamente concluído não elimina o risco de exposição e de falha na continuidade do cuidado.',
        'A investigação identifica uma seleção automática de contatos antigos. A melhoria inclui conferir o destinatário no ponto previsto e tratar a atualização cadastral, além das providências responsáveis sobre o incidente. O caso não se resolve apenas reenviando para outro endereço: é necessário considerar o que aconteceu com a informação e manter registro que permita acompanhamento.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe um fluxo fictício de entrega de resultado com conferência de identificação, autorização de liberação, destinatário e confirmação quando exigida. Inclua um caminho para contato incorreto e outro para revisão de um arquivo já liberado. Não use laudos reais nem tente interpretar valores clínicos. Confira se sua proposta mantém histórico de versões, diferencia envio de comunicação confirmada e prevê encaminhamento ao responsável quando a segurança da informação é afetada.',
      ] },
    ],
  },
];

const activities = [
  { module: 1, skill: 'distinguir-etapas-laboratoriais', prompt: 'Uma análise foi executada corretamente, mas a origem da amostra é incerta. Qual conclusão é adequada?', options: ['O equipamento funcionando elimina a dúvida.', 'A incerteza de identificação precisa de avaliação antes de liberar.', 'Pode-se escolher o cadastro de nome mais parecido.', 'A etapa pré-analítica não afeta o resultado.'] },
  { module: 2, skill: 'conferir-identificacao-exame', prompt: 'Duas pessoas têm nomes semelhantes e uma etiqueta está junto ao pedido errado. O que fazer?', options: ['Usar a ordem de chegada como único identificador.', 'Corrigir pela memória sem conferir.', 'Conferir os identificadores e tratar a divergência pelo fluxo responsável.', 'Ignorar se a impressão estiver legível.'] },
  { module: 3, skill: 'reconhecer-nao-conformidade-amostra', prompt: 'Não há informação para confirmar uma condição de transporte exigida. Qual é a conduta estudada?', options: ['Preservar a pendência e encaminhar a conferência e avaliação.', 'Preencher com a condição habitual.', 'Alterar o horário de recebimento para adequar a amostra.', 'Considerar a etiqueta legível prova de todo o percurso.'] },
  { module: 4, skill: 'entender-controle-qualidade-exame', prompt: 'Uma verificação está fora do critério previsto antes da rotina. Qual resposta relaciona controle à qualidade?', options: ['Ignorar porque há fila.', 'Repetir até coincidir sem manter histórico.', 'Marcar como conforme para não atrasar.', 'Acionar avaliação e documentar as providências previstas.'] },
  { module: 5, skill: 'reconhecer-liberacao-responsavel', prompt: 'O endereço de entrega selecionado diverge do destinatário autorizado. Qual providência antecede o envio?', options: ['Enviar e confirmar depois.', 'Interromper e conferir o cadastro e o canal correto.', 'Escolher qualquer contato da lista.', 'Publicar o laudo em um grupo para facilitar acesso.'] },
];

const exam = [
  { module: 1, skill: 'distinguir-etapas-laboratoriais', prompt: 'Qual conjunto pertence ao processo pré-analítico descrito?', options: ['Somente liberar o arquivo final.', 'Apenas avaliar o controle do equipamento.', 'Solicitação, identificação e condições da amostra.', 'Interpretar tratamento após o laudo.'] },
  { module: 1, skill: 'distinguir-etapas-laboratoriais', prompt: 'Conhecer todas as etapas de um exame autoriza uma pessoa a executá-las e liberar resultados?', options: ['Não; formação, atribuição e organização do serviço delimitam responsabilidades.', 'Sim, se o equipamento for automático.', 'Sim, se o paciente tiver pressa.', 'Sim, porque o fluxo é o mesmo para qualquer serviço.'] },
  { module: 2, skill: 'conferir-identificacao-exame', prompt: 'Por que a posição de uma pessoa na fila não é suficiente para a identificação segura?', options: ['Porque a fila nunca muda.', 'Porque elimina a necessidade de cadastro.', 'Porque substitui a conferência do pedido.', 'Porque não relaciona com segurança os identificadores previstos, o cadastro e o material.'] },
  { module: 2, skill: 'conferir-identificacao-exame', prompt: 'Qual melhoria enfrenta mistura de documentos na impressão?', options: ['Orientar apenas que todos tenham mais atenção.', 'Organizar documentos por pessoa e conferir no ponto definido do processo.', 'Imprimir sem identificação para evitar troca de nomes.', 'Corrigir qualquer etiqueta pela memória.'] },
  { module: 3, skill: 'reconhecer-nao-conformidade-amostra', prompt: 'Um prazo e uma condição de conservação podem ser generalizados para todos os exames?', options: ['Sim, se forem fáceis de lembrar.', 'Sim, porque todo material tem a mesma finalidade.', 'Não; os requisitos dependem do exame, método e procedimento aplicável.', 'Não; por isso a condição não precisa ser registrada.'] },
  { module: 3, skill: 'reconhecer-nao-conformidade-amostra', prompt: 'Qual registro ajuda a avaliar uma não conformidade?', options: ['Observação, momento, etapa envolvida e responsável acionado.', 'Somente uma hipótese de culpa.', 'Um horário alterado para ocultar atraso.', 'A informação habitual usada no lugar da não confirmada.'] },
  { module: 4, skill: 'entender-controle-qualidade-exame', prompt: 'Qual diferença existe entre verificar e avaliar o controle?', options: ['Nenhuma; marcar realizado prova conformidade.', 'Avaliar dispensa qualquer critério.', 'O equipamento sempre decide a liberação sozinho.', 'Avaliar relaciona o resultado ao critério e às providências responsáveis.'] },
  { module: 4, skill: 'entender-controle-qualidade-exame', prompt: 'Após corrigir um desvio, qual informação permite acompanhar a retomada?', options: ['Somente o número de repetições sem contexto.', 'Intervenção realizada e confirmação da condição prevista para continuar.', 'Um registro reescrito para parecer que nunca houve falha.', 'A quantidade de pessoas esperando.'] },
  { module: 5, skill: 'reconhecer-liberacao-responsavel', prompt: 'Quando um resultado liberado precisa de revisão, o fluxo deve:', options: ['Preservar histórico e realizar a comunicação responsável da alteração.', 'Substituir silenciosamente o arquivo.', 'Apagar todas as versões anteriores sem controle.', 'Deixar o destinatário descobrir a diferença.'] },
  { module: 5, skill: 'reconhecer-liberacao-responsavel', prompt: 'Se o procedimento exige confirmação de comunicação, uma mensagem enviada representa:', options: ['Garantia de que o destinatário compreendeu.', 'Encerramento automático de qualquer pendência.', 'Uma etapa que ainda pode exigir verificação de recebimento ou retorno.', 'Autorização para compartilhar o resultado publicamente.'] },
];

export const courseRevision = defineCourse({
  courseId: '6118bbf6-3490-498b-b4e1-2b401c59bdcc', slug: 'analises-clinicas',
  courseName: 'Análises Clínicas', hours: 120,
  audience: 'Interessados em fundamentos do processo laboratorial e profissionais que revisam qualidade, identificação e rastreabilidade dentro de suas atribuições.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'anvisa-eac', title: 'Anvisa — RDC 978/2025, serviços relacionados a exames de análises clínicas', url: 'https://anvisalegis.datalegis.net/action/ActionDatalegis.php?acao=detalharAto&cod_menu=1696&cod_modulo=134&nomeTitulo=codigos&numeroAto=00000978&orgao=RDC%2FDC%2FANVISA%2FMS&seqAto=000&tipo=RDC&valorAno=2025' },
    { id: 'anvisa-perguntas', title: 'Anvisa — Perguntas e respostas sobre a RDC 978/2025', url: 'https://www.gov.br/anvisa/pt-br/centraisdeconteudo/publicacoes/servicosdesaude/perguntas-e-respostas/p-r__978_2025_1a-versao-revisada_portal_27ago2025.pdf/@@download/file' },
    { id: 'ms-identificacao', title: 'MS/Anvisa/Fiocruz — Protocolo de identificação do paciente', url: 'https://bibliotecadigital.anvisa.gov.br/jspui/handle/anvisa/1778?mode=full' },
    { id: 'anpd-seguranca', title: 'ANPD — Guia orientativo de segurança da informação', url: 'https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/anonimizado___guia_orientat-_seg_da_inf_p_atpp.pdf' },
  ],
}, modules, activities, exam);

export default courseRevision;
