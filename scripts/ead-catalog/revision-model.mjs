import { createHash } from 'node:crypto';

const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const unique = values => new Set(values).size === values.length;
const fail = message => { throw new Error(message); };

export function validateRevision(revision, { requireAnswers = false } = {}) {
  const { lessons = [], activities = [], exam = [], sources = [] } = revision;
  if (!nonempty(revision.courseName) || !/^ead-[a-z0-9]+(?:-[a-z0-9]+)*-20261027-v2$/.test(revision.revisionId)
    || !/^[a-f0-9-]{36}$/.test(revision.courseId)) {
    fail('Curso ou revisão não reconhecido.');
  }
  if (lessons.length < 5 || exam.length < 10 || activities.length < lessons.length) {
    fail('A revisão precisa de aulas, atividades por aula e pelo menos dez questões.');
  }
  const ids = [...lessons, ...activities, ...exam].map(item => item.id);
  if (!ids.every(nonempty) || !unique(ids) || ids.some(id => /^(aula-|atividade-|q-)/.test(id))) {
    fail('IDs devem ser novos, únicos e específicos da revisão.');
  }
  if (!Number.isInteger(revision.hours) || lessons.reduce((sum, lesson) => sum + lesson.hours, 0) !== revision.hours) {
    fail('A carga horária das aulas precisa fechar com a do curso.');
  }
  const sourceMap = new Map(sources.map(source => [source.id, source]));
  if (sources.length < 2 || sourceMap.size !== sources.length || sources.some(source => (
    !nonempty(source.title) || !/^https:\/\//.test(source.url)
  ))) fail('Informe fontes identificadas e verificáveis por HTTPS.');
  for (const lesson of lessons) {
    if (!nonempty(lesson.title) || !Number.isInteger(lesson.hours) || lesson.hours < 1
      || !Array.isArray(lesson.skills) || !lesson.skills.length || !lesson.skills.every(nonempty)
      || !nonempty(lesson.html) || lesson.html.replace(/<[^>]+>/g, '').length < 2500) {
      fail(`Aula incompleta: ${lesson.id}`);
    }
    if (!lesson.sourceIds?.length || lesson.sourceIds.some(id => !sourceMap.has(id))) {
      fail(`Aula sem referência válida: ${lesson.id}`);
    }
    if (/<(?:script|iframe|img|object|svg|form)\b|\bon\w+\s*=|javascript:/i.test(lesson.html)) {
      fail(`HTML não autorizado: ${lesson.id}`);
    }
    if (activities.filter(item => item.lessonId === lesson.id).length < 1
      || exam.filter(item => item.lessonId === lesson.id).length < 2) {
      fail(`Aula sem cobertura em atividade e prova: ${lesson.id}`);
    }
  }
  const lessonMap = new Map(lessons.map(lesson => [lesson.id, lesson]));
  const questions = [...activities, ...exam];
  if (!unique(questions.map(item => item.prompt.trim()))) fail('Atividades e prova devem ter problemas próprios.');
  for (const item of questions) {
    const lesson = lessonMap.get(item.lessonId);
    if (!item.sourceIds?.length || item.sourceIds.some(id => !sourceMap.has(id))) {
      fail(`Questão sem referência válida: ${item.id}`);
    }
    if (!lesson || !lesson.skills.includes(item.skill)) fail(`Habilidade sem apoio na aula: ${item.id}`);
    if (!nonempty(item.prompt) || !Array.isArray(item.options) || item.options.length < 4
      || !item.options.every(nonempty) || !unique(item.options)) {
      fail(`Questão ou gabarito inválido: ${item.id}`);
    }
    if (requireAnswers && (!nonempty(item.explanation) || item.explanation.length < 35
      || !Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex >= item.options.length)) {
      fail(`Pacote privado incompleto: ${item.id}`);
    }
    if (!requireAnswers && ('correctIndex' in item || 'explanation' in item)) fail('Gabarito em fonte pública.');
  }
  if (requireAnswers && (!unique(exam.map(item => item.explanation))
    || new Set(exam.map(item => item.correctIndex)).size < 3)) {
    fail('A prova precisa de resoluções específicas e gabaritos distribuídos.');
  }
  return revision;
}

