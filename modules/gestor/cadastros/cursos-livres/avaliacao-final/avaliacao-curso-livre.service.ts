import { supabase } from '../../../../../lib/supabase';
import type {
  AvaliacaoCursoLivreGestao,
  AvaliacaoCursoLivreGestaoWorkspace,
  QuestaoCursoLivreGestao,
  SalvarAvaliacaoCursoLivreInput,
} from './avaliacao-curso-livre.types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const readString = (record: UnknownRecord, camel: string, snake = camel, fallback = '') => {
  const value = record[camel] ?? record[snake];
  return typeof value === 'string' ? value : fallback;
};

const readNumber = (record: UnknownRecord, camel: string, snake = camel, fallback = 0) => {
  const value = Number(record[camel] ?? record[snake]);
  return Number.isFinite(value) ? value : fallback;
};

const normalizeQuestion = (value: unknown): QuestaoCursoLivreGestao | null => {
  if (!isRecord(value)) return null;
  const optionsValue = value.opcoes;
  const opcoes = Array.isArray(optionsValue)
    ? optionsValue.filter((option): option is string => typeof option === 'string')
    : [];
  const id = readString(value, 'id');

  return {
    ...(id ? { id } : {}),
    enunciado: readString(value, 'enunciado'),
    opcoes,
    respostaCorreta: readNumber(value, 'respostaCorreta', 'resposta_correta'),
    ativa: value.ativa !== false,
  };
};

const normalizeAssessment = (value: unknown): AvaliacaoCursoLivreGestao | null => {
  if (!isRecord(value)) return null;
  const questoesValue = value.questoes;
  const status = readString(value, 'status') === 'PUBLICADA' ? 'PUBLICADA' : 'RASCUNHO';
  const publishedValue = value.publicadaEm ?? value.publicada_em;

  return {
    id: readString(value, 'id'),
    cursoId: readString(value, 'cursoId', 'curso_id'),
    versao: readNumber(value, 'versao'),
    revisao: readNumber(value, 'revisao'),
    status,
    titulo: readString(value, 'titulo', 'titulo', 'Avaliação final'),
    notaMinimaPercentual: readNumber(value, 'notaMinimaPercentual', 'nota_minima_percentual', 60),
    quantidadeSorteada: readNumber(value, 'quantidadeSorteada', 'quantidade_sorteada', 10),
    minimoBanco: readNumber(value, 'minimoBanco', 'minimo_banco', 50),
    intervaloNovaTentativaHoras: readNumber(
      value,
      'intervaloNovaTentativaHoras',
      'intervalo_nova_tentativa_horas',
      0,
    ),
    publicadaEm: typeof publishedValue === 'string' ? publishedValue : null,
    questoes: Array.isArray(questoesValue)
      ? questoesValue.map(normalizeQuestion).filter((question): question is QuestaoCursoLivreGestao => Boolean(question))
      : [],
  };
};

export const normalizeAvaliacaoCursoLivreGestaoWorkspace = (
  value: unknown,
  cursoId: string,
): AvaliacaoCursoLivreGestaoWorkspace => {
  if (!isRecord(value)) throw new Error('O servidor não retornou a avaliação final do curso.');
  return {
    cursoId: readString(value, 'cursoId', 'curso_id', cursoId),
    avaliacao: normalizeAssessment(value.avaliacao),
    replayed: value.replayed === true,
  };
};

const requireRpcData = (data: unknown, error: unknown, fallback: string) => {
  if (error) throw error;
  if (!data) throw new Error(fallback);
  return data;
};

export const avaliacaoCursoLivreGestaoService = {
  async obter(cursoId: string): Promise<AvaliacaoCursoLivreGestaoWorkspace> {
    const { data, error } = await supabase.rpc('obter_avaliacao_curso_livre_gestao_secure', {
      p_curso_id: cursoId,
    });
    return normalizeAvaliacaoCursoLivreGestaoWorkspace(
      requireRpcData(data, error, 'Não foi possível carregar a avaliação final.'),
      cursoId,
    );
  },

  async salvar(input: SalvarAvaliacaoCursoLivreInput): Promise<AvaliacaoCursoLivreGestaoWorkspace> {
    const { data, error } = await supabase.rpc('salvar_avaliacao_curso_livre_gestao_secure', {
      p_request_id: input.requestId,
      p_curso_id: input.cursoId,
      p_avaliacao_id: input.avaliacaoId,
      p_expected_revisao: input.expectedRevisao,
      p_publicar: input.publicar,
      p_config: input.config,
      p_questoes: input.questoes.map((question) => ({
        ...(question.id ? { id: question.id } : {}),
        enunciado: question.enunciado,
        opcoes: question.opcoes,
        respostaCorreta: question.respostaCorreta,
        ativa: question.ativa,
      })),
    });
    return normalizeAvaliacaoCursoLivreGestaoWorkspace(
      requireRpcData(data, error, 'O servidor não confirmou a avaliação final.'),
      input.cursoId,
    );
  },
};

export const createAvaliacaoCursoLivreRequestId = () => globalThis.crypto.randomUUID();
