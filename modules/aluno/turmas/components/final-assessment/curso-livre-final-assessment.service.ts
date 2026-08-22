import { supabase } from '../../../../../lib/supabase';
import type {
  CursoLivreAvaliacaoAlunoWorkspace,
  CursoLivreAvaliacaoResumoAluno,
  CursoLivreCertificadoAluno,
  CursoLivreQuestaoTentativaAluno,
  CursoLivreTentativaAluno,
  EntregarTentativaCursoLivreInput,
  IniciarTentativaCursoLivreInput,
} from './curso-livre-final-assessment.types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const readString = (record: UnknownRecord, camel: string, snake = camel, fallback = '') => {
  const value = record[camel] ?? record[snake];
  return typeof value === 'string' ? value : fallback;
};

const readNullableString = (record: UnknownRecord, camel: string, snake = camel) => {
  const value = record[camel] ?? record[snake];
  return typeof value === 'string' && value ? value : null;
};

const readNumber = (record: UnknownRecord, camel: string, snake = camel, fallback = 0) => {
  const value = Number(record[camel] ?? record[snake]);
  return Number.isFinite(value) ? value : fallback;
};

const readNullableNumber = (record: UnknownRecord, camel: string, snake = camel) => {
  const raw = record[camel] ?? record[snake];
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

const normalizeQuestion = (value: unknown): CursoLivreQuestaoTentativaAluno | null => {
  if (!isRecord(value)) return null;
  const optionsValue = value.opcoes;
  return {
    id: readString(value, 'id'),
    ordem: readNumber(value, 'ordem'),
    enunciado: readString(value, 'enunciado'),
    opcoes: Array.isArray(optionsValue)
      ? optionsValue.filter((option): option is string => typeof option === 'string')
      : [],
  };
};

const normalizeAssessment = (value: unknown): CursoLivreAvaliacaoResumoAluno | null => {
  if (!isRecord(value)) return null;
  return {
    id: readString(value, 'id'),
    versao: readNumber(value, 'versao'),
    titulo: readString(value, 'titulo', 'titulo', 'Avaliação final'),
    notaMinimaPercentual: readNumber(value, 'notaMinimaPercentual', 'nota_minima_percentual'),
    quantidadeSorteada: readNumber(value, 'quantidadeSorteada', 'quantidade_sorteada'),
  };
};

const normalizeAttempt = (value: unknown): CursoLivreTentativaAluno | null => {
  if (!isRecord(value)) return null;
  const rawStatus = readString(value, 'status');
  if (rawStatus !== 'EM_ANDAMENTO' && rawStatus !== 'APROVADA' && rawStatus !== 'REPROVADA') {
    throw new Error('O servidor retornou um status de tentativa inválido.');
  }
  const status = rawStatus;
  const questionsValue = value.questoes;
  return {
    id: readString(value, 'id'),
    status,
    iniciadaEm: readNullableString(value, 'iniciadaEm', 'iniciada_em'),
    enviadaEm: readNullableString(value, 'enviadaEm', 'enviada_em'),
    notaPercentual: readNullableNumber(value, 'notaPercentual', 'nota_percentual'),
    acertos: readNullableNumber(value, 'acertos'),
    total: readNullableNumber(value, 'total'),
    questoes: Array.isArray(questionsValue)
      ? questionsValue.map(normalizeQuestion).filter((question): question is CursoLivreQuestaoTentativaAluno => Boolean(question))
      : [],
  };
};

const normalizeCertificate = (value: unknown): CursoLivreCertificadoAluno | null => {
  if (!isRecord(value)) return null;
  return {
    id: readString(value, 'id'),
    status: readString(value, 'status'),
    codigoValidacao: readNullableString(value, 'codigoValidacao', 'codigo_validacao'),
  };
};

export const normalizeCursoLivreAvaliacaoAlunoWorkspace = (
  value: unknown,
  matriculaId: string,
): CursoLivreAvaliacaoAlunoWorkspace => {
  if (!isRecord(value)) throw new Error('O servidor não retornou a prova final desta matrícula.');
  const releaseValue = isRecord(value.liberacao) ? value.liberacao : {};
  return {
    matriculaId: readString(value, 'matriculaId', 'matricula_id', matriculaId),
    turmaId: readString(value, 'turmaId', 'turma_id'),
    cursoId: readString(value, 'cursoId', 'curso_id'),
    avaliacao: normalizeAssessment(value.avaliacao),
    liberacao: {
      liberada: releaseValue.liberada === true,
      podeIniciar: releaseValue.podeIniciar === true || (
        releaseValue.podeIniciar === undefined && releaseValue.liberada === true
      ),
      liberadaEm: readNullableString(releaseValue, 'liberadaEm', 'liberada_em'),
      novaTentativaEm: readNullableString(releaseValue, 'novaTentativaEm', 'nova_tentativa_em'),
      motivo: readNullableString(releaseValue, 'motivo'),
    },
    tentativa: normalizeAttempt(value.tentativa),
    certificado: normalizeCertificate(value.certificado),
    replayed: value.replayed === true,
  };
};

const requireRpcData = (data: unknown, error: unknown, fallback: string) => {
  if (error) throw error;
  if (!data) throw new Error(fallback);
  return data;
};

export const cursoLivreFinalAssessmentService = {
  async obter(matriculaId: string) {
    const { data, error } = await supabase.rpc('obter_avaliacao_curso_livre_aluno_secure', {
      p_matricula_id: matriculaId,
    });
    return normalizeCursoLivreAvaliacaoAlunoWorkspace(
      requireRpcData(data, error, 'Não foi possível carregar a prova final.'),
      matriculaId,
    );
  },

  async iniciar(input: IniciarTentativaCursoLivreInput) {
    const { data, error } = await supabase.rpc('iniciar_tentativa_curso_livre_secure', {
      p_request_id: input.requestId,
      p_matricula_id: input.matriculaId,
    });
    return normalizeCursoLivreAvaliacaoAlunoWorkspace(
      requireRpcData(data, error, 'O servidor não confirmou o início da tentativa.'),
      input.matriculaId,
    );
  },

  async entregar(input: EntregarTentativaCursoLivreInput) {
    const { data, error } = await supabase.rpc('entregar_tentativa_curso_livre_secure', {
      p_request_id: input.requestId,
      p_tentativa_id: input.tentativaId,
      p_respostas: input.respostas,
    });
    const response = requireRpcData(data, error, 'O servidor não confirmou a entrega da tentativa.');
    const normalized = normalizeCursoLivreAvaliacaoAlunoWorkspace(response, '');
    if (!normalized.matriculaId) throw new Error('A entrega não retornou a matrícula da tentativa.');
    return normalized;
  },
};

export const createCursoLivreAssessmentRequestId = () => globalThis.crypto.randomUUID();
