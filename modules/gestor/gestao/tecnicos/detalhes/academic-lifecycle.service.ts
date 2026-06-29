import { supabase } from '../../../../../lib/supabase';

export type AcademicMovementType =
  | 'TRANCAMENTO'
  | 'CANCELAMENTO'
  | 'DESISTENCIA'
  | 'REATIVACAO'
  | 'CONCLUSAO';

export interface AcademicStudent {
  matricula_id: string;
  aluno_id: string;
  nome: string;
  cpf: string | null;
  data_nascimento: string | null;
  data_matricula: string;
  status: string;
  frequencia_percent: number | null;
  tem_lancamentos_academicos?: boolean;
  pode_remover?: boolean;
}

export interface AcademicPeriod {
  id: string;
  turma_id: string;
  modulo_id: string | null;
  nome: string;
  ordem: number;
  data_inicio: string | null;
  data_fim: string | null;
  status: 'ABERTO' | 'EM_FECHAMENTO' | 'FECHADO';
  fechado_em: string | null;
  reaberto_em: string | null;
}

const requireData = <T>(data: T | null, error: any): T => {
  if (error) throw error;
  if (data === null) throw new Error('O banco não retornou o registro solicitado.');
  return data;
};

export const academicLifecycleService = {
  async getStudents(turmaId: string): Promise<AcademicStudent[]> {
    const { data, error } = await supabase.rpc('get_turma_alunos_academico', {
      p_turma_id: turmaId,
    });
    if (error) throw error;
    return (data || []) as AcademicStudent[];
  },

  async getResumo(turmaId: string) {
    const { data, error } = await supabase.rpc('get_turma_resumo_academico', {
      p_turma_id: turmaId,
    });
    return requireData(data, error);
  },

  async getPeriodos(turmaId: string): Promise<AcademicPeriod[]> {
    const { data, error } = await supabase
      .from('periodos_letivos')
      .select('*')
      .eq('turma_id', turmaId)
      .order('ordem');
    if (error) throw error;
    return (data || []) as AcademicPeriod[];
  },

  async getMovimentacoes(turmaId: string) {
    const { data, error } = await supabase
      .from('matricula_movimentacoes')
      .select(`
        *,
        aluno:parceiros(nome),
        turma_origem:turmas!matricula_movimentacoes_turma_origem_id_fkey(nome, codigo),
        turma_destino:turmas!matricula_movimentacoes_turma_destino_id_fkey(nome, codigo)
      `)
      .or(`turma_origem_id.eq.${turmaId},turma_destino_id.eq.${turmaId}`)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return data || [];
  },

  async getTransferencias(turmaId: string) {
    const { data, error } = await supabase
      .from('transferencias_academicas')
      .select('*, aluno:parceiros(nome)')
      .or(`turma_origem_id.eq.${turmaId},turma_destino_id.eq.${turmaId}`)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return data || [];
  },

  async getTurmasDestino(turmaId: string) {
    const { data, error } = await supabase
      .from('turmas')
      .select('id, nome, codigo, polo_id, cursos(nome, modalidade), polos(nome)')
      .neq('id', turmaId)
      .eq('status', 'EM_ANDAMENTO')
      .order('nome');
    if (error) throw error;
    return (data || []).filter((turma: any) => turma.cursos?.modalidade === 'TECNICO');
  },

  async matricularAluno(turmaId: string, alunoId: string, responsavelId?: string | null) {
    const { data, error } = await supabase.rpc('matricular_aluno_turma', {
      p_aluno_id: alunoId,
      p_turma_id: turmaId,
      p_responsavel_id: responsavelId || null,
    });
    return requireData(data, error);
  },

  async matricularAlunoComFinanceiro(input: {
    turmaId: string;
    alunoId: string;
    responsavelId?: string | null;
    financeiro_herdado?: boolean;
    gerar_cobranca_inicial?: boolean;
    gerar_cobranca_futura?: boolean | null;
    sincronizar_asaas?: boolean | null;
    valorMatricula: number;
    dataVencimentoMatricula: string;
    valorParcela: number;
    valorRematricula: number;
    diaVencimento: number;
  }) {
    const { data, error } = await supabase.rpc('matricular_aluno_turma_financeiro', {
      p_aluno_id: input.alunoId,
      p_turma_id: input.turmaId,
      p_responsavel_id: input.responsavelId || null,
      p_valor_matricula: input.valorMatricula,
      p_data_vencimento_matricula: input.dataVencimentoMatricula,
      p_valor_parcela: input.valorParcela,
      p_valor_rematricula: input.valorRematricula,
      p_dia_vencimento: input.diaVencimento,
      p_financeiro_herdado: input.financeiro_herdado ?? false,
      p_gerar_cobranca_inicial: input.gerar_cobranca_inicial ?? true,
      p_gerar_cobranca_futura: input.gerar_cobranca_futura,
      p_sincronizar_asaas: input.sincronizar_asaas ?? true,
    });
    return requireData(data, error);
  },

  async movimentar(input: {
    matriculaId: string;
    tipo: AcademicMovementType;
    motivo: string;
    observacao?: string;
    dataMovimentacao?: string;
    dataRetornoPrevista?: string;
    responsavelId?: string | null;
  }) {
    const { data, error } = await supabase.rpc('movimentar_matricula_academica', {
      p_matricula_id: input.matriculaId,
      p_tipo: input.tipo,
      p_motivo: input.motivo,
      p_observacao: input.observacao || null,
      p_data_movimentacao: input.dataMovimentacao || new Date().toISOString().slice(0, 10),
      p_data_retorno_prevista: input.dataRetornoPrevista || null,
      p_responsavel_id: input.responsavelId || null,
    });
    return requireData(data, error);
  },

  async transferir(input: {
    matriculaId: string;
    tipo: 'INTERNA_TURMA' | 'INTERNA_POLO' | 'EXTERNA_ENVIADA';
    motivo: string;
    turmaDestinoId?: string;
    instituicaoDestino?: string;
    observacao?: string;
    dataTransferencia?: string;
    responsavelId?: string | null;
  }) {
    const { data, error } = await supabase.rpc('transferir_matricula_academica', {
      p_matricula_id: input.matriculaId,
      p_tipo: input.tipo,
      p_motivo: input.motivo,
      p_turma_destino_id: input.turmaDestinoId || null,
      p_instituicao_destino: input.instituicaoDestino || null,
      p_observacao: input.observacao || null,
      p_data_transferencia: input.dataTransferencia || new Date().toISOString().slice(0, 10),
      p_responsavel_id: input.responsavelId || null,
    });
    return requireData(data, error);
  },

  async removerMatricula(matriculaId: string) {
    const { data, error } = await supabase.rpc('remover_matricula_turma', {
      p_matricula_id: matriculaId,
    });
    return requireData(data, error);
  },

  async receberTransferencia(input: {
    alunoId: string;
    turmaDestinoId: string;
    instituicaoOrigem: string;
    cursoOrigem?: string;
    motivo: string;
    observacao?: string;
    dataTransferencia?: string;
    responsavelId?: string | null;
  }) {
    const { data, error } = await supabase.rpc('receber_transferencia_externa', {
      p_aluno_id: input.alunoId,
      p_turma_destino_id: input.turmaDestinoId,
      p_instituicao_origem: input.instituicaoOrigem,
      p_curso_origem: input.cursoOrigem || null,
      p_motivo: input.motivo,
      p_observacao: input.observacao || null,
      p_data_transferencia: input.dataTransferencia || new Date().toISOString().slice(0, 10),
      p_responsavel_id: input.responsavelId || null,
    });
    return requireData(data, error);
  },

  async getPendencias(periodoId: string) {
    const { data, error } = await supabase.rpc('get_pendencias_fechamento_periodo', {
      p_periodo_letivo_id: periodoId,
    });
    return requireData(data, error);
  },

  async fecharPeriodo(periodoId: string, responsavelId?: string | null) {
    const { data, error } = await supabase.rpc('fechar_periodo_letivo', {
      p_periodo_letivo_id: periodoId,
      p_responsavel_id: responsavelId || null,
    });
    return requireData(data, error);
  },

  async reabrirPeriodo(periodoId: string, motivo: string, responsavelId?: string | null) {
    const { data, error } = await supabase.rpc('reabrir_periodo_letivo', {
      p_periodo_letivo_id: periodoId,
      p_motivo: motivo,
      p_responsavel_id: responsavelId || null,
    });
    return requireData(data, error);
  },

  async finalizarTurma(turmaId: string, responsavelId?: string | null) {
    const { data, error } = await supabase.rpc('finalizar_turma_academica', {
      p_turma_id: turmaId,
      p_responsavel_id: responsavelId || null,
    });
    return requireData(data, error);
  },

  async getDiarios(turmaId: string) {
    const { data, error } = await supabase.rpc('get_diarios_turma', {
      p_turma_id: turmaId,
    });
    if (error) throw error;
    return data || [];
  },

  async calcularAvaliacaoEstagio(criterios: unknown) {
    const { data, error } = await supabase.rpc('calcular_avaliacao_estagio', {
      p_criterios: criterios,
    });
    return requireData(data, error) as {
      comportamento: number;
      registros: number;
      tecnicas: number;
      final: number;
    };
  },

  async salvarAvaliacaoEstagio(input: {
    turmaId: string;
    disciplinaId: string;
    alunoId: string;
    frequencia: number;
    criterios: unknown;
    checklist: unknown;
    perfilAluno: string;
    instrutorNome: string;
    dataAvaliacao: string;
  }) {
    const { data, error } = await supabase.rpc('salvar_avaliacao_estagio', {
      p_turma_id: input.turmaId,
      p_disciplina_id: input.disciplinaId,
      p_aluno_id: input.alunoId,
      p_frequencia: input.frequencia,
      p_criterios: input.criterios,
      p_checklist: input.checklist,
      p_perfil_aluno: input.perfilAluno,
      p_instrutor_nome: input.instrutorNome,
      p_data_avaliacao: input.dataAvaliacao,
    });
    return requireData(data, error);
  },
};
