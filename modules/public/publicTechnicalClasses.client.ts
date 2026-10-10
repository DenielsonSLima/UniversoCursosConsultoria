import {
  requireTechnicalAdmissionPolicy,
  type TechnicalAdmissionPolicy,
} from '../shared/utils/technicalAdmissionPolicy.ts';

export interface PublicTechnicalClassRow {
  turma_id: string;
  curso_id: string;
  inscricoes_online_disponiveis: boolean;
  situacao_vagas: string;
  ingresso: TechnicalAdmissionPolicy;
  [key: string]: any;
}

interface PublicTechnicalClassesFilter {
  limit?: number | null;
  turmaId?: string | null;
  courseId?: string | null;
}

type PublicTechnicalRpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

const invalidResponse = () => new Error('Não foi possível conferir a disponibilidade da turma técnica.');

export const requirePublicTechnicalClass = (value: unknown): PublicTechnicalClassRow => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidResponse();
  const row = value as Record<string, unknown>;
  if (typeof row.turma_id !== 'string' || !row.turma_id
    || typeof row.curso_id !== 'string' || !row.curso_id
    || typeof row.inscricoes_online_disponiveis !== 'boolean'
    || typeof row.situacao_vagas !== 'string') throw invalidResponse();
  const ingresso = requireTechnicalAdmissionPolicy(row.ingresso, row.turma_id);
  return { ...row, ingresso } as PublicTechnicalClassRow;
};

export const isPublicTechnicalClassOpen = (row: PublicTechnicalClassRow) =>
  row.inscricoes_online_disponiveis && row.ingresso.matriculaDiretaPermitida;

export const toPublicTechnicalTurma = (row: PublicTechnicalClassRow) => ({
  id: row.turma_id,
  curso_id: row.curso_id,
  nome: row.turma_nome,
  codigo: row.turma_codigo,
  turno: row.turno,
  status: row.turma_status,
  data_inicio: row.data_inicio,
  data_inicio_inscricao: row.data_inicio_inscricao,
  data_fim_inscricao: row.data_fim_inscricao,
  vagas_totais: row.vagas_totais,
  permitir_inscricoes_online: isPublicTechnicalClassOpen(row),
  cursos: { modalidade: 'TECNICO' },
  polos: { nome: row.polo_nome, cidade: row.polo_cidade, estado: row.polo_estado },
  ingresso: row.ingresso,
});

export const getPublicTechnicalClassReason = (row: PublicTechnicalClassRow) => {
  if (!row.ingresso.matriculaDiretaPermitida) return row.ingresso.mensagem;
  return isPublicTechnicalClassOpen(row) ? null : (row.situacao_vagas || 'Turma indisponível para inscrição online.');
};

export const requirePublicTechnicalCheckoutClass = (
  row: PublicTechnicalClassRow,
  courseId: string,
  turmaId: string,
) => {
  if (row.curso_id !== courseId || row.turma_id !== turmaId) throw invalidResponse();
  const reason = getPublicTechnicalClassReason(row);
  if (reason) throw new Error(reason);
  return row;
};

export const createPublicTechnicalClassesClient = (rpc: PublicTechnicalRpc) => ({
  async list({ limit = null, turmaId = null, courseId = null }: PublicTechnicalClassesFilter = {}) {
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 1000)) {
      throw new Error('Limite de turmas inválido.');
    }
    const { data, error } = await rpc('list_public_technical_classes_ingresso', {
      p_limit: limit, p_turma_id: turmaId, p_curso_id: courseId,
    });
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw invalidResponse();
    const rows = data.map(requirePublicTechnicalClass);
    if (rows.some((row) => (turmaId && row.turma_id !== turmaId)
      || (courseId && row.curso_id !== courseId))) throw invalidResponse();
    if (new Set(rows.map((row) => row.turma_id)).size !== rows.length) throw invalidResponse();
    return rows;
  },
});
