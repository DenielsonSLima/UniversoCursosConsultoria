import { supabase } from '../../../../../../../../lib/supabase';
import { formatMatricula } from '../../../../../../../../lib/academicUtils';
import { mapAlunoExtratoRecebivel, type AlunoExtratoRecebivel } from './alunoExtrato.mapper';

export type { AlunoExtratoRecebivel } from './alunoExtrato.mapper';

export interface AlunoExtratoFinanceiro {
  matriculaId: string;
  matricula: string;
  alunoNome: string;
  alunoCpf?: string;
  turmaNome?: string;
  cursoNome?: string;
  poloNome?: string;
  statusMatricula?: string;
  total: number;
  recebido: number;
  pendente: number;
  vencido: number;
  pagos: number;
  pendentes: number;
  recebiveis: AlunoExtratoRecebivel[];
}

export const alunoExtratoService = {
  async getExtrato(matriculaId: string): Promise<AlunoExtratoFinanceiro> {
    const { data, error } = await supabase.rpc('get_aluno_extrato_financeiro', {
      p_matricula_id: matriculaId,
    });
    if (error) throw error;
    if (!data) throw new Error('Extrato financeiro não encontrado.');

    const rows = (data.recebiveis || []).map((item: Record<string, any>) => (
      mapAlunoExtratoRecebivel(item, { poloId: data.poloId, matriculaId: data.matriculaId })
    ));

    return {
      matriculaId: data.matriculaId,
      matricula: formatMatricula(data.matriculaId, data.dataMatricula, data.poloId),
      alunoNome: data.alunoNome || 'Aluno',
      alunoCpf: data.alunoCpf || '',
      turmaNome: data.turmaNome || '',
      cursoNome: data.cursoNome || '',
      poloNome: data.poloNome || '',
      statusMatricula: data.statusMatricula,
      total: Number(data.total || 0),
      recebido: Number(data.recebido || 0),
      pendente: Number(data.pendente || 0),
      vencido: Number(data.vencido || 0),
      pagos: Number(data.pagos || 0),
      pendentes: Number(data.pendentes || 0),
      recebiveis: rows,
    };
  },
};

