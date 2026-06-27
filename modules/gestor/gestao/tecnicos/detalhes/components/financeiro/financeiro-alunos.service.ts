import { supabase } from '../../../../../../../lib/supabase';
import { formatMatricula } from '../../../../../../../lib/academicUtils';

export interface AlunoFinanceiro {
  id: string;
  nome: string;
  matricula: string;
  valorMatricula: number;
  valorMensalidade: number;
  status: 'em_dia' | 'atrasado' | 'inadimplente';
  parcelasPagas: number;
  totalParcelas: number;
  cobrancaUrl?: string;
  cobrancaDescricao?: string;
}

export const financeiroAlunosService = {
  async getAlunos(turmaId: string): Promise<AlunoFinanceiro[]> {
    const [
      { data, error },
      { data: receivables, error: receivablesError },
    ] = await Promise.all([
      supabase
        .from('matriculas')
        .select('id, status, data_matricula, parceiros(*)')
        .eq('turma_id', turmaId),
      supabase
        .from('contas_receber')
        .select('matricula_id, status, data_vencimento, asaas_invoice_url, descricao, valor, tipo_lancamento')
        .eq('turma_id', turmaId),
    ]);

    if (error) throw error;
    if (receivablesError) throw receivablesError;

    return (data || [])
      .filter((matricula: any) => matricula.parceiros)
      .map((matricula: any) => {
        const studentReceivables = (receivables || []).filter((item: any) => item.matricula_id === matricula.id);
        const hasOverdue = studentReceivables.some((item: any) =>
          item.status === 'VENCIDO'
          || (item.status === 'PENDENTE' && item.data_vencimento < new Date().toISOString().slice(0, 10))
        );
        const paid = studentReceivables.filter((item: any) => item.status === 'PAGO').length;
        const matriculaCharge = studentReceivables.find((item: any) => item.tipo_lancamento === 'MATRICULA');
        const mensalidadeCharge = studentReceivables.find((item: any) => item.tipo_lancamento === 'PARCELA');
        const nextCharge = studentReceivables
          .filter((item: any) => ['PENDENTE', 'VENCIDO'].includes(item.status) && item.asaas_invoice_url)
          .sort((a: any, b: any) => String(a.data_vencimento).localeCompare(String(b.data_vencimento)))[0];

        return {
          id: matricula.id,
          nome: matricula.parceiros.nome,
          matricula: formatMatricula(matricula.id, matricula.data_matricula, matricula.parceiros.polo_id),
          valorMatricula: Number(matriculaCharge?.valor || 0),
          valorMensalidade: Number(mensalidadeCharge?.valor || 0),
          status: hasOverdue ? 'inadimplente' : 'em_dia',
          parcelasPagas: paid,
          totalParcelas: studentReceivables.length,
          cobrancaUrl: nextCharge?.asaas_invoice_url,
          cobrancaDescricao: nextCharge?.descricao,
        } as AlunoFinanceiro;
      });
  },
};