export function withPrivateAnswers(revision, keyring) {
  validateRevision(revision);
  const keys = keyring?.[revision.revisionId];
  const attach = item => {
    const key = keys?.[item.id];
    if (!key) fail(`Gabarito privado ausente: ${item.id}`);
    return { ...item, correctIndex: key.correctIndex, explanation: key.explanation };
  };
  const result = { ...revision, activities: revision.activities.map(attach), exam: revision.exam.map(attach) };
  validateRevision(result, { requireAnswers: true });
  return result;
}

export function publicRevisionHash(revision) {
  const publicItem = item => {
    const result = { ...item };
    delete result.correctIndex;
    delete result.explanation;
    return result;
  };
  const publicRevision = { ...revision, activities: revision.activities.map(publicItem), exam: revision.exam.map(publicItem) };
  return createHash('sha256').update(JSON.stringify(publicRevision)).digest('hex');
}

export function buildCourseConfig(previous, revision, { includeAnswers = true } = {}) {
  validateRevision(revision, { requireAnswers: includeAnswers });
  const lessonMap = new Map(revision.lessons.map(lesson => [lesson.id, lesson]));
  const question = item => ({
    id: item.id,
    aulaId: item.lessonId,
    habilidade: item.skill,
    pergunta: item.prompt,
    opcoes: item.options,
    ...(includeAnswers ? { respostaCorreta: item.correctIndex, explicacao: item.explanation } : {}),
  });
  return {
    ...previous,
    assessmentRevision: revision.revisionId,
    contentRevision: revision.revisionId,
    publicationSourceHash: publicRevisionHash(revision),
    videoUrl: '',
    videoPrincipalUrl: '',
    pagina: {
      ...previous.pagina,
      ...(revision.subtitle ? { subtitulo: revision.subtitle } : {}),
      publicoAlvo: revision.audience || 'Estudantes interessados nos conhecimentos introdutórios deste curso.',
      objetivos: revision.objectives || revision.lessons.flatMap(lesson => lesson.objectives || [lesson.title]),
    },
    referencias: revision.sources,
    conteudos: revision.lessons.map((lesson, index) => ({
      id: lesson.id,
      tipo: 'pagina',
      etapa: `Módulo ${index + 1}`,
      titulo: lesson.title,
      descricao: 'Leia a explicação, refaça os exemplos e resolva a prática antes da atividade.',
      objetivos: lesson.objectives || lesson.skills,
      habilidades: lesson.skills,
      duracao: `${lesson.hours}h`,
      duracaoMinutos: lesson.hours * 60,
      textoHtml: lesson.html,
      referencias: lesson.sourceIds.map(id => revision.sources.find(source => source.id === id)),
    })),
    atividades: revision.activities.map((item, index) => ({
      id: item.id,
      tipo: 'multipla_escolha',
      aulaId: item.lessonId,
      etapaId: item.lessonId,
      titulo: `Atividade ${index + 1}: ${lessonMap.get(item.lessonId).title}`,
      descricao: 'Analise o caso e consulte a aula antes de escolher a alternativa.',
      obrigatoria: true,
      enunciado: item.prompt,
      opcoes: item.options,
      ...(includeAnswers ? { respostaCorreta: item.correctIndex, explicacao: item.explanation } : {}),
      habilidade: item.skill,
    })),
    provas: [{
      ...(previous.provas?.[0] || {}),
      id: `${revision.revisionId}-prova`,
      titulo: `Prova Final — ${revision.courseName}`,
      descricao: 'Situações e conhecimentos específicos das habilidades estudadas nas aulas.',
      notaMinima: previous.provas?.[0]?.notaMinima ?? 70,
      tempoMinutos: previous.provas?.[0]?.tempoMinutos ?? 60,
      liberarAposConteudos: true,
      intervaloReprovacaoHoras: previous.provas?.[0]?.intervaloReprovacaoHoras ?? 3,
      questoes: revision.exam.map(question),
    }],
    cronograma: revision.lessons.map((lesson, index) => ({
      id: `${lesson.id}-modulo`, ordem: index + 1, titulo: lesson.title,
      descricao: 'Estudo, exemplos resolvidos, prática orientada e atividade.',
      cargaHoraria: lesson.hours, conteudos: [lesson.id],
    })),
    regras: { ...previous.regras, exigirAtividades: true, exigirVideosConcluidos: false },
  };
}
