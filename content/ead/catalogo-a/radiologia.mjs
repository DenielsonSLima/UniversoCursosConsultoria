import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Modalidades de imagem e organização do serviço',
    skills: ['distinguir-modalidades-imagem'], sourceIds: ['anvisa-radiologia', 'fda-raiosx'],
    sections: [
      { title: 'Ensino: tecnologias diferentes exigem riscos e protocolos próprios', paragraphs: [
        'Radiografia, tomografia computadorizada e fluoroscopia utilizam raios X, uma forma de radiação ionizante. Na radiografia, obtém-se uma imagem projetiva; na tomografia, projeções são processadas para formar cortes; na fluoroscopia, imagens acompanham um processo ao longo do tempo. Essas diferenças afetam a finalidade, o controle da qualidade e o planejamento da proteção. Uma imagem digital não deixa de envolver exposição apenas por não usar filme.',
        'Ultrassonografia e ressonância magnética empregam outras tecnologias e não devem receber automaticamente os mesmos procedimentos dos sistemas de raios X. Ausência de radiação ionizante não significa ausência de riscos ou de requisitos próprios. A equipe precisa conhecer a modalidade, o ambiente e os protocolos em que atua. Este curso revisa conceitos de qualidade e organização; não substitui habilitação profissional, treinamento no equipamento ou definição de protocolo clínico.',
        'O serviço organiza responsabilidades, educação permanente, garantia da qualidade e proteção radiológica quando aplicável. O trabalhador deve saber quem pode avaliar um desvio e interromper uma condição insegura. Uma mudança de equipamento ou sistema precisa ser acompanhada de avaliação e treinamento, não apenas da entrega de um manual. A atualização profissional liga conhecimento técnico à forma real de trabalho e às responsabilidades definidas.',
      ] },
      { title: 'Caso resolvido: digital não significa sem exposição', paragraphs: [
        'Durante uma conversa de equipe, alguém afirma que uma radiografia digital pode ser repetida sem preocupação porque não utiliza filme. A afirmação confunde forma de registro com produção da imagem. A aquisição continua utilizando raios X. A decisão sobre necessidade e repetição deve seguir a avaliação e o protocolo responsável, considerando qualidade e exposição, em vez de tratar a facilidade digital como autorização para novas aquisições.',
        'A equipe transforma a dúvida em educação permanente: revisa o percurso da imagem, distingue aquisição de processamento e define como registrar repetições e suas causas. Não basta decorar que uma modalidade é digital; é preciso entender o que ocorre antes de o arquivo aparecer na estação. O caso ajuda a reconhecer uma mudança tecnológica sem abandonar os critérios de proteção e qualidade.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte um quadro com radiografia, tomografia, fluoroscopia, ultrassom e ressonância, indicando que não são tecnologias intercambiáveis. Descreva quais informações você precisaria obter no treinamento do serviço antes de atuar em uma modalidade. Não invente parâmetros de aquisição ou protocolos clínicos. Confira se seu quadro evita associar digital a ausência de exposição e se diferencia uma revisão conceitual de uma autorização profissional para executar exames.',
      ] },
    ],
  },
  {
    title: 'Justificação, otimização e prevenção de repetições desnecessárias',
    skills: ['distinguir-justificacao-otimizacao'], sourceIds: ['fda-raiosx', 'anvisa-radiologia'],
    sections: [
      { title: 'Ensino: benefício clínico e qualidade adequada à finalidade', paragraphs: [
        'A justificação analisa se a exposição proposta tem benefício esperado que sustente sua realização para a necessidade clínica. A otimização procura produzir informação adequada à finalidade com proteção ajustada ao procedimento. Reduzir um parâmetro sem verificar se a imagem continua respondendo à questão clínica não é otimizar. Também não se deve aumentar exposição apenas para obter uma aparência visual considerada mais bonita.',
        'As decisões envolvem profissionais com responsabilidades diferentes e precisam de comunicação. A equipe deve conhecer os protocolos aprovados e como tratar situações que exigem avaliação. Características da pessoa e da finalidade do exame são consideradas pelos responsáveis, sem transformar um exemplo didático em tabela universal de parâmetros. O estudo desta aula não fornece valores de dose nem instruções para alterar uma aquisição real.',
        'Repetições merecem análise de causa. Movimento, identificação, enquadramento ou condição do equipamento podem gerar situações distintas. A decisão sobre aproveitamento ou nova aquisição não deve ser automática nem escondida do registro. Acompanhar causas permite agir no processo: comunicação, preparação, treinamento ou avaliação técnica. Contar apenas o total de imagens não mostra por que houve repetição nem se a intervenção melhorou o resultado.',
      ] },
      { title: 'Caso resolvido: proposta de reduzir tudo ao mínimo', paragraphs: [
        'Uma equipe propõe reduzir indiscriminadamente os parâmetros de todos os exames para diminuir exposição. A intenção de proteção não basta: se a informação necessária ficar inadequada e provocar repetição, o processo pode piorar. A revisão deve ocorrer com os responsáveis, protocolos e verificações de qualidade aplicáveis. O objetivo é adequação à finalidade com proteção, não escolher um extremo sem avaliar o resultado.',
        'Em um conjunto fictício de repetições, a maior parte das falhas está relacionada a instruções que não foram compreendidas. Antes de atribuir o problema ao equipamento, a equipe revisa a comunicação com o paciente e acompanha se a mudança reduz essa causa específica. O registro da repetição deixa de ser visto como punição e passa a orientar prevenção, mantendo a responsabilidade pelas decisões técnicas.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Escreva duas situações fictícias: uma dúvida sobre necessidade do exame e um problema de qualidade em uma imagem. Explique por que elas não são a mesma decisão. Crie um quadro de causas de repetição e proponha uma ação de melhoria para uma causa de comunicação, sem indicar parâmetros clínicos. Confira se sua proposta mantém avaliação responsável e critérios de qualidade. Defina qual evidência permitirá verificar a melhora sem estimular a ocultação de repetições.',
      ] },
    ],
  },
  {
    title: 'Qualidade de imagem, artefatos e verificações do sistema',
    skills: ['relacionar-qualidade-desvio-radiologia'], sourceIds: ['anvisa-radiologia', 'fda-raiosx'],
    sections: [
      { title: 'Ensino: reconhecer uma condição de qualidade sem improvisar ajuste', paragraphs: [
        'A qualidade de imagem precisa ser suficiente à finalidade do exame. Nitidez, ruído, contraste e presença de artefatos podem influenciar a informação disponível. Um artefato é uma característica que não corresponde ao objeto que se pretende representar e pode decorrer de diferentes etapas. Reconhecer que existe um problema não equivale a determinar sua causa ou a interpretar clinicamente uma imagem.',
        'Testes de aceitação e de constância têm funções diferentes. A aceitação verifica condições previstas para o equipamento e sua instalação; a constância acompanha parâmetros e desempenho ao longo da rotina. Os testes, critérios e periodicidades dependem das normas aplicáveis, do sistema e das instruções responsáveis. Não se deve inventar uma frequência única para qualquer modalidade nem considerar que um teste inicial dispensa o acompanhamento posterior.',
        'Uma condição fora do critério precisa ser registrada e avaliada. Manutenção, atualização ou mudança de componente podem exigir verificações antes da retomada conforme o procedimento. Não altere um registro para fazer parecer que o sistema permaneceu conforme. A documentação permite relacionar desvio, intervenção e confirmação do desempenho. A qualidade é um processo contínuo, não um certificado que elimina futuras verificações.',
      ] },
      { title: 'Caso resolvido: marca recorrente nas imagens', paragraphs: [
        'Em um conjunto fictício de imagens, aparece uma marca recorrente em posição semelhante. A equipe não deve interpretá-la imediatamente como característica de todos os pacientes nem tentar eliminar o problema ajustando parâmetros aleatoriamente. Registra o padrão observado e aciona a avaliação técnica, considerando as etapas de aquisição, processamento e apresentação. O objetivo é investigar a origem sem produzir novas exposições como teste improvisado.',
        'Depois da intervenção autorizada, o retorno ao uso depende das verificações previstas e de sua confirmação. A equipe mantém o histórico e acompanha se a condição voltou a ocorrer. O caso mostra por que observar um padrão é útil e por que ele não autoriza concluir uma causa sem análise. A documentação também ajuda a avaliar se alguma produção anterior precisa de revisão responsável.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie um registro fictício de desvio com descrição observável, modalidade, etapa e encaminhamento. Não use imagens reais nem defina um diagnóstico. Diferencie teste inicial de aceitação e acompanhamento de constância com suas próprias palavras. Escreva quais informações seriam necessárias para verificar a retomada após uma intervenção. Confira se o fluxo preserva histórico e evita alterar parâmetros ou repetir exames por tentativa sem o procedimento e a responsabilidade técnica correspondentes.',
      ] },
    ],
  },
  {
    title: 'Identificação, comunicação e segurança no percurso do paciente',
    skills: ['conferir-percurso-paciente-imagem'], sourceIds: ['anvisa-radiologia', 'ms-identificacao'],
    sections: [
      { title: 'Ensino: relacionar paciente, solicitação e procedimento', paragraphs: [
        'A segurança do percurso começa pela correspondência entre pessoa, solicitação e procedimento. A conferência prevista no serviço não deve ser substituída por número da sala, posição na fila ou nome semelhante. Se houver dúvida sobre identificação, informação clínica necessária ou exame solicitado, encaminhe a avaliação antes de continuar automaticamente. A comunicação entre recepção, equipe de aquisição e responsáveis deve preservar essa correspondência.',
        'Orientações claras ajudam o paciente a compreender o que ocorrerá e a comunicar uma necessidade. Utilize instruções adequadas ao procedimento e confirme entendimento, respeitando acessibilidade e privacidade. Não prometa ausência total de risco nem ofereça preparo genérico para qualquer modalidade. Dúvidas sobre condição clínica, contraste ou adequação do exame precisam ser avaliadas pelos profissionais responsáveis dentro do protocolo aplicável.',
        'O ambiente possui controles próprios de acesso e segurança. A presença de acompanhante e as condições de participação seguem avaliação e regras do serviço; não são decididas apenas por preferência de quem está no posto. A equipe deve conhecer seus limites de atuação, os canais de apoio e o procedimento de incidente. Uma necessidade relatada pelo paciente deve chegar a quem pode avaliá-la, sem exposição desnecessária na sala de espera.',
      ] },
      { title: 'Caso resolvido: solicitação e cadastro divergentes', paragraphs: [
        'Antes do encaminhamento à sala, a equipe percebe que o cadastro selecionado e a solicitação não correspondem de forma segura. Mesmo que haja atraso na agenda, a continuidade precisa aguardar a conferência responsável. Não se escolhe o cadastro de nome mais próximo nem se altera o pedido para coincidir com a marcação. A identificação correta é parte do cuidado, e não uma etapa administrativa dispensável.',
        'Após resolver a divergência, o paciente recebe informação compreensível sobre o próximo passo. A equipe registra a situação conforme o fluxo e analisa como a troca ocorreu. A melhoria pode envolver a busca cadastral e a conferência no momento certo. O caso relaciona comunicação e segurança: manter a pessoa informada não significa permitir que a pressão por rapidez substitua a verificação.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe um percurso fictício desde a recepção até a entrega da informação final, destacando pontos de conferência de identidade e solicitação. Inclua uma dificuldade de comunicação e uma dúvida clínica que deve ser encaminhada. Não escreva preparo, dose ou decisão de contraste para paciente real. Confira se o fluxo permite interromper uma divergência, proteger a privacidade e transmitir a necessidade ao responsável. Explique por que uma marcação na agenda não comprova, sozinha, correspondência do procedimento.',
      ] },
    ],
  },
  {
    title: 'Imagem digital, DICOM, armazenamento e rastreabilidade',
    skills: ['rastrear-informacao-imagem-digital'], sourceIds: ['dicom-introducao', 'anvisa-radiologia'],
    sections: [
      { title: 'Ensino: o arquivo inclui informação além da imagem visível', paragraphs: [
        'O padrão DICOM organiza comunicação e gerenciamento de imagens médicas e dados relacionados. A imagem não é apenas uma fotografia da tela: está associada a informações que permitem relacioná-la a um estudo e a um paciente. Sistemas de armazenamento e comunicação de imagens, frequentemente chamados PACS, participam do percurso digital. Conhecer essas funções ajuda a reconhecer falhas de associação, disponibilidade ou apresentação.',
        'Interoperabilidade não significa que qualquer combinação de sistemas funciona sem avaliação. É necessário verificar as capacidades implementadas, a configuração e o fluxo do serviço. O padrão não substitui o teste da integração real. Uma imagem enviada não comprova, por si só, que chegou ao estudo correto e ficou acessível para a finalidade prevista. A equipe precisa conhecer como confirmar o resultado e tratar uma falha sem criar arquivos paralelos descontrolados.',
        'A proteção dos dados inclui controle de acesso, rastreabilidade e cuidado com cópias e compartilhamentos. Capturar a tela e enviar por um canal pessoal pode perder contexto e expor informação. Se houver associação incorreta, não altere silenciosamente a identidade do estudo por conveniência. A correção segue o procedimento responsável, preservando histórico e comunicação quando necessário. O uso didático exige dados fictícios ou tratamento autorizado que proteja a identidade.',
      ] },
      { title: 'Caso resolvido: envio concluído, estudo não localizado', paragraphs: [
        'O sistema informa que um envio terminou, mas a estação de destino não mostra o estudo esperado. A equipe não deve repetir o exame para produzir outro arquivo sem verificar o percurso digital. Confere a identificação, o destino e o estado da transferência conforme os procedimentos e aciona o suporte responsável. A falha pode estar na associação ou disponibilidade da informação, não na aquisição da imagem.',
        'Depois da regularização, verifica se o estudo correto está acessível com os dados correspondentes. A solução é registrada e o processo revisto para reduzir recorrência. O caso mostra que conclusão de uma tarefa técnica e resultado utilizável são etapas relacionadas, mas diferentes. A rastreabilidade evita que um problema de comunicação digital se transforme em exposição adicional ou em mistura de históricos.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte um diagrama fictício com aquisição, transferência, armazenamento e estação de avaliação. Identifique quais confirmações seriam necessárias em cada etapa e crie uma situação de estudo não localizado. Não utilize arquivos de pacientes. Escreva o encaminhamento que diferencia falha digital de necessidade de nova aquisição. Confira se sua proposta preserva identificação e histórico e se evita capturas de tela em canais pessoais como substituto do fluxo autorizado. Explique também por que o nome do padrão não dispensa testar a integração.',
      ] },
    ],
  },
];

