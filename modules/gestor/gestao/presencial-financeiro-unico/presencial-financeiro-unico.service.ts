import { supabase } from '../../../../lib/supabase';
import type {
  AjusteCondicaoPlanoFinanceiroUnico,
  AlunoDisponivelPlanoFinanceiroUnico,
  CodigoCondicaoPlanoFinanceiroUnicoStatus,
  MatricularAlunoPlanoFinanceiroUnicoInput,
  MatricularAlunoPlanoFinanceiroUnicoResult,
  MatricularAlunoPlanoFinanceiroUnicoV2Input,
  MatricularAlunoPlanoFinanceiroUnicoV2Result,
  ParcelaGeradaPlanoFinanceiroUnico,
  ParcelaPlanoFinanceiroUnico,
  PendenciaPlanoFinanceiroUnico,
  PendenciasPlanoFinanceiroUnicoResult,
  PlanoFinanceiroUnicoWorkspace,
  PreviewCondicaoPlanoFinanceiroUnicoInput,
  PreviewTurmaPlanoFinanceiroUnicoInput,
  RedefinirCodigoCondicaoPlanoFinanceiroUnicoInput,
  RegraCondicaoPlanoFinanceiroUnico,
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

const asOptionalNumber = (value: unknown) => {
  const parsed = Number(value);
  return value === null || value === undefined || !Number.isFinite(parsed) ? undefined : parsed;
};

const asOptionalString = (value: unknown) => (
  typeof value === 'string' && value.length > 0 ? value : undefined
);

const normalizeSimulation = (value: unknown) => {
  if (!isRecord(value)) return undefined;
  return {
    descontoAplicado: asNumber(value.descontoAplicado),
    jurosMensal: asNumber(value.jurosMensal),
    jurosPercentualDia: asNumber(value.jurosPercentualDia),
    jurosValorDia: asNumber(value.jurosValorDia),
    multa: asNumber(value.multa),
    valorComDesconto: asNumber(value.valorComDesconto),
    valorComAtraso30Dias: asNumber(value.valorComAtraso30Dias),
    mensagemPontualidade: asString(value.mensagemPontualidade),
    mensagemAtraso30Dias: asString(value.mensagemAtraso30Dias),
  };
};

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
      simulacao: normalizeSimulation(item.simulacao),
    }];
  });
};

const normalizeConditionRule = (value: unknown): RegraCondicaoPlanoFinanceiroUnico => {
  const condition = isRecord(value) ? value : {};
  const commercialDiscount = isRecord(condition.descontoComercial)
    ? condition.descontoComercial
    : {};
  const identity = isRecord(condition.identidade) ? condition.identidade : {};
  const messages = isRecord(condition.mensagens) ? condition.mensagens : {};
  const base = normalizeRule(condition);

  return {
    ...base,
    origem: condition.origem === 'PERSONALIZAR' ? 'PERSONALIZAR' : 'HERDAR',
    valorTotalNominal: asNumber(condition.valorTotalNominal, base.valorTotal),
    valorTotalEfetivo: asNumber(condition.valorTotalEfetivo, base.valorTotal),
    menorParcela: asNumber(condition.menorParcela),
    descontoComercial: {
      tipo: commercialDiscount.tipo === 'A_VISTA' || commercialDiscount.tipo === 'NEGOCIADO'
        ? commercialDiscount.tipo
        : 'NENHUM',
      valor: asNumber(commercialDiscount.valor),
    },
    identidade: {
      planoTurmaRevisao: asNumber(identity.planoTurmaRevisao, base.revisao),
      planoTurmaFingerprint: asString(identity.planoTurmaFingerprint),
      overrideRevisao: asOptionalNumber(identity.overrideRevisao),
      overrideFingerprint: asOptionalString(identity.overrideFingerprint),
      efetivaFingerprint: asString(identity.efetivaFingerprint, base.fingerprint),
      preview: identity.preview === true,
    },
    mensagens: {
      pagamentoAteVencimento: asString(messages.pagamentoAteVencimento),
      pagamentoCom30DiasAtraso: asString(messages.pagamentoCom30DiasAtraso),
      parcelamento: asString(messages.parcelamento),
    },
  };
};

