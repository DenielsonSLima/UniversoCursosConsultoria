import { supabase } from '../../../../../lib/supabase';

export interface AvailableStudent {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
}

export interface TurmaFinanceiroMatriculaConfig {
  valorMatricula: number;
  valorRematricula: number;
  valorParcela: number;
  diaVencimento: number;
  qtdParcelas: number;
  origemFinanceira: 'LEGADO' | 'NORMAL';
  financeiroHerdado: boolean;
  gerarCobrancasFuturas: boolean;
  sincronizarAsaasFuturo: boolean;
}

export interface PrevisaoFinanceiraTurma {
  turma_id: string;
  referencia: string;
  gerar_cobrancas_futuras: boolean;
  quantidade_prevista: string;
}

export const isValidStudentCpf = (value?: string | null) => {
  const cpf = String(value || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (slice: string, factor: number) => {
    const sum = slice.split('').reduce((total, digit) => total + Number(digit) * factor--, 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calcDigit(cpf.slice(0, 9), 10) === Number(cpf[9])
    && calcDigit(cpf.slice(0, 10), 11) === Number(cpf[10]);
};

export const turmaAlunosService = {
  async getAvailableStudents(turmaId: string, enrolledIds: Set<string>): Promise<AvailableStudent[]> {
    const excludedIds = new Set(enrolledIds);
    const { data: turma, error: turmaError } = await supabase
      .from('turmas')
      .select('curso_id')
      .eq('id', turmaId)
      .maybeSingle();

    if (turmaError) throw turmaError;
    if (turma?.curso_id) {
      const { data: courseEnrollments, error: courseEnrollmentsError } = await supabase
        .from('matriculas')
        .select('aluno_id, turmas!inner(curso_id)')
        .eq('turmas.curso_id', turma.curso_id)
        .in('status', ['PENDENTE', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO', 'ATIVO', 'TRANCADO', 'CONCLUIDO']);

      if (courseEnrollmentsError) throw courseEnrollmentsError;
      for (const enrollment of courseEnrollments || []) {
        if (enrollment.aluno_id) excludedIds.add(enrollment.aluno_id);
      }
    }

    const { data, error } = await supabase
      .from('parceiros')
      .select('id, nome, cpf_cnpj')
      .eq('tipo', 'Aluno')
      .eq('status', 'ATIVO')
      .order('nome');

    if (error) throw error;
    return ((data || []) as AvailableStudent[]).filter((student) => !excludedIds.has(student.id));
  },

  async getFinanceiroMatriculaConfig(turmaId: string): Promise<TurmaFinanceiroMatriculaConfig> {
    const { data, error } = await supabase
      .from('turmas')
      .select('valor_matricula, valor_rematricula, valor_parcela, dia_vencimento_padrao, qtd_parcelas, origem_financeira, financeiro_herdado, gerar_cobrancas_futuras, sincronizar_asaas_futuro')
      .eq('id', turmaId)
      .single();

    if (error) throw error;

    return {
      valorMatricula: Number(data.valor_matricula || 0),
      valorRematricula: Number(data.valor_rematricula || 0),
      valorParcela: Number(data.valor_parcela || 0),
      diaVencimento: Number(data.dia_vencimento_padrao || 10),
      qtdParcelas: Number(data.qtd_parcelas || 11),
      origemFinanceira: (data.origem_financeira === 'LEGADO' ? 'LEGADO' : 'NORMAL'),
      financeiroHerdado: data.financeiro_herdado ?? false,
      gerarCobrancasFuturas: data.gerar_cobrancas_futuras ?? false,
      sincronizarAsaasFuturo: data.sincronizar_asaas_futuro !== false,
    };
  },

  async preverGeracaoCobrancasFuturas(turmaId: string): Promise<PrevisaoFinanceiraTurma> {
    const { data, error } = await supabase.rpc('prever_geracao_cobrancas_futuras', {
      p_turma_id: turmaId,
      p_data_referencia: new Date().toISOString().slice(0, 10),
    });

    if (error) throw error;
    return ((data || [])[0] || {}) as PrevisaoFinanceiraTurma;
  },
};
