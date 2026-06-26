const STUDENT_MOTIVATIONAL_STARTS = [
  'Seu futuro começa com uma decisão',
  'Cada aula aproxima você de um novo passo',
  'Aprender hoje abre portas amanhã',
  'Disciplina simples vira conquista grande',
  'Você não precisa correr para evoluir',
  'Um curso muda mais do que o currículo',
  'O conhecimento fica quando a pressa passa',
  'Começar já é metade da coragem',
  'A constância vence a dúvida',
  'Cada módulo concluído te move para frente',
  'O esforço de hoje cria novas escolhas',
  'Estudar também é acreditar em si',
  'Um passo por vez é avanço',
  'Quem aprende amplia caminhos',
  'A prática transforma vontade em resultado',
  'Seu ritmo pode ser poderoso',
  'A oportunidade cresce com preparo',
  'Você está construindo uma nova versão',
  'Pequenas metas sustentam grandes sonhos',
  'Aprender é investir em liberdade',
  'Cada login pode virar recomeço',
  'O certificado começa na primeira atitude',
  'O mercado valoriza quem continua aprendendo',
  'A coragem aparece quando você começa',
  'Seu tempo de aprender também importa',
  'Cada nova aula fortalece sua confiança',
] as const;

const STUDENT_MOTIVATIONAL_ENDINGS = [
  'e hoje pode ser esse começo.',
  'com calma, foco e presença.',
  'sem pular etapas importantes.',
  'e a direção certa aparece.',
  'com disciplina e gentileza.',
  'porque a prática transforma intenção.',
  'quando o esforço encontra constância.',
  'e o próximo passo fica mais claro.',
  'porque crescer é um hábito diário.',
  'e o conhecimento vira segurança.',
  'quando você escolhe continuar.',
  'com atenção aos pequenos avanços.',
  'e renova sua confiança.',
  'porque persistência é super poder.',
  'quando cada etapa recebe foco.',
  'e você deixa o medo de lado.',
  'com organização e propósito.',
  'para transformar medo em aprendizado.',
  'porque ninguém aprende sem tentar.',
  'e a disciplina te conduz adiante.',
  'com coragem para seguir.',
] as const;

const INSTITUTIONAL_MOTIVATIONAL_STARTS = [
  'A liderança começa pelo exemplo',
  'Planejar com clareza evita retrabalho',
  'Gestão é cuidar do que importa',
  'Educação cresce quando a equipe se alinha',
  'Cada atendimento precisa de escuta',
  'A rotina bem desenhada mantém o time forte',
  'Transparência acelera decisões',
  'A escola funciona melhor com propósito',
  'Organizar dados clareia o caminho',
  'Comunicar-se bem evita ruído',
  'A rotina de excelência se constrói em detalhes',
  'Boas práticas transformam processos em confiança',
  'Uma equipe alinhada gera consistência',
  'A gestão eficiente aproxima pessoas certas',
  'A tecnologia apoia quem já tem direção',
  'Coordenação firme protege a qualidade',
  'Cada indicador conta uma história',
  'A melhoria contínua protege o tempo',
  'A presença da liderança inspira atitude',
  'Processos claros dão liberdade para ensinar',
  'A parceria faz a diferença nos resultados',
  'A formação começa quando a base é organizada',
  'A decisão certa protege o aluno',
  'Escuta ativa melhora a operação',
  'Cada ação de gestão impacta quem aprende',
  'A escola avança quando a equipe aprende',
] as const;

const INSTITUTIONAL_MOTIVATIONAL_ENDINGS = [
  'com clareza, respeito e método.',
  'e a gestão ganha consistência.',
  'quando a rotina protege o propósito.',
  'para elevar a experiência de todos.',
  'com dados, diálogo e responsabilidade.',
  'e ninguém precisa adivinhar o que fazer.',
  'porque coordenação também é cuidado.',
  'quando a informação vira ação.',
  'para manter tudo no trilho certo.',
  'e o trabalho vira colaboração.',
  'para fortalecer a confiança institucional.',
  'porque cada detalhe soma no resultado.',
  'e o ambiente fica mais saudável.',
  'quando o foco está no aluno.',
  'sem perder a essência educacional.',
  'com autonomia e compromisso.',
  'para decisões mais inteligentes.',
  'e todos enxergam a mesma direção.',
  'porque liderança também ensina com exemplo.',
  'com processos simples e consistentes.',
  'quando o time age como um time.',
] as const;

const buildPhraseTable = (starts: readonly string[], endings: readonly string[]) =>
  starts.flatMap((start) => endings.map((ending) => `${start} ${ending}`));

export const STUDENT_LOGIN_MOTIVATIONAL_PHRASES = buildPhraseTable(
  STUDENT_MOTIVATIONAL_STARTS,
  STUDENT_MOTIVATIONAL_ENDINGS,
);
export const INSTITUTIONAL_LOGIN_MOTIVATIONAL_PHRASES = buildPhraseTable(
  INSTITUTIONAL_MOTIVATIONAL_STARTS,
  INSTITUTIONAL_MOTIVATIONAL_ENDINGS,
);

export const getRandomMotivationalPhrase = (phrases: readonly string[]) => {
  if (phrases.length === 0) return '';
  const index = Math.floor(Math.random() * phrases.length);
  return phrases[index] ?? phrases[0] ?? '';
};
