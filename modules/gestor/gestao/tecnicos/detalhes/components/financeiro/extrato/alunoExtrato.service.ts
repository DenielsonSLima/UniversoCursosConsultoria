import { supabase } from '../../../../../../../../lib/supabase';
import { formatMatricula } from '../../../../../../../../lib/academicUtils';

export interface AlunoExtratoRecebivel {
  id: string;
  descricao: string;
  valor: number;
  valorPago?: number;
  dataVencimento: string;
  dataPagamento?: string;
  status: string;
  formaPagamento?: string;
  origemPagamento?: string;
  tipoLancamento?: string;
  parcelaNumero?: number;
  asaasStatus?: string;
  asaasInvoiceUrl?: string;
  asaasPaymentId?: string;
  createdAt?: string;
}

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

    const rows = (data.recebiveis || []).map((item: any) => ({
      id: item.id,
      descricao: item.descricao,
      valor: Number(item.valor || 0),
      valorPago: item.valor_pago === null ? undefined : Number(item.valor_pago),
      dataVencimento: item.data_vencimento,
      dataPagamento: item.data_pagamento || undefined,
      status: item.status,
      formaPagamento: item.forma_pagamento || undefined,
      origemPagamento: item.origem_pagamento || undefined,
      tipoLancamento: item.tipo_lancamento || undefined,
      parcelaNumero: item.parcela_numero ?? undefined,
      asaasStatus: item.asaas_status || undefined,
      asaasInvoiceUrl: item.asaas_invoice_url || undefined,
      asaasPaymentId: item.asaas_payment_id || undefined,
      createdAt: item.created_at || undefined,
    }));

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
