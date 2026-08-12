import { supabase } from '../../../../lib/supabase';
import type {
  AlunoDisponivelPlanoFinanceiroUnico,
  MatricularAlunoPlanoFinanceiroUnicoInput,
  MatricularAlunoPlanoFinanceiroUnicoResult,
  ParcelaGeradaPlanoFinanceiroUnico,
  ParcelaPlanoFinanceiroUnico,
  PlanoFinanceiroUnicoWorkspace,
  RegraPlanoFinanceiroUnico,
  ResumoPlanoFinanceiroUnico,
  TurmaDestinoPlanoFinanceiroUnico,
} from './types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asString = (value: unknown, fallback = '') => (
  typeof value === 'string' ? value : fallback
);

const normalizeSchedule = (value: unknown): ParcelaPlanoFinanceiroUnico[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const numero = asNumber(item.numero);
    const dataVencimento = asString(item.dataVencimento || item.vencimento);
    if (!numero || !dataVencimento) return [];

    return [{
      id: asString(item.id, `parcela-${numero}`),
      tipo: 'PARCELA' as const,
      numero,
      label: asString(item.label, `Parcela ${numero}`),
      valor: asNumber(item.valor),
      dataVencimento,
      fingerprint: asString(item.fingerprint) || undefined,
    }];
  });
};

const normalizeRule = (value: unknown): RegraPlanoFinanceiroUnico => {
  const rule = isRecord(value) ? value : {};

  return {
    valorTotal: asNumber(rule.valorTotal),
    qtdParcelas: asNumber(rule.qtdParcelas),
    primeiroVencimento: asString(rule.primeiroVencimento),
    diaVencimento: asNumber(rule.diaVencimento),
    descontoPontualidade: asNumber(rule.descontoPontualidade),
    jurosAtrasoPercentual: asNumber(rule.jurosAtrasoPercentual),
    multaAtraso: asNumber(rule.multaAtraso),
    revisao: asNumber(rule.revisao),
    fingerprint: asString(rule.fingerprint),
    cronograma: normalizeSchedule(rule.cronograma),
  };
};

const normalizeSummary = (value: unknown): ResumoPlanoFinanceiroUnico => {
  const summary = isRecord(value) ? value : {};

  return {
    alunosComPlano: asNumber(summary.alunosComPlano),
    parcelasGeradas: asNumber(summary.parcelasGeradas),
    totalLancado: asNumber(summary.totalLancado),
    totalRecebido: asNumber(summary.totalRecebido),
    emAberto: asNumber(summary.emAberto),
  };
};

const normalizeWorkspace = (value: unknown, turmaId: string): PlanoFinanceiroUnicoWorkspace => {
  const workspace = isRecord(value) ? value : {};
  const configurado = workspace.configurado === true;

  if (!configurado) {
    return {
      turmaId: asString(workspace.turmaId, turmaId),
      configurado: false,
      motivo: workspace.motivo === 'PLANO_AUSENTE' ? 'PLANO_AUSENTE' : undefined,
    };
  }

  return {
    turmaId: asString(workspace.turmaId, turmaId),
    configurado: true,
    regra: normalizeRule(workspace.regra),
    resumo: normalizeSummary(workspace.resumo),
  };
};

const normalizeGeneratedInstallments = (value: unknown): ParcelaGeradaPlanoFinanceiroUnico[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const numero = asNumber(item.numero);
    const vencimento = asString(item.vencimento || item.dataVencimento);
    if (!numero || !vencimento) return [];

    return [{
      id: asString(item.id, `parcela-gerada-${numero}`),
      numero,
      valor: asNumber(item.valor),
      vencimento,
      status: asString(item.status),
      formaPagamento: asString(item.formaPagamento, 'BOLETO'),
    }];
  });
};

const requireRecord = (data: unknown, error: unknown, fallbackMessage: string): UnknownRecord => {
  if (error) throw error;
  if (!isRecord(data)) throw new Error(fallbackMessage);
  return data;
};

export const planoFinanceiroUnicoService = {
  async getAvailableStudents(
    turmaId: string,
    searchTerm: string,
  ): Promise<AlunoDisponivelPlanoFinanceiroUnico[]> {
    const normalizedSearch = searchTerm.trim().replace(/\s+/g, ' ');
    if (normalizedSearch.length < 2) return [];

    const { data, error } = await supabase.rpc('search_gestao_available_students', {
      p_turma_id: turmaId,
      p_search: normalizedSearch,
      p_limit: 30,
    });
    if (error) throw error;
    return Array.isArray(data) ? data as AlunoDisponivelPlanoFinanceiroUnico[] : [];
  },

  async getDestinationClasses(turmaId: string): Promise<TurmaDestinoPlanoFinanceiroUnico[]> {
    const { data: source, error: sourceError } = await supabase
      .from('turmas')
      .select('curso_id')
      .eq('id', turmaId)
      .single();
    if (sourceError) throw sourceError;

    const { data, error } = await supabase
      .from('turmas')
      .select('id, nome, codigo, polo_id, polos(nome)')
      .neq('id', turmaId)
      .eq('curso_id', source.curso_id)
      .eq('status', 'EM_ANDAMENTO')
      .order('nome');
    if (error) throw error;
    return (data || []) as TurmaDestinoPlanoFinanceiroUnico[];
  },

  async getWorkspace(turmaId: string): Promise<PlanoFinanceiroUnicoWorkspace> {
    const { data, error } = await supabase.rpc('obter_plano_financeiro_unico_turma_secure', {
      p_turma_id: turmaId,
    });

    return normalizeWorkspace(
      requireRecord(data, error, 'O servidor não retornou o plano financeiro da turma.'),
      turmaId,
    );
  },

  async matricularAlunoGerarParcelas(
    input: MatricularAlunoPlanoFinanceiroUnicoInput,
  ): Promise<MatricularAlunoPlanoFinanceiroUnicoResult> {
    const { data, error } = await supabase.rpc(
      'matricular_aluno_e_gerar_parcelas_plano_financeiro_unico_secure',
      {
        p_request_id: input.requestId,
        p_turma_id: input.turmaId,
        p_aluno_id: input.alunoId,
        p_expected_revisao: input.expectedRevisao,
        p_expected_fingerprint: input.expectedFingerprint,
      },
    );
    const response = requireRecord(
      data,
      error,
      'O servidor não confirmou a matrícula com as parcelas da turma.',
    );
    const matricula = isRecord(response.matricula) ? response.matricula : {};

    return {
      requestId: asString(response.requestId, input.requestId),
      replayed: response.replayed === true,
      matricula: {
        id: asString(matricula.id),
        alunoId: asString(matricula.alunoId, input.alunoId),
        turmaId: asString(matricula.turmaId, input.turmaId),
        status: asString(matricula.status),
      },
      plano: normalizeRule(response.plano),
      parcelasInseridas: asNumber(response.parcelasInseridas),
      parcelasGeradas: asNumber(response.parcelasGeradas),
      parcelas: normalizeGeneratedInstallments(response.parcelas),
    };
  },
};

export const createPlanoFinanceiroUnicoRequestId = () => crypto.randomUUID();
