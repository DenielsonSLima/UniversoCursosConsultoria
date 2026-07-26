import { supabase } from '../../../../../lib/supabase';
import { getMaceioIsoDate } from '../technicalClassDates';

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

export interface AcademicMovement {
  id: string;
  matricula_id: string;
  aluno_id: string;
  tipo: string;
  status_anterior: string | null;
  status_novo: string;
  turma_origem_id: string | null;
  turma_destino_id: string | null;
  motivo: string;
  observacao: string | null;
  data_movimentacao: string;
  data_retorno_prevista: string | null;
  created_at: string;
  aluno?: { nome: string } | null;
  turma_origem?: { nome: string; codigo: string | null } | null;
  turma_destino?: { nome: string; codigo: string | null } | null;
}

export interface AcademicPeriod {
  id: string;
  turma_id: string;
  modulo_id: string | null;
  nome: string;
  ordem: number;
  data_inicio: string | null;
  data_fim: string | null;
  status: 'PLANEJADO' | 'ABERTO' | 'EM_FECHAMENTO' | 'FECHADO';
  fechado_em: string | null;
  reaberto_em: string | null;
}

export interface AcademicClosingPendencies {
  disciplinasNaoConcluidas: number;
  disciplinasSemAula: number;
  lancamentosDeNotaPendentes: number;
  frequenciasPendentes?: number;
  recuperacoesPendentes?: number;
  avaliacoesEstagioPendentes?: number;
  estagiosReprovados?: number;
  podeFechar: boolean;
}