const activities = [
  { module: 1, skill: 'distinguir-modalidades-imagem', prompt: 'Alguém afirma que radiografia digital não envolve exposição porque não usa filme. Qual análise é correta?', options: ['A forma digital elimina a produção de raios X.', 'Toda imagem digital é ultrassonografia.', 'A afirmação confunde registro digital com aquisição que continua utilizando raios X.', 'Sem filme, repetições não precisam de avaliação.'] },
  { module: 2, skill: 'distinguir-justificacao-otimizacao', prompt: 'Reduzir indiscriminadamente parâmetros sem verificar a informação diagnóstica representa otimização adequada?', options: ['Sim, pois o menor valor sempre é melhor.', 'Sim, mesmo que provoque repetição.', 'Sim, se a imagem ficar visualmente diferente.', 'Não; proteção precisa manter qualidade adequada à finalidade, com avaliação responsável.'] },
  { module: 3, skill: 'relacionar-qualidade-desvio-radiologia', prompt: 'Uma marca recorrente aparece em várias imagens. Qual é a conduta estudada?', options: ['Registrar o padrão e acionar avaliação técnica, sem ajustes aleatórios ou novas exposições de teste.', 'Concluir que todos os pacientes têm a mesma alteração.', 'Apagar o registro para não aumentar a taxa de falhas.', 'Repetir indefinidamente até desaparecer.'] },
  { module: 4, skill: 'conferir-percurso-paciente-imagem', prompt: 'Cadastro e solicitação apresentam divergência antes do encaminhamento. O que deve ocorrer?', options: ['Escolher o nome mais próximo.', 'Conferir a correspondência pelo fluxo responsável antes da continuidade.', 'Alterar o pedido para coincidir com a agenda.', 'Continuar porque a sala está livre.'] },
  { module: 5, skill: 'rastrear-informacao-imagem-digital', prompt: 'O envio terminou, mas o estudo não está disponível no destino esperado. Qual passo antecede pensar em nova aquisição?', options: ['Fazer outro exame para gerar novo arquivo.', 'Enviar fotografia da tela a um contato pessoal.', 'Conferir identificação, destino e estado da transferência com o suporte responsável.', 'Alterar a identidade do estudo sem histórico.'] },
];

