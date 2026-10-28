import { defineCourse } from './format.mjs';

const modules = [
  {
    title: 'Creche como educação e cuidado integrados',
    skills: ['integrar-cuidado-educacao-creche'], sourceIds: ['mec-bncc', 'camara-ldb'],
    sections: [
      { title: 'Ensino: a criança participa também nos momentos de cuidado', paragraphs: [
        'A creche integra a Educação Infantil, primeira etapa da educação básica. A LDB distingue creche para crianças de até três anos e pré-escola para crianças de quatro a cinco anos. Essa organização não transforma a creche em simples guarda enquanto a família trabalha. O desenvolvimento integral envolve relações, comunicação, movimento, exploração e bem-estar durante todo o cotidiano. A criança é sujeito de direitos, com história, preferências e formas próprias de se expressar.',
        'Cuidar e educar se articulam: ao ajudar uma criança a lavar as mãos, o adulto conversa, nomeia ações e permite a participação possível, além de assegurar higiene. Não é preciso transformar cada cuidado em uma aula expositiva. É necessário realizá-lo com atenção e respeito, sem pressa que apague a iniciativa infantil. O auxiliar compõe a equipe e segue a proposta e as orientações do professor; o apoio não substitui a responsabilidade docente pelo planejamento pedagógico.',
        'A BNCC orienta interações e brincadeiras e reconhece direitos de conviver, brincar, participar, explorar, expressar e conhecer-se. Esses direitos aparecem em escolhas de materiais, tempos, ambientes e relações. Participar não significa deixar qualquer decisão de segurança para a criança; significa considerar seus sinais e oferecer possibilidades adequadas. Respeitar não é fazer tudo por ela nem exigir independência para a qual ainda precisa de apoio. Observe a necessidade concreta e ajude na medida apropriada.',
      ] },
      { title: 'Caso resolvido: lavar as mãos com participação', paragraphs: [
        'Antes de uma refeição, uma criança tenta alcançar o recurso disponível para lavar as mãos. O adulto poderia executar tudo rapidamente, mas organiza o acesso seguro, explica a sequência e oferece ajuda para a parte que ela ainda não consegue realizar. A higiene continua sendo assegurada, e a criança participa do cuidado. A aprendizagem acontece na relação e no uso do ambiente, sem exigir que ela memorize uma regra abstrata.',
        'Outra criança do mesmo grupo necessita de mais auxílio. A equipe não a compara publicamente nem retira seu direito de participar. Ajusta o apoio e compartilha com o professor o que foi observado. O objetivo não é obter uma execução idêntica de todas no mesmo minuto, mas combinar cuidado efetivo, atenção às diferenças e oportunidades de ação. O registro pode destacar o apoio utilizado e a resposta da criança.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Escolha uma rotina fictícia de cuidado e descreva o que o adulto assegura, o que a criança pode fazer e como a comunicação acontece. Relacione a experiência a dois direitos de aprendizagem, explicando a relação em vez de apenas listar palavras. Compare uma ajuda que amplia participação e outra que faz tudo pela criança sem necessidade. Confira se seu planejamento mantém supervisão, considera necessidades diferentes e reconhece a articulação com o professor e a equipe da creche.',
      ] },
    ],
  },
  {
    title: 'Acolhimento, adaptação e diálogo com a família',
    skills: ['acompanhar-adaptacao-creche'], sourceIds: ['mec-bncc', 'mec-adaptacao', 'ms-desenvolvimento'],
    sections: [
      { title: 'Ensino: construir referência e compreender a comunicação infantil', paragraphs: [
        'O ingresso na creche muda pessoas, espaços, sons e rotinas conhecidos pela criança. O acolhimento envolve também a família e precisa de planejamento da equipe. Conhecer hábitos, formas de consolo e preferências ajuda a construir continuidade e novas referências. Não se trata de prometer ausência de choro nem estabelecer que todas se adaptam em um número fixo de dias. A observação da criança e o diálogo orientam os ajustes possíveis no plano institucional.',
        'O choro é uma forma de comunicação e pode estar relacionado a necessidades diferentes. A equipe observa o contexto, acolhe e verifica o que precisa de atenção, sem concluir automaticamente que a criança está fazendo birra. Presença estável, fala calma, disponibilidade e aproximação respeitosa ajudam a construir confiança. Ignorar sofrimento para acostumar mais rápido ou usar ameaça como forma de controlar a separação prejudica a relação que se pretende formar.',
        'A conversa com a família deve ser objetiva e recíproca. Pergunte sobre a criança e compartilhe acontecimentos observados, sem culpabilizar quem precisa deixá-la na instituição. Combine os contatos e a participação conforme o plano de acolhimento e segurança da creche. Uma informação importante sobre alimentação, saúde ou pessoa autorizada para saída não deve se perder em um comentário informal. Encaminhe ao registro e ao profissional responsável pelo tema, com privacidade.',
      ] },
      { title: 'Caso resolvido: choro na transição para o ambiente novo', paragraphs: [
        'Uma criança chega ao terceiro dia de frequência e chora quando a pessoa de referência se despede. O auxiliar não conclui que três dias deveriam ser suficientes. Acolhe, observa a resposta ao ambiente e combina com o professor a continuidade prevista no plano. A família informa que uma canção e um objeto permitido costumam ajudá-la. Esses elementos podem ser considerados pela equipe, com atenção à adequação e segurança do objeto.',
        'Depois, a comunicação relata o que ocorreu: em que momento houve choro, qual apoio foi oferecido e como a criança respondeu. Não afirma que ela ficou bem o tempo todo apenas para tranquilizar, nem a descreve como problemática. Esse registro concreto permite revisar a estratégia. A adaptação é acompanhada como processo, sem transformar uma dificuldade inicial em diagnóstico ou em culpa da família.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Elabore um roteiro breve de conversa inicial com uma família fictícia, incluindo preferências, formas de comunicação e informação que precisa de encaminhamento formal. Escreva um relato objetivo de adaptação que diferencie observação de julgamento. Proponha duas ações combinadas com o professor para acolher uma criança que ainda evita o espaço de brincadeira. Confira se não há prazo rígido para adaptação, promessa de ausência de choro ou exposição de detalhes a outras famílias.',
      ] },
    ],
  },
  {
    title: 'Rotina de alimentação, higiene e repouso com atenção individual',
    skills: ['organizar-cuidados-cotidianos-creche'], sourceIds: ['mec-bncc', 'ms-alimentacao', 'mec-rotina'],
    sections: [
      { title: 'Ensino: regularidade dá referência sem apagar necessidades', paragraphs: [
        'A rotina oferece referências de tempo e segurança, mas não deve ser rígida a ponto de ignorar fome, cansaço, desconforto e necessidades de cuidado. Os momentos de alimentação, higiene, repouso e brincadeira precisam ser planejados pela equipe. Uma transição bem organizada diminui espera prolongada e aglomeração. O auxiliar confere recursos antes de iniciar e mantém supervisão efetiva, evitando dividir a atenção com celular ou outra atividade incompatível com o cuidado.',
        'Na alimentação, siga o cardápio, as orientações individuais e os procedimentos da instituição, articulados aos responsáveis competentes. Confirme correspondência da criança com a preparação e eventuais restrições registradas; não faça substituições por conta própria. O momento deve favorecer experiência positiva, conversa e atenção aos sinais de fome e saciedade. Forçar, humilhar ou oferecer alimento como prêmio não é uma forma adequada de construir participação. A forma de oferta precisa corresponder à orientação e à necessidade da criança.',
        'Cuidados corporais preservam privacidade e dignidade. Explique o que vai fazer em linguagem compreensível, organize o material e mantenha as medidas higiênicas do serviço. Compartilhar itens de uso pessoal sem o fluxo adequado compromete o cuidado. Para repouso, siga as condições de segurança e a supervisão previstas, observando sinais e necessidades individuais. Medicação, dietas e procedimentos de saúde não se improvisam a partir de uma sugestão de colega ou de um texto pedagógico.',
      ] },
      { title: 'Caso resolvido: restrição registrada e troca de preparação', paragraphs: [
        'No momento da refeição, uma preparação diferente da prevista chega para uma criança com orientação alimentar individual registrada. Mesmo que o prato pareça semelhante, o auxiliar não oferece antes de conferir com o responsável pelo fluxo. Mantém a identificação e a supervisão da criança enquanto a divergência é resolvida. A pressão para que todos comam ao mesmo tempo não substitui a correspondência correta entre a orientação e a preparação.',
        'Depois do atendimento, a equipe analisa onde a troca ocorreu e como evitar repetição. A comunicação com a família segue o procedimento e se baseia nos fatos. O caso demonstra a utilidade de organizar a transição com antecedência: identificação e conferência não podem depender apenas de memória. Respeitar o ritmo infantil e assegurar o cuidado específico fazem parte da mesma responsabilidade, sem expor a criança diante do grupo.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Desenhe uma rotina fictícia com alimentação, higiene, repouso e brincadeira, incluindo transições e momentos que podem ser ajustados após observação. Crie uma conferência para uma orientação alimentar individual sem revelar diagnóstico a quem não precisa conhecê-lo. Liste recursos a preparar antes de um cuidado corporal e explique como preservar supervisão e privacidade. Não prescreva dieta ou medicação. Confira se sua rotina combina previsibilidade, atenção individual e encaminhamento de uma divergência ao responsável.',
      ] },
    ],
  },
  {
    title: 'Brincadeiras, literatura e ambientes de exploração',
    skills: ['apoiar-brincadeiras-creche'], sourceIds: ['mec-bncc', 'ms-desenvolvimento'],
    sections: [
      { title: 'Ensino: oferecer possibilidades e acompanhar iniciativas', paragraphs: [
        'Brincar permite explorar materiais, relações, movimento e linguagem. O adulto organiza condições e observa as iniciativas, em vez de dirigir cada gesto ou tratar a brincadeira como intervalo sem importância. Materiais devem ser adequados ao grupo e à segurança, com atenção ao tamanho, integridade e forma de uso. Um objeto cotidiano não se torna adequado apenas por ser barato ou parecer criativo. O professor define a proposta e a equipe combina como apoiar a exploração.',
        'Uma experiência pode permitir formas diferentes de participar: observar, tocar, deslocar, produzir sons ou comunicar uma escolha. Inclua apoios e organização do espaço que reduzam barreiras, sem isolar uma criança em uma tarefa desconectada. Acessibilidade não depende de exigir que todos executem o mesmo movimento. O auxiliar acompanha a aproximação, oferece o apoio combinado e compartilha com o professor o que ampliou ou dificultou a participação.',
        'Livros, narrativas, cantigas e conversas ampliam experiências de linguagem. Durante a leitura, mostrar imagens, acolher gestos e comentários e permitir reencontros com a história são possibilidades de interação. Não é necessário cobrar uma resposta verbal única para comprovar que houve experiência. O adulto pode nomear o que a criança aponta e esperar sua reação. Observar interesse e iniciativa ajuda a organizar os próximos encontros, sem transformar a literatura em uma prova classificatória.',
      ] },
      { title: 'Caso resolvido: explorar um livro de modos diferentes', paragraphs: [
        'Em uma proposta de leitura, uma criança aponta uma figura, outra acompanha uma parte da narrativa e outra se aproxima depois. O auxiliar mantém a organização combinada com o professor e acolhe essas formas de participação. Nomeia o elemento apontado, oferece tempo de resposta e evita exigir que todas repitam uma palavra. O interesse pela história pode aparecer no olhar, no gesto e na busca do livro, além da fala.',
        'A equipe percebe que o livro fica em uma altura que impede parte do grupo de alcançá-lo em outro momento. Reorganiza o acesso com segurança e acompanha o efeito. A mudança do ambiente amplia oportunidades sem esperar que a criança supere sozinha a barreira. O caso relaciona material, interação e observação: a proposta não termina na leitura executada pelo adulto, mas considera o encontro efetivo das crianças com o objeto e com os outros.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Planeje com dados fictícios uma experiência de exploração e um encontro com um livro. Descreva o objetivo, a adequação e segurança dos materiais, duas formas de participação e o apoio do auxiliar. Introduza uma barreira de alcance ou comunicação e proponha uma alteração do ambiente. Escreva o que observaria sem exigir desempenho idêntico. Confira se a atividade permite iniciativa infantil e se o apoio está articulado ao professor, em vez de substituir a brincadeira por comandos contínuos.',
      ] },
    ],
  },
  {
    title: 'Observação, proteção e passagem responsável de informações',
    skills: ['registrar-acompanhar-crianca-creche'], sourceIds: ['camara-ldb', 'mec-bncc', 'ms-desenvolvimento'],
    sections: [
      { title: 'Ensino: um registro descreve acontecimentos e apoios', paragraphs: [
        'A avaliação na Educação Infantil acompanha e registra desenvolvimento, sem objetivo de promoção ou classificação para o Ensino Fundamental. O auxiliar contribui com observações para a equipe docente: o que ocorreu, em qual contexto, que apoio foi oferecido e como a criança respondeu. Expressões como preguiçosa, agressiva por natureza ou sem capacidade não descrevem um acontecimento e podem fixar julgamentos indevidos. Um episódio isolado também não autoriza diagnóstico de saúde ou desenvolvimento.',
        'A comunicação sobre cuidado e proteção precisa chegar à pessoa responsável pelo fluxo. Diante de acidente, mudança importante de condição ou preocupação com segurança, priorize a resposta institucional e a proteção imediata, conforme a situação. Este curso não ensina manobras de primeiros socorros nem substitui formação prática específica. Não esconda a ocorrência para evitar conflito e não compartilhe imagens ou relatos em grupos pessoais. A documentação deve ser objetiva e restrita à finalidade necessária.',
        'Na passagem de turno e na saída, confirme informações pendentes e os procedimentos de identificação de pessoas autorizadas. Conhecer alguém de vista não substitui a autorização prevista para retirar uma criança. A entrega não termina ao avisar de longe que há uma pendência; é necessário garantir que o responsável pela continuidade a recebeu. O diálogo com a família considera o que é pertinente ao cuidado, preservando informações de outras crianças e a confidencialidade do grupo.',
      ] },
      { title: 'Caso resolvido: observação sem rótulo', paragraphs: [
        'Durante uma disputa por um brinquedo, uma criança empurra outra. O registro útil descreve contexto, ação, intervenção e resposta: o adulto interrompeu a ação para proteger, acolheu as crianças e apoiou outra forma de interação conforme orientação docente. Escrever apenas criança agressiva elimina as informações que ajudariam a equipe a compreender a situação. Também pode transformar uma ação observada em identidade fixa.',
        'O professor recebe o relato e considera outras observações para planejar o apoio. A família recebe a comunicação necessária pelo fluxo, sem exposição da outra criança. Se houver uma preocupação que exige avaliação ou proteção adicional, ela é encaminhada ao responsável. O registro não existe para culpar, mas para orientar cuidado e acompanhamento; deve ser fiel ao que foi observado e ao que ainda não se sabe.',
      ] },
      { title: 'Prática orientada', paragraphs: [
        'Reescreva dois rótulos fictícios como observações de contexto, ação e apoio. Monte uma passagem de turno com uma informação concluída e uma pendência que exige confirmação de recebimento. Acrescente uma situação de pessoa conhecida que chega para retirar a criança sem autorização confirmada, indicando o encaminhamento seguro. Use nomes inventados e não simule um diagnóstico. Revise se o registro é objetivo, preserva o grupo e ajuda a equipe a decidir o próximo passo de acompanhamento.',
      ] },
    ],
  },
];
const activities = [
  { module: 1, skill: 'integrar-cuidado-educacao-creche', prompt: 'Uma criança pode participar de parte de um cuidado com apoio. Qual organização articula cuidado e educação?', options: ['Impedir qualquer iniciativa para terminar mais rápido.', 'Permitir tudo sem supervisão.', 'Garantir o cuidado e oferecer participação possível, com comunicação e apoio adequados.', 'Exigir a mesma independência de todo o grupo.'] },
  { module: 2, skill: 'acompanhar-adaptacao-creche', prompt: 'Uma criança ainda chora na chegada após alguns dias. A equipe deve:', options: ['Acolher, observar necessidades e ajustar o acompanhamento com professor e família.', 'Considerar encerrado o acolhimento por prazo fixo.', 'Culpar a família.', 'Ignorar até parar.'] },
  { module: 3, skill: 'organizar-cuidados-cotidianos-creche', prompt: 'Uma preparação não corresponde à orientação individual registrada. Antes de oferecê-la, o auxiliar deve:', options: ['Presumir que preparações parecidas são equivalentes.', 'Trocar o nome na identificação.', 'Decidir a substituição sem consultar.', 'Conferir a divergência pelo fluxo responsável, mantendo cuidado e supervisão.'] },
  { module: 4, skill: 'apoiar-brincadeiras-creche', prompt: 'Durante a leitura, uma criança participa apontando imagens. Qual apoio respeita essa expressão?', options: ['Cobrar uma resposta verbal igual à das outras.', 'Acolher o gesto, nomear o que foi apontado e permitir tempo de resposta.', 'Excluir do encontro por não repetir palavras.', 'Interromper qualquer comentário infantil.'] },
  { module: 5, skill: 'registrar-acompanhar-crianca-creche', prompt: 'Qual registro contribui melhor para o acompanhamento docente?', options: ['Um diagnóstico feito pelo auxiliar.', 'Um rótulo fixo de personalidade.', 'Contexto, ação observada, apoio oferecido e resposta da criança.', 'Uma comparação pública entre crianças.'] },
];
const exam = [
  { module: 1, skill: 'integrar-cuidado-educacao-creche', prompt: 'Segundo a distinção da LDB estudada, creche atende:', options: ['Crianças de até três anos, integrando a Educação Infantil.', 'Somente crianças de quatro a seis anos.', 'Apenas estudantes do Ensino Fundamental.', 'Uma etapa separada da educação básica.'] },
  { module: 1, skill: 'integrar-cuidado-educacao-creche', prompt: 'O apoio do auxiliar deve:', options: ['Eliminar a responsabilidade docente.', 'Transformar cuidados em tarefas sem relação com aprendizagem.', 'Exigir independência igual de todas as crianças.', 'Articular orientações docentes, cuidado e oportunidades de participação.'] },
  { module: 2, skill: 'acompanhar-adaptacao-creche', prompt: 'Qual informação ajuda no acolhimento inicial?', options: ['Um prazo obrigatório igual para adaptação de todas.', 'Preferências e formas de comunicação da criança, em diálogo com a família.', 'A decisão de ignorar todo choro.', 'A promessa de que não haverá dificuldade.'] },
  { module: 2, skill: 'acompanhar-adaptacao-creche', prompt: 'O choro deve ser considerado:', options: ['Sempre uma tentativa de manipulação.', 'Prova imediata de um diagnóstico.', 'Forma de comunicação a observar no contexto e acolher.', 'Motivo para culpabilizar a família.'] },
  { module: 3, skill: 'organizar-cuidados-cotidianos-creche', prompt: 'Uma rotina adequada oferece:', options: ['Referências previsíveis com atenção às necessidades individuais.', 'Horários inflexíveis apesar de desconforto.', 'Ausência de planejamento.', 'Espera prolongada como atividade principal.'] },
  { module: 3, skill: 'organizar-cuidados-cotidianos-creche', prompt: 'Na alimentação, a participação da criança deve ser apoiada por:', options: ['Humilhação quando recusa.', 'Alimento como prêmio por obediência.', 'Substituições improvisadas de cardápio.', 'Orientações do serviço, atenção aos sinais e experiência respeitosa.'] },
  { module: 4, skill: 'apoiar-brincadeiras-creche', prompt: 'Uma barreira de acesso aos materiais requer:', options: ['Esperar que toda criança a supere sozinha.', 'Rever ambiente e apoios para ampliar participação com segurança.', 'Isolar quem não alcança.', 'Eliminar a exploração do grupo.'] },
  { module: 4, skill: 'apoiar-brincadeiras-creche', prompt: 'A observação de uma brincadeira considera:', options: ['Apenas repetição de uma resposta única.', 'Somente silêncio e imobilidade.', 'Iniciativas, interações e diferentes formas de participação.', 'Se todas fizeram gestos idênticos.'] },
  { module: 5, skill: 'registrar-acompanhar-crianca-creche', prompt: 'Na Educação Infantil, a avaliação busca:', options: ['Acompanhamento e registro do desenvolvimento, sem objetivo de promoção.', 'Classificar crianças para acesso ao Fundamental.', 'Produzir rótulos permanentes.', 'Substituir observação por uma prova final.'] },
  { module: 5, skill: 'registrar-acompanhar-crianca-creche', prompt: 'Uma pessoa conhecida chega para retirar a criança, mas a autorização não está confirmada. O procedimento deve:', options: ['Dispensar conferência pela familiaridade.', 'Ser decidido pela pressa da saída.', 'Expor dados de outras famílias para tentar confirmar.', 'Seguir a confirmação de autorização e o fluxo responsável antes da entrega.'] },
];
export const courseRevision = defineCourse({
  courseId: '3d6dfb51-3b4d-4b48-aa6d-cab47a77df25', slug: 'auxiliar-de-creche', courseName: 'Auxiliar de Creche', hours: 80,
  audience: 'Estudantes de apoio à equipe de creche, com cuidado educativo articulado ao professor e aos procedimentos da instituição.',
  objectives: modules.map(module => module.title),
  sources: [
    { id: 'mec-bncc', title: 'MEC — BNCC, Educação Infantil', url: 'https://basenacionalcomum.mec.gov.br/images/BNCC_EI_EF_110518_versaofinal_site.pdf' },
    { id: 'camara-ldb', title: 'Câmara — LDB atualizada, artigos 29 a 31', url: 'https://www2.camara.leg.br/legin/fed/lei/1996/lei-9394-20-dezembro-1996-362578-normaatualizada-pl.html' },
    { id: 'mec-adaptacao', title: 'MEC — Relação entre família e creche no ingresso', url: 'https://www.gov.br/mec/pt-br/acesso-a-informacao/perguntas-frequentes/politica-nacional-de-educacao-infantil/como-facilitar-a-relacao-da' },
    { id: 'mec-rotina', title: 'MEC — Organização da rotina na Educação Infantil', url: 'https://www.gov.br/mec/pt-br/acesso-a-informacao/perguntas-frequentes/politica-nacional-de-educacao-infantil/e-necessario-estabelecer-uma-rotina' },
    { id: 'ms-alimentacao', title: 'Ministério da Saúde — Alimentação saudável na primeira infância', url: 'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/s/saude-da-crianca/primeira-infancia/alimentacao-saudavel' },
    { id: 'ms-desenvolvimento', title: 'Ministério da Saúde — Desenvolvimento infantil', url: 'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/s/saude-da-crianca/primeira-infancia/desenvolvimento-infantil' },
  ],
}, modules, activities, exam);
export default courseRevision;
