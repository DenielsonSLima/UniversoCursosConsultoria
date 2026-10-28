import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Apoio veterinário, supervisão e observação objetiva',
    skills: ['distinguir-observacao-decisao-veterinaria'], sourceIds: ['cfmv-auxiliar'],
    sections: [
      { title: 'Ensino: reconhecer uma mudança e comunicá-la não é diagnosticar', paragraphs: [
        'O auxiliar apoia atividades sob orientação e supervisão diretas e contínuas do médico-veterinário. A Resolução CFMV 1260/2019, com alterações posteriores, delimita esse apoio e não permite substituir atos privativos do profissional. Este curso desenvolve fundamentos de organização e cuidado supervisionado. A leitura não habilita a diagnosticar, prescrever, realizar cirurgia ou executar uma técnica para a qual não houve capacitação e autorização no contexto aplicável.',
        'Observar significa descrever o que se percebe e em quais condições: aceitação da alimentação oferecida, postura, comportamento, eliminação ou alteração notada durante a permanência no serviço. Um registro distingue fato observado, relato do responsável pelo animal e informação do médico-veterinário. Dizer que o animal não consumiu a porção oferecida às 14h é diferente de concluir que tem uma doença específica. A interpretação e a conduta clínica pertencem ao profissional responsável.',
        'Uma alteração preocupante precisa ser comunicada prontamente pelo fluxo do serviço; o auxiliar não espera terminar um formulário para avisar. A mensagem identifica animal, local, momento e mudança observada. Evite expressões vagas como está estranho quando é possível descrever o que ocorreu. Não use uma lista genérica de valores normais para decidir sozinho que a situação pode aguardar. Espécie, condição individual e contexto influenciam a avaliação veterinária.',
      ] },
      { title: 'Caso resolvido: recusa de alimento sem conclusão clínica', paragraphs: [
        'Um animal que havia consumido a porção anterior deixa a nova oferta intocada e permanece em posição diferente da habitual. O auxiliar confere a identificação e relata ao médico-veterinário a hora, o que foi oferecido e o que observou. Não troca a dieta por um alimento trazido de casa nem oferece um medicamento por imaginar uma causa. A observação organizada permite que o profissional avalie a mudança com mais informação.',
        'O registro posterior mantém separados o fato e a orientação recebida. Se houve nova conduta, identifica quem a definiu e o que foi efetivamente realizado dentro das atribuições e capacitação do auxiliar. O caso mostra que reconhecer limite não é deixar de agir: comunicar a alteração com rapidez e precisão é uma ação de apoio essencial. Um relato fiel também ajuda a equipe que assume o turno seguinte.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Escreva três observações fictícias sobre um animal, distinguindo fato, relato do responsável e orientação profissional. Reescreva a frase parece uma doença como descrição do que foi percebido, sem inventar diagnóstico. Prepare uma comunicação curta com identificação, local, horário e mudança observada. Não realize técnicas em animais para este exercício. Confira se há encaminhamento ao médico-veterinário e se o registro evita concluir uma causa clínica ou alterar dieta e medicação por iniciativa própria.',
      ] },
    ],
  },
  {
    title: 'Bem-estar, ambiente e manejo planejado',
    skills: ['reconhecer-condicoes-bem-estar-animal'], sourceIds: ['cfmv-bem-estar', 'cfmv-auxiliar'],
    sections: [
      { title: 'Ensino: espécie, indivíduo e ambiente precisam ser considerados juntos', paragraphs: [
        'O bem-estar envolve condições físicas e comportamentais e a possibilidade de atender necessidades do animal. Ambiente, ruído, odores, temperatura, espaço e contato com outros animais podem afetar a experiência de permanência. Não existe uma organização única adequada a todas as espécies e condições de saúde. A orientação do médico-veterinário considera o indivíduo, e a equipe acompanha se o ambiente oferece proteção e condições de cuidado compatíveis.',
        'A aproximação e o transporte interno precisam ser planejados, com recursos e pessoas capacitadas. Não se deve improvisar contenção com força crescente ou aplicar a uma espécie um método visto em outra. Uma reação de medo ou resistência pode aumentar o risco para o animal e para a equipe. O auxiliar reconhece o limite, interrompe a tentativa insegura e solicita orientação. Contenção física, quando pertinente, exige método ética e tecnicamente adequado e formação prática supervisionada; este texto não ensina uma manobra.',
        'A organização do alojamento inclui identificação, integridade do espaço, acesso controlado e condições definidas para alimentação, água, repouso e atividade. Não coloque juntos animais apenas porque parecem tranquilos. Separações podem ser necessárias por comportamento, espécie ou condição sanitária, conforme o plano responsável. Verificar portas, travas e percurso antes de transportar reduz fuga e encontro inesperado. A rotina precisa minimizar estímulos desnecessários e manter possibilidade de observação.',
      ] },
      { title: 'Caso resolvido: ruído durante uma transferência', paragraphs: [
        'Uma transferência interna foi planejada, mas o corredor passa a ter ruído intenso e circulação de outros animais. O auxiliar não prossegue automaticamente por já estar no horário. Comunica a mudança e reorganiza o percurso com a equipe responsável, mantendo o animal em condição segura. O planejamento não é apenas escolher o destino: inclui o ambiente durante a movimentação e os recursos para realizá-la sem improviso.',
        'Ao chegar ao local adequado, confere identificação e condições do espaço antes de concluir a transferência. Se uma trava apresenta defeito, isso é uma pendência de segurança a resolver, não um detalhe a compensar com atenção redobrada por tempo indefinido. O caso relaciona bem-estar e prevenção de incidentes: reduzir estresse e evitar fuga são decisões de organização que precisam acompanhar as orientações profissionais.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe um percurso interno fictício para um animal com destino identificado, destacando portas, circulação, ruído e recurso de transporte. Acrescente uma condição que exige interromper e pedir orientação. Monte uma lista de conferência do alojamento sem definir necessidades clínicas ou juntar espécies por conveniência. Explique por que força crescente não substitui método adequado de manejo. O exercício é feito em papel, sem capturar, conter ou transportar um animal real para demonstrar aprendizagem.',
      ] },
    ],
  },
  {
    title: 'Higiene, barreiras e resíduos no serviço veterinário',
    skills: ['organizar-biosseguranca-veterinaria'], sourceIds: ['anvisa-residuos', 'cfmv-bem-estar', 'cfmv-auxiliar'],
    sections: [
      { title: 'Ensino: separar etapas evita levar contaminação para outra área', paragraphs: [
        'A organização higiênica protege animais, trabalhadores e pessoas que circulam no serviço. Mãos, roupas, utensílios e superfícies podem transportar agentes entre locais. A equipe segue as medidas definidas para cada área e condição sanitária, incluindo higiene das mãos e equipamentos de proteção apropriados. Usar luvas não torna seguro tocar indiscriminadamente portas, telefone e material limpo. A troca de tarefa exige atenção ao que foi contaminado e ao fluxo previsto.',
        'Limpeza remove sujidades; desinfecção e esterilização são processos com finalidades e requisitos distintos. Um material não deve ser chamado de estéril apenas porque foi lavado ou recebeu um produto. Produtos, concentração, tempo de contato, compatibilidade e demais etapas seguem procedimento validado e orientação responsável. O animal precisa ser protegido de contato e exposição inadequados durante a higienização. Não misture saneantes nem improvise uma concentração para compensar falta de tempo.',
        'Resíduos de serviços de saúde animal também estão sujeitos à RDC 222/2018. A segregação ocorre no local e momento de geração, conforme classificação e riscos presentes, seguindo o plano do serviço. Perfurocortantes precisam de recipiente próprio e não devem ser colocados em saco comum. Não esvazie manualmente o coletor nem tente recuperar objetos com a mão. Dúvida sobre um resíduo exige orientação antes de encaminhá-lo, pois o erro expõe quem recolhe e transporta depois.',
      ] },
      { title: 'Caso resolvido: material limpo no percurso de resíduos', paragraphs: [
        'Uma bandeja preparada para uso passa a compartilhar o apoio com material usado e resíduos. A equipe não considera que estar sobre uma bandeja resolve a separação. O auxiliar comunica a falha e segue o procedimento para avaliar e reorganizar o material, sem assumir que a condição anterior foi mantida. A rotina precisa distinguir o trajeto do limpo e do usado para que a separação seja efetiva.',
        'Na mesma área, o coletor de perfurocortantes se aproxima do limite previsto. A solução não é pressionar o conteúdo ou retirar itens para ganhar espaço. O fluxo de substituição e acondicionamento é acionado conforme as instruções aplicáveis. O caso evidencia que organização do ambiente e disponibilidade de recipientes fazem parte da biossegurança; uma coleta posterior não corrige a exposição criada na origem.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Faça um mapa fictício dos trajetos de material limpo, material usado e resíduos. Marque um ponto de cruzamento e proponha uma alteração organizacional. Liste os elementos que um procedimento de higienização precisa informar, sem formular uma mistura química. Escreva como encaminhar uma dúvida de classificação e uma pendência de coletor. Use apenas desenhos; não abra recipientes ou manipule resíduos para a atividade. Confira se seu plano evita chamar lavado de estéril e mantém segregação na origem.',
      ] },
    ],
  },
  {
    title: 'Identificação do animal, do responsável e das amostras',
    skills: ['preservar-identificacao-veterinaria'], sourceIds: ['cfmv-auxiliar', 'anvisa-residuos'],
    sections: [
      { title: 'Ensino: nome e aparência isolados não asseguram correspondência', paragraphs: [
        'O cadastro relaciona o animal ao responsável, ao atendimento e às informações necessárias ao cuidado. Dois animais podem ter o mesmo nome e características semelhantes. Por isso, a identificação segue os elementos definidos pelo serviço e precisa ser conferida antes de associar registro, orientação ou material. Uma ficha encontrada na mesma sala não é prova de que pertence ao paciente presente. A referência deve acompanhar o percurso e permanecer legível.',
        'Informações preliminares obtidas do responsável são registradas sem substituir consulta ou anamnese do médico-veterinário. Diferencie o que a pessoa relata do que a equipe observou e encaminhe a demanda ao profissional. Não interprete um resultado nem recomende um tratamento para responder mais rápido. Os dados pessoais do responsável também exigem acesso e compartilhamento compatíveis com a finalidade do atendimento; uma foto enviada a canal pessoal não é substituto de registro autorizado.',
        'No envio de material para exame, confira a correspondência entre identificação da amostra, solicitação e paciente, bem como as condições previstas de acondicionamento e transporte. O apoio não inventa recipiente, temperatura ou prazo: esses requisitos dependem do material e do laboratório. Uma amostra sem identidade segura ou com divergência deve ser tratada pelo fluxo de avaliação, não rotulada com base em palpite. Este curso não ensina coleta invasiva nem interpretação de exames.',
      ] },
      { title: 'Caso resolvido: dois pacientes com o mesmo nome', paragraphs: [
        'Há dois animais chamados Nina no serviço. Uma solicitação menciona o nome, mas o cadastro aberto corresponde a outro responsável. O auxiliar interrompe a associação e confere os identificadores definidos antes de encaminhar o material. Não escolhe pelo porte parecido ou pelo horário mais próximo. A correspondência precisa ser resolvida com a equipe, preservando o histórico e o registro da divergência quando exigido.',
        'Se uma etiqueta se torna ilegível, a solução também não é reconstruir a identidade pela memória. O responsável pelo fluxo avalia o material e a possibilidade de uso conforme os critérios aplicáveis. O exemplo mostra que identificação não é burocracia posterior: sem ela, o resultado pode ser relacionado ao paciente errado. O cuidado começa na relação correta entre animal, registro, solicitação e material.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Crie duas fichas fictícias de animais com o mesmo nome e responsáveis diferentes. Mostre os elementos que evitam escolher o cadastro errado, sem usar documentos reais. Desenhe uma conferência entre paciente, solicitação e amostra identificada. Inclua uma etiqueta ilegível e descreva o encaminhamento ao fluxo responsável. Não execute coleta ou transporte real. Revise se o exercício mantém o relato separado da observação e se nenhuma etapa autoriza adivinhar identidade ou interpretar resultado.',
      ] },
    ],
  },
  {
    title: 'Cuidados prescritos, estoque e continuidade entre turnos',
    skills: ['acompanhar-cuidados-veterinarios'], sourceIds: ['cfmv-auxiliar', 'cfmv-bem-estar'],
    sections: [
      { title: 'Ensino: orientação, execução e resultado são registros diferentes', paragraphs: [
        'O plano de cuidado é definido pelo médico-veterinário e considera o animal e sua condição. O apoio precisa identificar qual orientação está vigente, a quem se aplica e o que pode executar com capacitação e supervisão. Uma dieta especial ou um jejum não são criados por suposição a partir do horário de um procedimento. Em caso de orientação incompleta ou contraditória, esclareça antes de executar. A autorização para uma tarefa não permite mudar seu conteúdo.',
        'Registrar uma orientação recebida é diferente de registrar execução. O horário previsto não comprova que a tarefa ocorreu. A anotação identifica o que foi feito, quando, por quem e qualquer intercorrência que precisa de avaliação. Se o animal não consumiu a oferta autorizada, essa informação não pode desaparecer sob um simples concluído. O curso não apresenta doses, aplicação de medicamentos ou técnicas de curativo; trabalha a conferência e a rastreabilidade do apoio.',
        'Materiais e produtos precisam de controle de identificação, condição de conservação, integridade e validade. Uma unidade com condição duvidosa não deve ser misturada ao estoque disponível para uso. Na passagem de turno, destaque orientações vigentes, ações realizadas e pendências, confirmando o recebimento pela equipe que continua o cuidado. O envio de uma mensagem não comprova compreensão. A alta e as recomendações clínicas ao responsável pelo animal permanecem decisões do médico-veterinário.',
      ] },
      { title: 'Caso resolvido: duas orientações alimentares no painel', paragraphs: [
        'O painel mostra uma orientação antiga e uma nova, sem indicação clara de qual está vigente. O auxiliar não escolhe a mais conveniente nem oferece as duas dietas para garantir. Solicita esclarecimento ao médico-veterinário e mantém o cuidado conforme o fluxo de segurança. Depois de definida a orientação correta, o registro precisa distinguir a atualização e o que foi efetivamente executado, preservando o histórico previsto.',
        'No encerramento do turno, a equipe confirma que o próximo responsável recebeu a atualização e sabe qual pendência ainda exige observação. O caso evidencia que continuidade não se resume a repetir a lista anterior. A qualidade depende de informação atual e correspondente ao animal, da execução permitida e de comunicação verificável. Um painel bonito, mas ambíguo, pode esconder um risco importante de cuidado errado.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Monte um quadro fictício com orientação vigente, ação realizada, horário e pendência para três animais inventados. Inclua uma orientação contraditória que exige esclarecimento e um material segregado por condição duvidosa. Escreva uma passagem de turno objetiva, confirmando quem recebeu a informação. Não inclua dose ou tratamento. Confira se previsto e realizado aparecem separados, se uma recusa de alimentação permanece visível e se a definição clínica continua vinculada ao médico-veterinário responsável.',
      ] },
    ],
  },
];
const activities = [
  { module: 1, skill: 'distinguir-observacao-decisao-veterinaria', prompt: 'Um animal deixa de consumir a porção autorizada e muda seu comportamento. O apoio deve:', options: ['Diagnosticar a causa pelo comportamento.', 'Comunicar a mudança com identificação, contexto e horário ao médico-veterinário.', 'Trocar a dieta por iniciativa própria.', 'Registrar consumo normal para não atrasar.'] },
  { module: 2, skill: 'reconhecer-condicoes-bem-estar-animal', prompt: 'Um percurso de transferência passa a ter ruído e circulação inesperados. Qual conduta foi ensinada?', options: ['Prosseguir sempre porque o horário foi marcado.', 'Aumentar a força de contenção sem orientação.', 'Comunicar a mudança e reorganizar o percurso seguro com a equipe responsável.', 'Soltar o animal para reduzir resistência.'] },
  { module: 3, skill: 'organizar-biosseguranca-veterinaria', prompt: 'O coletor de perfurocortantes está no limite previsto de substituição. O auxiliar deve:', options: ['Acionar o fluxo de substituição, sem esvaziar ou comprimir manualmente.', 'Retirar itens com a mão para abrir espaço.', 'Transferir o conteúdo para saco comum.', 'Pressionar os objetos para caber mais.'] },
  { module: 4, skill: 'preservar-identificacao-veterinaria', prompt: 'Dois animais têm o mesmo nome e há divergência de responsável na solicitação. O material deve:', options: ['Ser associado pelo porte parecido.', 'Receber etiqueta pela memória.', 'Ser enviado sem identificação.', 'Ter a correspondência conferida pelo fluxo responsável antes do encaminhamento.'] },
  { module: 5, skill: 'acompanhar-cuidados-veterinarios', prompt: 'Duas orientações alimentares aparecem sem clareza sobre a vigente. Qual ação preserva o cuidado?', options: ['Oferecer as duas.', 'Esclarecer com o médico-veterinário antes de executar e atualizar o registro conforme o fluxo.', 'Escolher a mais antiga sempre.', 'Apagar uma ao acaso.'] },
];
const exam = [
  { module: 1, skill: 'distinguir-observacao-decisao-veterinaria', prompt: 'Qual anotação distingue observação de diagnóstico?', options: ['Está com uma doença porque não comeu.', 'É um animal difícil por natureza.', 'Não consumiu a porção oferecida às 15h; alteração comunicada ao responsável veterinário.', 'Precisa de um medicamento escolhido pelo auxiliar.'] },
  { module: 1, skill: 'distinguir-observacao-decisao-veterinaria', prompt: 'A atuação de apoio depende de:', options: ['Orientação e supervisão diretas e contínuas do médico-veterinário, dentro das atribuições e capacitação.', 'Independência clínica após ler o material.', 'Prescrição própria por experiência.', 'Ausência do profissional como autorização.'] },
  { module: 2, skill: 'reconhecer-condicoes-bem-estar-animal', prompt: 'A organização do alojamento deve considerar:', options: ['Apenas facilidade de limpeza.', 'Espécie, comportamento, condição individual e orientação responsável.', 'Que animais tranquilos podem sempre ficar juntos.', 'Uma regra igual para todas as espécies.'] },
  { module: 2, skill: 'reconhecer-condicoes-bem-estar-animal', prompt: 'Diante de uma tentativa insegura de manejo, o auxiliar deve:', options: ['Aumentar a força indefinidamente.', 'Copiar uma manobra de outra espécie.', 'Ignorar a reação do animal.', 'Interromper e solicitar orientação, com recursos e capacitação adequados.'] },
  { module: 3, skill: 'organizar-biosseguranca-veterinaria', prompt: 'A segregação dos resíduos ocorre:', options: ['Somente no destino final.', 'Após misturar tudo em um saco.', 'No local e momento da geração, conforme classificação e riscos.', 'Apenas quando há sujeira visível.'] },
  { module: 3, skill: 'organizar-biosseguranca-veterinaria', prompt: 'Um instrumento lavado pode ser declarado estéril apenas pela lavagem?', options: ['Não; limpeza, desinfecção e esterilização têm requisitos e finalidades distintos.', 'Sim, se parecer brilhante.', 'Sim, após enxugar em tecido.', 'Sim, se o animal anterior parecia saudável.'] },
  { module: 4, skill: 'preservar-identificacao-veterinaria', prompt: 'Uma amostra com identificação ilegível exige:', options: ['Recriar o nome por palpite.', 'Usar o cadastro que estiver aberto.', 'Enviar para qualquer paciente semelhante.', 'Avaliação pelo fluxo responsável, sem adivinhar a identidade.'] },
  { module: 4, skill: 'preservar-identificacao-veterinaria', prompt: 'No encaminhamento de amostra, a conferência relaciona:', options: ['Somente a cor da embalagem.', 'Animal, solicitação, identificação e condições previstas para o material.', 'Apenas o horário de chegada.', 'Qualquer recipiente disponível e prazo inventado.'] },
  { module: 5, skill: 'acompanhar-cuidados-veterinarios', prompt: 'Qual distinção melhora a rastreabilidade do cuidado?', options: ['Horário previsto comprova execução.', 'Registrar orientação significa que foi realizada.', 'Orientação vigente, execução e resposta observada são informações diferentes.', 'Uma pendência termina ao enviar uma mensagem.'] },
  { module: 5, skill: 'acompanhar-cuidados-veterinarios', prompt: 'Na passagem de turno, a continuidade exige:', options: ['Informação atual, pendências claras e confirmação de recebimento pela equipe.', 'Repetir automaticamente uma orientação antiga.', 'Ocultar o material segregado.', 'Tratar toda tarefa como concluída para facilitar o painel.'] },
];
export const courseRevision = defineCourse({
  courseId: '2f43f69e-b1ed-4102-92c1-b6efcab5c1ee', slug: 'auxiliar-de-veterinario', courseName: 'Auxiliar de Veterinário', hours: 120,
  audience: 'Estudantes de fundamentos do apoio veterinário supervisionado; o material não apresenta técnicas invasivas nem confere autonomia clínica.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'cfmv-auxiliar', title: 'CFMV — Resolução 1260/2019, com alterações de 2025', url: 'https://manual.cfmv.gov.br/arquivos/resolucao/1260.pdf' },
    { id: 'cfmv-bem-estar', title: 'CFMV — Diretrizes de responsabilidade técnica em comércio e serviços para animais', url: 'https://www.cfmv.gov.br/wp-content/uploads/2025/06/Diretrizes-RT-para-Produtos-e-Servicos-_compressed-1.pdf' },
    { id: 'anvisa-residuos', title: 'Anvisa — RDC 222/2018, gerenciamento de resíduos de serviços de saúde', url: 'https://anvisalegis.datalegis.net/action/ActionDatalegis.php?acao=abrirTextoAto&cod_menu=1696&cod_modulo=134&numeroAto=00000222&orgao=RDC%2FDC%2FANVISA%2FMS&seqAto=000&tipo=RDC&valorAno=2018' },
  ],
}, modules, activities, exam);
export default courseRevision;