const exam = [
  { module: 1, skill: 'distinguir-modalidades-imagem', prompt: 'Qual conjunto utiliza raios X conforme a distinção estudada?', options: ['Ultrassom e ressonância como tecnologias idênticas.', 'Radiografia, tomografia computadorizada e fluoroscopia.', 'Somente imagens registradas em filme.', 'Toda fotografia digital.'] },
  { module: 1, skill: 'distinguir-modalidades-imagem', prompt: 'Uma mudança de equipamento exige:', options: ['Apenas disponibilizar um manual sem avaliar a rotina.', 'Dispensar formação por ser tecnologia nova.', 'Aplicar automaticamente o protocolo de outra modalidade.', 'Avaliação, treinamento e responsabilidades compatíveis com o novo sistema.'] },
  { module: 2, skill: 'distinguir-justificacao-otimizacao', prompt: 'A justificação se relaciona principalmente à:', options: ['Necessidade e benefício esperado que sustentam a realização da exposição.', 'Escolha da aparência mais bonita de qualquer imagem.', 'Eliminação de todos os registros de repetição.', 'Redução de qualquer parâmetro ao mínimo sem avaliar qualidade.'] },
  { module: 2, skill: 'distinguir-justificacao-otimizacao', prompt: 'Analisar causas de repetição permite:', options: ['Ocultar falhas para melhorar um indicador.', 'Substituir o protocolo por tentativa pessoal.', 'Definir melhorias em comunicação, preparação ou avaliação técnica conforme a causa.', 'Concluir que todo problema é do equipamento.'] },
  { module: 3, skill: 'relacionar-qualidade-desvio-radiologia', prompt: 'Qual distinção entre aceitação e constância foi ensinada?', options: ['São nomes para o mesmo registro sem finalidade.', 'Aceitação verifica condições iniciais previstas; constância acompanha desempenho na rotina.', 'Um teste inicial elimina necessidade de acompanhamento.', 'Constância significa alterar parâmetros até obter aparência agradável.'] },
  { module: 3, skill: 'relacionar-qualidade-desvio-radiologia', prompt: 'Após uma intervenção técnica, o retorno precisa estar relacionado a:', options: ['Pressa da agenda como único critério.', 'Um registro alterado para esconder o desvio.', 'Número de pessoas esperando.', 'Verificações previstas e confirmação documentada da condição para retomada.'] },
  { module: 4, skill: 'conferir-percurso-paciente-imagem', prompt: 'Qual relação precisa ser preservada ao longo do percurso?', options: ['Pessoa, solicitação e procedimento corretos.', 'Somente horário e número da sala.', 'A ordem da fila como único identificador.', 'Aparecimento do nome em qualquer cadastro.'] },
  { module: 4, skill: 'conferir-percurso-paciente-imagem', prompt: 'Uma dúvida sobre contraste ou adequação clínica deve:', options: ['Ser respondida com uma regra genérica para todos.', 'Chegar ao profissional responsável no protocolo aplicável.', 'Ser decidida por quem tiver menos fila.', 'Ser ignorada para preservar o horário.'] },
  { module: 5, skill: 'rastrear-informacao-imagem-digital', prompt: 'DICOM se relaciona a:', options: ['Uma autorização universal para executar exames.', 'Um método que dispensa informações do paciente.', 'Comunicação e gerenciamento de imagens médicas e dados relacionados.', 'Uma garantia de que qualquer integração funciona sem teste.'] },
  { module: 5, skill: 'rastrear-informacao-imagem-digital', prompt: 'Uma correção de associação de estudo deve:', options: ['Seguir o procedimento responsável, preservando identificação e histórico.', 'Ser feita silenciosamente para qualquer cadastro conveniente.', 'Ser substituída por imagem enviada a grupo pessoal.', 'Levar automaticamente a uma nova exposição.'] },
];