const normalizeCodeStatus = (value: unknown, turmaId: string): CodigoCondicaoPlanoFinanceiroUnicoStatus => {
  const status = isRecord(value) ? value : {};
  return {
    turmaId: asString(status.turmaId, turmaId),
    configurado: status.configurado === true,
    revisao: asOptionalNumber(status.revisao),
    atualizadoEm: asOptionalString(status.atualizadoEm),
  };
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

const normalizePendingCondition = (value: unknown): PendenciaPlanoFinanceiroUnico | null => {
  if (!isRecord(value)) return null;
  const enrollment = isRecord(value.matricula) ? value.matricula : {};
  const student = isRecord(value.aluno) ? value.aluno : {};
  const config = isRecord(value.config) ? value.config : {};
  const enrollmentId = asString(enrollment.id);
  const studentId = asString(student.id);
  if (!enrollmentId || !studentId || !asString(student.nome)) return null;
  const rule = normalizeConditionRule(value.regra);
  const adjustment: AjusteCondicaoPlanoFinanceiroUnico = config.modo === 'PERSONALIZAR'
    ? {
      modo: 'PERSONALIZAR',
      qtdParcelas: rule.qtdParcelas,
      primeiroVencimento: rule.primeiroVencimento,
      descontoComercialTipo: rule.descontoComercial.tipo,
      descontoComercialValor: rule.descontoComercial.valor,
      descontoPontualidade: rule.descontoPontualidade,
      jurosAtrasoPercentual: rule.jurosAtrasoPercentual,
      multaAtraso: rule.multaAtraso,
    }
    : { modo: 'HERDAR' };

  return {
    matricula: { id: enrollmentId, status: asString(enrollment.status, 'PENDENTE') },
    aluno: {
      id: studentId,
      nome: asString(student.nome),
      cpfCnpj: asOptionalString(student.cpfCnpj || student.cpf_cnpj),
    },
    config: {
      status: asString(config.status, 'PENDENTE'),
      ajuste: adjustment,
      overrideRevisao: asOptionalNumber(config.overrideRevisao),
      overrideFingerprint: asOptionalString(config.overrideFingerprint),
    },
    regra: rule,
  };
};

const getAuthorizationDeniedMessage = (response: UnknownRecord) => {
  if (response.operacao !== 'AUTORIZACAO_NEGADA') return null;
  const authorization = isRecord(response.autorizacao) ? response.autorizacao : {};
  const reason = asString(authorization.motivo);
  if (reason === 'NAO_CONFIGURADO') return 'Configure o código de condições individuais desta turma antes de personalizar.';
  if (reason === 'BLOQUEADO') return `Código temporariamente bloqueado${asOptionalString(authorization.bloqueadoAte) ? ` até ${authorization.bloqueadoAte}` : ''}.`;
  if (reason === 'INVALIDO') {
    const attempts = asOptionalNumber(authorization.tentativasRestantes);
    return `Código financeiro inválido${attempts === undefined ? '' : `. Restam ${attempts} tentativa${attempts === 1 ? '' : 's'}`}.`;
  }
  return 'A condição individual não foi autorizada.';
};

const requireRecord = (data: unknown, error: unknown, fallbackMessage: string): UnknownRecord => {
  if (error) throw error;
  if (!isRecord(data)) throw new Error(fallbackMessage);
  return data;
};

export const planoFinanceiroUnicoService = {
  async previewTurmaPlan(
    input: PreviewTurmaPlanoFinanceiroUnicoInput,
  ): Promise<RegraPlanoFinanceiroUnico> {
    const { data, error } = await supabase.rpc(
      'prever_plano_financeiro_unico_turma_secure',
      {
        p_curso_id: input.cursoId,
        p_polo_id: input.poloId,
        p_plano: input.plano,
      },
    );
    const response = requireRecord(
      data,
      error,
      'O servidor não retornou a prévia do plano financeiro.',
    );
    if (!isRecord(response.regra)) {
      throw new Error('A prévia oficial não contém uma regra financeira válida.');
    }
    return normalizeRule(response.regra);
  },

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

  async previewEnrollmentCondition(
    input: PreviewCondicaoPlanoFinanceiroUnicoInput,
  ): Promise<RegraCondicaoPlanoFinanceiroUnico> {
    const {
      expectedOverrideRevisao: _expectedOverrideRevisao,
      expectedOverrideFingerprint: _expectedOverrideFingerprint,
      ...previewAdjustment
    } = input.ajuste;
    const { data, error } = await supabase.rpc(
      'prever_condicao_matricula_plano_financeiro_unico_secure',
      {
        p_turma_id: input.turmaId,
        p_aluno_id: input.alunoId,
        p_ajuste: previewAdjustment,
      },
    );
    const response = requireRecord(
      data,
      error,
      'O servidor não retornou a condição financeira individual.',
    );
    return normalizeConditionRule(response.regra);
  },

  async matricularAlunoV2(
    input: MatricularAlunoPlanoFinanceiroUnicoV2Input,
  ): Promise<MatricularAlunoPlanoFinanceiroUnicoV2Result> {
    const { data, error } = await supabase.rpc(
      'matricular_aluno_plano_financeiro_unico_v2_secure',
      {
        p_request_id: input.requestId,
        p_turma_id: input.turmaId,
        p_aluno_id: input.alunoId,
        p_expected_revisao: input.expectedRevisao,
        p_expected_fingerprint: input.expectedFingerprint,
        p_ajuste: input.ajuste,
        p_gerar_agora: input.gerarAgora,
        p_codigo: input.codigo || null,
        p_motivo: input.motivo || null,
        p_justificativa: input.justificativa || null,
      },
    );
    const response = requireRecord(
      data,
      error,
      'O servidor não confirmou a matrícula e a condição financeira.',
    );
    const deniedMessage = getAuthorizationDeniedMessage(response);
    if (deniedMessage) throw new Error(deniedMessage);
    const enrollment = isRecord(response.matricula) ? response.matricula : {};
    const installments = normalizeGeneratedInstallments(response.parcelas);

    return {
      requestId: asString(response.requestId, input.requestId),
      replayed: response.replayed === true,
      matricula: {
        id: asString(enrollment.id),
        alunoId: asString(enrollment.alunoId, input.alunoId),
        turmaId: asString(enrollment.turmaId, input.turmaId),
        status: asString(enrollment.status),
      },
      plano: normalizeConditionRule(response.regra || response.plano),
      financeiroGerado: response.cobrancaGerada === true || response.financeiroGerado === true,
      parcelasInseridas: asNumber(response.parcelasInseridas),
      parcelasGeradas: asNumber(response.parcelasGeradas, installments.length),
      parcelas: installments,
    };
  },

  async getPendingConditions(turmaId: string): Promise<PendenciasPlanoFinanceiroUnicoResult> {
    const { data, error } = await supabase.rpc(
      'obter_pendencias_plano_financeiro_unico_turma_secure',
      { p_turma_id: turmaId },
    );
    const response = requireRecord(
      data,
      error,
      'O servidor não retornou as condições financeiras pendentes.',
    );
    const pending = Array.isArray(response.pendencias)
      ? response.pendencias.flatMap((item) => {
        const normalized = normalizePendingCondition(item);
        return normalized ? [normalized] : [];
      })
      : [];
    return {
      turmaId: asString(response.turmaId, turmaId),
      total: asNumber(response.total, pending.length),
      pendencias: pending,
    };
  },

  async getConditionCodeStatus(turmaId: string): Promise<CodigoCondicaoPlanoFinanceiroUnicoStatus> {
    const { data, error } = await supabase.rpc(
      'obter_status_codigo_condicao_individual_plano_unico_secure',
      { p_turma_id: turmaId },
    );
    return normalizeCodeStatus(
      requireRecord(data, error, 'O servidor não retornou o status do código financeiro.'),
      turmaId,
    );
  },

  async resetConditionCode(
    input: RedefinirCodigoCondicaoPlanoFinanceiroUnicoInput,
  ): Promise<CodigoCondicaoPlanoFinanceiroUnicoStatus> {
    const { data, error } = await supabase.rpc(
      'redefinir_codigo_condicao_individual_plano_unico_secure',
      {
        p_turma_id: input.turmaId,
        p_request_id: input.requestId,
        p_novo_codigo: input.novoCodigo,
        p_justificativa: input.justificativa,
      },
    );
    const response = requireRecord(data, error, 'O servidor não confirmou o novo código.');
    return normalizeCodeStatus(response.status, input.turmaId);
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