export interface ExternalTransferCredit {
  disciplinaId: string;
  mediaFinal?: number | null;
  frequenciaPercent?: number | null;
  situacao?: 'APROVEITADO' | 'DISPENSADO' | 'EQUIVALENCIA';
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
      .select('id, turma_id, modulo_id, nome, ordem, data_inicio, data_fim, status, fechado_em, reaberto_em')
      .eq('turma_id', turmaId)
      .order('ordem');
    if (error) throw error;
    return (data || []) as AcademicPeriod[];
  },

  async getMovimentacoes(turmaId: string): Promise<AcademicMovement[]> {
    const { data, error } = await supabase
      .from('matricula_movimentacoes')
      .select(`
        *,
        aluno:parceiros(nome),
        turma_origem:turmas!matricula_movimentacoes_turma_origem_id_fkey(nome, codigo),
        turma_destino:turmas!matricula_movimentacoes_turma_destino_id_fkey(nome, codigo)
      `)
      .or(`turma_origem_id.eq.${turmaId},turma_destino_id.eq.${turmaId}`)
      .order('data_movimentacao', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as AcademicMovement[];
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
    const { data: source, error: sourceError } = await supabase
      .from('turmas')
      .select('curso_id')
      .eq('id', turmaId)
      .single();
    if (sourceError) throw sourceError;

    const { data, error } = await supabase
      .from('turmas')
      .select('id, nome, codigo, polo_id, cursos(nome, modalidade), polos(nome)')
      .neq('id', turmaId)
      .eq('curso_id', source.curso_id)
      .eq('status', 'EM_ANDAMENTO')
      .order('nome');
    if (error) throw error;
    return (data || []).filter((turma: any) => turma.cursos?.modalidade === 'TECNICO');
  },

  async getDisciplinasAproveitamento(turmaId: string) {
    const { data, error } = await supabase
      .from('turmas_disciplinas')
      .select('disciplina_id, disciplinas(id, nome, carga_horaria)')
      .eq('turma_id', turmaId);
    if (error) throw error;
    return (data || [])
      .map((item: any) => item.disciplinas)
      .filter(Boolean)
      .sort((a: any, b: any) => a.nome.localeCompare(b.nome, 'pt-BR'));
  },

  async matricularAluno(turmaId: string, alunoId: string) {
    const { data, error } = await supabase.rpc('matricular_aluno_turma', {
      p_aluno_id: alunoId,
      p_turma_id: turmaId,
    });
    return requireData(data, error);
  },

  async matricularAlunoComFinanceiro(input: {
    turmaId: string;
    alunoId: string;
    financeiro_herdado?: boolean;
    gerar_cobranca_inicial?: boolean;
    gerar_cobranca_futura?: boolean | null;
    sincronizar_asaas?: boolean | null;
    valorMatricula: number;
    dataVencimentoMatricula: string;
    valorParcela: number;
    valorRematricula: number;
    descontoPontualidade?: number;
    jurosAtraso?: number;
    multaAtraso?: number;
    diaVencimento: number;
  }) {
    const { data, error } = await supabase.rpc('matricular_aluno_turma_financeiro_individual', {
      p_aluno_id: input.alunoId,
      p_turma_id: input.turmaId,
      p_valor_matricula: input.valorMatricula,
      p_data_vencimento_matricula: input.dataVencimentoMatricula,
      p_valor_parcela: input.valorParcela,
      p_valor_rematricula: input.valorRematricula,
      p_desconto_pontualidade: input.descontoPontualidade ?? null,
      p_juros_atraso: input.jurosAtraso ?? null,
      p_multa_atraso: input.multaAtraso ?? null,
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
    dataMovimentacao: string;
    dataRetornoPrevista?: string;
  }) {
    const { data, error } = await supabase.rpc('movimentar_matricula_academica', {
      p_matricula_id: input.matriculaId,
      p_tipo: input.tipo,
      p_motivo: input.motivo,
      p_observacao: input.observacao || null,
      p_data_movimentacao: input.dataMovimentacao,
      p_data_retorno_prevista: input.dataRetornoPrevista || null,
    });
    return requireData(data, error);
  },

  async retornarEmNovaTurma(input: {
    matriculaOrigemId: string;
    turmaDestinoId: string;
    motivo: string;
    observacao?: string;
    dataRetorno?: string;
  }) {
    const { data, error } = await supabase.rpc('retornar_matricula_em_nova_turma', {
      p_matricula_origem_id: input.matriculaOrigemId,
      p_turma_destino_id: input.turmaDestinoId,
      p_motivo: input.motivo,
      p_observacao: input.observacao || null,
      p_data_retorno: input.dataRetorno || getMaceioIsoDate(),
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
    dataTransferencia: string;
  }) {
    const { data, error } = await supabase.rpc('transferir_matricula_academica', {
      p_matricula_id: input.matriculaId,
      p_tipo: input.tipo,
      p_motivo: input.motivo,
      p_turma_destino_id: input.turmaDestinoId || null,
      p_instituicao_destino: input.instituicaoDestino || null,
      p_observacao: input.observacao || null,
      p_data_transferencia: input.dataTransferencia,
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
    dataTransferencia: string;
    aproveitamentos?: ExternalTransferCredit[];
  }) {
    const { data, error } = await supabase.rpc('receber_transferencia_externa_com_aproveitamentos', {
      p_aluno_id: input.alunoId,
      p_turma_destino_id: input.turmaDestinoId,
      p_instituicao_origem: input.instituicaoOrigem,
      p_curso_origem: input.cursoOrigem || null,
      p_motivo: input.motivo,
      p_observacao: input.observacao || null,
      p_data_transferencia: input.dataTransferencia,
      p_aproveitamentos: input.aproveitamentos || [],
    });
    return requireData(data, error);
  },

  async getPendencias(periodoId: string): Promise<AcademicClosingPendencies> {
    const { data, error } = await supabase.rpc('get_pendencias_fechamento_periodo', {
      p_periodo_letivo_id: periodoId,
    });
    return requireData(data, error) as AcademicClosingPendencies;
  },

  async fecharPeriodo(periodoId: string) {
    const { data, error } = await supabase.rpc('fechar_periodo_letivo', {
      p_periodo_letivo_id: periodoId,
    });
    return requireData(data, error);
  },

  async reabrirPeriodo(periodoId: string, motivo: string) {
    const { data, error } = await supabase.rpc('reabrir_periodo_letivo', {
      p_periodo_letivo_id: periodoId,
      p_motivo: motivo,
    });
    return requireData(data, error);
  },

  async abrirPeriodo(periodoId: string) {
    const { data, error } = await supabase.rpc('abrir_periodo_letivo', {
      p_periodo_letivo_id: periodoId,
    });
    return requireData(data, error);
  },

  async alterarStatusTurma(
    turmaId: string,
    status: 'PLANEJADA' | 'INSCRICOES_ABERTAS' | 'EM_ANDAMENTO',
  ) {
    const { data, error } = await supabase.rpc('alterar_status_turma_tecnica', {
      p_turma_id: turmaId,
      p_status_novo: status,
    });
    return requireData(data, error);
  },

  async finalizarTurma(turmaId: string) {
    const { data, error } = await supabase.rpc('finalizar_turma_academica', {
      p_turma_id: turmaId,
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
