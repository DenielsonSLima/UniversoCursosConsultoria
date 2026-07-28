import type {
  AtividadeAlunoComResposta,
  AtividadeAlunoFiltro,
  AtividadeAlunoRoster,
  AtividadeExtraClasseFormState,
  AtividadeExtraClassePergunta,
  AtividadeExtraClasseResposta,
  AtividadeExtraClasseRespostaItem,
} from './atividadesExtraClasse.types';

export const buildAtividadeStudents = (
  roster: readonly AtividadeAlunoRoster[],
  respostas: readonly AtividadeExtraClasseResposta[],
): AtividadeAlunoComResposta[] => {
  const responseByStudent = new Map(respostas.map((resposta) => [resposta.aluno_id, resposta]));
  const students: AtividadeAlunoComResposta[] = roster.map((aluno) => ({
    id: aluno.id,
    nome: aluno.nome,
    matricula: aluno.matricula || null,
    matriculaStatus: aluno.status || null,
    resposta: responseByStudent.get(aluno.id) || null,
  }));
  const rosterIds = new Set(students.map((student) => student.id));

  respostas.forEach((resposta) => {
    if (rosterIds.has(resposta.aluno_id)) return;
    students.push({
      id: resposta.aluno_id,
      nome: resposta.aluno?.nome || 'Aluno não identificado',
      matricula: null,
      matriculaStatus: 'VÍNCULO HISTÓRICO',
      resposta,
    });
  });

  return students.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
};

export const getAtividadeStudentCounts = (
  students: readonly AtividadeAlunoComResposta[],
) => ({
  total: students.length,
  aguardando: students.filter((student) => (
    !student.resposta || student.resposta.status === 'PENDENTE'
  )).length,
  revisar: students.filter((student) => student.resposta?.status === 'ENTREGUE').length,
  corrigidos: students.filter((student) => student.resposta?.status === 'CORRIGIDA').length,
});

export const filterAtividadeStudents = (
  students: readonly AtividadeAlunoComResposta[],
  filter: AtividadeAlunoFiltro,
  search: string,
) => {
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  return students.filter((student) => {
    const matchesSearch = !normalizedSearch
      || student.nome.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
      || String(student.matricula || '').toLocaleLowerCase('pt-BR').includes(normalizedSearch);
    if (!matchesSearch) return false;
    if (filter === 'AGUARDANDO') {
      return !student.resposta || student.resposta.status === 'PENDENTE';
    }
    if (filter === 'REVISAR') return student.resposta?.status === 'ENTREGUE';
    if (filter === 'CORRIGIDOS') return student.resposta?.status === 'CORRIGIDA';
    return true;
  });
};

export const createAtividadeFormInitialState = (
  disciplinaId = '',
): AtividadeExtraClasseFormState => ({
  disciplinaId,
  titulo: '',
  tema: '',
  horas: '',
  prazoEntrega: '',
  texto: '',
  videoUrl: '',
  perguntas: '',
  tipoResposta: 'TEXTO',
});

export const isAtividadeTurmaPreparacao = (status?: string | null) =>
  ['PLANEJADA', 'INSCRICOES_ABERTAS'].includes(String(status || '').toUpperCase());

export const isAtividadeContextoOperacional = (
  turmaStatus?: string | null,
  periodoStatus?: string | null,
) => String(turmaStatus || '').toUpperCase() === 'EM_ANDAMENTO'
  && ['ABERTO', 'EM_FECHAMENTO'].includes(String(periodoStatus || '').toUpperCase());

export const formatAtividadeDate = (value?: string | null) => {
  if (!value) return 'Prazo não definido';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Prazo não definido';
  return date.toLocaleDateString('pt-BR');
};

export const formatAtividadeHoras = (value: unknown) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return '0';
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
};

export const parsePerguntas = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((pergunta) => ({ pergunta }));

export const getRespostaAnswers = (
  resposta: AtividadeExtraClasseResposta,
): AtividadeExtraClasseRespostaItem[] => {
  const answers = resposta?.respostas;
  if (!Array.isArray(answers)) return [];
  return answers.filter((answer): answer is AtividadeExtraClasseRespostaItem => (
    typeof answer === 'object' && answer !== null
  ));
};

export const getAtividadePerguntaTexto = (
  pergunta: AtividadeExtraClassePergunta | unknown,
  index: number,
) => {
  if (typeof pergunta === 'string') return pergunta;
  if (typeof pergunta === 'object' && pergunta !== null && 'pergunta' in pergunta) {
    const texto = (pergunta as { pergunta?: unknown }).pergunta;
    if (typeof texto === 'string' && texto.trim()) return texto;
  }
  return `Pergunta ${index + 1}`;
};

const getLocalIsoDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isAtividadePrazoEncerrado = (
  prazoEntrega?: string | null,
  now = new Date(),
) => Boolean(prazoEntrega && /^\d{4}-\d{2}-\d{2}$/.test(prazoEntrega) && prazoEntrega < getLocalIsoDate(now));

export const isAtividadeRespostaAtrasada = (
  resposta: AtividadeExtraClasseResposta,
  prazoEntrega?: string | null,
) => {
  const submissionDate = resposta.entregue_em || resposta.created_at;
  if (!submissionDate || !prazoEntrega || !/^\d{4}-\d{2}-\d{2}$/.test(prazoEntrega)) return false;
  const submittedAt = new Date(submissionDate);
  if (Number.isNaN(submittedAt.getTime())) return false;
  return getLocalIsoDate(submittedAt) > prazoEntrega;
};

export const normalizeAtividadeHttpUrl = (
  value: string | null | undefined,
  label: string,
) => {
  const trimmed = value?.trim() || '';
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} precisa ser um endereço completo, começando com http:// ou https://.`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} deve usar um endereço http:// ou https://.`);
  }

  return parsed.toString();
};

export const getSafeAtividadeHttpUrl = (value?: string | null) => {
  try {
    return normalizeAtividadeHttpUrl(value, 'O link');
  } catch {
    return null;
  }
};

export const normalizeAtividadeErrorMessage = (message: string) =>
  message
    .replace('Carga horaria', 'Carga horária')
    .replace('carga horaria', 'carga horária')
    .replace('titulo', 'título');

export const getAtividadeErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return '';
};