export const courseRevision = defineCourse({
  courseId: 'ea43f49c-0eec-48a4-9fb3-cdd84dfb7a11', slug: 'atualizacao-em-radiologia',
  courseName: 'Atualização em Radiologia', hours: 100,
  audience: 'Profissionais e estudantes que revisam fundamentos de qualidade, proteção, identificação e fluxo digital dentro de suas atribuições em radiologia.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'anvisa-radiologia', title: 'Anvisa/Secretaria de Saúde do Paraná — RDC 611/2022', url: 'https://www.saude.pr.gov.br/sites/default/arquivos_restritos/files/documento/2022-07/rdcndeg61.pdf' },
    { id: 'fda-raiosx', title: 'FDA — Medical X-ray Imaging, justificação e otimização', url: 'https://www.fda.gov/radiation-emitting-products/medical-imaging/medical-x-ray-imaging' },
    { id: 'ms-identificacao', title: 'Ministério da Saúde — Protocolo de identificação do paciente', url: 'https://www.gov.br/saude/pt-br/composicao/saes/seguranca-do-paciente/publicacoes/protocolos-de-seguranca-do-paciente/protocolo-de-identificacao-do-paciente/view' },
    { id: 'dicom-introducao', title: 'DICOM/NEMA — Introdução e escopo do padrão', url: 'https://dicom.nema.org/medical/dicom/current/output/chtml/part01/chapter_1.html' },
  ],
}, modules, activities, exam);

export default courseRevision;
