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
  async getAvailableStudents(enrolledIds: Set<string>): Promise<AvailableStudent[]> {
    const { data, error } = await supabase
      .from('parceiros')
      .select('id, nome, cpf_cnpj')
      .eq('tipo', 'Aluno')
      .eq('status', 'ATIVO')
      .order('nome');

    if (error) throw error;
    return ((data || []) as AvailableStudent[]).filter((student) => !enrolledIds.has(student.id));
  },

  async getFinanceiroMatriculaConfig(turmaId: string): Promise<TurmaFinanceiroMatriculaConfig> {
    const { data, error } = await supabase
      .from('turmas')
      .select('valor_matricula, valor_rematricula, valor_parcela, dia_vencimento_padrao, qtd_parcelas')
      .eq('id', turmaId)
      .single();

    if (error) throw error;

    return {
      valorMatricula: Number(data.valor_matricula || 0),
      valorRematricula: Number(data.valor_rematricula || 0),
      valorParcela: Number(data.valor_parcela || 0),
      diaVencimento: Number(data.dia_vencimento_padrao || 10),
      qtdParcelas: Number(data.qtd_parcelas || 11),
    };
  },
};
